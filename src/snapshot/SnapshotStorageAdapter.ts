import type { IStorageManager } from "../storage/types";
import type { IStorage, Snapshot } from "./SnapshotManager";

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
	constructor(private readonly storage: IStorageManager) {}

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

		// Convert new SnapshotManifest to old Snapshot type
		return {
			id: snapshot.id,
			name: snapshot.name || `Snapshot ${new Date(snapshot.timestamp).toLocaleString()}`,
			timestamp: snapshot.timestamp,
			files: Object.keys(snapshot.contents || {}),
			isProtected: false,
			icon: "circle",
			iconColor: "#4EC9B0",
		};
	}

	/**
	 * Retrieve all snapshots
	 */
	async getAll(): Promise<Snapshot[]> {
		const snapshots = await this.storage.listSnapshots();
		return snapshots.map((snapshot) => ({
			id: snapshot.id,
			name: snapshot.name || `Snapshot ${new Date(snapshot.timestamp).toLocaleString()}`,
			timestamp: snapshot.timestamp,
			files: Object.keys(snapshot.files || {}),
			isProtected: false,
			icon: "circle",
			iconColor: "#4EC9B0",
		}));
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
