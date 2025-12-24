/**
 * MCP Auto-Configuration Module
 *
 * Automatically configures SnapBack MCP for detected AI assistants
 * (Claude Desktop, Cursor, Windsurf, Continue).
 *
 * This module runs during extension activation to provide zero-config
 * setup for users who have AI coding assistants installed.
 *
 * @see mcp_companionship.md Part 2 for specification
 */

import { type AIClientConfig, detectAIClients, getSnapbackMCPConfig, writeClientConfig } from "@snapback/mcp-config";
import * as vscode from "vscode";

import { logger } from "../utils/logger";

// =============================================================================
// TYPES
// =============================================================================

interface ConfigurationResult {
	client: string;
	success: boolean;
	error?: string;
}

// =============================================================================
// AUTO-CONFIGURE
// =============================================================================

/**
 * Auto-configure MCP for detected AI assistants
 *
 * Called during extension activation. Detects AI clients and prompts
 * user to enable SnapBack MCP integration.
 *
 * @param context - VS Code extension context
 */
export async function autoConfigureMCP(context: vscode.ExtensionContext): Promise<void> {
	const config = vscode.workspace.getConfiguration("snapback");

	// Check if auto-configure is enabled (default: true)
	if (!config.get<boolean>("mcp.autoEnable", true)) {
		logger.debug("[MCP] Auto-configure disabled in settings");
		return;
	}

	// Check if we've already configured (don't re-prompt)
	const hasConfigured = context.globalState.get<boolean>("mcp.configured");
	if (hasConfigured) {
		logger.debug("[MCP] Already configured, skipping auto-configure");
		return;
	}

	try {
		// Detect AI clients
		const detection = detectAIClients();

		if (detection.detected.length === 0) {
			// No AI clients found, nothing to do
			logger.debug("[MCP] No AI clients detected");
			trackTelemetry("mcp_auto_configure_no_clients", {});
			return;
		}

		if (detection.needsSetup.length === 0) {
			// All detected clients already have SnapBack
			logger.debug("[MCP] All detected clients already have SnapBack configured");
			trackTelemetry("mcp_auto_configure_already_setup", {
				clients: detection.detected.map((c) => c.name),
			});
			await context.globalState.update("mcp.configured", true);
			return;
		}

		// Show prompt to user
		const clientNames = detection.needsSetup.map((c) => c.displayName).join(", ");
		const response = await vscode.window.showInformationMessage(
			`SnapBack detected ${clientNames}. Enable AI protection integration?`,
			"Enable",
			"Not Now",
			"Never Ask",
		);

		trackTelemetry("mcp_auto_configure_prompt_shown", {
			clients: detection.needsSetup.map((c) => c.name),
			response: response || "dismissed",
		});

		if (response === "Never Ask") {
			await config.update("mcp.autoEnable", false, vscode.ConfigurationTarget.Global);
			return;
		}

		if (response !== "Enable") {
			return;
		}

		// Configure all detected clients
		await configureClients(detection.needsSetup, context);
	} catch (error) {
		logger.error("[MCP] Auto-configure failed", error instanceof Error ? error : undefined);
		trackTelemetry("mcp_auto_configure_error", {
			error: error instanceof Error ? error.message : "Unknown error",
		});
	}
}

/**
 * Configure SnapBack MCP for multiple clients
 */
async function configureClients(clients: AIClientConfig[], context: vscode.ExtensionContext): Promise<void> {
	const results: ConfigurationResult[] = [];

	// Get API key if user is authenticated
	const apiKey = await getStoredApiKey(context);
	const mcpConfig = getSnapbackMCPConfig({ apiKey });

	await vscode.window.withProgress(
		{
			location: vscode.ProgressLocation.Notification,
			title: "Configuring SnapBack MCP...",
			cancellable: false,
		},
		async (progress) => {
			for (const client of clients) {
				progress.report({ message: `Setting up ${client.displayName}...` });

				const result = writeClientConfig(client, mcpConfig);
				results.push({
					client: client.displayName,
					success: result.success,
					error: result.error,
				});
			}
		},
	);

	// Report results
	const successful = results.filter((r) => r.success);
	const failed = results.filter((r) => !r.success);

	if (successful.length > 0) {
		const names = successful.map((r) => r.client).join(", ");
		vscode.window.showInformationMessage(`✓ SnapBack enabled for ${names}. Restart your AI assistant to activate.`);
	}

	if (failed.length > 0) {
		const names = failed.map((r) => r.client).join(", ");
		vscode.window.showWarningMessage(`Could not configure ${names}. Run 'snapback init' manually or check docs.`);
	}

	trackTelemetry("mcp_auto_configure_complete", {
		successful: successful.map((r) => r.client),
		failed: failed.map((r) => r.client),
	});

	// Mark as configured
	await context.globalState.update("mcp.configured", true);
}

/**
 * Get stored API key from secure storage
 */
async function getStoredApiKey(context: vscode.ExtensionContext): Promise<string | undefined> {
	try {
		const secrets = context.secrets;
		return await secrets.get("snapback.apiKey");
	} catch {
		return undefined;
	}
}

// =============================================================================
// COMMANDS
// =============================================================================

/**
 * Register MCP-related commands
 */
export function registerMCPCommands(context: vscode.ExtensionContext): void {
	// Command: Configure MCP manually
	context.subscriptions.push(
		vscode.commands.registerCommand("snapback.mcp.configure", async () => {
			const detection = detectAIClients();

			if (detection.detected.length === 0) {
				vscode.window.showInformationMessage(
					"No AI assistants detected. Install Claude Desktop or Cursor first.",
				);
				return;
			}

			const items = detection.detected.map((client) => ({
				label: client.displayName,
				description: client.hasSnapback ? "✓ Configured" : "Not configured",
				picked: !client.hasSnapback,
				client,
			}));

			const selected = await vscode.window.showQuickPick(items, {
				canPickMany: true,
				placeHolder: "Select AI assistants to configure",
			});

			if (!selected || selected.length === 0) return;

			const apiKey = await getStoredApiKey(context);
			const mcpConfig = getSnapbackMCPConfig({ apiKey });

			for (const item of selected) {
				const result = writeClientConfig(item.client, mcpConfig);
				if (result.success) {
					vscode.window.showInformationMessage(`✓ Configured ${item.client.displayName}`);
				} else {
					vscode.window.showErrorMessage(`Failed to configure ${item.client.displayName}: ${result.error}`);
				}
			}

			trackTelemetry("mcp_manual_configure", {
				clients: selected.map((s) => s.client.name),
			});
		}),
	);

	// Command: Show MCP status
	context.subscriptions.push(
		vscode.commands.registerCommand("snapback.mcp.status", async () => {
			const detection = detectAIClients();

			const items = detection.clients.map((client) => {
				let status = "⚪ Not installed";
				if (client.exists && client.hasSnapback) status = "🟢 Active";
				else if (client.exists) status = "🟡 Needs setup";

				return `${client.displayName}: ${status}`;
			});

			const selected = await vscode.window.showQuickPick(items, {
				placeHolder: "SnapBack MCP Status",
				canPickMany: false,
			});

			// If user selected an item that needs setup, offer to configure
			if (selected?.includes("🟡")) {
				const configure = await vscode.window.showInformationMessage(
					"Would you like to configure this AI assistant?",
					"Configure",
					"Cancel",
				);
				if (configure === "Configure") {
					vscode.commands.executeCommand("snapback.mcp.configure");
				}
			}
		}),
	);

	// Command: Reset MCP configuration state
	context.subscriptions.push(
		vscode.commands.registerCommand("snapback.mcp.reset", async () => {
			await context.globalState.update("mcp.configured", undefined);
			vscode.window.showInformationMessage("MCP configuration state reset. Restart VS Code to re-trigger setup.");
		}),
	);
}

// =============================================================================
// TELEMETRY
// =============================================================================

/**
 * Track telemetry event (stub - integrate with actual telemetry service)
 */
function trackTelemetry(event: string, properties: Record<string, unknown>): void {
	// TODO: Integrate with telemetry service
	logger.debug(`[MCP Telemetry] ${event}`, properties);
}
