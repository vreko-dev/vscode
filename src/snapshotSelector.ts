/**
 * @fileoverview Snapshot Selector - UI component for selecting snapshots
 *
 * This module provides a reusable snapshot selection interface that can be
 * used throughout the SnapBack extension for various operations that require
 * snapshot selection.
 */

import * as path from "node:path";
import * as vscode from "vscode";
import type { OperationCoordinator } from "./operationCoordinator";
import { formatRelativeTime } from "./ui/snapshot-display/formatting";

/**
 * Represents a snapshot item in the selection UI
 */
export interface SnapshotItem extends vscode.QuickPickItem {
	id: string;
	timestamp: number;
}

/**
 * Shows a snapshot selection UI and returns the selected snapshot
 * @param coordinator The operation coordinator to use for listing snapshots
 * @param placeholder Optional placeholder text for the selection UI
 * @returns Promise resolving to the selected snapshot item, or undefined if cancelled
 */
export async function showSnapshotSelection(
	coordinator: OperationCoordinator,
	placeholder = "Select a snapshot",
): Promise<SnapshotItem | undefined> {
	// Show progress indicator while loading snapshots
	return vscode.window.withProgress(
		{
			location: vscode.ProgressLocation.Window,
			title: "Loading snapshots...",
			cancellable: false,
		},
		async () => {
			try {
				// Get list of available snapshots
				const snapshots = await coordinator.listSnapshots();

				// Format snapshots for quick pick using shared formatting utilities
				const snapshotItems: SnapshotItem[] = snapshots
					.sort((a, b) => b.timestamp - a.timestamp) // Sort by timestamp, newest first
					.map((snapshot) => {
						// Use anchor file for display, with (+N) if multiple files
						const icon = "📸"; // Default icon for selector
						const fileName = snapshot.anchorFile ? path.basename(snapshot.anchorFile) : snapshot.name;
						const fileDisplay =
							snapshot.fileCount > 1 ? `${fileName} (+${snapshot.fileCount - 1})` : fileName;
						return {
							label: `${icon}  ${fileDisplay}`,
							description: formatRelativeTime(snapshot.timestamp),
							detail: snapshot.fileCount > 1 ? `${snapshot.fileCount} files` : undefined,
							id: snapshot.id,
							timestamp: snapshot.timestamp,
						};
					});

				// Show snapshot selection UI
				return await vscode.window.showQuickPick(snapshotItems, {
					placeHolder: placeholder,
					matchOnDetail: true,
					matchOnDescription: true,
				});
			} catch (error) {
				vscode.window.showErrorMessage(
					`Failed to load snapshots: ${error instanceof Error ? error.message : String(error)}`,
				);
				return undefined;
			}
		},
	);
}

/**
 * Shows a file selection UI for selective restoration
 * @param files Array of file paths to select from
 * @returns Promise resolving to array of selected file paths, or undefined if cancelled
 */
export async function showFileSelection(files: string[]): Promise<string[] | undefined> {
	// Format files for quick pick with checkboxes
	const fileItems = files.map((file) => ({
		label: file,
		picked: true, // Default to selecting all files
	}));

	// Show file selection UI
	const selectedItems = await vscode.window.showQuickPick(fileItems, {
		placeHolder: "Select files to restore (uncheck files you want to keep)",
		canPickMany: true,
		matchOnDetail: true,
	});

	if (!selectedItems) {
		return undefined;
	}

	// Extract the file paths from the selected items
	return selectedItems.map((item) => item.label);
}

// formatTimeAgo moved to ui/snapshot-display/formatting.ts as formatRelativeTime

/**
 * Shows a confirmation dialog for snapshot restoration
 * @param snapshotName The name of the snapshot to restore
 * @param fileCount Optional number of files to restore
 * @returns Promise resolving to true if confirmed, false otherwise
 */
/**
 * Confirm snapshot restoration - MVP MODAL REPLACEMENT
 *
 * MVP Note: This modal has been commented out for MVP and will be replaced with
 * inline CodeLens + status-bar toast UI instead of full-screen modals.
 *
 * For context: Modal dialogs create interruption cost for users. The MVP approach
 * uses inline banners with "Allow once · Mark wrong · Details" chips that store
 * rationale without flow break.
 */
/*
export async function confirmRestoration(
	snapshotName: string,
	fileCount?: number,
): Promise<boolean> {
	const message = fileCount
		? `Restore ${fileCount} files from snapshot "${snapshotName}"?`
		: `Restore workspace to snapshot "${snapshotName}"?`;

	const result = await vscode.window.showWarningMessage(
		message,
		{ modal: true },
		"Cancel",
		"SnapBack",
	);

	return result === "SnapBack";
}
*/

// MVP implementation uses inline CodeLens + status-bar toast instead of modals
export async function confirmRestoration(_snapshotName: string, _fileCount?: number): Promise<boolean> {
	// In MVP, restoration confirmation is handled via inline UI elements
	// This function is a placeholder that will be replaced with inline implementation
	throw new Error("Restoration confirmation modal replaced with inline UI in MVP");
}
