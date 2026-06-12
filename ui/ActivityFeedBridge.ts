/**
 * ActivityFeedBridge  -  Connects ProjectionStore to Dashboard Activity Feed
 *
 * Translates service projection events into ActivityEvent items that the
 * existing WorkspaceDataService and ActivityPanel.tsx can render.
 *
 * ## Design
 *
 * ```
 * ProjectionStore.onDidChange
 *       ↓
 * ActivityFeedBridge (translate, dedupe, limit)
 *       ↓
 * WorkspaceDataService.pushDaemonEvent()
 *       ↓
 * UnifiedDashboardPanel → ActivityPanel.tsx
 * ```
 *
 * ## Privacy Contract
 * - Only metadata flows to webview (no code content)
 * - File paths truncated to basename for display
 * - Risk descriptions limited to reason string (no file contents)
 *
 * @see ProjectionStore.ts for upstream event source
 * @see workspace-data/types.ts for the ActivityEvent type
 * @see vreko_surface.md "Webview Visibility Policy"
 *
 * @module ui/ActivityFeedBridge
 */

import * as path from "node:path";
import * as vscode from "vscode";
import type { ActivityEvent } from "../services/workspace-data/types";
import { logger } from "../utils/logger";
import type { ProjectionStore } from "./ProjectionStore";
import type { DaemonConnectionState, ProjectionChangeEvent, ProjectionState, SessionSummary } from "./types";

// =============================================================================
// CONFIGURATION
// =============================================================================

/** Maximum number of service activity events to retain in memory */
const MAX_DAEMON_EVENTS = 200;

/** Minimum interval between events of the same type (ms)  -  deduplication */
const DEDUPE_INTERVAL_MS = 2000;

const LOG_PREFIX = "[ActivityFeedBridge]";

// =============================================================================
// ACTIVITY FEED BRIDGE
// =============================================================================

export class ActivityFeedBridge implements vscode.Disposable {
	private _disposables: vscode.Disposable[] = [];
	private _daemonEvents: ActivityEvent[] = [];
	private _lastEventByType: Map<string, number> = new Map();
	private _previousState: ProjectionState | null = null;

	/** Callback to push events to WorkspaceDataService */
	private _pushCallback?: (event: ActivityEvent) => void;

	private _onDaemonActivity = new vscode.EventEmitter<ActivityEvent>();
	public readonly onDaemonActivity = this._onDaemonActivity.event;

	constructor(readonly projectionStore: ProjectionStore) {
		this._previousState = { ...projectionStore.state } as ProjectionState;

		this._disposables.push(
			projectionStore.onDidChange((event: ProjectionChangeEvent) => {
				this._handleProjectionChange(event);
			}),
		);

		logger.debug(`${LOG_PREFIX} Initialized`);
	}

	/**
	 * Wire this bridge to a WorkspaceDataService so service events flow
	 * into the activity timeline for webview rendering.
	 */
	wireTo(pushCallback: (event: ActivityEvent) => void): void {
		this._pushCallback = pushCallback;
		logger.debug(`${LOG_PREFIX} Wired to WorkspaceDataService`);
	}

	/** Get all service activity events (most recent first) */
	get events(): ReadonlyArray<ActivityEvent> {
		return this._daemonEvents;
	}

	// =========================================================================
	// INTERNAL: Event Translation
	// =========================================================================

	private _handleProjectionChange(event: ProjectionChangeEvent): void {
		const state = event.state;
		const prev = this._previousState;
		this._previousState = { ...state } as ProjectionState;

		for (const slice of event.changed) {
			switch (slice) {
				case "session":
					this._handleSessionChange(state.session, prev?.session);
					break;
				case "protection":
					this._handleProtectionChange(state);
					break;
				case "intelligence":
					this._handleIntelligenceChange(state);
					break;
				case "connection":
					this._handleConnectionChange(state.connection, prev?.connection ?? "disconnected");
					break;
			}
		}
	}

	/**
	 * Handle session slice changes  -  emit snapshot/session events.
	 */
	private _handleSessionChange(session: Readonly<SessionSummary>, prevSession?: Readonly<SessionSummary>): void {
		// New snapshot detected (count increased)
		if (prevSession && session.snapshotCount > prevSession.snapshotCount) {
			this._emitEvent({
				id: `service-snap-${Date.now()}`,
				type: "service-snapshot",
				file: session.task || "(session)",
				timestamp: Date.now(),
				details: `Snapshot #${session.snapshotCount}  -  ${session.filesModified} files modified`,
				icon: "📸",
			});
		}

		// Session started
		if (session.active && (!prevSession || !prevSession.active)) {
			this._emitEvent({
				id: `service-session-start-${Date.now()}`,
				type: "service-session",
				file: session.task || "(untitled session)",
				timestamp: Date.now(),
				details: "Session started",
				icon: "▶️",
			});
		}

		// Session ended
		if (!session.active && prevSession?.active) {
			this._emitEvent({
				id: `service-session-end-${Date.now()}`,
				type: "service-session",
				file: prevSession.task || "(untitled session)",
				timestamp: Date.now(),
				details: `Session ended  -  ${prevSession.snapshotCount} snapshots, ${prevSession.filesModified} files`,
				icon: "⏹️",
			});
		}
	}

	/**
	 * Handle protection slice changes  -  emit risk signal events.
	 */
	private _handleProtectionChange(state: Readonly<ProjectionState>): void {
		const signals = state.protection.riskSignals;
		if (signals.length === 0) {
			return;
		}

		// Only emit for the most recent signal (new addition)
		const latest = signals[signals.length - 1];
		if (!latest) {
			return;
		}

		this._emitEvent({
			id: `service-risk-${Date.now()}`,
			type: "service-risk",
			file: latest.filePath ? path.basename(latest.filePath) : "(workspace)",
			timestamp: Date.now(),
			details: `${latest.level}: ${latest.description}`,
			icon: latest.level === "critical" || latest.level === "high" ? "⚠️" : "🛡️",
		});
	}

	/**
	 * Handle connection slice changes  -  emit degradation / recovery events.
	 * Per save-path contract: degradation events inform the user that
	 * service protection is reduced, but saves are NEVER blocked.
	 */
	private _handleConnectionChange(current: DaemonConnectionState, previous: DaemonConnectionState): void {
		// Only emit for meaningful transitions
		if (current === previous) {
			return;
		}

		// Degraded  -  service not responding to health checks
		if (current === "degraded" && previous === "connected") {
			this._emitEvent({
				id: `service-degraded-${Date.now()}`,
				type: "service-protection",
				file: "(service)",
				timestamp: Date.now(),
				details: "Protection degraded  -  service not responding. Saves not blocked.",
				icon: "⚠️",
			});
		}

		// Disconnected / CLI missing  -  full offline
		if ((current === "disconnected" || current === "cli_missing") && previous === "connected") {
			this._emitEvent({
				id: `service-offline-${Date.now()}`,
				type: "service-protection",
				file: "(service)",
				timestamp: Date.now(),
				details:
					current === "cli_missing"
						? "Daemon offline  -  CLI not found. Local protection continues."
						: "Daemon offline  -  local protection continues.",
				icon: "🔌",
			});
		}

		// Recovered  -  service back online
		if (
			current === "connected" &&
			(previous === "degraded" || previous === "disconnected" || previous === "reconnecting")
		) {
			this._emitEvent({
				id: `service-recovered-${Date.now()}`,
				type: "service-protection",
				file: "(service)",
				timestamp: Date.now(),
				details: "Daemon connected  -  full protection active.",
				icon: "✅",
			});
		}
	}

	/**
	 * Handle intelligence slice changes  -  emit AI activity events.
	 */
	private _handleIntelligenceChange(state: Readonly<ProjectionState>): void {
		const intel = state.intelligence;
		if (intel.aiActivityCount > 0 && intel.lastDetectedAITool) {
			this._emitEvent({
				id: `service-ai-${Date.now()}`,
				type: "service-protection",
				file: intel.lastDetectedAITool,
				timestamp: Date.now(),
				aiTool: intel.lastDetectedAITool,
				details: `AI activity detected (${intel.lastDetectedAITool})`,
				icon: "🤖",
			});
		}
	}

	// =========================================================================
	// INTERNAL: Emit & Dedupe
	// =========================================================================

	private _emitEvent(event: ActivityEvent): void {
		// Deduplicate: skip if same type emitted within DEDUPE_INTERVAL_MS
		const lastTime = this._lastEventByType.get(event.type);
		if (lastTime && Date.now() - lastTime < DEDUPE_INTERVAL_MS) {
			return;
		}
		this._lastEventByType.set(event.type, Date.now());

		// Trim to max capacity
		if (this._daemonEvents.length >= MAX_DAEMON_EVENTS) {
			this._daemonEvents = this._daemonEvents.slice(-MAX_DAEMON_EVENTS + 1);
		}

		this._daemonEvents.push(event);

		logger.debug(`${LOG_PREFIX} Event emitted`, {
			type: event.type,
			file: event.file,
		});

		// Push to WorkspaceDataService (if wired)
		if (this._pushCallback) {
			this._pushCallback(event);
		}

		this._onDaemonActivity.fire(event);
	}

	// =========================================================================
	// DISPOSE
	// =========================================================================

	dispose(): void {
		for (const d of this._disposables) {
			d.dispose();
		}
		this._disposables = [];
		this._onDaemonActivity.dispose();
		this._daemonEvents = [];
	}
}
