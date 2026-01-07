/**
 * Unified Onboarding State Machine - Migration Logic
 *
 * Migrates from legacy systems to unified state.
 * Sources:
 * - OnboardingProgression (snapback:onboarding-state)
 * - MilestoneService (snapback.milestones.*, snapback.events.*)
 * - Scattered globalState flags
 */

import type * as vscode from "vscode";
import { logger } from "../../utils/logger";
import type { LegacyOnboardingState, OnboardingState, UnifiedOnboardingState } from "./types";

/**
 * Storage keys for migration
 */
export const STORAGE_KEYS = {
	// New unified key
	UNIFIED: "snapback.onboarding.unified",

	// Legacy OnboardingProgression
	LEGACY_PROGRESSION: "snapback:onboarding-state",

	// Legacy MilestoneService
	SNAPSHOT_COUNT: "snapback.milestones.snapshotCount",
	TOTAL_FILES_PROTECTED: "snapback.milestones.totalFilesProtected",
	TOTAL_RECOVERIES: "snapback.milestones.totalRecoveries",
	FIRST_SNAPSHOT_CREATED: "snapback.events.first_snapshot_created",

	// Legacy scattered flags
	MCP_CONFIGURED: "mcp.configured",
	HAS_AUTHENTICATED: "snapback.hasAuthenticated",
	WELCOME_SHOWN: "snapback.progressiveDisclosure.welcomeShown",
} as const;

/**
 * Migrate legacy state to unified state
 * Called on first load or when unified state doesn't exist
 */
export async function migrateToUnifiedState(globalState: vscode.Memento): Promise<UnifiedOnboardingState> {
	// Check if already migrated
	const existing = globalState.get<UnifiedOnboardingState>(STORAGE_KEYS.UNIFIED);
	if (existing) {
		logger.debug("Unified onboarding state already exists, skipping migration");
		return existing;
	}

	logger.info("Migrating to unified onboarding state");

	// Read from all legacy sources with explicit fallbacks for robustness
	const legacyProgression = globalState.get<LegacyOnboardingState>(STORAGE_KEYS.LEGACY_PROGRESSION);
	const legacySnapshotCount = globalState.get<number>(STORAGE_KEYS.SNAPSHOT_COUNT) ?? 0;
	const legacyFirstSnapshot = globalState.get<boolean>(STORAGE_KEYS.FIRST_SNAPSHOT_CREATED) ?? false;
	const legacyFilesProtected = globalState.get<number>(STORAGE_KEYS.TOTAL_FILES_PROTECTED) ?? 0;
	const legacyRecoveries = globalState.get<number>(STORAGE_KEYS.TOTAL_RECOVERIES) ?? 0;
	const legacyMcpConfigured = globalState.get<boolean>(STORAGE_KEYS.MCP_CONFIGURED) ?? false;
	const legacyHasAuth = globalState.get<boolean>(STORAGE_KEYS.HAS_AUTHENTICATED) ?? false;
	const legacyWelcomeShown = globalState.get<boolean>(STORAGE_KEYS.WELCOME_SHOWN) ?? false;

	// Check if this is a fresh install (no legacy data at all)
	const hasLegacyData =
		legacyProgression !== undefined || legacySnapshotCount > 0 || legacyFirstSnapshot || legacyFilesProtected > 0;

	if (!hasLegacyData) {
		// Fresh install - use default state
		logger.info("No legacy data found, creating default state");
		const defaultState = createDefaultState();
		await globalState.update(STORAGE_KEYS.UNIFIED, defaultState);
		return defaultState;
	}

	// Determine current state from legacy data
	const state: OnboardingState = determineStateFromLegacy(
		legacySnapshotCount,
		legacyFirstSnapshot,
		legacyProgression,
	);

	// Build unified state from legacy data
	const snapshotsCreated = Math.max(legacySnapshotCount, legacyProgression?.snapshotsCreated ?? 0);

	const unifiedState: UnifiedOnboardingState = {
		state,
		stateEnteredAt: Date.now(),
		metrics: {
			snapshotsCreated,
			filesProtected: legacyFilesProtected,
			recoveries: legacyRecoveries,
		},
		timestamps: {
			installedAt: legacyProgression?.extensionActivatedAt ?? Date.now(),
			firstSnapshotAt:
				legacyFirstSnapshot || legacySnapshotCount > 0
					? (legacyProgression?.firstProtectedAt ?? Date.now())
					: null,
			firstRecoveryAt: legacyRecoveries > 0 ? Date.now() : null,
			engagedAt: snapshotsCreated >= 10 ? Date.now() : null,
			convertedAt: null,
		},
		flags: {
			mcpConfigured: legacyMcpConfigured,
			aiDetected: false, // Will be set on first detection
			pioneerJoined: false,
			welcomeShown: legacyWelcomeShown,
			hasAuthenticated: legacyHasAuth,
		},
	};

	// Save unified state
	await globalState.update(STORAGE_KEYS.UNIFIED, unifiedState);

	// Log migration for telemetry
	logger.info("Migrated to unified state machine", {
		state,
		snapshotsCreated: unifiedState.metrics.snapshotsCreated,
		filesProtected: unifiedState.metrics.filesProtected,
	});

	return unifiedState;
}

/**
 * Determine state from legacy data
 */
function determineStateFromLegacy(
	snapshotCount: number,
	firstSnapshot: boolean,
	progression?: LegacyOnboardingState,
): OnboardingState {
	// Check for engagement (10+ snapshots)
	if (snapshotCount >= 10) {
		return "engaged";
	}

	// Check for first value (1+ snapshots)
	if (firstSnapshot || snapshotCount > 0 || (progression && progression.snapshotsCreated > 0)) {
		return "value_demonstrated";
	}

	// Default to protecting (extension is already installed)
	return "protecting";
}

/**
 * Create default unified state for new installations
 */
export function createDefaultState(): UnifiedOnboardingState {
	return {
		state: "protecting",
		stateEnteredAt: Date.now(),
		metrics: {
			snapshotsCreated: 0,
			filesProtected: 0,
			recoveries: 0,
		},
		timestamps: {
			installedAt: Date.now(),
			firstSnapshotAt: null,
			firstRecoveryAt: null,
			engagedAt: null,
			convertedAt: null,
		},
		flags: {
			mcpConfigured: false,
			aiDetected: false,
			pioneerJoined: false,
			welcomeShown: false,
			hasAuthenticated: false,
		},
	};
}

/**
 * Clean up legacy storage keys after successful migration
 * Call this after 2-3 release cycles to ensure all users have migrated
 */
export async function cleanupLegacyKeys(globalState: vscode.Memento): Promise<void> {
	logger.info("Cleaning up legacy onboarding storage keys");

	const keysToCleanup = [
		STORAGE_KEYS.LEGACY_PROGRESSION,
		STORAGE_KEYS.SNAPSHOT_COUNT,
		STORAGE_KEYS.TOTAL_FILES_PROTECTED,
		STORAGE_KEYS.TOTAL_RECOVERIES,
		STORAGE_KEYS.FIRST_SNAPSHOT_CREATED,
		// Don't clean up MCP_CONFIGURED, HAS_AUTHENTICATED, WELCOME_SHOWN
		// as they may be used by other systems
	];

	for (const key of keysToCleanup) {
		await globalState.update(key, undefined);
	}

	logger.info("Legacy keys cleaned up successfully");
}
