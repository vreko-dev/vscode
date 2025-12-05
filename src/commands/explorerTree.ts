/**
 * @fileoverview SnapBack Explorer Tree Commands
 *
 * Command handlers for the SnapBack Explorer Tree View
 * Implements OAuth connect, refresh, and snapshot actions
 *
 * @see Design: .qoder/quests/snapback-explorer-tree.md
 */

import { logger } from "@snapback/infrastructure";
import * as vscode from "vscode";
import { COMMANDS } from "../constants/index.js";
import type { SnapBackExplorerTreeProvider } from "../views/explorerTree/SnapBackExplorerTreeProvider.js";
import type { SnapBackTreeNode } from "../views/explorerTree/types.js";

/**
 * Command: snapback.connect
 *
 * Initiates OAuth flow to connect SnapBack account
 * Uses VS Code's authentication API
 */
export function registerConnectCommand(
	_context: vscode.ExtensionContext,
	explorerTreeProvider: SnapBackExplorerTreeProvider,
): vscode.Disposable {
	return vscode.commands.registerCommand(COMMANDS.ACCOUNT.CONNECT, async () => {
		try {
			logger.info("Starting SnapBack OAuth connection");

			// Use VS Code's authentication API with SnapBack provider
			const session = await vscode.authentication.getSession(
				"snapback",
				["workspace:read", "snapshots:read"],
				{ createIfNone: true },
			);

			if (session) {
				logger.info("OAuth connection successful", {
					userId: session.account.id,
				});

				vscode.window.showInformationMessage(
					`Connected to SnapBack as ${session.account.label}`,
				);

				// Refresh tree to show authenticated state
				explorerTreeProvider.refresh();
			}
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error);
			logger.error("OAuth connection failed", error as Error);

			vscode.window.showErrorMessage(
				`Failed to connect to SnapBack: ${errorMsg}`,
			);
		}
	});
}

/**
 * Command: snapback.refreshTree
 *
 * Manually refreshes the Explorer tree view
 * Clears caches and refetches data from API
 */
export function registerRefreshTreeCommand(
	_context: vscode.ExtensionContext,
	explorerTreeProvider: SnapBackExplorerTreeProvider,
): vscode.Disposable {
	return vscode.commands.registerCommand(COMMANDS.UTILITY.REFRESH_TREE, () => {
		logger.info("Manually refreshing SnapBack Explorer tree");
		explorerTreeProvider.refresh();
		vscode.window.showInformationMessage("SnapBack Explorer refreshed");
	});
}

/**
 * Command: snapback.openSnapshotInWeb
 *
 * Opens snapshot detail page in web browser
 * Context menu action for snapshot nodes
 */
export function registerOpenSnapshotInWebCommand(
	_context: vscode.ExtensionContext,
): vscode.Disposable {
	return vscode.commands.registerCommand(
		"snapback.openSnapshotInWeb",
		async (node: SnapBackTreeNode) => {
			if (node.kind !== "snapshot" || !node.snapshotId) {
				logger.warn("openSnapshotInWeb called on non-snapshot node", {
					kind: node.kind,
				});
				return;
			}

			// Get API base URL from configuration
			const config = vscode.workspace.getConfiguration("snapback");
			const webBaseUrl = config.get<string>(
				"webBaseUrl",
				"https://app.snapback.dev",
			);

			const url = `${webBaseUrl}/snapshots/${node.snapshotId}`;

			logger.info("Opening snapshot in web browser", {
				snapshotId: node.snapshotId,
				url,
			});

			await vscode.env.openExternal(vscode.Uri.parse(url));
		},
	);
}

/**
 * Command: snapback.createSnapshot
 *
 * Creates a new snapshot for the active file
 * Can be triggered from blocking issue context menu
 */
export function registerCreateSnapshotCommand(
	_context: vscode.ExtensionContext,
	snapshotManager: any, // TODO: Import proper type from managers
): vscode.Disposable {
	return vscode.commands.registerCommand(
		"snapback.createSnapshot",
		async (node?: SnapBackTreeNode) => {
			try {
				const editor = vscode.window.activeTextEditor;

				if (!editor) {
					vscode.window.showWarningMessage(
						"No active editor - please open a file first",
					);
					return;
				}

				const filePath = editor.document.uri.fsPath;

				logger.info("Creating snapshot from Explorer tree", {
					filePath,
					nodeKind: node?.kind,
				});

				// Create snapshot using snapshot manager
				const snapshot = await snapshotManager.createSnapshot(
					[
						{
							path: filePath,
							content: editor.document.getText(),
							action: "modify",
						},
					],
					{
						description:
							node?.kind === "blockingIssue"
								? `Snapshot before fixing: ${node.label}`
								: "Manual snapshot from Explorer",
						protected: false,
					},
				);

				vscode.window.showInformationMessage(
					`Snapshot created: ${snapshot.id}`,
				);

				logger.info("Snapshot created successfully", {
					snapshotId: snapshot.id,
					filePath,
				});
			} catch (error) {
				const errorMsg = error instanceof Error ? error.message : String(error);
				logger.error("Failed to create snapshot", error as Error);

				vscode.window.showErrorMessage(
					`Failed to create snapshot: ${errorMsg}`,
				);
			}
		},
	);
}
