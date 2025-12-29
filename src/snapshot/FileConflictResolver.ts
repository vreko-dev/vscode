/**
 * @deprecated This module has been extracted to @snapback-oss/sdk
 * Import directly from '@snapback-oss/sdk' instead:
 *
 * @example
 * ```typescript
 * import {
 *   FileConflictResolver,
 *   type ConflictResult,
 *   type IFileSearchProvider,
 *   type RestoreMetadata
 * } from '@snapback-oss/sdk';
 * ```
 *
 * This file re-exports from the SDK for backwards compatibility.
 */
export {
	type ConflictResult,
	FileConflictResolver,
	type FileConflictResolverOptions,
	type IFileSearchProvider,
	type RestoreMetadata,
} from "@snapback-oss/sdk";

// VSCode-specific file search provider implementation
import * as fs from "node:fs/promises";
import type { IFileSearchProvider } from "@snapback-oss/sdk";
import * as vscode from "vscode";

/**
 * VSCode implementation of IFileSearchProvider
 *
 * Uses VS Code workspace API for file discovery operations.
 */
export class VSCodeFileSearchProvider implements IFileSearchProvider {
	private readonly workspaceRootPath?: string;

	constructor(workspaceRoot?: string) {
		this.workspaceRootPath = workspaceRoot;
	}

	async findFiles(
		_workspaceRoot: string,
		extension: string,
		excludePattern?: string,
		maxResults?: number,
	): Promise<string[]> {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders || workspaceFolders.length === 0) {
			return [];
		}

		const root = this.workspaceRootPath || workspaceFolders[0].uri.fsPath;
		const pattern = new vscode.RelativePattern(root, `**/*${extension}`);
		const exclude = excludePattern || "**/node_modules/**";
		const files = await vscode.workspace.findFiles(pattern, exclude, maxResults || 100);

		return files.map((uri) => uri.fsPath);
	}

	async readFile(filePath: string): Promise<string> {
		return fs.readFile(filePath, "utf8");
	}
}
