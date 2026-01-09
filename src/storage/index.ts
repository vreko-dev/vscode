// apps/vscode/src/storage/index.ts

/**
 * @deprecated **ARCHITECTURE_REFACTOR_SPEC.md Phase 3**: Extension-side storage is deprecated.
 * All storage operations are now handled by the CLI daemon via @snapback/sdk.
 * This module will be removed in Phase 4 of the architecture refactor.
 *
 * @see DaemonBridge for the new API
 * @see ARCHITECTURE_REFACTOR_SPEC.md for migration details
 */

export { AuditLog } from "./AuditLog";
export { BlobStore } from "./BlobStore";
// Storage Bridge (unified read access to extension + MCP snapshots)
export {
	type ExtensionStorageAdapter,
	fromExtensionManifest,
	fromMCPManifest,
	type MCPSnapshotManifest,
	MCPStorageReader,
	SnapshotBridge,
	type SourceCounts,
	type UnifiedSnapshot,
	type UnifiedSnapshotFile,
} from "./bridge";
// Core components
export { CooldownCache } from "./CooldownCache";
export {
	applyDeletions,
	applySnapshot,
	cloneHeadMap,
	DEFAULT_HEAD_MAP,
	getActiveFiles,
	getFile,
	getTombstones,
	type HeadMap,
	type HeadMapFileRef,
	hasFile,
	isDeleted,
	isValidHeadMap,
	markDeleted,
	resetHeadMap,
	setFile,
} from "./headMap";
export { SessionStore } from "./SessionStore";
export type {
	CreatePOSTOptions,
	CreatePREOptions,
	SnapshotFiltersV2,
	SnapshotManifestV2WithStatus,
} from "./SnapshotStore";
export { SnapshotChainError, SnapshotStore } from "./SnapshotStore";
export { StorageManager } from "./StorageManager";
// State management
export {
	addToIndex,
	allocateSeq,
	DEFAULT_INDEX,
	DEFAULT_STATE,
	type SeqIndex,
	type StoreState,
	updateHead,
} from "./storeState";
export {
	type PendingDeletion,
	StubTombstoneTracker,
	type TombstoneTracker,
} from "./tombstoneTracker";
// Compatibility type re-exports
export type { FileSystemStorage, SnapshotStorage } from "./types";
// Types
export * from "./types";
export {
	atomicWriteFile,
	ensureDirectory,
	fileExists,
	readJsonFile,
	writeJsonFile,
} from "./utils/atomicWrite";
// Utilities
export {
	generateAuditId,
	generateSessionId,
	generateSnapshotId,
	parseTimestampFromId,
	randomId,
} from "./utils/fileId";
export { getBlobPath, hashContent } from "./utils/hash";
export { LockAcquisitionError, WriterLock, withLock } from "./writerLock";
