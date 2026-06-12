/**
 * StalePRECleanupService - On-activation cleanup of orphaned PRE checkpoints
 *
 * PRE (Pre-Edit) checkpoints are created before risky saves. If the save
 * is interrupted or the extension crashes, these PREs become orphaned
 * (no corresponding POST checkpoint). This service cleans them up on
 * extension activation to prevent storage bloat.
 *
 * @module services/StalePRECleanupService
 */

import type * as vscode from "vscode";
import type { IStorageManager, SnapshotManifest } from "../storage/types";
import { isSnapshotManifestV2 } from "../storage/types";
import { logger } from "../utils/logger";

/**
 * Configuration for stale PRE cleanup
 */
export interface StalePRECleanupConfig {
	/** Max age in hours before a PRE is considered stale (default: 24) */
	maxAgeHours: number;
	/** Whether to actually delete or just report (default: false) */
	dryRun: boolean;
	/** Minimum number of PREs to trigger cleanup (default: 5) */
	threshold: number;
}

/**
 * Result of stale PRE cleanup operation
 */
export interface StalePRECleanupResult {
	/** Number of stale PREs found */
	staleCount: number;
	/** Number of PREs actually deleted */
	deletedCount: number;
	/** IDs of stale PREs */
	staleIds: string[];
	/** Total bytes freed (approximate) */
	bytesFreed: number;
}

/**
 * Service for cleaning up orphaned/stale PRE checkpoints
 *
 * PRE checkpoints are created before risky saves. If the save operation
 * fails or the extension crashes, these PREs remain orphaned without
 * a corresponding POST checkpoint. This service identifies and removes
 * them during extension activation.
 */
export class StalePRECleanupService {
	private readonly config: StalePRECleanupConfig;
	private readonly storage: IStorageManager;

	constructor(storage: IStorageManager, config?: Partial<StalePRECleanupConfig>) {
		this.storage = storage;
		this.config = {
			maxAgeHours: 24,
			dryRun: false,
			threshold: 5,
			...config,
		};
	}

	/**
	 * Run cleanup on extension activation
	 *
	 * Scans for orphaned PRE checkpoints older than maxAgeHours and
	 * deletes them to free up storage space.
	 *
	 * @returns Cleanup result with stats
	 */
	async runCleanup(): Promise<StalePRECleanupResult> {
		logger.info("Starting stale PRE cleanup", {
			maxAgeHours: this.config.maxAgeHours,
			dryRun: this.config.dryRun,
		});

		try {
			// Get all snapshots
			const allSnapshots = await this.storage.listSnapshots({});

			// Find stale PREs
			const stalePREs = this.identifyStalePREs(allSnapshots);

			if (stalePREs.length === 0) {
				logger.debug("No stale PREs found");
				return {
					staleCount: 0,
					deletedCount: 0,
					staleIds: [],
					bytesFreed: 0,
				};
			}

			logger.info(`Found ${stalePREs.length} stale PRE checkpoints`, {
				threshold: this.config.threshold,
			});

			// Only cleanup if above threshold (avoid excessive operations)
			if (stalePREs.length < this.config.threshold) {
				logger.debug("Stale PRE count below threshold, skipping cleanup", {
					count: stalePREs.length,
					threshold: this.config.threshold,
				});
				return {
					staleCount: stalePREs.length,
					deletedCount: 0,
					staleIds: stalePREs.map((p) => p.id),
					bytesFreed: 0,
				};
			}

			// Delete stale PREs
			const result = await this.deleteStalePREs(stalePREs);

			logger.info("Stale PRE cleanup complete", {
				staleCount: result.staleCount,
				deletedCount: result.deletedCount,
				bytesFreed: result.bytesFreed,
			});

			return result;
		} catch (error) {
			logger.error("Stale PRE cleanup failed", error as Error);
			return {
				staleCount: 0,
				deletedCount: 0,
				staleIds: [],
				bytesFreed: 0,
			};
		}
	}

	/**
	 * Identify stale PRE checkpoints
	 *
	 * A PRE is stale if:
	 * 1. It's a PRE or PRE_ROLLBACK type (V2 only)
	 * 2. It has no corresponding POST checkpoint with it as parent
	 * 3. It's older than maxAgeHours
	 */
	private identifyStalePREs(snapshots: SnapshotManifest[]): SnapshotManifest[] {
		const now = Date.now();
		const maxAgeMs = this.config.maxAgeHours * 60 * 60 * 1000;

		// Build set of all parent IDs referenced by POST checkpoints
		const postParentIds = new Set<string>();
		for (const snapshot of snapshots) {
			// Only V2 snapshots have type field
			if (isSnapshotManifestV2(snapshot)) {
				if (snapshot.type === "POST" && snapshot.parentId) {
					postParentIds.add(snapshot.parentId);
				}
			}
		}

		// Find orphaned PREs that are old enough
		const stalePREs: SnapshotManifest[] = [];
		for (const snapshot of snapshots) {
			// Only consider V2 PRE checkpoints
			if (!isSnapshotManifestV2(snapshot)) {
				continue;
			}

			// Only consider PRE checkpoints
			if (snapshot.type !== "PRE" && snapshot.type !== "PRE_ROLLBACK") {
				continue;
			}

			// Check if orphaned (no POST references it)
			const isOrphaned = !postParentIds.has(snapshot.id);
			if (!isOrphaned) {
				continue;
			}

			// Check if old enough
			const ageMs = now - snapshot.timestamp;
			if (ageMs < maxAgeMs) {
				continue;
			}

			stalePREs.push(snapshot);
		}

		// Sort by age (oldest first)
		stalePREs.sort((a, b) => a.timestamp - b.timestamp);

		return stalePREs;
	}

	/**
	 * Delete stale PRE checkpoints
	 */
	private async deleteStalePREs(stalePREs: SnapshotManifest[]): Promise<StalePRECleanupResult> {
		const staleIds: string[] = [];
		let deletedCount = 0;
		let bytesFreed = 0;

		for (const pre of stalePREs) {
			staleIds.push(pre.id);

			// Calculate approximate size
			const fileCount = Object.keys(pre.files || {}).length;
			const estimatedSize = fileCount * 1024; // Rough estimate: 1KB per file ref

			// Get type for logging (V2 snapshots only)
			const preType = isSnapshotManifestV2(pre) ? pre.type : "unknown";

			if (this.config.dryRun) {
				logger.debug("[DRY RUN] Would delete stale PRE", {
					id: pre.id,
					type: preType,
					age: `${Math.round((Date.now() - pre.timestamp) / (60 * 60 * 1000))}h`,
				});
			} else {
				try {
					await this.storage.deleteSnapshot(pre.id);
					deletedCount++;
					bytesFreed += estimatedSize;

					logger.debug("Deleted stale PRE checkpoint", {
						id: pre.id,
						type: preType,
					});
				} catch (error) {
					logger.warn("Failed to delete stale PRE", {
						id: pre.id,
						error: (error as Error).message,
					});
				}
			}
		}

		return {
			staleCount: stalePREs.length,
			deletedCount,
			staleIds,
			bytesFreed,
		};
	}

	/**
	 * Register cleanup to run on extension activation
	 *
	 * @param context - VS Code extension context
	 * @param storage - Storage manager instance
	 */
	static registerOnActivation(context: vscode.ExtensionContext, storage: IStorageManager): void {
		const service = new StalePRECleanupService(storage);

		// Run cleanup after a short delay to not block activation
		const timeout = setTimeout(() => {
			service.runCleanup().catch((error) => {
				logger.error("Stale PRE cleanup failed on activation", error);
			});
		}, 5000); // 5 second delay

		context.subscriptions.push({
			dispose: () => clearTimeout(timeout),
		});
	}
}

/**
 * Create a StalePRECleanupService instance
 */
export function createStalePRECleanupService(
	storage: IStorageManager,
	config?: Partial<StalePRECleanupConfig>,
): StalePRECleanupService {
	return new StalePRECleanupService(storage, config);
}
