// apps/vscode/src/storage/index.ts

/**
 * Storage Module - Extension-side storage with daemon delegation
 *
 * This module provides the storage API for the VS Code extension.
 * All operations delegate to the CLI daemon via DaemonBridge (thin client pattern).
 *
 * @see DaemonBridge for the daemon RPC protocol
 * @see StorageManager for the main storage interface
 */

// Utilities - ID generation from canonical source
export {
	generateAuditId,
	generateSessionId,
	generateSnapshotId,
	ID_PREFIX,
	type IdPrefix,
	isValidId,
	parseIdTimestamp as parseTimestampFromId,
	randomId,
} from "@vreko/contracts";
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
export { getBlobPath, hashContent } from "./utils/hash";
export { LockAcquisitionError, WriterLock, withLock } from "./writerLock";
