/**
 * Snapshot Creation Command Handlers - VS Code command implementations for snapshot creation and restoration
 *
 * This module provides command handlers for core snapshot creation and restoration features.
 *
 * Commands:
 * - vreko.createSnapshot: Create a new snapshot
 * - vreko.vreko: Restore from a snapshot
 *
 * @module commands/snapshotCreationCommands
 */

import { NoChangeError } from "@vreko/contracts";
import * as vscode from "vscode";
import { COMMANDS } from "../constants/index";
import { logger } from "../utils/logger";
import type { CommandContext } from "./types";

/**
 * Register all snapshot creation and restoration commands
 *
 * @param context - VS Code extension context
 * @param commandContext - Command context containing all required services
 * @returns Array of disposables for command registrations
 */
export function registerSnapshotCreationCommands(
	_context: vscode.ExtensionContext,
	commandContext: CommandContext,
): vscode.Disposable[] {
	const disposables: vscode.Disposable[] = [];

	// Extract needed services from context
	const { operationCoordinator, protectedFileRegistry, refreshViews, snapshotManager, daemonBridge, workspaceRoot } =
		commandContext;

	// Command: Create Snapshot
	// UX: Tell what you did, not what you're doing (no premature "Creating..." message)
	// 🐛 FIX: Accept URI parameter from context menu right-click
	// VS Code passes the clicked file's URI when invoked from explorer/context menu
	// Without this, the anchor file would default to alphabetically first file instead of clicked file
	disposables.push(
		vscode.commands.registerCommand(COMMANDS.SNAPSHOT.CREATE_LEGACY, async (uri?: vscode.Uri) => {
			try {
				// If invoked from context menu, use the clicked file as the specific file
				// This ensures the anchor file is set correctly for manual snapshots
				const specificFiles = uri ? [uri.fsPath] : undefined;

				let snapshotId: string | undefined;

				// 🆕 ARCHITECTURE_REFACTOR_SPEC.md Phase 1: Try service delegation first
				if (daemonBridge?.isConnected() && workspaceRoot) {
					try {
						logger.debug("Attempting service delegation for createSnapshot", {
							workspaceRoot,
							specificFiles,
						});

						// Delegate to CLI service
						const result = await daemonBridge.createSnapshot(workspaceRoot, specificFiles || [], {
							trigger: "manual",
							reason: "Manual snapshot via VS Code command",
						});

						if (result.snapshotId) {
							snapshotId = result.snapshotId;
							logger.info("Daemon delegation succeeded for createSnapshot", { snapshotId });

							// Get the snapshot to display its semantic name
							const snapshot = await snapshotManager.get(snapshotId);
							const displayName = snapshot?.name || snapshotId;

							// Aligned with MCP branding style (🦎 prefix)
							vscode.window.showInformationMessage(`🦎 Vreko: Snapshot "${displayName}" created.`);

							const protectedEntries = await protectedFileRegistry.list();
							await protectedFileRegistry.markSnapshot(
								snapshotId,
								protectedEntries.map((entry) => entry.path),
							);

							// Refresh tree views
							refreshViews();

							// Notify Safety Dashboard if available
							vscode.commands.executeCommand("vreko.refreshSafetyDashboard");
							return;
						}
					} catch (daemonError) {
						// Daemon delegation failed, fall back to local
						logger.warn("Daemon delegation failed for createSnapshot, falling back to local", {
							error: daemonError instanceof Error ? daemonError.message : String(daemonError),
						});
						// Fall through to local implementation
					}
				}

				// Local implementation (service unavailable or delegation failed)
				// Silent operation - only notify on completion
				snapshotId = await operationCoordinator.coordinateSnapshotCreation(
					true, // showNotification
					specificFiles,
				);

				// Only proceed if snapshot was created successfully
				if (snapshotId) {
					// Get the snapshot to display its semantic name
					const snapshot = await snapshotManager.get(snapshotId);
					const displayName = snapshot?.name || snapshotId;

					// Aligned with MCP branding style (🦎 prefix)
					vscode.window.showInformationMessage(`🦎 Vreko: Snapshot "${displayName}" created.`);

					const protectedEntries = await protectedFileRegistry.list();
					await protectedFileRegistry.markSnapshot(
						snapshotId,
						protectedEntries.map((entry) => entry.path),
					);

					// Refresh tree views
					refreshViews();

					// Notify Safety Dashboard if available
					vscode.commands.executeCommand("vreko.refreshSafetyDashboard");
				} else {
					vscode.window.showErrorMessage("🦎 Vreko: Failed to create snapshot.");
					return;
				}
			} catch (error) {
				// Handle 0-delta case gracefully - not an error, just no changes
				if (error instanceof NoChangeError) {
					// Aligned with MCP branding style
					vscode.window.showInformationMessage("🦎 Vreko: No changes detected - already protected.");
					return;
				}
				vscode.window.showErrorMessage(`🦎 Vreko: Failed to create snapshot: ${error}`);
			}
		}),
	);

	return disposables;
}
