/**
 * Type-safe feature flag constants for VS Code Extension
 *
 * SYNCHRONIZED with @vreko/contracts/src/features.ts
 * Last synced: 2026-04-16
 *
 * IMPORTANT: Keep this in sync with contracts. VS Code uses the same
 * dot-notation flag names as the server for consistency.
 *
 * @module config/featureFlags
 */

/**
 * Re-export FeatureFlag type from contracts for consistency
 */
export type { FeatureFlag } from "@vreko/contracts";

/**
 * Feature flag constants - SYNCHRONIZED with @vreko/contracts
 *
 * These are organized by category and match the server-side definitions exactly.
 * All flags use dot-notation (e.g., "protection.enabled") to match contracts.
 */
export const FEATURE_FLAGS = {
	// Core protection features
	PROTECTION_ENABLED: "protection.enabled" as const,
	PROTECTION_AUTO_CHECKPOINT: "protection.auto_checkpoint" as const,
	PROTECTION_PRE_SAVE_HOOK: "protection.pre_save_hook" as const,

	// Risk analysis
	RISK_GUARDIAN_V2: "risk.guardian_v2" as const,
	RISK_DEPENDENCY_ANALYSIS: "risk.dependency_analysis" as const,
	RISK_DEEP_ANALYSIS: "risk.deep_analysis" as const,
	RISK_AI_DETECTION: "risk.ai_detection" as const,

	// Storage
	STORAGE_COMPRESSION: "storage.compression" as const,
	STORAGE_DEDUPLICATION: "storage.deduplication" as const,
	STORAGE_ENCRYPTION: "storage.encryption" as const,

	// UI/UX
	UI_CHAT_PARTICIPANT: "ui.chat_participant" as const,
	UI_STATUS_BAR: "ui.status_bar" as const,
	UI_TIMELINE_VIEW: "ui.timeline_view" as const,

	// Telemetry
	TELEMETRY_DETAILED_EVENTS: "telemetry.detailed_events" as const,
	TELEMETRY_PERFORMANCE_METRICS: "telemetry.performance_metrics" as const,
	TELEMETRY_SAMPLING_RATE: "telemetry.sampling_rate" as const,

	// Experimental
	EXPERIMENTAL_MCP_TOOLS: "experimental.mcp_tools" as const,
	EXPERIMENTAL_RECOVERY_MODE: "experimental.recovery_mode" as const,

	// Intelligence Layer (WU-4.1b)
	INTELLIGENCE_LAYER: "intelligence.layer" as const,
	INTELLIGENCE_TRUST_CALIBRATION: "intelligence.trust_calibration" as const,
	INTELLIGENCE_PATTERN_LIBRARY: "intelligence.pattern_library" as const,

	// A/B Testing - DeepScan
	DEEPSCAN_V2_ALGORITHM: "deepscan.v2_algorithm" as const,
	DEEPSCAN_ENHANCED_ANALYSIS: "deepscan.enhanced_analysis" as const,
	DEEPSCAN_REAL_TIME_PROCESSING: "deepscan.real_time_processing" as const,

	// Event System Migration
	EVENTS_EVENTEMITTER2: "events.eventemitter2" as const,
} as const;

/**
 * Extract the type of all possible feature flag values
 * This ensures compile-time checking when passing flags to FeatureManager
 */
export type FeatureFlagKey = (typeof FEATURE_FLAGS)[keyof typeof FEATURE_FLAGS];

/**
 * Helper function to ensure a string is a valid feature flag
 * Useful for dynamic flag lookups
 *
 * @param flag - The flag to validate
 * @returns True if the flag is valid
 */
export function isValidFeatureFlag(flag: string): flag is FeatureFlagKey {
	return Object.values(FEATURE_FLAGS).includes(flag as FeatureFlagKey);
}

/**
 * Get all feature flag keys
 * Useful for iterating over all available flags
 */
export function getAllFeatureFlagKeys(): readonly FeatureFlagKey[] {
	return Object.values(FEATURE_FLAGS);
}

/**
 * Get all feature flag keys for bootstrapping
 * Returns all flag names that should be pre-fetched on activation
 */
export function getBootstrapFlagKeys(): readonly FeatureFlagKey[] {
	// Core flags that affect UI rendering (should be fetched immediately)
	return [
		FEATURE_FLAGS.PROTECTION_ENABLED,
		FEATURE_FLAGS.RISK_AI_DETECTION,
		FEATURE_FLAGS.UI_CHAT_PARTICIPANT,
		FEATURE_FLAGS.UI_STATUS_BAR,
		FEATURE_FLAGS.UI_TIMELINE_VIEW,
		FEATURE_FLAGS.INTELLIGENCE_LAYER,
		FEATURE_FLAGS.EXPERIMENTAL_MCP_TOOLS,
	];
}
