/**
 * Projection Types for Daemon-First Surfaces
 *
 * Central type definitions for the ProjectionStore layer.
 * These types represent the service's state as projected into the extension.
 * All UI surfaces (status bar, tree views, webview) consume these types
 * via the ProjectionStore  -  never directly from DaemonBridge.
 *
 * @see ProjectionStore.ts for the implementation
 * @see DaemonBridge.ts for the underlying service connection
 * @see DAEMON_FIRST_ARCHITECTURE.md SS4-SS5 for architecture spec
 *
 * @packageDocumentation
 */

// =============================================================================
// CONNECTION STATE
// =============================================================================

/**
 * Daemon connection state as seen by UI surfaces.
 *
 * Maps from DaemonBridge ConnectionState with one addition:
 * - `offline-embedded`: Extension running without service, using local-only features
 *
 * State transitions:
 * ```
 * disconnected ──→ reconnecting ──→ connected
 *       │                │               │
 *       │                └──→ disconnected│
 *       │                                 ↓
 *       └──→ cli_missing         degraded ──→ reconnecting
 *       └──→ offline-embedded
 * ```
 */
export type DaemonConnectionState =
	| "connected" // Daemon responding to health checks
	| "disconnected" // Not connected, not trying
	| "reconnecting" // Actively trying to reconnect (exp backoff)
	| "degraded" // Socket connected but service not responding
	| "cli_missing" // CLI not installed (circuit breaker active)
	| "offline-embedded"; // No service, extension using embedded-only features

/**
 * Connection details available when connected or degraded.
 */
export interface ConnectionDetails {
	/** Daemon version string (e.g., "1.0.0") */
	daemonVersion?: string;
	/** Daemon uptime in seconds */
	uptime?: number;
	/** Last successful health check timestamp */
	lastHealthCheck?: Date;
	/** Number of consecutive health check failures (0 when healthy) */
	consecutiveFailures: number;
	/** Next reconnect attempt time (when reconnecting) */
	nextRetryMs?: number;
	/** Reconnection attempt number */
	reconnectAttempt?: number;
	/** Human-readable reason for current state */
	reason?: string;
	/** Last successful sync timestamp */
	lastSync?: Date;
	/** Sync error message if last sync failed */
	syncError?: string;
}

// =============================================================================
// PROTECTION SUMMARY
// =============================================================================

/**
 * Aggregated protection state for the current workspace.
 *
 * Projected from the local service's protection layer.
 * Note: In v1, the protection service returns stubs  -  ProjectionStore
 * handles graceful fallback with sensible defaults.
 */
export interface ProtectionSummary {
	/** Current overall protection level for the workspace */
	currentLevel: "watch" | "warn" | "block" | "none";
	/** When the protection level was last evaluated */
	lastEvalTime?: Date;
	/** Total number of protected files in workspace */
	protectedFileCount: number;
	/** Breakdown by protection level */
	levelCounts: {
		watch: number;
		warn: number;
		block: number;
	};
	/** High-level risk signals (empty array if no risk detected) */
	riskSignals: RiskSignal[];
	/** Count of violations detected in current session */
	violationCount: number;
}

/**
 * A single risk signal from the local service.
 */
export interface RiskSignal {
	/** Risk severity */
	level: "low" | "medium" | "high" | "critical";
	/** Human-readable description */
	description: string;
	/** File associated with this signal (if applicable) */
	filePath?: string;
}

// =============================================================================
// SESSION SUMMARY
// =============================================================================

/**
 * Current session state projected from the local service.
 *
 * Provides a high-level summary of the active session.
 * Tree views and status bar consume this for session-related UI.
 */
export interface SessionSummary {
	/** Whether a session is currently active */
	active: boolean;
	/** Session task ID (if active) */
	taskId?: string;
	/** Task description (if active) */
	task?: string;
	/** Session start time (if active) */
	startedAt?: Date;
	/** Number of files modified in this session */
	filesModified: number;
	/** Number of snapshots created in this session */
	snapshotCount: number;
	/** Total snapshots across all recent sessions */
	totalRecentSnapshots: number;
	/** Duration of current session in seconds (0 if no active session) */
	durationSeconds: number;
}

// =============================================================================
// INTELLIGENCE SIGNALS
// =============================================================================

/**
 * Intelligence signals projected from the local service.
 *
 * Minimal initial subset for v1 surfaces. Intelligence service is Phase 2,
 * so these fields start empty/zero and populate as the service ships more features.
 *
 * @remarks
 * Tree views display these as counts/summaries.
 * Webview activity feed shows individual signal events (Phase 2).
 */
export interface IntelligenceSignals {
	/** List of fragile files detected in workspace (paths relative to workspace root) */
	fragileFiles: string[];
	/** Count of risk events detected in current session */
	riskEventCount: number;
	/** Count of AI activity events detected in current session */
	aiActivityCount: number;
	/** Most recently detected AI tool (if any) */
	lastDetectedAITool?: string;
	/** Timestamp of last intelligence update */
	lastUpdated?: Date;
	/** Count of learnings captured in current session */
	learningCount: number;
}

// =============================================================================
// PROJECTION STORE STATE
// =============================================================================

/**
 * Complete projection state consumed by all UI surfaces.
 *
 * The ProjectionStore holds one instance of this, updated via
 * DaemonBridge events with 200-250ms coalescing.
 */
export interface ProjectionState {
	/** Daemon connection state */
	connection: DaemonConnectionState;
	/** Connection details (version, uptime, health) */
	connectionDetails: ConnectionDetails;
	/** Protection summary for the workspace */
	protection: ProtectionSummary;
	/** Current session summary */
	session: SessionSummary;
	/** Intelligence signals */
	intelligence: IntelligenceSignals;
}

/**
 * Keys of ProjectionState slices for granular change notification.
 *
 * Surfaces subscribe to specific slices to avoid unnecessary re-renders.
 * For example, the status bar subscribes to "connection" and "protection",
 * while the sessions tree subscribes only to "session".
 */
export type ProjectionSlice = keyof ProjectionState;

/**
 * Event fired when a projection slice changes.
 */
export interface ProjectionChangeEvent {
	/** Which slice(s) changed in this update */
	changed: ProjectionSlice[];
	/** The full updated state (consumers pick their slice) */
	state: Readonly<ProjectionState>;
}

// =============================================================================
// FACTORY / DEFAULTS
// =============================================================================

/**
 * Default/initial projection state.
 *
 * Used when ProjectionStore initializes before service connects.
 * All fields have safe empty/zero defaults for graceful UI rendering.
 */
export function createDefaultProjectionState(): ProjectionState {
	return {
		connection: "disconnected",
		connectionDetails: {
			consecutiveFailures: 0,
		},
		protection: {
			currentLevel: "none",
			protectedFileCount: 0,
			levelCounts: { watch: 0, warn: 0, block: 0 },
			riskSignals: [],
			violationCount: 0,
		},
		session: {
			active: false,
			filesModified: 0,
			snapshotCount: 0,
			totalRecentSnapshots: 0,
			durationSeconds: 0,
		},
		intelligence: {
			fragileFiles: [],
			riskEventCount: 0,
			aiActivityCount: 0,
			learningCount: 0,
		},
	};
}
