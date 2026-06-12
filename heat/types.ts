/**
 * File Heat Types
 *
 * Types for the file heat decoration system that tracks file activity,
 * AI-assisted edits, and "struggle" indicators (undo/redo patterns).
 */

/**
 * Heat level indicating the activity intensity of a file.
 *
 * - `none`: No significant activity (no decoration)
 * - `warm`: Elevated activity (yellow dot)
 * - `hot`: High churn or risk (fire emoji)
 * - `critical`: Extreme activity requiring attention (red fire)
 */
export type HeatLevel = "none" | "warm" | "hot" | "critical";

/**
 * AI tool that may be assisting edits.
 */
export type AITool = "cursor" | "copilot" | "claude" | "tabnine" | "codeium" | "unknown";

/**
 * File heat data tracking all activity metrics for a single file.
 */
export interface FileHeatData {
	/** Absolute file path */
	filePath: string;

	/** Number of saves in the tracking window */
	saveCount: number;

	/** Timestamps of recent saves (for decay calculation) */
	saveTimestamps: number[];

	/** Lines changed since last checkpoint */
	diffSize: number;

	/** AI tool involvement */
	ai: {
		involved: boolean;
		tool?: AITool;
		confidence: number;
		lastDetected?: number;
	};

	/** Undo/redo activity (struggle indicator) */
	undoRedoCount: number;

	/** Last activity timestamp */
	lastActivity: number;

	/** When tracking started for this file */
	trackingStarted: number;
}

/**
 * Heat assessment result for a file.
 */
export interface HeatAssessment {
	/** Current heat level */
	level: HeatLevel;

	/** Human-readable reasons for the heat level */
	reasons: string[];

	/** Whether AI tools are involved */
	aiInvolved: boolean;

	/** Numeric score (0-100) for internal ranking */
	score: number;
}

/**
 * Configuration for the heat tracking system.
 */
export interface HeatConfig {
	/** Time window for tracking saves (ms) - default: 10 minutes */
	trackingWindow: number;

	/** How often to decay heat (ms) - default: 1 minute */
	decayInterval: number;

	/** Heat level thresholds */
	thresholds: {
		warm: {
			saveCount: number;
			diffSize: number;
		};
		hot: {
			saveCount: number;
			diffSize: number;
			undoRedoCount: number;
		};
		critical: {
			saveCount: number;
			diffSize: number;
		};
	};

	/** AI detection amplifies heat - default: 1.5 */
	aiMultiplier: number;

	/** Minimum time between decoration updates (ms) - default: 500 */
	debounceInterval: number;

	/** Maximum files to track (LRU eviction) - default: 1000 */
	maxTrackedFiles: number;
}

/**
 * Default heat configuration.
 */
export const DEFAULT_HEAT_CONFIG: HeatConfig = {
	trackingWindow: 10 * 60 * 1000, // 10 minutes
	decayInterval: 60 * 1000, // 1 minute
	thresholds: {
		warm: { saveCount: 5, diffSize: 200 },
		hot: { saveCount: 10, diffSize: 500, undoRedoCount: 5 },
		critical: { saveCount: 20, diffSize: 1000 },
	},
	aiMultiplier: 1.5,
	debounceInterval: 500,
	maxTrackedFiles: 1000,
};

/**
 * Heat summary for vitals integration.
 */
export interface HeatSummary {
	/** Total number of files with heat above 'none' */
	totalHotFiles: number;

	/** Files at critical heat level */
	criticalFiles: string[];

	/** Files with AI involvement */
	aiInvolvedFiles: string[];
}
