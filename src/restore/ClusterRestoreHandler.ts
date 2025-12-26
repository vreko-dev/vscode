/**
 * ClusterRestoreHandler - Atomic multi-file restore with pre-flight checks
 *
 * Implements P1-9 / J3-E08: "Cluster partial lock - Some files locked = inconsistent"
 *
 * Key guarantees:
 * 1. Pre-flight check: All files must be writable before restore begins
 * 2. Atomic restore: Uses WorkspaceEdit so all files change together or none do
 * 3. Rollback on failure: If any file fails, none should change
 *
 * @see unified_ux_spec.md §3.4 Atomic Restore
 * @see GAP_ANALYSIS_REPORT.json - "Missing RollbackService with WorkspaceEdit"
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import type { Result } from "../types/result";
import { Err, Ok } from "../types/result";
import { logger } from "../utils/logger";

// ============================================
// Types
// ============================================

export interface RestoreFile {
	/** Relative path from workspace root */
	relativePath: string;
	/** Content to restore */
	content: string;
}

export interface ClusterRestoreOptions {
	/** Workspace root for resolving file paths */
	workspaceRoot: string;
	/** Files to restore with their content */
	files: RestoreFile[];
	/** Skip pre-flight checks (not recommended) */
	skipPreFlightChecks?: boolean;
	/** Dry run - validate only, don't apply */
	dryRun?: boolean;
}

export interface PreFlightResult {
	/** Whether all checks passed */
	passed: boolean;
	/** Files that passed checks */
	writableFiles: string[];
	/** Files that failed checks with reasons */
	failures: PreFlightFailure[];
}

export interface PreFlightFailure {
	/** File path that failed */
	file: string;
	/** Reason for failure */
	reason: PreFlightFailureReason;
	/** Human-readable error message */
	message: string;
	/** Original error if available */
	error?: Error;
}

export type PreFlightFailureReason =
	| "file_locked"
	| "permission_denied"
	| "parent_dir_missing"
	| "read_only"
	| "unknown";

export interface ClusterRestoreResult {
	/** Whether restore succeeded */
	success: boolean;
	/** Number of files restored */
	filesRestored: number;
	/** Files that were restored */
	restoredPaths: string[];
	/** Duration in milliseconds */
	durationMs: number;
	/** Pre-flight result if checks were run */
	preFlightResult?: PreFlightResult;
	/** Error if restore failed */
	error?: Error;
	/** Whether this was a dry run */
	dryRun: boolean;
}

// ============================================
// Error Classes
// ============================================

export class ClusterRestoreError extends Error {
	constructor(
		message: string,
		public readonly failures: PreFlightFailure[],
		public readonly filesAttempted: number,
	) {
		super(message);
		this.name = "ClusterRestoreError";
	}
}

export class PreFlightCheckError extends Error {
	constructor(
		message: string,
		public readonly preFlightResult: PreFlightResult,
	) {
		super(message);
		this.name = "PreFlightCheckError";
	}
}

// ============================================
// ClusterRestoreHandler
// ============================================

/**
 * Handles atomic multi-file restore operations with pre-flight validation.
 *
 * Uses VS Code's WorkspaceEdit API to ensure all file changes are applied
 * atomically - either all succeed or none are applied.
 */
export class ClusterRestoreHandler {
	/**
	 * Perform atomic cluster restore with pre-flight checks
	 *
	 * @param options - Restore configuration
	 * @returns Result with restore outcome or error
	 */
	async restore(options: ClusterRestoreOptions): Promise<Result<ClusterRestoreResult, ClusterRestoreError>> {
		const startTime = Date.now();
		const { workspaceRoot, files, skipPreFlightChecks = false, dryRun = false } = options;

		logger.info("Starting cluster restore", {
			fileCount: files.length,
			workspaceRoot,
			dryRun,
			skipPreFlightChecks,
		});

		// Step 1: Pre-flight checks (unless skipped)
		let preFlightResult: PreFlightResult | undefined;

		if (!skipPreFlightChecks) {
			preFlightResult = await this.runPreFlightChecks(workspaceRoot, files);

			if (!preFlightResult.passed) {
				const error = new ClusterRestoreError(
					`Pre-flight check failed: ${preFlightResult.failures.length} file(s) cannot be restored`,
					preFlightResult.failures,
					files.length,
				);

				logger.warn("Pre-flight checks failed", {
					failures: preFlightResult.failures.map((f) => ({
						file: f.file,
						reason: f.reason,
					})),
				});

				return Err(error);
			}

			logger.debug("Pre-flight checks passed", {
				writableFiles: preFlightResult.writableFiles.length,
			});
		}

		// Step 2: Dry run - return without applying
		if (dryRun) {
			return Ok({
				success: true,
				filesRestored: 0,
				restoredPaths: [],
				durationMs: Date.now() - startTime,
				preFlightResult,
				dryRun: true,
			});
		}

		// Step 3: Build WorkspaceEdit with all file changes
		const edit = new vscode.WorkspaceEdit();
		const restoredPaths: string[] = [];

		for (const file of files) {
			const fullPath = path.join(workspaceRoot, file.relativePath);
			const fileUri = vscode.Uri.file(fullPath);
			const content = Buffer.from(file.content, "utf-8");

			// Create or replace file content
			// Using createFile with overwrite flag handles both new and existing files
			edit.createFile(fileUri, {
				overwrite: true,
				contents: content,
			});

			restoredPaths.push(file.relativePath);
		}

		// Step 4: Apply edit atomically
		try {
			const applied = await vscode.workspace.applyEdit(edit);

			if (!applied) {
				const error = new ClusterRestoreError(
					"WorkspaceEdit failed to apply - no files were changed",
					[],
					files.length,
				);

				logger.error("WorkspaceEdit.applyEdit returned false");

				return Err(error);
			}

			const durationMs = Date.now() - startTime;

			logger.info("Cluster restore completed successfully", {
				filesRestored: files.length,
				durationMs,
			});

			return Ok({
				success: true,
				filesRestored: files.length,
				restoredPaths,
				durationMs,
				preFlightResult,
				dryRun: false,
			});
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));

			logger.error(`Cluster restore failed during WorkspaceEdit apply: ${err.message}`);

			return Err(
				new ClusterRestoreError(
					`Restore failed: ${err.message}`,
					[
						{
							file: "(all files)",
							reason: "unknown",
							message: err.message,
							error: err,
						},
					],
					files.length,
				),
			);
		}
	}

	/**
	 * Run pre-flight checks on all files to verify they can be written
	 *
	 * Checks:
	 * 1. Parent directory exists or can be created
	 * 2. File is not locked by another process
	 * 3. Write permissions exist
	 *
	 * @param workspaceRoot - Workspace root path
	 * @param files - Files to check
	 * @returns Pre-flight result with pass/fail status
	 */
	async runPreFlightChecks(workspaceRoot: string, files: RestoreFile[]): Promise<PreFlightResult> {
		const writableFiles: string[] = [];
		const failures: PreFlightFailure[] = [];

		for (const file of files) {
			const fullPath = path.join(workspaceRoot, file.relativePath);
			const checkResult = await this.checkFileWritable(fullPath);

			if (checkResult.writable) {
				writableFiles.push(file.relativePath);
			} else {
				failures.push({
					file: file.relativePath,
					reason: checkResult.reason,
					message: checkResult.message,
					error: checkResult.error,
				});
			}
		}

		return {
			passed: failures.length === 0,
			writableFiles,
			failures,
		};
	}

	/**
	 * Check if a single file can be written
	 */
	private async checkFileWritable(
		fullPath: string,
	): Promise<
		{ writable: true } | { writable: false; reason: PreFlightFailureReason; message: string; error?: Error }
	> {
		try {
			// Check 1: Parent directory exists or can be created
			const parentDir = path.dirname(fullPath);
			try {
				await fs.access(parentDir, fs.constants.W_OK);
			} catch (parentError) {
				// Try to check if we can create the directory
				try {
					await fs.access(path.dirname(parentDir), fs.constants.W_OK);
				} catch {
					return {
						writable: false,
						reason: "parent_dir_missing",
						message: `Parent directory ${parentDir} does not exist and cannot be created`,
						error: parentError instanceof Error ? parentError : undefined,
					};
				}
			}

			// Check 2: If file exists, check if it's writable
			try {
				await fs.access(fullPath, fs.constants.W_OK);
				// File exists and is writable
			} catch (fileError) {
				// File might not exist (which is fine) or is not writable
				const err = fileError as NodeJS.ErrnoException;

				if (err.code === "ENOENT") {
					// File doesn't exist - that's OK, we'll create it
					// But verify parent is writable (already checked above)
					return { writable: true };
				}

				if (err.code === "EACCES") {
					return {
						writable: false,
						reason: "permission_denied",
						message: `Permission denied: cannot write to ${fullPath}`,
						error: err,
					};
				}

				if (err.code === "EBUSY" || err.code === "ENOTEMPTY") {
					return {
						writable: false,
						reason: "file_locked",
						message: `File is locked or busy: ${fullPath}`,
						error: err,
					};
				}

				if (err.code === "EROFS") {
					return {
						writable: false,
						reason: "read_only",
						message: `File system is read-only: ${fullPath}`,
						error: err,
					};
				}

				// Unknown error
				return {
					writable: false,
					reason: "unknown",
					message: `Cannot access file: ${err.message}`,
					error: err,
				};
			}

			// Check 3: Try to detect file lock by attempting exclusive access
			// This is a best-effort check - some locks may not be detectable
			try {
				const handle = await fs.open(fullPath, "r+");
				await handle.close();
			} catch (lockError) {
				const err = lockError as NodeJS.ErrnoException;

				if (err.code === "EBUSY") {
					return {
						writable: false,
						reason: "file_locked",
						message: `File is locked by another process: ${fullPath}`,
						error: err,
					};
				}

				// ENOENT means file doesn't exist - that's fine
				if (err.code !== "ENOENT") {
					// Log but don't fail - some systems don't support this check
					logger.debug(`Lock check inconclusive for ${fullPath}: ${err.message}`);
				}
			}

			return { writable: true };
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			return {
				writable: false,
				reason: "unknown",
				message: `Unexpected error checking file: ${err.message}`,
				error: err,
			};
		}
	}
}

// ============================================
// Factory Function
// ============================================

/**
 * Create a new ClusterRestoreHandler instance
 */
export function createClusterRestoreHandler(): ClusterRestoreHandler {
	return new ClusterRestoreHandler();
}

// ============================================
// Utility: Convert snapshot contents to RestoreFile[]
// ============================================

/**
 * Convert snapshot contents map to RestoreFile array
 *
 * Handles both JSON-stringified and plain text content formats
 */
export function snapshotContentsToRestoreFiles(
	contents: Record<string, string>,
	filterPaths?: string[],
): RestoreFile[] {
	const files: RestoreFile[] = [];

	for (const [relativePath, rawContent] of Object.entries(contents)) {
		// Apply filter if provided
		if (filterPaths && !filterPaths.includes(relativePath)) {
			continue;
		}

		// Handle both JSON-stringified and plain text formats
		let content: string;
		try {
			const parsed = JSON.parse(rawContent);
			if (typeof parsed === "object" && parsed !== null && "content" in parsed) {
				content = parsed.content;
			} else {
				// Invalid JSON format, treat as plain text
				content = rawContent;
			}
		} catch {
			// Not JSON, treat as plain text (legacy format or simple content)
			content = rawContent;
		}

		files.push({
			relativePath,
			content,
		});
	}

	return files;
}
