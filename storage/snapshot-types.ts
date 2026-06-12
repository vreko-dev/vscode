// apps/vscode/src/storage/snapshot-types.ts
//
// Shared creation-option types extracted from SnapshotStore.ts to break the
// circular dependency between storage/types.ts and storage/SnapshotStore.ts.
//
// Before: types.ts re-exported CreatePREOptions/CreatePOSTOptions FROM SnapshotStore.ts,
//         AND SnapshotStore.ts imported types from types.ts  -  mutual cycle.
// After:  Both import from this neutral file; neither imports the other.
//
// NOTE: The SnapshotCheckpointMetadata type is defined here (not in types.ts) so that
// snapshot-types.ts has zero imports from the rest of the storage package.
// types.ts re-exports SnapshotCheckpointMetadata from here for downstream consumers.

/** Inline metadata type for checkpoint creation options (mirrors SnapshotManifestV2["metadata"]) */
export interface SnapshotCheckpointMetadata {
	riskScore?: number;
	origin?: "INTERACTIVE" | "AUTOMATED";
	reasons?: string[];
	aiDetection?: {
		detected: boolean;
		tool?: string;
		confidence?: number;
	};
	sessionId?: string;
	taskId?: string;
}

/** Options for creating a PRE checkpoint */
export interface CreatePREOptions {
	name: string;
	anchorFile: string;
	parentSeq: number | null;
	parentId: string | null;
	type?: "PRE" | "PRE_ROLLBACK";
	metadata?: SnapshotCheckpointMetadata;
}

/** Options for creating a POST checkpoint */
export interface CreatePOSTOptions {
	files: Map<string, string>;
	name: string;
	anchorFile: string;
	parentSeq: number | null;
	parentId: string | null;
	metadata?: SnapshotCheckpointMetadata;
}
