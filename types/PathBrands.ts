/**
 * Branded Path Types for Type-Safe Path Handling
 *
 * Implements TypeScript branded types to distinguish between absolute and relative paths
 * at the type level, preventing common path-related bugs where absolute/relative paths
 * are used interchangeably.
 *
 * Uses ts-brand library + pathe for cross-platform normalization.
 *
 * Reference: https://dev.to/themuneebh/typescript-branded-types-in-depth-overview-and-use-cases-60e
 */

import * as pathe from "pathe";
import type { Brand } from "ts-brand";

/**
 * Branded type for absolute file paths
 * - Always starts with / on Unix, C:\ on Windows
 * - Must not contain .. or . relative traversal
 * - Normalized with pathe.resolve()
 */
export type AbsolutePath = Brand<string, "AbsolutePath">;

/**
 * Branded type for relative file paths
 * - Never starts with / or drive letter
 * - Can contain ../ or ./ for traversal
 * - Normalized with pathe.normalize()
 */
export type RelativePath = Brand<string, "RelativePath">;

/**
 * Branded type for workspace-relative paths
 * - Paths relative to the workspace root
 * - Used in snapshot storage and configuration
 */
export type WorkspaceRelativePath = Brand<string, "WorkspaceRelativePath">;

/**
 * Type guard to check if a path is absolute
 *
 * @param value - Path to check
 * @returns true if path is absolute
 *
 * @example
 * const path = "/Users/user/file.ts";
 * if (isAbsolutePath(path)) {
 *   const branded: AbsolutePath = path as AbsolutePath;
 * }
 */
export function isAbsolutePath(value: string): value is AbsolutePath {
	return pathe.isAbsolute(value);
}

/**
 * Type guard to check if a path is relative
 *
 * @param value - Path to check
 * @returns true if path is relative
 */
export function isRelativePath(value: string): value is RelativePath {
	return !pathe.isAbsolute(value);
}

/**
 * Creates a branded absolute path with validation and normalization
 *
 * @param value - Path to brand as absolute
 * @returns Branded absolute path
 * @throws Error if path is not absolute after normalization
 *
 * @example
 * const filePath = "/Users/user/src/auth.ts";
 * const branded = createAbsolutePath(filePath);
 */
export function createAbsolutePath(value: string): AbsolutePath {
	if (!value || typeof value !== "string") {
		throw new Error(`createAbsolutePath: invalid input "${value}"`);
	}

	// IMPORTANT: Check BEFORE normalization to prevent relative→absolute conversion
	// pathe.resolve() converts relative to absolute, so we must verify first
	if (!pathe.isAbsolute(value)) {
		throw new Error(`createAbsolutePath: path "${value}" is not absolute`);
	}

	// Now normalize the absolute path to handle different OS formats
	const normalized = pathe.resolve(value);

	return normalized as AbsolutePath;
}

/**
 * Creates a branded relative path with validation and normalization
 *
 * @param value - Path to brand as relative
 * @returns Branded relative path
 * @throws Error if path is absolute
 *
 * @example
 * const relPath = "src/auth.ts";
 * const branded = createRelativePath(relPath);
 */
export function createRelativePath(value: string): RelativePath {
	if (!value || typeof value !== "string") {
		throw new Error(`createRelativePath: invalid input "${value}"`);
	}

	// Reject absolute paths
	if (pathe.isAbsolute(value)) {
		throw new Error(`createRelativePath: path "${value}" is absolute, expected relative`);
	}

	// Normalize the relative path (removes redundant ../, ./, handles separators)
	const normalized = pathe.normalize(value);

	return normalized as RelativePath;
}

/**
 * Creates a workspace-relative path with validation
 *
 * @param value - Path relative to workspace root
 * @returns Branded workspace-relative path
 * @throws Error if path is absolute or invalid
 */
export function createWorkspaceRelativePath(value: string): WorkspaceRelativePath {
	if (!value || typeof value !== "string") {
		throw new Error(`createWorkspaceRelativePath: invalid input "${value}"`);
	}

	// Must not be absolute
	if (pathe.isAbsolute(value)) {
		throw new Error(`createWorkspaceRelativePath: path "${value}" must be relative`);
	}

	// Normalize
	const normalized = pathe.normalize(value);

	return normalized as WorkspaceRelativePath;
}

/**
 * Assertion function for absolute paths
 *
 * Use in code where you guarantee a path is absolute at runtime.
 * Throws if assertion fails, narrowing the type.
 *
 * @param value - Path to assert
 * @param message - Optional error message
 *
 * @example
 * const filePath: string = getFilePath();
 * assertAbsolutePath(filePath, "Expected absolute path from getFilePath()");
 * // filePath is now typed as AbsolutePath
 */
export function assertAbsolutePath(value: unknown, message?: string): asserts value is AbsolutePath {
	if (typeof value !== "string") {
		throw new Error(message || `assertAbsolutePath: expected string, got ${typeof value}`);
	}

	if (!pathe.isAbsolute(value)) {
		throw new Error(message || `assertAbsolutePath: path "${value}" is not absolute`);
	}
}

/**
 * Assertion function for relative paths
 *
 * @param value - Path to assert
 * @param message - Optional error message
 */
export function assertRelativePath(value: unknown, message?: string): asserts value is RelativePath {
	if (typeof value !== "string") {
		throw new Error(message || `assertRelativePath: expected string, got ${typeof value}`);
	}

	if (pathe.isAbsolute(value)) {
		throw new Error(message || `assertRelativePath: path "${value}" is absolute, expected relative`);
	}
}

/**
 * Converts absolute path to workspace-relative path
 *
 * @param absolutePath - Absolute path to convert
 * @param workspaceRoot - Workspace root absolute path
 * @returns Workspace-relative path
 * @throws Error if absolutePath is not within workspaceRoot
 *
 * @example
 * const absPath = "/Users/user/project/src/auth.ts" as AbsolutePath;
 * const wsRoot = "/Users/user/project" as AbsolutePath;
 * const relPath = absoluteToWorkspaceRelative(absPath, wsRoot);
 * // relPath = "src/auth.ts"
 */
export function absoluteToWorkspaceRelative(
	absolutePath: AbsolutePath,
	workspaceRoot: AbsolutePath,
): WorkspaceRelativePath {
	// Normalize both paths for consistent comparison
	const normalizedAbs = pathe.normalize(absolutePath);
	const normalizedRoot = pathe.normalize(workspaceRoot);

	// Check if absolutePath is within workspaceRoot
	if (!normalizedAbs.startsWith(normalizedRoot)) {
		throw new Error(
			`absoluteToWorkspaceRelative: path "${absolutePath}" is not within workspace root "${workspaceRoot}"`,
		);
	}

	// Compute relative path
	let relative = pathe.relative(normalizedRoot, normalizedAbs);

	// On Windows, pathe.relative might use backslashes; normalize to forward slashes
	relative = pathe.normalize(relative);

	return relative as WorkspaceRelativePath;
}

/**
 * Converts workspace-relative path to absolute path
 *
 * @param workspaceRelativePath - Path relative to workspace root
 * @param workspaceRoot - Workspace root absolute path
 * @returns Absolute path
 *
 * @example
 * const relPath = "src/auth.ts" as WorkspaceRelativePath;
 * const wsRoot = "/Users/user/project" as AbsolutePath;
 * const absPath = workspaceRelativeToAbsolute(relPath, wsRoot);
 * // absPath = "/Users/user/project/src/auth.ts"
 */
export function workspaceRelativeToAbsolute(
	workspaceRelativePath: WorkspaceRelativePath,
	workspaceRoot: AbsolutePath,
): AbsolutePath {
	// Join workspace root with relative path
	const joined = pathe.join(workspaceRoot, workspaceRelativePath);

	// Resolve to absolute
	const resolved = pathe.resolve(joined);

	return resolved as AbsolutePath;
}

/**
 * Safely gets the parent directory of an absolute path
 *
 * @param path - Absolute path
 * @returns Parent directory as absolute path, or the same path if already root
 */
export function getParentDirectory(path: AbsolutePath): AbsolutePath {
	const parent = pathe.dirname(path);
	return parent as AbsolutePath;
}

/**
 * Gets the filename from an absolute path
 *
 * @param path - Absolute path
 * @returns Filename with extension
 */
export function getFileName(path: AbsolutePath): string {
	return pathe.basename(path);
}

/**
 * Gets the file extension from an absolute path
 *
 * @param path - Absolute path
 * @returns File extension (including dot), empty string if no extension
 */
export function getFileExtension(path: AbsolutePath): string {
	return pathe.extname(path);
}
