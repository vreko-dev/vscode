// apps/vscode/src/storage/SnapshotStore.ts

import * as vscode from "vscode";
import type { BlobStore } from "./BlobStore";
import {
	addToIndex,
	allocateSeq,
	DEFAULT_INDEX,
	DEFAULT_STATE,
	type SeqIndex,
	type StoreState,
	updateHead,
} from "./storeState";
import {
	isSnapshotManifestV2,
	SCHEMA_VERSION_V2,
	type SnapshotFileRef,
	type SnapshotFileRefV2,
	type SnapshotFilters,
	type SnapshotManifest,
	type SnapshotManifestV2,
	type SnapshotWithContent,
} from "./types";
import { ensureDirectory, fileExists, readJsonFile, writeJsonFile } from "./utils/atomicWrite";
import { generateSnapshotId, parseTimestampFromId } from "./utils/fileId";

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
	 * Load state and index from disk
	 */
	private async loadState(): Promise<void> {
		if (this.stateLoaded) {
			return;
		}

		const stateUri = vscode.Uri.joinPath(this.storageUri, "state.json");
		const indexUri = vscode.Uri.joinPath(this.storageUri, "index.json");

		const loadedState = await readJsonFile<StoreState>(stateUri);
		const loadedIndex = await readJsonFile<SeqIndex>(indexUri);

		if (loadedState) {
			this.state = loadedState;
		}
		if (loadedIndex) {
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
	 */
	async createPRE(options: CreatePREOptions): Promise<SnapshotManifestV2> {
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
	}

	/**
	 * Create a POST checkpoint (with blob references)
	 *
	 * POST checkpoints contain the actual file contents after a save.
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
	 *
	 * TODO(v2): Consider TTL-based cleanup for orphan PREs
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
	 * Create a new snapshot from file contents
	 */
	async create(
		files: Map<string, string>,
		options: {
			name: string;
			trigger: SnapshotManifest["trigger"];
			anchorFile?: string;
			metadata?: SnapshotManifest["metadata"];
		},
	): Promise<SnapshotManifest> {
		const id = generateSnapshotId();
		const timestamp = Date.now();

		// Resolve and validate anchor file
		let resolvedAnchorFile = options.anchorFile;

		if (!resolvedAnchorFile) {
			if (files.size === 1) {
				resolvedAnchorFile = files.keys().next().value;
			} else {
				throw new Error("Anchor file must be specified for multi-file snapshots");
			}
		}

		// Ensure anchor (inferred or explicit) exists in files
		if (!resolvedAnchorFile || !files.has(resolvedAnchorFile)) {
			throw new Error(`Anchor file ${resolvedAnchorFile} not found in snapshot files`);
		}

		// Store each file in blob store
		const fileRefs: Record<string, SnapshotFileRef> = {};

		for (const [filePath, content] of files) {
			const { hash, size } = await this.blobStore.store(content);
			fileRefs[filePath] = { blob: hash, size };
		}

		// Create manifest
		const manifest: SnapshotManifest = {
			id,
			timestamp,
			name: options.name,
			trigger: options.trigger,
			anchorFile: resolvedAnchorFile,
			files: fileRefs,
			metadata: options.metadata,
		};

		// Write manifest
		const manifestUri = vscode.Uri.joinPath(this.snapshotsUri, `${id}.json`);
		await writeJsonFile(manifestUri, manifest);

		return manifest;
	}

	/**
	 * Get snapshot manifest by ID
	 */
	async getManifest(id: string): Promise<SnapshotManifest | null> {
		const manifestUri = vscode.Uri.joinPath(this.snapshotsUri, `${id}.json`);
		return readJsonFile<SnapshotManifest>(manifestUri);
	}

	/**
	 * Get snapshot with resolved file contents
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
	 */
	async delete(id: string): Promise<boolean> {
		const manifestUri = vscode.Uri.joinPath(this.snapshotsUri, `${id}.json`);

		try {
			await vscode.workspace.fs.delete(manifestUri);
			return true;
		} catch {
			return false;
		}
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
}
