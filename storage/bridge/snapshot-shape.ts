// apps/vscode/src/storage/bridge/snapshot-shape.ts
//
// Shared MCP snapshot manifest type extracted from MCPStorageReader.ts to break
// the circular dependency between storage/bridge/MCPStorageReader.ts and
// storage/bridge/UnifiedSnapshot.ts.
//
// Before: UnifiedSnapshot.ts imported MCPSnapshotManifest FROM MCPStorageReader.ts,
//         AND MCPStorageReader.ts imported fromMCPManifest/UnifiedSnapshot from UnifiedSnapshot.ts  -  cycle.
// After:  Both import MCPSnapshotManifest from this neutral file; neither imports the other.

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
