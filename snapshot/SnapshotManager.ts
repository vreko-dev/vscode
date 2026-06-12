import * as vscode from "vscode";
import { DORAMetricsService } from "../services/DORAMetricsService";
// Local implementations (thin client stubs)
import type { AutoCleanupConfig, DeletionOptions, DeletionResult } from "../types/oss-sdk";
import { SnapshotDeletionService, SnapshotNamingStrategy } from "../types/oss-sdk";
import type {
	CreateSnapshotOptions,
	FileInput,
	IConfirmationService,
	IEventEmitter,
	IStorage,
	RichSnapshot as Snapshot,
} from "../types/snapshot";
import type { IconResult, SnapshotIconMetadata as SnapshotMetadata } from "../types/snapshotInfo";
import { logger } from "../utils/logger";
import { sdkLogger } from "../utils/sdkLoggerAdapter";
import type { SessionCoordinator } from "./SessionCoordinator";
import { SnapshotIconStrategy } from "./SnapshotIconStrategy";

/**
 * SnapshotManager - Central orchestrator for snapshot intelligence system
 *
 * This class integrates all snapshot components into a unified API:
 * - SnapshotDeduplicator: Prevents duplicate snapshots
 * - SnapshotNamingStrategy: Generates intelligent names
 * - SnapshotIconStrategy: Assigns visual classifications
 * - SnapshotDeletionService: Manages safe deletion
 *
 * Delegates to the CLI daemon via DaemonBridge for storage operations.
 * The daemon protocol supports these operations:
 * - snapshot.create → bridge.createSnapshot()
 * - snapshot.list → bridge.listSnapshots()
 * - snapshot.delete → bridge.deleteSnapshot()
 * - snapshot.restore → bridge.restoreSnapshot()
 *
 * Features:
 * - Automatic duplicate detection and replacement
 * - Multi-tier intelligent naming (Git → File Operations → Content → Fallback)
 * - Visual classification with VS Code codicons
 * - Protected snapshot guards
 * - Event emission for UI synchronization
 * - Comprehensive error handling with graceful degradation
 *
 * Performance targets:
 * - Snapshot creation: < 50ms
 * - Retrieval operations: < 10ms
 * - Bulk operations: < 500ms for 100 snapshots
 *
 * MVP Note: Cloud snapshot functionality and passphrase UX have been deferred for MVP.
 * - Local snapshots only (no cloud backup)
 * - 90-day retention for Pro users
 * - Single-file quick restore
 * - Cloud snapshots with encryption will be added in M2
 *
 * @see DaemonBridge for the daemon RPC protocol
 * @see apps/cli/src/daemon/protocol.ts for available daemon methods
 */
export class SnapshotManager {
	private readonly namingStrategy: SnapshotNamingStrategy;
	private readonly iconStrategy: SnapshotIconStrategy;
	private readonly deletionService: SnapshotDeletionService;
	private readonly storage: IStorage;
	private readonly eventEmitter?: IEventEmitter;
	private readonly sessionCoordinator?: SessionCoordinator;

	constructor(
		_workspaceRoot: string,
		storage: IStorage,
		confirmationService: IConfirmationService,
		eventEmitter?: IEventEmitter,
		sessionCoordinator?: SessionCoordinator,
	) {
		// Note: workspaceRoot parameter kept for compatibility but unused
		// (now fetched dynamically via getCurrentWorkspaceRoot to support workspace switches)
		this.storage = storage;
		this.eventEmitter = eventEmitter;
		this.sessionCoordinator = sessionCoordinator;

		// Initialize components (thin client - no local encryption/deduplication)
		this.namingStrategy = new SnapshotNamingStrategy(this.getCurrentWorkspaceRoot(), {
			logger: sdkLogger,
		});
		this.iconStrategy = new SnapshotIconStrategy();

		// Deletion service needs access to snapshot manager methods
		this.deletionService = new SnapshotDeletionService({
			snapshotManager: {
				listAll: async () => {
					const snapshots = await this.getAll();
					return snapshots.map((s) => ({
						id: s.id,
						createdAt: s.timestamp ?? s.createdAt ?? 0,
						origin: s.origin,
						label: s.name,
						fileCount: s.files?.length ?? 0,
					}));
				},
				delete: this.deleteInternal.bind(this),
			},
			confirmationService,
			logger: sdkLogger,
		});
	}

	/**
	 * Get current workspace root dynamically
	 *
	 * BUG FIX: Previously cached at construction time, causing stale paths
	 * when testing in different workspaces. Now fetches current workspace.
	 *
	 * @returns Current workspace root path or empty string if none open
	 * @throws Error if workspace root cannot be determined
	 */
	private getCurrentWorkspaceRoot(): string {
		const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
		if (!workspaceRoot) {
			throw new Error("No workspace folder is open");
		}
		return workspaceRoot;
	}

	/**
	 * Create a new snapshot with intelligent naming and deduplication
	 *
	 * @param files - Array of file changes to snapshot
	 * @param options - Creation options (description, protection)
	 * @returns Promise resolving to created or existing snapshot
	 * @throws Error if files array is empty
	 * @throws Error if file paths are invalid or outside workspace
	 *
	 * @performance < 50ms for typical snapshot creation
	 *
	 * @example
	 * ```typescript
	 * // Auto-generated name
	 * const snapshot = await manager.createSnapshot([
	 *   { path: 'src/auth.ts', content: 'code', action: 'add' }
	 * ]);
	 *
	 * // Custom name and protected
	 * const protected = await manager.createSnapshot(files, {
	 *   description: 'Critical feature',
	 *   protected: true
	 * });
	 * ```
	 */
	async createSnapshot(files: FileInput[], options: CreateSnapshotOptions = {}): Promise<Snapshot> {
		// Validation
		if (files.length === 0) {
			throw new Error("Cannot create snapshot with empty file list");
		}

		// Validate all file paths are within workspace
		this.validateFilePaths(files.map((f) => f.path));

		// Generate intelligent name (or use custom)
		let name: string;
		if (options.description) {
			name = options.description;
		} else {
			// Use the naming strategy with the correct type
			const snapshotInfoForNaming = {
				id: `temp-${Date.now()}`,
				origin: options.origin ?? "manual",
				createdAt: Date.now(),
				files: files.map((f) => ({ path: f.path })),
			};

			name = this.namingStrategy.generateName(snapshotInfoForNaming);
		}

		// THIN CLIENT: Delegate snapshot creation to storage (daemon or local)
		// The storage implementation handles encryption, deduplication, and persistence
		const snapshot = await this.storage.create(files, {
			description: name,
			protected: options.protected,
			origin: options.origin,
		});

		// Classify operation type for icon (UI concern)
		const metadata: SnapshotMetadata = {
			name: snapshot.name || name,
			files: files.map((f) => f.path),
			isProtected: options.protected || false,
		};

		const iconResult: IconResult = this.iconStrategy.classifyIcon(metadata);

		// Add UI-only properties to snapshot
		const enrichedSnapshot: Snapshot = {
			...snapshot,
			icon: iconResult.icon,
			iconColor: iconResult.color,
		};

		// Emit creation event
		this.eventEmitter?.emit("snapshot-created", {
			id: snapshot.id,
			name: snapshot.name,
		});

		// Record snapshot creation in DORA metrics
		try {
			const doraMetrics = DORAMetricsService.for(this.getCurrentWorkspaceRoot());
			const origin = options.origin ?? "manual";
			const timeSinceLastChange = options.timeSinceLastChangeMs ?? 0;
			const isRecoveryTriggered = origin === "recovery";
			doraMetrics.recordSnapshotCreated(snapshot.id, origin, timeSinceLastChange, isRecoveryTriggered);
			logger.debug("DORA metrics recorded for snapshot", {
				snapshotId: snapshot.id,
				origin,
				timeSinceLastChange,
			});
		} catch (metricsError) {
			// Log but don't fail snapshot creation for metrics errors
			logger.warn("Failed to record DORA metrics for snapshot", {
				snapshotId: snapshot.id,
				error: metricsError instanceof Error ? metricsError.message : String(metricsError),
			});
		}

		// Track snapshot in session coordinator if available
		if (this.sessionCoordinator) {
			try {
				// Add each file to the session with basic stats
				for (const file of files) {
					const stats = {
						added: file.action === "add" ? file.content.split("\n").length : 0,
						deleted: file.action === "delete" ? 1 : 0,
					};
					this.sessionCoordinator.addCandidate(file.path, snapshot.id, stats);
				}
			} catch (sessionError) {
				// Log but don't fail snapshot creation
				logger.error(
					"SnapshotManager: Failed to add session candidate",
					sessionError instanceof Error ? sessionError : undefined,
				);
			}
		}

		return enrichedSnapshot;
	}

	/**
	 * Retrieve snapshot by ID
	 *
	 * @param id - Snapshot identifier
	 * @returns Promise resolving to snapshot or undefined if not found
	 *
	 * @performance < 10ms
	 *
	 * @example
	 * ```typescript
	 * const snapshot = await manager.get('cp-123');
	 * if (snapshot) {
	 *   logger.info(snapshot.name);
	 * }
	 * ```
	 */
	async get(id: string): Promise<Snapshot | undefined> {
		return this.storage.get(id);
	}

	/**
	 * Retrieve all snapshots sorted by timestamp (newest first)
	 *
	 * @returns Promise resolving to array of all snapshots
	 *
	 * @performance < 50ms for typical snapshot counts
	 *
	 * @example
	 * ```typescript
	 * const all = await manager.getAll();
	 * logger.info(`Total snapshots: ${all.length}`);
	 * ```
	 */
	async getAll(): Promise<Snapshot[]> {
		const snapshots = await this.storage.getAll();
		// Sort by timestamp, newest first
		return snapshots.sort((a, b) => (b.timestamp ?? b.createdAt ?? 0) - (a.timestamp ?? a.createdAt ?? 0));
	}

	/**
	 * Delete snapshot with safety checks and confirmation
	 *
	 * @param id - Snapshot identifier
	 * @param options - Deletion options (skipConfirmation, unprotectFirst)
	 * @returns Promise resolving to deletion result
	 * @throws Error if snapshot is protected without unprotectFirst flag
	 * @throws Error if snapshot does not exist
	 *
	 * @performance < 50ms including confirmation dialog
	 *
	 * @example
	 * ```typescript
	 * // With confirmation
	 * await manager.deleteSnapshot('snapshot-123');
	 *
	 * // Skip confirmation
	 * await manager.deleteSnapshot('snapshot-123', { skipConfirmation: true });
	 *
	 * // Delete protected snapshot
	 * await manager.deleteSnapshot('snapshot-123', { unprotectFirst: true });
	 * ```
	 */
	async deleteSnapshot(id: string, options?: DeletionOptions): Promise<DeletionResult> {
		const result = await this.deletionService.deleteSnapshot(id, options);
		if (result.success) {
			this.eventEmitter?.emit("snapshot-deleted", { id });
		}
		return result;
	}

	/**
	 * Delete all snapshots older than specified timestamp
	 *
	 * @param timestamp - Cutoff timestamp (milliseconds since epoch)
	 * @param keepProtected - If true, skip protected snapshots
	 * @returns Promise resolving to deletion result with count
	 *
	 * @performance < 500ms for 100 snapshots
	 *
	 * @example
	 * ```typescript
	 * // Delete snapshots older than 30 days
	 * const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
	 * const result = await manager.deleteOlderThan(thirtyDaysAgo, true);
	 * logger.info(`Deleted ${result.deletedCount} snapshots`);
	 * ```
	 */
	async deleteOlderThan(timestamp: number, keepProtected = true): Promise<DeletionResult> {
		return this.deletionService.deleteOlderThan(timestamp, keepProtected);
	}

	/**
	 * Perform automatic cleanup based on configuration
	 *
	 * @param config - Auto-cleanup configuration
	 * @returns Promise resolving to deletion result
	 *
	 * @example
	 * ```typescript
	 * await manager.autoCleanup({
	 *   enabled: true,
	 *   olderThanDays: 30,
	 *   keepProtected: true,
	 *   minimumSnapshots: 10
	 * });
	 * ```
	 */
	async autoCleanup(config: AutoCleanupConfig): Promise<DeletionResult> {
		return this.deletionService.autoCleanup(config);
	}

	/**
	 * Protect snapshot from deletion
	 *
	 * @param id - Snapshot identifier
	 * @throws Error if snapshot does not exist
	 *
	 * @example
	 * ```typescript
	 * await manager.protect('cp-123');
	 * ```
	 */
	async protect(id: string): Promise<void> {
		const snapshot = await this.storage.get(id);
		if (!snapshot) {
			throw new Error(`Snapshot not found: ${id}`);
		}

		// Update protection status and icon
		const files = snapshot.files?.map((f) => (typeof f === "string" ? f : f.path)) || [];
		const metadata: SnapshotMetadata = {
			name: snapshot.name || `Snapshot ${id}`,
			files,
			isProtected: true,
		};

		const iconResult = this.iconStrategy.classifyIcon(metadata);

		await this.storage.update(id, {
			isProtected: true,
			icon: iconResult.icon,
			iconColor: iconResult.color,
		});

		this.eventEmitter?.emit("snapshot-protected", { id });
	}

	/**
	 * Unprotect snapshot allowing deletion
	 *
	 * @param id - Snapshot identifier
	 * @throws Error if snapshot does not exist
	 *
	 * @example
	 * ```typescript
	 * await manager.unprotect('cp-123');
	 * ```
	 */
	async unprotect(id: string): Promise<void> {
		const snapshot = await this.storage.get(id);
		if (!snapshot) {
			throw new Error(`Snapshot not found: ${id}`);
		}

		// Update protection status and icon
		const files = snapshot.files?.map((f) => (typeof f === "string" ? f : f.path)) || [];
		const metadata: SnapshotMetadata = {
			name: snapshot.name || `Snapshot ${id}`,
			files,
			isProtected: false,
		};

		const iconResult = this.iconStrategy.classifyIcon(metadata);

		await this.storage.update(id, {
			isProtected: false,
			icon: iconResult.icon,
			iconColor: iconResult.color,
		});

		this.eventEmitter?.emit("snapshot-unprotected", { id });
	}

	/**
	 * Rename snapshot
	 *
	 * @param id - Snapshot identifier
	 * @param newName - New snapshot name
	 * @throws Error if snapshot does not exist
	 *
	 * @example
	 * ```typescript
	 * await manager.rename('cp-123', 'Critical feature snapshot');
	 * ```
	 */
	async rename(id: string, newName: string): Promise<void> {
		const snapshot = await this.storage.get(id);
		if (!snapshot) {
			throw new Error(`Snapshot not found: ${id}`);
		}

		// Update name and potentially icon (name affects classification)
		const files = snapshot.files?.map((f) => (typeof f === "string" ? f : f.path)) || [];
		const metadata: SnapshotMetadata = {
			name: newName,
			files,
			isProtected: snapshot.isProtected ?? false,
		};

		const iconResult = this.iconStrategy.classifyIcon(metadata);

		await this.storage.update(id, {
			name: newName,
			icon: iconResult.icon,
			iconColor: iconResult.color,
		});

		this.eventEmitter?.emit("snapshot-renamed", { id, newName });
	}

	/**
	 * Internal deletion method used by deletion service
	 * Does not emit events (handled by public deleteSnapshot)
	 */
	private async deleteInternal(id: string): Promise<void> {
		await this.storage.delete(id);
	}

	/**
	 * Validate file paths are within workspace
	 * @throws Error if any path is outside workspace or invalid
	 */
	private validateFilePaths(paths: string[]): void {
		for (const filePath of paths) {
			// Check if path is absolute and within workspace
			const currentWorkspaceRoot = this.getCurrentWorkspaceRoot();
			if (!filePath.startsWith(currentWorkspaceRoot)) {
				throw new Error(`Invalid file path: ${filePath} is outside workspace root ${currentWorkspaceRoot}`);
			}

			// Basic path traversal prevention
			if (filePath.includes("..")) {
				throw new Error(`Invalid file path: ${filePath} contains path traversal sequence`);
			}

			// Null byte injection prevention
			if (filePath.includes("\0")) {
				throw new Error(`Invalid file path: ${filePath} contains null byte`);
			}
		}
	}
}

/**
 * Export all types for external use
 */
export type {
	DeletionOptions,
	DeletionResult,
	AutoCleanupConfig,
	SnapshotMetadata,
	IconResult,
	Snapshot,
	IStorage,
	IConfirmationService,
	IEventEmitter,
};
