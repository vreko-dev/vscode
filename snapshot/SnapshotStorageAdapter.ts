import type { IStorageManager } from "../storage/types";
import type {
	FileInput,
	IStorage,
	IStorageCreateOptions,
	RichSnapshot as Snapshot,
	SnapshotOrigin,
} from "../types/snapshot";

/**
 * SnapshotStorageAdapter - Adapts StorageManager to IStorage interface
 *
 * Provides a bridge between the IStorage interface used by SnapshotManager
 * and the StorageManager implementation. Delegates to DaemonBridge for
 * actual storage operations.
 *
 * @see DaemonBridge for the daemon RPC protocol
 */

/**
 * SnapshotStorageAdapter - Adapts StorageManager to IStorage interface
 *
 * This adapter bridges the new StorageManager with the SnapshotManager's
 * IStorage interface, enabling seamless integration without modifying
 * the existing snapshot manager.
 *
 * DESIGN NOTE: This adapter is a READ-ONLY bridge for the UI-focused SnapshotManager.
 * For snapshot creation, use OperationCoordinator.coordinateSnapshotCreation() which
 * goes through StorageManager directly. The save() method throws by design to prevent
 * accidental misuse.
 *
 * @example
 * ```typescript
 * const adapter = new SnapshotStorageAdapter(storageManager);
 * const manager = new SnapshotManager(
 *   workspaceRoot,
 *   adapter,
 *   confirmationService
 * );
 * ```
 */
export class SnapshotStorageAdapter implements IStorage {
	constructor(private readonly storage: IStorageManager) {
		/* intentionally empty */
	}

	/**
	 * Create a new snapshot via StorageManager
	 *
	 * This delegates to StorageManager.createSnapshot() which handles
	 * the actual storage via DaemonStorageBackend (thin client).
	 *
	 * @param files - Array of file inputs with path and content
	 * @param options - Creation options (description, protected, origin)
	 * @returns Promise resolving to the created snapshot
	 */
	async create(files: FileInput[], options?: IStorageCreateOptions): Promise<Snapshot> {
		if (files.length === 0) {
			throw new Error("Cannot create snapshot with empty file list");
		}

		// Convert FileInput[] to Map<string, string> for StorageManager
		const filesMap = new Map<string, string>();
		for (const file of files) {
			filesMap.set(file.path, file.content);
		}

		// Determine trigger from origin
		const trigger = this.mapOriginToTrigger(options?.origin);

		// Create snapshot via StorageManager
		const manifest = await this.storage.createSnapshot(filesMap, {
			name: options?.description || "Snapshot",
			trigger,
			anchorFile: files[0].path,
		});

		// Convert manifest to RichSnapshot
		const filePaths = Object.keys(manifest.files || {});
		const origin: SnapshotOrigin = options?.origin || "manual";

		return {
			id: manifest.id,
			name: manifest.name || options?.description || `Snapshot ${new Date(manifest.timestamp).toLocaleString()}`,
			timestamp: manifest.timestamp,
			origin,
			createdAt: manifest.timestamp,
			version: "1.0",
			files: filePaths.map((path) => ({
				path,
				content: "", // Content not stored in manifest
				hash: manifest.files[path]?.blob || "",
				size: manifest.files[path]?.size || 0,
			})),
			fileCount: filePaths.length,
			totalSize: Object.values(manifest.files).reduce((sum, ref) => sum + (ref?.size || 0), 0),
			isProtected: options?.protected || false,
		};
	}

	/**
	 * Map extension origin to StorageManager trigger type
	 */
	private mapOriginToTrigger(origin?: SnapshotOrigin): "manual" | "auto" | "ai-detected" | "pre-save" {
		switch (origin) {
			case "auto":
				return "auto";
			case "pre-save":
				return "pre-save";
			case "ai-detected":
				return "ai-detected";
			default:
				return "manual";
		}
	}

	/**
	 * Save a snapshot to storage
	 *
	 * BY DESIGN: This throws because the adapter is a read-only bridge.
	 * Snapshot creation should go through:
	 * - OperationCoordinator.coordinateSnapshotCreation() (main path)
	 * - StorageManager.createSnapshot() (direct path)
	 *
	 * The SnapshotManager using this adapter is for UI operations (view, delete, protect)
	 * not for creating new snapshots.
	 */
	async save(_snapshot: Snapshot): Promise<void> {
		throw new Error(
			"Direct save not supported - use OperationCoordinator.coordinateSnapshotCreation() for snapshot creation",
		);
	}

	/**
	 * Retrieve a snapshot by ID
	 */
	async get(id: string): Promise<Snapshot | undefined> {
		const snapshot = await this.storage.getSnapshot(id);
		if (!snapshot) {
			return undefined;
		}

		// Convert new SnapshotManifest to old RichSnapshot type
		const filePaths = Object.keys(snapshot.contents || {});
		const origin: SnapshotOrigin =
			snapshot.trigger === "manual" ? "manual" : snapshot.trigger === "auto" ? "auto" : "manual";

		return {
			id: snapshot.id,
			name: snapshot.name || `Snapshot ${new Date(snapshot.timestamp).toLocaleString()}`,
			timestamp: snapshot.timestamp,
			origin,
			createdAt: snapshot.timestamp,
			version: "1.0", // Required by contracts Snapshot schema
			files: filePaths.map((path) => ({
				path,
				content: snapshot.contents?.[path] || "",
				hash: snapshot.files[path]?.blob || "",
				size: snapshot.files[path]?.size || 0,
			})),
			fileCount: filePaths.length,
			totalSize: Object.values(snapshot.files).reduce((sum, ref) => sum + (ref?.size || 0), 0),
			isProtected: false,
		};
	}

	/**
	 * Retrieve all snapshots
	 */
	async getAll(): Promise<Snapshot[]> {
		const snapshots = await this.storage.listSnapshots();
		return snapshots.map((snapshot) => {
			const filePaths = Object.keys(snapshot.files || {});
			const origin: SnapshotOrigin =
				snapshot.trigger === "manual" ? "manual" : snapshot.trigger === "auto" ? "auto" : "manual";

			return {
				id: snapshot.id,
				name: snapshot.name || `Snapshot ${new Date(snapshot.timestamp).toLocaleString()}`,
				timestamp: snapshot.timestamp,
				origin,
				createdAt: snapshot.timestamp,
				version: "1.0", // Required by contracts Snapshot schema
				files: filePaths.map((path) => ({
					path,
					content: "",
					hash: snapshot.files[path]?.blob || "",
					size: snapshot.files[path]?.size || 0,
				})),
				fileCount: filePaths.length,
				totalSize: Object.values(snapshot.files).reduce((sum, ref) => sum + (ref?.size || 0), 0),
				isProtected: false,
			};
		});
	}

	/**
	 * Delete a snapshot by ID
	 */
	async delete(id: string): Promise<void> {
		await this.storage.deleteSnapshot(id);
	}

	/**
	 * Update snapshot properties
	 *
	 * BY DESIGN: This throws because the adapter is read-only.
	 * Metadata updates (protect, unprotect, rename) should be handled
	 * at the StorageManager level directly.
	 */
	async update(_id: string, _updates: Partial<Snapshot>): Promise<void> {
		throw new Error("Direct update not supported - metadata updates should go through StorageManager");
	}
}
