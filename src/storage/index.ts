// apps/vscode/src/storage/index.ts

export { AuditLog } from "./AuditLog";
export { BlobStore } from "./BlobStore";

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
export { SnapshotStore } from "./SnapshotStore";
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
