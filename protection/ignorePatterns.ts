/**
 * Centralized Ignore Patterns for File Watching & Protection
 *
 * Single source of truth for paths that should be ignored by:
 * - FileSystemWatcher (chokidar-based protection watcher)
 * - OperationCoordinator (snapshot creation)
 * - AutoDecisionIntegration (auto-decision file monitoring)
 *
 * Adding a pattern here ensures it is respected across all watchers.
 */

// =============================================================================
// GLOB PATTERNS (for chokidar / minimatch consumers)
// =============================================================================

/**
 * Glob patterns for directories and files that should never trigger
 * protection events, snapshots, or behavioral signals.
 *
 * Used by chokidar's `ignored` option and snapshot ignore logic.
 */
export const PROTECTION_IGNORE_GLOBS: string[] = [
	// Version control
	"**/.git/**",

	// Vreko internals
	"**/.vreko/**",

	// Package managers
	"**/node_modules/**",

	// Build outputs
	"**/dist/**",
	"**/build/**",
	"**/.next/**",
	"**/out/**",
	"**/coverage/**",

	// Editor / IDE artifacts
	"**/.vscode/**",
	"**/.idea/**",

	// AI agent temp directories
	"**/.cursor/tmp/**",
	"**/.continue/pending/**",
	"**/.copilot/**",
	"**/.aider.tags.cache.v3/**",

	// Cache directories
	"**/.cache/**",
	"**/*cache*/**",
	"**/.turbo/**",

	// Log and lock files
	"**/*.log",
	"**/*.lock",

	// OS artifacts
	"**/.DS_Store",
	"**/Thumbs.db",

	// Minified / map files
	"**/*.min.js",
	"**/*.map",

	// Environment files (handled by protection, not watching)
	"**/.env",
	"**/.env.local",
];

// =============================================================================
// SUBSTRING PATTERNS (for fast fsPath.includes() checks)
// =============================================================================

/**
 * Substring patterns for quick `filePath.includes()` checks.
 * Preferred for hot-path filtering where glob matching is too slow.
 */
const IGNORE_SUBSTRINGS: string[] = [
	"/.git/",
	"/.vreko/",
	"/node_modules/",
	"/dist/",
	"/build/",
	"/.next/",
	"/out/",
	"/coverage/",
	"/.vscode/",
	"/.idea/",
	"/.cursor/tmp/",
	"/.continue/pending/",
	"/.copilot/",
	"/.cache/",
	"/.turbo/",
];

/**
 * File extensions that should always be ignored in hot-path checks.
 */
const IGNORE_EXTENSIONS: string[] = [".log", ".lock", ".min.js", ".map"];

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Fast check whether a file path should be ignored from protection monitoring.
 *
 * Uses substring matching (O(n) on patterns, no regex/glob overhead) so it's
 * safe to call on every file-system event in the hot path.
 *
 * @param filePath - Absolute file path to check
 * @returns true if the file should be ignored
 */
export function shouldIgnorePath(filePath: string): boolean {
	// Substring check on directory segments
	if (IGNORE_SUBSTRINGS.some((pattern) => filePath.includes(pattern))) {
		return true;
	}

	// Extension check
	if (IGNORE_EXTENSIONS.some((ext) => filePath.endsWith(ext))) {
		return true;
	}

	// OS artifacts
	if (filePath.endsWith(".DS_Store") || filePath.endsWith("Thumbs.db")) {
		return true;
	}

	return false;
}
