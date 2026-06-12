/**
 * Operation Types
 *
 * Core type definitions for the operation coordination system.
 *
 * @module operations/types
 */

/**
 * Represents a coordinated operation within the Vreko workflow execution system.
 */
export interface Operation {
	/** Unique identifier for operation tracking and dependency resolution */
	id: string;

	/** Human-readable operation description for user feedback and logging */
	name: string;

	/** Current execution state determining available transitions and actions */
	status: "pending" | "running" | "completed" | "failed";

	/** Completion percentage (0-100) for progress indication and estimation */
	progress: number;

	/** Unix timestamp when operation was initiated for performance tracking */
	startTime: number;

	/** Unix timestamp when operation completed for duration calculation */
	endTime?: number;

	/** Array of operation IDs that must complete before this operation can start */
	dependencies?: string[];
}

/**
 * Detailed result from a restore operation
 */
export interface DetailedRestoreResult {
	/** Whether the restore was fully successful */
	success: boolean;
	/** Files that were successfully restored */
	restored: string[];
	/** Files that failed to restore with reasons */
	failed: Array<{
		file: string;
		reason: string;
		errorCode?: string;
	}>;
	/** Total number of files in snapshot */
	totalFiles: number;
	/** Human-readable suggestion for recovery */
	suggestion?: string;
	/** Duration in milliseconds */
	durationMs: number;
	/** Pre-flight check failures if any */
	preFlightFailures?: Array<{
		file: string;
		reason: string;
	}>;
}

/**
 * Options for restore operations
 */
export interface RestoreOptions {
	/** Specific files to restore (if undefined, restores all) */
	files?: string[];
	/** Whether to perform a dry run without actually restoring */
	dryRun?: boolean;
	/** Whether to backup current state before restoring */
	backupCurrent?: boolean;
}

/**
 * Result from a snapshot creation operation
 */
export interface SnapshotCreationResult {
	/** The ID of the created snapshot, or undefined if creation failed */
	snapshotId: string | undefined;
	/** Number of files included in the snapshot */
	fileCount: number;
	/** Whether the operation was successful */
	success: boolean;
	/** Error message if the operation failed */
	error?: string;
}

/**
 * Configuration for directory walking operations
 */
export interface DirectoryWalkOptions {
	/** Ignore instance for filtering files */
	ignoreInstance: import("ignore").Ignore;
	/** Maximum number of files to process */
	maxFiles?: number;
	/** Maximum total size of files in bytes */
	maxTotalSize?: number;
}

/**
 * Snapshot limits from runtime configuration
 */
export interface SnapshotLimits {
	/** Maximum number of files to include in a snapshot */
	maxFiles: number;
	/** Maximum size for individual files in bytes */
	maxFileSize: number;
	/** Maximum total size of all files in bytes */
	maxTotalSize: number;
}
