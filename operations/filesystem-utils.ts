/**
 * Filesystem Utilities
 *
 * Directory walking, ignore pattern loading, and file system helpers.
 *
 * @module operations/filesystem-utils
 */

import { readdir, readFile, stat } from "node:fs/promises";
import * as path from "node:path";
import ignore from "ignore";
import { THRESHOLDS } from "../constants/thresholds.js";
import type { SnapshotLimits } from "./types.js";

/**
 * Default ignore patterns that should always be excluded from snapshots
 */
export const DEFAULT_IGNORE_PATTERNS = [
	"node_modules/**",
	".git/**",
	"dist/**",
	"build/**",
	".next/**",
	"out/**",
	"coverage/**",
	".vreko/**",
	"*.log",
	".DS_Store",
	".env",
	".env.local",
	"**/*.min.js",
	"**/*.map",
];

/**
 * Get current snapshot limits from runtime thresholds
 */
export function getSnapshotLimits(): SnapshotLimits {
	return {
		maxFiles: THRESHOLDS.resources.snapshotMaxFiles,
		maxFileSize: THRESHOLDS.resources.snapshotMaxFileSize,
		maxTotalSize: THRESHOLDS.resources.snapshotMaxTotalSize,
	};
}

/**
 * Load ignore patterns from .gitignore and .vrekoignore
 */
export async function loadIgnorePatterns(workspaceRoot: string): Promise<string[]> {
	const patterns = [...DEFAULT_IGNORE_PATTERNS];

	// Load .gitignore if exists
	const gitignorePath = path.join(workspaceRoot, ".gitignore");
	try {
		const gitignore = await readFile(gitignorePath, "utf-8");
		patterns.push(...gitignore.split("\n").filter((line) => line.trim() && !line.startsWith("#")));
	} catch {
		// .gitignore doesn't exist, continue
	}

	// Load .vrekoignore if exists (higher priority)
	const vrekoIgnorePath = path.join(workspaceRoot, ".vrekoignore");
	try {
		const vrekoIgnore = await readFile(vrekoIgnorePath, "utf-8");
		patterns.push(...vrekoIgnore.split("\n").filter((line) => line.trim() && !line.startsWith("#")));
	} catch {
		// .vrekoignore doesn't exist, continue
	}

	return patterns;
}

/**
 * Create an ignore instance with the given patterns
 */
export function createIgnoreInstance(patterns: string[]): ReturnType<typeof ignore> {
	return ignore().add(patterns);
}

/**
 * Efficiently walks through a directory structure, applying ignore patterns
 */
export async function* walkDirectory(
	root: string,
	options: {
		ignoreInstance: ReturnType<typeof ignore>;
		maxFiles?: number;
		maxTotalSize?: number;
	},
): AsyncGenerator<string> {
	let fileCount = 0;
	let totalSize = 0;
	let _skippedDirs = 0;
	let _skippedFiles = 0;

	const { ignoreInstance, maxFiles = Number.POSITIVE_INFINITY, maxTotalSize = Number.POSITIVE_INFINITY } = options;

	async function* walk(dir: string): AsyncGenerator<string> {
		// Check if we've hit limits
		if (fileCount >= maxFiles) {
			return;
		}
		if (totalSize >= maxTotalSize) {
			return;
		}

		const entries = await readdir(dir, { withFileTypes: true });

		for (const entry of entries) {
			const fullPath = path.join(dir, entry.name);
			const relativePath = path.relative(root, fullPath);

			// Skip ignored paths
			if (ignoreInstance.ignores(relativePath)) {
				if (entry.isDirectory()) {
					_skippedDirs++;
				} else {
					_skippedFiles++;
				}
				continue;
			}

			if (entry.isDirectory()) {
				yield* walk(fullPath);
			} else if (entry.isFile()) {
				// Check file size
				try {
					const stats = await stat(fullPath);
					if (totalSize + stats.size > maxTotalSize) {
						continue;
					}
					totalSize += stats.size;
					fileCount++;
					yield fullPath;
				} catch {
					/* stat failed, skip file */
				}
			}
		}
	}

	yield* walk(root);
}

/**
 * Check if a file is within workspace boundaries
 */
export function isWithinWorkspace(filePath: string, workspaceRoot: string): boolean {
	const relative = path.relative(workspaceRoot, filePath);
	return !relative.startsWith("..") && !path.isAbsolute(relative);
}

/**
 * Filter files to only include those within workspace
 */
export function filterWorkspaceFiles(files: string[], workspaceRoot: string): string[] {
	return files.filter((file) => isWithinWorkspace(file, workspaceRoot));
}

/**
 * Convert absolute paths to workspace-relative paths
 */
export function toRelativePaths(files: string[], workspaceRoot: string): string[] {
	return files.map((file) => {
		if (path.isAbsolute(file)) {
			return path.relative(workspaceRoot, file);
		}
		return file;
	});
}

/**
 * Convert relative paths to absolute paths
 */
export function toAbsolutePaths(files: string[], workspaceRoot: string): string[] {
	return files.map((file) => {
		if (!path.isAbsolute(file)) {
			return path.join(workspaceRoot, file);
		}
		return file;
	});
}
