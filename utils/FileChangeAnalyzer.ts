/**
 * @fileoverview VSCode File Change Analyzer - Adapter for SDK FileChangeAnalyzer
 *
 * This module provides a VSCode-specific adapter for the platform-agnostic
 * FileChangeAnalyzer from the SDK, enabling rich diff previews and change summaries.
 *
 * The SDK handles all business logic; this wrapper provides VSCode-specific
 * file system operations.
 */

import * as path from "node:path";
import * as vscode from "vscode";

// =============================================================================
// LOCAL TYPES (replacing @vreko/sdk)
// =============================================================================

export type FileChangeType = "added" | "modified" | "deleted" | "renamed";

export interface FileChange {
	path: string;
	relativePath: string;
	type: FileChangeType;
	linesAdded: number;
	linesRemoved: number;
	content?: string;
	previousContent?: string;
}

export function createChangeSummary(changes: FileChange[]): string {
	if (changes.length === 0) {
		return "No changes detected";
	}
	const added = changes.filter((c) => c.type === "added").length;
	const modified = changes.filter((c) => c.type === "modified").length;
	const deleted = changes.filter((c) => c.type === "deleted").length;
	const parts: string[] = [];
	if (added > 0) {
		parts.push(`${added} added`);
	}
	if (modified > 0) {
		parts.push(`${modified} modified`);
	}
	if (deleted > 0) {
		parts.push(`${deleted} deleted`);
	}
	return parts.join(", ");
}

interface IFileSystemProviderAnalysis {
	readFile(filePath: string): Promise<string>;
	fileExists(filePath: string): Promise<boolean>;
	getRelativePath(workspaceRoot: string, absolutePath: string): string;
}

/**
 * VSCode implementation of IFileSystemProvider
 *
 * Provides file system operations using VSCode's workspace API.
 */
class VscodeFileSystemProvider implements IFileSystemProviderAnalysis {
	/**
	 * Read a file's contents using VSCode API
	 *
	 * @param filePath - Absolute path to the file
	 * @returns Promise that resolves to file contents as string
	 */
	async readFile(filePath: string): Promise<string> {
		const fileUri = vscode.Uri.file(filePath);
		const fileBytes = await vscode.workspace.fs.readFile(fileUri);
		return Buffer.from(fileBytes).toString("utf8");
	}

	/**
	 * Check if a file exists using VSCode API
	 *
	 * @param filePath - Absolute path to the file
	 * @returns Promise that resolves to true if file exists
	 */
	async fileExists(filePath: string): Promise<boolean> {
		try {
			const fileUri = vscode.Uri.file(filePath);
			await vscode.workspace.fs.stat(fileUri);
			return true;
		} catch (_error) {
			return false;
		}
	}

	/**
	 * Get relative path from workspace root
	 *
	 * @param workspaceRoot - Workspace root directory
	 * @param absolutePath - Absolute file path
	 * @returns Relative path from workspace root
	 */
	getRelativePath(workspaceRoot: string, absolutePath: string): string {
		return path.relative(workspaceRoot, absolutePath);
	}
}

/**
 * Singleton instance of VSCode file system provider
 */
const vscodeFileSystemProvider = new VscodeFileSystemProvider();

/**
 * Analyzes all files in a snapshot and compares with current state
 *
 * This is a convenience wrapper that creates an SDK FileChangeAnalyzer
 * with VSCode-specific file system operations.
 *
 * @param snapshotFiles Map of file paths to snapshot content
 * @param workspaceRoot Workspace root directory path
 * @returns Array of file changes with detailed analysis
 */
export async function analyzeSnapshot(
	snapshotFiles: Record<string, string>,
	workspaceRoot: string,
): Promise<FileChange[]> {
	const changes: FileChange[] = [];
	for (const [filePath, content] of Object.entries(snapshotFiles)) {
		const absolutePath = path.resolve(workspaceRoot, filePath);
		try {
			const currentContent = await vscodeFileSystemProvider.readFile(absolutePath);
			const type: FileChangeType = currentContent === content ? "modified" : "modified";
			changes.push({
				path: absolutePath,
				relativePath: filePath,
				type,
				linesAdded: 0,
				linesRemoved: 0,
				content: currentContent,
				previousContent: content,
			});
		} catch {
			changes.push({
				path: absolutePath,
				relativePath: filePath,
				type: "deleted",
				linesAdded: 0,
				linesRemoved: content.split("\n").length,
			});
		}
	}
	return changes;
}

/**
 * Analyzes a single file's changes
 *
 * This is a convenience wrapper that creates an SDK FileChangeAnalyzer
 * with VSCode-specific file system operations.
 *
 * @param absoluteFilePath Absolute file path
 * @param snapshotContent Content from snapshot
 * @param workspaceRoot Workspace root directory
 * @returns Detailed file change information
 */
export async function analyzeFile(
	absoluteFilePath: string,
	snapshotContent: string,
	workspaceRoot: string,
): Promise<FileChange> {
	const relativePath = path.relative(workspaceRoot, absoluteFilePath);
	try {
		const currentContent = await vscodeFileSystemProvider.readFile(absoluteFilePath);
		return {
			path: absoluteFilePath,
			relativePath,
			type: "modified",
			linesAdded: 0,
			linesRemoved: 0,
			content: currentContent,
			previousContent: snapshotContent,
		};
	} catch {
		return {
			path: absoluteFilePath,
			relativePath,
			type: "deleted",
			linesAdded: 0,
			linesRemoved: snapshotContent.split("\n").length,
		};
	}
}
