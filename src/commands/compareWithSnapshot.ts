/**
 * @fileoverview Compare With Snapshot Command
 *
 * This module implements the "Compare with Snapshot" feature that allows users
 * to compare the current file with its most recent snapshot directly from
 * the Explorer context menu and Command Palette.
 */

import * as vscode from "vscode";
import type { SnapshotStorage } from "../storage/types";
import { logger } from "../utils/logger.js";

type SnapshotDocumentProvider = {
	setSnapshotContent(filePath: string, content: string): void;
	clearContent(filePath: string): void;
};

/**
 * Compare the current file with its most recent snapshot
 *
 * @param storage - Snapshot storage adapter
 * @param provider - Snapshot document provider for virtual documents
 * @param uri - Optional URI of the file to compare (from context menu)
 */
export async function compareWithSnapshot(
	storage?: SnapshotStorage,
	provider?: SnapshotDocumentProvider,
	uri?: vscode.Uri,
): Promise<void> {
	try {
		// Get workspace root
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders || workspaceFolders.length === 0) {
			vscode.window.showErrorMessage("No workspace folder open");
			return;
		}
		// const _workspaceRoot = workspaceFolders[0].uri.fsPath;

		// Determine the file to compare
		let fileUri: vscode.Uri | undefined = uri;

		if (!fileUri) {
			// Try to get from active editor
			const editor = vscode.window.activeTextEditor;
			if (editor) {
				fileUri = editor.document.uri;
			}
		}

		if (!fileUri) {
			vscode.window.showErrorMessage("No file selected");
			return;
		}

		// Convert absolute path to relative path using cross-platform method
		const relativePath = vscode.workspace.asRelativePath(fileUri);

		// Get all snapshots
		const snapshots = await storage?.listSnapshots();
		if (!snapshots) {
			vscode.window.showErrorMessage("Storage not available");
			return;
		}

		// Filter snapshots that contain this file
		const fileSnapshots = snapshots
			.filter(
				(snapshot) =>
					snapshot.files && snapshot.files[relativePath] !== undefined,
			)
			.sort((a, b) => b.timestamp - a.timestamp);

		if (fileSnapshots.length === 0) {
			vscode.window.showErrorMessage("No snapshots found for this file");
			return;
		}

		// Get the most recent snapshot
		const latestSnapshot = fileSnapshots[0];

		// Get snapshot content - need to fetch full snapshot with content
		const snapshotFull = await storage?.getSnapshot(latestSnapshot.id);
		if (!snapshotFull) {
			vscode.window.showErrorMessage("Failed to retrieve snapshot content");
			return;
		}

		const snapshotContent = snapshotFull.contents?.[relativePath];

		// Register snapshot content with provider
		if (snapshotContent !== undefined) {
			provider?.setSnapshotContent(relativePath, snapshotContent);
		}

		// Create URIs for diff editor
		const snapshotUri = vscode.Uri.parse(`snapback-snapshot:${relativePath}`);
		const currentUri = fileUri;

		// Get file name for title
		const fileName = relativePath.split("/").pop() || relativePath;

		// Open side-by-side diff
		await vscode.commands.executeCommand(
			"vscode.diff",
			snapshotUri,
			currentUri,
			`Snapshot ← ${fileName} → Current`,
		);

		// Clean up snapshot content after use to prevent memory leaks
		// Use a more reliable cleanup mechanism instead of setTimeout
		const disposable = vscode.window.tabGroups.onDidChangeTabs((_event) => {
			// Check if the diff editor is still open
			const diffEditors = vscode.window.tabGroups.all
				.flatMap((group) => group.tabs)
				.filter((tab) => {
					if (tab.input instanceof vscode.TabInputTextDiff) {
						return tab.input.original.toString() === snapshotUri.toString();
					}
					return false;
				});

			// If no diff editors are open for this snapshot, clean up
			if (diffEditors.length === 0) {
				try {
					provider?.clearContent(relativePath);
					disposable.dispose(); // Clean up the listener
				} catch (_error) {
					// Ignore cleanup errors
				}
			}
		});
	} catch (error) {
		logger.error(
			"Failed to compare with snapshot:",
			error instanceof Error ? error : undefined,
		);
		vscode.window.showErrorMessage(
			`Failed to compare with snapshot: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
	}
}
