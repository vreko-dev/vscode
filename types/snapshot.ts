/**
 * Snapshot Types for VSCode Extension
 *
 * LOCAL type definitions for thin client architecture.
 * Defines all snapshot-related types used by the extension.
 */

// =============================================================================
// CORE SNAPSHOT TYPES
// =============================================================================

export type SnapshotOrigin = "manual" | "auto" | "pre-save" | "ai-detected" | "scheduled" | "pre-restore" | "recovery";

export interface SnapshotMetadata {
	branch?: string;
	commitHash?: string;
	aiTool?: string;
	aiConfidence?: number;
	trigger?: string;
	tags?: string[];
	note?: string;
	[key: string]: unknown;
}

export interface FileState {
	path: string;
	content: string;
	hash?: string;
	size?: number;
}

export interface FileInput {
	path: string;
	content: string;
	action?: "add" | "modify" | "delete";
}

export interface Snapshot {
	id: string;
	workspaceId?: string;
	origin: SnapshotOrigin;
	createdAt: number;
	/** Alias for createdAt used by legacy code */
	timestamp?: number;
	version?: string;
	files: FileState[];
	fileContents?: Record<string, string>;
	meta?: { name?: string; [key: string]: unknown };
	metadata?: SnapshotMetadata;
	label?: string;
	sessionId?: string;
}

export interface MinimalSnapshot {
	id: string;
	origin: SnapshotOrigin;
	createdAt: number;
	fileCount: number;
	label?: string;
}

export interface RichSnapshot extends Snapshot {
	name?: string;
	fileCount: number;
	totalSize: number;
	fileStates?: FileState[];
	description?: string;
	branch?: string;
	isAIDetected?: boolean;
	isProtected?: boolean;
	icon?: string;
	iconColor?: string;
}

// =============================================================================
// SNAPSHOT FILTERING & OPTIONS
// =============================================================================

export interface SnapshotFilters {
	origin?: SnapshotOrigin;
	before?: number;
	after?: number;
	limit?: number;
	sessionId?: string;
}

export interface CreateSnapshotOptions {
	origin?: SnapshotOrigin;
	label?: string;
	description?: string;
	metadata?: SnapshotMetadata;
	sessionId?: string;
	files?: FileInput[];
	protected?: boolean;
	timeSinceLastChangeMs?: number;
}

// =============================================================================
// SNAPSHOT MANIFEST
// =============================================================================

/**
 * Generic snapshot manifest used by engine Storage stubs.
 * Canonical definition  -  engine.ts re-exports this.
 */
export interface SnapshotManifest {
	id: string;
	createdAt: number;
	origin?: string;
	description?: string;
	files: Array<{ path: string; hash: string; size: number; blobId?: string }>;
	metadata?: Record<string, unknown>;
}

export interface SnapshotManifestV1 {
	version: 1;
	id: string;
	createdAt: number;
	files: string[];
}

export interface SnapshotManifestV2 {
	version: 2;
	id: string;
	createdAt: number;
	origin: SnapshotOrigin;
	files: Array<{ path: string; hash: string; size: number }>;
	metadata?: SnapshotMetadata;
}

export type AnySnapshotManifest = SnapshotManifestV1 | SnapshotManifestV2;

export type SnapshotState = "pending" | "complete" | "failed" | "deleted";

// =============================================================================
// RESTORE & DIFF
// =============================================================================

export interface SnapshotRestoreResult {
	success: boolean;
	restoredFiles: string[];
	errors?: Array<{ path: string; error: string }>;
}

export interface FileDiff {
	path: string;
	type: "added" | "modified" | "deleted";
	oldContent?: string;
	newContent?: string;
	linesAdded?: number;
	linesRemoved?: number;
}

export interface DiffPreview {
	files: FileDiff[];
	totalLinesAdded: number;
	totalLinesRemoved: number;
}

export interface ConflictReport {
	hasConflicts: boolean;
	conflicts: Array<{ path: string; reason: string }>;
}

// =============================================================================
// VSCODE-SPECIFIC INTERFACES (UI and storage)
// =============================================================================

export interface IConfirmationService {
	confirm(message: string, detail?: string): Promise<boolean>;
}

export interface IStorageCreateOptions {
	/** Optional description/name for the snapshot */
	description?: string;
	/** Whether the snapshot should be protected */
	protected?: boolean;
	/** Origin/trigger of the snapshot */
	origin?: SnapshotOrigin;
}

export interface IStorage {
	/**
	 * Create a new snapshot with the given files.
	 * This is the preferred way to create snapshots - delegates to daemon or local storage.
	 *
	 * @param files - Array of file inputs with path, content, and optional action
	 * @param options - Creation options
	 * @returns Promise resolving to the created snapshot
	 */
	create(files: FileInput[], options?: IStorageCreateOptions): Promise<RichSnapshot>;

	/**
	 * @deprecated Use create() instead. This method throws in DaemonSnapshotAdapter.
	 */
	save(snapshot: RichSnapshot): Promise<void>;
	get(id: string): Promise<RichSnapshot | undefined>;
	getAll(): Promise<RichSnapshot[]>;
	delete(id: string): Promise<void>;
	update(id: string, updates: Partial<RichSnapshot>): Promise<void>;
}

export interface IEventEmitter {
	emit(type: string, data: unknown): void;
}
