/**
 * Ceremony WebView Provider
 *
 * Closing Ceremony Theater - Single-panel session intelligence view.
 * Two-panel layout: Session List (left) + Ceremony Detail (right).
 *
 * DESIGN PRINCIPLES:
 * - Reflective surface, not operational
 * - Browsable session history
 * - Narrative timeline, not raw logs
 * - Progressive disclosure: summary first, details on demand
 *
 * @module webview/CeremonyWebViewProvider
 */

import * as vscode from "vscode";
import type { DaemonBridge } from "../services/DaemonBridge";
import { logger } from "../utils/logger";

// =============================================================================
// Types
// =============================================================================

export interface SessionListItem {
	sessionId: string;
	workspace: string;
	startedAt: number;
	endedAt: number | null;
	snapshotCount: number;
	restoreCount: number;
	learningCount: number;
	isLive: boolean;
}

export interface SessionSummary {
	sessionId: string;
	workspace: string;
	startedAt: number;
	endedAt: number | null;
	duration: number;
	filesModified: number;
	snapshotsCreated: number;
	restoresTriggered: number;
	aiEditsDetected: number;
	protectionLevel: "standard" | "heightened" | "maximum";
}

export interface SessionLearning {
	type: "co-change" | "fragile-file" | "temporal" | "behavioral";
	description: string;
	confidence: number;
	filesInvolved: string[];
	promotedToHot: boolean;
}

export interface SessionLearnings {
	patterns: SessionLearning[];
	totalNew: number;
	totalPromoted: number;
	totalPruned: number;
}

export interface PitfallWarning {
	trigger: string;
	risk: string;
	outcome: "heeded" | "dismissed" | "auto-resolved";
	filesInvolved: string[];
	timestamp: number;
}

export interface PitfallsAvoided {
	warnings: PitfallWarning[];
	estimatedTimeSaved: number;
}

export interface IntelligenceMetrics {
	tokenSavingsEstimate: number;
	coherenceScore: number;
	contextReusageRate: number;
	intelligenceEventsTotal: number;
}

export interface TimelineEvent {
	timestamp: number;
	type:
		| "session-start"
		| "session-end"
		| "snapshot-created"
		| "snapshot-restored"
		| "learning-added"
		| "learning-promoted"
		| "warning-fired"
		| "ai-edit-detected"
		| "protection-changed"
		| "fragile-detected"
		| "risk-spike";
	summary: string;
	detail?: string;
	filesInvolved?: string[];
	severity?: "info" | "warning" | "critical";
}

export interface CeremonyPayload {
	summary: SessionSummary;
	learnings: SessionLearnings;
	pitfalls: PitfallsAvoided;
	metrics: IntelligenceMetrics;
	timeline: TimelineEvent[];
	/** Concurrent sessions that overlapped this session (from daemon). Null when none. */
	concurrentSessions?: Array<{
		clientType: string;
		overlapFiles: number;
		conflictResolved: boolean;
	}> | null;
	/** True when the daemon was not reachable and this data is estimated/mock. */
	_isFallback?: boolean;
	/** Human-readable explanation of why fallback data is shown. */
	_fallbackReason?: string;
}

// Message types for WebView ↔ Extension Host communication
export type WebViewOutMessage =
	| { type: "ready" }
	| { type: "selectSession"; sessionId: string }
	| { type: "loadMore" }
	| { type: "filterWorkspace"; workspace: string | null }
	| { type: "expandTimelineEvent"; eventIndex: number };

export type WebViewInMessage =
	| { type: "sessionList"; data: SessionListItem[]; _isFallback?: boolean; _fallbackReason?: string }
	| { type: "ceremony"; data: CeremonyPayload }
	| { type: "liveCeremony"; data: CeremonyPayload }
	| { type: "appendTimeline"; event: TimelineEvent }
	| { type: "updateSummary"; summary: Partial<SessionSummary> }
	| { type: "updateLearnings"; learnings: SessionLearnings }
	| { type: "updateMetrics"; metrics: IntelligenceMetrics }
	| { type: "sessionEnded"; sessionId: string }
	| { type: "appendSessions"; data: SessionListItem[] };

// =============================================================================
// Ceremony WebView Provider
// =============================================================================

export class CeremonyWebViewProvider {
	// NOGUARD:vscode-views - Panel-based webview, not a sidebar view
	public static readonly viewType = "vreko.ceremony";

	private _panel?: vscode.WebviewPanel;
	private readonly _extensionUri: vscode.Uri;
	private readonly _daemonBridge: DaemonBridge | null;
	private readonly _disposables: vscode.Disposable[] = [];

	// Cached data
	private _sessions: SessionListItem[] = [];
	private _currentCeremony: CeremonyPayload | null = null;
	private _selectedSessionId: string | null = null;

	constructor(extensionUri: vscode.Uri, daemonBridge: DaemonBridge | null) {
		this._extensionUri = extensionUri;
		this._daemonBridge = daemonBridge;
	}

	/**
	 * Show the ceremony panel (creates if needed, or reveals existing)
	 */
	public show(): void {
		if (this._panel) {
			// Reveal existing panel
			this._panel.reveal(vscode.ViewColumn.One);
			return;
		}

		// Create new panel in editor area (not sidebar!)
		this._panel = vscode.window.createWebviewPanel(
			CeremonyWebViewProvider.viewType,
			"Closing Ceremonies",
			vscode.ViewColumn.One,
			{
				enableScripts: true,
				localResourceRoots: [this._extensionUri],
				retainContextWhenHidden: true, // Keep state when hidden
			},
		);

		this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);

		// Handle messages from the webview
		this._panel.webview.onDidReceiveMessage(
			(message: WebViewOutMessage) => {
				this._handleMessage(message);
			},
			null,
			this._disposables,
		);

		// Clean up when panel is closed
		this._panel.onDidDispose(
			() => {
				this._panel = undefined;
			},
			null,
			this._disposables,
		);

		// Wire daemon events for live updates
		this._wireDaemonEvents();

		// Load initial data
		this._loadSessionList();
	}

	// =========================================================================
	// Public API
	// =========================================================================

	/**
	 * Post a message to the webview
	 */
	public postMessage(message: WebViewInMessage): void {
		if (this._panel) {
			this._panel.webview.postMessage(message);
		}
	}

	/**
	 * Show ceremony for a specific session
	 */
	public async showCeremony(sessionId: string): Promise<void> {
		this._selectedSessionId = sessionId;
		await this._loadCeremony(sessionId);
	}

	/**
	 * Refresh session list
	 */
	public async refresh(): Promise<void> {
		await this._loadSessionList();
	}

	// =========================================================================
	// Private Helpers
	// =========================================================================

	private _handleMessage(message: WebViewOutMessage): void {
		switch (message.type) {
			case "ready":
				// Webview is ready, send initial data
				this._sendInitialState();
				break;
			case "selectSession":
				this._loadCeremony(message.sessionId);
				break;
			case "loadMore":
				this._loadMoreSessions();
				break;
			case "filterWorkspace":
				this._filterByWorkspace(message.workspace);
				break;
			case "expandTimelineEvent":
				// Timeline expansion is handled in the webview
				break;
		}
	}

	private async _sendInitialState(): Promise<void> {
		// Send session list
		this.postMessage({ type: "sessionList", data: this._sessions });

		// If there's a live session, load its ceremony
		const liveSession = this._sessions.find((s) => s.isLive);
		if (liveSession) {
			await this._loadCeremony(liveSession.sessionId);
		} else if (this._sessions.length > 0) {
			// Load the most recent session
			await this._loadCeremony(this._sessions[0].sessionId);
		}
	}

	private async _loadSessionList(): Promise<void> {
		if (!this._daemonBridge?.isConnected()) {
			logger.debug("CeremonyWebView: Daemon not connected, showing empty state");
			this._sessions = [];
			this.postMessage({
				type: "sessionList",
				data: this._sessions,
				_isFallback: true,
				_fallbackReason: "Vreko daemon not connected  -  showing estimated data",
			});
			return;
		}

		try {
			const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
			if (!workspacePath) {
				logger.debug("CeremonyWebView: No workspace, showing empty state");
				this._sessions = [];
				this.postMessage({
					type: "sessionList",
					data: this._sessions,
					_isFallback: true,
					_fallbackReason: "No workspace open",
				});
				return;
			}

			const result = await this._daemonBridge.listSessionCeremonies(workspacePath, { limit: 20 });

			if (result.sessions && result.sessions.length > 0) {
				this._sessions = result.sessions.map((s) => ({
					sessionId: s.sessionId,
					workspace: s.workspace,
					startedAt: s.startedAt,
					endedAt: s.endedAt,
					snapshotCount: s.snapshotCount,
					restoreCount: s.restoreCount,
					learningCount: s.learningCount,
					isLive: s.isLive,
				}));
				logger.debug("CeremonyWebView: Loaded real session list", { count: this._sessions.length });
			} else {
				logger.debug("CeremonyWebView: No sessions from daemon, showing empty state");
				this._sessions = [];
			}
			this.postMessage({ type: "sessionList", data: this._sessions });
		} catch (error) {
			logger.error("Failed to load session list", error as Error);
			this._sessions = [];
			this.postMessage({ type: "sessionList", data: this._sessions });
		}
	}

	private async _loadCeremony(sessionId: string): Promise<void> {
		if (!this._daemonBridge?.isConnected()) {
			logger.debug("CeremonyWebView: Daemon not connected, showing empty ceremony");
			const emptyData = this._getEmptyCeremony(sessionId);
			emptyData._isFallback = true;
			emptyData._fallbackReason = "Vreko daemon not connected";
			this._currentCeremony = emptyData;
			this.postMessage({ type: "ceremony", data: this._currentCeremony });
			return;
		}

		try {
			// Try to get ceremony from daemon
			const ceremony = await this._daemonBridge.getClosingCeremony(
				vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "",
				sessionId,
			);

			if (ceremony) {
				if (ceremony.ceremony) {
					this._currentCeremony = ceremony.ceremony as CeremonyPayload;
				} else {
					this._currentCeremony = this._transformDaemonCeremony(ceremony);
				}
				this.postMessage({ type: "ceremony", data: this._currentCeremony });
			} else {
				// Daemon returned null - session exists but no ceremony data yet
				logger.debug("CeremonyWebView: No ceremony data for session", { sessionId });
				const emptyData = this._getEmptyCeremony(sessionId);
				emptyData._isFallback = true;
				emptyData._fallbackReason = "No ceremony data available for this session yet";
				this._currentCeremony = emptyData;
				this.postMessage({ type: "ceremony", data: this._currentCeremony });
			}
		} catch (error) {
			logger.error("Failed to load ceremony", error as Error);
			// Show empty state instead of mock data on error
			this._currentCeremony = this._getEmptyCeremony(sessionId);
			this.postMessage({ type: "ceremony", data: this._currentCeremony });
		}
	}

	private async _loadMoreSessions(): Promise<void> {
		// Issue: LIN-0000  -  Implement pagination when session/list-ceremonies supports cursor
		logger.debug("CeremonyWebView: Load more sessions requested");
	}

	private async _filterByWorkspace(workspace: string | null): Promise<void> {
		// Issue: LIN-0000  -  Implement workspace filtering
		logger.debug("CeremonyWebView: Filter by workspace", { workspace });
	}

	private _wireDaemonEvents(): void {
		if (!this._daemonBridge) {
			return;
		}

		// Session started (singleton: ends any existing live session first)
		this._daemonBridge.onSessionStarted((event) => {
			// Singleton enforcement: end any existing live session in UI
			// (daemon already broadcast session.ended, but ensure UI is consistent)
			const existingLive = this._sessions.find((s) => s.isLive);
			if (existingLive && existingLive.sessionId !== event.taskId) {
				existingLive.isLive = false;
				existingLive.endedAt = Date.now();
				logger.debug("CeremonyWebView: Ended previous live session (singleton)", {
					sessionId: existingLive.sessionId,
				});
			}

			const newSession: SessionListItem = {
				sessionId: event.taskId,
				workspace: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "",
				startedAt: Date.now(),
				endedAt: null,
				snapshotCount: 0,
				restoreCount: 0,
				learningCount: 0,
				isLive: true,
			};
			// Add to front of list, but remove if already exists (dedupe)
			this._sessions = this._sessions.filter((s) => s.sessionId !== event.taskId);
			this._sessions.unshift(newSession);
			this.postMessage({ type: "sessionList", data: this._sessions });
		});

		// Session ended
		this._daemonBridge.onSessionEnded((event) => {
			const session = this._sessions.find((s) => s.sessionId === event.sessionId);
			if (session) {
				session.isLive = false;
				session.endedAt = Date.now();
				this.postMessage({ type: "sessionEnded", sessionId: event.sessionId });
			}
		});

		// Learning added
		this._daemonBridge.onLearningAdded((event) => {
			if (this._currentCeremony) {
				this._currentCeremony.learnings.totalNew++;
				const newEvent: TimelineEvent = {
					timestamp: Date.now(),
					type: "learning-added",
					summary: `Learning captured: ${event.trigger}`,
					severity: "info",
				};
				this._currentCeremony.timeline.push(newEvent);
				this.postMessage({ type: "appendTimeline", event: newEvent });
			}
		});

		// Snapshot created
		this._daemonBridge.onSnapshotCreated((event) => {
			if (this._currentCeremony) {
				this._currentCeremony.summary.snapshotsCreated++;
				const newEvent: TimelineEvent = {
					timestamp: Date.now(),
					type: "snapshot-created",
					summary: `Snapshot created: ${event.filePath}`,
					filesInvolved: event.filePath ? [event.filePath] : [],
					severity: "info",
				};
				this._currentCeremony.timeline.push(newEvent);
				this.postMessage({ type: "appendTimeline", event: newEvent });
			}
		});
	}

	private _transformDaemonCeremony(
		daemonCeremony: NonNullable<Awaited<ReturnType<DaemonBridge["getClosingCeremony"]>>>,
	): CeremonyPayload {
		return {
			summary: {
				sessionId: daemonCeremony.sessionId,
				workspace: daemonCeremony.workspacePath,
				startedAt: Date.now() - daemonCeremony.duration,
				endedAt: Date.now(),
				duration: daemonCeremony.duration,
				filesModified: daemonCeremony.fragileFilesInSession.length,
				snapshotsCreated: daemonCeremony.checkpointsCreated,
				restoresTriggered: 0, // Not in daemon ceremony
				aiEditsDetected: 0, // Not in daemon ceremony
				protectionLevel: "standard",
			},
			learnings: {
				patterns: daemonCeremony.topLearnings.map((l) => ({
					type: "behavioral" as const,
					description: l.content,
					confidence: l.confidence,
					filesInvolved: [],
					promotedToHot: false,
				})),
				totalNew: daemonCeremony.learningsCaptured,
				totalPromoted: 0,
				totalPruned: 0,
			},
			pitfalls: {
				warnings: [],
				estimatedTimeSaved: 0,
			},
			metrics: {
				tokenSavingsEstimate: daemonCeremony.tokensSaved,
				coherenceScore:
					daemonCeremony.coherenceScore === "high"
						? 90
						: daemonCeremony.coherenceScore === "medium"
							? 70
							: daemonCeremony.coherenceScore === "low"
								? 40
								: 20,
				contextReusageRate: 0,
				intelligenceEventsTotal: daemonCeremony.learningsCaptured,
			},
			concurrentSessions: daemonCeremony.concurrentSessions ?? null,
			timeline: [],
		};
	}

	private _getEmptyCeremony(sessionId: string): CeremonyPayload {
		const safeSessionId = typeof sessionId === "string" ? sessionId : String(sessionId ?? "unknown");
		const now = Date.now();
		return {
			summary: {
				sessionId: safeSessionId,
				workspace: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "",
				startedAt: now,
				endedAt: null,
				duration: 0,
				filesModified: 0,
				snapshotsCreated: 0,
				restoresTriggered: 0,
				aiEditsDetected: 0,
				protectionLevel: "standard",
			},
			learnings: {
				patterns: [],
				totalNew: 0,
				totalPromoted: 0,
				totalPruned: 0,
			},
			pitfalls: {
				warnings: [],
				estimatedTimeSaved: 0,
			},
			metrics: {
				tokenSavingsEstimate: 0,
				coherenceScore: 0,
				contextReusageRate: 0,
				intelligenceEventsTotal: 0,
			},
			timeline: [],
		};
	}

	private _getHtmlForWebview(webview: vscode.Webview): string {
		// Use the bundled webview if available, otherwise show placeholder
		const nonce = this._getNonce();

		return /* html */ `
<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
	<title>Vreko  -  Session Intelligence</title>
	<style>
		* { box-sizing: border-box; margin: 0; padding: 0; }
		body {
			font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
			font-size: var(--vscode-font-size, 13px);
			color: var(--vscode-foreground, #cccccc);
			background: var(--vscode-editor-background, #1e1e1e);
			height: 100vh;
			overflow: hidden;
		}
		.container {
			display: flex;
			height: 100%;
		}
		.session-list {
			width: 200px;
			border-right: 1px solid var(--vscode-panel-border, #454545);
			overflow-y: auto;
			flex-shrink: 0;
		}
		.session-list-header {
			padding: 12px;
			font-weight: 600;
			border-bottom: 1px solid var(--vscode-panel-border, #454545);
			background: var(--vscode-sideBarSectionHeader-background, #252526);
		}
		.session-item {
			padding: 8px 12px;
			cursor: pointer;
			border-bottom: 1px solid var(--vscode-panel-border, #454545);
			display: flex;
			align-items: center;
			gap: 8px;
		}
		.session-item:hover {
			background: var(--vscode-list-hoverBackground, #2a2d2e);
		}
		.session-item.selected {
			background: var(--vscode-list-activeSelectionBackground, #094771);
		}
		.session-item.live {
			color: var(--vscode-charts-green, #4ec9b0);
		}
		.live-indicator {
			width: 8px;
			height: 8px;
			border-radius: 50%;
			background: var(--vscode-charts-green, #4ec9b0);
			animation: pulse 1.5s ease-in-out infinite;
		}
		@keyframes pulse {
			0%, 100% { opacity: 1; }
			50% { opacity: 0.5; }
		}
		.ceremony-detail {
			flex: 1;
			overflow-y: auto;
			padding: 16px;
		}
		.section {
			margin-bottom: 20px;
			padding: 12px;
			background: var(--vscode-editorWidget-background, #252526);
			border-radius: 6px;
		}
		.section-title {
			font-weight: 600;
			margin-bottom: 12px;
			color: var(--vscode-foreground, #cccccc);
		}
		.metric-row {
			display: flex;
			gap: 20px;
			flex-wrap: wrap;
		}
		.metric-item {
			text-align: center;
		}
		.metric-value {
			font-size: 24px;
			font-weight: 600;
			color: var(--vscode-charts-green, #4ec9b0);
		}
		.metric-label {
			font-size: 11px;
			color: var(--vscode-descriptionForeground, #858585);
		}
		.timeline {
			position: relative;
			padding-left: 20px;
		}
		.timeline::before {
			content: '';
			position: absolute;
			left: 6px;
			top: 0;
			bottom: 0;
			width: 2px;
			background: var(--vscode-panel-border, #454545);
		}
		.timeline-event {
			position: relative;
			padding: 8px 0 8px 16px;
		}
		.timeline-event::before {
			content: '';
			position: absolute;
			left: -14px;
			top: 12px;
			width: 10px;
			height: 10px;
			border-radius: 50%;
			background: var(--vscode-charts-blue, #3794ff);
		}
		.timeline-event.warning::before {
			background: var(--vscode-charts-yellow, #ffcc00);
		}
		.timeline-event.critical::before {
			background: var(--vscode-charts-red, #f14c4c);
		}
		.event-time {
			font-size: 11px;
			color: var(--vscode-descriptionForeground, #858585);
		}
		.event-summary {
			margin-top: 2px;
		}
		.coherence-bar {
			height: 8px;
			border-radius: 4px;
			background: var(--vscode-progressBar-background, #0e70c0);
			transition: width 0.3s ease;
		}
		.empty-state {
			text-align: center;
			padding: 40px 20px;
			color: var(--vscode-descriptionForeground, #858585);
		}
	</style>
</head>
<body>
	<div class="container">
		<div class="session-list">
			<div class="session-list-header">SESSIONS</div>
			<div id="session-items"></div>
		</div>
		<div class="ceremony-detail" id="ceremony-detail">
			<div class="empty-state">
				Select a session to view ceremony details
			</div>
		</div>
	</div>

	<script nonce="${nonce}">
		const vscode = acquireVsCodeApi();
		let sessions = [];
		let currentCeremony = null;
		let selectedSessionId = null;

		// Handle messages from extension
		window.addEventListener('message', event => {
			const message = event.data;
			switch (message.type) {
				case 'sessionList':
					sessions = message.data;
					renderSessionList();
					break;
				case 'ceremony':
				case 'liveCeremony':
					currentCeremony = message.data;
					renderCeremony();
					break;
				case 'appendTimeline':
					if (currentCeremony) {
						currentCeremony.timeline.push(message.event);
						renderTimeline();
					}
					break;
				case 'updateSummary':
					if (currentCeremony) {
						Object.assign(currentCeremony.summary, message.summary);
						renderSummary();
					}
					break;
				case 'sessionEnded':
					const session = sessions.find(s => s.sessionId === message.sessionId);
					if (session) {
						session.isLive = false;
						session.endedAt = Date.now();
						renderSessionList();
					}
					break;
			}
		});

		function renderSessionList() {
			const container = document.getElementById('session-items');
			container.innerHTML = sessions.map(session => {
				const isSelected = session.sessionId === selectedSessionId;
				const time = new Date(session.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
				return \`
					<div class="session-item \${session.isLive ? 'live' : ''} \${isSelected ? 'selected' : ''}"
						 onclick="selectSession('\${session.sessionId}')">
						\${session.isLive ? '<div class="live-indicator"></div>' : '<span style="width:8px"></span>'}
						<div>
							<div>\${time}</div>
							<div style="font-size:11px;color:var(--vscode-descriptionForeground)">
								\${session.snapshotCount} snaps · \${session.learningCount} learnings
							</div>
						</div>
					</div>
				\`;
			}).join('');
		}

		function selectSession(sessionId) {
			selectedSessionId = sessionId;
			renderSessionList();
			vscode.postMessage({ type: 'selectSession', sessionId });
		}

		function renderCeremony() {
			if (!currentCeremony) return;
			const container = document.getElementById('ceremony-detail');

			const summary = currentCeremony.summary;
			const metrics = currentCeremony.metrics;
			const learnings = currentCeremony.learnings;
			const pitfalls = currentCeremony.pitfalls;

			const durationMin = Math.round(summary.duration / 60000);
			const coherenceColor = metrics.coherenceScore > 70 ? '#4ec9b0' : metrics.coherenceScore > 40 ? '#ffcc00' : '#f14c4c';

			container.innerHTML = \`
				<div class="section">
					<div class="section-title">📊 Session Summary</div>
					<div class="metric-row">
						<div class="metric-item">
							<div class="metric-value">\${durationMin}</div>
							<div class="metric-label">minutes</div>
						</div>
						<div class="metric-item">
							<div class="metric-value">\${summary.filesModified}</div>
							<div class="metric-label">files modified</div>
						</div>
						<div class="metric-item">
							<div class="metric-value">\${summary.snapshotsCreated}</div>
							<div class="metric-label">snapshots</div>
						</div>
						<div class="metric-item">
							<div class="metric-value">\${summary.restoresTriggered}</div>
							<div class="metric-label">restores</div>
						</div>
					</div>
				</div>

				<div class="section">
					<div class="section-title">💡 Learnings Captured</div>
					<div class="metric-row">
						<div class="metric-item">
							<div class="metric-value">\${learnings.totalNew}</div>
							<div class="metric-label">new</div>
						</div>
						<div class="metric-item">
							<div class="metric-value">\${learnings.totalPromoted}</div>
							<div class="metric-label">promoted</div>
						</div>
					</div>
					\${learnings.patterns.length > 0 ? \`
						<div style="margin-top:12px">
							\${learnings.patterns.map(p => \`
								<div style="padding:6px 0;border-bottom:1px solid var(--vscode-panel-border)">
									<span style="font-size:11px;background:var(--vscode-badge-background);padding:2px 6px;border-radius:4px">\${p.type}</span>
									<span style="margin-left:8px">\${p.description}</span>
								</div>
							\`).join('')}
						</div>
					\` : '<div style="color:var(--vscode-descriptionForeground);font-style:italic">No new patterns discovered</div>'}
				</div>

				<div class="section">
					<div class="section-title">⚠️ Pitfalls Avoided</div>
					\${pitfalls.warnings.length > 0 ? \`
						\${pitfalls.warnings.map(w => \`
							<div style="padding:8px;background:var(--vscode-inputValidation-warningBackground,#352a05);border-radius:4px;margin-bottom:8px">
								<div style="font-weight:500">\${w.trigger}</div>
								<div style="font-size:12px;color:var(--vscode-descriptionForeground)">\${w.risk}</div>
								<div style="font-size:11px;margin-top:4px">✓ \${w.outcome}</div>
							</div>
						\`).join('')}
						<div style="color:var(--vscode-charts-green)">~\${pitfalls.estimatedTimeSaved} minutes of potential debugging avoided</div>
					\` : '<div style="color:var(--vscode-descriptionForeground);font-style:italic">Clean session  -  no warnings needed</div>'}
				</div>

				<div class="section">
					<div class="section-title">📈 Intelligence Metrics</div>
					<div class="metric-row">
						<div class="metric-item">
							<div class="metric-value">~\${metrics.tokenSavingsEstimate.toLocaleString()}</div>
							<div class="metric-label">tokens saved</div>
						</div>
						<div class="metric-item">
							<div class="metric-value">\${Math.round(metrics.contextReusageRate * 100)}%</div>
							<div class="metric-label">context reuse</div>
						</div>
					</div>
					<div style="margin-top:12px">
						<div style="font-size:12px;margin-bottom:4px">Coherence: \${metrics.coherenceScore}%</div>
						<div style="background:var(--vscode-progressBar-background,#0e70c0);border-radius:4px;overflow:hidden">
							<div class="coherence-bar" style="width:\${metrics.coherenceScore}%;background:\${coherenceColor}"></div>
						</div>
					</div>
				</div>

				\${concurrentSessions && concurrentSessions.length > 0 ? \`
				<div class="section">
					<div class="section-title">🔀 Concurrent Sessions</div>
					\${concurrentSessions.map(cs => \`
						<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--vscode-panel-border)">
							<span style="font-weight:500">\${cs.clientType}</span>
							<span style="font-size:12px;color:var(--vscode-descriptionForeground)">
								\${cs.overlapFiles} file\${cs.overlapFiles !== 1 ? 's' : ''} overlapped
								\${cs.conflictResolved ? ' · ✓ resolved' : ' · ⚠ potential conflict'}
							</span>
						</div>
					\`).join('')}
				</div>
				\` : ''}

				<div class="section">
					<div class="section-title">📋 Session Timeline</div>
					<div class="timeline" id="timeline">
						\${renderTimelineEvents()}
					</div>
				</div>
			\`;
		}

		function renderTimelineEvents() {
			if (!currentCeremony || !currentCeremony.timeline) return '';
			return currentCeremony.timeline.map(event => {
				const time = new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
				const severityClass = event.severity || 'info';
				return \`
					<div class="timeline-event \${severityClass}">
						<div class="event-time">\${time}</div>
						<div class="event-summary">\${event.summary}</div>
					</div>
				\`;
			}).join('');
		}

		function renderTimeline() {
			const container = document.getElementById('timeline');
			if (container) {
				container.innerHTML = renderTimelineEvents();
			}
		}

		function renderSummary() {
			// Re-render the summary section
			renderCeremony();
		}

		// Signal ready on load
		vscode.postMessage({ type: 'ready' });
	</script>
</body>
</html>
		`;
	}

	private _getNonce(): string {
		let text = "";
		const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
		for (let i = 0; i < 32; i++) {
			text += possible.charAt(Math.floor(Math.random() * possible.length));
		}
		return text;
	}

	public dispose(): void {
		for (const d of this._disposables) {
			d.dispose();
		}
		this._disposables.length = 0;
	}
}
