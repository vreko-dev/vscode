/**
 * @fileoverview Snapshot Selector - UI component for selecting snapshots
 *
 * This module provides a reusable snapshot selection interface that can be
 * used throughout the SnapBack extension for various operations that require
 * snapshot selection.
 */

import * as vscode from "vscode";
import type { OperationCoordinator } from "./operationCoordinator.js";

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

				// Format snapshots for quick pick
				const snapshotItems: SnapshotItem[] = snapshots
					.sort((a, b) => b.timestamp - a.timestamp) // Sort by timestamp, newest first
					.map((snapshot) => ({
						label: snapshot.name,
						description: formatTimeAgo(snapshot.timestamp),
						detail: `Snapshot ID: ${snapshot.id}`,
						id: snapshot.id,
						timestamp: snapshot.timestamp,
					}));

				// Show snapshot selection UI
				return await vscode.window.showQuickPick(snapshotItems, {
					placeHolder: placeholder,
					matchOnDetail: true,
					matchOnDescription: true,
				});
			} catch (error) {
				vscode.window.showErrorMessage(
					`Failed to load snapshots: ${
						error instanceof Error ? error.message : String(error)
					}`,
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
export async function showFileSelection(
	files: string[],
): Promise<string[] | undefined> {
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

/**
 * Formats a timestamp into a human-readable "time ago" string
 * @param timestamp The timestamp to format
 * @returns Formatted time ago string
 */
function formatTimeAgo(timestamp: number): string {
	const now = Date.now();
	const diffMs = now - timestamp;
	const diffSec = Math.floor(diffMs / 1000);
	const diffMin = Math.floor(diffSec / 60);
	const diffHours = Math.floor(diffMin / 60);
	const diffDays = Math.floor(diffHours / 24);

	if (diffSec < 60) {
		return `${diffSec} seconds ago`;
	}
	if (diffMin < 60) {
		return `${diffMin} minutes ago`;
	}
	if (diffHours < 24) {
		return `${diffHours} hours ago`;
	}
	return `${diffDays} days ago`;
}

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
export async function confirmRestoration(
	_snapshotName: string,
	_fileCount?: number,
): Promise<boolean> {
	// In MVP, restoration confirmation is handled via inline UI elements
	// This function is a placeholder that will be replaced with inline implementation
	throw new Error(
		"Restoration confirmation modal replaced with inline UI in MVP",
	);
}
