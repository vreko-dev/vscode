/**
 * DaemonSnapshotAdapter - IStorage implementation that delegates to the daemon
 *
 * This adapter implements the IStorage interface used by SnapshotManager and other
 * extension components, but delegates all operations to the Vreko daemon via
 * DaemonBridge. This is part of the thin-client architecture where the extension
 * handles only UI concerns while the daemon manages actual snapshot storage.
 *
 * ## Architecture (WU-3.2)
 *
 * ```
 * SnapshotManager / UI Components
 *           ↓
 * DaemonSnapshotAdapter (this class)
 *           ↓ (implements IStorage)
 * DaemonBridge
 *           ↓ (JSON-RPC over Unix socket)
 * Vreko Daemon
 *           ↓
 * Actual Snapshot Storage
 * ```
 *
 * ## Design Notes
 *
 * - Read operations (get, getAll) retrieve from daemon and convert to RichSnapshot
 * - Write operations (save) are BLOCKED - snapshots should be created via OperationCoordinator
 * - Update operations delegate to daemon's protect/unprotect/rename methods
 * - Delete operations delegate to daemon's deleteSnapshot
 *
 * @see SnapshotStorageAdapter for the deprecated local storage adapter
 * @see DaemonBridge for the IPC transport layer
 * @see IStorage for the interface contract
 *
 * @module adapters/DaemonSnapshotAdapter
 */

import type { DaemonBridge } from "../services/DaemonBridge";
import type {
	FileInput,
	IStorage,
	IStorageCreateOptions,
	RichSnapshot as Snapshot,
	SnapshotOrigin,
} from "../types/snapshot";
import { logger } from "../utils/logger";

/**
 * Daemon snapshot list response item
 */
interface DaemonSnapshotListItem {
	snapshotId: string;
	createdAt: number;
	files: string[];
	name?: string;
	isProtected?: boolean;
	trigger?: string;
}

/**
 * DaemonSnapshotAdapter implements IStorage by delegating to the daemon.
 *
 * This adapter converts between the extension's RichSnapshot type and the daemon's
 * snapshot representation, handling all necessary type transformations.
 *
 * @example
 * ```typescript
 * const adapter = new DaemonSnapshotAdapter(daemonBridge, workspacePath);
 * const manager = new SnapshotManager(workspacePath, adapter, confirmationService);
 * ```
 */
export class DaemonSnapshotAdapter implements IStorage {
	constructor(
		private readonly bridge: DaemonBridge,
		private readonly workspacePath: string,
	) {
		/* intentionally empty */
	}

	/**
	 * Create a new snapshot by delegating to the daemon
	 *
	 * This is the primary method for creating snapshots via the daemon.
	 * The daemon handles encryption, deduplication, and storage.
	 *
	 * @param files - Array of file inputs with path and content
	 * @param options - Creation options (description, protected, origin)
	 * @returns Promise resolving to the created snapshot
	 */
	async create(files: FileInput[], options?: IStorageCreateOptions): Promise<Snapshot> {
		if (!this.bridge.isConnected()) {
			throw new Error("Not connected to daemon - cannot create snapshot");
		}

		if (files.length === 0) {
			throw new Error("Cannot create snapshot with empty file list");
		}

		// Map origin to trigger for daemon
		const trigger = this.mapOriginToTrigger(options?.origin);

		// Call daemon to create snapshot
		const result = await this.bridge.createSnapshot(
			this.workspacePath,
			files.map((f) => f.path),
			{
				reason: options?.description,
				trigger,
			},
		);

		// Convert daemon response to RichSnapshot
		const timestamp = new Date(result.createdAt).getTime();
		const snapshot: Snapshot = {
			id: result.snapshotId,
			name: options?.description || `Snapshot ${new Date(timestamp).toLocaleString()}`,
			timestamp,
			origin: options?.origin || "manual",
			createdAt: timestamp,
			version: "1.0",
			files: files.map((f) => ({
				path: f.path,
				content: f.content,
				hash: "", // Hash computed by daemon
				size: f.content.length,
			})),
			fileCount: files.length,
			totalSize: files.reduce((sum, f) => sum + f.content.length, 0),
			isProtected: options?.protected || false,
		};

		logger.info("DaemonSnapshotAdapter: Snapshot created via daemon", {
			snapshotId: result.snapshotId,
			fileCount: files.length,
		});

		return snapshot;
	}

	/**
	 * Map extension origin to daemon trigger type
	 */
	private mapOriginToTrigger(origin?: SnapshotOrigin): "manual" | "mcp" | "ai_assist" | "session_end" {
		switch (origin) {
			case "auto":
			case "pre-save":
				return "manual"; // Auto-save treated as manual trigger
			case "ai-detected":
				return "ai_assist";
			case "recovery":
			case "pre-restore":
				return "session_end";
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
	 * - DaemonBridge.createSnapshot() (direct path)
	 *
	 * The SnapshotManager using this adapter is for UI operations (view, delete, protect)
	 * not for creating new snapshots.
	 *
	 * @throws Always throws - use DaemonBridge.createSnapshot() directly
	 */
	async save(_snapshot: Snapshot): Promise<void> {
		throw new Error(
			"Direct save not supported via DaemonSnapshotAdapter - use DaemonBridge.createSnapshot() for snapshot creation",
		);
	}

	/**
	 * Retrieve a snapshot by ID
	 *
	 * Fetches the snapshot from the daemon and converts to RichSnapshot format.
	 * Note: The daemon's snapshot.get action must be implemented for this to work.
	 * Falls back to listing all snapshots and filtering if get is not available.
	 *
	 * @param id - Snapshot identifier
	 * @returns Promise resolving to snapshot or undefined if not found
	 */
	async get(id: string): Promise<Snapshot | undefined> {
		if (!this.bridge.isConnected()) {
			logger.warn("DaemonSnapshotAdapter.get: Not connected to daemon");
			return undefined;
		}

		try {
			// Try direct get first (if daemon supports it)
			const result = await this.bridge.request<{
				snapshot?: {
					snapshotId: string;
					createdAt: number;
					files: Array<{ path: string; content?: string; hash?: string; size?: number }>;
					name?: string;
					isProtected?: boolean;
					trigger?: string;
				};
			}>("snapshot.get", { workspace: this.workspacePath, snapshotId: id });

			if (result?.snapshot) {
				return this.convertToRichSnapshot(result.snapshot);
			}
		} catch (error) {
			// If snapshot.get is not implemented, fall back to listing and filtering
			logger.debug("DaemonSnapshotAdapter.get: Falling back to list+filter", {
				id,
				error: error instanceof Error ? error.message : String(error),
			});
		}

		// Fallback: Get all snapshots and find the one with matching ID
		const all = await this.getAll();
		return all.find((s) => s.id === id);
	}

	/**
	 * Retrieve all snapshots
	 *
	 * Lists all snapshots from the daemon and converts to RichSnapshot format.
	 * Results are sorted by timestamp (newest first).
	 *
	 * @returns Promise resolving to array of snapshots
	 */
	async getAll(): Promise<Snapshot[]> {
		if (!this.bridge.isConnected()) {
			logger.warn("DaemonSnapshotAdapter.getAll: Not connected to daemon");
			return [];
		}

		try {
			const snapshots = await this.bridge.listSnapshots(this.workspacePath);
			return snapshots
				.map((s) => this.convertListItemToRichSnapshot(s))
				.sort((a, b) => b.createdAt - a.createdAt);
		} catch (error) {
			logger.error("DaemonSnapshotAdapter.getAll: Failed to list snapshots", {
				error: error instanceof Error ? error.message : String(error),
			});
			return [];
		}
	}

	/**
	 * Delete a snapshot by ID
	 *
	 * Delegates to the daemon's snapshot.delete action.
	 *
	 * @param id - Snapshot identifier
	 */
	async delete(id: string): Promise<void> {
		if (!this.bridge.isConnected()) {
			throw new Error("Not connected to daemon");
		}

		await this.bridge.deleteSnapshot(this.workspacePath, id);
	}

	/**
	 * Update snapshot properties
	 *
	 * Delegates to the daemon's protect/unprotect/rename actions based on
	 * which properties are being updated.
	 *
	 * Supported updates:
	 * - isProtected: true → snapshot.protect
	 * - isProtected: false → snapshot.unprotect
	 * - name: string → snapshot.rename
	 *
	 * @param id - Snapshot identifier
	 * @param updates - Partial snapshot with properties to update
	 */
	async update(id: string, updates: Partial<Snapshot>): Promise<void> {
		if (!this.bridge.isConnected()) {
			throw new Error("Not connected to daemon");
		}

		// Handle protection status changes
		if (updates.isProtected === true) {
			await this.bridge.protectSnapshot(this.workspacePath, id);
		} else if (updates.isProtected === false) {
			await this.bridge.unprotectSnapshot(this.workspacePath, id);
		}

		// Handle rename
		if (updates.name !== undefined) {
			await this.bridge.renameSnapshot(this.workspacePath, id, updates.name);
		}

		// Note: Other updates (icon, iconColor, etc.) are not persisted to daemon
		// They are client-side UI concerns that will be regenerated on next fetch
		if (updates.icon || updates.iconColor) {
			logger.debug("DaemonSnapshotAdapter.update: Icon/color updates are client-side only", { id });
		}
	}

	// =========================================================================
	// CONVERSION HELPERS
	// =========================================================================

	/**
	 * Convert daemon snapshot response to RichSnapshot format
	 */
	private convertToRichSnapshot(daemon: {
		snapshotId: string;
		createdAt: number;
		files: Array<{ path: string; content?: string; hash?: string; size?: number }>;
		name?: string;
		isProtected?: boolean;
		trigger?: string;
	}): Snapshot {
		const timestamp =
			typeof daemon.createdAt === "number" ? daemon.createdAt : new Date(daemon.createdAt).getTime();
		const origin = this.mapTriggerToOrigin(daemon.trigger);

		return {
			id: daemon.snapshotId,
			name: daemon.name || `Snapshot ${new Date(timestamp).toLocaleString()}`,
			timestamp,
			origin,
			createdAt: timestamp,
			version: "1.0",
			files: daemon.files.map((f) => ({
				path: f.path,
				content: f.content || "",
				hash: f.hash || "",
				size: f.size || 0,
			})),
			fileCount: daemon.files.length,
			totalSize: daemon.files.reduce((sum, f) => sum + (f.size || 0), 0),
			isProtected: daemon.isProtected || false,
		};
	}

	/**
	 * Convert daemon list item to RichSnapshot format
	 * List items have less detail than full snapshot responses
	 */
	private convertListItemToRichSnapshot(item: DaemonSnapshotListItem): Snapshot {
		const timestamp = typeof item.createdAt === "number" ? item.createdAt : new Date(item.createdAt).getTime();
		const origin = this.mapTriggerToOrigin(item.trigger);

		return {
			id: item.snapshotId,
			name: item.name || `Snapshot ${new Date(timestamp).toLocaleString()}`,
			timestamp,
			origin,
			createdAt: timestamp,
			version: "1.0",
			files: item.files.map((path) => ({
				path,
				content: "", // Content not available in list response
				hash: "",
				size: 0,
			})),
			fileCount: item.files.length,
			totalSize: 0, // Not available in list response
			isProtected: item.isProtected || false,
		};
	}

	/**
	 * Map daemon trigger types to extension SnapshotOrigin types
	 */
	private mapTriggerToOrigin(trigger?: string): SnapshotOrigin {
		switch (trigger) {
			case "manual":
				return "manual";
			case "auto":
				return "auto";
			case "pre-save":
				return "pre-save";
			case "ai-detection":
			case "ai_assist":
				return "ai-detected";
			case "scheduled":
				return "scheduled";
			case "pre-restore":
				return "pre-restore";
			case "recovery":
				return "recovery";
			default:
				return "manual";
		}
	}
}
