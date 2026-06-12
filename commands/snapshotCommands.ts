/**
 * Snapshot Command Handlers - VS Code command implementations for snapshot management
 *
 * This module provides command handlers for the snapshot intelligence system,
 * integrating SnapshotManager with VS Code's command palette and context menus.
 *
 * Commands:
 * - vreko.deleteSnapshot: Delete a single snapshot with confirmation
 * - vreko.deleteOlderSnapshots: Bulk delete old snapshots
 * - vreko.unprotectAndDeleteSnapshot: Unprotect then delete a protected snapshot
 * - vreko.renameSnapshot: Rename a snapshot
 * - vreko.protectSnapshot: Protect a snapshot from deletion
 *
 * @module commands/snapshotCommands
 */

import * as vscode from "vscode";
import type { SnapshotManager } from "../snapshot/SnapshotManager";
import { logger } from "../utils/logger";
import { extractSnapshotId } from "../utils/treeItemUtils";
import type { CommandContext } from "./types";

/**
 * Snapshot tree item interface (matches the tree view item structure)
 */
interface SnapshotTreeItem {
	id: string; // Display ID for tree expansion persistence
	label: string;
	isProtected?: boolean;
	// The actual snapshot ID - required when passed from tree view context
	data?: { type: "snapshot" | "file"; id: string };
}

/**
 * Register all snapshot management commands.
 *
 * Provides command handlers for snapshot CRUD operations including creation, deletion,
 * restoration, renaming, and protection management. Integrates with both local SnapshotManager
 * and optional DaemonBridge for CLI delegation (ARCHITECTURE_REFACTOR_SPEC.md Phase 1).
 *
 * @param context - VS Code extension context for managing extension lifecycle
 * @param commandContext - Shared context containing all required services including:
 *   - snapshotManager: Local snapshot operations
 *   - refreshViews: Callback to refresh tree views
 *   - daemonBridge: Optional CLI service for command delegation
 *   - workspaceRoot: Workspace path for service calls
 *
 * @returns Array of disposables for all registered commands
 *
 * @throws Registration errors if VS Code API is unavailable
 *
 * @example
 * ```typescript
 * const disposables = registerSnapshotCommands(context, commandContext);
 * // disposables are pushed to context.subscriptions for automatic cleanup
 * ```
 *
 * @see {@link SnapshotManager} for snapshot operations
 * @see {@link DaemonBridge} for service delegation
 * @see {@link CommandContext} for context structure
 */
export function registerSnapshotCommands(
	_context: vscode.ExtensionContext,
	commandContext: CommandContext,
): vscode.Disposable[] {
	// Destructure needed services from CommandContext
	const { snapshotManager, refreshViews, daemonBridge, workspaceRoot } = commandContext;
	const disposables: vscode.Disposable[] = [];

	/**
	 * Command: Delete Snapshot
	 *
	 * Deletes a single snapshot from storage with error handling.
	 * Protected snapshots cannot be deleted without explicitly unprotecting first.
	 *
	 * ARCHITECTURE_REFACTOR_SPEC.md Phase 1: Thin Extension Pattern
	 * - Attempts delegation to CLI service if available and connected
	 * - Falls back to local SnapshotManager if service unavailable or fails
	 * - Maintains backward compatibility with existing behavior
	 *
	 * @command vreko.deleteSnapshot
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
	 * @see {@link SnapshotManager.deleteSnapshot} for local implementation
	 * @see {@link DaemonBridge.deleteSnapshot} for service delegation
	 */
	disposables.push(
		vscode.commands.registerCommand("vreko.deleteSnapshot", async (item?: SnapshotTreeItem) => {
			try {
				if (!item) {
					vscode.window.showErrorMessage("No snapshot selected");
					return;
				}

				// Extract actual snapshot ID using utility function
				const snapshotId = extractSnapshotId(item);

				// 🆕 ARCHITECTURE_REFACTOR_SPEC.md Phase 1: Try service delegation first
				// Only delegate if service is connected AND workspace path is available
				if (daemonBridge?.isConnected() && workspaceRoot) {
					try {
						logger.debug("Attempting service delegation for deleteSnapshot", {
							snapshotId,
							workspaceRoot,
						});

						// Delegate to CLI service
						await daemonBridge.deleteSnapshot(workspaceRoot, snapshotId);

						logger.info("Daemon delegation succeeded for deleteSnapshot", { snapshotId });
						vscode.window.showInformationMessage(`Snapshot "${item.label}" deleted successfully`);
						refreshViews();
						return; // Success via service
					} catch (daemonError) {
						// Daemon delegation failed, fall back to local
						logger.warn("Daemon delegation failed for deleteSnapshot, falling back to local", {
							snapshotId,
							error: daemonError instanceof Error ? daemonError.message : String(daemonError),
						});
						// Fall through to local implementation
					}
				}

				// Local implementation (either service unavailable or delegation failed)
				const result = await snapshotManager.deleteSnapshot(snapshotId);

				if (result.success) {
					vscode.window.showInformationMessage(`Snapshot "${item.label}" deleted successfully`);
					refreshViews();
				}
			} catch (error) {
				const message = error instanceof Error ? error.message : "Unknown error";
				vscode.window.showErrorMessage(`Failed to delete snapshot: ${message}`);
			}
		}),
	);

	/**
	 * Command: Delete Older Snapshots
	 *
	 * Bulk deletes snapshots older than a specified number of days, with optional
	 * preservation of protected snapshots. Prompts user for age threshold and
	 * confirmation before deletion.
	 *
	 * @command vreko.deleteOlderSnapshots
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
		vscode.commands.registerCommand("vreko.deleteOlderSnapshots", async (_item?: SnapshotTreeItem) => {
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

				// Ask about keeping protected snapshots
				const keepProtected = await vscode.window.showQuickPick(["Yes", "No"], {
					placeHolder: "Keep protected snapshots?",
				});

				if (!keepProtected) {
					return; // User cancelled
				}

				// 🆕 ARCHITECTURE_REFACTOR_SPEC.md Sprint 3: Try service delegation first
				if (daemonBridge?.isConnected() && workspaceRoot) {
					try {
						logger.debug("Attempting service delegation for deleteOlderSnapshots", {
							days,
							keepProtected: keepProtected === "Yes",
							workspaceRoot,
						});

						// Delegate to CLI service
						const result = await daemonBridge.bulkDeleteSnapshots(workspaceRoot, {
							olderThanDays: days,
							keepProtected: keepProtected === "Yes",
						});

						logger.info("Daemon delegation succeeded for deleteOlderSnapshots", {
							deletedCount: result.deletedCount,
						});

						vscode.window.showInformationMessage(
							`Deleted ${result.deletedCount} snapshot(s) older than ${days} days`,
						);
						refreshViews();
						return; // Success via service
					} catch (daemonError) {
						// Daemon delegation failed, fall back to local
						logger.warn("Daemon delegation failed for deleteOlderSnapshots, falling back to local", {
							error: daemonError instanceof Error ? daemonError.message : String(daemonError),
						});
						// Fall through to local implementation
					}
				}

				// Local implementation (either service unavailable or delegation failed)
				const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000;
				const result = await snapshotManager.deleteOlderThan(cutoffTime, keepProtected === "Yes");

				vscode.window.showInformationMessage(
					`Deleted ${result.deletedCount} snapshot(s) older than ${days} days`,
				);
				refreshViews();
			} catch (error) {
				const message = error instanceof Error ? error.message : "Unknown error";
				vscode.window.showErrorMessage(`Failed to delete snapshots: ${message}`);
			}
		}),
	);

	/**
	 * Command: Unprotect and Delete Snapshot
	 *
	 * Removes protection from a snapshot and immediately deletes it in a single
	 * operation. Useful for force-deleting protected snapshots without needing
	 * separate protection and deletion commands.
	 *
	 * @command vreko.unprotectAndDeleteSnapshot
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
		vscode.commands.registerCommand("vreko.unprotectAndDeleteSnapshot", async (item?: SnapshotTreeItem) => {
			try {
				if (!item) {
					vscode.window.showErrorMessage("No snapshot selected");
					return;
				}

				// Extract actual snapshot ID using utility function
				const snapshotId = extractSnapshotId(item);

				// 🆕 ARCHITECTURE_REFACTOR_SPEC.md Sprint 3: Try service delegation first
				if (daemonBridge?.isConnected() && workspaceRoot) {
					try {
						logger.debug("Attempting service delegation for unprotectAndDeleteSnapshot", {
							snapshotId,
							workspaceRoot,
						});

						// Delegate to CLI service (unprotect then delete)
						await daemonBridge.unprotectSnapshot(workspaceRoot, snapshotId);
						await daemonBridge.deleteSnapshot(workspaceRoot, snapshotId);

						logger.info("Daemon delegation succeeded for unprotectAndDeleteSnapshot", { snapshotId });

						vscode.window.showInformationMessage(
							`Protected snapshot "${item.label}" unprotected and deleted`,
						);
						refreshViews();
						return; // Success via service
					} catch (daemonError) {
						// Daemon delegation failed, fall back to local
						logger.warn("Daemon delegation failed for unprotectAndDeleteSnapshot, falling back to local", {
							snapshotId,
							error: daemonError instanceof Error ? daemonError.message : String(daemonError),
						});
						// Fall through to local implementation
					}
				}

				// Local implementation (either service unavailable or delegation failed)
				// Delete with unprotectFirst flag
				const result = await snapshotManager.deleteSnapshot(snapshotId, {
					unprotectFirst: true,
				});

				if (result.success) {
					vscode.window.showInformationMessage(`Protected snapshot "${item.label}" unprotected and deleted`);
					refreshViews();
				}
			} catch (error) {
				const message = error instanceof Error ? error.message : "Unknown error";
				vscode.window.showErrorMessage(`Failed to delete snapshot: ${message}`);
			}
		}),
	);

	/**
	 * Command: Rename Snapshot
	 *
	 * Updates the display name of a snapshot. The new name is validated for
	 * non-empty content and length constraints before being persisted to storage.
	 *
	 * @command vreko.renameSnapshot
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
		vscode.commands.registerCommand("vreko.renameSnapshot", async (item?: SnapshotTreeItem) => {
			try {
				if (!item) {
					vscode.window.showErrorMessage("No snapshot selected");
					return;
				}

				// Extract actual snapshot ID using utility function
				const snapshotId = extractSnapshotId(item);

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

				// 🆕 ARCHITECTURE_REFACTOR_SPEC.md Sprint 3: Try service delegation first
				if (daemonBridge?.isConnected() && workspaceRoot) {
					try {
						logger.debug("Attempting service delegation for renameSnapshot", {
							snapshotId,
							newName,
							workspaceRoot,
						});

						// Delegate to CLI service
						await daemonBridge.renameSnapshot(workspaceRoot, snapshotId, newName.trim());

						logger.info("Daemon delegation succeeded for renameSnapshot", { snapshotId });

						vscode.window.showInformationMessage(`Snapshot renamed to "${newName}"`);
						refreshViews();
						return; // Success via service
					} catch (daemonError) {
						// Daemon delegation failed, fall back to local
						logger.warn("Daemon delegation failed for renameSnapshot, falling back to local", {
							snapshotId,
							error: daemonError instanceof Error ? daemonError.message : String(daemonError),
						});
						// Fall through to local implementation
					}
				}

				// Local implementation (either service unavailable or delegation failed)
				await snapshotManager.rename(snapshotId, newName.trim());

				vscode.window.showInformationMessage(`Snapshot renamed to "${newName}"`);
				refreshViews();
			} catch (error) {
				const message = error instanceof Error ? error.message : "Unknown error";
				vscode.window.showErrorMessage(`Failed to rename snapshot: ${message}`);
			}
		}),
	);

	/**
	 * Command: Protect Snapshot
	 *
	 * Marks a snapshot as protected to prevent accidental deletion. Protected snapshots
	 * are excluded from bulk deletion operations unless explicitly unprotected first.
	 *
	 * @command vreko.protectSnapshot
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
		vscode.commands.registerCommand("vreko.protectSnapshot", async (item?: SnapshotTreeItem) => {
			try {
				if (!item) {
					vscode.window.showErrorMessage("No snapshot selected");
					return;
				}

				// Extract actual snapshot ID using utility function
				const snapshotId = extractSnapshotId(item);

				// 🆕 ARCHITECTURE_REFACTOR_SPEC.md Sprint 3: Try service delegation first
				if (daemonBridge?.isConnected() && workspaceRoot) {
					try {
						logger.debug("Attempting service delegation for protectSnapshot", {
							snapshotId,
							workspaceRoot,
						});

						// Delegate to CLI service
						await daemonBridge.protectSnapshot(workspaceRoot, snapshotId);

						logger.info("Daemon delegation succeeded for protectSnapshot", { snapshotId });

						vscode.window.showInformationMessage(`Snapshot "${item.label}" is now protected`);
						refreshViews();
						return; // Success via service
					} catch (daemonError) {
						// Daemon delegation failed, fall back to local
						logger.warn("Daemon delegation failed for protectSnapshot, falling back to local", {
							snapshotId,
							error: daemonError instanceof Error ? daemonError.message : String(daemonError),
						});
						// Fall through to local implementation
					}
				}

				// Local implementation (either service unavailable or delegation failed)
				await snapshotManager.protect(snapshotId);

				vscode.window.showInformationMessage(`Snapshot "${item.label}" is now protected`);
				refreshViews();
			} catch (error) {
				const message = error instanceof Error ? error.message : "Unknown error";
				vscode.window.showErrorMessage(`Failed to protect snapshot: ${message}`);
			}
		}),
	);

	/**
	 * Command: Restore Last Snapshot
	 *
	 * Restores the most recent snapshot in the workspace with user confirmation.
	 * This is a convenience command for quick recovery without snapshot selection.
	 *
	 * @command vreko.restoreLastSnapshot
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
		vscode.commands.registerCommand("vreko.restoreLastSnapshot", async () => {
			try {
				// 🆕 ARCHITECTURE_REFACTOR_SPEC.md Sprint 3: Try service delegation first
				let latestSnapshot: { id: string; files?: unknown[]; fileStates?: unknown[] } | null = null;

				if (daemonBridge?.isConnected() && workspaceRoot) {
					try {
						logger.debug("Attempting service delegation for restoreLastSnapshot", { workspaceRoot });
						const daemonSnapshots = await daemonBridge.listSnapshots(workspaceRoot, { limit: 1 });
						if (daemonSnapshots.length > 0) {
							latestSnapshot = { id: daemonSnapshots[0].snapshotId };
							logger.info("Daemon delegation succeeded for listSnapshots", {
								snapshotId: latestSnapshot.id,
							});
						}
					} catch (daemonError) {
						logger.warn("Daemon delegation failed for listSnapshots, falling back to local", {
							error: daemonError instanceof Error ? daemonError.message : String(daemonError),
						});
					}
				}

				// Fallback to local if service didn't provide snapshot
				if (!latestSnapshot) {
					const allSnapshots = await snapshotManager.getAll();
					if (allSnapshots.length === 0) {
						vscode.window.showInformationMessage("No snapshots found for this workspace");
						return;
					}
					latestSnapshot = allSnapshots[0];
				}

				const fileCount = ((latestSnapshot.files || latestSnapshot.fileStates || []) as unknown[]).length;

				logger.info("Opening restore preview for last snapshot", {
					snapshotId: latestSnapshot.id,
					fileCount,
				});

				// Delegate to restoreSnapshot which opens diff + deferred confirmation
				await vscode.commands.executeCommand("vreko.restoreSnapshot", latestSnapshot.id);

				refreshViews();
			} catch (error) {
				const message = error instanceof Error ? error.message : "Unknown error";
				logger.error("Failed to restore last snapshot", error as Error);
				vscode.window.showErrorMessage(`Failed to restore snapshot: ${message}`);
			}
		}),
	);

	/**
	 * Command: Undo Last AI Change
	 *
	 * Restores a file to its state before an AI tool made changes.
	 * This command is invoked from the AIUndoNotification toast.
	 *
	 * ARCHITECTURE_REFACTOR_SPEC.md Sprint 3: Snapshot domain delegation
	 * - Attempts to restore via service if available
	 * - Falls back to local file restoration
	 *
	 * @command vreko.undoLastAIChange
	 *
	 * @param snapshotId - The snapshot ID to restore (from AI detection)
	 * @param filePath - The file path that was modified by AI
	 *
	 * @returns void (all feedback is provided through UI notifications)
	 *
	 * @see {@link AIUndoNotification} for the notification that triggers this command
	 */
	disposables.push(
		vscode.commands.registerCommand("vreko.undoLastAIChange", async (snapshotId?: string, filePath?: string) => {
			try {
				if (!snapshotId) {
					vscode.window.showErrorMessage("No snapshot ID provided for AI undo");
					return;
				}

				logger.info("Undoing AI change", { snapshotId, filePath });

				// 🆕 ARCHITECTURE_REFACTOR_SPEC.md Sprint 3: Try service delegation first
				if (daemonBridge?.isConnected() && workspaceRoot) {
					try {
						logger.debug("Attempting service delegation for undoLastAIChange", {
							snapshotId,
							filePath,
							workspaceRoot,
						});

						// Try to restore via service - use specific file if provided
						const filesToRestore = filePath ? [filePath] : undefined;
						const result = await daemonBridge.restoreSnapshot(workspaceRoot, snapshotId, {
							files: filesToRestore,
							dryRun: false,
						});

						if (result.restored && result.restored.length > 0) {
							logger.info("Daemon delegation succeeded for undoLastAIChange", {
								snapshotId,
								filesRestored: result.restored.length,
							});

							const fileName = filePath?.split(/[\\/]/).pop() || "file";
							vscode.window.showInformationMessage(`Reverted "${fileName}" to pre-AI state`);
							refreshViews();
							return; // Success via service
						}
					} catch (daemonError) {
						// Daemon delegation failed, fall back to local
						logger.warn("Daemon delegation failed for undoLastAIChange, falling back to local", {
							snapshotId,
							error: daemonError instanceof Error ? daemonError.message : String(daemonError),
						});
						// Fall through to local implementation
					}
				}

				// Local implementation (service unavailable or delegation failed)
				// THIN CLIENT: Cannot restore without service - content not available locally
				vscode.window.showErrorMessage(
					"Cannot restore: service connection required. Please ensure the 🦎 Vreko service is running.",
				);
				logger.warn("Thin client cannot restore without service - content not available locally", {
					snapshotId,
				});
			} catch (error) {
				const message = error instanceof Error ? error.message : "Unknown error";
				logger.error(`Failed to undo AI change: snapshotId=${snapshotId}`, error as Error);
				vscode.window.showErrorMessage(`Failed to undo AI change: ${message}`);
			}
		}),
	);

	return disposables;
}
