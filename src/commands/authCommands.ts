/**
 * Authentication Commands
 *
 * Provides commands for signing in/out of SnapBack using OAuth 2.0
 */

import * as vscode from "vscode";
import { COMMANDS } from "../constants/index.js";
import { logger } from "../utils/logger.js";

/**
 * Register authentication-related commands
 */
export function registerAuthCommands(
	_context: vscode.ExtensionContext,
): vscode.Disposable[] {
	return [
		// Sign in to SnapBack
		vscode.commands.registerCommand(
			COMMANDS.ACCOUNT.SIGN_IN_LEGACY,
			async () => {
				try {
					logger.info("User initiated sign in");

					// Trigger OAuth flow
					const session = await vscode.authentication.getSession(
						"snapback",
						["read", "write"],
						{ createIfNone: true },
					);

					if (session) {
						vscode.window.showInformationMessage(
							`Signed in to SnapBack as ${session.account.label}`,
						);
						logger.info("Sign in successful", {
							account: session.account.id,
						});
					}
				} catch (error) {
					logger.error("Sign in failed", error as Error);
					vscode.window.showErrorMessage(
						`Sign in failed: ${error instanceof Error ? error.message : "Unknown error"}`,
					);
				}
			},
		),

		// Sign out of SnapBack
		vscode.commands.registerCommand(
			COMMANDS.ACCOUNT.SIGN_OUT_LEGACY,
			async () => {
				try {
					logger.info("User initiated sign out");

					// Get current session
					const sessions = await vscode.authentication.getSession(
						"snapback",
						["read", "write"],
						{ createIfNone: false },
					);

					if (!sessions) {
						vscode.window.showInformationMessage(
							"You are not currently signed in to SnapBack",
						);
						return;
					}

					// Confirm sign out
					const confirmed = await vscode.window.showWarningMessage(
						"Are you sure you want to sign out of SnapBack?",
						{ modal: true },
						"Sign Out",
					);

					if (confirmed === "Sign Out") {
						// Remove session (this triggers the authentication provider's removeSession method)
						await vscode.commands.executeCommand(
							"workbench.action.accounts.logout",
							"snapback",
						);

						vscode.window.showInformationMessage("Signed out of SnapBack");
						logger.info("Sign out successful");
					}
				} catch (error) {
					logger.error("Sign out failed", error as Error);
					vscode.window.showErrorMessage(
						`Sign out failed: ${error instanceof Error ? error.message : "Unknown error"}`,
					);
				}
			},
		),

		// Show account status
		vscode.commands.registerCommand(
			COMMANDS.ACCOUNT.SHOW_STATUS_LEGACY,
			async () => {
				try {
					// Try to get session without prompting
					const session = await vscode.authentication.getSession(
						"snapback",
						["read", "write"],
						{ createIfNone: false, silent: true },
					);

					if (session) {
						// Check if API key is also configured
						const config = vscode.workspace.getConfiguration("snapback");
						const hasApiKey = !!config.get("api.key");

						const authMethod = hasApiKey
							? "OAuth (with API key fallback)"
							: "OAuth";

						vscode.window.showInformationMessage(
							`Signed in as ${session.account.label} (${authMethod})`,
							"View Account",
						);
					} else {
						// Check for API key
						const config = vscode.workspace.getConfiguration("snapback");
						const hasApiKey = !!config.get("api.key");

						if (hasApiKey) {
							vscode.window.showInformationMessage(
								"Authenticated with API key",
								"Switch to OAuth",
								"Sign Out",
							);
						} else {
							vscode.window.showInformationMessage(
								"Not signed in to SnapBack",
								"Sign In",
							);
						}
					}
				} catch (error) {
					logger.error("Failed to check auth status", error as Error);
					vscode.window.showErrorMessage(
						"Failed to check authentication status",
					);
				}
			},
		),
	];
}
