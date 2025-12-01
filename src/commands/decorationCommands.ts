import * as vscode from "vscode";
import { logger } from "../utils/logger.js";
import type { CommandContext } from "./index.js";

/**
 * Register decoration-related commands for controlling file health decorations.
 *
 * @param context - VS Code extension context
 * @param commandContext - Shared command context with access to services
 * @returns Array of command disposables
 */
export function registerDecorationCommands(
	_context: vscode.ExtensionContext,
	commandContext: CommandContext,
): vscode.Disposable[] {
	const disposables: vscode.Disposable[] = [];

	// Command: Clear all file health decorations
	disposables.push(
		vscode.commands.registerCommand(
			"snapback.clearFileHealthDecorations",
			() => {
				try {
					// 🆕 Check if file health decorations are enabled
					const config = vscode.workspace.getConfiguration("snapback");
					const showFileHealthDecorations = config.get<boolean>(
						"showFileHealthDecorations",
						true,
					);

					if (!showFileHealthDecorations) {
						vscode.window.showInformationMessage(
							"File health decorations are disabled in settings",
						);
						return;
					}

					commandContext.fileHealthDecorationProvider.clearAll();
					logger.info("File health decorations cleared");
					vscode.window.showInformationMessage(
						"File health decorations cleared",
					);
				} catch (error) {
					logger.error(
						"Failed to clear file health decorations",
						error as Error,
					);
					vscode.window.showErrorMessage(
						"Failed to clear file health decorations",
					);
				}
			},
		),
	);

	// Command: Refresh file health decorations
	disposables.push(
		vscode.commands.registerCommand(
			"snapback.refreshFileHealthDecorations",
			async () => {
				try {
					// 🆕 Check if file health decorations are enabled
					const config = vscode.workspace.getConfiguration("snapback");
					const showFileHealthDecorations = config.get<boolean>(
						"showFileHealthDecorations",
						true,
					);

					if (!showFileHealthDecorations) {
						vscode.window.showInformationMessage(
							"File health decorations are disabled in settings",
						);
						return;
					}

					// Get all protected files and update their decorations
					const protectedFiles =
						await commandContext.protectedFileRegistry.list();

					// Clear all current decorations
					commandContext.fileHealthDecorationProvider.clearAll();

					// Re-analyze each protected file and update decorations
					let updatedCount = 0;
					for (const file of protectedFiles) {
						const protectionLevel =
							commandContext.protectedFileRegistry.getProtectionLevel(
								file.path,
							);
						if (protectionLevel) {
							// Convert protection level to decoration format
							const decorationProtectionLevel =
								protectionLevel === "Watched"
									? "watch"
									: protectionLevel === "Warning"
										? "warn"
										: "block";

							// For refresh, we'll use "protected" as default health level
							// since we don't have access to current analysis results in commands
							commandContext.fileHealthDecorationProvider.updateFileHealth(
								vscode.Uri.file(file.path),
								"protected",
								decorationProtectionLevel as "watch" | "warn" | "block",
							);
							updatedCount++;
						}
					}

					logger.info("File health decorations refreshed", {
						fileCount: protectedFiles.length,
						updatedCount,
					});
					vscode.window.showInformationMessage(
						`Refreshed file health decorations for ${updatedCount} protected files`,
					);
				} catch (error) {
					logger.error(
						"Failed to refresh file health decorations",
						error as Error,
					);
					vscode.window.showErrorMessage(
						"Failed to refresh file health decorations",
					);
				}
			},
		),
	);

	// Command: Show file health status
	disposables.push(
		vscode.commands.registerCommand(
			"snapback.showFileHealthStatus",
			(uri: vscode.Uri | undefined) => {
				try {
					// 🆕 Check if file health decorations are enabled
					const config = vscode.workspace.getConfiguration("snapback");
					const showFileHealthDecorations = config.get<boolean>(
						"showFileHealthDecorations",
						true,
					);

					if (!showFileHealthDecorations) {
						vscode.window.showInformationMessage(
							"File health decorations are disabled in settings",
						);
						return;
					}

					// If no URI provided, use active editor
					const targetUri = uri || vscode.window.activeTextEditor?.document.uri;

					if (!targetUri) {
						vscode.window.showWarningMessage(
							"No file selected. Please open a file or select one in the explorer.",
						);
						return;
					}

					// Get file health status
					const healthStatus =
						commandContext.fileHealthDecorationProvider.getFileHealth(
							targetUri,
						);

					if (healthStatus) {
						const protectionLevel =
							commandContext.protectedFileRegistry.getProtectionLevel(
								targetUri.fsPath,
							) || "Unknown";

						vscode.window.showInformationMessage(
							`File: ${targetUri.fsPath}\n` +
								`Health Level: ${healthStatus.level}\n` +
								`Protection Level: ${protectionLevel}\n` +
								`Last Updated: ${healthStatus.lastUpdated.toLocaleString()}`,
							{ modal: true },
						);
					} else {
						vscode.window.showInformationMessage(
							`No health status found for: ${targetUri.fsPath}\n` +
								`This file may not be protected or hasn't been analyzed yet.`,
							{ modal: true },
						);
					}

					logger.info("Show file health status command executed", {
						filePath: targetUri.fsPath,
						hasHealthStatus: !!healthStatus,
					});
				} catch (error) {
					logger.error("Failed to show file health status", error as Error);
					vscode.window.showErrorMessage("Failed to show file health status");
				}
			},
		),
	);

	return disposables;
}
