/**
 * FileConflictResolver.ts
 *
 * Handles file path conflicts, moves, and permission issues during restore.
 *
 * Spec Reference: unified_ux_spec.md §3.4
 * Edge Cases Covered:
 *   - J3-E03: File moved/renamed (P0)
 *   - J3-E04: Folder structure changed
 *   - J3-E05: File locked by process
 *   - J3-E06: Permissions changed
 *
 * @see https://github.com/your-org/snapback/blob/main/apps/vscode/unified_ux_spec.md
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";

export interface ConflictResult {
	resolved: boolean;
	action: "restored" | "skipped" | "merged";
	path: string;
	error?: Error;
}

/**
 * Resolves conflicts when restoring files to the filesystem.
 */
export class FileConflictResolver {
	/**
	 * Attempt to restore a file, handling conflicts.
	 * Uses atomic write pattern: write to temp file, then rename.
	 */
	async resolveAndWrite(
		targetPath: string,
		content: string,
		_originalMetadata: { created: number; permissions?: number },
	): Promise<ConflictResult> {
		try {
			// 1. Check write permissions
			const hasPermission = await this.checkPermissions(targetPath);
			if (!hasPermission) {
				return {
					resolved: false,
					action: "skipped",
					path: targetPath,
					error: new Error(`No write permission for ${targetPath}`),
				};
			}

			// 2. Ensure parent directory exists
			const parentDir = path.dirname(targetPath);
			await fs.mkdir(parentDir, { recursive: true });

			// 3. Atomic write: temp file + rename pattern
			const tempPath = `${targetPath}.snapback-tmp-${Date.now()}`;
			try {
				await fs.writeFile(tempPath, content, "utf8");
				await fs.rename(tempPath, targetPath);
			} catch (writeError) {
				// Clean up temp file on failure
				try {
					await fs.unlink(tempPath);
				} catch {
					// Ignore cleanup errors
				}
				throw writeError;
			}

			return {
				resolved: true,
				action: "restored",
				path: targetPath,
			};
		} catch (error) {
			return {
				resolved: false,
				action: "skipped",
				path: targetPath,
				error: error instanceof Error ? error : new Error(String(error)),
			};
		}
	}

	/**
	 * Detect if a file was renamed/moved since snapshot.
	 * Uses content hash matching to find moved files.
	 * Edge Case: J3-E03
	 */
	async findRenamedFile(originalPath: string, contentHash: string): Promise<string | null> {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders || workspaceFolders.length === 0) {
			return null;
		}

		const workspaceRoot = workspaceFolders[0].uri.fsPath;
		const originalFileName = path.basename(originalPath);
		const originalExt = path.extname(originalPath);

		// Search for files with same extension in workspace
		const pattern = new vscode.RelativePattern(workspaceRoot, `**/*${originalExt}`);
		const files = await vscode.workspace.findFiles(pattern, "**/node_modules/**", 100);

		for (const fileUri of files) {
			try {
				const content = await fs.readFile(fileUri.fsPath, "utf8");
				const hash = crypto.createHash("sha256").update(content).digest("hex");

				if (hash === contentHash) {
					// Found matching content - this is likely the renamed file
					return fileUri.fsPath;
				}

				// Also check for similar filename (fuzzy match)
				const fileName = path.basename(fileUri.fsPath);
				if (this.isSimilarFileName(originalFileName, fileName)) {
					// Check if content is at least 80% similar
					const similarity = this.calculateSimilarity(contentHash, hash);
					if (similarity > 0.8) {
						return fileUri.fsPath;
					}
				}
			} catch {}
		}

		return null;
	}

	/**
	 * Verify write permissions before attempting restore.
	 */
	async checkPermissions(targetPath: string): Promise<boolean> {
		try {
			// Check if file exists
			try {
				await fs.access(targetPath, fs.constants.W_OK);
				return true;
			} catch {
				// File doesn't exist, check parent directory
				const parentDir = path.dirname(targetPath);
				try {
					await fs.access(parentDir, fs.constants.W_OK);
					return true;
				} catch {
					// Parent doesn't exist, check if we can create it
					const rootDir = this.findExistingAncestor(parentDir);
					if (rootDir) {
						await fs.access(rootDir, fs.constants.W_OK);
						return true;
					}
					return false;
				}
			}
		} catch {
			return false;
		}
	}

	/**
	 * Find the nearest existing ancestor directory.
	 */
	private findExistingAncestor(dirPath: string): string | null {
		let current = dirPath;
		const root = path.parse(current).root;

		while (current !== root) {
			try {
				// Synchronous check for simplicity
				require("node:fs").accessSync(current);
				return current;
			} catch {
				current = path.dirname(current);
			}
		}

		return root;
	}

	/**
	 * Check if two filenames are similar (for rename detection).
	 */
	private isSimilarFileName(name1: string, name2: string): boolean {
		const base1 = path.basename(name1, path.extname(name1)).toLowerCase();
		const base2 = path.basename(name2, path.extname(name2)).toLowerCase();

		// Same base name
		if (base1 === base2) return true;

		// One contains the other
		if (base1.includes(base2) || base2.includes(base1)) return true;

		// Edit distance check (simple Levenshtein)
		const distance = this.levenshteinDistance(base1, base2);
		const maxLen = Math.max(base1.length, base2.length);
		return distance / maxLen < 0.3; // Less than 30% difference
	}

	/**
	 * Calculate Levenshtein distance between two strings.
	 */
	private levenshteinDistance(str1: string, str2: string): number {
		const m = str1.length;
		const n = str2.length;
		const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

		for (let i = 0; i <= m; i++) dp[i][0] = i;
		for (let j = 0; j <= n; j++) dp[0][j] = j;

		for (let i = 1; i <= m; i++) {
			for (let j = 1; j <= n; j++) {
				if (str1[i - 1] === str2[j - 1]) {
					dp[i][j] = dp[i - 1][j - 1];
				} else {
					dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
				}
			}
		}

		return dp[m][n];
	}

	/**
	 * Calculate similarity between two hashes (for fuzzy matching).
	 * Note: With SHA-256, different content = completely different hash.
	 * This is a placeholder for future similarity metrics.
	 */
	private calculateSimilarity(_hash1: string, _hash2: string): number {
		// SHA-256 hashes are cryptographic - they don't indicate content similarity
		// For actual similarity, we'd need to compare the content directly
		// For now, exact match only
		return _hash1 === _hash2 ? 1.0 : 0.0;
	}
}
