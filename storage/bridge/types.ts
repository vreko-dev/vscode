/**
 * Bridge Types - Shared interfaces for storage bridge
 *
 * Extracted to break circular dependency between:
 * - MCPStorageReader.ts
 * - UnifiedSnapshot.ts
 */

// =============================================================================
// MCP STORAGE TYPES
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
// UNIFIED SNAPSHOT TYPES
// =============================================================================

/**
 * Unified snapshot interface that normalizes both storage formats.
 * This is what the UI layer works with.
 */
export interface UnifiedSnapshot {
	/** Unique identifier */
	id: string;

	/** Creation timestamp (ms since epoch) */
	timestamp: number;

	/** Human-readable name/description */
	name: string;

	/** Source of this snapshot */
	source: "extension" | "mcp";

	/** Files included in snapshot */
	files: UnifiedSnapshotFile[];

	/** Total size in bytes */
	totalSize: number;

	/** How was this snapshot triggered */
	trigger?: "manual" | "auto" | "ai-detection" | "pre-rollback";

	/** Optional metadata */
	metadata?: {
		riskScore?: number;
		sessionId?: string;
		taskId?: string;
		aiTool?: string;
	};
}

export interface UnifiedSnapshotFile {
	/** Relative path from workspace root */
	path: string;

	/** Hash/blob ID for content retrieval */
	contentId: string;

	/** File size in bytes */
	size: number;
}
