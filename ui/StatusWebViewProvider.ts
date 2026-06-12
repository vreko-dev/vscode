/**
 * Status WebView Provider
 *
 * Compact status card at the top of the Vreko sidebar.
 * Per fix_up_tree_view_2.md spec:
 * - 5 states: disconnected, unauthenticated, noSession, active, ended
 * - Rich rendering: badges, live timer, guided empty states
 * - Max ~100px height to give TreeView room
 *
 * @module ui/StatusWebViewProvider
 */

import * as vscode from "vscode";
import type { DaemonBridge } from "../services/DaemonBridge";
import { logger } from "../utils/logger";

// =============================================================================
// Types
// =============================================================================

export type StatusView = "disconnected" | "unauthenticated" | "noSession" | "active" | "ended";

export interface StatusState {
	view: StatusView;
	// Active session fields
	taskName?: string;
	elapsed?: string;
	protectionLevel?: string;
	filesTracked?: number;
	snapshots?: number;
	restores?: number;
	learnings?: number;
	// Ended session fields
	finalDuration?: string;
	finalSnapshots?: number;
	finalLearnings?: number;
	// Auth fields
	userName?: string;
	userTier?: string;
	// Last session info
	lastSessionAgo?: string;
	lastSessionSnapshots?: number;
	// Behavioral Intelligence file status
	agentsWorkspace?: {
		exists: boolean;
		lastModified?: string; // human-readable, e.g. "2 hours ago"
	};
}

// Extension Host → Status WebView
type StatusInMessage =
	| { type: "stateUpdate"; state: StatusState }
	| { type: "sessionTick"; elapsed: string }
	| { type: "statsUpdate"; snapshots: number; restores: number; learnings: number };

// Status WebView → Extension Host
type StatusOutMessage = { type: "command"; command: string } | { type: "ready" };

// =============================================================================
// Status WebView Provider
// =============================================================================

export class StatusWebViewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = "vreko.status";

	private _view?: vscode.WebviewView;
	private readonly _extensionUri: vscode.Uri;
	private readonly _daemonBridge: DaemonBridge | null;
	private readonly _disposables: vscode.Disposable[] = [];

	private _currentState: StatusState = { view: "disconnected" };
	private _tickInterval?: NodeJS.Timeout;
	private _stateRefreshInterval?: NodeJS.Timeout;
	private _sessionStartedAt: number | null = null;

	constructor(extensionUri: vscode.Uri, daemonBridge: DaemonBridge | null) {
		this._extensionUri = extensionUri;
		this._daemonBridge = daemonBridge;
	}

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		_context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	): void {
		this._view = webviewView;

		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this._extensionUri],
		};

		webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

		// Handle messages from the webview
		webviewView.webview.onDidReceiveMessage(
			(message: StatusOutMessage) => {
				this._handleMessage(message);
			},
			null,
			this._disposables,
		);

		// Dispose timer on view dispose
		webviewView.onDidDispose(() => {
			this._stopTicking();
		});

		// Initial state update
		this.updateState();

		// Start periodic state refresh (every 30 seconds) to catch auth changes
		this._startStateRefresh();
	}

	// =========================================================================
	// Public API
	// =========================================================================

	/**
	 * Update state from service data
	 */
	public async updateState(): Promise<void> {
		if (!this._daemonBridge?.isConnected()) {
			this._currentState = { view: "disconnected" };
			this._postToWebView({ type: "stateUpdate", state: this._currentState });
			return;
		}

		try {
			// Check auth state
			const status = await this._daemonBridge.getStatus();
			if (!status?.auth?.authenticated) {
				this._currentState = { view: "unauthenticated" };
				this._postToWebView({ type: "stateUpdate", state: this._currentState });
				return;
			}

			// Capture user info for authenticated states
			const userName = status.auth?.user;
			const userTier = status.auth?.tier;

			// Check session state
			const workspacePath = this._getWorkspacePath();
			if (!workspacePath) {
				this._currentState = { view: "noSession", userName, userTier };
				this._postToWebView({ type: "stateUpdate", state: this._currentState });
				return;
			}

			const session = await this._daemonBridge.getSessionStatus(workspacePath);
			if (!session || !session.active) {
				this._currentState = { view: "noSession", userName, userTier };
				this._postToWebView({ type: "stateUpdate", state: this._currentState });
				return;
			}

			// Active session
			const startedAt = session.startedAt ? new Date(session.startedAt).getTime() : Date.now();
			this._sessionStartedAt = startedAt;
			this._currentState = {
				view: "active",
				taskName: session.task ?? undefined,
				elapsed: this._formatElapsed(startedAt),
				protectionLevel: "standard",
				filesTracked: session.filesModified ?? 0,
				snapshots: session.snapshotCount ?? 0,
				restores: 0,
				learnings: 0,
				userName: status.auth?.user,
				userTier: status.auth?.tier,
			};

			this._postToWebView({ type: "stateUpdate", state: this._currentState });
			this._startTicking();
		} catch (error) {
			logger.error("StatusWebViewProvider: Failed to update state", error as Error);
			this._currentState = { view: "disconnected" };
			this._postToWebView({ type: "stateUpdate", state: this._currentState });
		}
	}

	/**
	 * Show ended state (transient, 5 seconds)
	 */
	public showEnded(finalStats: { duration: string; snapshots: number; learnings: number }): void {
		this._currentState = {
			view: "ended",
			finalDuration: finalStats.duration,
			finalSnapshots: finalStats.snapshots,
			finalLearnings: finalStats.learnings,
		};

		this._postToWebView({ type: "stateUpdate", state: this._currentState });
		this._stopTicking();

		// Transition to noSession after 5s
		setTimeout(() => {
			this._currentState = { view: "noSession" };
			this._postToWebView({ type: "stateUpdate", state: this._currentState });
		}, 5000);
	}

	/**
	 * Update a partial slice of state (e.g. agentsWorkspace) without a full daemon round-trip.
	 */
	public update(partial: Partial<StatusState>): void {
		this._currentState = { ...this._currentState, ...partial };
		this._postToWebView({ type: "stateUpdate", state: this._currentState });
	}

	/**
	 * Post a message to the webview
	 */
	private _postToWebView(message: StatusInMessage): void {
		if (this._view) {
			this._view.webview.postMessage(message);
		}
	}

	// =========================================================================
	// Private Helpers
	// =========================================================================

	private _handleMessage(message: StatusOutMessage): void {
		switch (message.type) {
			case "ready":
				// Webview is ready, send initial state
				this._postToWebView({ type: "stateUpdate", state: this._currentState });
				break;
			case "command":
				// Execute VS Code command
				vscode.commands.executeCommand(message.command);
				break;
		}
	}

	private _startTicking(): void {
		if (this._tickInterval) {
			clearInterval(this._tickInterval);
		}

		this._tickInterval = setInterval(() => {
			if (this._currentState.view === "active" && this._sessionStartedAt) {
				this._postToWebView({
					type: "sessionTick",
					elapsed: this._formatElapsed(this._sessionStartedAt),
				});
			}
		}, 60_000);
	}

	private _stopTicking(): void {
		if (this._tickInterval) {
			clearInterval(this._tickInterval);
			this._tickInterval = undefined;
		}
		if (this._stateRefreshInterval) {
			clearInterval(this._stateRefreshInterval);
			this._stateRefreshInterval = undefined;
		}
	}

	/**
	 * Start periodic state refresh to catch auth changes
	 */
	private _startStateRefresh(): void {
		if (this._stateRefreshInterval) {
			clearInterval(this._stateRefreshInterval);
		}

		this._stateRefreshInterval = setInterval(() => {
			this.updateState();
		}, 30_000); // Refresh every 30 seconds
	}

	private _getWorkspacePath(): string | null {
		const folders = vscode.workspace.workspaceFolders;
		if (folders && folders.length > 0) {
			return folders[0].uri.fsPath;
		}
		return null;
	}

	private _formatElapsed(startedAt: number): string {
		const elapsedMs = Date.now() - startedAt;
		const mins = Math.floor(elapsedMs / 60000);
		if (mins < 60) {
			return `${mins}m`;
		}
		const hrs = Math.floor(mins / 60);
		const remainMins = mins % 60;
		return `${hrs}h ${remainMins}m`;
	}

	private _getHtmlForWebview(webview: vscode.Webview): string {
		const nonce = this._getNonce();

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
	<style>
		* { box-sizing: border-box; margin: 0; padding: 0; }
		body {
			font-family: var(--vscode-font-family);
			font-size: var(--vscode-font-size);
			color: var(--vscode-foreground);
			background: var(--vscode-sideBar-background);
			padding: 8px 12px;
		}
		.state-card { display: none; }
		.state-card.visible { display: block; }

		/* Disconnected state */
		.state-disconnected {
			background: var(--vscode-inputValidation-warningBackground, #3c3c00);
			border-radius: 4px;
			padding: 10px;
		}
		.state-disconnected .title { color: var(--vscode-editorWarning-foreground, #cca700); }

		/* Unauthenticated state */
		.state-unauthenticated {
			background: var(--vscode-editor-background);
			border-radius: 4px;
			padding: 10px;
		}

		/* No session state */
		.state-noSession {
			background: var(--vscode-editor-background);
			border-radius: 4px;
			padding: 10px;
		}

		/* Active session state */
		.state-active {
			background: var(--vscode-editor-background);
			border-radius: 4px;
			padding: 10px;
		}

		/* Ended session state */
		.state-ended {
			background: var(--vscode-inputValidation-infoBackground, #003c3c);
			border-radius: 4px;
			padding: 10px;
		}

		.title {
			font-weight: 600;
			margin-bottom: 6px;
			display: flex;
			align-items: center;
			gap: 6px;
		}
		.badge {
			font-size: 10px;
			padding: 2px 6px;
			border-radius: 10px;
			font-weight: 500;
		}
		.badge-active { background: var(--vscode-inputValidation-validBackground, #003300); color: var(--vscode-inputValidation-validForeground, #89d185); }
		.badge-noSession { background: var(--vscode-inputValidation-warningBackground, #3c3c00); color: var(--vscode-inputValidation-warningForeground, #cca700); }
		.badge-ended { background: var(--vscode-inputValidation-infoBackground, #003c3c); color: var(--vscode-inputValidation-infoForeground, #75beff); }

		.task-name {
			font-size: 13px;
			font-weight: 500;
			margin-bottom: 4px;
		}
		.elapsed {
			font-size: 11px;
			color: var(--vscode-descriptionForeground);
		}
		.stats {
			font-size: 11px;
			color: var(--vscode-descriptionForeground);
			margin-top: 6px;
		}
		.description {
			font-size: 12px;
			color: var(--vscode-descriptionForeground);
			margin-bottom: 10px;
			line-height: 1.4;
		}
		.actions {
			display: flex;
			gap: 8px;
			margin-top: 10px;
		}
		button {
			background: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
			border: none;
			padding: 4px 12px;
			border-radius: 2px;
			cursor: pointer;
			font-size: 12px;
		}
		button:hover { background: var(--vscode-button-hoverBackground); }
		button.secondary {
			background: var(--vscode-button-secondaryBackground);
			color: var(--vscode-button-secondaryForeground);
		}
		button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }

		/* User info bar */
		.user-info {
			font-size: 11px;
			color: var(--vscode-descriptionForeground);
			margin-top: 8px;
			padding-top: 8px;
			border-top: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.35));
			display: flex;
			align-items: center;
			justify-content: space-between;
		}
		.user-info .user-name {
			opacity: 0.9;
		}
		.user-info .tier-badge {
			font-size: 10px;
			padding: 1px 5px;
			border-radius: 3px;
			background: var(--vscode-badge-background);
			color: var(--vscode-badge-foreground);
			margin-left: 4px;
		}
		.link-button {
			background: none;
			border: none;
			color: var(--vscode-textLink-foreground);
			cursor: pointer;
			font-size: 11px;
			padding: 0;
			text-decoration: underline;
		}
		.link-button:hover {
			color: var(--vscode-textLink-activeForeground);
		}
		.status-row {
			display: flex;
			justify-content: space-between;
			align-items: center;
			font-size: 11px;
			margin-top: 4px;
			gap: 8px;
		}
		.status-row .label {
			color: var(--vscode-descriptionForeground);
			white-space: nowrap;
		}
		.status-row .value {
			text-align: right;
			white-space: nowrap;
		}
		.status-row .value.ok {
			color: var(--vscode-charts-green);
		}
		.status-row .value.missing {
			color: var(--vscode-foreground);
			opacity: 0.6;
		}
	</style>
</head>
<body>
	<!-- State 1: Disconnected -->
	<div id="state-disconnected" class="state-card state-disconnected">
		<div class="title">⚠ Daemon not connected</div>
		<div class="description">
			Run <code>vreko service start</code> in your terminal, or reload the window.
		</div>
		<div class="actions">
			<button onclick="executeCommand('vreko.reconnectDaemon')">Reconnect</button>
			<button class="secondary" onclick="executeCommand('vreko.daemonStatus')">Show status</button>
		</div>
	</div>

	<!-- State 2: Unauthenticated -->
	<div id="state-unauthenticated" class="state-card state-unauthenticated">
		<div class="title">🛡 Vreko</div>
		<div class="description">
			Sign in to unlock session intelligence, closing ceremonies, and sync across devices.
			<br><br>
			<span style="opacity: 0.7;">Protection works without an account.</span>
		</div>
		<div class="actions">
			<button onclick="executeCommand('vreko.login')">Sign in</button>
		</div>
	</div>

	<!-- State 3: No session -->
	<div id="state-noSession" class="state-card state-noSession">
		<div class="title">🛡 Vreko</div>
		<div class="description">
			Protection active. Session begins automatically when your AI assistant starts a task.
		</div>
		<div class="user-info" id="noSession-user-info" style="display: none;">
			<span class="user-name" id="noSession-user-name"></span>
			<button class="link-button" onclick="executeCommand('vreko.signOut')">Sign out</button>
		</div>
	</div>

	<!-- State 4: Active session -->
	<div id="state-active" class="state-card state-active">
		<div class="title">
			🛡 Vreko
			<span class="badge badge-active">active</span>
		</div>
		<div class="task-name" id="task-name"></div>
		<div class="elapsed" id="elapsed"></div>
		<div class="stats" id="stats"></div>
		<div class="status-row" id="agents-workspace-row-active" style="display: none;">
			<span class="label">Behavioral Intelligence</span>
			<span class="value" id="agents-workspace-value-active"></span>
		</div>
		<div class="user-info" id="active-user-info" style="display: none;">
			<span class="user-name" id="active-user-name"></span>
			<button class="link-button" onclick="executeCommand('vreko.signOut')">Sign out</button>
		</div>
	</div>

	<!-- State 5: Session just ended -->
	<div id="state-ended" class="state-card state-ended">
		<div class="title">
			🛡 Vreko
			<span class="badge badge-ended">ended</span>
		</div>
		<div class="description">
			Session complete · <span id="final-duration"></span>
			<br>
			<span id="final-stats"></span>
		</div>
		<div class="status-row" id="agents-workspace-row-ended" style="display: none;">
			<span class="label">Behavioral Intelligence</span>
			<span class="value" id="agents-workspace-value-ended"></span>
		</div>
		<div class="actions">
			<button onclick="executeCommand('vreko.openCeremony')">View ceremony</button>
		</div>
	</div>

	<script nonce="${nonce}">
		const vscode = acquireVsCodeApi();

		// Signal ready on load
		vscode.postMessage({ type: 'ready' });

		// Handle messages from extension
		window.addEventListener('message', (event) => {
			const msg = event.data;

			if (msg.type === 'stateUpdate') {
				// Hide all states
				document.querySelectorAll('.state-card').forEach(el => el.classList.remove('visible'));

				// Show target state
				const target = document.getElementById('state-' + msg.state.view);
				if (target) {
					target.classList.add('visible');
					populateState(msg.state);
				}
			}

			if (msg.type === 'sessionTick') {
				const elapsedEl = document.getElementById('elapsed');
				if (elapsedEl) elapsedEl.textContent = msg.elapsed;
			}

			if (msg.type === 'statsUpdate') {
				const statsEl = document.getElementById('stats');
				if (statsEl) {
					statsEl.textContent = msg.snapshots + ' snapshots · ' + msg.restores + ' restores · ' + msg.learnings + ' learnings';
				}
			}
		});

		function populateState(state) {
			// Helper to format user display
			function formatUserInfo(userName, userTier) {
				if (!userName) return '';
				const tierBadge = userTier ? '<span class="tier-badge">' + userTier + '</span>' : '';
				return userName + tierBadge;
			}

			if (state.view === 'noSession') {
				const userInfoEl = document.getElementById('noSession-user-info');
				const userNameEl = document.getElementById('noSession-user-name');
				if (state.userName && userInfoEl && userNameEl) {
					userNameEl.innerHTML = formatUserInfo(state.userName, state.userTier);
					userInfoEl.style.display = 'flex';
				} else if (userInfoEl) {
					userInfoEl.style.display = 'none';
				}
			}

			if (state.view === 'active') {
				document.getElementById('task-name').textContent = state.taskName || 'Active session';
				document.getElementById('elapsed').textContent = state.elapsed || '';
				document.getElementById('stats').textContent =
					(state.filesTracked || 0) + ' files · ' +
					(state.snapshots || 0) + ' snapshots · ' +
					(state.learnings || 0) + ' learnings';

				// Show Behavioral Intelligence row
				const awRowActive = document.getElementById('agents-workspace-row-active');
				const awValueActive = document.getElementById('agents-workspace-value-active');
				if (state.agentsWorkspace !== undefined && awRowActive && awValueActive) {
					awRowActive.style.display = 'flex';
					if (state.agentsWorkspace.exists) {
						awValueActive.className = 'value ok';
						awValueActive.textContent = '✓ Ready · ' + (state.agentsWorkspace.lastModified || 'generated');
					} else {
						awValueActive.className = 'value missing';
						awValueActive.textContent = '○ Pending first session';
					}
				} else if (awRowActive) {
					awRowActive.style.display = 'none';
				}

				// Show user info
				const userInfoEl = document.getElementById('active-user-info');
				const userNameEl = document.getElementById('active-user-name');
				if (state.userName && userInfoEl && userNameEl) {
					userNameEl.innerHTML = formatUserInfo(state.userName, state.userTier);
					userInfoEl.style.display = 'flex';
				} else if (userInfoEl) {
					userInfoEl.style.display = 'none';
				}
			}

			if (state.view === 'ended') {
				document.getElementById('final-duration').textContent = state.finalDuration || '';
				document.getElementById('final-stats').textContent =
					(state.finalSnapshots || 0) + ' snapshots · ' +
					(state.finalLearnings || 0) + ' learnings captured';

				// Show Behavioral Intelligence row
				const awRowEnded = document.getElementById('agents-workspace-row-ended');
				const awValueEnded = document.getElementById('agents-workspace-value-ended');
				if (state.agentsWorkspace !== undefined && awRowEnded && awValueEnded) {
					awRowEnded.style.display = 'flex';
					if (state.agentsWorkspace.exists) {
						awValueEnded.className = 'value ok';
						awValueEnded.textContent = '✓ Ready · ' + (state.agentsWorkspace.lastModified || 'generated');
					} else {
						awValueEnded.className = 'value missing';
						awValueEnded.textContent = '○ Pending first session';
					}
				} else if (awRowEnded) {
					awRowEnded.style.display = 'none';
				}
			}
		}

		function executeCommand(cmd) {
			vscode.postMessage({ type: 'command', command: cmd });
		}
	</script>
</body>
</html>`;
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
		this._stopTicking();
		for (const d of this._disposables) {
			d.dispose();
		}
		this._disposables.length = 0;
	}
}
