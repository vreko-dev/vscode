/**
 * MCP Auto-Configuration Module
 *
 * Delegates MCP configuration to CLI subprocess for thin client architecture.
 * The extension spawns `vreko tools configure --non-interactive --json` and
 * parses the structured JSON result.
 *
 * @see mcp_companionship.md Part 2 for specification
 */

import { spawn } from "node:child_process";
import * as vscode from "vscode";
import { getOrCreateWorkspaceId } from "../auth/workspace-id";
import { CLIResolver } from "../cli";
import { TelemetryProxy } from "../services/telemetry-proxy";
import {
	type AIClientConfig,
	detectAIClients,
	getVrekoMCPConfig,
	removeVrekoConfig,
	repairClientConfig,
	type ValidationResult,
	validateClientConfig,
	writeClientConfig,
} from "../types/mcp-config";
import { logger } from "../utils/logger";

// Module-level instances
let telemetryProxy: TelemetryProxy | null = null;

// =============================================================================
// TYPES
// =============================================================================

/**
 * Result status for each client during configuration
 * Must match CLI's ToolsConfigureJsonResult
 */
type ClientConfigStatus = "configured" | "already_configured" | "not_installed" | "failed" | "skipped";

/**
 * JSON output from `vreko tools configure --json`
 * Must match CLI's ToolsConfigureJsonResult interface
 */
interface ToolsConfigureJsonResult {
	success: boolean;
	clients: Record<string, ClientConfigStatus>;
	configured: string[];
	skipped: string[];
	notInstalled: string[];
	failed: string[];
	version: string;
	error?: string;
}

/**
 * Stored MCP configuration result in globalState
 */
export interface MCPConfigurationState {
	lastConfigured: number;
	result: ToolsConfigureJsonResult;
	workspaceRoot?: string;
}

// =============================================================================
// AUTO-CONFIGURE
// =============================================================================

/**
 * Auto-configure MCP for detected AI assistants
 *
 * Spawns CLI subprocess with --non-interactive --json flags and parses result.
 * The CLI handles all detection and configuration logic.
 *
 * @param context - VS Code extension context
 */
export async function autoConfigureMCP(context: vscode.ExtensionContext): Promise<void> {
	// Initialize telemetry first to ensure all MCP events are tracked
	initializeTelemetry(context);

	const config = vscode.workspace.getConfiguration("vreko");

	// Check if auto-configure is disabled by user preference
	if (!config.get<boolean>("mcp.autoEnable", true)) {
		logger.debug("[MCP] Auto-configure disabled in settings");
		return;
	}

	// Check if we've already configured (idempotent)
	// But re-validate first  -  the flag can go stale after a Node.js/CLI version switch,
	// Homebrew update, or NVM change that moves the binary to a different path.
	const hasConfigured = context.globalState.get<boolean>("mcp.configured");
	if (hasConfigured) {
		const workspaceFolderForValidation = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
		const existingDetection = detectAIClients({ cwd: workspaceFolderForValidation });
		const configuredClients = existingDetection.clients.filter((c) => c.hasVreko);

		const anyBroken = configuredClients.some((c) => {
			const v = validateClientConfig(c);
			return !v.valid || v.issues.some((i) => i.severity === "error");
		});

		if (!anyBroken) {
			logger.debug("[MCP] Already configured and validation passed, skipping auto-configure");
			return;
		}

		// Config is broken  -  clear the flag and fall through to re-configure
		logger.warn("[MCP] mcp.configured flag set but validation failed  -  clearing and re-running auto-configure");
		await context.globalState.update("mcp.configured", undefined);
	}

	try {
		// Resolve CLI binary path
		const resolver = new CLIResolver();
		const resolution = await resolver.resolve();

		if (resolution.status !== "found" || !resolution.binaryPath) {
			logger.warn("[MCP] CLI binary not found, skipping auto-configure", {
				status: resolution.status,
				error: resolution.error,
			});
			trackTelemetry("mcp_auto_configure_cli_not_found", {
				status: resolution.status,
			});
			return;
		}

		logger.debug("[MCP] CLI resolved", {
			binaryPath: resolution.binaryPath,
			version: resolution.version,
			installMethod: resolution.installMethod,
		});

		// Get workspace folder for CLI context
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

		// Spawn CLI subprocess
		const result = await spawnCLIConfigure(resolution.binaryPath, workspaceFolder);

		// Store result in globalState for display purposes
		const state: MCPConfigurationState = {
			lastConfigured: Date.now(),
			result,
			workspaceRoot: workspaceFolder,
		};
		await context.globalState.update("mcp.configuration", state);

		// Handle result
		if (result.success) {
			if (result.configured.length > 0) {
				logger.info("[MCP] Auto-configure completed", {
					configured: result.configured,
					skipped: result.skipped,
					notInstalled: result.notInstalled,
				});

				// Build agent-specific message with per-agent restart instructions
				const { toast, restartLines } = buildAgentConfigResultMessage(result.configured);

				setTimeout(() => {
					vscode.window
						.showInformationMessage(toast, "Restart Instructions", "Learn More")
						.then((selection) => {
							if (selection === "Restart Instructions" && restartLines.length > 0) {
								// Show per-agent restart instructions in a second notification
								vscode.window.showInformationMessage(
									`To activate Vreko in each tool:\n${restartLines.join("\n")}`,
									"Got it",
								);
							} else if (selection === "Learn More") {
								vscode.env.openExternal(vscode.Uri.parse("https://vreko.dev/docs/mcp"));
							}
						});
				}, 2000);

				trackTelemetry("mcp_auto_configure_success", {
					configured: result.configured,
					skipped: result.skipped,
					notInstalled: result.notInstalled,
				});
			} else if (result.skipped.length > 0) {
				logger.debug("[MCP] All detected clients already configured");
				trackTelemetry("mcp_auto_configure_already_setup", {
					clients: result.skipped,
				});
			} else {
				logger.debug("[MCP] No AI clients detected");
				trackTelemetry("mcp_auto_configure_no_clients", {});
			}

			// Mark as configured
			await context.globalState.update("mcp.configured", true);
		} else {
			logger.warn("[MCP] Auto-configure failed", {
				error: result.error,
				failed: result.failed,
			});

			// Show failure toast only if all failed
			if (result.configured.length === 0 && result.failed.length > 0) {
				setTimeout(() => {
					vscode.window
						.showWarningMessage(
							"⚠️ Failed to configure MCP for AI assistants",
							"Fix Now",
							"Diagnose",
							"Ignore",
						)
						.then((selection) => {
							if (selection === "Fix Now") {
								vscode.commands.executeCommand("vreko.mcp.repair");
							} else if (selection === "Diagnose") {
								vscode.commands.executeCommand("vreko.doctor");
							}
						});
				}, 3000);
			}

			trackTelemetry("mcp_auto_configure_error", {
				error: result.error,
				failed: result.failed,
			});
		}
	} catch (error) {
		logger.error("[MCP] Auto-configure failed", error instanceof Error ? error : undefined);
		trackTelemetry("mcp_auto_configure_error", {
			error: error instanceof Error ? error.message : "Unknown error",
		});
		// Fail silently - don't interrupt user workflow
	}
}

/**
 * Agent-specific restart instructions, confirmed against official MCP documentation.
 *
 * Claude Desktop: restart required (config loaded on startup)
 * Cursor: restart required (reads config at launch)
 * Windsurf: restart required (no project-level support, global only)
 * Continue: reload VS Code window to reload the extension
 * VS Code: reload window via Developer: Reload Window
 * Zed: restart required
 * Cline: reload VS Code window (VS Code extension)
 * Roo Code: reload VS Code window (VS Code extension)
 * Gemini: restart CLI session
 * Aider: no restart needed  -  picks up config on next run
 * Qoder: restart required
 *
 * @see https://modelcontextprotocol.io/docs/develop/connect-local-servers
 */
export const AGENT_RESTART_INSTRUCTIONS: Record<string, string> = {
	claude: "Quit and restart Claude Desktop for the changes to take effect.",
	cursor: "Restart Cursor (File → Restart…) to activate Vreko.",
	windsurf: "Restart Windsurf to activate Vreko.",
	continue: "Reload your VS Code window (⌘⇧P → Developer: Reload Window) to activate Continue's MCP.",
	vscode: "Reload your VS Code window (⌘⇧P → Developer: Reload Window) to activate the MCP server.",
	zed: "Restart Zed to activate Vreko.",
	cline: "Reload your VS Code window (⌘⇧P → Developer: Reload Window) to activate Cline's MCP.",
	"roo-code": "Reload your VS Code window (⌘⇧P → Developer: Reload Window) to activate Roo Code's MCP.",
	gemini: "Start a new Gemini CLI session to activate Vreko.",
	aider: "Aider will pick up the Vreko configuration automatically on the next run.",
	qoder: "Restart Qoder to activate Vreko.",
};

/**
 * Build a human-readable per-agent summary after auto-configure completes.
 *
 * Returns:
 * - A toast message summarising what was configured
 * - An ordered list of agent-specific restart instructions
 *
 * Exported for unit testing.
 */
export function buildAgentConfigResultMessage(configured: string[]): {
	toast: string;
	restartLines: string[];
} {
	if (configured.length === 0) {
		return { toast: "🦎 Vreko configured successfully.", restartLines: [] };
	}

	const agentList = configured.join(", ");
	const toast =
		configured.length === 1
			? `🦎 Vreko is now protecting your ${configured[0]} sessions`
			: `🦎 Vreko is now protecting ${configured.length} AI assistants: ${agentList}`;

	const restartLines = configured
		.map((agent) => {
			const key = agent.toLowerCase().replace(/\s+/g, "-");
			const instruction = AGENT_RESTART_INSTRUCTIONS[key];
			return instruction ? `${agent}: ${instruction}` : `${agent}: Restart to activate Vreko.`;
		})
		.filter(Boolean);

	return { toast, restartLines };
}

async function spawnCLIConfigure(binaryPath: string, workspaceFolder?: string): Promise<ToolsConfigureJsonResult> {
	return new Promise((resolve) => {
		const args = ["tools", "configure", "--non-interactive", "--json"];

		// Add workspace if available
		if (workspaceFolder) {
			args.push("--workspace", workspaceFolder);
		}

		logger.debug("[MCP] Spawning CLI subprocess", {
			binaryPath,
			args,
		});

		const child = spawn(binaryPath, args, {
			env: { ...process.env, MCP_QUIET: "1" },
			stdio: ["ignore", "pipe", "pipe"],
		});

		let stdout = "";
		let stderr = "";

		child.stdout?.on("data", (data: Buffer) => {
			stdout += data.toString();
		});

		child.stderr?.on("data", (data: Buffer) => {
			stderr += data.toString();
		});

		child.on("close", (code) => {
			if (code !== 0) {
				logger.warn("[MCP] CLI subprocess exited with non-zero code", {
					code,
					stderr: stderr.slice(0, 500),
				});
			}

			// Parse JSON output
			try {
				// Find JSON in output (CLI might output other text before JSON)
				const jsonMatch = stdout.match(/\{[\s\S]*\}/);
				if (jsonMatch) {
					const result = JSON.parse(jsonMatch[0]) as ToolsConfigureJsonResult;
					resolve(result);
				} else {
					resolve({
						success: false,
						clients: {},
						configured: [],
						skipped: [],
						notInstalled: [],
						failed: [],
						version: "0.0.0",
						error: `No JSON output from CLI: ${stdout.slice(0, 200)}`,
					});
				}
			} catch (parseError) {
				resolve({
					success: false,
					clients: {},
					configured: [],
					skipped: [],
					notInstalled: [],
					failed: [],
					version: "0.0.0",
					error: `Failed to parse CLI output: ${parseError instanceof Error ? parseError.message : "Unknown error"}`,
				});
			}
		});

		child.on("error", (error) => {
			logger.error("[MCP] CLI subprocess error", error);
			resolve({
				success: false,
				clients: {},
				configured: [],
				skipped: [],
				notInstalled: [],
				failed: [],
				version: "0.0.0",
				error: error.message,
			});
		});

		// Set timeout for CLI execution
		setTimeout(() => {
			child.kill();
			resolve({
				success: false,
				clients: {},
				configured: [],
				skipped: [],
				notInstalled: [],
				failed: [],
				version: "0.0.0",
				error: "CLI subprocess timed out",
			});
		}, 30000); // 30 second timeout
	});
}

/**
 * Get stored MCP configuration state
 */
export function getMCPConfigurationState(context: vscode.ExtensionContext): MCPConfigurationState | undefined {
	return context.globalState.get<MCPConfigurationState>("mcp.configuration");
}

/**
 * Get stored API key from secure storage
 */
async function getStoredApiKey(context: vscode.ExtensionContext): Promise<string | undefined> {
	try {
		const secrets = context.secrets;
		return await secrets.get("vreko.apiKey");
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
		vscode.commands.registerCommand("vreko.mcp.configure", async () => {
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
				description: client.hasVreko ? "✓ Configured" : "Not configured",
				picked: !client.hasVreko,
				client,
			}));

			const selected = await vscode.window.showQuickPick(items, {
				canPickMany: true,
				placeHolder: "Select AI assistants to configure",
			});

			if (!selected || selected.length === 0) {
				return;
			}

			const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
			const workspaceIdResult = await getOrCreateWorkspaceId(context.secrets);

			for (const item of selected) {
				// Generate config per-client to use correct transport (stdio for Claude Desktop, HTTP for others)
				const mcpConfig = getVrekoMCPConfig({
					workspaceId: workspaceIdResult.workspaceId,
					workspaceRoot,
					client: item.client.format, // Pass client format for transport selection
				});
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
		vscode.commands.registerCommand("vreko.mcp.status", async () => {
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
			const detection = detectAIClients({ cwd: workspaceFolder });

			// Deduplicate clients by name, prioritizing project-level configs
			// This prevents showing "Cursor: Not installed" AND "Cursor: Active" simultaneously
			const clientsByName = new Map<string, (typeof detection.clients)[0]>();
			for (const client of detection.clients) {
				const existing = clientsByName.get(client.name);
				if (!existing) {
					// First entry for this client
					clientsByName.set(client.name, client);
				} else {
					// Prefer: exists > not exists, hasVreko > no vreko
					// Priority: Active > Needs setup > Not installed
					const existingScore = (existing.exists ? 2 : 0) + (existing.hasVreko ? 1 : 0);
					const clientScore = (client.exists ? 2 : 0) + (client.hasVreko ? 1 : 0);
					if (clientScore > existingScore) {
						clientsByName.set(client.name, client);
					}
				}
			}

			const deduplicatedClients = Array.from(clientsByName.values());

			// Define QuickPick item interface with action handler
			interface MCPStatusQuickPickItem extends vscode.QuickPickItem {
				client: (typeof detection.clients)[0];
				state: "active" | "needs-setup" | "not-installed";
				action: () => Promise<void>;
			}

			const items: MCPStatusQuickPickItem[] = deduplicatedClients.map((client) => {
				let status = "⚪ Not installed";
				let description = "Click to learn how to install";
				let state: "active" | "needs-setup" | "not-installed" = "not-installed";

				if (client.exists && client.hasVreko) {
					status = "🟢 Active";
					description = "Click to validate or reconfigure";
					state = "active";
				} else if (client.exists) {
					status = "🟡 Needs setup";
					description = "Click to configure Vreko";
					state = "needs-setup";
				}

				return {
					label: `${client.displayName}: ${status}`,
					description,
					client,
					state,
					action: async () => {
						switch (state) {
							case "active": {
								// For active clients, offer validation or reconfiguration
								const validation = validateClientConfig(client);
								if (validation.valid && validation.issues.length === 0) {
									const choice = await vscode.window.showInformationMessage(
										`✓ ${client.displayName} is properly configured`,
										"Open Config",
										"Reconfigure",
										"Done",
									);
									if (choice === "Open Config" && client.configPath) {
										const uri = vscode.Uri.file(client.configPath);
										await vscode.window.showTextDocument(uri);
									} else if (choice === "Reconfigure") {
										await vscode.commands.executeCommand("vreko.mcp.configure");
									}
								} else {
									// Show issues and offer to repair
									const issueList = validation.issues
										.map((i) => `${i.severity}: ${i.message}`)
										.join("\n");
									const choice = await vscode.window.showWarningMessage(
										`${client.displayName} has issues:\n${issueList}`,
										"Repair Now",
										"Ignore",
									);
									if (choice === "Repair Now") {
										await vscode.commands.executeCommand("vreko.mcp.repair");
									}
								}
								break;
							}
							case "needs-setup": {
								// Directly configure this specific client
								const apiKey = await getStoredApiKey(context);
								const workspaceIdResult = await getOrCreateWorkspaceId(context.secrets);
								const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
								// Generate config for this client with correct transport
								const mcpConfig = getVrekoMCPConfig({
									apiKey,
									workspaceId: workspaceIdResult.workspaceId,
									workspaceRoot,
									client: client.format, // Pass client format for transport selection
								});

								const result = writeClientConfig(client, mcpConfig);
								if (result.success) {
									vscode.window.showInformationMessage(
										`✓ Configured ${client.displayName}. Restart your AI assistant to apply.`,
									);
									trackTelemetry("mcp_status_quick_configure", { client: client.name });
								} else {
									vscode.window.showErrorMessage(
										`Failed to configure ${client.displayName}: ${result.error}`,
									);
								}
								break;
							}
							case "not-installed": {
								// Show installation instructions
								const installUrls: Record<string, string> = {
									claude: "https://claude.ai/download",
									cursor: "https://cursor.sh",
									windsurf: "https://codeium.com/windsurf",
									continue: "https://continue.dev",
									qoder: "https://qodo.ai",
									cline: "https://github.com/cline/cline",
									roo: "https://roo.dev",
								};
								const url =
									installUrls[client.name.toLowerCase()] || "https://vreko.dev/docs/integrations";
								const choice = await vscode.window.showInformationMessage(
									`${client.displayName} is not installed. Visit ${url} to download.`,
									"Open Download Page",
									"Cancel",
								);
								if (choice === "Open Download Page") {
									vscode.env.openExternal(vscode.Uri.parse(url));
								}
								break;
							}
						}
					},
				};
			});

			// Add separator and utility actions
			const utilityItems: MCPStatusQuickPickItem[] = [
				{
					label: "$(gear) Configure All...",
					description: "Open the full MCP configuration wizard",
					client: {} as (typeof detection.clients)[0],
					state: "active",
					kind: vscode.QuickPickItemKind.Separator,
					action: async () => {
						await vscode.commands.executeCommand("vreko.mcp.configure");
					},
				},
				{
					label: "$(gear) Configure All Assistants",
					description: "Open the full MCP configuration wizard",
					client: {} as (typeof detection.clients)[0],
					state: "active",
					action: async () => {
						await vscode.commands.executeCommand("vreko.mcp.configure");
					},
				},
				{
					label: "$(debug-start) Validate All Configurations",
					description: "Check all MCP configurations for issues",
					client: {} as (typeof detection.clients)[0],
					state: "active",
					action: async () => {
						await vscode.commands.executeCommand("vreko.mcp.validate");
					},
				},
				{
					label: "$(tools) Repair Configurations",
					description: "Fix any detected MCP configuration issues",
					client: {} as (typeof detection.clients)[0],
					state: "active",
					action: async () => {
						await vscode.commands.executeCommand("vreko.mcp.repair");
					},
				},
			];

			const allItems = [...items, ...utilityItems];

			// Create QuickPick with proper selection handling
			const quickPick = vscode.window.createQuickPick<MCPStatusQuickPickItem>();
			quickPick.title = "🔌 Vreko MCP Status";
			quickPick.placeholder = "Select an AI assistant to configure or manage";
			quickPick.items = allItems;
			quickPick.matchOnDescription = true;

			// Handle selection - execute the action
			quickPick.onDidAccept(async () => {
				const selected = quickPick.selectedItems[0];
				if (selected?.action) {
					quickPick.hide();
					await selected.action();
				}
			});

			quickPick.onDidHide(() => quickPick.dispose());
			quickPick.show();
		}),
	);

	// Command: Disable MCP for a client
	context.subscriptions.push(
		vscode.commands.registerCommand("vreko.mcp.disable", async () => {
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
			const detection = detectAIClients({ cwd: workspaceFolder });
			const configured = detection.detected.filter((c) => c.hasVreko);

			if (configured.length === 0) {
				vscode.window.showInformationMessage("Vreko MCP is not configured for any AI assistants.");
				return;
			}

			const selected = await vscode.window.showQuickPick(
				configured.map((c) => ({ label: c.displayName, client: c })),
				{ placeHolder: "Select AI assistant to disable Vreko for" },
			);

			if (!selected) {
				return;
			}

			const result = removeVrekoConfig(selected.client);
			if (result.success) {
				vscode.window.showInformationMessage(
					`✓ Disabled Vreko for ${selected.client.displayName}. Restart your AI assistant to apply.`,
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
		vscode.commands.registerCommand("vreko.mcp.reset", async () => {
			await context.globalState.update("mcp.configured", undefined);
			vscode.window.showInformationMessage("MCP configuration state reset. Restart VS Code to re-trigger setup.");
		}),
	);

	// Command: Validate MCP configurations
	context.subscriptions.push(
		vscode.commands.registerCommand("vreko.mcp.validate", async () => {
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
			const detection = detectAIClients({ cwd: workspaceFolder });
			const configured = detection.detected.filter((c) => c.hasVreko);

			if (configured.length === 0) {
				vscode.window.showInformationMessage("No AI assistants with Vreko configured.");
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
						const vrekoConfig = config.mcpServers?.vreko;

						if (vrekoConfig?.args) {
							const workspaceArg = vrekoConfig.args.find(
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
					"This can cause Vreko to activate on wrong workspaces.\n\n" +
					`Issues:\n${workspacePathIssues.join("\n")}`;

				const selection = await vscode.window.showWarningMessage(message, "Fix Now", "Learn More", "Ignore");

				if (selection === "Fix Now") {
					vscode.commands.executeCommand("vreko.mcp.repair");
				} else if (selection === "Learn More") {
					vscode.env.openExternal(
						vscode.Uri.parse("https://docs.vreko.dev/troubleshooting/mcp-workspace-isolation"),
					);
				}

				// Status bar consolidated into MCPStatusItem.ts
				trackTelemetry("mcp_validate_workspace_path_issues", {
					count: workspacePathIssues.length,
				});
				return;
			}

			// Show results
			if (!hasErrors && !hasWarnings) {
				vscode.window.showInformationMessage(`✓ All ${configured.length} MCP configuration(s) are valid!`);
				// Status bar consolidated into MCPStatusItem.ts
				trackTelemetry("mcp_validate_success", { count: configured.length });
			} else {
				// Build details message
				const issues: string[] = [];
				for (const { client, validation } of validationResults) {
					for (const issue of validation.issues.filter((i: { severity: string }) => i.severity !== "info")) {
						issues.push(`${client.displayName}: ${issue.message}`);
					}
				}

				const message = hasErrors
					? `✗ Found ${issues.length} issue(s) in MCP configurations`
					: `⚠ Found ${issues.length} warning(s) in MCP configurations`;

				const selection = await vscode.window.showWarningMessage(message, "Fix Now", "Show Details", "Ignore");

				if (selection === "Fix Now") {
					vscode.commands.executeCommand("vreko.mcp.repair");
				} else if (selection === "Show Details") {
					// Show issues in output channel or quick pick
					const items = issues.map((issue) => ({ label: issue }));
					vscode.window.showQuickPick(items, {
						placeHolder: "MCP Configuration Issues",
						canPickMany: false,
					});
				}

				// Status bar consolidated into MCPStatusItem.ts
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
		vscode.commands.registerCommand("vreko.mcp.repair", async () => {
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
			const detection = detectAIClients({ cwd: workspaceFolder });
			const configured = detection.detected.filter((c) => c.hasVreko);

			if (configured.length === 0) {
				vscode.window.showInformationMessage(
					"No AI assistants with Vreko configured. Run 'Vreko: Configure MCP' first.",
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
				// Status bar consolidated into MCPStatusItem.ts
				return;
			}

			// Get workspace root
			const _workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

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

						const result = repairClientConfig(client);

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
						// Status bar consolidated into MCPStatusItem.ts
					} else if (repaired > 0) {
						vscode.window.showWarningMessage(
							`Repaired ${repaired} configuration(s), ${failed} failed. Restart your AI assistant.`,
						);
						// Status bar consolidated into MCPStatusItem.ts
					} else {
						vscode.window.showErrorMessage(
							`Failed to repair configurations. Try 'Vreko: Configure MCP' instead.`,
						);
						// Status bar consolidated into MCPStatusItem.ts
					}

					trackTelemetry("mcp_repair_complete", { repaired, failed });
				},
			);
		}),
	);

	// NOTE: MCP status bar is now handled by MCPStatusItem.ts (consolidated)
	// Remove duplicate status bar initialization
}

// NOTE: MCP Status Bar has been consolidated into MCPStatusItem.ts
// The following functions are kept for reference but the status bar initialization
// has been removed to eliminate duplicate status bar items.

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
