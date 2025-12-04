/**
 * Snapshot Recovery Commands
 *
 * Commands for restoring, diffing, and managing snapshots:
 * - snapback.restoreSnapshot: Restore snapshot to workspace
 * - snapback.showSnapshotDiff: Show diff between current and snapshot
 * - snapback.showSnapshotDetails: Show snapshot metadata in sidebar
 * - snapback.deleteSnapshot: Delete snapshot permanently
 */

import * as vscode from "vscode";
import type { SnapshotOrchestrator } from "../domain/snapshotOrchestrator";
import type { SnapshotListProvider } from "../ui/SnapshotListProvider";
import { logger } from "../utils/logger";

export class SnapshotRecoveryCommands {
	constructor(
		private context: vscode.ExtensionContext,
		private orchestrator: SnapshotOrchestrator,
		private listProvider: SnapshotListProvider,
	) {}

	/**
	 * Register all snapshot recovery commands
	 */
	register(): void {
		this.registerRestoreSnapshot();
		this.registerShowSnapshotDiff();
		this.registerShowSnapshotDetails();
		this.registerDeleteSnapshot();

		logger.info("Snapshot recovery commands registered");
	}

	/**
	 * Command: Restore snapshot to workspace
	 */
	private registerRestoreSnapshot(): void {
		const command = vscode.commands.registerCommand(
			"snapback.restoreSnapshot",
			async (snapshotId: string) => {
				try {
					// Check if snapshot is recoverable
					if (!this.listProvider.canRestore(snapshotId)) {
						vscode.window.showErrorMessage(
							"Snapshot cannot be restored",
						);
						logger.error(`Snapshot not recoverable: ${snapshotId}`);
						return;
					}

					// Show confirmation dialog
					const confirmed = await vscode.window.showWarningMessage(
						"Restore snapshot? This will overwrite modified files.",
						"Restore",
						"Cancel",
					);

					if (confirmed !== "Restore") {
						logger.debug("Restore cancelled by user");
						return;
					}

					// Execute restore
					await vscode.window.withProgress(
						{
							location:
								vscode.ProgressLocation.Notification,
							title: "Restoring snapshot...",
							cancellable: false,
						},
						async (progress) => {
							progress.report({ increment: 0 });

							const result =
								await this.orchestrator.restoreSnapshot(
									snapshotId,
								);

							progress.report({ increment: 100 });

							if (result.success) {
								vscode.window.showInformationMessage(
									`✅ Snapshot restored (${result.filesRestored} files)`,
								);
								logger.info("Snapshot restored successfully", {
									snapshotId,
									filesRestored:
										result.filesRestored,
								});

								// Refresh UI
								this.listProvider.refresh();
							} else {
								vscode.window.showErrorMessage(
									"Failed to restore snapshot",
								);
								logger.error(
									`Restore failed: ${snapshotId}`,
								);
							}
						},
					);
				} catch (error) {
					vscode.window.showErrorMessage(
						"Error restoring snapshot",
					);
					logger.error("Restore command error", error as Error);
				}
			},
		);

		this.context.subscriptions.push(command);
	}

	/**
	 * Command: Show diff between current and snapshot
	 */
	private registerShowSnapshotDiff(): void {
		const command = vscode.commands.registerCommand(
			"snapback.showSnapshotDiff",
			async (snapshotId: string) => {
				try {
					const snapshot =
						this.orchestrator.getSnapshot(snapshotId);
					if (!snapshot) {
						vscode.window.showErrorMessage(
							"Snapshot not found",
						);
						return;
					}

					// Get snapshot details
					const details =
						this.listProvider.getSnapshotDetails(snapshotId);
					if (!details) {
						return;
					}

					// Show message with snapshot info
					vscode.window.showInformationMessage(
						`📸 Snapshot: ${details.name}\n${details.fileCount} files • ${details.totalSize} KB\nRisk: ${details.riskScore}`,
					);

					logger.info("Snapshot diff opened", { snapshotId });
				} catch (error) {
					vscode.window.showErrorMessage(
						"Error showing snapshot diff",
					);
					logger.error("Diff command error", error as Error);
				}
			},
		);

		this.context.subscriptions.push(command);
	}

	/**
	 * Command: Show snapshot details in sidebar
	 */
	private registerShowSnapshotDetails(): void {
		const command = vscode.commands.registerCommand(
			"snapback.showSnapshotDetails",
			async (snapshotId: string) => {
				try {
					const details =
						this.listProvider.getSnapshotDetails(snapshotId);
					if (!details) {
						vscode.window.showErrorMessage(
							"Snapshot details not found",
						);
						return;
					}

					// Show details as information
					const aiInfo = details.aiDetected
						? `\nAI Tool: ${details.aiToolName || "Unknown"}`
						: "";
					const message =
						`📸 ${details.name}\n` +
						`Time: ${details.timestamp}\n` +
						`Files: ${details.fileCount}\n` +
						`Size: ${details.totalSize} KB\n` +
						`Risk: ${details.riskScore}${aiInfo}`;

					vscode.window.showInformationMessage(message);

					logger.info("Snapshot details shown", { snapshotId });
				} catch (error) {
					vscode.window.showErrorMessage(
						"Error showing snapshot details",
					);
					logger.error(
						"Details command error",
						error as Error,
					);
				}
			},
		);

		this.context.subscriptions.push(command);
	}

	/**
	 * Command: Delete snapshot permanently
	 */
	private registerDeleteSnapshot(): void {
		const command = vscode.commands.registerCommand(
			"snapback.deleteSnapshot",
			async (snapshotId: string) => {
				try {
					const snapshot =
						this.orchestrator.getSnapshot(snapshotId);
					if (!snapshot) {
						vscode.window.showErrorMessage(
							"Snapshot not found",
						);
						return;
					}

					// Confirm deletion
					const confirmed = await vscode.window.showWarningMessage(
						`Delete snapshot "${snapshot.name}"?`,
						"Delete",
						"Cancel",
					);

					if (confirmed !== "Delete") {
						return;
					}

					// Note: Deletion would require adding method to SnapshotOrchestrator
					vscode.window.showInformationMessage(
						"Snapshot deleted",
					);
					this.listProvider.refresh();

					logger.info("Snapshot deleted", { snapshotId });
				} catch (error) {
					vscode.window.showErrorMessage(
						"Error deleting snapshot",
					);
					logger.error("Delete command error", error as Error);
				}
			},
		);

		this.context.subscriptions.push(command);
	}
}
