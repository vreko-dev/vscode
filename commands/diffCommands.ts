/**
 * Diff Commands - Native VS Code diff view for Vreko snapshots
 *
 * Provides commands for:
 * - Showing file diffs between snapshot and current version
 * - Viewing snapshot details with file list
 * - Deleting snapshots with confirmation
 */
import * as path from "node:path";
import * as vscode from "vscode";
import { createSnapshotUri } from "../constants/uriSchemes";
import type { IStorageManager } from "../storage/types";
import { logger } from "../utils/logger";

/**
 * Check if a file exists at the given URI
 */
async function fileExists(uri: vscode.Uri): Promise<boolean> {
	try {
		await vscode.workspace.fs.stat(uri);
		return true;
	} catch {
		return false;
	}
}

/**
 * Format a timestamp as relative time (e.g., "5m ago", "2h ago")
 */
function formatRelativeTime(timestamp: number): string {
	const diff = Date.now() - timestamp;
	const minutes = Math.floor(diff / 60000);
	const hours = Math.floor(diff / 3600000);
	const days = Math.floor(diff / 86400000);

	if (minutes < 1) {
		return "just now";
	}
	if (minutes < 60) {
		return `${minutes}m ago`;
	}
	if (hours < 24) {
		return `${hours}h ago`;
	}
	if (days === 1) {
		return "yesterday";
	}
	return `${days}d ago`;
}

/**
 * Resolve a file path to absolute, handling both relative and absolute paths
 * Supports multi-root workspaces and various path formats
 */
function resolveFilePath(filePath: string): string {
	// If already absolute, return as-is
	if (path.isAbsolute(filePath)) {
		return filePath;
	}

	// Resolve relative path against workspace root
	const workspaceFolders = vscode.workspace.workspaceFolders;
	if (!workspaceFolders || workspaceFolders.length === 0) {
		return filePath; // Can't resolve without workspace
	}

	// For multi-root workspaces, try to find the matching root
	// First, try the first workspace folder (most common case)
	const primaryWorkspace = workspaceFolders[0];
	const resolvedPath = path.join(primaryWorkspace.uri.fsPath, filePath);

	// Verify the file exists at this path, otherwise try other workspace roots
	if (fileExistsSync(resolvedPath)) {
		return resolvedPath;
	}

	// Try other workspace roots in multi-root setup
	for (const folder of workspaceFolders.slice(1)) {
		const altPath = path.join(folder.uri.fsPath, filePath);
		if (fileExistsSync(altPath)) {
			return altPath;
		}
	}

	// Return primary resolution even if file doesn't exist (will show as deleted)
	return resolvedPath;
}

/**
 * Synchronous file existence check (for path resolution)
 */
function fileExistsSync(filePath: string): boolean {
	try {
		// Use Node.js fs for sync check
		const fs = require("node:fs");
		return fs.existsSync(filePath);
	} catch {
		return false;
	}
}

/**
 * Show a diff view comparing a snapshot file with the current version
 *
 * @param snapshotId - ID of the snapshot containing the file
 * @param filePath - Path to the file (can be relative or absolute)
 * @param storageManager - Storage manager for retrieving snapshots
 */
export async function showSnapshotFileDiff(
	snapshotId: string,
	filePath: string,
	storageManager: IStorageManager,
): Promise<void> {
	try {
		// Get the snapshot manifest to verify it exists
		const manifest = await storageManager.getSnapshotManifest(snapshotId);
		if (!manifest) {
			vscode.window.showErrorMessage(`Snapshot not found: ${snapshotId}`);
			return;
		}

		// Check if file exists in snapshot (manifest may use relative or absolute paths)
		// Try both the provided path and just the basename as fallbacks
		let manifestFilePath = filePath;
		if (!manifest.files[filePath]) {
			// Try to find the file by checking all keys with improved matching
			const matchingKey = Object.keys(manifest.files).find((key) => {
				// Exact match
				if (key === filePath) {
					return true;
				}

				// Basename match (most common for relative vs absolute mismatch)
				if (path.basename(key) === path.basename(filePath)) {
					return true;
				}

				// Path suffix match (e.g., "src/file.ts" matches "project/src/file.ts")
				const normalizedKey = key.replace(/\\/g, "/");
				const normalizedFilePath = filePath.replace(/\\/g, "/");
				if (normalizedKey.endsWith(normalizedFilePath) || normalizedFilePath.endsWith(normalizedKey)) {
					return true;
				}

				// Handle Windows vs POSIX path differences
				if (key.replace(/\\/g, "/") === filePath.replace(/\\/g, "/")) {
					return true;
				}

				return false;
			});

			if (matchingKey) {
				manifestFilePath = matchingKey;
				logger.debug("[DiffCommand] Resolved file path", {
					input: filePath,
					resolved: matchingKey,
				});
			} else {
				// File not found - provide helpful error with available files
				const availableFiles = Object.keys(manifest.files).slice(0, 5);
				const moreFiles = Object.keys(manifest.files).length > 5 ? "..." : "";
				logger.warn("[DiffCommand] File not found in snapshot", {
					requested: filePath,
					available: Object.keys(manifest.files),
				});
				vscode.window.showErrorMessage(
					`File not found in snapshot: ${path.basename(filePath)}. ` +
						`Available files: ${availableFiles.join(", ")}${moreFiles}`,
				);
				return;
			}
		}

		// Resolve to absolute path for current file comparison
		const absoluteFilePath = resolveFilePath(manifestFilePath);

		// Create URIs for diff
		const leftUri = createSnapshotUri(snapshotId, manifestFilePath);
		const rightUri = vscode.Uri.file(absoluteFilePath);
		const currentExists = await fileExists(rightUri);

		// Build diff title
		const fileName = path.basename(manifestFilePath);
		const snapshotTime = formatRelativeTime(manifest.timestamp);
		const title = `${fileName} (${snapshotTime}) ↔ ${fileName} (${currentExists ? "Current" : "Deleted"})`;

		// Open diff view
		await vscode.commands.executeCommand(
			"vscode.diff",
			leftUri,
			currentExists ? rightUri : leftUri, // Show snapshot content on both sides if deleted
			title,
			{ preview: true },
		);

		// If file was deleted, offer to restore
		if (!currentExists) {
			const action = await vscode.window.showInformationMessage(
				`"${fileName}" was deleted. Restore from snapshot?`,
				"Restore",
				"Dismiss",
			);

			if (action === "Restore") {
				const snapshot = await storageManager.getSnapshot(snapshotId);
				if (snapshot?.contents[manifestFilePath]) {
					// Ensure parent directory exists
					await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(absoluteFilePath)));
					// Write file content
					await vscode.workspace.fs.writeFile(
						rightUri,
						Buffer.from(snapshot.contents[manifestFilePath], "utf-8"),
					);
					// Open the restored file
					await vscode.window.showTextDocument(rightUri);
					vscode.window.showInformationMessage(`Restored: ${fileName}`);
				}
			}
		}
	} catch (error) {
		logger.error("[DiffCommand] Failed to show diff", error as Error);
		vscode.window.showErrorMessage(`Failed to open diff: ${(error as Error).message}`);
	}
}

/**
 * Show details of a snapshot with a list of files to compare
 *
 * @param snapshotId - ID of the snapshot to view
 * @param storageManager - Storage manager for retrieving snapshots
 */
export async function showSnapshotDetails(snapshotId: string, storageManager: IStorageManager): Promise<void> {
	try {
		const snapshot = await storageManager.getSnapshot(snapshotId);
		if (!snapshot) {
			vscode.window.showErrorMessage(`Snapshot not found: ${snapshotId}`);
			return;
		}

		// Build list of files with status
		const items = await Promise.all(
			Object.keys(snapshot.files).map(async (filePath) => {
				const exists = await fileExists(vscode.Uri.file(filePath));
				return {
					label: `📄 ${path.basename(filePath)}`,
					description: path.dirname(filePath),
					detail: exists ? "Compare with current" : "⚠️ Deleted",
					filePath,
				};
			}),
		);

		// Show quick pick to select file
		const selected = await vscode.window.showQuickPick(items, {
			title: `📸 ${snapshot.name}`,
			placeHolder: `Select file to compare (${items.length} files)`,
		});

		if (selected) {
			await showSnapshotFileDiff(snapshotId, selected.filePath, storageManager);
		}
	} catch (error) {
		logger.error("[DiffCommand] Failed to show snapshot details", error as Error);
		vscode.window.showErrorMessage(`Failed to load snapshot: ${(error as Error).message}`);
	}
}

/**
 * Delete a snapshot with confirmation
 *
 * @param snapshotId - ID of the snapshot to delete
 * @param storageManager - Storage manager for snapshot operations
 * @param options - Optional callbacks
 * @returns true if deleted, false if cancelled or failed
 */
export async function deleteSnapshot(
	snapshotId: string,
	storageManager: IStorageManager,
	options?: { onDeleted?: () => void },
): Promise<boolean> {
	try {
		const manifest = await storageManager.getSnapshotManifest(snapshotId);
		if (!manifest) {
			vscode.window.showErrorMessage("Snapshot not found");
			return false;
		}

		// Confirm deletion
		const result = await vscode.window.showWarningMessage(
			`Delete "${manifest.name}"? This cannot be undone.`,
			{ modal: true },
			"Delete",
		);

		if (result !== "Delete") {
			return false;
		}

		// Delete the snapshot
		await storageManager.deleteSnapshot(snapshotId);
		vscode.window.showInformationMessage(`Deleted: ${manifest.name}`);
		options?.onDeleted?.();
		return true;
	} catch (error) {
		logger.error("[DiffCommand] Failed to delete snapshot", error as Error);
		vscode.window.showErrorMessage(`Failed to delete snapshot: ${(error as Error).message}`);
		return false;
	}
}

/**
 * Register diff commands
 *
 * @param storageManager - Storage manager for snapshot operations
 * @returns Array of disposables
 */
export function registerDiffCommands(storageManager: IStorageManager): vscode.Disposable[] {
	const disposables: vscode.Disposable[] = [];

	// Register showFileDiff command
	// Handle both direct arguments and tree item context menu invocations
	disposables.push(
		vscode.commands.registerCommand(
			"vreko.snapshot.showFileDiff",
			(snapshotIdOrItem: string | { data?: { id?: string; filePath?: string } }, filePathArg?: string) => {
				let snapshotId: string | undefined;
				let filePath: string | undefined;

				if (typeof snapshotIdOrItem === "string") {
					// Called with direct arguments: (snapshotId, filePath)
					snapshotId = snapshotIdOrItem;
					filePath = filePathArg;
				} else if (snapshotIdOrItem && typeof snapshotIdOrItem === "object" && snapshotIdOrItem.data) {
					// Called from context menu with tree item
					snapshotId = snapshotIdOrItem.data.id;
					filePath = snapshotIdOrItem.data.filePath;
				}

				if (!snapshotId || !filePath) {
					vscode.window.showErrorMessage("Missing snapshot ID or file path");
					return;
				}

				return showSnapshotFileDiff(snapshotId, filePath, storageManager);
			},
		),
	);

	// Note: vreko.viewSnapshot is already registered in viewCommands.ts
	// Note: vreko.deleteSnapshot is already registered in snapshotCommands.ts

	return disposables;
}
