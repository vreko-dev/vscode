import type { StorageManager } from "../storage/StorageManager.js";
import type { IStorage, Snapshot } from "./SnapshotManager.js";

/**
 * SnapshotStorageAdapter - Adapts StorageManager to IStorage interface
 *
 * This adapter bridges the new StorageManager with the SnapshotManager's
 * IStorage interface, enabling seamless integration without modifying
 * the existing snapshot manager.
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
	constructor(private readonly storage: StorageManager) {}

	/**
	 * Save a snapshot to storage
	 */
	async save(_snapshot: Snapshot): Promise<void> {
		// StorageManager creates snapshots via createSnapshot()
		// Direct save not supported - use SnapshotManager for creation
		throw new Error("Direct save not supported - use SnapshotManager");
	}

	/**
	 * Retrieve a snapshot by ID
	 */
	async get(id: string): Promise<Snapshot | undefined> {
		const snapshot = await this.storage.getSnapshot(id);
		if (!snapshot) return undefined;

		// Convert new SnapshotManifest to old Snapshot type
		return {
			id: snapshot.id,
			name:
				snapshot.name ||
				`Snapshot ${new Date(snapshot.timestamp).toLocaleString()}`,
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
			name:
				snapshot.name ||
				`Snapshot ${new Date(snapshot.timestamp).toLocaleString()}`,
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
	 */
	async update(id: string, updates: Partial<Snapshot>): Promise<void> {
		const snapshot = await this.get(id);
		if (snapshot) {
			const updated = { ...snapshot, ...updates };
			await this.save(updated);
		}
	}
}
