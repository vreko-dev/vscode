/**
 * UnifiedSnapshot - Common interface for both storage formats
 *
 * This module provides a unified view of snapshots from:
 * - Extension storage (SQLite with V2 manifests)
 * - MCP storage (JSON files in .snapback/)
 *
 * This is a READ-ONLY bridge for display purposes.
 * It does NOT modify where either system writes.
 */

import type { CheckpointType, SnapshotManifestV2 } from "../types";
import type { MCPSnapshotManifest } from "./MCPStorageReader";

// =============================================================================
// TYPES
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

// =============================================================================
// CONVERTERS
// =============================================================================

/**
 * Map extension checkpoint type to unified trigger
 */
function checkpointTypeToTrigger(type: CheckpointType): UnifiedSnapshot["trigger"] {
	switch (type) {
		case "POST":
			return "auto";
		case "PRE":
			return "manual";
		case "PRE_ROLLBACK":
			return "pre-rollback";
		default:
			return "auto";
	}
}

/**
 * Converts Extension V2 manifest to UnifiedSnapshot
 */
export function fromExtensionManifest(manifest: SnapshotManifestV2): UnifiedSnapshot {
	const files: UnifiedSnapshotFile[] = Object.entries(manifest.files).map(([path, info]) => ({
		path,
		contentId: info.blobHash,
		size: info.size,
	}));

	const totalSize = files.reduce((sum, f) => sum + f.size, 0);

	// Build metadata only if there's actual content
	let metadata: UnifiedSnapshot["metadata"] | undefined;
	if (manifest.metadata) {
		const hasContent =
			manifest.metadata.riskScore !== undefined ||
			manifest.metadata.sessionId !== undefined ||
			manifest.metadata.taskId !== undefined ||
			manifest.metadata.aiDetection?.tool !== undefined;

		if (hasContent) {
			metadata = {
				riskScore: manifest.metadata.riskScore,
				sessionId: manifest.metadata.sessionId,
				taskId: manifest.metadata.taskId,
				aiTool: manifest.metadata.aiDetection?.tool,
			};
		}
	}

	return {
		id: manifest.id,
		timestamp: manifest.timestamp,
		name: manifest.name,
		source: "extension",
		files,
		totalSize,
		trigger: checkpointTypeToTrigger(manifest.type),
		metadata,
	};
}

/**
 * Converts MCP/Engine manifest to UnifiedSnapshot
 */
export function fromMCPManifest(manifest: MCPSnapshotManifest): UnifiedSnapshot {
	return {
		id: manifest.id,
		timestamp: manifest.createdAt,
		name: manifest.description || `Snapshot ${manifest.id}`,
		source: "mcp",
		files: manifest.files.map((f) => ({
			path: f.path,
			contentId: f.blobId,
			size: f.size,
		})),
		totalSize: manifest.totalSize,
		trigger: manifest.trigger,
	};
}
