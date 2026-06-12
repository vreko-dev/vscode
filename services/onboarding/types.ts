/**
 * Unified Onboarding State Machine - Type Definitions
 *
 * Single source of truth for user progression tracking.
 * Replaces both OnboardingProgression and MilestoneService.
 *
 * Philosophy: "Invisible until needed, celebrate when beneficial"
 *
 * State Flow:
 * not_installed → installing → protecting → value_demonstrated → engaged → converted
 */

/**
 * Core onboarding states representing user progression
 */
export type OnboardingState =
	| "not_installed" // Pre-installation (theoretical)
	| "installing" // Activation in progress
	| "protecting" // Active, no value demonstrated yet
	| "value_demonstrated" // First snapshot created (Celebration #2)
	| "engaged" // 10+ snapshots, Pioneer eligible (Celebration #3)
	| "converted"; // Pro subscriber

/**
 * Events that trigger state transitions
 */
export type OnboardingEvent =
	| { type: "EXTENSION_ACTIVATED" }
	| { type: "SNAPSHOT_CREATED" }
	| { type: "FILE_PROTECTED"; count: number }
	| { type: "RECOVERY_PERFORMED" }
	| { type: "AI_DETECTED"; tool: string }
	| { type: "MCP_CONFIGURED"; clients: string[] }
	| { type: "PIONEER_JOINED" }
	| { type: "SUBSCRIPTION_STARTED" };

/**
 * Unified state shape - single source of truth
 */
export interface UnifiedOnboardingState {
	// Core state
	state: OnboardingState;
	stateEnteredAt: number; // Timestamp for funnel analytics

	// Metrics (single source of truth)
	metrics: {
		snapshotsCreated: number;
		filesProtected: number;
		recoveries: number;
	};

	// Timestamps for key moments
	timestamps: {
		installedAt: number;
		firstSnapshotAt: number | null;
		firstRecoveryAt: number | null;
		engagedAt: number | null; // When reached 10 snapshots
		convertedAt: number | null;
	};

	// Feature flags (replaces scattered globalState)
	flags: {
		mcpConfigured: boolean;
		aiDetected: boolean;
		pioneerJoined: boolean;
		welcomeShown: boolean;
		hasAuthenticated: boolean;
	};
}

/**
 * Celebration types aligned with state transitions
 */
export type CelebrationType = "ai_detected" | "first_snapshot" | "engaged";

/**
 * Celebration configuration
 */
export interface CelebrationConfig {
	message: string;
	detail?: string;
	telemetry: string;
	action?: {
		title: string;
		command: string;
	};
}

/**
 * State transition result
 */
export interface TransitionResult {
	previousState: OnboardingState;
	newState: OnboardingState;
	shouldCelebrate: boolean;
	celebrationType?: CelebrationType;
	timeInPreviousState: number;
}

/**
 * Legacy OnboardingProgression state (for migration)
 */
export interface LegacyOnboardingState {
	currentPhase: number;
	snapshotsCreated: number;
	hasRestored: boolean;
	hasProtectedFiles: boolean;
	hasUsedBulkProtection: boolean;
	extensionActivatedAt: number;
	firstProtectedAt: number;
}
