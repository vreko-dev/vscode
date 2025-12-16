/**
 * StorageBridge - Route storage operations to V1 or V2 based on feature flag
 *
 * DESIGN GOALS:
 * - Transparent routing: Same IStorageManager interface
 * - Backward compatible: V2 can read V1 snapshots
 * - Feature flagged: `snapback.useV2Engine` controls routing
 * - Zero breaking changes: Existing code continues to work
 *
 * PHASE 2 IMPLEMENTATION:
 * - Implement IStorageManager interface
 * - Route to V1 (StorageManager) or V2 (Engine Storage)
 * - Translate schemas between V1 and V2
 * - Ensure V2 can read V1 snapshots
 *
 * TARGET: ~200 LOC
 */

import { Storage as V2Storage } from "@snapback/engine";
import type { SnapBackEventBus } from "@snapback/events";
import * as vscode from "vscode";
import type { StorageManager as V1Storage } from "../storage/StorageManager";
import type {
	AuditEntry,
	CooldownEntry,
	IStorageManager,
	SessionFileEntry,
	SessionFilters,
	SessionManifest,
	SnapshotFilters,
	SnapshotManifest,
	SnapshotWithContent,
	StorageMetadata,
} from "../storage/types";

/**
 * Configuration for StorageBridge
 */
export interface StorageBridgeConfig {
	/** VS Code extension context */
	context: vscode.ExtensionContext;
	/** Event bus for telemetry */
	eventBus?: SnapBackEventBus;
	/** V1 storage implementation */
	v1Storage: V1Storage;
	/** Feature flag: use V2 engine */
	useV2Engine: boolean;
}

/**
 * StorageBridge routes storage operations to V1 or V2 based on feature flag
 *
 * Usage:
 * ```typescript
 * const bridge = new StorageBridge({
 *   context,
 *   eventBus,
 *   v1Storage: new StorageManager(context, eventBus),
 *   useV2Engine: vscode.workspace.getConfiguration("snapback").get("useV2Engine", false),
 * });
 *
 * await bridge.initialize();
 *
 * // Same IStorageManager interface, routes automatically
 * const manifest = await bridge.createSnapshot(files, options);
 * ```
 */
export class StorageBridge implements IStorageManager {
	private config: StorageBridgeConfig;
	private v2Storage?: V2Storage;

	constructor(config: StorageBridgeConfig) {
		this.config = config;

		// Initialize V2 storage if enabled
		if (config.useV2Engine) {
			const v2RootDir = vscode.Uri.joinPath(config.context.globalStorageUri, "engine-v2").fsPath;
			this.v2Storage = new V2Storage({
				rootDir: v2RootDir,
				compress: true,
			});
		}
	}

	// ============================================
	// Lifecycle
	// ============================================

	async initialize(): Promise<void> {
		if (this.config.useV2Engine) {
			// V2 storage initializes in constructor, no async init needed
			console.log("[StorageBridge] Initialized V2 engine storage");
		} else {
			// Initialize V1 storage
			await this.config.v1Storage.initialize();
			console.log("[StorageBridge] Initialized V1 storage");
		}
	}

	dispose(): void {
		if (this.config.useV2Engine) {
			// V2 storage has no dispose method
		} else {
			this.config.v1Storage.dispose();
		}
	}

	// ============================================
	// Cooldowns (Always use V1 - in-memory only)
	// ============================================

	setCooldown(entry: CooldownEntry): void {
		// Cooldowns are always V1 (in-memory cache)
		this.config.v1Storage.setCooldown(entry);
	}

	getCooldown(filePath: string, level: string): CooldownEntry | null {
		return this.config.v1Storage.getCooldown(filePath, level);
	}

	isInCooldown(filePath: string, level: string): boolean {
		return this.config.v1Storage.isInCooldown(filePath, level);
	}

	getRemainingCooldownTime(filePath: string, level: string): number {
		return this.config.v1Storage.getRemainingCooldownTime(filePath, level);
	}

	clearCooldowns(): void {
		this.config.v1Storage.clearCooldowns();
	}

	getActiveCooldowns(): CooldownEntry[] {
		return this.config.v1Storage.getActiveCooldowns();
	}

	removeCooldownByPath(filePath: string): boolean {
		return this.config.v1Storage.removeCooldownByPath(filePath);
	}

	getCooldownByPath(filePath: string): CooldownEntry | null {
		return this.config.v1Storage.getCooldownByPath(filePath);
	}

	// ============================================
	// Snapshots (Route based on flag)
	// ============================================

	async createSnapshot(
		files: Map<string, string>,
		options: {
			name: string;
			trigger: SnapshotManifest["trigger"];
			anchorFile: string;
			metadata?: SnapshotManifest["metadata"];
		},
	): Promise<SnapshotManifest> {
		if (this.config.useV2Engine && this.v2Storage) {
			// Use V2 engine storage
			const filesArray = Array.from(files.entries()).map(([path, content]) => ({
				path,
				content,
			}));

			const v2Manifest = await this.v2Storage.createSnapshot(filesArray, {
				description: options.name,
				trigger: this.mapTriggerToV2(options.trigger),
			});

			// Convert V2 manifest to V1 format
			return this.convertV2ToV1(v2Manifest, options.trigger);
		}

		// Use V1 storage
		return this.config.v1Storage.createSnapshot(files, options);
	}

	async getSnapshot(id: string): Promise<SnapshotWithContent | null> {
		if (this.config.useV2Engine && this.v2Storage) {
			// Try V2 storage first
			const v2Manifest = this.v2Storage.getSnapshot(id);
			if (v2Manifest) {
				const restoredFiles = await this.v2Storage.restore(id);
				const contents: Record<string, string> = {};

				for (const file of restoredFiles) {
					contents[file.path] = file.content;
				}

				// Convert to V1 SnapshotWithContent
				const v1Manifest = this.convertV2ToV1(v2Manifest, "auto");

				return {
					...v1Manifest,
					contents,
				};
			}

			// Fallback to V1 for backward compatibility
			return this.config.v1Storage.getSnapshot(id);
		}

		// Use V1 storage
		return this.config.v1Storage.getSnapshot(id);
	}

	async getSnapshotManifest(id: string): Promise<SnapshotManifest | null> {
		if (this.config.useV2Engine && this.v2Storage) {
			// Try V2 storage first
			const v2Manifest = this.v2Storage.getSnapshot(id);
			if (v2Manifest) {
				return this.convertV2ToV1(v2Manifest, "auto");
			}

			// Fallback to V1 for backward compatibility
			return this.config.v1Storage.getSnapshotManifest(id);
		}

		// Use V1 storage
		return this.config.v1Storage.getSnapshotManifest(id);
	}

	async listSnapshots(filters?: SnapshotFilters): Promise<SnapshotManifest[]> {
		if (this.config.useV2Engine && this.v2Storage) {
			// Get V2 snapshots
			const v2Snapshots = this.v2Storage.listSnapshots();

			// Get V1 snapshots for backward compatibility
			const v1Snapshots = await this.config.v1Storage.listSnapshots(filters);

			// Convert V2 to V1 format
			const convertedV2 = v2Snapshots.map((v2) => this.convertV2ToV1(v2, "auto"));

			// Merge and deduplicate by ID
			const allSnapshots = [...v1Snapshots, ...convertedV2];
			const uniqueSnapshots = new Map<string, SnapshotManifest>();

			for (const snapshot of allSnapshots) {
				if (!uniqueSnapshots.has(snapshot.id)) {
					uniqueSnapshots.set(snapshot.id, snapshot);
				}
			}

			// Apply filters if provided
			let result = Array.from(uniqueSnapshots.values());

			if (filters?.limit) {
				result = result.slice(0, filters.limit);
			}

			return result;
		}

		// Use V1 storage
		return this.config.v1Storage.listSnapshots(filters);
	}

	async deleteSnapshot(id: string): Promise<void> {
		if (this.config.useV2Engine && this.v2Storage) {
			// Try V2 first
			const deleted = this.v2Storage.deleteSnapshot(id);

			if (!deleted) {
				// Fallback to V1
				await this.config.v1Storage.deleteSnapshot(id);
			}

			return;
		}

		// Use V1 storage
		return this.config.v1Storage.deleteSnapshot(id);
	}

	async getSnapshotsForFile(filePath: string, limit?: number): Promise<SnapshotManifest[]> {
		// V2 doesn't have per-file queries, so always use V1
		return this.config.v1Storage.getSnapshotsForFile(filePath, limit);
	}

	async snapshotExists(id: string): Promise<boolean> {
		if (this.config.useV2Engine && this.v2Storage) {
			const v2Manifest = this.v2Storage.getSnapshot(id);
			if (v2Manifest) {
				return true;
			}

			// Fallback to V1
			return this.config.v1Storage.snapshotExists(id);
		}

		return this.config.v1Storage.snapshotExists(id);
	}

	async persistSnapshot(
		cluster: {
			anchorFile: string;
			clusterFiles: Map<string, string>;
		},
		trigger: SnapshotManifest["trigger"],
		options?: { name?: string; metadata?: any },
	): Promise<SnapshotManifest | null> {
		// Always delegate to V1 for persistSnapshot (handles cooldown checks)
		return this.config.v1Storage.persistSnapshot(cluster, trigger, options);
	}

	// ============================================
	// Sessions (Always use V1)
	// ============================================

	async createSession(startedAt: number): Promise<string> {
		return this.config.v1Storage.createSession(startedAt);
	}

	async finalizeSession(
		id: string,
		endedAt: number,
		reason: SessionManifest["reason"],
		files: SessionFileEntry[],
		options?: { tags?: string[]; summary?: string },
	): Promise<SessionManifest> {
		return this.config.v1Storage.finalizeSession(id, endedAt, reason, files, options);
	}

	async getSession(id: string): Promise<SessionManifest | null> {
		return this.config.v1Storage.getSession(id);
	}

	async listSessions(filters?: SessionFilters): Promise<SessionManifest[]> {
		return this.config.v1Storage.listSessions(filters);
	}

	getActiveSessionId(): string | null {
		return this.config.v1Storage.getActiveSessionId();
	}

	hasActiveSession(): boolean {
		return this.config.v1Storage.hasActiveSession();
	}

	cancelSession(): void {
		this.config.v1Storage.cancelSession();
	}

	// ============================================
	// Audit (Always use V1)
	// ============================================

	async recordAudit(entry: Omit<AuditEntry, "id" | "timestamp">): Promise<void> {
		return this.config.v1Storage.recordAudit(entry);
	}

	async getAuditTrail(filePath: string, limit?: number): Promise<AuditEntry[]> {
		return this.config.v1Storage.getAuditTrail(filePath, limit);
	}

	async getAllAuditEntries(limit?: number): Promise<AuditEntry[]> {
		return this.config.v1Storage.getAllAuditEntries(limit);
	}

	async getAuditEntriesByAction(action: AuditEntry["action"], limit?: number): Promise<AuditEntry[]> {
		return this.config.v1Storage.getAuditEntriesByAction(action, limit);
	}

	// ============================================
	// Metadata (Always use V1)
	// ============================================

	async getStorageMetadata(): Promise<StorageMetadata> {
		return this.config.v1Storage.getStorageMetadata();
	}

	async refreshStats(): Promise<StorageMetadata> {
		return this.config.v1Storage.refreshStats();
	}

	async getQuickStats(): Promise<{
		snapshots: number;
		sessions: number;
		blobs: number;
		totalBytes: number;
	}> {
		return this.config.v1Storage.getQuickStats();
	}

	isInitialized(): boolean {
		return this.config.v1Storage.isInitialized();
	}

	getStorageUri(): vscode.Uri {
		return this.config.v1Storage.getStorageUri();
	}

	// ============================================
	// Internal V1 Access (for PRWManager and BurstDetector)
	// ============================================

	getPRWSnapshotStore(): ReturnType<V1Storage["getPRWSnapshotStore"]> {
		return this.config.v1Storage.getPRWSnapshotStore();
	}

	getConfigStore(): ReturnType<V1Storage["getConfigStore"]> {
		return this.config.v1Storage.getConfigStore();
	}

	createPreRollbackCheckpoint(targetId: string): ReturnType<V1Storage["createPreRollbackCheckpoint"]> {
		return this.config.v1Storage.createPreRollbackCheckpoint(targetId);
	}

	// ============================================
	// Schema Translation Helpers
	// ============================================

	/**
	 * Convert V2 manifest to V1 manifest
	 */
	private convertV2ToV1(
		v2: import("@snapback/engine").SnapshotManifest,
		trigger: SnapshotManifest["trigger"],
	): SnapshotManifest {
		// Convert V2 files array to V1 files record
		const files: Record<string, { blob: string; size: number }> = {};

		for (const file of v2.files) {
			files[file.path] = {
				blob: file.blobId,
				size: file.size,
			};
		}

		return {
			id: v2.id,
			name: v2.description || `Snapshot at ${new Date(v2.createdAt).toLocaleString()}`,
			timestamp: v2.createdAt,
			anchorFile: v2.files[0]?.path || "",
			files,
			trigger,
			metadata: {
				riskScore: 0,
				sessionId: undefined,
			},
		};
	}

	/**
	 * Map V1 trigger to V2 trigger
	 */
	private mapTriggerToV2(v1Trigger: SnapshotManifest["trigger"]): "manual" | "auto" | "ai-detection" {
		if (v1Trigger === "manual") {
			return "manual";
		}
		if (v1Trigger === "ai-detected") {
			return "ai-detection";
		}
		return "auto";
	}
}
