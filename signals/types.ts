/**
 * Signal Communication Types
 *
 * Type definitions for the Signal Communication Specification v2.0.
 * Provides typed event bus, SignalState interfaces, and notification types.
 *
 * @module signals/types
 * @see docs/plans/vreko_signal_communicaton.md
 */

import type * as vscode from "vscode";

// =============================================================================
// Disclosure Tiers
// =============================================================================

/**
 * User disclosure tier based on lifetime snapshot count
 * - new: < 5 snapshots (first-time user experience)
 * - active: 5-49 snapshots (regular user)
 * - power: 50+ snapshots (power user)
 */
export type DisclosureTier = "new" | "active" | "power";

// =============================================================================
// User Info
// =============================================================================

/**
 * Subscription tier from authentication
 */
export type SubscriptionTier = "free" | "pro" | "team" | "enterprise";

/**
 * User account information for display in status bar tooltip
 */
export interface UserInfo {
	/** Display username */
	username: string;
	/** Subscription tier */
	subscriptionTier: SubscriptionTier;
	/** Whether user is a Pioneer program participant */
	isPioneer?: boolean;
}

// =============================================================================
// Status Flags
// =============================================================================

/**
 * Status flag definition for flag-map based status bar
 */
export interface StatusFlag {
	/** Priority - higher wins */
	priority: number;
	/** Status bar text (2-4 words max) */
	text: string;
	/** VS Code codicon */
	codicon: string;
	/** Optional tooltip override for first line */
	tooltipOverride?: string;
	/** Expiry timestamp (undefined = persistent) */
	expiresAt?: number;
	/** Optional status bar background color for setup gate flags */
	background?: "statusBarItem.warningBackground" | "statusBarItem.errorBackground";
	/** VS Code command ID to execute on status bar click */
	command?: string;
}

/**
 * Flag keys for type-safe flag management
 */
export type StatusFlagKey =
	| "idle"
	| "checkpoint"
	| "ai_session"
	| "agent_active"
	| "pattern"
	| "elevated"
	| "recovery"
	| "degraded"
	| "disconnected"
	| "recommendation"
	| "vitals"
	// Setup gates
	| "CLI_NOT_INSTALLED"
	| "DAEMON_NOT_RUNNING"
	| "NOT_AUTHENTICATED"
	| "WORKSPACE_NOT_INIT"
	| "MCP_NOT_CONFIGURED";

// =============================================================================
// Signal Events (Typed Event Bus)
// =============================================================================

/**
 * Discriminated union of all Vreko signal events
 * Fired from DaemonBridge when IPC notifications arrive
 */
export type VrekoSignalEvent =
	| { type: "snapshot.created"; data: SnapshotCreatedEventData }
	| { type: "snapshot.restored"; data: SnapshotRestoredEventData }
	| { type: "session.started"; data: SessionStartedEventData }
	| { type: "session.ended"; data: SessionEndedEventData }
	| { type: "intelligence.capture"; data: IntelligenceCaptureEventData }
	| { type: "risk.updated"; data: RiskUpdatedEventData }
	| { type: "risk.fragile-detected"; data: RiskFragileDetectedEventData }
	| { type: "learning.added"; data: LearningAddedEventData }
	| { type: "learning.promoted"; data: LearningPromotedEventData }
	| { type: "learning.pruned"; data: LearningPrunedEventData }
	| { type: "momentum.score-updated"; data: MomentumScoreUpdatedEventData }
	| { type: "watch.file-changed"; data: WatchFileChangedEventData }
	| { type: "daemon.started"; data: Record<string, never> }
	| { type: "daemon.shutdown"; data: DaemonShutdownEventData }
	// Health monitoring events (SB-HEALTH-001)
	| { type: "health.degraded"; data: HealthDegradedEventData }
	| { type: "health.recovered"; data: HealthRecoveredEventData }
	| { type: "protection.changed"; data: ProtectionChangedEventData }
	| { type: "violation.reported"; data: ViolationReportedEventData }
	| { type: "sync.completed"; data: SyncCompletedEventData }
	| { type: "sync.failed"; data: SyncFailedEventData }
	| { type: "workspace.health"; data: WorkspaceHealthEventData }
	| { type: "guard.changed"; data: GuardChangedEventData };

export interface SnapshotCreatedEventData {
	id: string;
	name: string;
	fileCount?: number;
	aiAttributed: boolean;
}

export interface SnapshotRestoredEventData {
	id: string;
	name: string;
	fileCount: number;
	lineCount: number;
	aiTool?: string;
}

export interface SessionStartedEventData {
	taskId: string;
	sessionName: string;
	learningCount?: number;
	fragileCount?: number;
}

export interface SessionEndedEventData {
	taskId: string;
	sessionName?: string;
	duration?: number;
}

export interface IntelligenceCaptureEventData {
	actor: {
		type: string;
		tool?: string;
		confidence?: number;
	};
	pathHash: string;
}

export interface RiskUpdatedEventData {
	previousLevel?: string;
	newLevel?: string;
	reason?: string;
	affectedFiles?: string[];
}

export interface RiskFragileDetectedEventData {
	file: string;
	reason: string;
	observationCount?: number;
}

export interface LearningAddedEventData {
	id: string;
	type: string;
	content: string;
	tier?: string;
}

export interface LearningPromotedEventData {
	id: string;
	type: string;
	content: string;
	fromTier?: string;
	toTier?: string;
	confidence?: number;
}

export interface LearningPrunedEventData {
	id: string;
}

export interface MomentumScoreUpdatedEventData {
	score: number;
	milestone?: string;
}

export interface WatchFileChangedEventData {
	file: string;
	changeType: string;
}

export interface DaemonShutdownEventData {
	reason?: string;
}

// =============================================================================
// Health Monitoring Event Data (SB-HEALTH-001)
// =============================================================================

/**
 * Component health degradation event
 * Fired when a monitored component misses health checks
 */
export interface HealthDegradedEventData {
	/** Process ID of the degraded component */
	pid: number;
	/** Component type: 'daemon' | 'supervisor' | 'mcp' */
	componentType: string;
	/** Workspace path where degradation occurred */
	workspace: string;
	/** Time elapsed since last successful health check (ms) */
	elapsed: number;
	/** Event timestamp */
	timestamp: number;
}

/**
 * Component health recovery event
 * Fired when a previously degraded component recovers
 */
export interface HealthRecoveredEventData {
	/** Process ID of the recovered component */
	pid: number;
	/** Component type: 'daemon' | 'supervisor' | 'mcp' */
	componentType: string;
	/** Workspace path where recovery occurred */
	workspace: string;
	/** Number of missed health checks before recovery */
	previousMissed: number;
	/** Event timestamp */
	timestamp: number;
}

/**
 * File protection level change event
 */
export interface ProtectionChangedEventData {
	/** File path */
	file: string;
	/** New protection level */
	level: "none" | "low" | "medium" | "high" | "critical";
	/** Previous protection level */
	previousLevel: "none" | "low" | "medium" | "high" | "critical";
}

/**
 * Violation reported event
 * Tracks pattern violations for learning system
 */
export interface ViolationReportedEventData {
	/** Violation type identifier */
	violationType: string;
	/** File where violation occurred */
	file: string;
	/** Human-readable violation message */
	message: string;
}

/**
 * Sync completed successfully event
 */
export interface SyncCompletedEventData {
	/** Whether sync was successful */
	success: true;
	/** Optional sync details */
	details?: string;
}

/**
 * Sync failed event
 */
export interface SyncFailedEventData {
	/** Error message */
	error: string;
	/** Whether retry is possible */
	retryable: boolean;
}

/**
 * Workspace health status event
 */
export interface WorkspaceHealthEventData {
	/** Workspace root path */
	workspacePath: string;
	/** Health score 0-100 */
	healthScore: number;
	/** Array of health issues */
	issues: Array<{
		type: string;
		severity: "info" | "warning" | "error";
		message: string;
	}>;
}

/**
 * Guard status change event (SB-HEALTH-001)
 * Fired when health guards change state (pass/warn/fail)
 */
export interface GuardChangedEventData {
	/** Guards that changed state */
	changed: Array<{
		name: string;
		previousState: "pass" | "warn" | "fail";
		currentState: "pass" | "warn" | "fail";
	}>;
	/** Current state of all guards */
	current: Array<{
		name: string;
		state: "pass" | "warn" | "fail";
	}>;
	/** Event timestamp */
	timestamp: number;
}

// =============================================================================
// Ring Buffer
// =============================================================================

/**
 * Ring buffer entry for recent events
 */
export interface RingBufferEntry {
	description: string;
	timestamp: number;
}

// =============================================================================
// Milestones
// =============================================================================

/**
 * Onboarding milestone tracking
 */
export interface MilestoneState {
	firstSnapshotShown: boolean;
	firstAIDetectionShown: boolean;
	tenthSnapshotShown: boolean;
	firstFragileShown: boolean;
	firstClosingCeremonyShown: boolean;
	/** User permanently dismissed the largeRiskyChange toast */
	largeRiskyDismissed: boolean;
}

// =============================================================================
// Session Review (Closing Ceremony)
// =============================================================================

/**
 * Session review data from daemon's session/review RPC
 */
export interface SessionReview {
	sessionId: string;
	sessionName: string;
	duration: number;
	snapshotCount: number;
	fileCount: number;
	aiDetected: boolean;
	aiTools: Array<{
		tool: string;
		confidence: number;
		editCount: number;
	}>;
	learningsAdded: number;
	learningsApplied: number;
	patternsReinforced: number;
	fragileFilesTouched: number;
	tokenSavingsEstimate: number;
	pitfallsAvoided: number;
	summary: string;
}

// =============================================================================
// Notifications
// =============================================================================

/**
 * Notification priorities (higher = more important)
 */
export const NOTIFICATION_PRIORITY = {
	CLOSING_CEREMONY: 50,
	CRITICAL_UPDATE: 60,
	RECOVERY: 70,
	DEGRADATION: 80,
	MILESTONE_AI: 30,
	MILESTONE_FRAGILE: 30,
} as const;

export type NotificationPriorityKey = keyof typeof NOTIFICATION_PRIORITY;

/**
 * Pattern promotion copy configuration
 */
export interface PatternCopyConfig {
	text: string;
	codicon: string;
	tooltip: (data: LearningPromotedEventData) => string;
}

// =============================================================================
// File Decorations
// =============================================================================

/**
 * File decoration types for explorer
 */
export type FileDecorationType = "warm" | "hot" | "ai-modified" | "fragile" | "ai-hot";

export interface FileDecorationState {
	changeCounts: Map<string, number>;
	aiModifiedFiles: Set<string>;
	fragileFiles: Map<string, string>;
}

// =============================================================================
// Event Bus
// =============================================================================

/**
 * Signal event bus interface
 */
export interface ISignalEventBus {
	readonly event: vscode.Event<VrekoSignalEvent>;
	fire(event: VrekoSignalEvent): void;
	dispose(): void;
}
