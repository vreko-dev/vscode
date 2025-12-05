// apps/vscode/src/storage/types.ts

// ============================================
// Cooldown Types
// ============================================

export interface CooldownEntry {
	filePath: string;
	protectionLevel: string;
	triggeredAt: number;
	expiresAt: number;
	actionTaken: string;
	snapshotId?: string;
}

// ============================================
// Snapshot Types
// ============================================

export interface SnapshotFileRef {
	/** SHA-256 hash of content (blob ID) */
	blob: string;
	/** Original file size in bytes */
	size: number;
}

export interface SnapshotManifest {
	/** Unique ID: snap-{timestamp}-{random} */
	id: string;
	/** Unix timestamp (ms) */
	timestamp: number;
	/** Human-readable name */
	name: string;
	/** Trigger reason */
	trigger: "auto" | "manual" | "ai-detected" | "pre-save";
	/** Files in snapshot (path → ref) */
	files: Record<string, SnapshotFileRef>;
	/** Optional metadata */
	metadata?: {
		riskScore?: number;
		aiDetection?: {
			detected: boolean;
			tool?: string;
			confidence?: number;
		};
		sessionId?: string;
	};
}

export interface SnapshotWithContent extends SnapshotManifest {
	/** Resolved file contents (path → content) */
	contents: Record<string, string>;
}

export interface SnapshotFilters {
	after?: number;
	before?: number;
	trigger?: SnapshotManifest["trigger"];
	limit?: number;
}

// ============================================
// Session Types
// ============================================

export interface SessionFileEntry {
	filePath: string;
	snapshotId: string;
	changeStats: {
		added: number;
		deleted: number;
	};
}

export interface SessionManifest {
	/** Unique ID: sess-{timestamp}-{random} */
	id: string;
	/** Session start time (ms) */
	startedAt: number;
	/** Session end time (ms) */
	endedAt: number;
	/** Why session ended */
	reason: "idle" | "manual" | "window-close" | "timeout";
	/** Files modified in session */
	files: SessionFileEntry[];
	/** Optional tags */
	tags?: string[];
	/** Optional summary */
	summary?: string;
}

export interface SessionFilters {
	after?: number;
	before?: number;
	reason?: SessionManifest["reason"];
	limit?: number;
}

// ============================================
// Audit Types
// ============================================

export interface AuditEntry {
	/** Unique ID */
	id: string;
	/** Timestamp (ms) */
	timestamp: number;
	/** File path */
	filePath: string;
	/** Protection level */
	protectionLevel: string;
	/** Action taken */
	action:
		| "snapshot_created"
		| "snapshot_restored"
		| "save_blocked"
		| "save_warned"
		| "cooldown_triggered"
		| "ai_detected";
	/** Additional details */
	details?: Record<string, unknown>;
	/** Related snapshot ID */
	snapshotId?: string;
}

// ============================================
// Storage Metadata
// ============================================

export interface StorageMetadata {
	/** Storage format version (for migrations) */
	version: number;
	/** When storage was initialized */
	createdAt: number;
	/** Last write timestamp */
	lastUpdatedAt: number;
	/** Quick stats */
	stats: {
		snapshotCount: number;
		sessionCount: number;
		totalBlobBytes: number;
	};
}

// ============================================
// Storage Manager Interface
// ============================================

export interface IStorageManager {
	// Lifecycle
	initialize(): Promise<void>;
	dispose(): void;

	// Cooldowns (in-memory)
	setCooldown(entry: CooldownEntry): void;
	getCooldown(filePath: string, level: string): CooldownEntry | null;
	isInCooldown(filePath: string, level: string): boolean;
	clearCooldowns(): void;

	// Snapshots
	createSnapshot(
		files: Map<string, string>,
		options: {
			name: string;
			trigger: SnapshotManifest["trigger"];
			metadata?: SnapshotManifest["metadata"];
		},
	): Promise<SnapshotManifest>;
	getSnapshot(id: string): Promise<SnapshotWithContent | null>;
	listSnapshots(filters?: SnapshotFilters): Promise<SnapshotManifest[]>;
	deleteSnapshot(id: string): Promise<void>;

	// Sessions
	createSession(startedAt: number): Promise<string>;
	finalizeSession(
		id: string,
		endedAt: number,
		reason: SessionManifest["reason"],
		files: SessionFileEntry[],
	): Promise<SessionManifest>;
	getSession(id: string): Promise<SessionManifest | null>;
	listSessions(filters?: SessionFilters): Promise<SessionManifest[]>;

	// Audit
	recordAudit(entry: Omit<AuditEntry, "id" | "timestamp">): Promise<void>;
	getAuditTrail(filePath: string, limit?: number): Promise<AuditEntry[]>;

	// Metadata
	getStorageMetadata(): Promise<StorageMetadata>;
}

// ============================================
// Compatibility Types (for migration)
// ============================================

/**
 * @deprecated Use StorageManager directly
 * Compatibility alias for code still referencing old type
 */
export type SnapshotStorage = IStorageManager;

/**
 * @deprecated Use StorageManager directly
 * Compatibility alias for code still referencing old type
 */
export type FileSystemStorage = IStorageManager;
