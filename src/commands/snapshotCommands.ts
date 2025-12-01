/**
 * Snapshot Command Handlers - VS Code command implementations for snapshot management
 *
 * This module provides command handlers for the snapshot intelligence system,
 * integrating SnapshotManager with VS Code's command palette and context menus.
 *
 * Commands:
 * - snapback.deleteSnapshot: Delete a single snapshot with confirmation
 * - snapback.deleteOlderSnapshots: Bulk delete old snapshots
 * - snapback.unprotectAndDeleteSnapshot: Unprotect then delete a protected snapshot
 * - snapback.renameSnapshot: Rename a snapshot
 * - snapback.protectSnapshot: Protect a snapshot from deletion
 *
 * @module commands/snapshotCommands
 */

import { logger } from "@snapback/infrastructure";
import * as vscode from "vscode";
import type { SnapshotManager } from "../snapshot/SnapshotManager.js";
import { getSnapshotLabel } from "../utils/snapshotLabeling.js";

/**
 * Snapshot tree item interface (matches the tree view item structure)
 */
interface SnapshotTreeItem {
	id: string;
	label: string;
	isProtected?: boolean;
}

/**
 * Register all snapshot management commands.
 *
 * Provides command handlers for snapshot CRUD operations including creation, deletion,
 * restoration, renaming, and protection management. All operations integrate with
 * the SnapshotManager for business logic and refresh UI views on completion.
 *
 * @param context - VS Code extension context for managing extension lifecycle
 * @param snapshotManager - SnapshotManager instance for all snapshot operations
 * @param refreshViews - Callback function to refresh tree views after operations
 *
 * @returns Array of disposables for all registered commands
 *
 * @throws Registration errors if VS Code API is unavailable
 *
 * @example
 * ```typescript
 * const disposables = registerSnapshotCommands(context, snapshotManager, refreshViews);
 * // disposables are pushed to context.subscriptions for automatic cleanup
 * ```
 *
 * @see {@link SnapshotManager} for snapshot operations
 * @see {@link SnapshotTreeItem} for tree view item structure
 */
export function registerSnapshotCommands(
	_context: vscode.ExtensionContext,
	snapshotManager: SnapshotManager,
	refreshViews: () => void,
): vscode.Disposable[] {
	const disposables: vscode.Disposable[] = [];

	/**
	 * Command: Delete Snapshot
	 *
	 * Deletes a single snapshot from storage with error handling.
	 * Protected snapshots cannot be deleted without explicitly unprotecting first.
	 *
	 * @command snapback.deleteSnapshot
	 *
	 * @param item - Optional SnapshotTreeItem containing snapshot ID (from tree view context)
	 *   - id: Unique identifier of snapshot to delete
	 *   - label: Display name for UI feedback
	 *
	 * @throws Shows error message if:
	 * - No snapshot is selected
	 * - Snapshot is protected and unprotectFirst is not set
	 * - Database deletion fails
	 * - Snapshot file cannot be removed
	 *
	 * @example
	 * ```typescript
	 * // Invoked from tree view context menu
	 * // User right-clicks on snapshot and selects "Delete Snapshot"
	 * ```
	 *
	 * @see {@link SnapshotManager.deleteSnapshot} for implementation
	 */
	disposables.push(
		vscode.commands.registerCommand(
			"snapback.deleteSnapshot",
			async (item?: SnapshotTreeItem) => {
				try {
					if (!item || !item.id) {
						vscode.window.showErrorMessage("No snapshot selected");
						return;
					}

					// Delete with confirmation (handled by SnapshotManager)
					const result = await snapshotManager.deleteSnapshot(item.id);

					if (result.success) {
						vscode.window.showInformationMessage(
							`Snapshot "${item.label}" deleted successfully`,
						);
						refreshViews();
					}
				} catch (error) {
					const message =
						error instanceof Error ? error.message : "Unknown error";
					vscode.window.showErrorMessage(
						`Failed to delete snapshot: ${message}`,
					);
				}
			},
		),
	);

	/**
	 * Command: Delete Older Snapshots
	 *
	 * Bulk deletes snapshots older than a specified number of days, with optional
	 * preservation of protected snapshots. Prompts user for age threshold and
	 * confirmation before deletion.
	 *
	 * @command snapback.deleteOlderSnapshots
	 *
	 * @param _item - Unused; command is invoked from command palette
	 *
	 * @returns void (all feedback is provided through UI notifications)
	 *
	 * @throws Shows error message if:
	 * - User enters invalid days value (non-positive or non-numeric)
	 * - User cancels the operation
	 * - Database cleanup fails
	 * - Snapshot files cannot be removed
	 *
	 * @example
	 * ```typescript
	 * // User invokes from command palette
	 * // Prompted: "Delete snapshots older than how many days? [30]"
	 * // Prompted: "Keep protected snapshots? [Yes/No]"
	 * // Shows: "Deleted X snapshot(s) older than 30 days"
	 * ```
	 *
	 * @see {@link SnapshotManager.deleteOlderThan} for implementation
	 */
	disposables.push(
		vscode.commands.registerCommand(
			"snapback.deleteOlderSnapshots",
			async (_item?: SnapshotTreeItem) => {
				try {
					// Ask user for age threshold
					const daysInput = await vscode.window.showInputBox({
						prompt: "Delete snapshots older than how many days?",
						value: "30",
						validateInput: (value) => {
							const num = Number.parseInt(value, 10);
							if (Number.isNaN(num) || num <= 0) {
								return "Please enter a positive number";
							}
							return null;
						},
					});

					if (!daysInput) {
						return; // User cancelled
					}

					const days = Number.parseInt(daysInput, 10);
					const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000;

					// Ask about keeping protected snapshots
					const keepProtected = await vscode.window.showQuickPick(
						["Yes", "No"],
						{
							placeHolder: "Keep protected snapshots?",
						},
					);

					if (!keepProtected) {
						return; // User cancelled
					}

					const result = await snapshotManager.deleteOlderThan(
						cutoffTime,
						keepProtected === "Yes",
					);

					vscode.window.showInformationMessage(
						`Deleted ${result.deletedCount} snapshot(s) older than ${days} days`,
					);
					refreshViews();
				} catch (error) {
					const message =
						error instanceof Error ? error.message : "Unknown error";
					vscode.window.showErrorMessage(
						`Failed to delete snapshots: ${message}`,
					);
				}
			},
		),
	);

	/**
	 * Command: Unprotect and Delete Snapshot
	 *
	 * Removes protection from a snapshot and immediately deletes it in a single
	 * operation. Useful for force-deleting protected snapshots without needing
	 * separate protection and deletion commands.
	 *
	 * @command snapback.unprotectAndDeleteSnapshot
	 *
	 * @param item - Optional SnapshotTreeItem containing snapshot ID (from tree view context)
	 *   - id: Unique identifier of protected snapshot to delete
	 *   - label: Display name for UI feedback
	 *
	 * @returns void (all feedback is provided through UI notifications)
	 *
	 * @throws Shows error message if:
	 * - No snapshot is selected
	 * - Unprotection fails
	 * - Deletion fails
	 *
	 * @example
	 * ```typescript
	 * // Invoked from tree view context menu on protected snapshot
	 * // Shows: 'Protected snapshot "snapshot-name" unprotected and deleted'
	 * ```
	 *
	 * @see {@link SnapshotManager.deleteSnapshot} with unprotectFirst option
	 */
	disposables.push(
		vscode.commands.registerCommand(
			"snapback.unprotectAndDeleteSnapshot",
			async (item?: SnapshotTreeItem) => {
				try {
					if (!item || !item.id) {
						vscode.window.showErrorMessage("No snapshot selected");
						return;
					}

					// Delete with unprotectFirst flag
					const result = await snapshotManager.deleteSnapshot(item.id, {
						unprotectFirst: true,
					});

					if (result.success) {
						vscode.window.showInformationMessage(
							`Protected snapshot "${item.label}" unprotected and deleted`,
						);
						refreshViews();
					}
				} catch (error) {
					const message =
						error instanceof Error ? error.message : "Unknown error";
					vscode.window.showErrorMessage(
						`Failed to delete snapshot: ${message}`,
					);
				}
			},
		),
	);

	/**
	 * Command: Rename Snapshot
	 *
	 * Updates the display name of a snapshot. The new name is validated for
	 * non-empty content and length constraints before being persisted to storage.
	 *
	 * @command snapback.renameSnapshot
	 *
	 * @param item - Optional SnapshotTreeItem containing snapshot ID (from tree view context)
	 *   - id: Unique identifier of snapshot to rename
	 *   - label: Current display name (pre-fills input box)
	 *
	 * @returns void (all feedback is provided through UI notifications)
	 *
	 * @throws Shows error message if:
	 * - No snapshot is selected
	 * - New name is empty or exceeds 100 characters
	 * - Storage update fails
	 * - User cancels the operation
	 *
	 * @example
	 * ```typescript
	 * // Invoked from tree view context menu
	 * // Shows input box pre-filled with current name
	 * // On confirmation: Shows "Snapshot renamed to 'new-name'"
	 * ```
	 *
	 * @see {@link SnapshotManager.rename} for implementation
	 */
	disposables.push(
		vscode.commands.registerCommand(
			"snapback.renameSnapshot",
			async (item?: SnapshotTreeItem) => {
				try {
					if (!item || !item.id) {
						vscode.window.showErrorMessage("No snapshot selected");
						return;
					}

					// Get new name from user
					const newName = await vscode.window.showInputBox({
						prompt: "Enter new snapshot name",
						value: item.label,
						validateInput: (value) => {
							if (!value || value.trim().length === 0) {
								return "Snapshot name cannot be empty";
							}
							if (value.length > 100) {
								return "Snapshot name is too long (max 100 characters)";
							}
							return null;
						},
					});

					if (!newName) {
						return; // User cancelled
					}

					await snapshotManager.rename(item.id, newName.trim());

					vscode.window.showInformationMessage(
						`Snapshot renamed to "${newName}"`,
					);
					refreshViews();
				} catch (error) {
					const message =
						error instanceof Error ? error.message : "Unknown error";
					vscode.window.showErrorMessage(
						`Failed to rename snapshot: ${message}`,
					);
				}
			},
		),
	);

	/**
	 * Command: Protect Snapshot
	 *
	 * Marks a snapshot as protected to prevent accidental deletion. Protected snapshots
	 * are excluded from bulk deletion operations unless explicitly unprotected first.
	 *
	 * @command snapback.protectSnapshot
	 *
	 * @param item - Optional SnapshotTreeItem containing snapshot ID (from tree view context)
	 *   - id: Unique identifier of snapshot to protect
	 *   - label: Display name for UI feedback
	 *
	 * @returns void (all feedback is provided through UI notifications)
	 *
	 * @throws Shows error message if:
	 * - No snapshot is selected
	 * - Protection flag cannot be set in storage
	 *
	 * @example
	 * ```typescript
	 * // Invoked from tree view context menu
	 * // Shows: 'Snapshot "snapshot-name" is now protected'
	 * // Tree view updates to show protection indicator
	 * ```
	 *
	 * @see {@link SnapshotManager.protect} for implementation
	 */
	disposables.push(
		vscode.commands.registerCommand(
			"snapback.protectSnapshot",
			async (item?: SnapshotTreeItem) => {
				try {
					if (!item || !item.id) {
						vscode.window.showErrorMessage("No snapshot selected");
						return;
					}

					await snapshotManager.protect(item.id);

					vscode.window.showInformationMessage(
						`Snapshot "${item.label}" is now protected`,
					);
					refreshViews();
				} catch (error) {
					const message =
						error instanceof Error ? error.message : "Unknown error";
					vscode.window.showErrorMessage(
						`Failed to protect snapshot: ${message}`,
					);
				}
			},
		),
	);

	/**
	 * Command: Restore Last Snapshot
	 *
	 * Restores the most recent snapshot in the workspace with user confirmation.
	 * This is a convenience command for quick recovery without snapshot selection.
	 *
	 * @command snapback.restoreLastSnapshot
	 *
	 * @returns void (all feedback is provided through UI notifications)
	 *
	 * @throws Shows error message if:
	 * - No snapshots exist in the workspace
	 * - Snapshot retrieval fails
	 * - User rejects the confirmation dialog
	 * - Restore operation fails
	 *
	 * @example
	 * ```typescript
	 * // User invokes from command palette
	 * // Shows: "Restore 5 files from [snapshot-name]?"
	 * // On confirmation: Restores all files from latest snapshot
	 * // Shows: "Snapshot restored successfully" or error message
	 * ```
	 *
	 * @see {@link SnapshotManager.getAll} for fetching snapshots
	 */
	disposables.push(
		vscode.commands.registerCommand(
			"snapback.restoreLastSnapshot",
			async () => {
				try {
					// Fetch all snapshots sorted by timestamp (newest first)
					const allSnapshots = await snapshotManager.getAll();

					if (allSnapshots.length === 0) {
						vscode.window.showInformationMessage(
							"No snapshots found for this workspace",
						);
						return;
					}

					// Select the most recent snapshot (first in sorted array)
					const latestSnapshot = allSnapshots[0];
					const fileCount = (latestSnapshot.files || []).length;
					const snapshotLabel = getSnapshotLabel(latestSnapshot);

					logger.info("Restoring last snapshot", {
						snapshotId: latestSnapshot.id,
						fileCount,
					});

					// Show confirmation dialog
					const answer = await vscode.window.showWarningMessage(
						`Restore ${fileCount} file(s) from this snapshot?\n${snapshotLabel.short}`,
						{ modal: true },
						"Restore",
						"Cancel",
					);

					if (answer !== "Restore") {
						logger.debug("User cancelled restore last snapshot", {
							snapshotId: latestSnapshot.id,
						});
						return;
					}

					vscode.window.showInformationMessage(
						`Restoring snapshot: ${snapshotLabel.primary}...`,
					);

					// Trigger restore via command (will be handled by viewCommands.restoreSnapshot)
					await vscode.commands.executeCommand(
						"snapback.restoreSnapshot",
						latestSnapshot.id,
					);

					refreshViews();
				} catch (error) {
					const message =
						error instanceof Error ? error.message : "Unknown error";
					logger.error("Failed to restore last snapshot", error as Error);
					vscode.window.showErrorMessage(
						`Failed to restore snapshot: ${message}`,
					);
				}
			},
		),
	);

	return disposables;
}
