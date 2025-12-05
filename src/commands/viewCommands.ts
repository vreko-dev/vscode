import * as path from "node:path";
import * as vscode from "vscode";
import { COMMANDS } from "../constants/index.js";
import type { SnapshotFileNode } from "../views/snapshotNavigatorProvider.js";
import { compareWithSnapshot } from "./compareWithSnapshot.js";
import type { CommandContext } from "./index.js";

export function registerViewCommands(
	_context: vscode.ExtensionContext,
	ctx: CommandContext,
): vscode.Disposable[] {
	return [
		vscode.commands.registerCommand(COMMANDS.VIEW.REFRESH_LEGACY, () => {
			ctx.refreshViews();
			vscode.window.showInformationMessage("SnapBack views refreshed");
		}),

		vscode.commands.registerCommand(COMMANDS.VIEW.OPEN_WALKTHROUGH, () => {
			vscode.commands.executeCommand(
				"workbench.action.openWalkthrough",
				"MarcelleLabs.snapback-vscode#snapback.welcome",
			);
		}),

		vscode.commands.registerCommand(COMMANDS.VIEW.OPEN_DOCS, async () => {
			// Create a webview panel for documentation
			const panel = vscode.window.createWebviewPanel(
				"snapback.documentation",
				"SnapBack Documentation",
				vscode.ViewColumn.One,
				{
					enableScripts: true,
					enableCommandUris: true,
					retainContextWhenHidden: true,
				},
			);

			// Set the HTML content to load docs.snapback.com in an iframe
			panel.webview.html = `
				<!DOCTYPE html>
				<html lang="en">
				<head>
					<meta charset="UTF-8">
					<meta name="viewport" content="width=device-width, initial-scale=1.0">
					<title>SnapBack Documentation</title>
					<style>
						body, html {
							margin: 0;
							padding: 0;
							width: 100%;
							height: 100%;
							overflow: hidden;
						}
						iframe {
							width: 100%;
							height: 100%;
							border: none;
						}
					</style>
				</head>
				<body>
					<iframe src="https://docs.snapback.dev" sandbox="allow-same-origin allow-scripts allow-popups allow-forms"></iframe>
				</body>
				</html>
			`;
		}),

		vscode.commands.registerCommand(
			"snapback.openProtectedFile",
			async (item: { path: string }) => {
				if (item?.path) {
					const uri = vscode.Uri.file(item.path);
					await vscode.commands.executeCommand("vscode.open", uri);
				}
			},
		),

		vscode.commands.registerCommand(
			COMMANDS.SNAPSHOT.RESTORE_LEGACY,
			async () => {
				try {
					const restored = await ctx.snapshotRestoreUI.showRestoreWorkflow();
					if (restored) {
						vscode.window.showInformationMessage(
							"Snap Back completed successfully",
						);
						ctx.refreshViews();
					}
				} catch (error) {
					vscode.window.showErrorMessage(`Failed to Snap Back: ${error}`);
				}
			},
		),

		vscode.commands.registerCommand(
			"snapback.restoreSnapshot",
			async (snapshotId: string) => {
				if (!snapshotId) {
					// No ID provided, show workflow UI
					await vscode.commands.executeCommand("snapback.snapBack");
					return;
				}

				try {
					const snapshot = await ctx.storage.getSnapshot(snapshotId);
					if (!snapshot) {
						vscode.window.showErrorMessage("Snapshot not found");
						return;
					}

					// Get files to restore
					const files = Object.keys(snapshot.contents || {});
					if (files.length === 0) {
						vscode.window.showErrorMessage("Snapshot has no files");
						return;
					}

					// Show diff for the first file (primary file)
					const primaryFile = files[0];
					const snapshotContent = snapshot.contents[primaryFile];

					// Register snapshot content with provider
					ctx.snapshotDocumentProvider.setSnapshotContent(
						snapshotId,
						primaryFile,
						snapshotContent,
					);

					// Create URIs for diff editor
					const snapshotUri = vscode.Uri.parse(
						`snapback-snapshot:${snapshotId}/${primaryFile}`,
					);
					const currentUri = vscode.Uri.file(
						path.join(ctx.workspaceRoot, primaryFile),
					);

					const fileName = primaryFile.split("/").pop() || primaryFile;

					// Open side-by-side diff for primary file
					await vscode.commands.executeCommand(
						"vscode.diff",
						snapshotUri,
						currentUri,
						`Snapshot ← ${fileName} → Current`,
					);

					// Build file list for confirmation dialog
					const fileList =
						files.length <= 3
							? files.join(", ")
							: `${files.slice(0, 3).join(", ")} +${files.length - 3} more`;

					// Get snapshot name if available
					const snapshotLabel =
						(snapshot as any).name ||
						`Snapshot from ${new Date(snapshot.timestamp).toLocaleString()}`;

					// Ask for confirmation with context
					const answer = await vscode.window.showWarningMessage(
						`Restore ${files.length} file(s) from "${snapshotLabel}"?

${fileList}

This will overwrite current files.`,
						{ modal: true },
						"Restore",
						"Cancel",
					);

					if (answer !== "Restore") {
						return;
					}

					// Restore using the coordinator with progress notification
					const result = await vscode.window.withProgress(
						{
							location: vscode.ProgressLocation.Notification,
							title: `Restoring snapshot: ${snapshotLabel}`,
							cancellable: false,
						},
						async () => {
							return await ctx.operationCoordinator.restoreToSnapshot(
								snapshotId,
							);
						},
					);

					if (result) {
						vscode.window.showInformationMessage(
							`✅ Restored ${files.length} file(s) from "${snapshotLabel}"`,
						);
						ctx.refreshViews();
					} else {
						vscode.window.showErrorMessage("Failed to restore snapshot");
					}
				} catch (error) {
					vscode.window.showErrorMessage(
						`Failed to restore snapshot: ${error}`,
					);
				}
			},
		),

		vscode.commands.registerCommand("snapback.confirmRestoreFromPreview", () =>
			ctx.snapshotRestoreUI.showRestoreWorkflow(),
		),

		vscode.commands.registerCommand(
			"snapback.openSnapshotFileDiff",
			async (node: SnapshotFileNode) => {
				if (!node || !node.snapshotId || !node.filePath) {
					vscode.window.showErrorMessage("Invalid snapshot file node");
					return;
				}

				try {
					// Retrieve the snapshot to get the file content
					const snapshot = await ctx.storage.getSnapshot(node.snapshotId);
					if (!snapshot || !snapshot.contents) {
						vscode.window.showErrorMessage(
							"Snapshot not found or has no content",
						);
						return;
					}

					const snapshotContent = snapshot.contents[node.filePath];
					if (snapshotContent === undefined) {
						vscode.window.showErrorMessage("File not found in snapshot");
						return;
					}

					// Register snapshot content with provider
					ctx.snapshotDocumentProvider.setSnapshotContent(
						node.snapshotId,
						node.filePath,
						snapshotContent,
					);

					// Create URIs for diff editor
					const snapshotUri = vscode.Uri.parse(
						`snapback-snapshot:${node.snapshotId}/${node.filePath}`,
					);
					const currentUri = vscode.Uri.file(
						path.join(ctx.workspaceRoot, node.filePath),
					);

					// Get file name for title
					const fileName = node.filePath.split("/").pop() || node.filePath;

					// Open side-by-side diff
					await vscode.commands.executeCommand(
						"vscode.diff",
						snapshotUri,
						currentUri,
						`Snapshot ← ${fileName} → Current`,
					);

					// Set up cleanup when the diff editor is closed
					const disposable = vscode.window.tabGroups.onDidChangeTabs(() => {
						// Check if the diff editor is still open
						const diffEditors = vscode.window.tabGroups.all
							.flatMap((group) => group.tabs)
							.filter((tab) => {
								if (tab.input instanceof vscode.TabInputTextDiff) {
									return (
										tab.input.original.toString() === snapshotUri.toString()
									);
								}
								return false;
							});

						// If no diff editors are open for this snapshot, clean up
						if (diffEditors.length === 0) {
							try {
								ctx.snapshotDocumentProvider.clearContentForSnapshot(
									node.snapshotId,
									node.filePath,
								);
								disposable.dispose(); // Clean up the listener
							} catch (_error) {
								// Ignore cleanup errors
							}
						}
					});
				} catch (error) {
					vscode.window.showErrorMessage(
						`Failed to open snapshot file diff: ${
							error instanceof Error ? error.message : String(error)
						}`,
					);
				}
			},
		),

		vscode.commands.registerCommand(
			"snapback.compareWithSnapshot",
			(uri?: vscode.Uri) =>
				compareWithSnapshot(ctx.storage, ctx.snapshotDocumentProvider, uri),
		),

		vscode.commands.registerCommand(COMMANDS.SNAPSHOT.SHOW_ALL, async () => {
			await vscode.commands.executeCommand("snapback.viewSnapshot");
		}),

		vscode.commands.registerCommand(COMMANDS.SNAPSHOT.VIEW, async () => {
			// Focus the SnapBack view
			await vscode.commands.executeCommand("workbench.view.extension.snapback");
		}),

		// Add other view commands here
	];
}
