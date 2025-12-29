/**
 * Large File Handler
 *
 * Implements J2-E04: File >10MB handling
 *
 * Provides file size checking with configurable thresholds
 * for warnings, confirmations, and absolute limits.
 *
 * @module handlers/LargeFileHandler
 */

import * as fs from "node:fs/promises";

/**
 * File size check result
 */
export interface FileSizeCheck {
	allowed: boolean;
	requiresConfirmation: boolean;
	message?: string;
	sizeBytes: number;
}

/**
 * Large file handler with configurable size limits
 *
 * Thresholds:
 * - 5MB: Warning (proceed with caution)
 * - 10MB: Confirmation required
 * - 50MB: Absolute limit (refuse)
 */
export class LargeFileHandler {
	private static readonly SIZE_LIMITS = {
		WARNING_THRESHOLD: 5 * 1024 * 1024, // 5MB - show warning
		HARD_LIMIT: 10 * 1024 * 1024, // 10MB - require confirmation
		ABSOLUTE_LIMIT: 50 * 1024 * 1024, // 50MB - refuse
	};

	/**
	 * Check file size and return appropriate action
	 */
	async checkFileSize(filePath: string): Promise<FileSizeCheck> {
		const stats = await fs.stat(filePath);
		const sizeBytes = stats.size;

		if (sizeBytes >= LargeFileHandler.SIZE_LIMITS.ABSOLUTE_LIMIT) {
			return {
				allowed: false,
				requiresConfirmation: false,
				message: `File is too large (${this.formatSize(sizeBytes)}). Maximum is 50MB.`,
				sizeBytes,
			};
		}

		if (sizeBytes >= LargeFileHandler.SIZE_LIMITS.HARD_LIMIT) {
			return {
				allowed: true,
				requiresConfirmation: true,
				message: `File is large (${this.formatSize(sizeBytes)}). Snapshot may be slow.`,
				sizeBytes,
			};
		}

		if (sizeBytes >= LargeFileHandler.SIZE_LIMITS.WARNING_THRESHOLD) {
			return {
				allowed: true,
				requiresConfirmation: false,
				message: `File is moderately large (${this.formatSize(sizeBytes)}).`,
				sizeBytes,
			};
		}

		return {
			allowed: true,
			requiresConfirmation: false,
			sizeBytes,
		};
	}

	/**
	 * Format file size for display
	 */
	formatSize(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
		return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
	}
}
