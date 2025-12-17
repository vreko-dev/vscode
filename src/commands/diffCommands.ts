/**
 * Diff Commands - Native VS Code diff view for SnapBack snapshots
 *
 * Provides commands for:
 * - Showing file diffs between snapshot and current version
 * - Viewing snapshot details with file list
 * - Deleting snapshots with confirmation
 */
import * as path from "node:path";
import * as vscode from "vscode";
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

	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes}m ago`;
	if (hours < 24) return `${hours}h ago`;
	if (days === 1) return "yesterday";
	return `${days}d ago`;
}

/**
 * Create a snapback:// URI for a file in a snapshot
 *
 * URI format: snapback://<snapshotId>/<encodedFilePath>
 */
function createSnapshotUri(snapshotId: string, filePath: string): vscode.Uri {
	// Encode path components to handle special characters
	const encodedPath = filePath
		.split("/")
		.map((s) => encodeURIComponent(s))
		.join("/");
	return vscode.Uri.parse(`snapback://${snapshotId}/${encodedPath}`);
}

/**
 * Resolve a file path to absolute, handling both relative and absolute paths
 */
function resolveFilePath(filePath: string): string {
	// If already absolute, return as-is
	if (path.isAbsolute(filePath)) {
		return filePath;
	}

	// Resolve relative path against workspace root
	const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
	if (!workspaceFolder) {
		return filePath; // Can't resolve without workspace
	}

	return path.join(workspaceFolder.uri.fsPath, filePath);
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
			// Try to find the file by checking all keys
			const matchingKey = Object.keys(manifest.files).find(
				(key) =>
					key === filePath ||
					path.basename(key) === path.basename(filePath) ||
					key.endsWith(filePath) ||
					filePath.endsWith(key),
			);
			if (matchingKey) {
				manifestFilePath = matchingKey;
			} else {
				vscode.window.showErrorMessage(`File not found in snapshot: ${path.basename(filePath)}`);
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
					label: `$(file) ${path.basename(filePath)}`,
					description: path.dirname(filePath),
					detail: exists ? "Compare with current" : "$(warning) Deleted",
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
			"snapback.snapshot.showFileDiff",
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

	// Note: snapback.viewSnapshot is already registered in viewCommands.ts
	// Note: snapback.deleteSnapshot is already registered in snapshotCommands.ts

	return disposables;
}
