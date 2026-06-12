/**
 * Recovery Test Fixtures (TDD GREEN Phase)
 * Provides realistic test data for recovery service testing
 */

import type {
	RecoverySnapshot,
	SessionStats,
} from "../../src/services/recovery/interfaces";

/**
 * Mock recovery snapshots with diverse characteristics for testing
 * Includes different trigger types, file counts, and metadata
 */
export const mockRecoverySnapshots: RecoverySnapshot[] = [
	{
		id: "snap-1738182000000-abc123",
		timestamp: 1738182000000, // ~Jan 29, 2025 17:00:00
		name: "Pre-refactor checkpoint",
		anchorFile: "src/services/recovery/RecoveryService.ts",
		files: [
			{
				path: "src/services/recovery/RecoveryService.ts",
				size: 4096,
			},
			{
				path: "src/services/recovery/interfaces.ts",
				size: 2048,
			},
			{
				path: "test/unit/recovery/RecoveryService.test.ts",
				size: 8192,
			},
		],
		totalSize: 14336,
		trigger: "manual",
		metadata: {
			riskScore: 35,
			sessionId: "session-abc123",
		},
	},
	{
		id: "snap-1738181400000-def456",
		timestamp: 1738181400000, // 10 minutes earlier
		name: "Auto-checkpoint during refactor",
		anchorFile: "src/providers/RecoveryTimelineProvider.ts",
		files: [
			{
				path: "src/providers/RecoveryTimelineProvider.ts",
				size: 5120,
			},
			{
				path: "src/ui/recovery/RecoveryTreeItem.ts",
				size: 3072,
			},
		],
		totalSize: 8192,
		trigger: "auto",
		metadata: {
			riskScore: 45,
			sessionId: "session-abc123",
		},
	},
	{
		id: "snap-1738180800000-ghi789",
		timestamp: 1738180800000, // 20 minutes earlier
		name: "AI-detected risk point",
		anchorFile: "src/services/recovery/RecoveryService.ts",
		files: [
			{
				path: "src/services/recovery/RecoveryService.ts",
				size: 3584,
			},
			{
				path: "src/services/recovery/SessionStatsProvider.ts",
				size: 2560,
			},
		],
		totalSize: 6144,
		trigger: "ai-detection",
		metadata: {
			riskScore: 68,
			sessionId: "session-abc123",
			aiTool: "cursor",
		},
	},
	{
		id: "snap-1738180200000-jkl012",
		timestamp: 1738180200000, // 30 minutes earlier
		name: "Pre-rollback safety checkpoint",
		anchorFile: "src/ui/StatusBarManager.ts",
		files: [
			{
				path: "src/ui/StatusBarManager.ts",
				size: 6144,
			},
			{
				path: "src/ui/ux-types.ts",
				size: 1536,
			},
		],
		totalSize: 7680,
		trigger: "pre-rollback",
		metadata: {
			riskScore: 52,
			sessionId: "session-abc123",
		},
	},
	{
		id: "snap-1738179600000-mno345",
		timestamp: 1738179600000, // 40 minutes earlier
		name: "Manual checkpoint - feature complete",
		anchorFile: "src/commands/recoveryCommands.ts",
		files: [
			{
				path: "src/commands/recoveryCommands.ts",
				size: 4608,
			},
			{
				path: "src/providers/QuickActionsProvider.ts",
				size: 3584,
			},
			{
				path: "test/unit/commands/recoveryCommands.test.ts",
				size: 7168,
			},
		],
		totalSize: 15360,
		trigger: "manual",
		metadata: {
			riskScore: 28,
			sessionId: "session-abc123",
		},
	},
	{
		id: "snap-1738179000000-pqr678",
		timestamp: 1738179000000, // 50 minutes earlier
		name: "Auto-checkpoint - high activity",
		anchorFile: "src/services/WorkspaceDataService.ts",
		files: [
			{
				path: "src/services/WorkspaceDataService.ts",
				size: 7680,
			},
			{
				path: "src/telemetry/core-event-tracker.ts",
				size: 4096,
			},
		],
		totalSize: 11776,
		trigger: "auto",
		metadata: {
			riskScore: 42,
			sessionId: "session-abc123",
		},
	},
	{
		id: "snap-1738178400000-stu901",
		timestamp: 1738178400000, // 60 minutes earlier (1 hour ago)
		name: "Session start checkpoint",
		anchorFile: "src/extension.ts",
		files: [
			{
				path: "src/extension.ts",
				size: 8192,
			},
		],
		totalSize: 8192,
		trigger: "manual",
		metadata: {
			riskScore: 15,
			sessionId: "session-abc123",
		},
	},
];

/**
 * Mock session statistics representing a realistic coding session
 * Duration: ~1 hour, moderate activity level
 */
export const mockSessionStats: SessionStats = {
	duration: 3600000, // 1 hour in milliseconds
	snapshotCount: 7, // Matches mockRecoverySnapshots length
	filesModified: 12, // Realistic file count
	linesChanged: 487, // Moderate refactoring session
	tokensEstimated: 8500, // Estimated tokens for the changes
};

/**
 * Alternative session stats fixture - high activity session
 */
export const mockSessionStatsHighActivity: SessionStats = {
	duration: 7200000, // 2 hours
	snapshotCount: 15,
	filesModified: 28,
	linesChanged: 1247,
	tokensEstimated: 18500,
};

/**
 * Alternative session stats fixture - low activity session (just started)
 */
export const mockSessionStatsLowActivity: SessionStats = {
	duration: 600000, // 10 minutes
	snapshotCount: 2,
	filesModified: 3,
	linesChanged: 85,
	tokensEstimated: 1200,
};

/**
 * Helper to create a custom recovery snapshot for specific test scenarios
 */
export function createMockSnapshot(
	overrides: Partial<RecoverySnapshot>,
): RecoverySnapshot {
	return {
		id: `snap-${Date.now()}-${Math.random().toString(36).substring(7)}`,
		timestamp: Date.now(),
		name: "Test checkpoint",
		anchorFile: "test/file.ts",
		files: [{ path: "test/file.ts", size: 1024 }],
		totalSize: 1024,
		trigger: "manual",
		...overrides,
	};
}

/**
 * Helper to create custom session stats for specific test scenarios
 */
export function createMockSessionStats(
	overrides: Partial<SessionStats>,
): SessionStats {
	return {
		duration: 0,
		snapshotCount: 0,
		filesModified: 0,
		linesChanged: 0,
		tokensEstimated: 0,
		...overrides,
	};
}
