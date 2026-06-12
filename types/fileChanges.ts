// =============================================================================
// CANONICAL FILE CHANGE (single source for snapshot/engine/sdk consumers)
// =============================================================================

/**
 * Standard file change representation used across the extension.
 * Canonical type  -  engine.ts and oss-sdk.ts re-export this.
 */
export interface FileChange {
	path: string;
	type: "added" | "modified" | "deleted";
	linesAdded?: number;
	linesRemoved?: number;
	/** Optional file content (only populated by engine-level callers) */
	content?: string;
}

// =============================================================================
// SPECIALIZED FILE CHANGE VARIANTS
// =============================================================================

/**
 * File change status types matching git diff output.
 * Used by SnapshotNamingStrategy.
 */
export interface GitFileChange {
	path: string;
	status: "added" | "modified" | "deleted";
	linesAdded: number;
	linesDeleted: number;
}

/**
 * Represents a file change between snapshot and current state
 * Used by FileChangeAnalyzer
 */
export interface AnalyzedFileChange {
	/** Absolute file path */
	filePath: string;

	/** Relative file path for display */
	relativePath: string;

	/** File name only */
	fileName: string;

	/** Type of change */
	changeType: "modified" | "added" | "deleted" | "unchanged";

	/** Number of lines added (for modified files) */
	linesAdded: number;

	/** Number of lines deleted (for modified files) */
	linesDeleted: number;

	/** Content from snapshot */
	snapshotContent: string;

	/** Current content (if file exists) */
	currentContent?: string;

	/** Icon identifier for VS Code */
	icon: string;

	/** Human-readable change summary */
	changeSummary: string;
}

/**
 * Type of change detected for a file
 */
export type FileChangeType = "modified" | "added" | "deleted" | "unchanged";
