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
	repairClientConfig,
	type ValidationResult,
	validateClientConfig,
	writeClientConfig,
} from "@snapback/mcp-config";
import * as vscode from "vscode";

import { getOrCreateWorkspaceId } from "../auth/workspace-id";
import { TelemetryProxy } from "../services/telemetry-proxy";
import { logger } from "../utils/logger";

// Module-level instances
let telemetryProxy: TelemetryProxy | null = null;
let mcpStatusBarItem: vscode.StatusBarItem | null = null;

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
		// Detect AI clients (pass workspace folder for project-specific config detection)
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
		const detection = detectAIClients({ cwd: workspaceFolder });

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
async function _configureClients(clients: AIClientConfig[], context: vscode.ExtensionContext): Promise<void> {
	const results: ConfigurationResult[] = [];

	// Get API key if user is authenticated
	const apiKey = await getStoredApiKey(context);
	// Get workspace ID for MCP tier resolution (always available)
	const workspaceIdResult = await getOrCreateWorkspaceId(context.secrets);
	const mcpConfig = getSnapbackMCPConfig({ apiKey, workspaceId: workspaceIdResult.workspaceId });

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
	const workspaceIdResult = await getOrCreateWorkspaceId(context.secrets);
	// Get workspace root for config
	const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
	const mcpConfig = getSnapbackMCPConfig({ apiKey, workspaceId: workspaceIdResult.workspaceId, workspaceRoot });

	// Configure each client silently (no progress UI)
	for (const client of clients) {
		try {
			// Pre-flight validation for existing configs
			if (client.hasSnapback) {
				const validation = validateClientConfig(client);
				if (!validation.valid) {
					logger.debug(`[MCP] Existing config for ${client.displayName} has issues, will be replaced`);
				}
			}

			const result = writeClientConfig(client, mcpConfig);

			// Post-write validation
			if (result.success) {
				const postValidation = validateClientConfig({ ...client, hasSnapback: true });
				if (!postValidation.valid) {
					const errors = postValidation.issues.filter((i) => i.severity === "error");
					if (errors.length > 0) {
						logger.warn(`[MCP] Config written but has validation errors for ${client.displayName}`);
					}
				}
			}

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

		// Update status bar to healthy
		updateMcpStatusBar("healthy", context);
	}

	// Show "Fix Now" toast for failures
	if (failed.length > 0) {
		logger.warn("[MCP] Some clients failed to configure silently", {
			failed: failed.map((r) => ({ client: r.client, error: r.error })),
		});

		// Only show toast if all failed (partial success is fine)
		if (successful.length === 0) {
			setTimeout(() => {
				vscode.window
					.showWarningMessage("⚠️ Failed to configure MCP for AI assistants", "Fix Now", "Ignore")
					.then((selection) => {
						if (selection === "Fix Now") {
							vscode.commands.executeCommand("snapback.mcp.repair");
						}
					});
			}, 3000);

			// Update status bar to error
			updateMcpStatusBar("error", context);
		}
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
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
			const detection = detectAIClients({ cwd: workspaceFolder });

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
			const workspaceIdResult = await getOrCreateWorkspaceId(context.secrets);
			const mcpConfig = getSnapbackMCPConfig({ apiKey, workspaceId: workspaceIdResult.workspaceId });

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
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
			const detection = detectAIClients({ cwd: workspaceFolder });

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
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
			const detection = detectAIClients({ cwd: workspaceFolder });
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

	// Command: Validate MCP configurations
	context.subscriptions.push(
		vscode.commands.registerCommand("snapback.mcp.validate", async () => {
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
			const detection = detectAIClients({ cwd: workspaceFolder });
			const configured = detection.detected.filter((c) => c.hasSnapback);

			if (configured.length === 0) {
				vscode.window.showInformationMessage("No AI assistants with SnapBack configured.");
				return;
			}

			// Validate all configured clients
			const validationResults: Array<{ client: AIClientConfig; validation: ValidationResult }> = [];
			let hasErrors = false;
			let hasWarnings = false;
			const workspacePathIssues: string[] = [];

			for (const client of configured) {
				const validation = validateClientConfig(client);
				validationResults.push({ client, validation });

				// 🛡️ CRITICAL: Check for hardcoded workspace paths in global configs
				// This prevents cross-workspace MCP server activation (the issue you experienced)
				if (
					client.configPath.includes("Library/Application Support") ||
					client.configPath.includes("AppData")
				) {
					// Global config - check if it has workspace-specific paths
					try {
						const content = require("node:fs").readFileSync(client.configPath, "utf-8");
						const config = JSON.parse(content);
						const snapbackConfig = config.mcpServers?.snapback;

						if (snapbackConfig?.args) {
							const workspaceArg = snapbackConfig.args.find(
								(arg: string) => arg.includes("/") && !arg.startsWith("--"),
							);

							if (workspaceArg && workspaceArg !== workspaceFolder) {
								workspacePathIssues.push(
									`⚠️ ${client.displayName}: Global config has workspace path '${workspaceArg}' (current: '${workspaceFolder}')`,
								);
								hasWarnings = true;
							}
						}
					} catch {
						// Ignore parse errors
					}
				}

				if (validation.issues.some((i) => i.severity === "error")) {
					hasErrors = true;
				}
				if (validation.issues.some((i) => i.severity === "warning")) {
					hasWarnings = true;
				}
			}

			// Show workspace path issues first (most critical)
			if (workspacePathIssues.length > 0) {
				const message =
					`🚨 Found ${workspacePathIssues.length} workspace path issue(s) in global MCP configs.\n\n` +
					"This can cause SnapBack to activate on wrong workspaces.\n\n" +
					`Issues:\n${workspacePathIssues.join("\n")}`;

				const selection = await vscode.window.showWarningMessage(message, "Fix Now", "Learn More", "Ignore");

				if (selection === "Fix Now") {
					vscode.commands.executeCommand("snapback.mcp.repair");
				} else if (selection === "Learn More") {
					vscode.env.openExternal(
						vscode.Uri.parse("https://docs.snapback.dev/troubleshooting/mcp-workspace-isolation"),
					);
				}

				updateMcpStatusBar("warning", context);
				trackTelemetry("mcp_validate_workspace_path_issues", {
					count: workspacePathIssues.length,
				});
				return;
			}

			// Show results
			if (!hasErrors && !hasWarnings) {
				vscode.window.showInformationMessage(`✓ All ${configured.length} MCP configuration(s) are valid!`);
				updateMcpStatusBar("healthy", context);
				trackTelemetry("mcp_validate_success", { count: configured.length });
			} else {
				// Build details message
				const issues: string[] = [];
				for (const { client, validation } of validationResults) {
					for (const issue of validation.issues.filter((i) => i.severity !== "info")) {
						issues.push(`${client.displayName}: ${issue.message}`);
					}
				}

				const message = hasErrors
					? `✗ Found ${issues.length} issue(s) in MCP configurations`
					: `⚠ Found ${issues.length} warning(s) in MCP configurations`;

				const selection = await vscode.window.showWarningMessage(message, "Fix Now", "Show Details", "Ignore");

				if (selection === "Fix Now") {
					vscode.commands.executeCommand("snapback.mcp.repair");
				} else if (selection === "Show Details") {
					// Show issues in output channel or quick pick
					const items = issues.map((issue) => ({ label: issue }));
					vscode.window.showQuickPick(items, {
						placeHolder: "MCP Configuration Issues",
						canPickMany: false,
					});
				}

				updateMcpStatusBar(hasErrors ? "error" : "warning", context);
				trackTelemetry("mcp_validate_issues", {
					errors: hasErrors,
					warnings: hasWarnings,
					count: issues.length,
				});
			}
		}),
	);

	// Command: Repair MCP configurations
	context.subscriptions.push(
		vscode.commands.registerCommand("snapback.mcp.repair", async () => {
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
			const detection = detectAIClients({ cwd: workspaceFolder });
			const configured = detection.detected.filter((c) => c.hasSnapback);

			if (configured.length === 0) {
				vscode.window.showInformationMessage(
					"No AI assistants with SnapBack configured. Run 'SnapBack: Configure MCP' first.",
				);
				return;
			}

			// Find clients with issues
			const clientsWithIssues = configured.filter((client) => {
				const validation = validateClientConfig(client);
				return (
					!validation.valid ||
					validation.issues.some((i) => i.severity === "error" || i.severity === "warning")
				);
			});

			if (clientsWithIssues.length === 0) {
				vscode.window.showInformationMessage("✓ All MCP configurations are healthy! No repairs needed.");
				updateMcpStatusBar("healthy", context);
				return;
			}

			// Get workspace root
			const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

			// Confirm repair
			const confirm = await vscode.window.showWarningMessage(
				`Found issues in ${clientsWithIssues.length} MCP configuration(s). Repair now?`,
				"Repair",
				"Cancel",
			);

			if (confirm !== "Repair") {
				return;
			}

			// Repair with progress
			await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: "Repairing MCP configurations...",
					cancellable: false,
				},
				async (progress) => {
					let repaired = 0;
					let failed = 0;

					for (const client of clientsWithIssues) {
						progress.report({ message: `Repairing ${client.displayName}...` });

						const result = repairClientConfig(client, {
							workspaceRoot,
							force: true,
						});

						if (result.success) {
							repaired++;
						} else {
							failed++;
							logger.warn(`[MCP] Failed to repair ${client.displayName}: ${result.error}`);
						}
					}

					if (repaired > 0 && failed === 0) {
						vscode.window.showInformationMessage(
							`✓ Repaired ${repaired} configuration(s). Restart your AI assistant to apply changes.`,
						);
						updateMcpStatusBar("healthy", context);
					} else if (repaired > 0) {
						vscode.window.showWarningMessage(
							`Repaired ${repaired} configuration(s), ${failed} failed. Restart your AI assistant.`,
						);
						updateMcpStatusBar("warning", context);
					} else {
						vscode.window.showErrorMessage(
							`Failed to repair configurations. Try 'SnapBack: Configure MCP' instead.`,
						);
						updateMcpStatusBar("error", context);
					}

					trackTelemetry("mcp_repair_complete", { repaired, failed });
				},
			);
		}),
	);

	// Initialize status bar
	initMcpStatusBar(context);
}

// =============================================================================
// STATUS BAR
// =============================================================================

/**
 * Initialize MCP status bar item
 */
function initMcpStatusBar(context: vscode.ExtensionContext): void {
	mcpStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	mcpStatusBarItem.command = "snapback.mcp.validate";
	context.subscriptions.push(mcpStatusBarItem);

	// Check initial status (fire-and-forget with error logging)
	checkMcpHealthAndUpdateStatusBar(context).catch((err) => {
		logger.debug("[MCP] Initial health check failed", err);
	});
}

/**
 * Check MCP health and update status bar
 */
async function checkMcpHealthAndUpdateStatusBar(context: vscode.ExtensionContext): Promise<void> {
	const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
	const detection = detectAIClients({ cwd: workspaceFolder });
	const configured = detection.detected.filter((c) => c.hasSnapback);

	if (configured.length === 0) {
		// No MCP configured - hide status bar
		if (mcpStatusBarItem) {
			mcpStatusBarItem.hide();
		}
		return;
	}

	// Validate all configured clients
	let hasErrors = false;
	let hasWarnings = false;

	for (const client of configured) {
		const validation = validateClientConfig(client);
		if (validation.issues.some((i) => i.severity === "error")) {
			hasErrors = true;
		}
		if (validation.issues.some((i) => i.severity === "warning")) {
			hasWarnings = true;
		}
	}

	if (hasErrors) {
		updateMcpStatusBar("error", context);
	} else if (hasWarnings) {
		updateMcpStatusBar("warning", context);
	} else {
		updateMcpStatusBar("healthy", context);
	}
}

/**
 * Update MCP status bar appearance
 */
function updateMcpStatusBar(
	status: "healthy" | "warning" | "error" | "hidden",
	_context: vscode.ExtensionContext,
): void {
	if (!mcpStatusBarItem) {
		return;
	}

	switch (status) {
		case "healthy":
			mcpStatusBarItem.text = "$(check) MCP";
			mcpStatusBarItem.tooltip = "SnapBack MCP: All configurations healthy\nClick to validate";
			mcpStatusBarItem.backgroundColor = undefined;
			mcpStatusBarItem.show();
			break;

		case "warning":
			mcpStatusBarItem.text = "$(warning) MCP";
			mcpStatusBarItem.tooltip = "SnapBack MCP: Configuration warnings detected\nClick to validate";
			mcpStatusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
			mcpStatusBarItem.show();
			break;

		case "error":
			mcpStatusBarItem.text = "$(error) MCP";
			mcpStatusBarItem.tooltip = "SnapBack MCP: Configuration errors detected\nClick to fix";
			mcpStatusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.errorBackground");
			mcpStatusBarItem.show();
			break;

		case "hidden":
			mcpStatusBarItem.hide();
			break;
	}
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
