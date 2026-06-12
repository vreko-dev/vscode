/**
 * Snapshot Service
 *
 * Handles snapshot creation workflow including file scanning, content reading,
 * and storage persistence.
 *
 * Supports thin-client architecture (WU-3.2): when DaemonBridge is provided and
 * connected, snapshot operations are delegated to the daemon. Falls back to local
 * storage when daemon is unavailable.
 *
 * @module operations/snapshot-service
 */

import { readFile, stat } from "node:fs/promises";
import * as path from "node:path";
import { chunk } from "es-toolkit";
import * as vscode from "vscode";
import type { VrekoEventBus } from "../events";
import type { DaemonBridge } from "../services/DaemonBridge.js";
import type { SessionCoordinator } from "../snapshot/SessionCoordinator.js";
import type { IStorageManager } from "../storage/types.js";
import type { NotificationCoordinator } from "../ui/NotificationCoordinator.js";
import { logger } from "../utils/logger.js";
import type { WorkspaceMemoryManager } from "../workspaceMemory.js";
import {
	createIgnoreInstance,
	filterWorkspaceFiles,
	getSnapshotLimits,
	loadIgnorePatterns,
	toAbsolutePaths,
	walkDirectory,
} from "./filesystem-utils.js";
import type { Operation } from "./types.js";

/**
 * Options for snapshot creation
 */
export interface SnapshotCreationOptions {
	/** Whether to show user notification after creation */
	showNotification?: boolean;
	/** Specific files to snapshot (for incremental snapshots) */
	specificFiles?: string[];
	/** Pre-captured file contents (for save interception) */
	providedFileContents?: Record<string, string>;
	/** Custom snapshot name */
	customSnapshotName?: string;
	/** Session ID to associate snapshot with */
	sessionId?: string;
}

/**
 * Result of snapshot creation
 */
export interface SnapshotCreationResult {
	/** The created snapshot ID */
	snapshotId: string;
	/** Number of files included */
	fileCount: number;
	/** Duration in milliseconds */
	durationMs: number;
}

/**
 * Service for coordinating snapshot creation workflow
 */
export class SnapshotService {
	private readonly BATCH_SIZE = 100;
	private readonly MAX_BATCH_MEMORY = 50 * 1024 * 1024; // 50MB

	constructor(
		private storage: IStorageManager,
		private workspaceMemory: WorkspaceMemoryManager,
		private notificationCoordinator: NotificationCoordinator,
		private sessionCoordinator: SessionCoordinator,
		_eventBus?: VrekoEventBus,
		private daemonBridge?: DaemonBridge,
	) {
		/* intentionally empty */
	}

	/**
	 * Check if daemon is available for snapshot operations
	 */
	private isDaemonAvailable(): boolean {
		return !!this.daemonBridge?.isConnected();
	}

	/**
	 * Creates a snapshot of the workspace or specific files
	 */
	async createSnapshot(
		options: SnapshotCreationOptions,
		_operation: Operation,
		updateProgress: (progress: number) => void,
	): Promise<SnapshotCreationResult> {
		const { showNotification = true, specificFiles, providedFileContents, customSnapshotName, sessionId } = options;
		const startTime = Date.now();

		// Validate workspace root
		const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
		if (!workspaceRoot) {
			throw new Error("No workspace folder found - cannot create snapshot");
		}

		const isIncremental = specificFiles && specificFiles.length > 0;
		let files: string[] = [];

		// Phase 1: Collect files to snapshot
		updateProgress(10);

		if (isIncremental) {
			files = await this.collectIncrementalFiles(specificFiles, workspaceRoot);
		} else {
			files = await this.collectWorkspaceFiles(workspaceRoot, updateProgress);
		}

		// Phase 2: Read file contents
		updateProgress(30);
		const fileContents = await this.readFileContents(
			files,
			workspaceRoot,
			providedFileContents,
			isIncremental,
			updateProgress,
		);

		// Phase 3: Create snapshot
		updateProgress(85);
		const snapshotManifest = await this.createSnapshotManifest(fileContents, workspaceRoot, {
			customSnapshotName,
			specificFiles,
			sessionId,
			isIncremental,
		});

		// Phase 4: Track in session
		this.trackSnapshotFiles(Object.keys(fileContents), snapshotManifest.id);

		// Phase 5: Update workspace memory
		this.workspaceMemory.updateLastSnapshot(snapshotManifest.id);
		await this.workspaceMemory.saveContext();

		updateProgress(100);

		// Show notification if requested
		if (showNotification) {
			this.notificationCoordinator.show("snapshot-created", "Snapshot saved");
		}

		return {
			snapshotId: snapshotManifest.id,
			fileCount: Object.keys(fileContents).length,
			durationMs: Date.now() - startTime,
		};
	}

	/**
	 * Collects files for incremental snapshot
	 */
	private async collectIncrementalFiles(specificFiles: string[], workspaceRoot: string): Promise<string[]> {
		// Convert relative paths to absolute
		const absoluteFiles = toAbsolutePaths(specificFiles, workspaceRoot);

		// Filter out files outside workspace
		const validFiles = filterWorkspaceFiles(absoluteFiles, workspaceRoot);

		if (validFiles.length === 0) {
			throw new Error(
				"Cannot create snapshot: all specified files are outside the workspace. " +
					"Only files within the workspace can be included in snapshots.",
			);
		}

		return validFiles;
	}

	/**
	 * Collects all files in workspace for full snapshot
	 */
	private async collectWorkspaceFiles(
		workspaceRoot: string,
		_updateProgress: (progress: number) => void,
	): Promise<string[]> {
		const files: string[] = [];
		const ignorePatterns = await loadIgnorePatterns(workspaceRoot);
		const ig = createIgnoreInstance(ignorePatterns);
		const limits = getSnapshotLimits();

		for await (const file of walkDirectory(workspaceRoot, {
			ignoreInstance: ig,
			maxFiles: limits.maxFiles,
			maxTotalSize: limits.maxTotalSize,
		})) {
			files.push(file);
		}

		return files;
	}

	/**
	 * Reads file contents with batching and memory limits
	 */
	private async readFileContents(
		files: string[],
		workspaceRoot: string,
		providedFileContents?: Record<string, string>,
		_isIncremental?: boolean,
		updateProgress?: (progress: number) => void,
	): Promise<Record<string, string>> {
		// Use provided contents if available
		if (providedFileContents && Object.keys(providedFileContents).length > 0) {
			logger.info("Using provided file contents for snapshot", {
				fileCount: Object.keys(providedFileContents).length,
			});
			return providedFileContents;
		}

		const fileContents: Record<string, string> = {};
		const limits = getSnapshotLimits();
		let totalProcessed = 0;

		const batches = chunk(files, this.BATCH_SIZE);

		for (const batch of batches) {
			const batchFiles: Array<{ file: string; size: number }> = [];
			let currentBatchMemory = 0;

			// Pre-check file sizes
			for (const file of batch) {
				try {
					const stats = await stat(file);

					if (stats.size > limits.maxFileSize) {
						logger.warn("Skipping large file during snapshot scan", { file, size: stats.size });
						continue;
					}

					if (currentBatchMemory + stats.size > this.MAX_BATCH_MEMORY) {
						// Process current batch first
						await this.processBatchFiles(batchFiles, workspaceRoot, fileContents);
						batchFiles.length = 0;
						currentBatchMemory = 0;
					}

					batchFiles.push({ file, size: stats.size });
					currentBatchMemory += stats.size;
				} catch (error) {
					logger.warn("Failed to stat file during snapshot scan", {
						file,
						error: error instanceof Error ? error.message : String(error),
					});
				}
			}

			// Process remaining files
			await this.processBatchFiles(batchFiles, workspaceRoot, fileContents);

			totalProcessed += batch.length;
			if (updateProgress) {
				const progressPercent = 30 + Math.floor((totalProcessed / files.length) * 50);
				updateProgress(Math.min(progressPercent, 80));
			}
		}

		return fileContents;
	}

	/**
	 * Processes a batch of files for content reading
	 */
	private async processBatchFiles(
		batchFiles: Array<{ file: string; size: number }>,
		workspaceRoot: string,
		fileContents: Record<string, string>,
	): Promise<void> {
		await Promise.all(
			batchFiles.map(async (batchFile) => {
				try {
					const content = await readFile(batchFile.file, "utf-8");
					const relativePath = path.relative(workspaceRoot, batchFile.file);
					fileContents[relativePath] = content;
				} catch (error) {
					logger.warn("Failed to read file during snapshot scan", {
						file: batchFile.file,
						error: error instanceof Error ? error.message : String(error),
					});
				}
			}),
		);
	}

	/**
	 * Creates the snapshot manifest via storage
	 */
	private async createSnapshotManifest(
		fileContents: Record<string, string>,
		workspaceRoot: string,
		options: {
			customSnapshotName?: string;
			specificFiles?: string[];
			sessionId?: string;
			isIncremental?: boolean;
		},
	): Promise<{ id: string; timestamp: number; name?: string }> {
		const { customSnapshotName, specificFiles, sessionId, isIncremental } = options;

		// Build files map
		const filesMap = new Map<string, string>();
		Object.entries(fileContents).forEach(([filePath, content]) => {
			filesMap.set(filePath, content);
		});

		// Determine trigger type
		let trigger: "auto" | "manual" | "ai-detected" | "pre-save" = "manual";
		const snapshotTrigger =
			customSnapshotName ||
			(isIncremental ? `Auto-save: ${specificFiles?.length} file(s)` : "Manual snapshot creation");

		if (snapshotTrigger.includes("Auto-save")) {
			trigger = "auto";
		} else if (snapshotTrigger.includes("AI")) {
			trigger = "ai-detected";
		}

		// Determine anchor file
		const anchorFile =
			isIncremental && specificFiles && specificFiles.length > 0
				? path.relative(workspaceRoot, specificFiles[0])
				: Array.from(filesMap.keys())[0] || workspaceRoot;

		return this.storage.createSnapshot(filesMap, {
			name:
				customSnapshotName ||
				(isIncremental ? `Auto-save: ${specificFiles?.length} file(s)` : "Manual snapshot"),
			trigger,
			anchorFile,
			...(sessionId && { metadata: { sessionId } }),
		});
	}

	/**
	 * Tracks snapshot files in session
	 */
	private trackSnapshotFiles(filePaths: string[], snapshotId: string): void {
		const snapshotStats = { added: filePaths.length, deleted: 0 };

		for (const filePath of filePaths) {
			try {
				this.sessionCoordinator.addCandidate(filePath, snapshotId, snapshotStats);
			} catch (error) {
				logger.warn("Failed to track snapshot file in session", {
					filePath,
					snapshotId,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}
	}

	/**
	 * Lists all available snapshots
	 *
	 * Uses daemon when available (thin-client), falls back to local storage.
	 */
	async listSnapshots(): Promise<
		Array<{
			id: string;
			name: string;
			timestamp: number;
			fileCount: number;
			anchorFile?: string;
		}>
	> {
		// WU-3.2: Thin-client - use daemon when available
		if (this.isDaemonAvailable()) {
			const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
			if (workspaceRoot) {
				try {
					const daemonSnapshots = await this.daemonBridge?.listSnapshots(workspaceRoot);
					if (!daemonSnapshots) throw new Error("No snapshots returned from daemon");
					return daemonSnapshots.map((s) => ({
						id: s.snapshotId,
						name: `Snapshot ${new Date(s.createdAt).toLocaleString()}`,
						timestamp: new Date(s.createdAt).getTime(),
						fileCount: s.files.length,
						anchorFile: s.files[0],
					}));
				} catch (error) {
					logger.warn("Failed to list snapshots via daemon, falling back to local", {
						error: error instanceof Error ? error.message : String(error),
					});
				}
			}
		}

		// Fallback to local storage
		const snapshots = await this.storage.listSnapshots();
		return snapshots.map((manifest) => ({
			id: manifest.id,
			name: manifest.name || new Date(manifest.timestamp).toISOString(),
			timestamp: manifest.timestamp,
			fileCount: Object.keys(manifest.files).length,
			anchorFile: manifest.anchorFile || Object.keys(manifest.files)[0],
		}));
	}

	/**
	 * Gets a snapshot with its file contents
	 *
	 * Uses daemon when available (thin-client), falls back to local storage.
	 */
	async getSnapshotWithContent(snapshotId: string): Promise<{
		id: string;
		name: string;
		timestamp: number;
		fileCount: number;
		fileContents: Record<string, string>;
	} | null> {
		// WU-3.2: Thin-client - daemon doesn't expose full content retrieval yet
		// Fall through to local storage for now
		const snapshot = await this.storage.getSnapshot(snapshotId);
		if (!snapshot) {
			return null;
		}

		return {
			id: snapshot.id,
			name: snapshot.name || new Date(snapshot.timestamp).toISOString(),
			timestamp: snapshot.timestamp,
			fileCount: Object.keys(snapshot.files).length,
			fileContents: snapshot.contents || {},
		};
	}
}
