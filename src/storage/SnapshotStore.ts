// apps/vscode/src/storage/SnapshotStore.ts

import * as vscode from "vscode";
import type { BlobStore } from "./BlobStore";
import {
	addToIndex,
	allocateSeq,
	DEFAULT_INDEX,
	DEFAULT_STATE,
	removeFromIndex,
	type SeqIndex,
	type StoreState,
	updateHead,
} from "./storeState";
import {
	isSnapshotManifestV2,
	normalizeToV1,
	SCHEMA_VERSION_V2,
	type SnapshotFileRefV2,
	type SnapshotFilters,
	type SnapshotManifest,
	type SnapshotManifestV2,
	type SnapshotWithContent,
} from "./types";
import { ensureDirectory, fileExists, readJsonFile, writeJsonFile } from "./utils/atomicWrite";
import { generateSnapshotId, parseTimestampFromId } from "./utils/fileId";
import { WriterLock, withLock } from "./writerLock";

// ============================================
// Constants for chain resolution
// ============================================

const MAX_CHAIN_DEPTH = 100; // Prevent infinite loops on corrupted chains

// ============================================
// Custom Error Classes
// ============================================

/**
 * Error thrown when snapshot parent chain is broken or corrupted.
 */
export class SnapshotChainError extends Error {
	constructor(
		message: string,
		public readonly snapshotId: string,
		public readonly brokenAtId: string | null,
	) {
		super(message);
		this.name = "SnapshotChainError";
	}
}

/**
 * Snapshot storage using content-addressable blobs.
 *
 * Each snapshot is a lightweight manifest (~500 bytes) that references
 * blobs by their hash. This provides:
 * - Automatic deduplication (unchanged files stored once)
 * - Fast snapshot creation (only write new/changed files)
 * - Space efficiency (10-100x smaller than full copies)
 */
/** Options for creating a PRE checkpoint */
export interface CreatePREOptions {
	name: string;
	anchorFile: string;
	parentSeq: number | null;
	parentId: string | null;
	type?: "PRE" | "PRE_ROLLBACK";
	metadata?: SnapshotManifestV2["metadata"];
}

/** Options for creating a POST checkpoint */
export interface CreatePOSTOptions {
	files: Map<string, string>;
	name: string;
	anchorFile: string;
	parentSeq: number | null;
	parentId: string | null;
	metadata?: SnapshotManifestV2["metadata"];
}

/** Filters for V2 manifest listing */
export interface SnapshotFiltersV2 {
	limit?: number;
	includeOrphanStatus?: boolean;
}

/** V2 manifest with optional orphan status */
export interface SnapshotManifestV2WithStatus extends SnapshotManifestV2 {
	isOrphan?: boolean;
}

export class SnapshotStore {
	private readonly snapshotsUri: vscode.Uri;
	private readonly storageUri: vscode.Uri;

	// In-memory state for fast seq allocation
	private state: StoreState = { ...DEFAULT_STATE };
	private index: SeqIndex = { ...DEFAULT_INDEX };
	private stateLoaded = false;

	// Writer lock for single-writer guarantee on V2 operations
	private readonly lock = new WriterLock();

	constructor(
		storageUri: vscode.Uri,
		private readonly blobStore: BlobStore,
	) {
		this.storageUri = storageUri;
		this.snapshotsUri = vscode.Uri.joinPath(storageUri, "snapshots");
	}

	/**
	 * Initialize snapshots directory and load state
	 */
	async initialize(): Promise<void> {
		await ensureDirectory(this.snapshotsUri);
		await this.loadState();
	}

	/**
	 * Load state and index from disk, rebuilding if necessary
	 */
	private async loadState(): Promise<void> {
		if (this.stateLoaded) {
			return;
		}

		const stateUri = vscode.Uri.joinPath(this.storageUri, "state.json");
		const indexUri = vscode.Uri.joinPath(this.storageUri, "index.json");

		const loadedState = await readJsonFile<StoreState>(stateUri);
		const loadedIndex = await readJsonFile<SeqIndex>(indexUri);

		// If state or index is missing/corrupted, rebuild from manifests
		if (!loadedState || !loadedIndex) {
			console.debug("[SnapshotStore] State or index missing, rebuilding from disk...");
			await this.rebuildStateFromDisk();
		} else {
			this.state = loadedState;
			this.index = loadedIndex;
		}

		this.stateLoaded = true;
	}

	/**
	 * Save state and index to disk
	 */
	private async saveState(): Promise<void> {
		const stateUri = vscode.Uri.joinPath(this.storageUri, "state.json");
		const indexUri = vscode.Uri.joinPath(this.storageUri, "index.json");

		await writeJsonFile(stateUri, this.state);
		await writeJsonFile(indexUri, this.index);
	}

	// ============================================
	// V2 Methods - PRE/POST Checkpoints
	// ============================================

	/**
	 * Create a PRE checkpoint (pointer-only, no blobs)
	 *
	 * PRE checkpoints mark the start of a risky operation.
	 * They have files={} because content is read from head state.
	 *
	 * Protected by WriterLock to prevent concurrent seq allocation races.
	 */
	async createPRE(options: CreatePREOptions): Promise<SnapshotManifestV2> {
		return withLock(this.lock, async () => {
			await this.loadState();

			const id = generateSnapshotId();
			const timestamp = Date.now();
			const { newState, seq } = allocateSeq(this.state);

			const manifest: SnapshotManifestV2 = {
				schemaVersion: SCHEMA_VERSION_V2,
				id,
				seq,
				parentSeq: options.parentSeq,
				parentId: options.parentId,
				timestamp,
				name: options.name,
				type: options.type ?? "PRE",
				anchorFile: options.anchorFile,
				files: {}, // Empty for PRE - pointer only
				metadata: options.metadata,
			};

			// Write manifest
			const manifestUri = vscode.Uri.joinPath(this.snapshotsUri, `${id}.json`);
			await writeJsonFile(manifestUri, manifest);

			// Update state and index
			this.state = updateHead(newState, id);
			addToIndex(this.index, seq, id);
			await this.saveState();

			return manifest;
		});
	}

	/**
	 * Create a POST checkpoint (with blob references)
	 *
	 * POST checkpoints contain the actual file contents after a save.
	 *
	 * Protected by WriterLock to prevent concurrent seq allocation races.
	 */
	async createPOST(options: CreatePOSTOptions): Promise<SnapshotManifestV2> {
		// Validate: POST requires at least one file
		if (options.files.size === 0) {
			throw new Error("POST checkpoint requires at least one file");
		}

		// Validate: anchor file must be in files
		if (!options.files.has(options.anchorFile)) {
			throw new Error(`Anchor file ${options.anchorFile} not found in snapshot files`);
		}

		return withLock(this.lock, async () => {
			await this.loadState();

			const id = generateSnapshotId();
			const timestamp = Date.now();
			const { newState, seq } = allocateSeq(this.state);

			// Store each file in blob store
			const fileRefs: Record<string, SnapshotFileRefV2> = {};

			for (const [filePath, content] of options.files) {
				const { hash, size } = await this.blobStore.store(content);
				fileRefs[filePath] = { blobHash: hash, size };
			}

			const manifest: SnapshotManifestV2 = {
				schemaVersion: SCHEMA_VERSION_V2,
				id,
				seq,
				parentSeq: options.parentSeq,
				parentId: options.parentId,
				timestamp,
				name: options.name,
				type: "POST",
				anchorFile: options.anchorFile,
				files: fileRefs,
				metadata: options.metadata,
			};

			// Write manifest
			const manifestUri = vscode.Uri.joinPath(this.snapshotsUri, `${id}.json`);
			await writeJsonFile(manifestUri, manifest);

			// Update state and index
			this.state = updateHead(newState, id);
			addToIndex(this.index, seq, id);
			await this.saveState();

			return manifest;
		});
	}

	/**
	 * Get V2 manifest by ID
	 */
	async getManifestV2(id: string): Promise<SnapshotManifestV2 | null> {
		const manifestUri = vscode.Uri.joinPath(this.snapshotsUri, `${id}.json`);
		const data = await readJsonFile<unknown>(manifestUri);

		if (!data) {
			return null;
		}

		if (isSnapshotManifestV2(data)) {
			return data;
		}

		return null;
	}

	/**
	 * List V2 manifests with optional orphan detection
	 */
	async listV2(filters?: SnapshotFiltersV2): Promise<SnapshotManifestV2WithStatus[]> {
		let entries: [string, vscode.FileType][];

		try {
			entries = await vscode.workspace.fs.readDirectory(this.snapshotsUri);
		} catch {
			return [];
		}

		const manifests: SnapshotManifestV2WithStatus[] = [];
		const postParentIds = new Set<string>();

		// Sort by timestamp from ID (newest first)
		const jsonFiles = entries
			.filter(([name, type]) => type === vscode.FileType.File && name.endsWith(".json"))
			.map(([name]) => name.replace(".json", ""))
			.sort((a, b) => {
				const tsA = parseTimestampFromId(a) ?? 0;
				const tsB = parseTimestampFromId(b) ?? 0;
				return tsB - tsA;
			});

		const limit = filters?.limit ?? 100;

		// First pass: collect all manifests and track POST parent IDs
		for (const id of jsonFiles) {
			const manifest = await this.getManifestV2(id);
			if (!manifest) {
				continue;
			}

			manifests.push(manifest);

			// Track POST parent IDs for orphan detection
			if (manifest.type === "POST" && manifest.parentId) {
				postParentIds.add(manifest.parentId);
			}

			if (manifests.length >= limit) {
				break;
			}
		}

		// Second pass: mark orphan status if requested
		if (filters?.includeOrphanStatus) {
			for (const manifest of manifests) {
				if (manifest.type === "PRE" || manifest.type === "PRE_ROLLBACK") {
					// PRE is orphan if no POST references it as parent
					manifest.isOrphan = !postParentIds.has(manifest.id);
				}
			}
		}

		return manifests;
	}

	/**
	 * Detect orphan PRE checkpoints at startup for observability.
	 * Logs orphan PREs at debug level for visibility without runtime intervention.
	 * See cleanupOldOrphanPREs() for TTL-based cleanup.
	 */
	async detectOrphanPREs(): Promise<{ orphanCount: number; orphanIds: string[] }> {
		const manifests = await this.listV2({ limit: 500, includeOrphanStatus: true });

		const orphanIds: string[] = [];

		for (const manifest of manifests) {
			if ((manifest.type === "PRE" || manifest.type === "PRE_ROLLBACK") && manifest.isOrphan) {
				orphanIds.push(manifest.id);
				console.debug("[SnapBack Manifest] Orphan PRE detected", {
					id: manifest.id,
					type: manifest.type,
					timestamp: manifest.timestamp,
				});
			}
		}

		if (orphanIds.length > 0) {
			console.debug(`[SnapBack Manifest] Found ${orphanIds.length} orphan PRE checkpoint(s)`);
		}

		return { orphanCount: orphanIds.length, orphanIds };
	}

	/**
	 * Clean up orphan PRE checkpoints older than specified age.
	 * Called during startup to prevent storage bloat from crashes.
	 *
	 * @param maxAgeMs - Maximum age in milliseconds (default: 1 hour)
	 * @returns Number of orphan PREs cleaned up
	 */
	async cleanupOldOrphanPREs(maxAgeMs = 60 * 60 * 1000): Promise<number> {
		const { orphanIds } = await this.detectOrphanPREs();
		const cutoffTime = Date.now() - maxAgeMs;

		const toDelete: string[] = [];
		for (const id of orphanIds) {
			const manifest = await this.getManifestV2(id);
			if (manifest && manifest.timestamp < cutoffTime) {
				toDelete.push(id);
			}
		}

		if (toDelete.length === 0) {
			return 0;
		}

		let cleaned = 0;
		for (const id of toDelete) {
			const deleted = await this.delete(id);
			if (deleted) {
				cleaned++;
				console.debug("[SnapBack Manifest] Cleaned orphan PRE", { id });
			}
		}

		if (cleaned > 0) {
			console.log(`[SnapBack Manifest] Cleaned ${cleaned} orphan PRE checkpoint(s) older than ${maxAgeMs / 60000} minutes`);
		}

		return cleaned;
	}

	/**
	 * Get snapshot manifest by ID (any version, filters pointer checkpoints)
	 * Returns V1 manifests or V2 POST checkpoints.
	 * Filters out PRE and PRE_ROLLBACK (pointer-only checkpoints).
	 */
	async getManifest(id: string): Promise<SnapshotManifest | null> {
		const manifestUri = vscode.Uri.joinPath(this.snapshotsUri, `${id}.json`);
		const data = await readJsonFile<unknown>(manifestUri);

		if (!data) {
			return null;
		}

		// Handle V2 manifests
		if (isSnapshotManifestV2(data)) {
			// Filter out pointer checkpoints (PRE, PRE_ROLLBACK)
			// Only POST checkpoints have content and should be visible
			if (data.type === "PRE" || data.type === "PRE_ROLLBACK") {
				return null;
			}
			// Convert V2 POST to V1 format for backward compatibility
			return normalizeToV1(data);
		}

		return data as SnapshotManifest;
	}

	/**
	 * Get snapshot with resolved file contents (V1 manifests only)
	 */
	async getWithContent(id: string): Promise<SnapshotWithContent | null> {
		const manifest = await this.getManifest(id);
		if (!manifest) {
			return null;
		}

		// Resolve all blob references to content
		const contents: Record<string, string> = {};

		for (const [filePath, ref] of Object.entries(manifest.files)) {
			const content = await this.blobStore.retrieve(ref.blob);
			if (content !== null) {
				contents[filePath] = content;
			} else {
				console.warn(`[SnapshotStore] Missing blob ${ref.blob} for ${filePath} in snapshot ${id}`);
			}
		}

		return {
			...manifest,
			contents,
		};
	}

	// ============================================
	// V2 Chain Resolution
	// ============================================

	/**
	 * Create a PRE_ROLLBACK checkpoint before executing a rollback.
	 *
	 * Captures current state BEFORE overwriting files, allowing undo.
	 *
	 * @param targetId - The snapshot ID we're rolling back TO
	 * @returns The PRE_ROLLBACK manifest
	 */
	async createPreRollbackCheckpoint(targetId: string): Promise<SnapshotManifestV2> {
		return this.createPRE({
			name: `Pre-rollback (target: ${targetId})`,
			anchorFile: targetId, // Use target as anchor reference
			parentSeq: this.state.lastSeq,
			parentId: this.state.headId,
			type: "PRE_ROLLBACK",
			metadata: {
				origin: "INTERACTIVE",
				riskScore: 0,
				reasons: ["PRE_ROLLBACK"],
			},
		});
	}

	/**
	 * Get V2 snapshot with resolved file contents.
	 *
	 * For POST checkpoints: Load content directly from blobs.
	 * For PRE/PRE_ROLLBACK: Walk parentId chain until finding POST.
	 *
	 * @param id - Snapshot ID to retrieve
	 * @returns Manifest with resolved contents, or null if not found
	 * @throws SnapshotChainError if chain is broken or too deep
	 */
	async getWithContentV2(
		id: string,
	): Promise<{ manifest: SnapshotManifestV2; contents: Record<string, string> } | null> {
		const manifest = await this.getManifestV2(id);
		if (!manifest) {
			return null;
		}

		// If POST, load content directly
		if (manifest.type === "POST") {
			const contents = await this.loadContentsFromV2Manifest(manifest);
			return { manifest, contents };
		}

		// For PRE/PRE_ROLLBACK, walk parent chain to find content
		const contentManifest = await this.resolveContentAncestor(manifest);
		if (!contentManifest) {
			throw new SnapshotChainError(
				`Cannot resolve content for checkpoint ${id}: parent chain broken`,
				id,
				manifest.parentId,
			);
		}

		const contents = await this.loadContentsFromV2Manifest(contentManifest);
		return { manifest, contents };
	}

	/**
	 * Walk parent chain to find the nearest POST checkpoint with content.
	 */
	private async resolveContentAncestor(manifest: SnapshotManifestV2): Promise<SnapshotManifestV2 | null> {
		let current: SnapshotManifestV2 | null = manifest;
		let depth = 0;

		while (current && depth < MAX_CHAIN_DEPTH) {
			// If POST, we found content
			if (current.type === "POST") {
				return current;
			}

			// Move to parent
			if (!current.parentId) {
				console.warn("[SnapshotStore] Chain broken: no parentId", {
					id: current.id,
					depth,
				});
				return null;
			}

			const parent = await this.getManifestV2(current.parentId);
			if (!parent) {
				console.warn("[SnapshotStore] Chain broken: parent not found", {
					id: current.id,
					parentId: current.parentId,
					depth,
				});
				return null;
			}

			current = parent;
			depth++;
		}

		if (depth >= MAX_CHAIN_DEPTH) {
			console.error("[SnapshotStore] Chain too deep, possible corruption", {
				startId: manifest.id,
				depth,
			});
			throw new SnapshotChainError(
				`Parent chain exceeded max depth (${MAX_CHAIN_DEPTH})`,
				manifest.id,
				current?.id ?? null,
			);
		}

		return null;
	}

	/**
	 * Load file contents from a V2 manifest's blob references.
	 */
	private async loadContentsFromV2Manifest(manifest: SnapshotManifestV2): Promise<Record<string, string>> {
		const contents: Record<string, string> = {};

		for (const [filePath, ref] of Object.entries(manifest.files)) {
			try {
				const content = await this.blobStore.retrieve(ref.blobHash);
				if (content !== null) {
					contents[filePath] = content;
				} else {
					console.warn("[SnapshotStore] Blob not found", {
						filePath,
						blobHash: ref.blobHash,
					});
				}
			} catch (error) {
				console.error("[SnapshotStore] Failed to load blob", {
					filePath,
					blobHash: ref.blobHash,
					error,
				});
			}
		}

		return contents;
	}

	/**
	 * Find orphaned PRE/PRE_ROLLBACK checkpoints (broken parent chains).
	 * Use during startup recovery or maintenance.
	 */
	async findOrphanedCheckpoints(): Promise<string[]> {
		const orphans: string[] = [];
		const manifests = await this.listV2({ limit: 500 });

		for (const manifest of manifests) {
			// Only check pointer checkpoints
			if (manifest.type === "POST") {
				continue;
			}

			// Try to resolve content - if it fails, it's orphaned
			try {
				await this.resolveContentAncestor(manifest);
			} catch (error) {
				if (error instanceof SnapshotChainError) {
					orphans.push(manifest.id);
					console.debug("[SnapshotStore] Found orphan", { id: manifest.id });
				}
			}
		}

		return orphans;
	}

	/**
	 * Clean up orphaned checkpoints.
	 * WARNING: This deletes data. Use with caution.
	 */
	async cleanupOrphans(orphanIds: string[]): Promise<number> {
		let cleaned = 0;

		for (const id of orphanIds) {
			try {
				await this.delete(id);
				cleaned++;
			} catch (error) {
				console.error("[SnapshotStore] Failed to delete orphan", { id, error });
			}
		}

		console.log("[SnapshotStore] Cleaned up orphans", { count: cleaned });
		return cleaned;
	}

	/**
	 * List snapshots with optional filtering
	 */
	async list(filters?: SnapshotFilters): Promise<SnapshotManifest[]> {
		let entries: [string, vscode.FileType][];

		try {
			entries = await vscode.workspace.fs.readDirectory(this.snapshotsUri);
		} catch {
			return [];
		}

		const manifests: SnapshotManifest[] = [];

		// Sort by timestamp from ID (faster than reading each file)
		const jsonFiles = entries
			.filter(([name, type]) => type === vscode.FileType.File && name.endsWith(".json"))
			.map(([name]) => name.replace(".json", ""))
			.sort((a, b) => {
				const tsA = parseTimestampFromId(a) ?? 0;
				const tsB = parseTimestampFromId(b) ?? 0;
				return tsB - tsA; // Newest first
			});

		// Apply limit early if no other filters
		const limit = filters?.limit ?? 100;
		const filesToRead = jsonFiles.slice(
			0,
			filters?.after || filters?.before || filters?.trigger ? jsonFiles.length : limit,
		);

		// Read manifests
		for (const id of filesToRead) {
			const manifest = await this.getManifest(id);
			if (!manifest) {
				continue;
			}

			// Apply filters
			if (filters?.after && manifest.timestamp < filters.after) {
				continue;
			}
			if (filters?.before && manifest.timestamp > filters.before) {
				continue;
			}
			if (filters?.trigger && manifest.trigger !== filters.trigger) {
				continue;
			}

			manifests.push(manifest);

			// Check limit after filtering
			if (manifests.length >= limit) {
				break;
			}
		}

		return manifests;
	}

	/**
	 * Delete a snapshot (manifest only, blobs may still be referenced)
	 * Protected by WriterLock to prevent concurrent state corruption.
	 * Updates index to remove the deleted entry.
	 *
	 * NOTE: Does not update headId - callers should ensure they don't delete
	 * the current head, or handle state rebuild if needed.
	 */
	async delete(id: string): Promise<boolean> {
		return withLock(this.lock, async () => {
			await this.loadState();

			const manifestUri = vscode.Uri.joinPath(this.snapshotsUri, `${id}.json`);

			try {
				await vscode.workspace.fs.delete(manifestUri);

				// Remove from index if present
				const seq = this.index.byId[id];
				if (seq !== undefined) {
					removeFromIndex(this.index, seq, id);
					await this.saveState();
				}

				return true;
			} catch {
				return false;
			}
		});
	}

	/**
	 * Check if snapshot exists
	 */
	async exists(id: string): Promise<boolean> {
		const manifestUri = vscode.Uri.joinPath(this.snapshotsUri, `${id}.json`);
		return fileExists(manifestUri);
	}

	/**
	 * Get count of snapshots
	 */
	async count(): Promise<number> {
		try {
			const entries = await vscode.workspace.fs.readDirectory(this.snapshotsUri);
			return entries.filter(([name, type]) => type === vscode.FileType.File && name.endsWith(".json")).length;
		} catch {
			return 0;
		}
	}

	/**
	 * Get snapshots for a specific file path
	 */
	async getForFile(filePath: string, limit = 10): Promise<SnapshotManifest[]> {
		const all = await this.list({ limit: 500 }); // Read more to filter
		return all.filter((m) => filePath in m.files).slice(0, limit);
	}

	/**
	 * Get most recent snapshot
	 */
	async getMostRecent(): Promise<SnapshotManifest | null> {
		const list = await this.list({ limit: 1 });
		return list[0] ?? null;
	}

	/**
	 * Get snapshots by trigger type
	 */
	async getByTrigger(trigger: SnapshotManifest["trigger"], limit = 50): Promise<SnapshotManifest[]> {
		return this.list({ trigger, limit });
	}

	// ============================================
	// State Recovery
	// ============================================

	/**
	 * Rebuild state and index from manifest files on disk.
	 * Called during initialization if state.json or index.json is missing/corrupted.
	 * This enables crash recovery - even if state files are lost, manifests remain.
	 */
	private async rebuildStateFromDisk(): Promise<void> {
		console.debug("[SnapshotStore] Starting state rebuild from disk...");

		const manifests: { manifest: SnapshotManifest | SnapshotManifestV2; timestamp: number }[] = [];

		try {
			const entries = await vscode.workspace.fs.readDirectory(this.snapshotsUri);

			for (const [name, type] of entries) {
				if (type !== vscode.FileType.File || !name.endsWith(".json")) {
					continue;
				}

				const id = name.replace(".json", "");
				const manifest = await this.getManifest(id);
				if (manifest) {
					manifests.push({ manifest, timestamp: manifest.timestamp });
				}
			}
		} catch {
			// No snapshots directory yet - start fresh
			console.debug("[SnapshotStore] No snapshots directory found, starting fresh");
		}

		// Sort by timestamp to ensure consistent seq assignment
		manifests.sort((a, b) => a.timestamp - b.timestamp);

		// Rebuild state and index
		let maxSeq = 0;
		let headId: string | null = null;
		const newIndex: SeqIndex = {
			schemaVersion: 1,
			bySeq: {},
			byId: {},
			rebuiltAt: Date.now(),
		};

		for (let i = 0; i < manifests.length; i++) {
			const { manifest } = manifests[i];
			// Use V2 seq if available, otherwise assign based on sorted position
			const seq = isSnapshotManifestV2(manifest) ? manifest.seq : i + 1;
			maxSeq = Math.max(maxSeq, seq);
			headId = manifest.id;

			// Add to index
			addToIndex(newIndex, seq, manifest.id);
		}

		// Update state
		this.state = {
			schemaVersion: 1,
			lastSeq: maxSeq,
			headId,
			lastUpdatedAt: Date.now(),
		};
		this.index = newIndex;

		// Persist rebuilt state
		await this.saveState();

		console.debug(
			`[SnapshotStore] State rebuilt: ${manifests.length} manifests, lastSeq=${maxSeq}, headId=${headId}`,
		);
	}
}
