/**
 * @fileoverview Security Commands
 *
 * Commands for managing secure configuration, including migrating
 * API keys from legacy settings to SecretStorage.
 *
 * @package apps/vscode
 */

import * as vscode from "vscode";
import { getSecureConfig } from "../security/SecureConfigService";
import { logger } from "../utils/logger";

/**
 * Register all security-related commands
 *
 * @param context - VS Code extension context
 * @returns Array of command disposables
 */
export function registerSecurityCommands(_context: vscode.ExtensionContext): vscode.Disposable[] {
	return [
		// Migration command for API keys
		vscode.commands.registerCommand("snapback.migrateSecureConfig", async () => {
			try {
				logger.info("Starting secure configuration migration");

				const secureConfig = getSecureConfig();
				const migrated = await secureConfig.migrateAll();

				logger.info("Secure configuration migration complete", { migrated });
			} catch (error) {
				logger.error("Secure configuration migration failed", error as Error);
				vscode.window.showErrorMessage(
					`Failed to migrate API keys: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}),

		// Command to set API key securely
		vscode.commands.registerCommand("snapback.setApiKey", async () => {
			try {
				const apiKey = await vscode.window.showInputBox({
					title: "SnapBack API Key",
					prompt: "Enter your SnapBack API key",
					password: true,
					placeHolder: "sk-...",
					validateInput: (value) => {
						if (value && value.length < 10) {
							return "API key seems too short";
						}
						return undefined;
					},
				});

				if (apiKey === undefined) {
					return; // User cancelled
				}

				if (apiKey === "") {
					// Clear the API key
					await getSecureConfig().delete("api.key");
					vscode.window.showInformationMessage("SnapBack API key cleared.");
					logger.info("API key cleared by user");
				} else {
					await getSecureConfig().set("api.key", apiKey);
					vscode.window.showInformationMessage("SnapBack API key saved securely.");
					logger.info("API key stored in secure storage");
				}
			} catch (error) {
				logger.error("Failed to set API key", error as Error);
				vscode.window.showErrorMessage(
					`Failed to set API key: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}),

		// Command to set MCP auth token securely
		vscode.commands.registerCommand("snapback.setMcpAuthToken", async () => {
			try {
				const token = await vscode.window.showInputBox({
					title: "SnapBack MCP Auth Token",
					prompt: "Enter your MCP authentication token",
					password: true,
				});

				if (token === undefined) {
					return; // User cancelled
				}

				if (token === "") {
					await getSecureConfig().delete("mcp.authToken");
					vscode.window.showInformationMessage("MCP auth token cleared.");
				} else {
					await getSecureConfig().set("mcp.authToken", token);
					vscode.window.showInformationMessage("MCP auth token saved securely.");
				}
			} catch (error) {
				logger.error("Failed to set MCP auth token", error as Error);
				vscode.window.showErrorMessage(
					`Failed to set MCP auth token: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}),
	];
}
