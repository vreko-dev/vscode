/**
 * Authentication Commands
 *
 * Provides commands for connecting and signing out of SnapBack account.
 *
 * Commands:
 * - snapback.connect: Opens browser to console.snapback.dev/connect/vscode
 * - snapback.signOut: Clears credentials and refreshes tree view
 *
 * @package apps/vscode
 */

import * as vscode from "vscode";
import type { CredentialsManager } from "./credentials";

/**
 * Register authentication commands
 *
 * @param context - Extension context
 * @param credentialsManager - Credentials manager instance
 * @param webConsoleBaseUrl - Web console base URL (default: https://console.snapback.dev)
 */
export function registerAuthCommands(
	context: vscode.ExtensionContext,
	credentialsManager: CredentialsManager,
	webConsoleBaseUrl: string,
): void {
	// Register connect command
	const connectCommand = vscode.commands.registerCommand(
		"snapback.connect",
		async () => {
			try {
				// Open browser to web console linking page
				const linkUrl = `${webConsoleBaseUrl}/connect/vscode`;
				await vscode.env.openExternal(vscode.Uri.parse(linkUrl));

				vscode.window.showInformationMessage(
					"SnapBack: Complete the connection in your browser, then return to VS Code",
				);
			} catch (error) {
				vscode.window.showErrorMessage(
					`SnapBack: Failed to open browser - ${(error as Error).message}`,
				);
			}
		},
	);

	// Register sign out command
	const signOutCommand = vscode.commands.registerCommand(
		"snapback.signOut",
		async () => {
			const confirm = await vscode.window.showWarningMessage(
				"Sign out of SnapBack? You'll need to reconnect to access cloud features.",
				{ modal: true },
				"Sign Out",
				"Cancel",
			);

			if (confirm !== "Sign Out") {
				return;
			}

			try {
				// Clear local credentials
				await credentialsManager.clearCredentials();

				// Refresh tree to show connect prompt
				await vscode.commands.executeCommand("snapback.refreshTree");

				vscode.window.showInformationMessage(
					"SnapBack: Signed out successfully",
				);
			} catch (error) {
				vscode.window.showErrorMessage(
					`SnapBack: Failed to sign out - ${(error as Error).message}`,
				);
			}
		},
	);

	context.subscriptions.push(connectCommand, signOutCommand);
}
