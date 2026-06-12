/**
 * Lazy-loading wrapper for simple-git to reduce bundle size
 *
 * This module defers loading of simple-git until it's actually needed,
 * saving ~200KB from the initial bundle and improving activation time.
 *
 * @module git-lazy
 */

import type { SimpleGit } from "simple-git";

let gitInstance: SimpleGit | null = null;

/**
 * Get the git instance, lazy-loading it on first use
 *
 * @returns Promise resolving to SimpleGit instance
 *
 * @example
 * ```typescript
 * const git = await getGit();
 * const status = await git.status();
 * ```
 */
export async function getGit(): Promise<SimpleGit> {
	if (!gitInstance) {
		// Dynamic import to lazy-load simple-git
		const { default: simpleGit } = await import("simple-git");
		gitInstance = simpleGit();
	}
	return gitInstance;
}

/**
 * Reset the git instance (useful for testing)
 */
export function resetGit(): void {
	gitInstance = null;
}

/**
 * Check if git is available in the current working directory
 *
 * @returns Promise resolving to true if git is available, false otherwise
 */
export async function isGitAvailable(): Promise<boolean> {
	try {
		const git = await getGit();
		await git.status();
		return true;
	} catch {
		return false;
	}
}
