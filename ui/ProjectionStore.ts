/**
 * ProjectionStore  -  Central Projection Cache for Daemon-First Surfaces
 *
 * Consumes DaemonBridge events and produces read-only projection state
 * for all UI surfaces (status bar, tree views, webview activity feed).
 *
 * ## Design
 *
 * ```
 * DaemonBridge (events)
 *       ↓
 * ProjectionStore (coalesce 200ms, project)
 *       ↓
 * onDidChange events
 *       ↓
 * StatusBar / TreeViews / Webview
 * ```
 *
 * ## Key Properties
 * - **Single source of truth** for all surface data
 * - **Coalesced updates** (200ms scheduler per DAEMON_FIRST_ARCHITECTURE SS4.1)
 * - **Read-only getters**  -  surfaces never mutate state
 * - **Lazy activation**  -  only starts when Vreko activation events fire
 * - **Disposable**  -  clean teardown via vscode.Disposable
 *
 * @see types.ts for ProjectionState, ProjectionChangeEvent
 * @see DaemonBridge.ts for the upstream event source
 * @see DAEMON_FIRST_ARCHITECTURE.md SS4.1 for coalescing spec
 *
 * @module ui/ProjectionStore
 */

import * as vscode from "vscode";
import type { DaemonBridge, StateChangeEvent } from "../services/DaemonBridge";
import { logger } from "../utils/logger";
import type {
	ConnectionDetails,
	DaemonConnectionState,
	IntelligenceSignals,
	ProjectionChangeEvent,
	ProjectionSlice,
	ProjectionState,
	ProtectionSummary,
	SessionSummary,
} from "./types";
import { createDefaultProjectionState } from "./types";

// =============================================================================
// CONFIGURATION
// =============================================================================

/** Coalescing interval for UI updates (per DAEMON_FIRST_ARCHITECTURE SS4.1) */
const COALESCE_INTERVAL_MS = 200;

/** How often to refresh session status from service (seconds) */
const SESSION_POLL_INTERVAL_MS = 30_000;

const LOG_PREFIX = "[ProjectionStore]";

// =============================================================================
// PROJECTION STORE
// =============================================================================

export class ProjectionStore implements vscode.Disposable {
	// ── Internal state ──────────────────────────────────────────────────
	private _state: ProjectionState;
	private _disposed = false;

	// ── Coalescing scheduler ────────────────────────────────────────────
	private _pendingSlices: Set<ProjectionSlice> = new Set();
	private _coalesceTimer: ReturnType<typeof setTimeout> | null = null;

	// ── Polling timers ──────────────────────────────────────────────────
	private _sessionPollTimer: ReturnType<typeof setInterval> | null = null;

	// ── VS Code event emitters ──────────────────────────────────────────
	private _onDidChange = new vscode.EventEmitter<ProjectionChangeEvent>();
	public readonly onDidChange = this._onDidChange.event;

	// ── Subscriptions ───────────────────────────────────────────────────
	private _disposables: vscode.Disposable[] = [];

	// ── Bridge reference ────────────────────────────────────────────────
	private _bridge: DaemonBridge | null = null;
	private _workspacePath: string | null = null;

	constructor() {
		this._state = createDefaultProjectionState();
	}

	// =========================================================================
	// ACTIVATION
	// =========================================================================

	/**
	 * Activate the store by wiring to a DaemonBridge instance.
	 *
	 * Called lazily when Vreko activation events fire.
	 * Subscribes to bridge events and starts session polling.
	 *
	 * @param bridge - The DaemonBridge to consume events from
	 * @param workspacePath - Current workspace root for scoped queries
	 */
	activate(bridge: DaemonBridge, workspacePath: string): void {
		if (this._disposed) {
			logger.warn(`${LOG_PREFIX} Cannot activate: already disposed`);
			return;
		}

		this._bridge = bridge;
		this._workspacePath = workspacePath;

		logger.info(`${LOG_PREFIX} Activating`, { workspacePath });

		// Subscribe to connection state changes
		this._disposables.push(
			bridge.onStateChange((event: StateChangeEvent) => {
				this._handleConnectionChange(event);
			}),
		);

		// Subscribe to snapshot creation events
		this._disposables.push(
			bridge.onSnapshotCreated(() => {
				this._handleSnapshotCreated();
			}),
		);

		// Subscribe to risk detection events
		this._disposables.push(
			bridge.onRiskDetected((event) => {
				this._handleRiskDetected(event);
			}),
		);

		// Subscribe to session events (Layer 2 wiring)
		this._disposables.push(
			bridge.onSessionStarted((event) => {
				this._handleSessionStarted(event);
			}),
		);

		this._disposables.push(
			bridge.onSessionEnded((event) => {
				this._handleSessionEnded(event);
			}),
		);

		// Subscribe to learning events (Layer 2 wiring)
		this._disposables.push(
			bridge.onLearningAdded(() => {
				this._handleLearningAdded();
			}),
		);

		// Subscribe to protection change events (Layer 2 wiring)
		this._disposables.push(
			bridge.onProtectionChanged((event) => {
				this._handleProtectionChanged(event);
			}),
		);

		// Subscribe to violation events (Layer 2 wiring)
		this._disposables.push(
			bridge.onViolationReported((event) => {
				this._handleViolationReported(event);
			}),
		);

		// Subscribe to sync events (Layer 2 wiring)
		this._disposables.push(
			bridge.onSyncCompleted((event) => {
				this._handleSyncCompleted(event);
			}),
		);

		// Start session status polling
		this._startSessionPolling();

		// Seed initial state from current bridge state
		this._seedFromBridge();
	}

	// =========================================================================
	// READ-ONLY GETTERS
	// =========================================================================

	/** Full projection state (read-only snapshot) */
	get state(): Readonly<ProjectionState> {
		return this._state;
	}

	/** Current service connection state */
	get connection(): DaemonConnectionState {
		return this._state.connection;
	}

	/** Connection details (version, uptime, health) */
	get connectionDetails(): Readonly<ConnectionDetails> {
		return this._state.connectionDetails;
	}

	/** Protection summary for the workspace */
	get protection(): Readonly<ProtectionSummary> {
		return this._state.protection;
	}

	/** Current session summary */
	get session(): Readonly<SessionSummary> {
		return this._state.session;
	}

	/** Intelligence signals */
	get intelligence(): Readonly<IntelligenceSignals> {
		return this._state.intelligence;
	}

	/** Whether service is connected and healthy */
	get isHealthy(): boolean {
		return this._state.connection === "connected";
	}

	/** Whether service is in a degraded state */
	get isDegraded(): boolean {
		return this._state.connection === "degraded";
	}

	/** Whether service is completely offline */
	get isOffline(): boolean {
		const s = this._state.connection;
		return s === "disconnected" || s === "cli_missing" || s === "offline-embedded";
	}

	// =========================================================================
	// INTERNAL: EVENT HANDLERS
	// =========================================================================

	/**
	 * Handle connection state change from DaemonBridge.
	 */
	private _handleConnectionChange(event: StateChangeEvent): void {
		const mappedState = this._mapConnectionState(event.state);

		const details: ConnectionDetails = {
			...this._state.connectionDetails,
			consecutiveFailures: event.healthy === false ? this._state.connectionDetails.consecutiveFailures + 1 : 0,
			daemonVersion: event.daemonVersion ?? this._state.connectionDetails.daemonVersion,
			lastHealthCheck: event.lastHealthCheck ?? this._state.connectionDetails.lastHealthCheck,
			nextRetryMs: event.nextRetryMs,
			reconnectAttempt: event.attempt,
			reason: event.reason,
		};

		this._state = {
			...this._state,
			connection: mappedState,
			connectionDetails: details,
		};

		this._scheduleFlush("connection", "connectionDetails");

		// When connected, trigger a session refresh
		if (mappedState === "connected") {
			void this._refreshSession();
		}
	}

	/**
	 * Handle snapshot creation event.
	 * Increments session snapshot count and refreshes session data.
	 */
	private _handleSnapshotCreated(): void {
		this._state = {
			...this._state,
			session: {
				...this._state.session,
				snapshotCount: this._state.session.snapshotCount + 1,
				totalRecentSnapshots: this._state.session.totalRecentSnapshots + 1,
			},
		};

		this._scheduleFlush("session");
	}

	/**
	 * Handle risk detection event.
	 * Increments intelligence risk count and records risk signal.
	 */
	private _handleRiskDetected(event: { file: string; riskLevel: string; reason: string }): void {
		const signal = {
			level: event.riskLevel as "low" | "medium" | "high" | "critical",
			description: event.reason,
			filePath: event.file,
		};

		this._state = {
			...this._state,
			intelligence: {
				...this._state.intelligence,
				riskEventCount: this._state.intelligence.riskEventCount + 1,
				lastUpdated: new Date(),
			},
			protection: {
				...this._state.protection,
				riskSignals: [...this._state.protection.riskSignals.slice(-9), signal], // Keep last 10
			},
		};

		this._scheduleFlush("intelligence", "protection");
	}

	/**
	 * Handle session started event.
	 * Updates session state to active with task info.
	 */
	private _handleSessionStarted(event: { taskId: string; task: string }): void {
		this._state = {
			...this._state,
			session: {
				...this._state.session,
				active: true,
				taskId: event.taskId,
				task: event.task,
				startedAt: new Date(),
			},
		};

		this._scheduleFlush("session");
		logger.debug(`${LOG_PREFIX} Session started`, { taskId: event.taskId });
	}

	/**
	 * Handle session ended event.
	 * Updates session state to inactive.
	 */
	private _handleSessionEnded(event: { sessionId: string; outcome: string }): void {
		this._state = {
			...this._state,
			session: {
				...this._state.session,
				active: false,
				taskId: undefined,
				task: undefined,
			},
		};

		this._scheduleFlush("session");
		logger.debug(`${LOG_PREFIX} Session ended`, { sessionId: event.sessionId, outcome: event.outcome });
	}

	/**
	 * Handle learning added event.
	 * Increments learning count in intelligence state.
	 */
	private _handleLearningAdded(): void {
		this._state = {
			...this._state,
			intelligence: {
				...this._state.intelligence,
				learningCount: this._state.intelligence.learningCount + 1,
				lastUpdated: new Date(),
			},
		};

		this._scheduleFlush("intelligence");
	}

	/**
	 * Handle protection changed event.
	 * Updates protection level for the affected file.
	 */
	private _handleProtectionChanged(event: { file: string; level: string; previousLevel?: string }): void {
		// Update protection state - the file's protection level changed
		logger.debug(`${LOG_PREFIX} Protection changed`, {
			file: event.file,
			level: event.level,
			previousLevel: event.previousLevel,
		});

		this._scheduleFlush("protection");
	}

	/**
	 * Handle violation reported event.
	 * Increments violation count in protection state.
	 */
	private _handleViolationReported(event: { type: string; file: string; message: string }): void {
		this._state = {
			...this._state,
			protection: {
				...this._state.protection,
				violationCount: this._state.protection.violationCount + 1,
			},
		};

		this._scheduleFlush("protection");
		logger.debug(`${LOG_PREFIX} Violation reported`, { type: event.type, file: event.file });
	}

	/**
	 * Handle sync completed event.
	 * Updates sync status in connection details.
	 */
	private _handleSyncCompleted(event: { success: boolean; error?: string }): void {
		this._state = {
			...this._state,
			connectionDetails: {
				...this._state.connectionDetails,
				lastSync: new Date(),
				syncError: event.success ? undefined : event.error,
			},
		};

		this._scheduleFlush("connectionDetails");
		logger.debug(`${LOG_PREFIX} Sync completed`, { success: event.success });
	}

	// =========================================================================
	// INTERNAL: DAEMON POLLING
	// =========================================================================

	/**
	 * Seed initial state from bridge's current connection.
	 */
	private async _seedFromBridge(): Promise<void> {
		if (!this._bridge) {
			return;
		}

		try {
			// Check if bridge is already connected
			if (this._bridge.isConnected()) {
				this._state = {
					...this._state,
					connection: "connected",
				};
				this._scheduleFlush("connection");

				// Refresh session immediately
				await this._refreshSession();
			}
		} catch (err) {
			logger.debug(`${LOG_PREFIX} Seed from bridge failed`, {
				error: err instanceof Error ? err.message : String(err),
			});
		}
	}

	/**
	 * Start periodic session status polling.
	 */
	private _startSessionPolling(): void {
		this._stopSessionPolling();

		this._sessionPollTimer = setInterval(() => {
			void this._refreshSession();
		}, SESSION_POLL_INTERVAL_MS);
	}

	/**
	 * Stop session polling.
	 */
	private _stopSessionPolling(): void {
		if (this._sessionPollTimer) {
			clearInterval(this._sessionPollTimer);
			this._sessionPollTimer = null;
		}
	}

	/**
	 * Refresh session summary from service.
	 */
	private async _refreshSession(): Promise<void> {
		if (!this._bridge || !this._workspacePath) {
			return;
		}
		if (this._state.connection !== "connected") {
			return;
		}

		try {
			const status = await this._bridge.getSessionStatus(this._workspacePath);

			if (status) {
				const session: SessionSummary = {
					active: status.active,
					taskId: status.taskId,
					task: status.task,
					startedAt: status.startedAt ? new Date(status.startedAt) : undefined,
					filesModified: status.filesModified,
					snapshotCount: status.snapshotCount,
					totalRecentSnapshots: this._state.session.totalRecentSnapshots,
					durationSeconds: status.startedAt
						? Math.floor((Date.now() - new Date(status.startedAt).getTime()) / 1000)
						: 0,
				};

				this._state = { ...this._state, session };
				this._scheduleFlush("session");
			}
		} catch (err) {
			logger.debug(`${LOG_PREFIX} Session refresh failed`, {
				error: err instanceof Error ? err.message : String(err),
			});
		}
	}

	// =========================================================================
	// INTERNAL: COALESCING SCHEDULER
	// =========================================================================

	/**
	 * Schedule a coalesced flush of changed slices.
	 *
	 * Multiple rapid updates within COALESCE_INTERVAL_MS are batched
	 * into a single onDidChange event. This prevents UI thrashing when
	 * the service emits multiple events in quick succession.
	 */
	private _scheduleFlush(...slices: ProjectionSlice[]): void {
		for (const s of slices) {
			this._pendingSlices.add(s);
		}

		if (this._coalesceTimer) {
			return; // Already scheduled
		}

		this._coalesceTimer = setTimeout(() => {
			this._flush();
		}, COALESCE_INTERVAL_MS);
	}

	/**
	 * Flush pending changes to subscribers.
	 */
	private _flush(): void {
		this._coalesceTimer = null;

		if (this._pendingSlices.size === 0) {
			return;
		}
		if (this._disposed) {
			return;
		}

		const changed = Array.from(this._pendingSlices) as ProjectionSlice[];
		this._pendingSlices.clear();

		logger.debug(`${LOG_PREFIX} Flushing changes`, { slices: changed });

		this._onDidChange.fire({
			changed,
			state: this._state,
		});
	}

	// =========================================================================
	// INTERNAL: HELPERS
	// =========================================================================

	/**
	 * Map DaemonBridge ConnectionState to DaemonConnectionState.
	 *
	 * DaemonBridge uses the same states except for `offline-embedded`,
	 * which is a UI-only concept (extension running without any service).
	 */
	private _mapConnectionState(
		bridgeState: "connected" | "disconnected" | "reconnecting" | "cli_missing" | "degraded",
	): DaemonConnectionState {
		return bridgeState;
	}

	// =========================================================================
	// DISPOSE
	// =========================================================================

	dispose(): void {
		if (this._disposed) {
			return;
		}
		this._disposed = true;

		logger.info(`${LOG_PREFIX} Disposing`);

		this._stopSessionPolling();

		if (this._coalesceTimer) {
			clearTimeout(this._coalesceTimer);
			this._coalesceTimer = null;
		}

		for (const d of this._disposables) {
			d.dispose();
		}
		this._disposables = [];

		this._onDidChange.dispose();
		this._bridge = null;
	}
}

// =============================================================================
// SINGLETON REGISTRY (per-workspace)
// =============================================================================

const storeRegistry = new Map<string, ProjectionStore>();

/**
 * Get or create a ProjectionStore for a workspace.
 *
 * @param workspaceId - Workspace folder fsPath
 * @returns ProjectionStore instance
 */
export function getProjectionStore(workspaceId: string): ProjectionStore {
	let store = storeRegistry.get(workspaceId);
	if (!store) {
		store = new ProjectionStore();
		storeRegistry.set(workspaceId, store);
	}
	return store;
}

/**
 * Dispose a specific workspace's ProjectionStore.
 */
export function disposeProjectionStore(workspaceId: string): void {
	const store = storeRegistry.get(workspaceId);
	if (store) {
		store.dispose();
		storeRegistry.delete(workspaceId);
	}
}

/**
 * Dispose all ProjectionStore instances.
 * Call during extension deactivation.
 */
export function disposeAllProjectionStores(): void {
	for (const store of storeRegistry.values()) {
		store.dispose();
	}
	storeRegistry.clear();
}
