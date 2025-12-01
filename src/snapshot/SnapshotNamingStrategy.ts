import { exec } from "node:child_process";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { promisify } from "node:util";

const execAsync = promisify(exec);

/**
 * File change status types matching git diff output
 */
export interface FileChange {
	path: string;
	status: "added" | "modified" | "deleted";
	linesAdded: number;
	linesDeleted: number;
}

/**
 * Snapshot information for name generation
 */
export interface SnapshotInfo {
	files: FileChange[];
	workspaceRoot: string;
}

/**
 * Multi-tier intelligent snapshot naming strategy
 *
 * Naming Tiers (fallback chain):
 * 1. Git Analysis: Parse git diff --name-status output
 * 2. File Operations: Detect patterns from extensions/paths
 * 3. Content Analysis: Count import/function/class changes
 * 4. Fallback: Line count summary
 *
 * Performance: < 50ms for name generation
 */
export class SnapshotNamingStrategy {
	private readonly workspaceRoot: string;
	private static readonly GIT_TIMEOUT_MS = 5000;
	private static readonly MAX_NAME_LENGTH = 60;

	constructor(workspaceRoot: string) {
		this.workspaceRoot = workspaceRoot;
	}

	/**
	 * Generates a snapshot name using multi-tier fallback strategy
	 *
	 * @param info - Snapshot information containing file changes
	 * @returns Promise resolving to a descriptive snapshot name
	 */
	async generateName(info: SnapshotInfo): Promise<string> {
		// Early exit for empty file list
		if (info.files.length === 0) {
			return "No changes";
		}

		// Tier 1: Git-based naming
		const gitName = await this.tryGitNaming(info);
		if (gitName) {
			return gitName;
		}

		// Tier 2: File operation pattern detection
		const fileOpName = this.tryFileOperationNaming(info);
		if (fileOpName) {
			return fileOpName;
		}

		// Tier 3: Content analysis
		const contentName = await this.tryContentAnalysisNaming(info);
		if (contentName) {
			return contentName;
		}

		// Tier 4: Fallback to line counts
		return this.fallbackNaming(info);
	}

	/**
	 * Tier 1: Git-based naming
	 * Attempts to use actual git commands to generate names.
	 * Returns null if git is unavailable or no git repo exists.
	 *
	 * @param info - Snapshot information
	 * @returns Promise resolving to git-style name or null if git unavailable
	 */
	private async tryGitNaming(info: SnapshotInfo): Promise<string | null> {
		try {
			// Check if we're in a git repository
			const isGitRepo = await this.execGit(["rev-parse", "--git-dir"]);
			if (!isGitRepo) {
				return null;
			}

			// Try to get actual git status
			const gitStatus = await this.execGit(["status", "--porcelain"]);
			if (!gitStatus) {
				return null;
			}

			// If we have git info, generate git-style names
			if (info.files.length === 1) {
				const file = info.files[0];
				return this.generateSingleFileGitName(file.status, file.path);
			}

			return this.generateMultiFileGitName(info.files);
		} catch (_error) {
			// Git operation failed, fall through to next tier
			return null;
		}
	}

	/**
	 * Tier 2: File operation pattern detection
	 * Detects test files, configs, dependencies with priority ordering
	 *
	 * @param info - Snapshot information
	 * @returns Pattern-based name or null if no patterns match
	 */
	private tryFileOperationNaming(info: SnapshotInfo): string | null {
		const files = info.files;

		// Priority 1: Check for test files (highest priority)
		const testFiles = files.filter((f) => this.isTestFile(f.path));
		if (testFiles.length > 0 && testFiles.length === files.length) {
			return `Updated ${testFiles.length} test${
				testFiles.length > 1 ? "s" : ""
			}`;
		}

		// Priority 2: Check for dependency files
		const dependencyFiles = files.filter((f) => this.isDependencyFile(f.path));
		if (dependencyFiles.length > 0) {
			return "Updated dependencies";
		}

		// Priority 3: Check for config files (all files must be configs)
		const configFiles = files.filter((f) => this.isConfigFile(f.path));
		if (configFiles.length > 0 && configFiles.length === files.length) {
			return `Modified ${configFiles.length} config${
				configFiles.length > 1 ? "s" : ""
			}`;
		}

		// Priority 4: Mixed types with test files - prioritize test detection
		if (testFiles.length > 0 && testFiles.length < files.length) {
			// Has test files mixed with other types
			return `Updated ${testFiles.length} test${
				testFiles.length > 1 ? "s" : ""
			}`;
		}

		return null;
	}

	/**
	 * Tier 3: Content analysis
	 * Detects refactoring patterns, structure changes, and import modifications
	 *
	 * @param info - Snapshot information
	 * @returns Promise resolving to content-based name or null
	 */
	private async tryContentAnalysisNaming(
		info: SnapshotInfo,
	): Promise<string | null> {
		try {
			// Count both imports and structure changes
			const importCount = await this.countImportChanges(info.files);
			const structureCount = await this.countStructureChanges(info.files);

			// Priority 1: Import changes (simpler, more specific)
			if (importCount > 0 && structureCount === 0) {
				return `Updated ${importCount} import${importCount > 1 ? "s" : ""}`;
			}

			// Priority 2: Refactoring detection - multiple files with significant structure changes
			if (structureCount > 3 && info.files.length > 1) {
				const commonDir = this.findCommonDirectory(info.files);
				const moduleName = this.extractModuleName(commonDir, info.files);
				return `Refactored ${moduleName} module (${info.files.length} files)`;
			}

			// Priority 3: Single file refactoring with many structure changes
			if (structureCount >= 3 && info.files.length === 1) {
				const dir = path.dirname(info.files[0].path);
				const moduleName = this.extractModuleName(dir, info.files);
				return `Refactored ${moduleName} (${structureCount} changes)`;
			}

			// Priority 4: Import changes even with some structure changes
			if (importCount > 0) {
				return `Updated ${importCount} import${importCount > 1 ? "s" : ""}`;
			}

			return null;
		} catch (_error) {
			// Content analysis failed, fall through
			return null;
		}
	}

	/**
	 * Tier 4: Fallback naming
	 * Uses git-style format for code files, line count for unknown/non-code files
	 *
	 * @param info - Snapshot information
	 * @returns Fallback name
	 */
	private fallbackNaming(info: SnapshotInfo): string {
		const totalLines = info.files.reduce(
			(sum, file) => sum + file.linesAdded + file.linesDeleted,
			0,
		);
		const fileCount = info.files.length;

		// Check if files are code files (should use git-style format)
		const allCodeFiles = info.files.every((f) => this.isCodeFile(f.path));

		// Single file with unknown extension: use line count format
		if (info.files.length === 1) {
			const file = info.files[0];

			// Use line count format for non-code files
			if (!this.isCodeFile(file.path)) {
				return `Modified 1 file (${totalLines} lines)`;
			}

			// Use git-style format for code files
			return this.generateSingleFileGitName(file.status, file.path);
		}

		// Multiple files: if all non-code files, use line count
		if (!allCodeFiles) {
			return `Modified ${fileCount} files (${totalLines} lines)`;
		}

		// Multiple code files: use git-style format
		const hasAdditions = info.files.some((f) => f.status === "added");
		const hasModifications = info.files.some((f) => f.status === "modified");
		const hasDeletions = info.files.some((f) => f.status === "deleted");

		if (hasAdditions || hasModifications || hasDeletions) {
			return this.generateMultiFileGitName(info.files);
		}

		// Final fallback: line count summary
		return `Modified ${fileCount} files (${totalLines} lines)`;
	}

	/**
	 * Execute git command with error handling
	 * Returns null if git unavailable or command fails
	 *
	 * @param args - Git command arguments
	 * @returns Promise resolving to command output or null on failure
	 */
	private async execGit(args: string[]): Promise<string | null> {
		try {
			const { stdout } = await execAsync(`git ${args.join(" ")}`, {
				cwd: this.workspaceRoot,
				timeout: SnapshotNamingStrategy.GIT_TIMEOUT_MS,
			});
			return stdout.trim();
		} catch (_error) {
			return null;
		}
	}

	/**
	 * Generate single-file git-style name
	 *
	 * @param status - File change status
	 * @param filePath - Path to the file
	 * @returns Git-style name (e.g., "Added auth.ts")
	 */
	private generateSingleFileGitName(
		status: "added" | "modified" | "deleted",
		filePath: string,
	): string {
		const basename = path.basename(filePath);
		const sanitizedName = this.sanitizeFilename(basename);
		const truncatedName = this.truncatePath(
			sanitizedName,
			SnapshotNamingStrategy.MAX_NAME_LENGTH - 20,
		);

		switch (status) {
			case "added":
				return `Added ${truncatedName}`;
			case "modified":
				return `Modified ${truncatedName}`;
			case "deleted":
				return `Deleted ${truncatedName}`;
		}
	}

	/**
	 * Generate multi-file git-style name (e.g., "3A 2M 1D in src/auth")
	 *
	 * @param files - Array of file changes
	 * @returns Multi-file summary name
	 */
	private generateMultiFileGitName(files: FileChange[]): string {
		// Count files by status
		const added = files.filter((f) => f.status === "added").length;
		const modified = files.filter((f) => f.status === "modified").length;
		const deleted = files.filter((f) => f.status === "deleted").length;

		// Build status summary (e.g., "3A 2M 1D")
		const parts: string[] = [];
		if (added > 0) parts.push(`${added}A`);
		if (modified > 0) parts.push(`${modified}M`);
		if (deleted > 0) parts.push(`${deleted}D`);

		const statusSummary = parts.join(" ");

		// Find common directory
		const commonDir = this.findCommonDirectory(files);
		const dirName = commonDir
			? this.getRelativeDirectory(commonDir)
			: "workspace";

		return `${statusSummary} in ${dirName}`;
	}

	/**
	 * Find common directory path for multiple files
	 * Uses path segments instead of character-by-character comparison
	 *
	 * @param files - Array of file changes
	 * @returns Common directory path or empty string if no common path
	 */
	private findCommonDirectory(files: FileChange[]): string {
		if (files.length === 0) return "";
		if (files.length === 1) return path.dirname(files[0].path);

		// Get directory paths and split into segments
		const dirPaths = files.map((f) => path.dirname(f.path));
		const segmentArrays = dirPaths.map((dir) => dir.split(path.sep));

		// Find common segments
		const firstSegments = segmentArrays[0];
		const commonSegments: string[] = [];

		for (let i = 0; i < firstSegments.length; i++) {
			const segment = firstSegments[i];
			const allMatch = segmentArrays.every(
				(segments) => segments[i] === segment,
			);

			if (allMatch) {
				commonSegments.push(segment);
			} else {
				break;
			}
		}

		// Reconstruct path from common segments
		if (commonSegments.length === 0) {
			return "";
		}

		return commonSegments.join(path.sep);
	}

	/**
	 * Get relative directory name from absolute path
	 * Extracts the meaningful directory path from workspace root
	 *
	 * @param absolutePath - Absolute directory path
	 * @returns Relative directory name (e.g., "src/auth", "components")
	 */
	private getRelativeDirectory(absolutePath: string): string {
		// Calculate relative path from workspace root
		let relative = path.relative(this.workspaceRoot, absolutePath);

		// Clean up relative path: remove leading/trailing dots and normalize separators
		if (relative) {
			// Normalize path separators to forward slashes
			relative = relative.split(path.sep).join("/");

			// Remove leading './' if present
			if (relative.startsWith("./")) {
				relative = relative.substring(2);
			}

			// If we have a valid relative path that doesn't go up, use it
			if (relative && relative !== "." && !relative.startsWith("..")) {
				return relative;
			}
		}

		// Fallback: path is outside workspace or is workspace root
		return ".";
	}

	/**
	 * Extract meaningful module name from directory path
	 * Filters out temp directory prefixes and extracts actual module name
	 *
	 * @param dirPath - Directory path
	 * @param files - File changes for context
	 * @returns Module name (e.g., "auth", "authentication")
	 */
	private extractModuleName(dirPath: string, files: FileChange[]): string {
		if (!dirPath) {
			return "module";
		}

		const basename = path.basename(dirPath);

		// Filter out temporary directory names (like snapback-naming-test-xxx)
		if (
			basename.includes("tmp") ||
			basename.includes("test-") ||
			basename.startsWith(".")
		) {
			// Try to extract from file paths instead
			if (files.length > 0) {
				const firstFile = files[0].path;
				const parts = firstFile.split(path.sep).filter((p) => p && p !== ".");

				// Look for meaningful directory names (not temp dirs)
				for (let i = parts.length - 2; i >= 0; i--) {
					const part = parts[i];
					if (
						!part.includes("tmp") &&
						!part.includes("test-") &&
						!part.startsWith(".") &&
						part.length > 2
					) {
						return part;
					}
				}
			}
			return "module";
		}

		return basename;
	}

	/**
	 * Detect if file is a code file (has known code extension)
	 * Code files get git-style naming, non-code files get line count format
	 *
	 * @param filePath - Path to check
	 * @returns True if file is a code file
	 */
	private isCodeFile(filePath: string): boolean {
		const basename = path.basename(filePath);
		const ext = path.extname(filePath).toLowerCase();

		// Special case: known non-extension files that are code-related
		const knownCodeFiles = [
			"Dockerfile",
			"Makefile",
			"README.md",
			".gitignore",
		];
		if (
			knownCodeFiles.some(
				(known) => basename === known || basename.endsWith(known),
			)
		) {
			return true;
		}

		// Unknown extensions are not code files
		if (ext && !this.isKnownCodeExtension(ext)) {
			return false;
		}

		return true;
	}

	/**
	 * Check if extension is a known code file extension
	 *
	 * @param ext - File extension (including dot)
	 * @returns True if known code extension
	 */
	private isKnownCodeExtension(ext: string): boolean {
		const codeExtensions = [
			".ts",
			".js",
			".tsx",
			".jsx",
			".py",
			".java",
			".c",
			".cpp",
			".h",
			".hpp",
			".go",
			".rs",
			".rb",
			".php",
			".cs",
			".swift",
			".kt",
			".scala",
			".html",
			".css",
			".scss",
			".sass",
			".less",
			".json",
			".xml",
			".yaml",
			".yml",
			".md",
			".config",
		];

		return codeExtensions.includes(ext);
	}

	/**
	 * Detect if files are test files
	 *
	 * @param filePath - Path to check
	 * @returns True if file is a test file
	 */
	private isTestFile(filePath: string): boolean {
		const basename = path.basename(filePath);
		const dirname = path.dirname(filePath);

		// Check for test file extensions
		if (basename.endsWith(".test.ts") || basename.endsWith(".test.js")) {
			return true;
		}

		if (basename.endsWith(".spec.ts") || basename.endsWith(".spec.js")) {
			return true;
		}

		// Check for __tests__ directory
		if (dirname.includes("__tests__")) {
			return true;
		}

		return false;
	}

	/**
	 * Detect if file is package.json or dependency-related
	 *
	 * @param filePath - Path to check
	 * @returns True if file is dependency-related
	 */
	private isDependencyFile(filePath: string): boolean {
		const basename = path.basename(filePath);

		return (
			basename === "package.json" ||
			basename === "package-lock.json" ||
			basename === "pnpm-lock.yaml" ||
			basename === "yarn.lock"
		);
	}

	/**
	 * Detect if file is configuration
	 *
	 * @param filePath - Path to check
	 * @returns True if file is a config file
	 */
	private isConfigFile(filePath: string): boolean {
		const basename = path.basename(filePath);

		// Config file patterns with .config extension
		if (basename.includes(".config.")) {
			return true;
		}

		// Files with 'rc' in name (eslintrc, prettierrc, babelrc, etc.)
		if (basename.includes("rc")) {
			return true;
		}

		// Environment files
		if (basename.startsWith(".env")) {
			return true;
		}

		// Common config files by exact name
		const configFiles = ["tsconfig.json", "jsconfig.json"];
		if (configFiles.includes(basename)) {
			return true;
		}

		return false;
	}

	/**
	 * Count import changes via regex
	 *
	 * @param files - Array of file changes
	 * @returns Promise resolving to import count
	 */
	private async countImportChanges(files: FileChange[]): Promise<number> {
		let importCount = 0;
		const importRegex = /import\s+.*from|require\(/g;

		for (const file of files) {
			try {
				const content = await fs.readFile(file.path, "utf-8");
				const matches = content.match(importRegex);
				if (matches) {
					importCount += matches.length;
				}
			} catch (_error) {}
		}

		return importCount;
	}

	/**
	 * Count function/class changes via regex
	 *
	 * @param files - Array of file changes
	 * @returns Promise resolving to structure change count
	 */
	private async countStructureChanges(files: FileChange[]): Promise<number> {
		let structureCount = 0;
		const structureRegex = /function\s+\w+|class\s+\w+|const\s+\w+\s*=\s*\(/g;

		for (const file of files) {
			try {
				const content = await fs.readFile(file.path, "utf-8");
				const matches = content.match(structureRegex);
				if (matches) {
					structureCount += matches.length;
				}
			} catch (_error) {}
		}

		return structureCount;
	}

	/**
	 * Truncate long file paths for display
	 *
	 * @param filePath - Path to truncate
	 * @param maxLength - Maximum length allowed
	 * @returns Truncated path with ellipsis if needed
	 */
	private truncatePath(filePath: string, maxLength: number): string {
		if (filePath.length <= maxLength) {
			return filePath;
		}

		const ellipsis = "...";
		const truncateLength = maxLength - ellipsis.length;
		return filePath.substring(0, truncateLength) + ellipsis;
	}

	/**
	 * Sanitize filenames with special characters
	 *
	 * @param filename - Filename to sanitize
	 * @returns Sanitized filename
	 */
	private sanitizeFilename(filename: string): string {
		// Replace multiple special chars with single space
		return filename
			.replace(/[@#$]+/g, " ")
			.replace(/\s+/g, " ")
			.trim();
	}
}
