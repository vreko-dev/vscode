/**
 * Configure Tools Command (VS Code)
 *
 * VS Code command palette integration for configuring AI tool identity.
 * Writes via service IPC, not direct file access.
 */

import * as vscode from "vscode";
import type { DaemonClient } from "../service-ipc/client.js";

const KNOWN_TOOLS = [
	{ value: "cursor", label: "Cursor", description: "Cursor IDE with apply model" },
	{ value: "claude-code", label: "Claude Code", description: "Anthropic's Claude with bash execution" },
	{ value: "github-copilot", label: "GitHub Copilot", description: "GitHub's AI pair programmer" },
	{ value: "windsurf", label: "Windsurf", description: "Codeium's Windsurf IDE" },
	{ value: "augment", label: "Augment Code", description: "Augment's AI coding assistant" },
	{ value: "devin", label: "Devin", description: "Cognition AI's autonomous agent" },
	{ value: "cline", label: "Cline", description: "VS Code extension with shell access" },
	{ value: "roocode", label: "RooCode", description: "Cline fork with enhanced features" },
	{ value: "aider", label: "Aider", description: "CLI-based AI pair programmer" },
];

export async function configureToolsCommand(daemonClient: DaemonClient): Promise<void> {
	// Get workspace folder
	const workspaceFolders = vscode.workspace.workspaceFolders;
	if (!workspaceFolders || workspaceFolders.length === 0) {
		vscode.window.showErrorMessage("No workspace folder open");
		return;
	}

	const workspace = workspaceFolders[0].uri.fsPath;

	// Check service health
	try {
		await daemonClient.request("health/ping", {});
	} catch (_error) {
		vscode.window.showErrorMessage("Vreko service not running. Start it with: vreko service start --detach");
		return;
	}

	// Get current tool identity
	let currentTool: string | undefined;
	try {
		const identity = await daemonClient.request<{ tool: string; confidence: number; source: string }>(
			"tool-identity/get",
			{ workspace },
		);
		if (identity && identity.source === "user-configured") {
			currentTool = identity.tool;
		}
	} catch {
		// No current configuration
	}

	// Show QuickPick
	const items = KNOWN_TOOLS.map((tool) => ({
		label: currentTool === tool.value ? `$(check) ${tool.label}` : tool.label,
		description: tool.description,
		value: tool.value,
	}));

	const selected = await vscode.window.showQuickPick(items, {
		placeHolder: "Select the AI tool you're using in this workspace",
		matchOnDescription: true,
	});

	if (!selected) {
		return; // User cancelled
	}

	// Write to service
	try {
		await daemonClient.request("tool-identity/configure", {
			workspace,
			tool: selected.value,
		});

		vscode.window.showInformationMessage(`Vreko configured to use ${selected.label}`);
	} catch (error) {
		vscode.window.showErrorMessage(`Failed to configure tool: ${error}`);
	}
}
