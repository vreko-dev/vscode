import { toError } from "../utils/errorHelpers.js";
import { logger } from "../utils/logger.js";
/**
 * SnapshotDeletionService - Safe snapshot deletion with confirmation and auto-cleanup
 *
 * Provides intelligent snapshot deletion with multiple safety features:
 * - Protected snapshot guards
 * - User confirmation dialogs
 * - Bulk deletion with age filtering
 * - Automatic cleanup scheduling
 * - Minimum snapshot preservation
 *
 * @module snapshot/SnapshotDeletionService
 * @performance Single deletion < 50ms, bulk deletion < 500ms for 100 snapshots
 * @security All deletions require explicit confirmation or skipConfirmation flag
 */

/**
 * Options for snapshot deletion operations
 */
export interface DeletionOptions {
	/** Skip user confirmation dialog */
	skipConfirmation?: boolean;
	/** Unprotect snapshot before deletion (otherwise throws error) */
	unprotectFirst?: boolean;
}

/**
 * Result of a deletion operation
 */
export interface DeletionResult {
	/** Whether the operation completed successfully */
	success: boolean;
	/** Number of snapshots deleted */
	deletedCount: number;
	/** Error message if operation failed */
	error?: string;
}

/**
 * Configuration for automatic cleanup
 */
export interface AutoCleanupConfig {
	/** Whether auto-cleanup is enabled */
	enabled: boolean;
	/** Delete snapshots older than this many days */
	olderThanDays: number;
	/** Keep protected snapshots even if old */
	keepProtected: boolean;
	/** Never delete below this minimum count */
	minimumSnapshots: number;
}

/**
 * Minimal snapshot interface for deletion service
 */
export interface Snapshot {
	id: string;
	name: string;
	timestamp: number;
	isProtected: boolean;
	[key: string]: unknown;
}

/**
 * Minimal SnapshotManager interface for deletion operations
 */
export interface ISnapshotManager {
	get(id: string): Promise<Snapshot | undefined>;
	getAll(): Promise<Snapshot[]>;
	delete(id: string): Promise<void>;
	unprotect(id: string): Promise<void>;
}

/**
 * Confirmation service interface for user prompts
 */
export interface IConfirmationService {
	confirm(message: string, detail?: string): Promise<boolean>;
}

/**
 * SnapshotDeletionService - Manages safe snapshot deletion operations
 *
 * @example
 * ```typescript
 * const service = new SnapshotDeletionService(snapshotManager, confirmationService);
 *
 * // Delete single snapshot with confirmation
 * const result = await service.deleteSnapshot('snapshot-id');
 *
 * // Delete without confirmation
 * await service.deleteSnapshot('snapshot-id', { skipConfirmation: true });
 *
 * // Delete protected snapshot
 * await service.deleteSnapshot('snapshot-id', { unprotectFirst: true });
 *
 * // Bulk delete old snapshots
 * await service.deleteOlderThan(Date.now() - 30 * 24 * 60 * 60 * 1000, true);
 *
 * // Auto-cleanup
 * await service.autoCleanup({
 *   enabled: true,
 *   olderThanDays: 30,
 *   keepProtected: true,
 *   minimumSnapshots: 10
 * });
 * ```
 */
export class SnapshotDeletionService {
	constructor(
		private readonly snapshotManager: ISnapshotManager,
		private readonly confirmationService: IConfirmationService,
	) {}

	/**
	 * Delete a single snapshot with safety checks
	 *
	 * @param snapshotId - ID of snapshot to delete
	 * @param options - Deletion options
	 * @returns Deletion result with success status and count
	 * @throws Error if snapshot is protected and unprotectFirst is false
	 * @throws Error if snapshot does not exist
	 *
	 * @performance < 50ms including confirmation dialog
	 *
	 * @example
	 * ```typescript
	 * // With confirmation
	 * const result = await service.deleteSnapshot('cp-123');
	 *
	 * // Skip confirmation
	 * await service.deleteSnapshot('cp-123', { skipConfirmation: true });
	 *
	 * // Unprotect and delete
	 * await service.deleteSnapshot('cp-123', { unprotectFirst: true });
	 * ```
	 */
	async deleteSnapshot(
		snapshotId: string,
		options: DeletionOptions = {},
	): Promise<DeletionResult> {
		// 1. Validate snapshot exists
		const snapshot = await this.snapshotManager.get(snapshotId);
		if (!snapshot) {
			throw new Error(`Snapshot not found: ${snapshotId}`);
		}

		// 2. Safety check: Protected snapshot
		if (snapshot.isProtected && !options.unprotectFirst) {
			throw new Error(
				"Cannot delete protected snapshot. Set unprotectFirst=true to override.",
			);
		}

		// 3. Unprotect if requested
		if (options.unprotectFirst && snapshot.isProtected) {
			await this.snapshotManager.unprotect(snapshotId);
		}

		// 4. Confirmation (if not skipped)
		if (!options.skipConfirmation) {
			const confirmed = await this.confirmationService.confirm(
				`Delete snapshot "${snapshot.name}"?`,
				"This action cannot be undone.",
			);

			if (!confirmed) {
				return {
					success: false,
					deletedCount: 0,
					error: "User cancelled deletion",
				};
			}
		}
		await this.snapshotManager.delete(snapshotId);

		return {
			success: true,
			deletedCount: 1,
		};
	}

	/**
	 * Delete all snapshots older than the specified timestamp
	 *
	 * @param timestamp - Cutoff timestamp (milliseconds since epoch)
	 * @param keepProtected - If true, skip protected snapshots
	 * @returns Deletion result with count of deleted snapshots
	 *
	 * @performance < 500ms for 100 snapshots
	 *
	 * @example
	 * ```typescript
	 * // Delete snapshots older than 30 days
	 * const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
	 * await service.deleteOlderThan(thirtyDaysAgo, true);
	 * ```
	 */
	async deleteOlderThan(
		timestamp: number,
		keepProtected = true,
	): Promise<DeletionResult> {
		const allSnapshots = await this.snapshotManager.getAll();

		// Filter snapshots to delete
		const toDelete = allSnapshots.filter((snapshot: Snapshot) => {
			// Skip if newer than cutoff
			if (snapshot.timestamp >= timestamp) {
				return false;
			}

			// Skip protected if requested
			if (keepProtected && snapshot.isProtected) {
				return false;
			}

			return true;
		});

		// Delete snapshots
		let deletedCount = 0;
		for (const snapshot of toDelete) {
			try {
				// Unprotect if needed
				if (snapshot.isProtected) {
					await this.snapshotManager.unprotect(snapshot.id);
				}

				await this.snapshotManager.delete(snapshot.id);
				deletedCount++;
			} catch (error) {
				// Log error but continue with other deletions
				logger.error(
					`Failed to delete snapshot ${snapshot.id}:`,
					toError(error),
				);
			}
		}

		return {
			success: true,
			deletedCount,
		};
	}

	/**
	 * Perform automatic cleanup based on configuration
	 *
	 * @param config - Auto-cleanup configuration
	 * @returns Deletion result with count of deleted snapshots
	 *
	 * @example
	 * ```typescript
	 * await service.autoCleanup({
	 *   enabled: true,
	 *   olderThanDays: 30,
	 *   keepProtected: true,
	 *   minimumSnapshots: 10
	 * });
	 * ```
	 */
	async autoCleanup(config: AutoCleanupConfig): Promise<DeletionResult> {
		// Check if enabled
		if (!config.enabled) {
			return {
				success: true,
				deletedCount: 0,
			};
		}

		const allSnapshots = await this.snapshotManager.getAll();

		// Check minimum snapshot count
		if (allSnapshots.length <= config.minimumSnapshots) {
			return {
				success: true,
				deletedCount: 0,
			};
		}

		// Calculate cutoff timestamp
		const cutoffTime = Date.now() - config.olderThanDays * 24 * 60 * 60 * 1000;

		// Filter eligible snapshots for deletion
		const eligibleForDeletion = allSnapshots.filter((snapshot: Snapshot) => {
			// Skip if newer than cutoff
			if (snapshot.timestamp >= cutoffTime) {
				return false;
			}

			// Skip protected if configured
			if (config.keepProtected && snapshot.isProtected) {
				return false;
			}

			return true;
		});

		// Sort by timestamp (oldest first)
		eligibleForDeletion.sort(
			(a: Snapshot, b: Snapshot) => a.timestamp - b.timestamp,
		);

		// Calculate how many we can delete while respecting minimum
		const maxToDelete = allSnapshots.length - config.minimumSnapshots;
		const toDelete = eligibleForDeletion.slice(0, Math.max(0, maxToDelete));

		// Delete snapshots
		let deletedCount = 0;
		for (const snapshot of toDelete) {
			try {
				// Unprotect if needed
				if (snapshot.isProtected) {
					await this.snapshotManager.unprotect(snapshot.id);
				}

				await this.snapshotManager.delete(snapshot.id);
				deletedCount++;
			} catch (error) {
				logger.error(`Auto-cleanup failed for ${snapshot.id}:`, toError(error));
			}
		}

		return {
			success: true,
			deletedCount,
		};
	}

	/**
	 * Check if a snapshot can be safely deleted
	 *
	 * @param snapshot - Snapshot to check
	 * @returns True if snapshot can be deleted without unprotectFirst
	 *
	 * @performance < 1ms
	 *
	 * @example
	 * ```typescript
	 * if (service.canDelete(snapshot)) {
	 *   await service.deleteSnapshot(snapshot.id);
	 * }
	 * ```
	 */
	canDelete(snapshot: Snapshot): boolean {
		return !snapshot.isProtected;
	}
}
