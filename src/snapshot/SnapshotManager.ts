import { createHash, randomUUID } from "node:crypto";
import type { GitFileChange as FileChange } from "../types/fileChanges.js";
import type {
	CreateSnapshotOptions,
	FileInput,
	IConfirmationService,
	IEventEmitter,
	IStorage,
	RichSnapshot as Snapshot,
} from "../types/snapshot";
import type {
	IconResult,
	SnapshotNamingInfo as SnapshotInfo,
	SnapshotIconMetadata as SnapshotMetadata,
} from "../types/snapshotInfo";
import { EncryptionService } from "./EncryptionService.js";
import type { SessionCoordinator } from "./SessionCoordinator.js";
import type { FileState, SnapshotState } from "./SnapshotDeduplicator.js";
import { SnapshotDeduplicator } from "./SnapshotDeduplicator.js";
import type {
	AutoCleanupConfig,
	DeletionOptions,
	DeletionResult,
} from "./SnapshotDeletionService";
import { SnapshotDeletionService } from "./SnapshotDeletionService.js";
import { SnapshotIconStrategy } from "./SnapshotIconStrategy.js";
import { SnapshotNamingStrategy } from "./SnapshotNamingStrategy.js";

/**
 * SnapshotManager - Central orchestrator for snapshot intelligence system
 *
 * This class integrates all snapshot components into a unified API:
 * - SnapshotDeduplicator: Prevents duplicate snapshots
 * - SnapshotNamingStrategy: Generates intelligent names
 * - SnapshotIconStrategy: Assigns visual classifications
 * - SnapshotDeletionService: Manages safe deletion
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
 * @example
 * ```typescript
 * const manager = new SnapshotManager(
 *   workspaceRoot,
 *   storage,
 *   confirmationService,
 *   eventEmitter
 * );
 *
 * // Create snapshot with auto-generated name
 * const snapshot = await manager.createSnapshot([
 *   { path: 'src/auth.ts', content: 'code', action: 'add' }
 * ]);
 *
 * // Create protected snapshot with custom name
 * const protected = await manager.createSnapshot(files, {
 *   description: 'Critical feature',
 *   protected: true
 * });
 *
 * // Safe deletion with confirmation
 * await manager.deleteSnapshot(snapshot.id);
 *
 * // Auto-cleanup old snapshots
 * await manager.autoCleanup({
 *   enabled: true,
 *   olderThanDays: 30,
 *   keepProtected: true,
 *   minimumSnapshots: 10
 * });
 * ```
 */
export class SnapshotManager {
	private readonly deduplicator: SnapshotDeduplicator;
	private readonly namingStrategy: SnapshotNamingStrategy;
	private readonly iconStrategy: SnapshotIconStrategy;
	private readonly deletionService: SnapshotDeletionService;
	private readonly storage: IStorage;
	private readonly eventEmitter?: IEventEmitter;
	private readonly workspaceRoot: string;
	private readonly encryptionService: EncryptionService;
	private readonly sessionCoordinator?: SessionCoordinator;

	constructor(
		workspaceRoot: string,
		storage: IStorage,
		confirmationService: IConfirmationService,
		eventEmitter?: IEventEmitter,
		sessionCoordinator?: SessionCoordinator,
	) {
		this.workspaceRoot = workspaceRoot;
		this.storage = storage;
		this.eventEmitter = eventEmitter;
		this.sessionCoordinator = sessionCoordinator;

		// Initialize components
		this.deduplicator = new SnapshotDeduplicator(500);
		this.namingStrategy = new SnapshotNamingStrategy(workspaceRoot);
		this.iconStrategy = new SnapshotIconStrategy();
		this.encryptionService = new EncryptionService();

		// Deletion service needs access to snapshot manager methods
		this.deletionService = new SnapshotDeletionService(
			{
				get: this.get.bind(this),
				getAll: this.getAll.bind(this),
				delete: this.deleteInternal.bind(this),
				unprotect: this.unprotect.bind(this),
			},
			confirmationService,
		);
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
	async createSnapshot(
		files: FileInput[],
		options: CreateSnapshotOptions = {},
	): Promise<Snapshot> {
		// Validation
		if (files.length === 0) {
			throw new Error("Cannot create snapshot with empty file list");
		}

		// Validate all file paths are within workspace
		this.validateFilePaths(files.map((f) => f.path));

		// Convert to FileState for deduplication
		const fileStates: FileState[] = files.map((file) => {
			const content = file.content;
			const hash = createHash("sha256").update(content).digest("hex");

			// Encrypt file content
			const encrypted = this.encryptionService.encrypt(content);

			return {
				path: file.path,
				content: content,
				hash: hash,
				encrypted: encrypted,
			};
		});

		// Convert to SnapshotState for deduplication check
		const newState: SnapshotState = {
			id: `cp-${randomUUID()}`,
			timestamp: Date.now(),
			files: fileStates,
		};

		// Step 1: Check for duplicate state
		const duplicateId = this.deduplicator.findDuplicate(newState);
		if (duplicateId) {
			// Return existing snapshot, update timestamp
			const existing = await this.storage.get(duplicateId);
			if (existing) {
				await this.storage.update(duplicateId, {
					timestamp: Date.now(),
				});
				this.eventEmitter?.emit("snapshot-replaced", {
					id: duplicateId,
					reason: "duplicate",
				});
				return { ...existing, timestamp: Date.now() };
			}
		}

		// Step 2: Generate intelligent name (or use custom)
		let name: string;
		if (options.description) {
			name = options.description;
		} else {
			// Convert FileInput to FileChange for naming strategy
			const fileChanges: FileChange[] = files.map((file) => ({
				path: file.path,
				status:
					file.action === "add"
						? "added"
						: file.action === "delete"
							? "deleted"
							: "modified",
				linesAdded:
					file.action !== "delete" ? file.content.split("\n").length : 0,
				linesDeleted: file.action === "delete" ? 1 : 0,
			}));

			const snapshotInfo: SnapshotInfo = {
				files: fileChanges,
				workspaceRoot: this.workspaceRoot,
			};

			name = await this.namingStrategy.generateName(snapshotInfo);
		}

		// Step 3: Classify operation type for icon
		const metadata: SnapshotMetadata = {
			name,
			files: files.map((f) => f.path),
			isProtected: options.protected || false,
		};

		const iconResult: IconResult = this.iconStrategy.classifyIcon(metadata);

		// Step 4: Create and store snapshot
		const snapshot: Snapshot = {
			id: newState.id,
			name,
			timestamp: newState.timestamp,
			files: fileStates.map((state) => state.path),
			fileStates: fileStates,
			isProtected: options.protected || false,
			icon: iconResult.icon,
			iconColor: iconResult.color,
		};

		try {
			await this.storage.save(snapshot);
			this.eventEmitter?.emit("snapshot-created", {
				id: snapshot.id,
				name: snapshot.name,
			});

			// Track snapshot in session coordinator if available
			if (this.sessionCoordinator) {
				try {
					// Add each file to the session with basic stats
					for (const file of files) {
						const stats = {
							added:
								file.action === "add" ? file.content.split("\n").length : 0,
							deleted: file.action === "delete" ? 1 : 0,
						};
						this.sessionCoordinator.addCandidate(file.path, snapshot.id, stats);
					}
				} catch (sessionError) {
					// Log but don't fail snapshot creation
					console.error(
						"[SnapshotManager] Failed to add session candidate:",
						sessionError,
					);
				}
			}

			return snapshot;
		} catch (error) {
			// Re-throw storage errors
			throw new Error(
				`Failed to save snapshot: ${
					error instanceof Error ? error.message : "Unknown error"
				}`,
			);
		}
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
		return snapshots.sort((a, b) => b.timestamp - a.timestamp);
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
	async deleteSnapshot(
		id: string,
		options?: DeletionOptions,
	): Promise<DeletionResult> {
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
	async deleteOlderThan(
		timestamp: number,
		keepProtected = true,
	): Promise<DeletionResult> {
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
		const metadata: SnapshotMetadata = {
			name: snapshot.name,
			files: snapshot.fileStates?.map((f) => f.path) || snapshot.files || [],
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
		const metadata: SnapshotMetadata = {
			name: snapshot.name,
			files: snapshot.fileStates?.map((f) => f.path) || snapshot.files || [],
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
		const metadata: SnapshotMetadata = {
			name: newName,
			files: snapshot.fileStates?.map((f) => f.path) || snapshot.files || [],
			isProtected: snapshot.isProtected,
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
			if (!filePath.startsWith(this.workspaceRoot)) {
				throw new Error(
					`Invalid file path: ${filePath} is outside workspace root ${this.workspaceRoot}`,
				);
			}

			// Basic path traversal prevention
			if (filePath.includes("..")) {
				throw new Error(
					`Invalid file path: ${filePath} contains path traversal sequence`,
				);
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
	SnapshotState,
	FileState,
	SnapshotInfo,
	FileChange,
	SnapshotMetadata,
	IconResult,
	Snapshot,
	IStorage,
	IConfirmationService,
	IEventEmitter,
};
