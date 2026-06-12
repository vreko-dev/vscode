/**
 * Restore Service
 *
 * Handles snapshot restoration workflow including conflict detection,
 * atomic restore operations, and telemetry tracking.
 *
 * @module operations/restore-service
 */

import { readFile } from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import type { ConflictResolver } from "../conflictResolver.js";
import type { VrekoEventBus } from "../events";
import { VrekoEvent } from "../events";
import { ClusterRestoreHandler, snapshotContentsToRestoreFiles } from "../restore/ClusterRestoreHandler.js";
import type { TelemetryProxy } from "../services/telemetry-proxy.js";
import type { UnifiedOnboardingService } from "../services/UnifiedOnboardingService.js";
import type { IStorageManager } from "../storage/types.js";
import { getActivationFunnel } from "../telemetry/ActivationFunnelIntegration.js";
import { logger } from "../utils/logger.js";
import { failedRestoreResult, successRestoreResult } from "./restore-helpers.js";
import type { DetailedRestoreResult, RestoreOptions } from "./types.js";

/**
 * Service for coordinating snapshot restoration workflow
 */
export class RestoreService {
	constructor(
		private storage: IStorageManager,
		private telemetryProxy: TelemetryProxy,
		private unifiedOnboarding: UnifiedOnboardingService,
		private conflictResolver: ConflictResolver,
		private eventBus?: VrekoEventBus,
	) {
		/* intentionally empty */
	}

	/**
	 * Restores workspace to a previous snapshot
	 *
	 * @returns DetailedRestoreResult with per-file success/failure information
	 */
	async restoreToSnapshot(snapshotId: string, options?: RestoreOptions): Promise<DetailedRestoreResult> {
		const startTime = Date.now();

		// Validate workspace
		const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
		if (!workspaceRoot) {
			return failedRestoreResult([], [{ file: "(workspace)", reason: "No workspace folder found" }], 0, 0);
		}

		// Emit RESTORE_STARTED event
		this.publishEvent(VrekoEvent.RESTORE_STARTED, {
			snapshotId,
			timestamp: Date.now(),
		});

		// Phase 1: Validate snapshot exists
		const snapshot = await this.storage.getSnapshot(snapshotId);
		if (!snapshot) {
			return failedRestoreResult(
				[],
				[{ file: "(snapshot)", reason: `Missing snapshot: ${snapshotId}` }],
				0,
				Date.now() - startTime,
			);
		}

		// Phase 1.5: Create PRE_ROLLBACK checkpoint
		if (!options?.dryRun) {
			await this.createPreRollbackCheckpoint(snapshotId);
		}

		// Phase 2: Dry run conflict detection
		if (options?.dryRun) {
			return this.handleDryRunRestore(snapshot, workspaceRoot, startTime);
		}

		// Phase 3: Perform atomic restore
		const result = await this.performAtomicRestore(snapshot, workspaceRoot, startTime, options);

		// Phase 4: Handle success/failure
		if (result.success) {
			await this.handleRestoreSuccess(snapshotId, result, startTime);
		}

		return result;
	}

	/**
	 * Creates a PRE_ROLLBACK checkpoint before restore
	 */
	private async createPreRollbackCheckpoint(snapshotId: string): Promise<void> {
		try {
			if (this.storage.createPreRollbackCheckpoint) {
				const preRollback = await this.storage.createPreRollbackCheckpoint(snapshotId);
				logger.debug("Created PRE_ROLLBACK checkpoint", {
					id: preRollback.id,
					targetId: snapshotId,
				});
			}
		} catch (err) {
			logger.warn("Failed to create PRE_ROLLBACK checkpoint", { error: err });
		}
	}

	/**
	 * Handles dry-run restore with conflict detection
	 */
	private async handleDryRunRestore(
		snapshot: { id: string; contents?: Record<string, string> },
		workspaceRoot: string,
		startTime: number,
	): Promise<DetailedRestoreResult> {
		const conflicts = await this.detectConflicts(snapshot, workspaceRoot);

		if (conflicts.length > 0 && this.conflictResolver) {
			const resolutions = await this.conflictResolver.resolveConflicts(
				conflicts.map((c) => ({
					file: c.path,
					currentContent: c.currentContent || "",
					snapshotContent: c.snapshotContent,
					conflictType: c.type,
				})),
			);

			if (!resolutions) {
				return {
					success: false,
					restored: [],
					failed: [],
					totalFiles: conflicts.length,
					durationMs: Date.now() - startTime,
					suggestion: "Restore cancelled by user.",
				};
			}

			const filesToRestore = resolutions.filter((r) => r.resolution === "use_snapshot").map((r) => r.file);

			if (filesToRestore.length === 0) {
				return {
					success: false,
					restored: [],
					failed: [],
					totalFiles: conflicts.length,
					durationMs: Date.now() - startTime,
					suggestion: "No files were selected for restore.",
				};
			}

			return this.performPartialRestore(snapshot, workspaceRoot, filesToRestore, startTime);
		}

		return {
			success: false,
			restored: [],
			failed: [],
			totalFiles: conflicts.length,
			durationMs: Date.now() - startTime,
			suggestion: "No conflicts detected.",
		};
	}

	/**
	 * Detects conflicts between snapshot and workspace
	 */
	private async detectConflicts(
		snapshot: { id: string; contents?: Record<string, string> },
		workspaceRoot: string,
	): Promise<
		Array<{
			path: string;
			type: "modified" | "added" | "deleted";
			currentContent?: string;
			snapshotContent: string;
		}>
	> {
		const conflicts: Array<{
			path: string;
			type: "modified" | "added" | "deleted";
			currentContent?: string;
			snapshotContent: string;
		}> = [];

		for (const [filePath, rawSnapshotContent] of Object.entries(snapshot.contents || {})) {
			const snapshotContent = this.parseSnapshotContent(rawSnapshotContent);
			const fullPath = path.join(workspaceRoot, filePath);

			try {
				const currentContent = await readFile(fullPath, "utf-8");
				if (currentContent !== snapshotContent) {
					conflicts.push({
						path: filePath,
						type: "modified",
						currentContent,
						snapshotContent,
					});
				}
			} catch {
				conflicts.push({
					path: filePath,
					type: "added",
					snapshotContent,
				});
			}
		}

		return conflicts;
	}

	/**
	 * Parses snapshot content handling both JSON and plain text formats
	 */
	private parseSnapshotContent(rawContent: string): string {
		try {
			const parsed = JSON.parse(rawContent);
			if (typeof parsed === "object" && parsed !== null && "content" in parsed) {
				return parsed.content;
			}
			return rawContent;
		} catch {
			return rawContent;
		}
	}

	/**
	 * Performs atomic restore using ClusterRestoreHandler
	 */
	private async performAtomicRestore(
		snapshot: { id: string; contents?: Record<string, string> },
		workspaceRoot: string,
		startTime: number,
		options?: RestoreOptions,
	): Promise<DetailedRestoreResult> {
		if (!snapshot.contents) {
			return {
				success: false,
				restored: [],
				failed: [],
				totalFiles: 0,
				durationMs: Date.now() - startTime,
				suggestion: "Snapshot has no files to restore.",
			};
		}

		const restoreFiles = snapshotContentsToRestoreFiles(snapshot.contents, options?.files);

		if (restoreFiles.length === 0) {
			return {
				success: false,
				restored: [],
				failed: [],
				totalFiles: Object.keys(snapshot.contents).length,
				durationMs: Date.now() - startTime,
				suggestion: "No matching files found. Check your file filter or snapshot contents.",
			};
		}

		const clusterHandler = new ClusterRestoreHandler();
		const restoreResult = await clusterHandler.restore({
			workspaceRoot,
			files: restoreFiles,
			dryRun: false,
		});

		if (restoreResult.isErr()) {
			return this.handleRestoreFailure(restoreResult.error, restoreFiles.length, startTime);
		}

		return successRestoreResult(
			restoreResult.value.restoredPaths || [],
			restoreResult.value.filesRestored,
			Date.now() - startTime,
		);
	}

	/**
	 * Performs partial restore with selected files
	 */
	private async performPartialRestore(
		snapshot: { id: string; contents?: Record<string, string> },
		workspaceRoot: string,
		filesToRestore: string[],
		startTime: number,
	): Promise<DetailedRestoreResult> {
		const restoreFiles = snapshotContentsToRestoreFiles(snapshot.contents || {}, filesToRestore);

		if (restoreFiles.length === 0) {
			return failedRestoreResult([], [], filesToRestore.length, Date.now() - startTime);
		}

		const clusterHandler = new ClusterRestoreHandler();
		const restoreResult = await clusterHandler.restore({
			workspaceRoot,
			files: restoreFiles,
			dryRun: false,
		});

		if (restoreResult.isErr()) {
			return this.handleRestoreFailure(restoreResult.error, filesToRestore.length, startTime);
		}

		return successRestoreResult(filesToRestore, filesToRestore.length, Date.now() - startTime);
	}

	/**
	 * Handles restore failure with detailed error reporting
	 */
	private handleRestoreFailure(
		error: { message?: string; failures?: Array<{ file: string; reason: string; message?: string }> } | undefined,
		totalFiles: number,
		startTime: number,
	): DetailedRestoreResult {
		logger.error(`Atomic restore failed: ${error?.message || "Unknown error"}`);

		const failures: Array<{ file: string; reason: string; errorCode?: string }> = [];
		if (error && "failures" in error && error.failures && error.failures.length > 0) {
			for (const f of error.failures) {
				failures.push({
					file: f.file,
					reason: f.message || f.reason,
					errorCode: f.reason,
				});
			}

			const lockedFiles = error.failures.filter((f) => f.reason === "file_locked").length;

			if (lockedFiles > 0) {
				void vscode.window.showErrorMessage(
					`Restore aborted: ${lockedFiles} file(s) are locked. Close them and try again.`,
				);
			} else {
				void vscode.window.showErrorMessage(`Restore aborted: ${failures.length} file(s) cannot be written.`);
			}
		} else {
			failures.push({ file: "(all files)", reason: error?.message || "Unknown error" });
		}

		return failedRestoreResult([], failures, totalFiles, Date.now() - startTime);
	}

	/**
	 * Handles successful restore with telemetry and notifications
	 */
	private async handleRestoreSuccess(
		snapshotId: string,
		result: DetailedRestoreResult,
		startTime: number,
	): Promise<void> {
		const durationMs = Date.now() - startTime;

		// Emit event
		this.publishEvent(VrekoEvent.SNAPSHOT_RESTORED, {
			snapshotId,
			filesRestored: result.restored.length,
			timestamp: Date.now(),
		});

		// Track telemetry
		const recoveredLines = result.restored.length * 50; // Estimate
		const isPartial = result.restored.length < result.totalFiles;
		const recoveryType = isPartial ? "single_file" : "full_snapshot";
		const severity = isPartial ? "medium" : "high";

		this.telemetryProxy.trackEvent("snapshot_restored", {
			snapshot_id: snapshotId,
			files_restored: result.restored.length,
			duration_ms: durationMs,
			had_conflicts: false,
			restore_type: recoveryType,
			success: true,
		});

		this.telemetryProxy.trackEvent("value:disaster_averted", {
			files_restored: result.restored.length,
			recovery_type: recoveryType,
			lines_recovered: recoveredLines,
			severity: severity,
		});

		// Track onboarding
		void this.unifiedOnboarding.trackRecovery();

		// Track in activation funnel
		const funnel = getActivationFunnel();
		if (funnel) {
			funnel.trackFirstRestore();
		}

		vscode.window.setStatusBarMessage(
			`✅ Workspace restored from snapshot (${result.restored.length} files)`,
			5000,
		);
	}

	/**
	 * Publishes event if eventBus is available
	 */
	private publishEvent<T>(event: VrekoEvent, payload: T): void {
		if (this.eventBus) {
			this.eventBus.publish(event, payload);
		}
	}
}
