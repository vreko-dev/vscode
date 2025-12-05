/**
 * @fileoverview Domain Types for AutoDecisionEngine
 *
 * These types form the contract between layers.
 * They have NO dependencies on VS Code or any external library.
 */

// ============================================
// Input: Context for making protection decisions
// ============================================

export interface FileContext {
	/** Relative path from workspace root */
	path: string;
	/** File extension (e.g., ".ts", ".json") */
	extension: string;
	/** Size in bytes */
	sizeBytes: number;
	/** Is this a new file (not previously tracked)? */
	isNew: boolean;
	/** Is this a binary file? */
	isBinary: boolean;
	/** SHA-256 hash before this save (undefined if new) */
	prevHash?: string;
	/** SHA-256 hash after this save */
	nextHash: string;
}

export interface SaveContext {
	/** Unique identifier for this workspace/repo */
	repoId: string;

	/** Unix timestamp (ms) when save occurred */
	timestamp: number;

	/** Files involved in this save event */
	files: FileContext[];

	// ---- AI Detection Signals ----

	/** Was AI involvement detected? */
	aiDetected: boolean;

	/** Which AI tool was detected? (cursor, copilot, claude, etc.) */
	aiToolName?: string;

	/** Confidence of AI detection (0-1) */
	aiConfidence?: number;

	// ---- Session Signals ----

	/** Current session ID (from DBSCAN grouping) */
	sessionId: string;

	/** Number of files modified in this session */
	sessionFileCount: number;

	/** Duration of current session in ms */
	sessionDurationMs: number;

	// ---- Risk Signals ----

	/** Computed risk score (0-100) */
	riskScore: number;

	/** Was a burst of rapid changes detected? */
	burstDetected: boolean;

	// ---- Critical File Signals ----

	/** Does this save include critical config files? */
	containsCriticalFiles: boolean;

	/** Count of critical files in this save */
	criticalFileCount: number;
}

// ============================================
// Output: Protection decision
// ============================================

export type DecisionReason =
	| "ai_detected" // AI tool involvement detected
	| "risk_threshold" // Risk score exceeded threshold
	| "burst_pattern" // Rapid changes detected
	| "critical_file" // Critical config file modified
	| "session_size" // Large session (many files)
	| "manual_request" // User explicitly requested
	| "fallback"; // Default protection (no specific trigger)

export interface ProtectionDecision {
	/** Should we create a snapshot? */
	createSnapshot: boolean;

	/** Should we show a notification to the user? */
	showNotification: boolean;

	/** Why did we make this decision? */
	reasons: DecisionReason[];

	/** Confidence in this decision (0-1) */
	confidence: number;

	/** Human-readable summary for notifications */
	summary: string;

	/** Context passed through for telemetry/logging */
	context: {
		riskScore: number;
		sessionId: string;
		filesInSession: number;
		criticalFileCount: number;
		aiToolName?: string;
	};
}

// ============================================
// Configuration
// ============================================

export interface AutoDecisionConfig {
	/** Risk score threshold for automatic snapshot (0-100) */
	riskThreshold: number;

	/** Risk score threshold for notification without snapshot (0-100) */
	notifyThreshold: number;

	/** Minimum files in burst to trigger protection */
	minFilesForBurst: number;

	/** Maximum snapshots allowed per minute (rate limiting) */
	maxSnapshotsPerMinute: number;

	/** Always snapshot these file patterns */
	alwaysProtectPatterns: string[];

	/** Never snapshot these file patterns */
	neverProtectPatterns: string[];
}

export const DEFAULT_CONFIG: AutoDecisionConfig = {
	riskThreshold: 60,
	notifyThreshold: 40,
	minFilesForBurst: 3,
	maxSnapshotsPerMinute: 4,
	alwaysProtectPatterns: [
		"package.json",
		"tsconfig.json",
		".env*",
		"*.config.js",
		"*.config.ts",
	],
	neverProtectPatterns: [
		"node_modules/**",
		"dist/**",
		"*.log",
		"*.lock",
	],
};

// ============================================
// Snapshot Intent (for orchestrator)
// ============================================

export interface SnapshotIntent {
	/** Unique ID for this snapshot */
	id: string;

	/** Files to include in snapshot */
	files: Map<string, string>; // path → content

	/** Name for the snapshot */
	name: string;

	/** What triggered this snapshot */
	trigger: "auto" | "ai-detected" | "manual" | "burst";

	/** Metadata for analytics */
	metadata: {
		riskScore: number;
		aiDetected: boolean;
		aiToolName?: string;
		sessionId: string;
		reasons: DecisionReason[];
	};
}
