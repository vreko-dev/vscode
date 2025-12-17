import * as path from "node:path";
import * as vscode from "vscode";
import { COMMANDS } from "../constants/index";
import type { SnapshotFileNode } from "../views/snapshotNavigatorProvider";
import { WelcomePanel } from "../welcome/WelcomePanel";
import { compareWithSnapshot } from "./compareWithSnapshot";
import type { CommandContext } from "./types";

export function registerViewCommands(context: vscode.ExtensionContext, ctx: CommandContext): vscode.Disposable[] {
	// Get extension ID dynamically to support VS Code forks (Cursor, Qoder, etc.)
	const extensionId = context.extension.id;

	return [
		vscode.commands.registerCommand(COMMANDS.VIEW.REFRESH_LEGACY, () => {
			ctx.refreshViews();
			vscode.window.showInformationMessage("SnapBack views refreshed");
		}),

		vscode.commands.registerCommand(COMMANDS.VIEW.OPEN_WALKTHROUGH, async () => {
			try {
				await vscode.commands.executeCommand(
					"workbench.action.openWalkthrough",
					`${extensionId}#snapback.welcome`,
				);
			} catch {
				// Walkthrough not supported - show WelcomePanel instead
				WelcomePanel.createOrShow(context.extensionUri);
			}
		}),

		// Debug command: Show welcome panel directly (bypasses walkthrough)
		vscode.commands.registerCommand("snapback.showWelcomePanel", () => {
			WelcomePanel.createOrShow(context.extensionUri);
		}),

		// Debug command: Reset first-install state (for testing welcome flow)
		vscode.commands.registerCommand("snapback.resetWelcomeState", async () => {
			await context.globalState.update("snapback.installed", false);
			vscode.window.showInformationMessage(
				"SnapBack: Welcome state reset. Reload window to see welcome on next activation.",
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

		vscode.commands.registerCommand("snapback.openProtectedFile", async (item: { path: string }) => {
			if (item?.path) {
				const uri = vscode.Uri.file(item.path);
				await vscode.commands.executeCommand("vscode.open", uri);
			}
		}),

		vscode.commands.registerCommand(COMMANDS.SNAPSHOT.RESTORE_LEGACY, async () => {
			try {
				const restored = await ctx.snapshotRestoreUI.showRestoreWorkflow();
				if (restored) {
					vscode.window.showInformationMessage("Snap Back completed successfully");
					ctx.refreshViews();
				}
			} catch (error) {
				vscode.window.showErrorMessage(`Failed to Snap Back: ${error}`);
			}
		}),

		vscode.commands.registerCommand(
			"snapback.restoreSnapshot",
			async (snapshotIdOrItem: string | { data?: { id?: string } } | undefined) => {
				// Handle both direct ID (string) and tree item (object with data.id)
				let snapshotId: string | undefined;
				if (typeof snapshotIdOrItem === "string") {
					snapshotId = snapshotIdOrItem;
				} else if (snapshotIdOrItem && typeof snapshotIdOrItem === "object" && snapshotIdOrItem.data?.id) {
					snapshotId = snapshotIdOrItem.data.id;
				}

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
					ctx.snapshotDocumentProvider.setSnapshotContent(snapshotId, primaryFile, snapshotContent);

					// Create URIs for diff editor
					const snapshotUri = vscode.Uri.parse(`snapback-snapshot:${snapshotId}/${primaryFile}`);
					const currentUri = vscode.Uri.file(path.join(ctx.workspaceRoot, primaryFile));

					const fileName = primaryFile.split("/").pop() || primaryFile;

					// Open side-by-side diff for primary file
					await vscode.commands.executeCommand(
						"vscode.diff",
						snapshotUri,
						currentUri,
						`Snapshot ← ${fileName} → Current`,
					);

					// Build file list for context
					const fileList =
						files.length <= 3
							? files.join(", ")
							: `${files.slice(0, 3).join(", ")} +${files.length - 3} more`;

					// Get snapshot name if available
					const snapshotLabel =
						(snapshot as any).name || `Snapshot from ${new Date(snapshot.timestamp).toLocaleString()}`;

					// Show status bar with restore action (deferred confirmation)
					const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1000);
					statusBarItem.text = `$(history) Reviewing: ${snapshotLabel} (${files.length} files)`;
					statusBarItem.tooltip = "Click to restore all files from this snapshot";
					statusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
					statusBarItem.show();

					// Show non-modal prompt - user can review diff first, then decide
					const answer = await vscode.window.showInformationMessage(
						`Review the diff. Ready to restore ${files.length} file(s)?\n${fileList}`,
						"Restore All",
						"Cancel",
					);

					// Clean up status bar
					statusBarItem.dispose();

					if (answer !== "Restore All") {
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
							return await ctx.operationCoordinator.restoreToSnapshot(snapshotId);
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
					vscode.window.showErrorMessage(`Failed to restore snapshot: ${error}`);
				}
			},
		),

		vscode.commands.registerCommand("snapback.confirmRestoreFromPreview", () =>
			ctx.snapshotRestoreUI.showRestoreWorkflow(),
		),

		vscode.commands.registerCommand("snapback.openSnapshotFileDiff", async (node: SnapshotFileNode) => {
			if (!node || !node.snapshotId || !node.filePath) {
				vscode.window.showErrorMessage("Invalid snapshot file node");
				return;
			}

			try {
				// Retrieve the snapshot to get the file content
				const snapshot = await ctx.storage.getSnapshot(node.snapshotId);
				if (!snapshot || !snapshot.contents) {
					vscode.window.showErrorMessage("Snapshot not found or has no content");
					return;
				}

				const snapshotContent = snapshot.contents[node.filePath];
				if (snapshotContent === undefined) {
					vscode.window.showErrorMessage("File not found in snapshot");
					return;
				}

				// Register snapshot content with provider
				ctx.snapshotDocumentProvider.setSnapshotContent(node.snapshotId, node.filePath, snapshotContent);

				// Create URIs for diff editor
				const snapshotUri = vscode.Uri.parse(`snapback-snapshot:${node.snapshotId}/${node.filePath}`);
				const currentUri = vscode.Uri.file(path.join(ctx.workspaceRoot, node.filePath));

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
								return tab.input.original.toString() === snapshotUri.toString();
							}
							return false;
						});

					// If no diff editors are open for this snapshot, clean up
					if (diffEditors.length === 0) {
						try {
							ctx.snapshotDocumentProvider.clearContentForSnapshot(node.snapshotId, node.filePath);
							disposable.dispose(); // Clean up the listener
						} catch (_error) {
							// Ignore cleanup errors
						}
					}
				});
			} catch (error) {
				vscode.window.showErrorMessage(
					`Failed to open snapshot file diff: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}),

		vscode.commands.registerCommand("snapback.compareWithSnapshot", (uri?: vscode.Uri) =>
			compareWithSnapshot(ctx.storage, ctx.snapshotDocumentProvider, uri),
		),

		vscode.commands.registerCommand(COMMANDS.SNAPSHOT.SHOW_ALL, async () => {
			await vscode.commands.executeCommand("snapback.viewSnapshot");
		}),

		vscode.commands.registerCommand(COMMANDS.SNAPSHOT.VIEW, async (snapshotId?: string) => {
			// If snapshotId is provided (from tree view click), show the snapshot diff/restore flow
			if (snapshotId) {
				// Use the existing restoreSnapshot command which shows diff preview
				await vscode.commands.executeCommand("snapback.restoreSnapshot", snapshotId);
				return;
			}
			// If no snapshotId, just focus the SnapBack view
			await vscode.commands.executeCommand("workbench.view.extension.snapback");
		}),

		// Add other view commands here
	];
}
