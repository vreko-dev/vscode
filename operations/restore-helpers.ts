/**
 * Restore Result Helpers
 *
 * Utility functions for creating restore operation results.
 *
 * @module operations/restore-helpers
 */

import type { DetailedRestoreResult } from "./types.js";

/**
 * Creates a successful restore result
 */
export function successRestoreResult(
	restored: string[],
	totalFiles: number,
	durationMs: number,
): DetailedRestoreResult {
	return {
		success: true,
		restored,
		failed: [],
		totalFiles,
		durationMs,
	};
}

/**
 * Creates a failed restore result with actionable suggestions
 */
export function failedRestoreResult(
	restored: string[],
	failed: Array<{ file: string; reason: string; errorCode?: string }>,
	totalFiles: number,
	durationMs: number,
): DetailedRestoreResult {
	// Generate actionable suggestion based on failure reasons
	const hasPermissionError = failed.some((f) => f.reason.toLowerCase().includes("permission"));
	const hasLockedFile = failed.some(
		(f) => f.reason.toLowerCase().includes("locked") || f.reason.toLowerCase().includes("busy"),
	);
	const hasNotFound = failed.some((f) => f.reason.toLowerCase().includes("not found") || f.errorCode === "ENOENT");

	let suggestion: string;
	if (hasLockedFile) {
		suggestion = "Close any editors with these files open, then try again. Files may be locked by another process.";
	} else if (hasPermissionError) {
		suggestion =
			"Check file permissions. Try running VS Code as administrator, or manually restore from .vreko/snapshots/";
	} else if (hasNotFound) {
		suggestion =
			"Some target directories may be missing. The restore will create files in existing directories only.";
	} else {
		suggestion =
			"Try running 'Vreko: List Snapshots' to see available snapshots, or check .vreko/ for manual recovery.";
	}

	return {
		success: false,
		restored,
		failed,
		totalFiles,
		durationMs,
		suggestion,
	};
}
