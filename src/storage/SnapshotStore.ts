// apps/vscode/src/storage/SnapshotStore.ts

import * as vscode from "vscode";
import type { BlobStore } from "./BlobStore";
import type {
	SnapshotFileRef,
	SnapshotFilters,
	SnapshotManifest,
	SnapshotWithContent,
} from "./types";
import {
	ensureDirectory,
	fileExists,
	readJsonFile,
	writeJsonFile,
} from "./utils/atomicWrite";
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
export class SnapshotStore {
	private readonly snapshotsUri: vscode.Uri;

	constructor(
		storageUri: vscode.Uri,
		private readonly blobStore: BlobStore,
	) {
		this.snapshotsUri = vscode.Uri.joinPath(storageUri, "snapshots");
	}

	/**
	 * Initialize snapshots directory
	 */
	async initialize(): Promise<void> {
		await ensureDirectory(this.snapshotsUri);
	}

	/**
	 * Create a new snapshot from file contents
	 */
	async create(
		files: Map<string, string>,
		options: {
			name: string;
			trigger: SnapshotManifest["trigger"];
			metadata?: SnapshotManifest["metadata"];
		},
	): Promise<SnapshotManifest> {
		const id = generateSnapshotId();
		const timestamp = Date.now();

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
		if (!manifest) return null;

		// Resolve all blob references to content
		const contents: Record<string, string> = {};

		for (const [filePath, ref] of Object.entries(manifest.files)) {
			const content = await this.blobStore.retrieve(ref.blob);
			if (content !== null) {
				contents[filePath] = content;
			} else {
				console.warn(
					`[SnapshotStore] Missing blob ${ref.blob} for ${filePath} in snapshot ${id}`,
				);
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
			.filter(
				([name, type]) =>
					type === vscode.FileType.File && name.endsWith(".json"),
			)
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
			filters?.after || filters?.before || filters?.trigger
				? jsonFiles.length
				: limit,
		);

		// Read manifests
		for (const id of filesToRead) {
			const manifest = await this.getManifest(id);
			if (!manifest) continue;

			// Apply filters
			if (filters?.after && manifest.timestamp < filters.after) continue;
			if (filters?.before && manifest.timestamp > filters.before) continue;
			if (filters?.trigger && manifest.trigger !== filters.trigger) continue;

			manifests.push(manifest);

			// Check limit after filtering
			if (manifests.length >= limit) break;
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
			const entries = await vscode.workspace.fs.readDirectory(
				this.snapshotsUri,
			);
			return entries.filter(
				([name, type]) =>
					type === vscode.FileType.File && name.endsWith(".json"),
			).length;
		} catch {
			return 0;
		}
	}

	/**
	 * Get snapshots for a specific file path
	 */
	async getForFile(
		filePath: string,
		limit: number = 10,
	): Promise<SnapshotManifest[]> {
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
	async getByTrigger(
		trigger: SnapshotManifest["trigger"],
		limit: number = 50,
	): Promise<SnapshotManifest[]> {
		return this.list({ trigger, limit });
	}
}
