/**
 * @fileoverview Recovery Service Interfaces - Core contracts for recovery timeline
 *
 * These interfaces define the contracts for the new "invisible until needed" recovery UI.
 * All implementations MUST delegate to existing infrastructure:
 * - IStorageManager for snapshot operations
 * - WorkspaceDataService for statistics
 * - OperationCoordinator for all daemon interactions
 *
 * Design Principles:
 * - Interface-first development (Phase 0.1)
 * - No bypass of daemon (always use OperationCoordinator)
 * - Reuse existing types (SnapshotManifestV2, SessionManifest)
 * - Event-driven updates (VS Code Event pattern)
 *
 * @packageDocumentation
 */

import type * as vscode from "vscode";

// =============================================================================
// RecoverySnapshot - Simplified snapshot type for recovery timeline
// =============================================================================

/**
 * Simplified snapshot representation for recovery timeline UI.
 * Maps from SnapshotManifestV2 and UnifiedSnapshot with only fields needed for display.
 *
 * **Design Note**: This is NOT a replacement for SnapshotManifestV2.
 * It's a view model for the recovery timeline TreeView.
 *
 * @example
 * ```typescript
 * const snapshot: RecoverySnapshot = {
 *   id: "snap-1705234567890-abc",
 *   timestamp: 1705234567890,
 *   name: "Pre-refactor checkpoint",
 *   anchorFile: "src/services/recovery.ts",
 *   files: [
 *     { path: "src/services/recovery.ts", size: 1024 },
 *     { path: "src/services/types.ts", size: 512 }
 *   ],
 *   totalSize: 1536,
 *   trigger: "manual",
 *   metadata: {
 *     riskScore: 0.85,
 *     sessionId: "session-123",
 *     aiTool: "copilot"
 *   }
 * };
 * ```
 */
export interface RecoverySnapshot {
	/** Unique snapshot ID (snap-{timestamp}-{random}) */
	id: string;

	/** Creation timestamp (Unix ms) */
	timestamp: number;

	/** Human-readable name */
	name: string;

	/** Primary file that triggered this snapshot */
	anchorFile: string;

	/** Files included in snapshot */
	files: Array<{
		/** Relative path from workspace root */
		path: string;
		/** File size in bytes */
		size: number;
	}>;

	/** Total size of all files in bytes */
	totalSize: number;

	/** How was this snapshot triggered */
	trigger: "manual" | "auto" | "ai-detection" | "pre-rollback";

	/** Optional metadata */
	metadata?: {
		/** Risk score 0-1 (higher = more risky change) */
		riskScore?: number;
		/** Vreko session ID */
		sessionId?: string;
		/** AI tool that was detected (if trigger === "ai-detection") */
		aiTool?: string;
	};
}

// =============================================================================
// SnapshotFilter - Query parameters for snapshot retrieval
// =============================================================================

/**
 * Filter options for querying snapshots.
 * Maps to existing SnapshotFilters and SnapshotFiltersV2.
 *
 * @example
 * ```typescript
 * // Get manual snapshots from last 24 hours
 * const filter: SnapshotFilter = {
 *   after: Date.now() - 86400000,
 *   trigger: "manual",
 *   limit: 20
 * };
 * ```
 */
export interface SnapshotFilter {
	/** Only snapshots after this timestamp (Unix ms) */
	after?: number;

	/** Only snapshots before this timestamp (Unix ms) */
	before?: number;

	/** Filter by trigger type */
	trigger?: RecoverySnapshot["trigger"];

	/** Maximum number of results */
	limit?: number;
}

// =============================================================================
// IRecoveryService - Main recovery operations interface
// =============================================================================

/**
 * Recovery service interface for snapshot operations.
 *
 * **Implementation Requirements**:
 * - MUST delegate to IStorageManager for data access
 * - MUST use OperationCoordinator for restore operations
 * - NEVER bypass daemon brain (no local file operations)
 * - Fire onSnapshotCreated when daemon emits snapshot.created event
 *
 * **Existing Infrastructure**:
 * - `IStorageManager.listSnapshots()` → maps to `getRecent()` and `getAll()`
 * - `IStorageManager.restoreSnapshot()` → delegate from `restore()`
 * - `DaemonBridge.onSnapshotCreated` → forward to `onSnapshotCreated`
 *
 * @example
 * ```typescript
 * class RecoveryService implements IRecoveryService {
 *   constructor(
 *     private storageManager: IStorageManager,
 *     private coordinator: OperationCoordinator
 * *   ) {}
 *
 *   async getRecent(limit: number): Promise<RecoverySnapshot[]> {
 *     const manifests = await this.storageManager.listSnapshots({ limit });
 *     return manifests.map(m => this.toRecoverySnapshot(m));
 *   }
 *
 *   async restore(snapshotId: string, filePath: string): Promise<void> {
 *     // ALWAYS use coordinator - never bypass daemon
 *     await this.coordinator.restoreSnapshot(snapshotId, [filePath]);
 *   }
 * }
 * ```
 */
export interface IRecoveryService {
	/**
	 * Get recent snapshots (most recent first).
	 *
	 * @param limit - Maximum number of snapshots to return
	 * @returns Array of recovery snapshots sorted by timestamp descending
	 *
	 * @example
	 * ```typescript
	 * // Get 10 most recent snapshots for quick actions panel
	 * const recent = await recoveryService.getRecent(10);
	 * ```
	 */
	getRecent(limit: number): Promise<RecoverySnapshot[]>;

	/**
	 * Get all snapshots matching filter.
	 *
	 * @param filter - Optional filter criteria
	 * @returns Array of recovery snapshots matching filter
	 *
	 * @example
	 * ```typescript
	 * // Get all manual snapshots from last week
	 * const snapshots = await recoveryService.getAll({
	 *   after: Date.now() - 7 * 86400000,
	 *   trigger: "manual"
	 * });
	 * ```
	 */
	getAll(filter?: SnapshotFilter): Promise<RecoverySnapshot[]>;

	/**
	 * Restore a specific file from a snapshot.
	 *
	 * **CRITICAL**: MUST use OperationCoordinator.restoreSnapshot().
	 * NEVER bypass daemon brain with local file operations.
	 *
	 * @param snapshotId - Snapshot ID to restore from
	 * @param filePath - Relative path of file to restore
	 * @returns Promise that resolves when restore completes
	 *
	 * @example
	 * ```typescript
	 * // Restore single file from snapshot
	 * await recoveryService.restore(
	 *   "snap-1705234567890-abc",
	 *   "src/services/recovery.ts"
	 * );
	 * ```
	 */
	restore(snapshotId: string, filePath: string): Promise<void>;

	/**
	 * Batch restore multiple files from snapshots.
	 * Used by "Restore All Recent" command.
	 *
	 * @param snapshots - Array of snapshots to restore
	 * @returns Promise that resolves when all restores complete
	 *
	 * @example
	 * ```typescript
	 * const recentSnapshots = await recoveryService.getRecent(10);
	 * await recoveryService.restoreBatch(recentSnapshots);
	 * ```
	 */
	restoreBatch(snapshots: RecoverySnapshot[]): Promise<void>;

	/**
	 * Event fired when new snapshot is created.
	 * TreeView should listen to this to refresh the timeline.
	 *
	 * @example
	 * ```typescript
	 * recoveryService.onSnapshotCreated(snapshot => {
	 *   treeProvider.refresh();
	 * });
	 * ```
	 */
	onSnapshotCreated: vscode.Event<RecoverySnapshot>;
}

// =============================================================================
// SessionStats - Current session statistics
// =============================================================================

/**
 * Statistics for the current Vreko session.
 * Used in Quick Actions panel to show session progress.
 *
 * **Data Sources**:
 * - `WorkspaceDataService.getDashboardStats()` → snapshotCount, linesChanged, tokensEstimated
 * - Session start time → duration calculation
 * - Modified files tracking → filesModified
 *
 * @example
 * ```typescript
 * const stats: SessionStats = {
 *   duration: 7800000,      // 2h 10min in milliseconds
 *   snapshotCount: 47,       // Total snapshots this session
 *   filesModified: 12,       // Unique files modified
 *   linesChanged: 342,       // Total lines added/deleted
 *   tokensEstimated: 8500    // Estimated tokens processed
 * };
 *
 * // Display in Quick Actions panel:
 * // "Session: 2h 10m • 47 snapshots • 12 files"
 * ```
 */
export interface SessionStats {
	/** Session duration in milliseconds */
	duration: number;

	/** Total snapshots created this session */
	snapshotCount: number;

	/** Number of unique files modified */
	filesModified: number;

	/** Total lines added + deleted */
	linesChanged: number;

	/** Estimated tokens saved/processed */
	tokensEstimated: number;
}

// =============================================================================
// ISessionStatsProvider - Session statistics provider
// =============================================================================

/**
 * Session statistics provider for Quick Actions panel.
 *
 * **Implementation Requirements**:
 * - MUST wrap WorkspaceDataService.getDashboardStats()
 * - Calculate duration from session start timestamp
 * - Aggregate modified files from session tracking
 * - Fire onStatsChanged when any stat changes
 *
 * **Existing Infrastructure**:
 * - `WorkspaceDataService.getDashboardStats()` → provides base stats
 * - Session start time tracking → duration calculation
 * - File modification events → filesModified tracking
 *
 * @example
 * ```typescript
 * class SessionStatsProvider implements ISessionStatsProvider {
 *   constructor(
 *     private workspaceData: WorkspaceDataService,
 *     private sessionStart: number
 * *   ) {}
 *
 *   async getStats(): Promise<SessionStats> {
 *     const dashStats = await this.workspaceData.getDashboardStats();
 *     return {
 *       duration: Date.now() - this.sessionStart,
 *       snapshotCount: dashStats.snapshotsToday,
 *       filesModified: this.trackedFiles.size,
 *       linesChanged: dashStats.linesProtected,
 *       tokensEstimated: dashStats.tokensSaved
 *     };
 *   }
 * }
 * ```
 */
export interface ISessionStatsProvider {
	/**
	 * Get current session statistics.
	 *
	 * @returns Promise resolving to session stats
	 *
	 * @example
	 * ```typescript
	 * const stats = await statsProvider.getStats();
	 * // output:(`Session: ${formatDuration(stats.duration)} • ${stats.snapshotCount} snapshots`);
	 * ```
	 */
	getStats(): Promise<SessionStats>;

	/**
	 * Event fired when session stats change.
	 * Quick Actions panel should listen to update display.
	 *
	 * @example
	 * ```typescript
	 * statsProvider.onStatsChanged(stats => {
	 *   updateQuickActionsPanel(stats);
	 * });
	 * ```
	 */
	onStatsChanged: vscode.Event<SessionStats>;
}
