/**
 * MCPStorageReader - Read-only access to MCP snapshot storage
 *
 * Reads snapshots from {workspace}/.snapback/snapshots/*.json
 * This is for display purposes only - does NOT modify MCP storage.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fromMCPManifest, type UnifiedSnapshot } from "./UnifiedSnapshot";

// =============================================================================
// TYPES
// =============================================================================

/**
 * MCP/Engine snapshot manifest structure
 *
 * Matches: packages/engine/src/runtime/storage.ts SnapshotManifest
 */
export interface MCPSnapshotManifest {
	/** Unique snapshot ID */
	id: string;
	/** Creation timestamp (ms since epoch) */
	createdAt: number;
	/** Files included in this snapshot */
	files: Array<{
		/** Original file path (relative to workspace) */
		path: string;
		/** SHA-256 hash of content (blob ID) */
		blobId: string;
		/** Original file size in bytes */
		size: number;
	}>;
	/** Total size of all files */
	totalSize: number;
	/** Optional description */
	description?: string;
	/** Trigger that caused this snapshot */
	trigger?: "manual" | "auto" | "ai-detection";
}

// =============================================================================
// READER IMPLEMENTATION
// =============================================================================

/**
 * Read-only access to MCP snapshot storage.
 *
 * MCP stores snapshots as JSON files in:
 * ```
 * {workspace}/.snapback/
 * ├── snapshots/
 * │   ├── snap_1234.json
 * │   └── snap_5678.json
 * └── blobs/
 *     ├── ab/
 *     │   └── cdef1234...
 *     └── ...
 * ```
 */
export class MCPStorageReader {
	private readonly snapshotDir: string;
	private readonly blobDir: string;

	constructor(private readonly workspaceRoot: string) {
		this.snapshotDir = path.join(workspaceRoot, ".snapback", "snapshots");
		this.blobDir = path.join(workspaceRoot, ".snapback", "blobs");
	}

	/**
	 * List all snapshots from MCP storage.
	 * Returns empty array if .snapback directory doesn't exist.
	 */
	async list(): Promise<UnifiedSnapshot[]> {
		if (!(await this.exists())) {
			return [];
		}

		const snapshots: UnifiedSnapshot[] = [];

		try {
			const files = await fs.readdir(this.snapshotDir);
			const jsonFiles = files.filter((f) => f.endsWith(".json"));

			for (const file of jsonFiles) {
				try {
					const filePath = path.join(this.snapshotDir, file);
					const content = await fs.readFile(filePath, "utf-8");
					const manifest: MCPSnapshotManifest = JSON.parse(content);

					// Validate required fields
					if (this.isValidManifest(manifest)) {
						snapshots.push(fromMCPManifest(manifest));
					}
				} catch {
					// Skip invalid files silently
					// In production, we'd want to log this for debugging
				}
			}
		} catch {
			// Return empty array if we can't read the directory
			return [];
		}

		return snapshots;
	}

	/**
	 * Get a specific snapshot manifest by ID.
	 */
	async getManifest(id: string): Promise<MCPSnapshotManifest | null> {
		const manifestPath = path.join(this.snapshotDir, `${id}.json`);

		try {
			const content = await fs.readFile(manifestPath, "utf-8");
			const manifest: MCPSnapshotManifest = JSON.parse(content);

			if (this.isValidManifest(manifest)) {
				return manifest;
			}
			return null;
		} catch {
			return null;
		}
	}

	/**
	 * Check if MCP storage directory exists.
	 */
	async exists(): Promise<boolean> {
		try {
			await fs.access(this.snapshotDir);
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Get the snapshot directory path.
	 */
	getSnapshotDir(): string {
		return this.snapshotDir;
	}

	/**
	 * Get blob content for restoration.
	 *
	 * Blobs are stored with sharding: blobs/{first2chars}/{fullhash}
	 */
	async getBlobContent(blobId: string): Promise<Buffer | null> {
		// MCP uses sharded blob storage: blobs/ab/abcdef...
		const shard = blobId.slice(0, 2);
		const blobPath = path.join(this.blobDir, shard, blobId);

		try {
			return await fs.readFile(blobPath);
		} catch {
			return null;
		}
	}

	/**
	 * Validate that a manifest has required fields.
	 */
	private isValidManifest(manifest: unknown): manifest is MCPSnapshotManifest {
		if (typeof manifest !== "object" || manifest === null) {
			return false;
		}

		const m = manifest as Record<string, unknown>;

		return (
			typeof m.id === "string" &&
			typeof m.createdAt === "number" &&
			Array.isArray(m.files) &&
			typeof m.totalSize === "number"
		);
	}
}
