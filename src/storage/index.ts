// apps/vscode/src/storage/index.ts

export { AuditLog } from "./AuditLog";
export { BlobStore } from "./BlobStore";

// Core components
export { CooldownCache } from "./CooldownCache";
export { SessionStore } from "./SessionStore";
export { SnapshotStore } from "./SnapshotStore";
export { StorageManager } from "./StorageManager";
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
