// apps/vscode/src/storage/index.ts

// Types
export * from './types';
// Compatibility type re-exports
export type { SnapshotStorage, FileSystemStorage } from './types';

// Core components
export { CooldownCache } from './CooldownCache';
export { BlobStore } from './BlobStore';
export { SnapshotStore } from './SnapshotStore';
export { SessionStore } from './SessionStore';
export { AuditLog } from './AuditLog';
export { StorageManager } from './StorageManager';

// Utilities
export { randomId, generateSnapshotId, generateSessionId, generateAuditId, parseTimestampFromId } from './utils/fileId';
export { hashContent, getBlobPath } from './utils/hash';
export { atomicWriteFile, ensureDirectory, fileExists, readJsonFile, writeJsonFile } from './utils/atomicWrite';
