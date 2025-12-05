/**
 * SnapshotOrchestrator
 *
 * Orchestrates snapshot creation and recovery workflow:
 * - Converts ProtectionDecision to SnapshotIntent
 * - Collects files for snapshot
 * - Persists snapshots
 * - Manages snapshot lifecycle and recovery
 * - Enforces storage limits
 *
 * Flow: ProtectionDecision → SnapshotOrchestrator → Persisted Snapshot
 */

import type { ProtectionDecision, SnapshotIntent } from "./types";
import type { FileInfo } from "./signalAggregator";
import type { IKeyValueStorage } from "@snapback/sdk";

export interface SnapshotMetadata {
	riskScore: number;
	aiDetected: boolean;
	aiToolName?: string;
	sessionId: string;
	filesCount: number;
	totalSize: number;
	createdAt: number;
}

export interface PersistedSnapshot {
	id: string;
	name: string;
	timestamp: number;
	fileCount: number;
	totalSize: number;
	metadata: SnapshotMetadata;
	recoverable: boolean;
	checksum: string;
}

export interface SnapshotConfig {
	maxSnapshots: number;
	maxStorageBytes: number;
	snapshotRetentionDays: number;
}

/**
 * Orchestrates snapshot creation and management
 */
export class SnapshotOrchestrator {
	private repoId: string;
	private snapshots: Map<string, PersistedSnapshot> = new Map();
	private snapshotCounter = 0;
	private totalStorageUsed = 0;
	private storage: IKeyValueStorage | null;

	private config: SnapshotConfig = {
		maxSnapshots: 100,
		maxStorageBytes: 1024 * 1024 * 1024, // 1GB
		snapshotRetentionDays: 7,
	};

	constructor(
		repoId: string,
		config?: Partial<SnapshotConfig>,
		storage?: IKeyValueStorage,
	) {
		this.repoId = repoId;
		this.storage = storage ?? null;
		if (config) {
			this.config = { ...this.config, ...config };
		}
		// Load persisted snapshots if storage available (fire and forget)
		if (this.storage) {
			// Non-blocking async load
			Promise.resolve(this.loadFromStorage()).catch((error) =>
				console.error("Failed to load snapshots:", error),
			);
		}
	}

	/**
	 * Load snapshots from persistent storage
	 */
	private async loadFromStorage(): Promise<void> {
		if (!this.storage) return;
		try {
			const stored = await this.storage.get<PersistedSnapshot[]>(
				"snapback.snapshots",
			);
			if (stored && Array.isArray(stored)) {
				for (const snapshot of stored) {
					this.snapshots.set(snapshot.id, snapshot);
					this.totalStorageUsed += snapshot.totalSize;
				}
			}
		} catch (error) {
			console.error("Failed to load snapshots from storage", error);
		}
	}

	/**
	 * Persist snapshots to storage
	 */
	private async persistSnapshots(): Promise<void> {
		if (!this.storage) return;
		try {
			const snapshots = Array.from(this.snapshots.values());
			await this.storage.set("snapback.snapshots", snapshots);
		} catch (error) {
			console.error("Failed to persist snapshots", error);
		}
	}

	/**
	 * Create snapshot from ProtectionDecision
	 */
	async createSnapshot(
		decision: ProtectionDecision,
		files: FileInfo[],
	): Promise<PersistedSnapshot | null> {
		if (!decision.createSnapshot) {
			return null;
		}

		const id = this.generateId();
		const timestamp = Date.now();

		// Filter out binary files
		const textFiles = files.filter((f) => !f.isBinary);
		const totalSize = textFiles.reduce((sum, f) => sum + f.sizeBytes, 0);

		// Create snapshot intent
		const intent: SnapshotIntent = {
			id,
			files: new Map(textFiles.map((f) => [f.path, ""])), // Content would be fetched
			name: this.generateSnapshotName(decision),
			trigger: this.decisionToTrigger(decision),
			metadata: {
				riskScore: decision.context.riskScore,
				aiDetected: decision.context.aiToolName !== undefined,
				aiToolName: decision.context.aiToolName,
				sessionId: decision.context.sessionId,
				reasons: decision.reasons,
			},
		};

		// Create persisted snapshot
		const persisted: PersistedSnapshot = {
			id,
			name: intent.name,
			timestamp,
			fileCount: textFiles.length,
			totalSize,
			metadata: {
				riskScore: decision.context.riskScore,
				aiDetected: decision.context.aiToolName !== undefined,
				aiToolName: decision.context.aiToolName,
				sessionId: decision.context.sessionId,
				filesCount: textFiles.length,
				totalSize,
				createdAt: timestamp,
			},
			recoverable: true,
			checksum: this.generateChecksum(textFiles),
		};

		// Enforce storage limits
		if (!this.canStoreSnapshot(totalSize)) {
			await this.enforceStorageLimits();
		}

		// Store snapshot
		this.snapshots.set(id, persisted);
		this.totalStorageUsed += totalSize;

		// Persist to storage
		await this.persistSnapshots();

		return persisted;
	}

	/**
	 * Check if snapshot can be stored
	 */
	private canStoreSnapshot(size: number): boolean {
		// Check count limit
		if (this.snapshots.size >= this.config.maxSnapshots) {
			return false;
		}

		// Check storage limit
		if (this.totalStorageUsed + size > this.config.maxStorageBytes) {
			return false;
		}

		return true;
	}

	/**
	 * Enforce storage limits by removing old snapshots
	 */
	private async enforceStorageLimits(): Promise<void> {
		// Sort by timestamp (oldest first)
		const sorted = Array.from(this.snapshots.values()).sort(
			(a, b) => a.timestamp - b.timestamp,
		);

		// Remove oldest until we have space
		for (const snapshot of sorted) {
			// Check both count and storage limits
			if (
				this.snapshots.size < this.config.maxSnapshots &&
				this.totalStorageUsed <= this.config.maxStorageBytes
			) {
				break;
			}

			await this.deleteSnapshot(snapshot.id);
		}
	}

	/**
	 * Delete snapshot
	 */
	private async deleteSnapshot(id: string): Promise<void> {
		const snapshot = this.snapshots.get(id);
		if (snapshot) {
			this.totalStorageUsed -= snapshot.totalSize;
			this.snapshots.delete(id);
			// Persist after deletion
			await this.persistSnapshots();
		}
	}

	/**
	 * Get all snapshots
	 */
	getSnapshots(): PersistedSnapshot[] {
		return Array.from(this.snapshots.values());
	}

	/**
	 * Get recoverable snapshots
	 */
	getRecoverableSnapshots(): PersistedSnapshot[] {
		return Array.from(this.snapshots.values()).filter((s) => s.recoverable);
	}

	/**
	 * Get snapshot by ID
	 */
	getSnapshot(id: string): PersistedSnapshot | undefined {
		return this.snapshots.get(id);
	}

	/**
	 * Restore snapshot to workspace
	 */
	async restoreSnapshot(
		id: string,
	): Promise<{ success: boolean; filesRestored: number }> {
		const snapshot = this.snapshots.get(id);
		if (!snapshot) {
			return { success: false, filesRestored: 0 };
		}

		if (!snapshot.recoverable) {
			return { success: false, filesRestored: 0 };
		}

		// In real implementation, restore files from storage
		return { success: true, filesRestored: snapshot.fileCount };
	}

	/**
	 * Clean up expired snapshots
	 */
	async cleanup(): Promise<void> {
		const maxAge =
			this.config.snapshotRetentionDays *
			24 *
			60 *
			60 *
			1000;
		const now = Date.now();

		const toDelete: string[] = [];

		this.snapshots.forEach((snapshot, id) => {
			if (now - snapshot.timestamp > maxAge) {
				toDelete.push(id);
			}
		});

		for (const id of toDelete) {
			await this.deleteSnapshot(id);
		}

		// Persist after cleanup
		if (toDelete.length > 0) {
			await this.persistSnapshots();
		}
	}

	/**
	 * Get storage statistics
	 */
	getStorageStats(): {
		used: number;
		available: number;
		utilizationPercent: string;
		snapshotCount: number;
	} {
		const available = this.config.maxStorageBytes - this.totalStorageUsed;

		return {
			used: this.totalStorageUsed,
			available,
			utilizationPercent: (
				(this.totalStorageUsed / this.config.maxStorageBytes) *
				100
			).toFixed(1),
			snapshotCount: this.snapshots.size,
		};
	}

	/**
	 * Generate snapshot ID
	 */
	private generateId(): string {
		return `snap-${this.repoId}-${++this.snapshotCounter}-${Date.now()}`;
	}

	/**
	 * Generate snapshot name
	 */
	private generateSnapshotName(decision: ProtectionDecision): string {
		const trigger = this.decisionToTrigger(decision);
		const timestamp = new Date().toISOString().split("T")[0];

		return `SnapBack-${trigger.toUpperCase()}-${timestamp}`;
	}

	/**
	 * Convert decision to snapshot trigger
	 */
	private decisionToTrigger(
		decision: ProtectionDecision,
	): "auto" | "ai-detected" | "manual" | "burst" {
		if (decision.reasons.includes("ai_detected")) {
			return "ai-detected";
		}
		if (decision.reasons.includes("burst_pattern")) {
			return "burst";
		}
		return "auto";
	}

	/**
	 * Generate checksum for files
	 */
	private generateChecksum(files: FileInfo[]): string {
		const sorted = files.map((f) => f.path).sort();
		return `checksum-${sorted.join("-").substring(0, 16)}`;
	}
}

/**
 * Factory for creating SnapshotOrchestrator
 */
export function createSnapshotOrchestrator(
	repoId: string,
	config?: Partial<SnapshotConfig>,
): SnapshotOrchestrator {
	return new SnapshotOrchestrator(repoId, config);
}
