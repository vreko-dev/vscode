/**
 * MCP Storage Service
 *
 * Provides persistent storage for MCP observation and change queues
 * using VSCode's globalState. Ensures data survives extension restarts.
 *
 * P0-5: Offline-first architecture for MCP bridge
 *
 * @module mcp/MCPStorage
 */

import type { MCPFileChange, MCPObservation } from "@vreko/mcp-client";
import type * as vscode from "vscode";

const STORAGE_KEYS = {
	OBSERVATION_QUEUE: "mcp.observationQueue",
	CHANGE_QUEUE: "mcp.changeQueue",
	LAST_SYNC_AT: "mcp.lastSyncAt",
	DEVICE_ID: "mcp.deviceId",
} as const;

/**
 * Stored observation with metadata
 */
interface StoredObservation extends Omit<MCPObservation, "workspaceId"> {
	storedAt: number;
	retryCount: number;
}

/**
 * Stored change with metadata
 */
interface StoredChange extends Omit<MCPFileChange, "workspaceId"> {
	storedAt: number;
	retryCount: number;
}

/**
 * MCP Storage Service
 */
export class MCPStorage {
	private deviceId: string;

	constructor(private globalState: vscode.Memento) {
		this.deviceId = this.getOrCreateDeviceId();
	}

	/**
	 * Get or create a stable device ID for this VSCode instance
	 */
	private getOrCreateDeviceId(): string {
		let deviceId = this.globalState.get<string>(STORAGE_KEYS.DEVICE_ID);
		if (!deviceId) {
			deviceId = `vscode-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
			this.globalState.update(STORAGE_KEYS.DEVICE_ID, deviceId);
		}
		return deviceId;
	}

	/**
	 * Get the device ID
	 */
	getDeviceId(): string {
		return this.deviceId;
	}

	/**
	 * Save observation queue to persistent storage
	 */
	async saveObservationQueue(observations: MCPObservation[]): Promise<void> {
		const stored: StoredObservation[] = observations.map((obs) => ({
			...obs,
			storedAt: Date.now(),
			retryCount: 0,
		}));
		await this.globalState.update(STORAGE_KEYS.OBSERVATION_QUEUE, stored);
	}

	/**
	 * Save change queue to persistent storage
	 */
	async saveChangeQueue(changes: MCPFileChange[]): Promise<void> {
		const stored: StoredChange[] = changes.map((change) => ({
			...change,
			storedAt: Date.now(),
			retryCount: 0,
		}));
		await this.globalState.update(STORAGE_KEYS.CHANGE_QUEUE, stored);
	}

	/**
	 * Load observation queue from persistent storage
	 */
	loadObservationQueue(): MCPObservation[] {
		const stored = this.globalState.get<StoredObservation[]>(STORAGE_KEYS.OBSERVATION_QUEUE, []);
		// Filter out items older than 24 hours (stale data)
		const cutoff = Date.now() - 24 * 60 * 60 * 1000;
		return stored
			.filter((item) => item.storedAt > cutoff)
			.map(({ storedAt, retryCount, ...obs }) => obs as MCPObservation);
	}

	/**
	 * Load change queue from persistent storage
	 */
	loadChangeQueue(): MCPFileChange[] {
		const stored = this.globalState.get<StoredChange[]>(STORAGE_KEYS.CHANGE_QUEUE, []);
		// Filter out items older than 24 hours (stale data)
		const cutoff = Date.now() - 24 * 60 * 60 * 1000;
		return stored
			.filter((item) => item.storedAt > cutoff)
			.map(({ storedAt, retryCount, ...change }) => change as MCPFileChange);
	}

	/**
	 * Clear observation queue from storage after successful push
	 */
	async clearObservationQueue(): Promise<void> {
		await this.globalState.update(STORAGE_KEYS.OBSERVATION_QUEUE, undefined);
	}

	/**
	 * Clear change queue from storage after successful push
	 */
	async clearChangeQueue(): Promise<void> {
		await this.globalState.update(STORAGE_KEYS.CHANGE_QUEUE, undefined);
	}

	/**
	 * Update last sync timestamp
	 */
	async updateLastSyncAt(): Promise<void> {
		await this.globalState.update(STORAGE_KEYS.LAST_SYNC_AT, Date.now());
	}

	/**
	 * Get last sync timestamp
	 */
	getLastSyncAt(): number | undefined {
		return this.globalState.get<number>(STORAGE_KEYS.LAST_SYNC_AT);
	}

	/**
	 * Get queue statistics for debugging
	 */
	getStats(): {
		observationsInStorage: number;
		changesInStorage: number;
		lastSyncAt: number | undefined;
		deviceId: string;
	} {
		const observations = this.globalState.get<StoredObservation[]>(STORAGE_KEYS.OBSERVATION_QUEUE, []);
		const changes = this.globalState.get<StoredChange[]>(STORAGE_KEYS.CHANGE_QUEUE, []);
		return {
			observationsInStorage: observations.length,
			changesInStorage: changes.length,
			lastSyncAt: this.getLastSyncAt(),
			deviceId: this.deviceId,
		};
	}

	/**
	 * Clear all MCP storage (for logout/reset)
	 */
	async clearAll(): Promise<void> {
		await Promise.all([
			this.globalState.update(STORAGE_KEYS.OBSERVATION_QUEUE, undefined),
			this.globalState.update(STORAGE_KEYS.CHANGE_QUEUE, undefined),
			this.globalState.update(STORAGE_KEYS.LAST_SYNC_AT, undefined),
			this.globalState.update(STORAGE_KEYS.DEVICE_ID, undefined),
		]);
	}
}
