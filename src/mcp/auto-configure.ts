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

import {
	type AIClientConfig,
	detectAIClients,
	getSnapbackMCPConfig,
	removeSnapbackConfig,
	writeClientConfig,
} from "@snapback/mcp-config";
import * as vscode from "vscode";

import { getOrCreateWorkspaceId } from "../auth/workspace-id";
import { TelemetryProxy } from "../services/telemetry-proxy";
import { logger } from "../utils/logger";

// Module-level telemetry proxy instance
let telemetryProxy: TelemetryProxy | null = null;

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
 * Called during extension activation. Configures silently (invisible by default)
 * and only shows success notification after completion.
 *
 * Philosophy: "Configure everything that has a clear benefit and no downside."
 * Only ask permission for: cloud sync, billing, or elevated permissions.
 *
 * @param context - VS Code extension context
 */
export async function autoConfigureMCP(context: vscode.ExtensionContext): Promise<void> {
	// Initialize telemetry first to ensure all MCP events are tracked
	initializeTelemetry(context);

	const config = vscode.workspace.getConfiguration("snapback");

	// Check if auto-configure is disabled by user preference
	if (!config.get<boolean>("mcp.autoEnable", true)) {
		logger.debug("[MCP] Auto-configure disabled in settings");
		return;
	}

	// Check if we've already configured (idempotent)
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

		// 🔥 SILENT CONFIGURATION: No prompt, just configure
		// This is the core value proposition - protection should be automatic
		trackTelemetry("mcp_auto_configure_started", {
			clients: detection.needsSetup.map((c) => c.name),
		});

		// Configure all detected clients silently
		await configureClientsSilently(detection.needsSetup, context);
	} catch (error) {
		logger.error("[MCP] Auto-configure failed", error instanceof Error ? error : undefined);
		trackTelemetry("mcp_auto_configure_error", {
			error: error instanceof Error ? error.message : "Unknown error",
		});
		// Fail silently - don't interrupt user workflow
	}
}

/**
 * Configure SnapBack MCP for multiple clients
 * (Used by manual configuration command - shows progress)
 */
async function configureClients(clients: AIClientConfig[], context: vscode.ExtensionContext): Promise<void> {
	const results: ConfigurationResult[] = [];

	// Get API key if user is authenticated
	const apiKey = await getStoredApiKey(context);
	// Get workspace ID for MCP tier resolution (always available)
	const workspaceId = await getOrCreateWorkspaceId(context.secrets);
	const mcpConfig = getSnapbackMCPConfig({ apiKey, workspaceId });

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
 * Configure MCP clients silently (no progress dialog, no prompts)
 *
 * Philosophy: "Invisible by default, surface when beneficial."
 * Only shows a single success toast AFTER configuration is complete.
 * Failures are logged but don't interrupt user workflow.
 */
async function configureClientsSilently(clients: AIClientConfig[], context: vscode.ExtensionContext): Promise<void> {
	const results: ConfigurationResult[] = [];

	// Get API key if user is authenticated
	const apiKey = await getStoredApiKey(context);
	// Get workspace ID for MCP tier resolution (always available)
	const workspaceId = await getOrCreateWorkspaceId(context.secrets);
	const mcpConfig = getSnapbackMCPConfig({ apiKey, workspaceId });

	// Configure each client silently (no progress UI)
	for (const client of clients) {
		try {
			const result = writeClientConfig(client, mcpConfig);
			results.push({
				client: client.displayName,
				success: result.success,
				error: result.error,
			});
		} catch (err) {
			results.push({
				client: client.displayName,
				success: false,
				error: err instanceof Error ? err.message : "Unknown error",
			});
		}
	}

	const successful = results.filter((r) => r.success);
	const failed = results.filter((r) => !r.success);

	// 🎉 FIRST VALUE MOMENT: Show success toast with primary client
	// Only show after successful configuration - this builds trust
	if (successful.length > 0) {
		const primaryClient = successful[0].client; // Use first successful client
		const message =
			successful.length === 1
				? `🧢 SnapBack is now protecting your ${primaryClient} sessions`
				: `🧢 SnapBack is now protecting ${successful.length} AI assistants`;

		// Deferred toast - let extension finish activation first
		setTimeout(() => {
			vscode.window.showInformationMessage(message, "Learn More").then((selection) => {
				if (selection === "Learn More") {
					vscode.env.openExternal(vscode.Uri.parse("https://snapback.dev/docs/mcp"));
				}
			});
		}, 2000); // 2 second delay for better UX
	}

	// Log failures for diagnostics but don't bother user
	if (failed.length > 0) {
		logger.warn("[MCP] Some clients failed to configure silently", {
			failed: failed.map((r) => ({ client: r.client, error: r.error })),
		});
	}

	trackTelemetry("mcp_auto_configure_silent_complete", {
		successful: successful.map((r) => r.client),
		failed: failed.map((r) => r.client),
	});

	// Mark as configured (even partial success is progress)
	if (successful.length > 0) {
		await context.globalState.update("mcp.configured", true);
	}
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

			if (!selected || selected.length === 0) {
				return;
			}

			const apiKey = await getStoredApiKey(context);
			const workspaceId = await getOrCreateWorkspaceId(context.secrets);
			const mcpConfig = getSnapbackMCPConfig({ apiKey, workspaceId });

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
				if (client.exists && client.hasSnapback) {
					status = "🟢 Active";
				} else if (client.exists) {
					status = "🟡 Needs setup";
				}

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

	// Command: Disable MCP for a client
	context.subscriptions.push(
		vscode.commands.registerCommand("snapback.mcp.disable", async () => {
			const detection = detectAIClients();
			const configured = detection.detected.filter((c) => c.hasSnapback);

			if (configured.length === 0) {
				vscode.window.showInformationMessage("SnapBack MCP is not configured for any AI assistants.");
				return;
			}

			const selected = await vscode.window.showQuickPick(
				configured.map((c) => ({ label: c.displayName, client: c })),
				{ placeHolder: "Select AI assistant to disable SnapBack for" },
			);

			if (!selected) {
				return;
			}

			const result = removeSnapbackConfig(selected.client);
			if (result.success) {
				vscode.window.showInformationMessage(
					`✓ Disabled SnapBack for ${selected.client.displayName}. Restart your AI assistant to apply.`,
				);
				trackTelemetry("mcp_disable", {
					client: selected.client.name,
				});
			} else {
				vscode.window.showErrorMessage(`Failed to disable: ${result.error}`);
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
 * Initialize telemetry proxy for MCP events
 * Called once during extension activation
 */
function initializeTelemetry(context: vscode.ExtensionContext): void {
	if (!telemetryProxy) {
		telemetryProxy = new TelemetryProxy(context);
		logger.debug("[MCP] Telemetry proxy initialized");
	}
}

/**
 * Track telemetry event through TelemetryProxy
 * Events are queued offline and sent when network is available
 */
function trackTelemetry(event: string, properties: Record<string, unknown>): void {
	if (telemetryProxy) {
		telemetryProxy.trackEvent(event, properties).catch((err) => {
			logger.debug(`[MCP Telemetry] Failed to track event: ${event}`, err);
		});
	} else {
		// Fallback to debug logging if proxy not initialized
		logger.debug(`[MCP Telemetry] ${event}`, properties);
	}
}
