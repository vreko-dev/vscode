/**
 * Authentication Commands
 *
 * Alpha mode: API-key-only authentication via SecretStorage.
 * No OAuth, no device flow, no token refresh.
 */

import * as vscode from "vscode";
import { createCredentialsManager } from "../auth/credentials";
import { COMMANDS } from "../constants/index";
import type { TelemetryProxy } from "../services/telemetry-proxy";
import { logger } from "../utils/logger";

/**
 * Prompt user to enter their API key and store it in SecretStorage.
 */
async function handleSetApiKey(context: vscode.ExtensionContext): Promise<void> {
	const key = await vscode.window.showInputBox({
		prompt: "Enter your Vreko API key (from console.vreko.dev/activate)",
		password: true,
		placeHolder: "sk_...",
		ignoreFocusOut: true,
		validateInput: (v) => (v && v.trim().length > 0 ? null : "API key cannot be empty"),
	});
	if (!key) {
		return;
	}
	try {
		const mgr = createCredentialsManager(context.secrets);
		await mgr.setCredentials({ apiKey: key.trim() });
		vscode.window.showInformationMessage("🦎 Vreko: API key saved.");
		logger.info("API key stored via command");
	} catch (error) {
		logger.error("Failed to store API key", error as Error);
		vscode.window.showErrorMessage(
			`Failed to save API key: ${error instanceof Error ? error.message : "Unknown error"}`,
		);
	}
}

/**
 * Register authentication-related commands
 */
export function registerAuthCommands(
	context: vscode.ExtensionContext,
	telemetryProxy?: TelemetryProxy,
): vscode.Disposable[] {
	void telemetryProxy; // reserved for future use
	return [
		// Sign in = enter API key
		vscode.commands.registerCommand(COMMANDS.ACCOUNT.SIGN_IN, () => handleSetApiKey(context)),

		// Explicit "enter API key" command
		vscode.commands.registerCommand(COMMANDS.ACCOUNT.MANUAL_AUTH, () => handleSetApiKey(context)),

		// Sign out of Vreko
		vscode.commands.registerCommand(COMMANDS.ACCOUNT.SIGN_OUT, async () => {
			try {
				logger.info("User initiated sign out");
				const confirmed = await vscode.window.showWarningMessage(
					"🦎 Vreko: Remove saved API key?",
					{ modal: true },
					"Sign Out",
				);
				if (confirmed === "Sign Out") {
					const mgr = createCredentialsManager(context.secrets);
					await mgr.clearCredentials();
					vscode.window.showInformationMessage("🦎 Vreko: Signed out");
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
		vscode.commands.registerCommand(COMMANDS.ACCOUNT.SHOW_STATUS, async () => {
			try {
				const mgr = createCredentialsManager(context.secrets);
				const creds = await mgr.getCredentials();
				if (creds) {
					vscode.window.showInformationMessage("🦎 Vreko: Authenticated with API key", "Sign Out");
				} else {
					vscode.window.showInformationMessage("🦎 Vreko: Not signed in", "Enter API Key");
				}
			} catch (error) {
				logger.error("Failed to check auth status", error as Error);
				vscode.window.showErrorMessage("Failed to check authentication status");
			}
		}),

		// Test: Get Auth State
		vscode.commands.registerCommand(COMMANDS.ACCOUNT.GET_AUTH_STATE, async () => {
			const mgr = createCredentialsManager(context.secrets);
			const creds = await mgr.getCredentials();
			return { authenticated: !!creds };
		}),

		// Test: Authenticate
		vscode.commands.registerCommand(COMMANDS.ACCOUNT.AUTHENTICATE, async () => {
			await vscode.commands.executeCommand(COMMANDS.ACCOUNT.SIGN_IN);
			return true;
		}),
	];
}

/**
 * Command: vreko.connect
 *
 * Alpha mode: CONNECT simply prompts for API key (same as sign-in).
 */
export function registerConnectCommand(
	context: vscode.ExtensionContext,
	onAuthSuccess?: () => void,
): vscode.Disposable {
	try {
		return vscode.commands.registerCommand(COMMANDS.ACCOUNT.CONNECT, async () => {
			try {
				await handleSetApiKey(context);
				const mgr = createCredentialsManager(context.secrets);
				const creds = await mgr.getCredentials();
				if (creds) {
					onAuthSuccess?.();
				}
			} catch (error) {
				const errorMsg = error instanceof Error ? error.message : String(error);
				logger.error("Connect failed", error as Error);
				vscode.window.showErrorMessage(`🦎 Vreko: Connect failed  -  ${errorMsg}`);
			}
		});
	} catch (error) {
		if (error instanceof Error && error.message.includes("already exists")) {
			return {
				dispose: () => {
					/* no-op */
				},
			};
		}
		throw error;
	}
}

/**
 * Command: vreko.openSnapshotInWeb
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
			const webUrl = `https://console.vreko.dev/snapshots/${snapshotId}`;

			// Open in external browser
			await vscode.env.openExternal(vscode.Uri.parse(webUrl));
		});
	} catch (error) {
		if (error instanceof Error && error.message.includes("already exists")) {
			return {
				dispose: () => {
					/* no-op */
				},
			};
		}
		throw error;
	}
}
