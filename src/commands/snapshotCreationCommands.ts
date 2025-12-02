/**
 * Snapshot Creation Command Handlers - VS Code command implementations for snapshot creation and restoration
 *
 * This module provides command handlers for core snapshot creation and restoration features.
 *
 * Commands:
 * - snapback.createSnapshot: Create a new snapshot
 * - snapback.snapBack: Restore from a snapshot
 *
 * @module commands/snapshotCreationCommands
 */

import * as vscode from "vscode";
import { COMMANDS } from "../constants/index.js";
import type { CommandContext } from "./index.js";

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
	const {
		operationCoordinator,
		protectedFileRegistry,
		refreshViews,
		snapshotManager,
	} = commandContext;

	// Command: Create Snapshot
	disposables.push(
		vscode.commands.registerCommand(
			COMMANDS.SNAPSHOT.CREATE_LEGACY,
			async () => {
				try {
					vscode.window.showInformationMessage("Creating snapshot...");
					const snapshotId =
						await operationCoordinator.coordinateSnapshotCreation();

					// Only proceed if snapshot was created successfully
					if (snapshotId) {
						// Get the snapshot to display its semantic name
						const snapshot = await snapshotManager.get(snapshotId);
						const displayName = snapshot?.name || snapshotId;

						vscode.window.showInformationMessage(
							`Snapshot "${displayName}" created successfully`,
						);

						const protectedEntries = await protectedFileRegistry.list();
						await protectedFileRegistry.markSnapshot(
							snapshotId,
							protectedEntries.map((entry) => entry.path),
						);

						// Refresh tree views
						refreshViews();

						// Notify Safety Dashboard if available
						vscode.commands.executeCommand("snapback.refreshSafetyDashboard");
					} else {
						vscode.window.showErrorMessage("Failed to create snapshot");
						return;
					}
				} catch (error) {
					vscode.window.showErrorMessage(`Failed to create snapshot: ${error}`);
				}
			},
		),
	);

	return disposables;
}
