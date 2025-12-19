/**
 * Authentication Commands
 *
 * Provides commands for signing in/out of SnapBack using OAuth 2.0
 * Also includes connect command (moved from explorerTree.ts after cloud view removal)
 */

import { logger } from "@snapback/infrastructure";
import * as vscode from "vscode";
import { COMMANDS } from "../constants/index";
import { getSecureConfig } from "../security/SecureConfigService";

// Auth provider constants
const AUTH_PROVIDER_ID = "snapback" as const;
const AUTH_SCOPES = ["read", "write"] as const;

/**
 * Callback type for refreshing views after auth state change
 */
type RefreshCallback = () => void;

/**
 * Shared sign-in handler implementation
 * Used by both new and legacy sign-in commands
 */
async function handleSignIn(): Promise<void> {
	try {
		logger.info("User initiated sign in");

		// Trigger OAuth flow
		const session = await vscode.authentication.getSession(AUTH_PROVIDER_ID, AUTH_SCOPES, {
			createIfNone: true,
		});

		if (session) {
			vscode.window.showInformationMessage(`Signed in to SnapBack as ${session.account.label}`);
			logger.info("Sign in successful", {
				account: session.account.id,
			});
		}
	} catch (error) {
		logger.error("Sign in failed", error as Error);
		vscode.window.showErrorMessage(`Sign in failed: ${error instanceof Error ? error.message : "Unknown error"}`);
	}
}

/**
 * Register authentication-related commands
 */
export function registerAuthCommands(_context: vscode.ExtensionContext): vscode.Disposable[] {
	return [
		// Sign in to SnapBack (new command structure)
		vscode.commands.registerCommand(COMMANDS.ACCOUNT.SIGN_IN, handleSignIn),

		// Sign in to SnapBack (legacy command - kept for backward compatibility)
		vscode.commands.registerCommand(COMMANDS.ACCOUNT.SIGN_IN_LEGACY, handleSignIn),

		// Sign out of SnapBack
		vscode.commands.registerCommand(COMMANDS.ACCOUNT.SIGN_OUT_LEGACY, async () => {
			try {
				logger.info("User initiated sign out");

				// Get current session
				const sessions = await vscode.authentication.getSession(AUTH_PROVIDER_ID, AUTH_SCOPES, {
					createIfNone: false,
				});

				if (!sessions) {
					vscode.window.showInformationMessage("You are not currently signed in to SnapBack");
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
					await vscode.commands.executeCommand("workbench.action.accounts.logout", AUTH_PROVIDER_ID);

					vscode.window.showInformationMessage("Signed out of SnapBack");
					logger.info("Sign out successful");
				}
			} catch (error) {
				logger.error("Sign out failed", error as Error);
				vscode.window.showErrorMessage(
					`Sign out failed: ${error instanceof Error ? error.message : "Unknown error"}`,
				);
			}
		}),

		// Show account status
		vscode.commands.registerCommand(COMMANDS.ACCOUNT.SHOW_STATUS_LEGACY, async () => {
			try {
				// Try to get session without prompting
				const session = await vscode.authentication.getSession(AUTH_PROVIDER_ID, AUTH_SCOPES, {
					createIfNone: false,
					silent: true,
				});

				if (session) {
					// ✅ SECURITY (AUTH-030): Check if API key is also configured using SecretStorage
					const secureConfig = getSecureConfig();
					const hasApiKey = await secureConfig.hasSecure("api.key");

					const authMethod = hasApiKey ? "OAuth (with API key fallback)" : "OAuth";
					vscode.window.showInformationMessage(
						`Signed in as ${session.account.label} (${authMethod})`,
						"View Account",
					);
				} else {
					// ✅ SECURITY (AUTH-030): Check for API key using SecretStorage
					const secureConfig = getSecureConfig();
					const hasApiKey = await secureConfig.hasSecure("api.key");

					if (hasApiKey) {
						vscode.window.showInformationMessage(
							"Authenticated with API key",
							"Switch to OAuth",
							"Sign Out",
						);
					} else {
						vscode.window.showInformationMessage("Not signed in to SnapBack", "Sign In");
					}
				}
			} catch (error) {
				logger.error("Failed to check auth status", error as Error);
				vscode.window.showErrorMessage("Failed to check authentication status");
			}
		}),
		// Test: Get Auth State
		vscode.commands.registerCommand(COMMANDS.ACCOUNT.GET_AUTH_STATE, async () => {
			const session = await vscode.authentication.getSession(AUTH_PROVIDER_ID, AUTH_SCOPES, {
				createIfNone: false,
			});
			return { authenticated: !!session };
		}),

		// Test: Authenticate (Mock/Trigger)
		vscode.commands.registerCommand(COMMANDS.ACCOUNT.AUTHENTICATE, async () => {
			// In E2E, we might want to bypass real auth or trigger the flow
			// For now, let's trigger the real flow which might be intercepted by tests
			await vscode.commands.executeCommand(COMMANDS.ACCOUNT.SIGN_IN_LEGACY);
			return true;
		}),
	];
}

/**
 * Command: snapback.connect
 *
 * Initiates OAuth flow to connect SnapBack account
 * Uses VS Code's authentication API
 * Moved from explorerTree.ts after cloud view removal.
 */
export function registerConnectCommand(
	_context: vscode.ExtensionContext,
	onAuthSuccess?: RefreshCallback,
): vscode.Disposable {
	try {
		return vscode.commands.registerCommand(COMMANDS.ACCOUNT.CONNECT, async () => {
			try {
				logger.info("Starting SnapBack OAuth connection");

				// Use VS Code's authentication API with SnapBack provider
				const session = await vscode.authentication.getSession(
					"snapback",
					["workspace:read", "snapshots:read"],
					{
						createIfNone: true,
					},
				);

				if (session) {
					logger.info("OAuth connection successful", {
						userId: session.account.id,
					});

					vscode.window.showInformationMessage(`Connected to SnapBack as ${session.account.label}`);

					// Refresh views to show authenticated state
					onAuthSuccess?.();
				}
			} catch (error) {
				const errorMsg = error instanceof Error ? error.message : String(error);
				logger.error("OAuth connection failed", error as Error);

				vscode.window.showErrorMessage(`Failed to connect to SnapBack: ${errorMsg}`);
			}
		});
	} catch (error) {
		if (error instanceof Error && error.message.includes("already exists")) {
			// Command already exists, return no-op disposable
			return { dispose: () => {} };
		}
		throw error;
	}
}

/**
 * Command: snapback.openSnapshotInWeb
 *
 * Opens snapshot detail page in web browser
 * Context menu action for snapshot nodes
 */
export function registerOpenSnapshotInWebCommand(_context: vscode.ExtensionContext): vscode.Disposable {
	try {
		return vscode.commands.registerCommand(COMMANDS.VIEW.OPEN_IN_WEB, async (snapshotId?: string) => {
			if (!snapshotId) {
				vscode.window.showWarningMessage("No snapshot selected");
				return;
			}

			logger.info("Opening snapshot in web", { snapshotId });

			// Build web URL
			const webUrl = `https://snapback.dev/snapshots/${snapshotId}`;

			// Open in external browser
			await vscode.env.openExternal(vscode.Uri.parse(webUrl));
		});
	} catch (error) {
		if (error instanceof Error && error.message.includes("already exists")) {
			return { dispose: () => {} };
		}
		throw error;
	}
}
