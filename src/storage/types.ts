// apps/vscode/src/storage/types.ts

// ============================================
// Schema V2 Constants
// ============================================

/** Schema version for V2 manifests */
export const SCHEMA_VERSION_V2 = 2;

/** Checkpoint types for V2 schema */
export const CHECKPOINT_TYPES = ["POST", "PRE", "PRE_ROLLBACK"] as const;

/** Checkpoint type: POST (after save), PRE (before risky save), PRE_ROLLBACK (before restore) */
export type CheckpointType = (typeof CHECKPOINT_TYPES)[number];

/**
 * Type guard to check if a value is a valid CheckpointType
 */
export function isCheckpointType(value: unknown): value is CheckpointType {
	return typeof value === "string" && (CHECKPOINT_TYPES as readonly string[]).includes(value);
}

// ============================================
// Origin Labels (INTERACTIVE vs AUTOMATED)
// ============================================

/** Origin labels for change classification per spec */
export const ORIGIN_LABELS = ["INTERACTIVE", "AUTOMATED"] as const;

/** Origin label: INTERACTIVE (human typing), AUTOMATED (AI-generated) */
export type OriginLabel = (typeof ORIGIN_LABELS)[number];

/**
 * Type guard to check if a value is a valid OriginLabel
 */
export function isOriginLabel(value: unknown): value is OriginLabel {
	return typeof value === "string" && (ORIGIN_LABELS as readonly string[]).includes(value);
}

// ============================================
// Reason Codes (for explainability)
// ============================================

/** Reason codes for snapshot triggers per spec */
export const REASON_CODES = [
	"RISK_BURST_START",
	"RISK_LARGE_DELETE",
	"RISK_MULTI_FILE",
	"AI_DETECTED",
	"MANUAL_SAVE",
	"PRE_ROLLBACK",
	"MANUAL_CHECKPOINT",
	"CRITICAL_FILE",
] as const;

/** Reason code for explainability */
export type ReasonCode = (typeof REASON_CODES)[number];

/**
 * Type guard to check if a value is a valid ReasonCode
 */
export function isReasonCode(value: unknown): value is ReasonCode {
	return typeof value === "string" && (REASON_CODES as readonly string[]).includes(value);
}

// ============================================
// Trigger Types (expanded per spec)
// ============================================

/** Trigger types for snapshots per spec */
export const TRIGGER_TYPES = ["auto", "manual", "ai-detected", "pre-save", "risk-burst", "rollback"] as const;

/** Trigger type for what caused the snapshot */
export type Trigger = (typeof TRIGGER_TYPES)[number];

/**
 * Type guard to check if a value is a valid Trigger
 */
export function isTrigger(value: unknown): value is Trigger {
	return typeof value === "string" && (TRIGGER_TYPES as readonly string[]).includes(value);
}

// ============================================
// Compression Codecs
// ============================================

/** Compression codecs for blob storage per spec */
export const COMPRESSION_CODECS = ["zstd", "gzip", "none"] as const;

/** Compression codec type */
export type CompressionCodec = (typeof COMPRESSION_CODECS)[number];

/**
 * Type guard to check if a value is a valid CompressionCodec
 */
export function isCompressionCodec(value: unknown): value is CompressionCodec {
	return typeof value === "string" && (COMPRESSION_CODECS as readonly string[]).includes(value);
}

// ============================================
// Schema V2 Types
// ============================================

/** V2 file reference with blobHash (renamed from blob) */
export interface SnapshotFileRefV2 {
	/** SHA-256 hash of content (blob ID) */
	blobHash: string;
	/** Original file size in bytes */
	size: number;
	/** Compression codec used (optional, defaults to 'none') */
	codec?: CompressionCodec;
}

/** V2 snapshot manifest with chain support and checkpoint types */
export interface SnapshotManifestV2 {
	/** Schema version - always 2 for V2 */
	schemaVersion: 2;
	/** Unique ID: snap-{timestamp}-{random} */
	id: string;
	/** Sequential snapshot number (1-based, monotonic) */
	seq: number;
	/** Parent snapshot seq (null for root) */
	parentSeq: number | null;
	/** Parent snapshot ID (null for root) */
	parentId: string | null;
	/** Unix timestamp (ms) */
	timestamp: number;
	/** Human-readable name */
	name: string;
	/** Checkpoint type */
	type: CheckpointType;
	/** The main file that triggered this snapshot */
	anchorFile: string;
	/** Files in snapshot (path → ref). Includes anchor and related files. */
	files: Record<string, SnapshotFileRefV2>;
	/** Optional metadata */
	metadata?: {
		/** Risk score 0-1 */
		riskScore?: number;
		/** Origin classification (INTERACTIVE vs AUTOMATED) */
		origin?: OriginLabel;
		/** Stable reason codes for explainability */
		reasons?: ReasonCode[];
		/** Legacy AI detection (keep for compatibility) */
		aiDetection?: {
			detected: boolean;
			tool?: string;
			confidence?: number;
		};
		sessionId?: string;
	};
}

/**
 * Type guard to check if a value is a valid SnapshotManifestV2
 */
export function isSnapshotManifestV2(value: unknown): value is SnapshotManifestV2 {
	if (typeof value !== "object" || value === null) {
		return false;
	}

	const obj = value as Record<string, unknown>;

	// Check required V2 fields
	if (obj.schemaVersion !== SCHEMA_VERSION_V2) {
		return false;
	}

	if (typeof obj.id !== "string") {
		return false;
	}

	if (typeof obj.seq !== "number" || obj.seq < 1 || !Number.isInteger(obj.seq)) {
		return false;
	}

	// parentSeq must be null or a positive integer less than seq
	if (obj.parentSeq !== null) {
		if (typeof obj.parentSeq !== "number" || !Number.isInteger(obj.parentSeq) || obj.parentSeq < 0) {
			return false;
		}
	}

	// parentId must be null or string
	if (obj.parentId !== null && typeof obj.parentId !== "string") {
		return false;
	}

	if (typeof obj.timestamp !== "number") {
		return false;
	}

	if (typeof obj.name !== "string") {
		return false;
	}

	if (!isCheckpointType(obj.type)) {
		return false;
	}

	if (typeof obj.anchorFile !== "string") {
		return false;
	}

	if (typeof obj.files !== "object" || obj.files === null) {
		return false;
	}

	return true;
}

// ============================================
// Cooldown Types
// ============================================

export interface CooldownEntry {
	filePath: string;
	protectionLevel: string;
	triggeredAt: number;
	expiresAt: number;
	/** Action that triggered the cooldown. 'temporary_allowance' is a special case for one-time save bypasses */
	actionTaken: "snapshot_created" | "save_allowed" | "save_blocked" | "user_override" | "temporary_allowance";
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
	/** The main file that triggered this snapshot */
	anchorFile: string;
	/** Files in snapshot (path → ref). Includes anchor and related files. */
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
