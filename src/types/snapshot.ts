import type { EncryptedData } from "../snapshot/EncryptionService.js";

/**
 * Base Snapshot interface matching the canonical contract from @snapback/contracts
 * This represents the minimal data structure stored in the snapshot system.
 */
export interface Snapshot {
	id: string;
	timestamp: number;
	meta?: Record<string, unknown>;
	files?: string[];
	fileContents?: Record<string, string>;
}

/**
 * File state interface from SnapshotDeduplicator
 * Represents a file's state at a specific snapshot with content and hash
 */
export interface FileState {
	path: string;
	content: string;
	hash: string;
	encrypted?: EncryptedData;
}

/**
 * Snapshot state interface from SnapshotDeduplicator
 * Represents a complete snapshot state for deduplication purposes
 */
export interface SnapshotState {
	id: string;
	timestamp: number;
	files: FileState[];
}

/**
 * Rich Snapshot interface used by SnapshotManager
 * Extends the base Snapshot with UI and management metadata
 */
export interface RichSnapshot extends Snapshot {
	name: string;
	fileStates?: FileState[];
	isProtected: boolean;
	icon: string;
	iconColor: string;
	[key: string]: unknown; // Index signature to make it compatible with base Snapshot
}

/**
 * Minimal Snapshot interface used by SnapshotDeletionService
 * Contains only the essential fields needed for deletion operations
 */
export interface MinimalSnapshot {
	id: string;
	name: string;
	timestamp: number;
	isProtected: boolean;
}

/**
 * File input interface for snapshot creation
 * Used when creating new snapshots
 */
export interface FileInput {
	path: string;
	content: string;
	action: "add" | "modify" | "delete";
}

/**
 * Options for snapshot creation
 */
export interface CreateSnapshotOptions {
	/** Custom description (overrides auto-generated name) */
	description?: string;
	/** Whether snapshot should be protected */
	protected?: boolean;
}

/**
 * Confirmation service interface for user prompts
 */
export interface IConfirmationService {
	confirm(message: string, detail?: string): Promise<boolean>;
}

/**
 * Storage interface for snapshot persistence
 */
export interface IStorage {
	save(snapshot: RichSnapshot): Promise<void>;
	get(id: string): Promise<RichSnapshot | undefined>;
	getAll(): Promise<RichSnapshot[]>;
	delete(id: string): Promise<void>;
	update(id: string, updates: Partial<RichSnapshot>): Promise<void>;
}

/**
 * Event emitter interface for UI updates
 */
export interface IEventEmitter {
	emit(type: string, data: unknown): void;
}
