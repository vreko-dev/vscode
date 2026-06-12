/**
 * @fileoverview RecoveryService - Implementation of IRecoveryService
 *
 * Provides snapshot operations for the recovery UI system.
 * Delegates to IStorageManager for data access and DaemonBridge for restore operations.
 *
 * Design Principles:
 * - Never bypass daemon (always use DaemonBridge for restores)
 * - Reuse existing types (convert SnapshotManifest to RecoverySnapshot)
 * - Event-driven updates via VS Code Event pattern
 *
 * @packageDocumentation
 */

import * as vscode from "vscode";
import type { IStorageManager, SnapshotManifest } from "../../storage/types";
import { logger } from "../../utils/logger";
import type { DaemonBridge } from "../DaemonBridge";
import type { IRecoveryService, RecoverySnapshot, SnapshotFilter } from "./interfaces";

/**
 * RecoveryService implementation for snapshot timeline operations.
 *
 * This service wraps IStorageManager for queries and DaemonBridge for
 * restore operations, providing a clean interface for the recovery UI.
 *
 * @example
 * ```typescript
 * const recoveryService = new RecoveryService(
 *   storageManager,
 *   daemonBridge,
 *   workspaceRoot
 * );
 *
 * // Get recent snapshots
 * const recent = await recoveryService.getRecent(10);
 *
 * // Restore a file from snapshot
 * await recoveryService.restore('snap-123', 'src/index.ts');
 * ```
 */
export class RecoveryService implements IRecoveryService {
	private readonly _onSnapshotCreated = new vscode.EventEmitter<RecoverySnapshot>();

	/**
	 * Event fired when a new snapshot is created.
	 * TreeView should listen to this to refresh the timeline.
	 */
	public readonly onSnapshotCreated = this._onSnapshotCreated.event;

	constructor(
		private readonly storageManager: IStorageManager,
		private readonly daemonBridge: DaemonBridge | undefined,
		private readonly workspaceRoot: string,
	) {
		logger.debug("[RecoveryService] Initialized", {
			hasDaemonBridge: !!daemonBridge,
			workspaceRoot,
		});
	}

	/**
	 * Get recent snapshots (most recent first).
	 *
	 * @param limit - Maximum number of snapshots to return
	 * @returns Array of recovery snapshots sorted by timestamp descending
	 */
	async getRecent(limit: number): Promise<RecoverySnapshot[]> {
		logger.debug("[RecoveryService] getRecent", { limit });

		try {
			const manifests = await this.storageManager.listSnapshots({
				limit,
			});

			// Sort by timestamp descending (most recent first)
			manifests.sort((a, b) => b.timestamp - a.timestamp);

			return manifests.map((m) => this.toRecoverySnapshot(m));
		} catch (error) {
			logger.error("[RecoveryService] Failed to get recent snapshots", error as Error);
			return [];
		}
	}

	/**
	 * Get all snapshots matching filter.
	 *
	 * @param filter - Optional filter criteria
	 * @returns Array of recovery snapshots matching filter
	 */
	async getAll(filter?: SnapshotFilter): Promise<RecoverySnapshot[]> {
		logger.debug("[RecoveryService] getAll", { filter });

		try {
			const manifests = await this.storageManager.listSnapshots({
				limit: filter?.limit ?? 100,
				after: filter?.after,
				before: filter?.before,
			});

			// Sort by timestamp descending (most recent first)
			manifests.sort((a, b) => b.timestamp - a.timestamp);

			// Apply trigger filter if specified
			let filtered = manifests;
			if (filter?.trigger) {
				const triggerToMatch = filter.trigger;
				filtered = manifests.filter((m) => this.matchesTrigger(m, triggerToMatch));
			}

			return filtered.map((m) => this.toRecoverySnapshot(m));
		} catch (error) {
			logger.error("[RecoveryService] Failed to get all snapshots", error as Error);
			return [];
		}
	}

	/**
	 * Restore a specific file from a snapshot.
	 *
	 * CRITICAL: Uses DaemonBridge.restoreSnapshot() to ensure
	 * all restore operations go through the daemon.
	 *
	 * @param snapshotId - Snapshot ID to restore from
	 * @param filePath - Relative path of file to restore
	 */
	async restore(snapshotId: string, filePath: string): Promise<void> {
		logger.debug("[RecoveryService] restore", { snapshotId, filePath });

		if (!this.daemonBridge) {
			throw new Error("Daemon bridge not available - cannot restore snapshot");
		}

		try {
			const result = await this.daemonBridge.restoreSnapshot(this.workspaceRoot, snapshotId, {
				files: [filePath],
			});

			logger.info("[RecoveryService] Restore completed", {
				snapshotId,
				filePath,
				restored: result.restored,
				skipped: result.skipped,
			});

			if (result.restored.length === 0) {
				throw new Error(`File ${filePath} was not restored (may not exist in snapshot)`);
			}
		} catch (error) {
			logger.error("[RecoveryService] Restore failed", error as Error);
			throw error;
		}
	}

	/**
	 * Batch restore multiple files from snapshots.
	 * Used by "Restore All Recent" command.
	 *
	 * @param snapshots - Array of snapshots to restore
	 */
	async restoreBatch(snapshots: RecoverySnapshot[]): Promise<void> {
		logger.debug("[RecoveryService] restoreBatch", { count: snapshots.length });

		if (!this.daemonBridge) {
			throw new Error("Daemon bridge not available - cannot restore snapshots");
		}

		// Group files by snapshot ID for efficient batch restore
		const snapshotFiles = new Map<string, string[]>();
		for (const snapshot of snapshots) {
			const files = snapshot.files.map((f) => f.path);
			const existing = snapshotFiles.get(snapshot.id) || [];
			snapshotFiles.set(snapshot.id, [...existing, ...files]);
		}

		// Restore each snapshot's files
		let totalRestored = 0;
		let totalSkipped = 0;

		for (const [snapshotId, files] of snapshotFiles) {
			try {
				const result = await this.daemonBridge.restoreSnapshot(this.workspaceRoot, snapshotId, {
					files,
				});
				totalRestored += result.restored.length;
				totalSkipped += result.skipped.length;
			} catch (error) {
				logger.error("[RecoveryService] Batch restore failed for snapshot", error as Error, {
					snapshotId,
				});
				// Continue with other snapshots
			}
		}

		logger.info("[RecoveryService] Batch restore completed", {
			totalRestored,
			totalSkipped,
			snapshotCount: snapshots.length,
		});
	}

	/**
	 * Notify listeners that a new snapshot was created.
	 * Called by the daemon event listener to update UI.
	 *
	 * @param manifest - The newly created snapshot manifest
	 */
	notifySnapshotCreated(manifest: SnapshotManifest): void {
		const recoverySnapshot = this.toRecoverySnapshot(manifest);
		this._onSnapshotCreated.fire(recoverySnapshot);
	}

	/**
	 * Dispose of resources.
	 */
	dispose(): void {
		this._onSnapshotCreated.dispose();
	}

	/**
	 * Convert a SnapshotManifest to RecoverySnapshot format.
	 * Maps existing types to the simplified recovery timeline view model.
	 */
	private toRecoverySnapshot(manifest: SnapshotManifest): RecoverySnapshot {
		const files = Object.entries(manifest.files).map(([path, ref]) => ({
			path,
			size: ref.size,
		}));

		const totalSize = files.reduce((sum, f) => sum + f.size, 0);

		// Map trigger to recovery trigger type
		// SnapshotManifest.trigger: "auto" | "manual" | "ai-detected" | "pre-save"
		// RecoverySnapshot.trigger: "manual" | "auto" | "ai-detection" | "pre-rollback"
		let trigger: RecoverySnapshot["trigger"];
		switch (manifest.trigger) {
			case "ai-detected":
				trigger = "ai-detection";
				break;
			case "manual":
				trigger = "manual";
				break;
			default:
				trigger = "auto";
		}

		return {
			id: manifest.id,
			timestamp: manifest.timestamp,
			name: manifest.name,
			anchorFile: manifest.anchorFile,
			files,
			totalSize,
			trigger,
			metadata: {
				riskScore: manifest.metadata?.riskScore,
				sessionId: manifest.metadata?.sessionId,
				aiTool: manifest.metadata?.aiDetection?.tool,
			},
		};
	}

	/**
	 * Check if a manifest matches the specified trigger filter.
	 */
	private matchesTrigger(manifest: SnapshotManifest, trigger: RecoverySnapshot["trigger"]): boolean {
		switch (trigger) {
			case "ai-detection":
				return manifest.trigger === "ai-detected";
			case "manual":
				return manifest.trigger === "manual";
			case "pre-rollback":
				// pre-rollback is a V2 checkpoint type, not present in V1 SnapshotManifest
				// This filter won't match any V1 manifests
				return false;
			case "auto":
				return manifest.trigger === "auto" || manifest.trigger === "pre-save";
			default:
				return true;
		}
	}
}
