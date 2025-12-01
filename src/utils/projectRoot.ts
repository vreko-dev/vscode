/**
 * @fileoverview Project Root Detection Utility
 *
 * Provides asynchronous utilities for finding the project root directory
 * by detecting package.json or pnpm-workspace.yaml files.
 * Non-blocking implementation suitable for extension activation.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";

/** Project root markers checked in order of preference */
const PROJECT_MARKERS = ["package.json", "pnpm-workspace.yaml"] as const;

/** Maximum directory traversal depth to prevent infinite loops */
const MAX_DEPTH = 5;

/**
 * Check if a directory exists asynchronously
 * Used by phase2-storage.ts to verify .snapback directory locations.
 * Non-blocking implementation suitable for extension activation.
 *
 * @param dirPath - The path to check
 * @returns Promise<boolean> - True if directory exists, false otherwise
 */
export async function directoryExists(dirPath: string): Promise<boolean> {
	try {
		const stats = await fs.stat(dirPath);
		return stats.isDirectory();
	} catch {
		return false;
	}
}

/**
 * Find the project root by looking for package.json or pnpm-workspace.yaml
 *
 * This function traverses up the directory tree (max 5 levels) to find
 * indicators of a project root. Non-blocking async implementation.
 *
 * @param startPath - The directory to start searching from
 * @returns Promise<string | null> - The project root path, or null if not found
 */
export async function findProjectRoot(
	startPath: string,
): Promise<string | null> {
	let currentPath = startPath;

	// Go up at most MAX_DEPTH levels to find the project root
	for (let i = 0; i < MAX_DEPTH; i++) {
		// Check if this directory contains any project markers
		for (const marker of PROJECT_MARKERS) {
			const markerPath = path.join(currentPath, marker);

			try {
				await fs.access(markerPath);
				// Found a marker, this is likely the project root
				return currentPath;
			} catch {}
		}

		const parentPath = path.dirname(currentPath);
		// If we've reached the root directory, stop
		if (parentPath === currentPath) {
			break;
		}
		currentPath = parentPath;
	}

	return null;
}
