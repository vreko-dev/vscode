/**
 * @fileoverview Bridge Types for SignalOrchestrator and IntelligenceBridge
 *
 * These types form the contract between signal computation and aggregation layers.
 * They have NO dependencies on VS Code or any external library.
 */

// =============================================================================
// SignalOrchestrator Types
// =============================================================================

/**
 * File input for signal computation
 */
export interface FileForSignals {
	/** File path relative to workspace */
	path: string;
	/** File content for analysis */
	content: string;
	/** Number of lines in the file */
	lineCount: number;
}

/**
 * Aggregated result from all signal computations
 */
export interface SignalOrchestratorResult {
	/** Overall risk score (0-10) */
	riskScore: number;
	/** Maximum complexity score (0-1) */
	complexity: number;
	/** Risk factors detected */
	factors: string[];
	/** List of sensitive file paths */
	sensitiveFiles: string[];
	/** Count of threat-related factors */
	threatCount: number;
}

// =============================================================================
// IntelligenceBridge Types (already exported from IntelligenceBridge.ts,
// but re-exported here for consistency if needed)
// =============================================================================

/**
 * Analysis result for Intelligence recording
 */
export interface AnalysisResultInput {
	filePath: string;
	score: number;
	severity: "low" | "medium" | "high" | "critical";
	factors: string[];
	passed: boolean;
}

/**
 * User behavior event for calibration
 */
export interface UserBehaviorInput {
	type: "snapshot_created" | "restore_performed" | "ai_session";
	userInitiated: boolean;
}

/**
 * Session metadata
 */
export interface SessionMetadata {
	files?: string[];
}
