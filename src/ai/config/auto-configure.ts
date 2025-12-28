/**
 * @fileoverview Agent Rules Auto-Configuration
 *
 * Automatically injects SnapBack context rules into detected AI agent config files.
 * Runs during extension activation, similar to MCP auto-configure.
 *
 * @see mcp/auto-configure.ts for pattern reference
 */

import * as vscode from "vscode";
import { getInstalledAIAssistants } from "../../utils/AIPresenceDetector";
import { logger } from "../../utils/logger";
import { AgentConfigInjector, createNodeFileWriter } from "./index";
import type { InjectionResult } from "./types";

/**
 * Map SDK assistant names to config agent names
 */
const ASSISTANT_TO_AGENT: Record<string, string> = {
	CONTINUE: "Continue",
	WINDSURF: "Windsurf",
	// Cursor and Cline don't have specific extension IDs in SDK
	// but we detect them via their config file presence
};

/**
 * Additional agents to always check (common AI coding assistants)
 */
const COMMON_AGENTS = ["Cursor", "Cline"];

/**
 * Auto-configure agent rules for detected AI assistants
 *
 * Called during extension activation. Detects AI coding assistants
 * and offers to inject SnapBack context rules into their configs.
 */
export async function autoConfigureAgentRules(context: vscode.ExtensionContext): Promise<void> {
	const config = vscode.workspace.getConfiguration("snapback");

	// Check if auto-configure is enabled (default: true)
	const autoInjectEnabled = config.get<boolean>("ai.autoInjectRules", true);
	logger.info("[AgentRules] Auto-configure check", {
		autoInjectEnabled,
		hasWorkspace: !!vscode.workspace.workspaceFolders,
	});

	if (!autoInjectEnabled) {
		logger.debug("[AgentRules] Auto-inject disabled in settings");
		return;
	}

	// Check if we've already configured (don't re-prompt)
	const hasConfigured = context.globalState.get<boolean>("ai.rulesConfigured");
	logger.info("[AgentRules] Configuration state", { hasConfigured });

	if (hasConfigured) {
		logger.debug("[AgentRules] Already configured, skipping");
		return;
	}

	const workspaceFolders = vscode.workspace.workspaceFolders;
	if (!workspaceFolders || workspaceFolders.length === 0) {
		logger.debug("[AgentRules] No workspace folder open");
		return;
	}

	const workspaceRoot = workspaceFolders[0].uri.fsPath;

	try {
		// Detect installed AI assistants
		const installedAssistants = getInstalledAIAssistants();
		const agents = new Set<string>();

		logger.info("[AgentRules] Detected assistants", {
			installedAssistants,
			workspaceRoot,
		});

		// Map SDK assistants to agent names
		for (const assistant of installedAssistants) {
			const agentName = ASSISTANT_TO_AGENT[assistant];
			if (agentName) {
				agents.add(agentName);
			}
		}

		// Always check for common agents (Cursor, Cline)
		for (const agent of COMMON_AGENTS) {
			agents.add(agent);
		}

		if (agents.size === 0) {
			logger.info("[AgentRules] No AI agents detected");
			return;
		}

		logger.info("[AgentRules] Checking agents", { agents: Array.from(agents) });

		// Check which agents need configuration
		const injector = new AgentConfigInjector(createNodeFileWriter());
		const needsConfig: string[] = [];

		for (const agent of agents) {
			const configPath = injector.getConfigPathForAgent(agent, workspaceRoot);
			if (configPath) {
				const result = await injector.hasSnapBackInjection(configPath);
				if (!result.hasInjection) {
					needsConfig.push(agent);
				}
			}
		}

		if (needsConfig.length === 0) {
			logger.info("[AgentRules] All detected agents already configured", {
				agents: Array.from(agents),
			});
			await context.globalState.update("ai.rulesConfigured", true);
			return;
		}

		logger.info("[AgentRules] Agents needing configuration", { needsConfig });

		// Prompt user
		const agentNames = needsConfig.join(", ");
		const response = await vscode.window.showInformationMessage(
			`SnapBack detected ${agentNames}. Inject context rules for better AI assistance?`,
			"Inject Rules",
			"Not Now",
			"Never Ask",
		);

		if (response === "Never Ask") {
			await config.update("ai.autoInjectRules", false, vscode.ConfigurationTarget.Global);
			return;
		}

		if (response !== "Inject Rules") {
			return;
		}

		// Inject rules
		const results = await injectRulesWithProgress(injector, needsConfig, workspaceRoot);

		// Report results
		const successful = results.filter((r) => r.success && r.action !== "skipped");
		const failed = results.filter((r) => !r.success);

		if (successful.length > 0) {
			const names = successful.map((r) => r.agent).join(", ");
			vscode.window.showInformationMessage(
				`✓ SnapBack rules injected for ${names}. AI assistants will now read .snapback/ctx for context.`,
			);
		}

		if (failed.length > 0) {
			const names = failed.map((r) => r.agent).join(", ");
			vscode.window.showWarningMessage(`Could not inject rules for ${names}. Check file permissions.`);
		}

		// Mark as configured
		await context.globalState.update("ai.rulesConfigured", true);

		logger.info("[AgentRules] Auto-configuration complete", {
			successful: successful.length,
			failed: failed.length,
		});
	} catch (error) {
		logger.error("[AgentRules] Auto-configure failed", error instanceof Error ? error : undefined);
	}
}

/**
 * Inject rules with progress indicator
 */
async function injectRulesWithProgress(
	injector: AgentConfigInjector,
	agents: string[],
	workspaceRoot: string,
): Promise<InjectionResult[]> {
	return vscode.window.withProgress(
		{
			location: vscode.ProgressLocation.Notification,
			title: "Injecting SnapBack rules...",
			cancellable: false,
		},
		async (progress) => {
			const results: InjectionResult[] = [];

			for (const agent of agents) {
				progress.report({ message: `Configuring ${agent}...` });
				const result = await injector.injectForAgent(agent, { workspaceRoot });
				results.push(result);
			}

			return results;
		},
	);
}

/**
 * Register agent rules commands
 */
export function registerAgentRulesCommands(context: vscode.ExtensionContext): void {
	// Manual inject command
	context.subscriptions.push(
		vscode.commands.registerCommand("snapback.ai.injectRules", async () => {
			const workspaceFolders = vscode.workspace.workspaceFolders;
			if (!workspaceFolders) {
				vscode.window.showErrorMessage("No workspace folder open");
				return;
			}

			const workspaceRoot = workspaceFolders[0].uri.fsPath;
			const injector = new AgentConfigInjector(createNodeFileWriter());

			const agents = ["Cursor", "Cline", "Continue", "Windsurf"];
			const items = await Promise.all(
				agents.map(async (agent) => {
					const configPath = injector.getConfigPathForAgent(agent, workspaceRoot);
					const result = configPath
						? await injector.hasSnapBackInjection(configPath)
						: { hasInjection: false };
					return {
						label: agent,
						description: result.hasInjection ? `✓ Configured (v${result.version})` : "Not configured",
						picked: !result.hasInjection,
						agent,
					};
				}),
			);

			const selected = await vscode.window.showQuickPick(items, {
				canPickMany: true,
				placeHolder: "Select AI agents to configure with SnapBack rules",
			});

			if (!selected || selected.length === 0) {
				return;
			}

			const results = await injectRulesWithProgress(
				injector,
				selected.map((s) => s.agent),
				workspaceRoot,
			);

			const successful = results.filter((r) => r.success);
			if (successful.length > 0) {
				vscode.window.showInformationMessage(`✓ Configured ${successful.map((r) => r.agent).join(", ")}`);
			}
		}),
	);

	// Reset command
	context.subscriptions.push(
		vscode.commands.registerCommand("snapback.ai.resetRulesConfig", async () => {
			await context.globalState.update("ai.rulesConfigured", undefined);
			vscode.window.showInformationMessage("Agent rules configuration state reset.");
		}),
	);
}
