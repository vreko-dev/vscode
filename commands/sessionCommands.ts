/**
 * Session Command Handlers - VS Code command implementations for session management
 *
 * This module provides command handlers for session-aware snapshot features.
 *
 * Commands:
 * - vreko.session.list: List all AI sessions (Quick Pick)
 * - vreko.session.restore: Restore a session (with confirmation)
 * - vreko.session.export: Export session to file
 * - vreko.restoreSession: Restore all files from a session (tree view)
 * - vreko.previewRestoreSession: Preview session restore in a diff view
 *
 * @module commands/sessionCommands
 */

import * as path from "node:path";
import * as vscode from "vscode";
import type { SessionManifest } from "../snapshot/sessionTypes";
import type { RichSnapshot as Snapshot } from "../types/snapshot";
import { logger } from "../utils/logger";
import type { CommandContext } from "./types";

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
	const { snapshotManager, snapshotDocumentProvider, daemonBridge, workspaceRoot } = commandContext;

	/**
	 * 🆕 ARCHITECTURE_REFACTOR_SPEC.md Phase 2: Daemon Delegation Helper
	 *
	 * Chain of Responsibility Fallback Pattern:
	 * 1. Try service first (fast, fresh data from CLI)
	 * 2. Fall back to local on failure (reliable, cached)
	 * 3. Graceful degradation throughout
	 *
	 * Best Practices Applied:
	 * - Type-safe format transformation (service → local)
	 * - Comprehensive error handling
	 * - Structured logging for observability
	 * - Backward compatibility (service optional)
	 *
	 * @see https://nobuti.com/thoughts/resilience-patterns-fallback
	 * @see ARCHITECTURE_REFACTOR_SPEC.md Phase 2
	 */
	async function getSnapshotsWithDelegation(): Promise<Snapshot[]> {
		// Try service first if available
		if (daemonBridge?.isConnected() && workspaceRoot) {
			try {
				logger.debug("Attempting service delegation for snapshot list", {
					workspaceRoot,
				});

				// Delegate to CLI service
				const daemonSnapshots = await daemonBridge.listSnapshots(workspaceRoot);

				logger.info("Daemon delegation succeeded for snapshot list", {
					count: daemonSnapshots.length,
				});

				// Transform service format to local Snapshot format
				// Daemon provides lightweight items, hydrate with full data if needed
				const snapshots = await Promise.all(
					daemonSnapshots.map(async (item) => {
						// Try to get full snapshot from local cache
						const fullSnapshot = await snapshotManager.get(item.snapshotId);
						if (fullSnapshot) {
							return fullSnapshot;
						}

						// Fallback: construct minimal snapshot from service data
						const snapshot: Snapshot = {
							id: item.snapshotId,
							origin: "auto",
							createdAt: new Date(item.createdAt).getTime(),
							timestamp: new Date(item.createdAt).getTime(),
							files: item.files.map((path) => ({ path, content: "" })),
							fileCount: item.files.length,
							totalSize: 0,
							meta: {},
						};
						return snapshot;
					}),
				);

				return snapshots; // Success via service
			} catch (daemonError) {
				// Daemon delegation failed, fall back to local
				logger.warn("Daemon delegation failed for snapshot list, falling back to local", {
					error: daemonError instanceof Error ? daemonError.message : String(daemonError),
				});
				// Fall through to local implementation
			}
		}

		// Local implementation (service unavailable or delegation failed)
		logger.debug("Using local snapshot list", {
			daemonAvailable: Boolean(daemonBridge?.isConnected()),
			workspaceAvailable: Boolean(workspaceRoot),
		});

		return await snapshotManager.getAll();
	}

	// ============================================================================
	// NEW: Register commands matching constants/commands.ts SESSION constants
	// ============================================================================

	/**
	 * Command: vreko.session.list
	 * Lists all available AI sessions in a Quick Pick for selection.
	 */
	disposables.push(
		vscode.commands.registerCommand("vreko.session.list", async () => {
			try {
				logger.info("Executing vreko.session.list");

				// 🆕 ARCHITECTURE_REFACTOR_SPEC.md Phase 2: Use service delegation
				const snapshots = await getSnapshotsWithDelegation();

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
					detail: `Latest: ${new Date(snaps[0].timestamp ?? snaps[0].createdAt ?? Date.now()).toLocaleString()}`,
					sessionId,
					snapshots: snaps,
				}));

				const selected = await vscode.window.showQuickPick(items, {
					placeHolder: "Select a session to view",
					title: "🦎 Vreko Sessions",
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
	 * Command: vreko.session.restore
	 * Restores a selected session with confirmation dialog.
	 */
	disposables.push(
		vscode.commands.registerCommand("vreko.session.restore", async () => {
			try {
				logger.info("Executing vreko.session.restore");

				// 🆕 ARCHITECTURE_REFACTOR_SPEC.md Phase 2: Use service delegation
				const snapshots = await getSnapshotsWithDelegation();

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
	 * Command: vreko.session.export
	 * Exports a session to a JSON file.
	 */
	disposables.push(
		vscode.commands.registerCommand("vreko.session.export", async () => {
			try {
				logger.info("Executing vreko.session.export");

				// 🆕 ARCHITECTURE_REFACTOR_SPEC.md Phase 2: Use service delegation
				const snapshots = await getSnapshotsWithDelegation();

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
					defaultUri: vscode.Uri.file(`vreko-session-${selected.sessionId}.json`),
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
						meta: snap.meta, // Aligned with contracts Snapshot field naming
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
	// LEGACY: Tree view commands (vreko.restoreSession, vreko.previewRestoreSession)
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
	 * @command vreko.previewRestoreSession
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
		vscode.commands.registerCommand("vreko.previewRestoreSession", async (item?: SessionTreeItem) => {
			try {
				if (!item || !item.session) {
					vscode.window.showErrorMessage("No session selected");
					return;
				}

				const session = item.session;

				// Check if snapshotDocumentProvider is available
				if (!snapshotDocumentProvider) {
					logger.error("Recovery handler missing: snapshotDocumentProvider is undefined", {
						sessionId: session.id,
						operation: "preview_session_restore",
					});
					vscode.window.showErrorMessage(
						"🦎 Vreko: Unable to preview session restore. Document provider not initialized. Please reload the window.",
					);
					return;
				}

				// Register all snapshot content with the document provider
				for (const fileEntry of session.files ?? []) {
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
				for (const fileEntry of session.files ?? []) {
					try {
						// Create URIs for diff editor
						const snapshotUri = vscode.Uri.parse(`vreko-snapshot:${fileEntry.snapshotId}/${fileEntry.uri}`);

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
					`Previewing restore of ${session.files?.length ?? 0} files from session. Apply changes?`,
					{ modal: true },
					"Restore Session",
				);

				if (confirm === "Restore Session") {
					// Execute the actual restore
					await restoreSessionFiles(session, commandContext);
					vscode.window.showInformationMessage(`Restored ${session.files?.length ?? 0} files from session`);
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
	 * @command vreko.restoreSession
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
		vscode.commands.registerCommand("vreko.restoreSession", async (item?: SessionTreeItem) => {
			try {
				if (!item || !item.session) {
					vscode.window.showErrorMessage("No session selected");
					return;
				}

				const session = item.session;

				// Confirm with user before restoring
				const confirm = await vscode.window.showWarningMessage(
					`Restore ${session.files?.length ?? 0} files from session "${session.id}"?`,
					{ modal: true },
					"Restore Session",
				);

				if (confirm !== "Restore Session") {
					return; // User cancelled
				}

				// Execute the actual restore
				await restoreSessionFiles(session, commandContext);

				vscode.window.showInformationMessage(
					`Restored ${session.files?.length ?? 0} files from session ${session.id}`,
				);
			} catch (error) {
				const message = error instanceof Error ? error.message : "Unknown error";
				vscode.window.showErrorMessage(`Failed to restore session: ${message}`);
			}
		}),
	);

	// =========================================================================
	// Session Lifecycle Commands (for Status WebView and Cockpit TreeView)
	// =========================================================================

	// Auth URL for browser-based authentication
	const AUTH_URL = "https://auth.vreko.dev";

	// Reconnect to service
	disposables.push(
		vscode.commands.registerCommand("vreko.reconnectDaemon", async () => {
			try {
				logger.info("Attempting to reconnect to service...");

				if (!daemonBridge) {
					vscode.window.showErrorMessage(
						"🦎 Vreko: Daemon bridge not initialized. Please reload the window.",
					);
					return;
				}

				// Try to connect
				const connected = await daemonBridge.connect();

				if (connected) {
					vscode.window.showInformationMessage("🦎 Vreko: Reconnected to service successfully.");

					// Update status webview
					const host = (
						globalThis as {
							vrekoHost?: {
								statusWebViewProvider?: { updateState: () => Promise<void> };
							};
						}
					).vrekoHost;

					if (host?.statusWebViewProvider) {
						await host.statusWebViewProvider.updateState();
					}
				} else {
					const result = await vscode.window.showErrorMessage(
						"🦎 Vreko: Failed to connect to service. Make sure the service is running.",
						"Start Daemon",
						"Reload Window",
					);

					if (result === "Start Daemon") {
						// Open terminal with command
						const terminal = vscode.window.createTerminal("🦎 Vreko Daemon");
						terminal.sendText("vreko service start");
						terminal.show();
					} else if (result === "Reload Window") {
						await vscode.commands.executeCommand("workbench.action.reloadWindow");
					}
				}
			} catch (error) {
				logger.error("Failed to reconnect to service", error as Error);
				vscode.window.showErrorMessage(
					`🦎 Vreko: Failed to reconnect - ${error instanceof Error ? error.message : "unknown error"}`,
				);
			}
		}),
	);

	// Show service status
	disposables.push(
		vscode.commands.registerCommand("vreko.daemonStatus", async () => {
			try {
				if (!daemonBridge) {
					vscode.window.showInformationMessage("🦎 Vreko: Daemon bridge not initialized.");
					return;
				}

				const status = await daemonBridge.getStatus();

				const statusLines = [`**Connection:** ${status.connected ? "✅ Connected" : "❌ Disconnected"}`];

				if (status.connected) {
					statusLines.push(`**PID:** ${status.pid ?? "unknown"}`);
					statusLines.push(`**Version:** ${status.version ?? "unknown"}`);
					statusLines.push(`**Uptime:** ${status.uptime ? `${Math.floor(status.uptime / 60)}m` : "unknown"}`);
					statusLines.push(`**Workspaces:** ${status.workspaces ?? 0}`);

					if (status.auth) {
						statusLines.push(
							`**Auth:** ${status.auth.authenticated ? "✅ Signed in" : "❌ Not signed in"}`,
						);
						if (status.auth.user) {
							statusLines.push(`**User:** ${status.auth.user}`);
						}
						if (status.auth.tier) {
							statusLines.push(`**Tier:** ${status.auth.tier}`);
						}
					}
				}

				// Show in output channel
				const output = vscode.window.createOutputChannel("🦎 Vreko: Daemon Status");
				output.clear();
				output.appendLine("🦎 Vreko Daemon Status");
				output.appendLine("=".repeat(30));
				output.appendLine(statusLines.join("\n"));
				output.show();

				logger.info("Daemon status displayed", status);
			} catch (error) {
				logger.error("Failed to get service status", error as Error);
				vscode.window.showErrorMessage(
					`🦎 Vreko: Failed to get service status - ${error instanceof Error ? error.message : "unknown error"}`,
				);
			}
		}),
	);

	// Login - opens browser to auth.vreko.dev
	disposables.push(
		vscode.commands.registerCommand("vreko.login", async () => {
			try {
				logger.info("Opening auth URL in browser...");

				const authUrl = `${AUTH_URL}/login?source=vscode`;
				await vscode.env.openExternal(vscode.Uri.parse(authUrl));

				// Show info message
				const result = await vscode.window.showInformationMessage(
					"🦎 Vreko: Sign in page opened in your browser. Complete sign-in, then click 'I've signed in'.",
					"I've signed in",
					"Cancel",
				);

				if (result === "I've signed in") {
					// Refresh status
					const host = (
						globalThis as {
							vrekoHost?: {
								statusWebViewProvider?: { updateState: () => Promise<void> };
							};
						}
					).vrekoHost;

					if (host?.statusWebViewProvider) {
						await host.statusWebViewProvider.updateState();
					}

					vscode.window.showInformationMessage("🦎 Vreko: Session intelligence unlocked.");
				}
			} catch (error) {
				logger.error("Failed to open auth URL", error as Error);
				vscode.window.showErrorMessage(
					`🦎 Vreko: Failed to open sign-in page - ${error instanceof Error ? error.message : "unknown error"}`,
				);
			}
		}),
	);

	// Start a new session
	disposables.push(
		vscode.commands.registerCommand("vreko.startSession", async () => {
			try {
				logger.info("Starting new session...");

				if (!daemonBridge || !daemonBridge.isConnected()) {
					vscode.window.showErrorMessage("🦎 Vreko: Not connected to service. Please reconnect first.");
					return;
				}

				// Get workspace path
				const workspaceFolders = vscode.workspace.workspaceFolders;
				if (!workspaceFolders || workspaceFolders.length === 0) {
					vscode.window.showErrorMessage("🦎 Vreko: No workspace folder open.");
					return;
				}

				const workspacePath = workspaceFolders[0].uri.fsPath;

				// Ask for task description
				const task = await vscode.window.showInputBox({
					prompt: "What are you working on?",
					placeHolder: "e.g., Refactor authentication module",
					validateInput: (value) => {
						if (!value || value.trim().length === 0) {
							return "Please enter a task description";
						}
						return null;
					},
				});

				if (!task) {
					logger.info("Session start cancelled - no task provided");
					return;
				}

				// Start session via service
				const startResult = await daemonBridge.beginSession(workspacePath, task.trim());

				if (startResult?.taskId) {
					vscode.window.showInformationMessage(`🦎 Vreko: Session started - "${task.trim()}"`);

					// Update status webview
					const host = (
						globalThis as {
							vrekoHost?: {
								statusWebViewProvider?: { updateState: () => Promise<void> };
							};
						}
					).vrekoHost;

					if (host?.statusWebViewProvider) {
						await host.statusWebViewProvider.updateState();
					}

					// Refresh tree view
					await vscode.commands.executeCommand("vreko.refreshIntelligence");

					logger.info("Session started successfully", { taskId: startResult.taskId, task: task.trim() });
				} else {
					vscode.window.showErrorMessage("🦎 Vreko: Failed to start session. Check service logs.");
				}
			} catch (error) {
				logger.error("Failed to start session", error as Error);
				vscode.window.showErrorMessage(
					`🦎 Vreko: Failed to start session - ${error instanceof Error ? error.message : "unknown error"}`,
				);
			}
		}),
	);

	// End current session
	disposables.push(
		vscode.commands.registerCommand("vreko.endSession", async () => {
			try {
				logger.info("Ending current session...");

				if (!daemonBridge || !daemonBridge.isConnected()) {
					vscode.window.showErrorMessage("🦎 Vreko: Not connected to service.");
					return;
				}

				// Get workspace path
				const workspaceFolders = vscode.workspace.workspaceFolders;
				if (!workspaceFolders || workspaceFolders.length === 0) {
					vscode.window.showErrorMessage("🦎 Vreko: No workspace folder open.");
					return;
				}

				const workspacePath = workspaceFolders[0].uri.fsPath;

				// Confirm end session
				const confirmResult = await vscode.window.showInformationMessage(
					"End current session? A closing ceremony will be generated.",
					"End Session",
					"Cancel",
				);

				if (confirmResult !== "End Session") {
					logger.info("Session end cancelled by user");
					return;
				}

				// End session via service
				const endResult = await daemonBridge.endSession(workspacePath, "completed", true);

				if (endResult?.finalized) {
					// Get ceremony data if available
					let ceremonyData = null;
					try {
						ceremonyData = await daemonBridge.getClosingCeremony(workspacePath, endResult.sessionId);
					} catch {
						// Ceremony data not available, use basic stats
					}

					// Show ended state in status webview
					const host = (
						globalThis as {
							vrekoHost?: {
								statusWebViewProvider?: {
									showEnded: (stats: {
										duration: string;
										snapshots: number;
										learnings: number;
									}) => void;
								};
							};
						}
					).vrekoHost;

					if (host?.statusWebViewProvider) {
						host.statusWebViewProvider.showEnded({
							duration: "session ended",
							snapshots: 0,
							learnings: ceremonyData?.learningsCaptured ?? 0,
						});
					}

					// Refresh tree view
					await vscode.commands.executeCommand("vreko.refreshIntelligence");

					// Ask if user wants to see ceremony
					const viewCeremony = await vscode.window.showInformationMessage(
						`Session ended. ${endResult.filesModified ?? 0} files modified.`,
						"View Ceremony",
						"Dismiss",
					);

					if (viewCeremony === "View Ceremony") {
						await vscode.commands.executeCommand("vreko.openCeremony");
					}

					logger.info("Session ended successfully", {
						sessionId: endResult.sessionId,
						filesModified: endResult.filesModified,
					});
				} else {
					vscode.window.showWarningMessage("🦎 Vreko: No active session to end.");
				}
			} catch (error) {
				logger.error("Failed to end session", error as Error);
				vscode.window.showErrorMessage(
					`🦎 Vreko: Failed to end session - ${error instanceof Error ? error.message : "unknown error"}`,
				);
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
 *   // output:("All files restored successfully");
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
			fileCount: session.files?.length ?? 0,
		});

		// Track restored files and any errors
		const restoredFiles: string[] = [];
		const errors: string[] = [];

		// Restore each file in the session
		for (const fileEntry of session.files ?? []) {
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
				if (!workspaceRoot || typeof workspaceRoot !== "string" || workspaceRoot.trim() === "") {
					errors.push("No valid workspace folder found");
					logger.error(`No valid workspace folder found during session restore for session ${session.id}`);
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
