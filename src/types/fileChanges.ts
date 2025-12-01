/**
 * File change status types matching git diff output
 * Used by SnapshotNamingStrategy
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
