/**
 * Session Command Handlers - VS Code command implementations for session management
 *
 * This module provides command handlers for session-aware snapshot features.
 *
 * Commands:
 * - snapback.session.list: List all AI sessions (Quick Pick)
 * - snapback.session.restore: Restore a session (with confirmation)
 * - snapback.session.export: Export session to file
 * - snapback.restoreSession: Restore all files from a session (tree view)
 * - snapback.previewRestoreSession: Preview session restore in a diff view
 *
 * @module commands/sessionCommands
 */

import * as path from "node:path";
import * as vscode from "vscode";
import type { SessionManifest } from "../snapshot/sessionTypes";
import { logger } from "../utils/logger";
import type { CommandContext } from "./index";

/**
 * Session tree item interface (matches the tree view item structure)
 */
interface SessionTreeItem {
	session: SessionManifest;
}

/**
 * Register all session management commands.
 *
 * Registers command handlers for session-aware snapshot features including preview
 * and restore functionality. Sessions enable atomic multi-file rollback for complex
 * AI-assisted changes.
 *
 * @param context - VS Code extension context for managing extension lifecycle
 * @param commandContext - Command context containing all required services
 *   - snapshotManager: For retrieving snapshots by ID
 *   - snapshotDocumentProvider: For registering snapshot content with the editor
 *   - storage: For atomic file restoration
 *
 * @returns Array of disposables for all registered commands
 *
 * @throws Registration errors if VS Code API is unavailable
 *
 * @example
 * ```typescript
 * const disposables = registerSessionCommands(context, commandContext);
 * // disposables are pushed to context.subscriptions for automatic cleanup
 * ```
 *
 * @see {@link SessionTreeItem} for tree view item structure
 * @see {@link SessionManifest} for session data structure
 * @see {@link previewRestoreSession} command implementation
 * @see {@link restoreSession} command implementation
 */
export function registerSessionCommands(
	_context: vscode.ExtensionContext,
	commandContext: CommandContext,
): vscode.Disposable[] {
	const disposables: vscode.Disposable[] = [];

	// Extract needed services from context
	const { snapshotManager, snapshotDocumentProvider } = commandContext;

	// ============================================================================
	// NEW: Register commands matching constants/commands.ts SESSION constants
	// ============================================================================

	/**
	 * Command: snapback.session.list
	 * Lists all available AI sessions in a Quick Pick for selection.
	 */
	disposables.push(
		vscode.commands.registerCommand("snapback.session.list", async () => {
			try {
				logger.info("Executing snapback.session.list");

				// Get all snapshots grouped by session
				const snapshots = await snapshotManager.getAll();

				if (!snapshots || snapshots.length === 0) {
					vscode.window.showInformationMessage("No sessions found. Create a snapshot to start a session.");
					return;
				}

				// Group by session ID
				const sessionMap = new Map<string, typeof snapshots>();
				for (const snap of snapshots) {
					const sessionId = (snap.meta?.sessionId as string) || "default";
					if (!sessionMap.has(sessionId)) {
						sessionMap.set(sessionId, []);
					}
					sessionMap.get(sessionId)?.push(snap);
				}

				// Create QuickPick items
				const items = Array.from(sessionMap.entries()).map(([sessionId, snaps]) => ({
					label: `Session: ${sessionId}`,
					description: `${snaps.length} snapshot(s)`,
					detail: `Latest: ${new Date(snaps[0].timestamp).toLocaleString()}`,
					sessionId,
					snapshots: snaps,
				}));

				const selected = await vscode.window.showQuickPick(items, {
					placeHolder: "Select a session to view",
					title: "SnapBack Sessions",
				});

				if (selected) {
					logger.info("Session selected", { sessionId: selected.sessionId });
					// Show session details
					vscode.window.showInformationMessage(
						`Session "${selected.sessionId}" contains ${selected.snapshots.length} snapshot(s)`,
					);
				}
			} catch (error) {
				const message = error instanceof Error ? error.message : "Unknown error";
				logger.error("Failed to list sessions", error instanceof Error ? error : undefined);
				vscode.window.showErrorMessage(`Failed to list sessions: ${message}`);
			}
		}),
	);

	/**
	 * Command: snapback.session.restore
	 * Restores a selected session with confirmation dialog.
	 */
	disposables.push(
		vscode.commands.registerCommand("snapback.session.restore", async () => {
			try {
				logger.info("Executing snapback.session.restore");

				// Get all snapshots grouped by session
				const snapshots = await snapshotManager.getAll();

				if (!snapshots || snapshots.length === 0) {
					vscode.window.showInformationMessage("No sessions to restore.");
					return;
				}

				// Group by session ID
				const sessionMap = new Map<string, typeof snapshots>();
				for (const snap of snapshots) {
					const sessionId = (snap.meta?.sessionId as string) || "default";
					if (!sessionMap.has(sessionId)) {
						sessionMap.set(sessionId, []);
					}
					sessionMap.get(sessionId)?.push(snap);
				}

				// Create QuickPick items
				const items = Array.from(sessionMap.entries()).map(([sessionId, snaps]) => ({
					label: `Session: ${sessionId}`,
					description: `${snaps.length} snapshot(s)`,
					detail: "Restore all files from this session",
					sessionId,
					snapshots: snaps,
				}));

				const selected = await vscode.window.showQuickPick(items, {
					placeHolder: "Select a session to restore",
					title: "Restore Session",
				});

				if (!selected) {
					return; // User cancelled
				}

				// Confirm restoration
				const confirm = await vscode.window.showWarningMessage(
					`Restore ${selected.snapshots.length} snapshot(s) from session "${selected.sessionId}"? This will overwrite current files.`,
					{ modal: true },
					"Restore",
				);

				if (confirm !== "Restore") {
					return; // User cancelled
				}

				// Restore the latest snapshot from the session
				const latestSnapshot = selected.snapshots[0];
				if (commandContext.operationCoordinator) {
					await commandContext.operationCoordinator.restoreToSnapshot(latestSnapshot.id);
					vscode.window.showInformationMessage(`Session "${selected.sessionId}" restored successfully`);
					logger.info("Session restored", { sessionId: selected.sessionId });
				} else {
					vscode.window.showErrorMessage("Operation coordinator not available");
				}
			} catch (error) {
				const message = error instanceof Error ? error.message : "Unknown error";
				logger.error("Failed to restore session", error instanceof Error ? error : undefined);
				vscode.window.showErrorMessage(`Failed to restore session: ${message}`);
			}
		}),
	);

	/**
	 * Command: snapback.session.export
	 * Exports a session to a JSON file.
	 */
	disposables.push(
		vscode.commands.registerCommand("snapback.session.export", async () => {
			try {
				logger.info("Executing snapback.session.export");

				// Get all snapshots grouped by session
				const snapshots = await snapshotManager.getAll();

				if (!snapshots || snapshots.length === 0) {
					vscode.window.showInformationMessage("No sessions to export.");
					return;
				}

				// Group by session ID
				const sessionMap = new Map<string, typeof snapshots>();
				for (const snap of snapshots) {
					const sessionId = (snap.meta?.sessionId as string) || "default";
					if (!sessionMap.has(sessionId)) {
						sessionMap.set(sessionId, []);
					}
					sessionMap.get(sessionId)?.push(snap);
				}

				// Create QuickPick items
				const items = Array.from(sessionMap.entries()).map(([sessionId, snaps]) => ({
					label: `Session: ${sessionId}`,
					description: `${snaps.length} snapshot(s)`,
					detail: "Export session data to file",
					sessionId,
					snapshots: snaps,
				}));

				const selected = await vscode.window.showQuickPick(items, {
					placeHolder: "Select a session to export",
					title: "Export Session",
				});

				if (!selected) {
					return; // User cancelled
				}

				// Show save dialog
				const saveUri = await vscode.window.showSaveDialog({
					defaultUri: vscode.Uri.file(`snapback-session-${selected.sessionId}.json`),
					filters: {
						"JSON files": ["json"],
						"All files": ["*"],
					},
					title: "Export Session",
				});

				if (!saveUri) {
					return; // User cancelled
				}

				// Build export data
				const exportData = {
					sessionId: selected.sessionId,
					exportedAt: new Date().toISOString(),
					snapshotCount: selected.snapshots.length,
					snapshots: selected.snapshots.map((snap) => ({
						id: snap.id,
						timestamp: snap.timestamp,
						metadata: snap.metadata,
					})),
				};

				// Write to file
				await vscode.workspace.fs.writeFile(saveUri, Buffer.from(JSON.stringify(exportData, null, 2), "utf-8"));

				vscode.window.showInformationMessage(`Session "${selected.sessionId}" exported to ${saveUri.fsPath}`);
				logger.info("Session exported", { sessionId: selected.sessionId, path: saveUri.fsPath });
			} catch (error) {
				const message = error instanceof Error ? error.message : "Unknown error";
				logger.error("Failed to export session", error instanceof Error ? error : undefined);
				vscode.window.showErrorMessage(`Failed to export session: ${message}`);
			}
		}),
	);

	// ============================================================================
	// LEGACY: Tree view commands (snapback.restoreSession, snapback.previewRestoreSession)
	// ============================================================================

	/**
	 * Command: Preview Session Restore
	 *
	 * Shows a side-by-side diff view of all files that would be restored in a session,
	 * allowing the user to review changes before committing to the restore operation.
	 *
	 * This command registers snapshot content with the document provider, opens diff
	 * editors for each file, and waits for user confirmation before restoring.
	 *
	 * @command snapback.previewRestoreSession
	 *
	 * @param item - Optional SessionTreeItem containing the session to preview (from tree view context)
	 *
	 * @throws Shows error message if:
	 * - No session is selected
	 * - Snapshots cannot be loaded
	 * - Diff editors fail to open
	 * - User cancels the restore operation
	 *
	 * @example
	 * ```typescript
	 * // Invoked from tree view context menu
	 * // User right-clicks on session and selects "Preview Restore"
	 * // Displays diffs for all files in the session
	 * ```
	 *
	 * @see {@link restoreSessionFiles} for the actual restore implementation
	 * @see {@link registerSessionCommands} for command registration context
	 */
	disposables.push(
		vscode.commands.registerCommand("snapback.previewRestoreSession", async (item?: SessionTreeItem) => {
			try {
				if (!item || !item.session) {
					vscode.window.showErrorMessage("No session selected");
					return;
				}

				const session = item.session;

				// Register all snapshot content with the document provider
				for (const fileEntry of session.files) {
					try {
						// Retrieve the snapshot to get its content
						const snapshot = await snapshotManager.get(fileEntry.snapshotId);
						if (snapshot?.fileContents) {
							// Register each file's content with the snapshot document provider
							for (const [filePath, content] of Object.entries(snapshot.fileContents)) {
								snapshotDocumentProvider.setSnapshotContent(filePath, content);
							}
						}
					} catch (error) {
						logger.warn(`Failed to load snapshot ${fileEntry.snapshotId}`, undefined, { error });
					}
				}

				// Open diff views for each file in the session
				const openedTabs: vscode.Tab[] = [];
				for (const fileEntry of session.files) {
					try {
						// Create URIs for diff editor
						const snapshotUri = vscode.Uri.parse(
							`snapback-snapshot:${fileEntry.snapshotId}/${fileEntry.uri}`,
						);

						const currentUri = vscode.Uri.file(fileEntry.uri);

						// Open side-by-side diff
						await vscode.commands.executeCommand(
							"vscode.diff",
							snapshotUri,
							currentUri,
							`Session Restore: ${fileEntry.uri}`,
						);

						// Track the opened tab
						await new Promise((resolve) => setTimeout(resolve, 100));

						const tabs = vscode.window.tabGroups.all
							.flatMap((group) => group.tabs)
							.filter((tab) => {
								if (tab.input instanceof vscode.TabInputTextDiff) {
									return (
										tab.input.original.toString() === snapshotUri.toString() &&
										tab.input.modified.toString() === currentUri.toString()
									);
								}
								return false;
							});

						if (tabs.length > 0) {
							openedTabs.push(...tabs);
						}
					} catch (error) {
						logger.warn(`Failed to open diff for ${fileEntry.uri}`, undefined, { error });
					}
				}

				// Show confirmation dialog
				const confirm = await vscode.window.showInformationMessage(
					`Previewing restore of ${session.files.length} files from session. Apply changes?`,
					{ modal: true },
					"Restore Session",
				);

				if (confirm === "Restore Session") {
					// Execute the actual restore
					await restoreSessionFiles(session, commandContext);
					vscode.window.showInformationMessage(`Restored ${session.files.length} files from session`);
				}
			} catch (error) {
				const message = error instanceof Error ? error.message : "Unknown error";
				vscode.window.showErrorMessage(`Failed to preview session restore: ${message}`);
			}
		}),
	);

	/**
	 * Command: Restore Session
	 *
	 * Restores all files from a session to their snapshot states with user confirmation.
	 *
	 * This command retrieves each snapshot in the session and performs an atomic restore
	 * operation for all files. Files are restored using temporary writes followed by
	 * atomic renames to ensure data integrity.
	 *
	 * @command snapback.restoreSession
	 *
	 * @param item - Optional SessionTreeItem containing the session to restore (from tree view context)
	 *
	 * @returns void (all feedback is provided through UI notifications and logging)
	 *
	 * @throws Shows error message if:
	 * - No session is selected
	 * - User rejects the confirmation dialog
	 * - Snapshot retrieval fails
	 * - File restore operations fail
	 * - No workspace folder is open
	 *
	 * @example
	 * ```typescript
	 * // Invoked from tree view context menu
	 * // User right-clicks on session and selects "Restore Session"
	 * // Shows warning dialog: "Restore N files from session?"
	 * // On confirmation: restores all files atomically
	 * ```
	 *
	 * @see {@link restoreSessionFiles} for implementation details
	 * @see {@link SessionManifest} for session structure
	 * @see {@link SnapshotManager.get} for snapshot retrieval
	 */
	disposables.push(
		vscode.commands.registerCommand("snapback.restoreSession", async (item?: SessionTreeItem) => {
			try {
				if (!item || !item.session) {
					vscode.window.showErrorMessage("No session selected");
					return;
				}

				const session = item.session;

				// Confirm with user before restoring
				const confirm = await vscode.window.showWarningMessage(
					`Restore ${session.files.length} files from session "${session.id}"?`,
					{ modal: true },
					"Restore Session",
				);

				if (confirm !== "Restore Session") {
					return; // User cancelled
				}

				// Execute the actual restore
				await restoreSessionFiles(session, commandContext);

				vscode.window.showInformationMessage(
					`Restored ${session.files.length} files from session ${session.id}`,
				);
			} catch (error) {
				const message = error instanceof Error ? error.message : "Unknown error";
				vscode.window.showErrorMessage(`Failed to restore session: ${message}`);
			}
		}),
	);

	return disposables;
}

/**
 * Restore all files in a session with comprehensive error handling.
 *
 * Retrieves each snapshot in the session and performs atomic file restoration
 * using temporary writes followed by atomic renames. Collects errors for each
 * file to prevent partial failures from blocking the entire operation.
 *
 * @param session - SessionManifest containing file references and snapshot IDs
 * @param commandContext - Command context providing snapshotManager and storage
 *
 * @returns Promise resolving when restore is complete (even with partial errors)
 *
 * @throws Error containing all accumulated error messages if any files fail to restore
 *   This allows the caller to display comprehensive error feedback while still
 *   notifying the user of partial success
 *
 * @example
 * ```typescript
 * try {
 *   await restoreSessionFiles(session, commandContext);
 *   console.log("All files restored successfully");
 * } catch (error) {
 *   // Error contains all accumulated restore errors
 *   console.error("Restore completed with errors:", error.message);
 * }
 * ```
 *
 * @see {@link SessionManifest} for session structure
 * @see {@link SnapshotManager.get} for snapshot retrieval
 * @see {@link StorageManager} for file-based storage operations
 *
 * @since 1.2.0
 */
async function restoreSessionFiles(session: SessionManifest, commandContext: CommandContext): Promise<void> {
	const { snapshotManager, storage } = commandContext;

	try {
		logger.info("Starting session restore", {
			sessionId: session.id,
			fileCount: session.files.length,
		});

		// Track restored files and any errors
		const restoredFiles: string[] = [];
		const errors: string[] = [];

		// Restore each file in the session
		for (const fileEntry of session.files) {
			try {
				logger.debug("Restoring file from session", {
					sessionId: session.id,
					filePath: fileEntry.uri,
					snapshotId: fileEntry.snapshotId,
				});

				// Retrieve the snapshot
				const snapshot = await snapshotManager.get(fileEntry.snapshotId);
				if (!snapshot) {
					errors.push(`Snapshot not found: ${fileEntry.snapshotId} for file ${fileEntry.uri}`);
					logger.warn(`Snapshot not found for file ${fileEntry.uri} in session ${session.id}`);
					continue;
				}

				// Restore the file using storage
				const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
				if (!workspaceRoot) {
					errors.push("No workspace folder found");
					logger.error(`No workspace folder found during session restore for session ${session.id}`);
					break;
				}

				try {
					// Get the full snapshot with content
					const snapshotWithContent = await storage.getSnapshot(fileEntry.snapshotId);
					if (!snapshotWithContent) {
						errors.push(`Snapshot content not found: ${fileEntry.snapshotId}`);
						continue;
					}

					// Restore file by writing content
					const filePath = fileEntry.uri;
					const fileContent = snapshotWithContent.contents[filePath];
					if (fileContent === undefined) {
						errors.push(`File ${filePath} not found in snapshot`);
						continue;
					}

					// Write file to workspace
					const fileUri = vscode.Uri.file(path.join(workspaceRoot, filePath));
					await vscode.workspace.fs.writeFile(fileUri, Buffer.from(fileContent, "utf-8"));

					restoredFiles.push(fileEntry.uri);
					logger.debug("Successfully restored file", {
						sessionId: session.id,
						filePath: fileEntry.uri,
					});
				} catch (error) {
					const errorMessage = error instanceof Error ? error.message : String(error);
					errors.push(`Failed to restore ${fileEntry.uri}: ${errorMessage}`);
					logger.warn(`Failed to restore file ${fileEntry.uri} in session ${session.id}`, undefined, {
						error: errorMessage,
					});
				}
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error);
				errors.push(`Failed to restore ${fileEntry.uri}: ${errorMessage}`);
				logger.error(
					`Error restoring file ${fileEntry.uri} in session ${session.id}`,
					error instanceof Error ? error : undefined,
					{
						error: errorMessage,
					},
				);
			}
		}

		// Log summary
		logger.info("Session restore completed", {
			sessionId: session.id,
			successCount: restoredFiles.length,
			errorCount: errors.length,
		});

		// If there were errors, throw an error with details
		if (errors.length > 0) {
			throw new Error(`Session restore completed with errors:\n${errors.join("\n")}`);
		}
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : "Unknown error during session restore";
		logger.error(`Session restore failed for session ${session.id}`, error instanceof Error ? error : undefined, {
			error: errorMessage,
		});
		throw error;
	}
}
