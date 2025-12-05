import type { Stats } from "node:fs";
import { promises as fs } from "node:fs";
import * as path from "node:path";

/**
 * Error codes for file system operations
 */
enum FileSystemErrorCode {
	NOT_FOUND = "ENOENT",
	ACCESS_DENIED = "EACCES",
}

/**
 * URL-encoded patterns used in path traversal attacks
 */
const ENCODED_TRAVERSAL_PATTERNS: readonly string[] = [
	"%2e%2e%2f", // ../
	"%2e%2e/", // ../
	"..%2f", // ../
	"%252e", // Double-encoded .
	"%252f", // Double-encoded /
	"%2e%2e%5c", // ..\ (Windows)
	"..%5c", // ..\ (Windows)
] as const;

/**
 * Regular expression for Windows drive letter detection (e.g., C:, D:)
 */
const WINDOWS_DRIVE_LETTER_REGEX = /^[a-zA-Z]:/;

/**
 * Regular expression for Windows drive letter with backslash (e.g., C:\)
 */
const WINDOWS_DRIVE_WITH_BACKSLASH_REGEX = /^[a-zA-Z]:\\/;

/**
 * Null byte character used in path injection attacks
 */
const NULL_BYTE = "\0";

/**
 * Windows UNC path prefix (e.g., \\server\share)
 */
const WINDOWS_UNC_PREFIX = "\\\\";

/**
 * Interface for file system error objects
 */
interface FileSystemError extends Error {
	code?: string;
}

/**
 * PathValidator provides security validation for file paths to prevent path traversal attacks.
 *
 * This class ensures that all file operations remain within the designated workspace boundary
 * by validating paths against common attack vectors including:
 * - Directory traversal (../)
 * - Absolute paths outside workspace
 * - Encoded path traversal attempts (URL-encoded, double-encoded)
 * - Symbolic link attacks
 * - Null byte injection
 * - Platform-specific attacks (Windows UNC paths, alternate data streams, etc.)
 *
 * @example
 * ```typescript
 * const validator = new PathValidator('/workspace/root');
 *
 * // Valid path within workspace
 * await validator.isPathSafe('/workspace/root/file.txt'); // true
 *
 * // Attack attempt - path traversal
 * await validator.isPathSafe('/workspace/root/../../../etc/passwd'); // false
 *
 * // Attack attempt - absolute path outside workspace
 * await validator.isPathSafe('/etc/passwd'); // false
 * ```
 */
export class PathValidator {
	private readonly workspaceRoot: string;

	/**
	 * Creates a new PathValidator instance.
	 *
	 * @param workspaceRoot - The absolute path to the workspace root directory
	 * @throws {Error} If workspaceRoot is empty, whitespace-only, or does not exist
	 * @throws {Error} If workspaceRoot exists but is not a directory
	 *
	 * @example
	 * ```typescript
	 * // Valid usage
	 * const validator = new PathValidator('/valid/workspace/path');
	 *
	 * // Throws: workspace root cannot be empty
	 * const validator = new PathValidator('');
	 *
	 * // Throws: workspace root does not exist
	 * const validator = new PathValidator('/non/existent/path');
	 * ```
	 */
	constructor(workspaceRoot: string) {
		this.validateWorkspaceRoot(workspaceRoot);
		this.workspaceRoot = path.resolve(workspaceRoot);
	}

	/**
	 * Validates the workspace root parameter.
	 *
	 * @param workspaceRoot - The workspace root to validate
	 * @throws {Error} If validation fails
	 */
	private validateWorkspaceRoot(workspaceRoot: string): void {
		if (!workspaceRoot || workspaceRoot.trim().length === 0) {
			throw new Error("Workspace root cannot be empty");
		}

		// Synchronously check if workspace root exists and is a directory
		try {
			const stats = require("node:fs").statSync(workspaceRoot);
			if (!stats.isDirectory()) {
				throw new Error("Workspace root must be a directory");
			}
		} catch (error) {
			const fsError = error as FileSystemError;
			if (fsError.code === FileSystemErrorCode.NOT_FOUND) {
				throw new Error(`Workspace root does not exist: ${workspaceRoot}`);
			}
			throw error;
		}
	}

	/**
	 * Validates whether a target path is safe to access.
	 *
	 * A path is considered safe if:
	 * 1. It resolves to a location within the workspace boundary
	 * 2. The file exists at that location
	 * 3. It does not contain malicious patterns (null bytes, encoded traversal, etc.)
	 * 4. If it's a symlink, the target also resolves within the workspace
	 *
	 * @param targetPath - The path to validate (can be relative or absolute)
	 * @returns Promise resolving to `true` if path is safe, `false` otherwise
	 *
	 * @example
	 * ```typescript
	 * const validator = new PathValidator('/workspace');
	 *
	 * // Safe path
	 * await validator.isPathSafe('/workspace/file.txt'); // true
	 *
	 * // Unsafe - traversal attack
	 * await validator.isPathSafe('/workspace/../etc/passwd'); // false
	 *
	 * // Unsafe - encoded traversal
	 * await validator.isPathSafe('/workspace/..%2Fetc%2Fpasswd'); // false
	 *
	 * // Unsafe - non-existent file
	 * await validator.isPathSafe('/workspace/missing.txt'); // false
	 * ```
	 */
	async isPathSafe(targetPath: string): Promise<boolean> {
		try {
			// Perform early validation checks
			if (!this.isValidPathString(targetPath)) {
				return false;
			}

			// Check for encoding-based attacks
			if (this.containsEncodedTraversal(targetPath)) {
				return false;
			}

			// Check for platform-specific attacks
			if (
				process.platform === "win32" &&
				this.containsWindowsAttackVectors(targetPath)
			) {
				return false;
			}

			// Resolve and validate path location
			const resolvedPath = path.resolve(targetPath);
			if (!this.isWithinWorkspace(resolvedPath)) {
				return false;
			}

			// Verify file existence and handle symlinks
			return await this.validateFileAccess(resolvedPath);
		} catch (_error) {
			// Fail-safe: reject path on any unexpected error
			return false;
		}
	}

	/**
	 * Validates that a path string is non-empty and doesn't contain null bytes.
	 *
	 * @param targetPath - The path to validate
	 * @returns `true` if the path string is valid, `false` otherwise
	 */
	private isValidPathString(targetPath: string): boolean {
		// Reject empty or whitespace-only paths
		if (!targetPath || targetPath.trim().length === 0) {
			return false;
		}

		// Check for null byte injection
		if (targetPath.includes(NULL_BYTE)) {
			return false;
		}

		return true;
	}

	/**
	 * Validates file access and handles symbolic links.
	 *
	 * @param resolvedPath - The absolute path to validate
	 * @returns Promise resolving to `true` if file is accessible and safe, `false` otherwise
	 */
	private async validateFileAccess(resolvedPath: string): Promise<boolean> {
		try {
			const stats: Stats = await fs.stat(resolvedPath);

			// Reject directories (we only validate files)
			if (stats.isDirectory()) {
				return false;
			}

			// If it's a symbolic link, verify the real path is also within workspace
			if (stats.isSymbolicLink()) {
				const realPath = await fs.realpath(resolvedPath);
				return this.isWithinWorkspace(realPath);
			}

			return true;
		} catch (error) {
			const fsError = error as FileSystemError;
			// File doesn't exist or can't be accessed
			if (
				fsError.code === FileSystemErrorCode.NOT_FOUND ||
				fsError.code === FileSystemErrorCode.ACCESS_DENIED
			) {
				return false;
			}
			throw error;
		}
	}

	/**
	 * Checks if a resolved path is within the workspace boundary.
	 *
	 * This method prevents false positives where a path might start with the workspace
	 * root string but is actually a different directory (e.g., /app/workspace vs /app/workspace-other).
	 *
	 * @param resolvedPath - The absolute path to check
	 * @returns `true` if path is within workspace, `false` otherwise
	 */
	private isWithinWorkspace(resolvedPath: string): boolean {
		const normalizedWorkspace = path.normalize(this.workspaceRoot);
		const normalizedPath = path.normalize(resolvedPath);

		// Exact match with workspace root
		if (normalizedPath === normalizedWorkspace) {
			return true;
		}

		// Check if path starts with workspace root + separator
		// This prevents false positives like workspace=/app/data matching path=/app/data-backup
		const workspaceWithSep = normalizedWorkspace.endsWith(path.sep)
			? normalizedWorkspace
			: normalizedWorkspace + path.sep;

		return normalizedPath.startsWith(workspaceWithSep);
	}

	/**
	 * Detects URL-encoded path traversal attempts.
	 *
	 * Checks for both single and double-encoded traversal patterns including:
	 * - %2e%2e%2f (../)
	 * - %252e (double-encoded .)
	 * - %2e%2e%5c (..\)
	 *
	 * @param targetPath - The path to check
	 * @returns `true` if encoded traversal detected, `false` otherwise
	 */
	private containsEncodedTraversal(targetPath: string): boolean {
		const lowerPath = targetPath.toLowerCase();
		return ENCODED_TRAVERSAL_PATTERNS.some((pattern) =>
			lowerPath.includes(pattern),
		);
	}

	/**
	 * Detects Windows-specific attack vectors.
	 *
	 * Checks for:
	 * - UNC paths (\\server\share)
	 * - Absolute drive letter paths outside workspace (C:\Windows\...)
	 * - Alternate data streams (file.txt:hidden)
	 *
	 * @param targetPath - The path to check
	 * @returns `true` if Windows attack vector detected, `false` otherwise
	 */
	private containsWindowsAttackVectors(targetPath: string): boolean {
		// Check for UNC paths (\\server\share)
		if (targetPath.startsWith(WINDOWS_UNC_PREFIX)) {
			return true;
		}

		// Check for absolute Windows paths with drive letters outside workspace
		if (WINDOWS_DRIVE_LETTER_REGEX.test(targetPath)) {
			const resolvedPath = path.resolve(targetPath);
			if (!this.isWithinWorkspace(resolvedPath)) {
				return true;
			}
		}

		// Check for alternate data streams (file.txt:stream)
		return this.containsAlternateDataStream(targetPath);
	}

	/**
	 * Detects Windows alternate data streams in file paths.
	 *
	 * Allows legitimate drive letter colons (C:) but rejects stream syntax (file.txt:stream).
	 *
	 * @param targetPath - The path to check
	 * @returns `true` if alternate data stream detected, `false` otherwise
	 */
	private containsAlternateDataStream(targetPath: string): boolean {
		// Skip check if no colon present
		if (!targetPath.includes(":")) {
			return false;
		}

		// Allow valid drive letter format (e.g., C:\)
		if (WINDOWS_DRIVE_WITH_BACKSLASH_REGEX.test(targetPath)) {
			// Check if there are additional colons after the drive letter
			const afterDrive = targetPath.substring(3);
			return afterDrive.includes(":");
		}

		// Reject any other colon usage (likely alternate data stream)
		const colonIndex = targetPath.indexOf(":");
		return colonIndex > 1 || (colonIndex === 1 && targetPath.length > 3);
	}
}
