// apps/vscode/src/storage/StorageManager.ts

/**
 * StorageManager - Primary storage interface for VS Code extension
 *
 * This class provides the storage API used throughout the extension.
 * All operations delegate to the CLI daemon via DaemonBridge (thin client pattern).
 *
 * The extension does not directly access the filesystem for snapshot operations.
 * Instead, it calls the daemon which owns the canonical storage implementation.
 *
 * @see DaemonBridge for the daemon RPC protocol
 * @see apps/cli/src/daemon/protocol.ts for available daemon methods
 */

import * as vscode from "vscode";
import { VrekoEvent, type VrekoEventBus } from "../events";
import { logger } from "../utils/logger";
import { ConfigStore } from "./ConfigStore";
import type {
	AuditEntry,
	CooldownEntry,
	CreatePOSTOptions,
	CreatePREOptions,
	IStorageManager,
	SessionFileEntry,
	SessionFilters,
	SessionManifest,
	SnapshotFilters,
	SnapshotManifest,
	SnapshotManifestV2,
	SnapshotWithContent,
	StorageMetadata,
} from "./types";
import { normalizeToV1, triggerToReasons } from "./types";
import { readJsonFile, writeJsonFile } from "./utils/atomicWrite";

const STORAGE_VERSION = 1;

// =============================================================================
// STORAGE BACKEND ABSTRACTION (Thin Client Only)
// =============================================================================

/**
 * StorageBackend interface - abstracts storage operations
 * All operations delegate to the daemon via DaemonBridge (THIN CLIENT).
 */
interface StorageBackend {
	// Snapshot operations
	createPRE(options: CreatePREOptions): Promise<SnapshotManifestV2>;
	createPOST(options: CreatePOSTOptions): Promise<SnapshotManifestV2>;
	getSnapshot(id: string): Promise<SnapshotManifest | null>;
	listSnapshots(filters?: SnapshotFilters): Promise<SnapshotManifest[]>;
	restoreSnapshot(id: string, targetPath: string): Promise<SnapshotWithContent>;
	deleteSnapshot(id: string): Promise<void>;

	// Session operations
	startSession(): string;
	beginSession(task?: string, files?: string[], keywords?: string[]): Promise<string>;
	getActiveSessionId(): string | null;
	getActiveSessionStartedAt(): number | null;
	hasActiveSession(): boolean;
	finalizeSession(
		reason: SessionManifest["reason"],
		files: SessionFileEntry[],
		options?: { tags?: string[]; summary?: string },
	): Promise<SessionManifest | null>;
	cancelSession(): void;
	listSessions(filters?: SessionFilters): Promise<SessionManifest[]>;

	// Blob operations
	getBlob(hash: string): Promise<Uint8Array | null>;
	putBlob(hash: string, data: Uint8Array): Promise<void>;

	// Audit operations
	logAuditEntry(entry: AuditEntry): Promise<void>;
	getAuditLog(limit?: number): Promise<AuditEntry[]>;
}

/**
 * DaemonStorageBackend - THIN CLIENT implementation
 *
 * Delegates all storage operations to the daemon via DaemonBridge.
 *
 * @see DaemonBridge for the daemon RPC protocol
 */
class DaemonStorageBackend implements StorageBackend {
	constructor(
		private workspacePath: string,
		private getBridge: () => import("../services/DaemonBridge").DaemonBridge,
	) {}

	// === Session state cache (for THIN client) ===
	private _activeSessionId: string | null = null;
	private _activeSessionStartedAt: number | null = null;

	// Snapshot operations - delegate to daemon
	async createPRE(_options: CreatePREOptions): Promise<SnapshotManifestV2> {
		const bridge = this.getBridge();
		// Delegate to daemon - returns simplified response
		const result = await bridge.createSnapshot(this.workspacePath, [], {
			reason: "pre-snapshot",
			trigger: "manual",
		});
		// Convert to manifest format
		return {
			schemaVersion: 2,
			id: result.snapshotId,
			seq: 0,
			parentSeq: null,
			parentId: null,
			timestamp: Date.now(),
			name: "pre-snapshot",
			type: "PRE",
			anchorFile: "",
			files: {},
			metadata: {},
		} as SnapshotManifestV2;
	}

	async createPOST(_options: CreatePOSTOptions): Promise<SnapshotManifestV2> {
		const bridge = this.getBridge();
		const result = await bridge.createSnapshot(this.workspacePath, [], {
			reason: "post-snapshot",
			trigger: "manual",
		});
		return {
			schemaVersion: 2,
			id: result.snapshotId,
			seq: 0,
			parentSeq: null,
			parentId: null,
			timestamp: Date.now(),
			name: "post-snapshot",
			type: "POST",
			anchorFile: "",
			files: {},
			metadata: {},
		} as SnapshotManifestV2;
	}

	async getSnapshot(id: string): Promise<SnapshotManifest | null> {
		const bridge = this.getBridge();
		const list = await bridge.listSnapshots(this.workspacePath);
		const found = list.find((s: { snapshotId: string }) => s.snapshotId === id);
		if (!found) {
			return null;
		}
		return {
			id: found.snapshotId,
			timestamp: Date.now(),
			name: found.snapshotId,
			files: {},
		} as SnapshotManifest;
	}

	async listSnapshots(filters?: SnapshotFilters): Promise<SnapshotManifest[]> {
		const bridge = this.getBridge();
		const list = await bridge.listSnapshots(this.workspacePath, {
			limit: filters?.limit,
		});
		return list.map((s: { snapshotId: string; createdAt: number; files: string[] }) => ({
			id: s.snapshotId,
			timestamp: s.createdAt,
			name: s.snapshotId,
			files: {},
		})) as SnapshotManifest[];
	}

	async restoreSnapshot(id: string, _targetPath: string): Promise<SnapshotWithContent> {
		const bridge = this.getBridge();
		const result = await bridge.restoreSnapshot(this.workspacePath, id);
		// Convert restored files to contents map
		const contents: Record<string, string> = {};
		for (const f of result.restored) {
			contents[f] = ""; // Content not available from daemon
		}
		// Type mismatch with SnapshotWithContent - cast for now
		return { id, timestamp: Date.now(), name: id, files: {}, contents } as SnapshotWithContent;
	}

	async deleteSnapshot(_id: string): Promise<void> {
		logger.warn("DaemonStorageBackend: deleteSnapshot not yet implemented in daemon");
	}

	// Session operations - delegate to daemon
	startSession(): string {
		// Return cached session if exists
		if (this._activeSessionId) {
			return this._activeSessionId;
		}
		// Generate a local ID immediately for sync callers
		// The actual daemon session is created lazily via beginSession()
		this._activeSessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
		this._activeSessionStartedAt = Date.now();
		return this._activeSessionId;
	}

	/**
	 * Begin a daemon session (async, called when session context is available).
	 * This replaces the sync startSession() for actual daemon communication.
	 */
	async beginSession(task?: string, files?: string[], keywords?: string[]): Promise<string> {
		const bridge = this.getBridge();
		const result = await bridge.beginSession(this.workspacePath, task ?? "", files, keywords);
		// Cache the daemon-returned taskId as our active session ID
		this._activeSessionId = result.taskId;
		this._activeSessionStartedAt = Date.now();
		return result.taskId;
	}

	getActiveSessionId(): string | null {
		return this._activeSessionId;
	}

	getActiveSessionStartedAt(): number | null {
		return this._activeSessionStartedAt;
	}

	hasActiveSession(): boolean {
		return this._activeSessionId !== null;
	}

	async finalizeSession(
		reason: SessionManifest["reason"] = "manual",
		_files: SessionFileEntry[] = [],
		options?: { tags?: string[]; summary?: string },
	): Promise<SessionManifest | null> {
		if (!this._activeSessionId) {
			return null;
		}

		const bridge = this.getBridge();
		const outcome = reason === "idle" || reason === "window-close" ? "abandoned" : "completed";

		try {
			await bridge.endSession(this.workspacePath, outcome, true, options?.summary);
		} catch (error) {
			logger.warn("Failed to end daemon session", { error });
		}

		// Build manifest for compatibility
		const manifest: SessionManifest = {
			id: this._activeSessionId,
			startedAt: this._activeSessionStartedAt ?? Date.now(),
			endedAt: Date.now(),
			reason,
			files: _files,
			tags: options?.tags,
			summary: options?.summary,
		};

		// Clear active session
		this._activeSessionId = null;
		this._activeSessionStartedAt = null;

		return manifest;
	}

	cancelSession(): void {
		this._activeSessionId = null;
		this._activeSessionStartedAt = null;
	}

	async listSessions(): Promise<SessionManifest[]> {
		// Sessions are managed by daemon; return empty for now
		// The daemon's session/list endpoint can be used if needed
		return [];
	}

	// Blob operations - delegate to daemon
	async getBlob(): Promise<Uint8Array | null> {
		return null;
	}

	async putBlob(): Promise<void> {
		// Blobs managed by daemon
	}

	// Audit operations - delegate to daemon
	async logAuditEntry(): Promise<void> {
		// Audit managed by daemon
	}

	async getAuditLog(): Promise<AuditEntry[]> {
		return [];
	}
}

/**
 * Main storage orchestrator that provides a unified interface
 * to all storage components.
 *
 * This replaces the SQLite-based StorageBroker with a file-based
 * implementation that works in all VS Code environments.
 *
 * ## Architecture (Thin Client Only)
 *
 * ```
 * StorageManager (this class)
 *     ↓
 * DaemonStorageBackend (THIN - daemon)
 *     ↓
 * DaemonBridge → CLI Daemon
 * ```
 *
 * All storage operations are delegated to the CLI daemon.
 */
export class StorageManager implements IStorageManager {
	private readonly backend: StorageBackend;
	private readonly storageUri: vscode.Uri;
	private readonly metadataUri: vscode.Uri;
	private readonly workspacePath: string;
	private readonly configStore: ConfigStore;

	// In-memory cooldown cache (not persisted, used for debouncing)
	private readonly cooldowns: Map<string, CooldownEntry> = new Map();

	private initialized = false;
	private eventBus?: VrekoEventBus;

	constructor(context: vscode.ExtensionContext, eventBus?: VrekoEventBus, workspacePath?: string) {
		// Use VS Code's global storage URI
		this.storageUri = context.globalStorageUri;
		this.metadataUri = vscode.Uri.joinPath(this.storageUri, "storage.json");
		// Workspace path used to key the DaemonBridge  -  must match the workspace root
		// used elsewhere (phase2-storage.ts, phase3-managers.ts) to avoid creating
		// a duplicate DaemonBridge instance that gets stuck in its own connection loop.
		// Falls back to the first workspace folder, then to the extension path (legacy).
		this.workspacePath =
			workspacePath ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? context.extensionUri.fsPath;
		this.eventBus = eventBus;

		// THIN CLIENT: Use daemon-backed storage
		logger.info("StorageManager: Using daemon-backed storage (THIN)");
		// Lazy-load DaemonBridge to avoid circular deps
		const getBridge = () => {
			// Dynamic import to avoid circular dependency
			const { getDaemonBridge } = require("../services/DaemonBridge");
			return getDaemonBridge(this.workspacePath);
		};
		this.backend = new DaemonStorageBackend(this.workspacePath, getBridge);
		this.configStore = new ConfigStore(this.storageUri);
	}

	/**
	 * REFACTOR: Extract common event publishing pattern
	 * Defensive pattern: only publishes if eventBus is available
	 */
	private publishEvent<T>(event: VrekoEvent, payload: T): void {
		if (this.eventBus) {
			this.eventBus.publish(event, payload);
		}
	}

	// ============================================
	// Lifecycle
	// ============================================

	async initialize(): Promise<void> {
		if (this.initialized) {
			return;
		}

		// ⚡ CRITICAL: Create storage directory with proper error handling
		// This must succeed for snapshots and sessions to work
		try {
			await vscode.workspace.fs.createDirectory(this.storageUri);
		} catch (err: unknown) {
			// Handle specific error cases with clear user guidance
			const e = err as { code?: string; message?: string };
			if (e.code === "FileExists") {
				// OK - directory already exists, continue normally
			} else if (e.code === "NoSpace" || e.message?.includes("ENOSPC") || e.message?.includes("no space")) {
				// Disk full - provide actionable guidance
				const storageError = new Error(
					"Cannot initialize Vreko storage: Your disk is full. Free up space and reload VS Code to use snapshot features.",
				);
				storageError.name = "StorageSpaceError";
				throw storageError;
			} else if (
				e.code === "NoPermissions" ||
				e.message?.includes("EACCES") ||
				e.message?.includes("permission")
			) {
				// Permission denied - guide user to fix permissions
				const storagePath = this.storageUri?.fsPath ?? "unknown";
				const storageError = new Error(
					`Cannot initialize Vreko storage: Permission denied accessing ${storagePath}. Check folder permissions and reload VS Code.`,
				);
				storageError.name = "StoragePermissionError";
				throw storageError;
			} else {
				// Unknown error - provide debug info
				const storageError = new Error(
					`Cannot initialize Vreko storage: ${e.message || "Unknown error"}. Check the Output panel for details.`,
				);
				storageError.name = "StorageInitializationError";
				throw storageError;
			}
		}

		// ⚡ DEFERRED: Initialize metadata file asynchronously
		// This is not critical for activation - defer to background
		this.initializeMetadata().catch((err) => {
			logger.error("Metadata initialization failed", err instanceof Error ? err : undefined);
		});

		this.initialized = true;

		const storagePath = this.storageUri?.fsPath ?? "unknown";
		logger.info("Storage initialized (lazy mode)", { path: storagePath });
	}

	dispose(): void {
		this.cooldowns.clear();
		this.initialized = false;
		logger.debug("Storage disposed");
	}

	private async initializeMetadata(): Promise<void> {
		const existing = await readJsonFile<StorageMetadata>(this.metadataUri);

		if (!existing) {
			const metadata: StorageMetadata = {
				version: STORAGE_VERSION,
				createdAt: Date.now(),
				lastUpdatedAt: Date.now(),
				stats: {
					snapshotCount: 0,
					sessionCount: 0,
					totalBlobBytes: 0,
				},
			};
			await writeJsonFile(this.metadataUri, metadata);
		} else if (existing.version < STORAGE_VERSION) {
			// Handle migrations in the future
			logger.info("Upgrading storage version", { from: existing.version, to: STORAGE_VERSION });
			existing.version = STORAGE_VERSION;
			await writeJsonFile(this.metadataUri, existing);
		}
	}

	/**
	 * Check if storage is initialized
	 */
	isInitialized(): boolean {
		return this.initialized;
	}

	/**
	 * Get storage URI
	 */
	getStorageUri(): vscode.Uri {
		return this.storageUri;
	}

	// ============================================
	// Cooldowns (In-Memory)
	// ============================================

	private getCooldownKey(filePath: string, level: string): string {
		return `${filePath}:${level}`;
	}

	setCooldown(entry: CooldownEntry): void {
		const key = this.getCooldownKey(entry.filePath, entry.protectionLevel);
		this.cooldowns.set(key, entry);
	}

	getCooldown(filePath: string, level: string): CooldownEntry | null {
		const key = this.getCooldownKey(filePath, level);
		const entry = this.cooldowns.get(key);
		if (entry && entry.expiresAt > Date.now()) {
			return entry;
		}
		return null;
	}

	isInCooldown(filePath: string, level: string): boolean {
		return this.getCooldown(filePath, level) !== null;
	}

	getRemainingCooldownTime(filePath: string, level: string): number {
		const entry = this.getCooldown(filePath, level);
		if (!entry) {
			return 0;
		}
		return Math.max(0, entry.expiresAt - Date.now());
	}

	clearCooldowns(): void {
		this.cooldowns.clear();
	}

	getActiveCooldowns(): CooldownEntry[] {
		const now = Date.now();
		return Array.from(this.cooldowns.values()).filter((e) => e.expiresAt > now);
	}

	removeCooldownByPath(filePath: string): boolean {
		let removed = false;
		for (const [key, entry] of this.cooldowns) {
			if (entry.filePath === filePath) {
				this.cooldowns.delete(key);
				removed = true;
			}
		}
		return removed;
	}

	getCooldownByPath(filePath: string): CooldownEntry | null {
		for (const entry of this.cooldowns.values()) {
			if (entry.filePath === filePath && entry.expiresAt > Date.now()) {
				return entry;
			}
		}
		return null;
	}

	// ============================================
	// Snapshots
	// ============================================

	/**
	 * High-level API to persist a snapshot with cluster support.
	 * Handles cooldown checks and metadata updates.
	 */
	async persistSnapshot(
		cluster: {
			anchorFile: string;
			clusterFiles: Map<string, string>;
		},
		trigger: SnapshotManifest["trigger"],
		options?: { name?: string; metadata?: Record<string, unknown> },
	): Promise<SnapshotManifest | null> {
		// 1. Check Cooldown (Ephemeral debounce)
		// We use the anchor file + "snapshot_created" as the cooldown key
		// Actually, cooldown is usually set AFTER snapshot, but we might want to prevent rapid snapshots
		if (this.isInCooldown(cluster.anchorFile, "snapshot_created")) {
			// Debounced
			return null;
		}

		// 2. Create Snapshot
		const name = options?.name || `Snapshot at ${new Date().toLocaleTimeString()}`;

		const manifest = await this.createSnapshot(cluster.clusterFiles, {
			name,
			trigger,
			anchorFile: cluster.anchorFile,
			metadata: options?.metadata,
		});

		// 3. Set Cooldown (e.g., 500ms debounce)
		this.setCooldown({
			filePath: cluster.anchorFile,
			protectionLevel: "snapshot_created",
			triggeredAt: Date.now(),
			expiresAt: Date.now() + 500, // 500ms debounce
			actionTaken: "snapshot_created",
			snapshotId: manifest.id,
		});

		return manifest;
	}

	async createSnapshot(
		files: Map<string, string>,
		options: {
			name: string;
			trigger: SnapshotManifest["trigger"];
			anchorFile: string;
			metadata?: SnapshotManifest["metadata"];
		},
	): Promise<SnapshotManifest> {
		// Delegate to daemon backend
		const reasons = triggerToReasons(options.trigger);

		const v2Manifest = await this.backend.createPOST({
			files,
			name: options.name,
			anchorFile: options.anchorFile,
			parentSeq: null,
			parentId: null,
			metadata: {
				riskScore: options.metadata?.riskScore ?? 0,
				origin: options.trigger === "manual" ? "INTERACTIVE" : "AUTOMATED",
				reasons,
				aiDetection: options.metadata?.aiDetection,
				sessionId: options.metadata?.sessionId,
			},
		});

		// Publish event
		this.publishEvent(VrekoEvent.SNAPSHOT_CREATED, {
			id: v2Manifest.id,
			timestamp: v2Manifest.timestamp,
			trigger: options.trigger,
			anchorFile: v2Manifest.anchorFile,
			workspaceId: vscode.workspace.workspaceFolders?.[0]?.uri.toString(),
		});

		// Return V1-compatible manifest for backward compatibility
		return normalizeToV1(v2Manifest, options.trigger);
	}

	async getSnapshot(id: string): Promise<SnapshotWithContent | null> {
		return this.backend.getSnapshot(id) as Promise<SnapshotWithContent | null>;
	}

	async getSnapshotManifest(id: string): Promise<SnapshotManifest | null> {
		return this.backend.getSnapshot(id);
	}

	async listSnapshots(filters?: SnapshotFilters): Promise<SnapshotManifest[]> {
		return this.backend.listSnapshots(filters);
	}

	async deleteSnapshot(id: string): Promise<void> {
		await this.backend.deleteSnapshot(id);
		this.publishEvent(VrekoEvent.SNAPSHOT_DELETED, {
			id,
			timestamp: Date.now(),
		});
	}

	async getSnapshotsForFile(_filePath: string, _limit?: number): Promise<SnapshotManifest[]> {
		// Not yet supported by daemon  -  return empty list gracefully
		return [];
	}

	/**
	 * Get snapshots by external task ID.
	 * Useful for LLM agents to find snapshots related to their current task.
	 */
	async getSnapshotsByTaskId(_taskId: string, _limit?: number): Promise<SnapshotManifest[]> {
		// Not yet supported by daemon  -  return empty list gracefully
		return [];
	}

	async snapshotExists(id: string): Promise<boolean> {
		return (await this.backend.getSnapshot(id)) !== null;
	}

	/**
	 * Create a PRE_ROLLBACK checkpoint before executing a rollback.
	 * This captures current state BEFORE overwriting files, allowing undo.
	 */
	async createPreRollbackCheckpoint(_targetId: string): Promise<SnapshotManifestV2> {
		throw new Error("createPreRollbackCheckpoint not supported in daemon-backed (THIN) mode");
	}

	/**
	 * Get the internal backend for PRWManager integration.
	 * Returns the backend typed as PRWSnapshotStore interface.
	 *
	 * @internal Use for PRWManager only
	 */
	getPRWSnapshotStore(): {
		createPRE(options: CreatePREOptions): Promise<SnapshotManifestV2>;
		createPOST(options: CreatePOSTOptions): Promise<SnapshotManifestV2>;
		createPreRollbackCheckpoint(targetId: string): Promise<SnapshotManifestV2>;
		cleanupOldOrphanPREs(maxAgeMs?: number): Promise<number>;
	} {
		return {
			createPRE: (options) => this.backend.createPRE(options),
			createPOST: (options) => this.backend.createPOST(options),
			createPreRollbackCheckpoint: async () => {
				throw new Error("createPreRollbackCheckpoint not supported in THIN mode");
			},
			cleanupOldOrphanPREs: async () => 0,
		};
	}

	/**
	 * Get the internal ConfigStore for BurstDetector integration.
	 * Returns the store for engine config and protection checks.
	 *
	 * @internal Use for BurstDetector only
	 */
	getConfigStore(): ConfigStore {
		return this.configStore;
	}

	// ============================================
	// Sessions
	// ============================================

	async createSession(_startedAt?: number): Promise<string> {
		return this.backend.startSession();
	}

	async finalizeSession(
		_id: string,
		_endedAt: number,
		reason: SessionManifest["reason"],
		files: SessionFileEntry[],
		options?: { tags?: string[]; summary?: string },
	): Promise<SessionManifest> {
		const manifest = await this.backend.finalizeSession(reason, files, options);
		if (!manifest) {
			throw new Error("No active session to finalize");
		}
		return manifest;
	}

	async getSession(_id: string): Promise<SessionManifest | null> {
		// Sessions managed by daemon, return null for now
		return null;
	}

	async listSessions(_filters?: SessionFilters): Promise<SessionManifest[]> {
		return this.backend.listSessions();
	}

	getActiveSessionId(): string | null {
		return this.backend.getActiveSessionId();
	}

	hasActiveSession(): boolean {
		return this.backend.hasActiveSession();
	}

	cancelSession(): void {
		this.backend.cancelSession();
	}

	// ============================================
	// Audit
	// ============================================

	async recordAudit(_entry: Omit<AuditEntry, "id" | "timestamp">): Promise<void> {
		// Audit managed by daemon - no-op in thin client
	}

	async getAuditTrail(_filePath: string, _limit?: number): Promise<AuditEntry[]> {
		return this.backend.getAuditLog();
	}

	async getAllAuditEntries(limit?: number): Promise<AuditEntry[]> {
		return this.backend.getAuditLog(limit);
	}

	async getAuditEntriesByAction(_action: AuditEntry["action"], _limit?: number): Promise<AuditEntry[]> {
		// Not supported by daemon - return empty
		return [];
	}

	// ============================================
	// Metadata & Stats
	// ============================================

	async getStorageMetadata(): Promise<StorageMetadata> {
		const metadata = await readJsonFile<StorageMetadata>(this.metadataUri);

		if (!metadata) {
			return {
				version: STORAGE_VERSION,
				createdAt: Date.now(),
				lastUpdatedAt: Date.now(),
				stats: {
					snapshotCount: 0,
					sessionCount: 0,
					totalBlobBytes: 0,
				},
			};
		}

		return metadata;
	}

	/**
	 * Force update stats (useful after bulk operations)
	 * In thin client mode, this returns cached metadata.
	 */
	async refreshStats(): Promise<StorageMetadata> {
		return this.getStorageMetadata();
	}

	/**
	 * Get quick stats without full metadata
	 * In thin client mode, returns placeholder values.
	 */
	async getQuickStats(): Promise<{
		snapshots: number;
		sessions: number;
		blobs: number;
		totalBytes: number;
	}> {
		// In thin client mode, stats are managed by daemon
		// Return placeholder values - actual stats available via daemon API
		return {
			snapshots: 0,
			sessions: 0,
			blobs: 0,
			totalBytes: 0,
		};
	}
}
