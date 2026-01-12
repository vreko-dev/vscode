/**
 * @module cli-execution
 * @description CLI command execution utilities for running SnapBack CLI commands via VS Code terminal
 * 
 * This module handles execution of CLI commands using the optimal strategy determined by host-probe.
 * Commands are executed in a VS Code terminal so users can see progress and output.
 */

import * as vscode from "vscode";
import type { HostEnvironment } from "./host-probe";
import { logger } from "./logger";

// =============================================================================
// Terminal Management
// =============================================================================

/**
 * Track active CLI terminal to avoid creating multiple terminals
 */
let activeCliTerminal: vscode.Terminal | undefined;

/**
 * Get or create CLI terminal
 */
function getCliTerminal(commandName: string): vscode.Terminal {
	// Reuse existing terminal if still active
	if (activeCliTerminal && vscode.window.terminals.includes(activeCliTerminal)) {
		logger.info("[CliExecution] Reusing existing CLI terminal");
		return activeCliTerminal;
	}

	// Create new terminal
	logger.info("[CliExecution] Creating new CLI terminal", { commandName });
	activeCliTerminal = vscode.window.createTerminal({
		name: `SnapBack: ${commandName}`,
		iconPath: new vscode.ThemeIcon("shield"),
	});

	return activeCliTerminal;
}

// =============================================================================
// Command Execution
// =============================================================================

/**
 * Execute a CLI command using the optimal execution strategy
 * 
 * @param command - CLI command to execute (e.g., "init", "status", "protect")
 * @param env - Host environment information with execution strategy
 * @param args - Optional command arguments
 * @throws Error if execution strategy is unavailable
 */
export async function executeCLICommand(
	command: string,
	env: HostEnvironment,
	args: string[] = [],
): Promise<void> {
	if (env.strategy === "unavailable") {
		const error = new Error("Cannot execute CLI: Node.js or Bun required");
		logger.error("[CliExecution] Execution failed", error);
		throw error;
	}

	// Construct full command
	const argString = args.length > 0 ? ` ${args.join(" ")}` : "";
	const fullCommand = `${env.commandPrefix} ${command}${argString}`.trim();

	logger.info("[CliExecution] Executing CLI command", {
		command,
		args,
		strategy: env.strategy,
		fullCommand,
	});

	// Get or create terminal
	const terminal = getCliTerminal(command);

	// Show terminal (without stealing focus)
	terminal.show(false);

	// Execute command
	terminal.sendText(fullCommand, true);

	logger.info("[CliExecution] Command sent to terminal", { fullCommand });
}

/**
 * Execute "snapback init" command with optional flags
 */
export async function executeInitCommand(env: HostEnvironment, flags?: string[]): Promise<void> {
	return executeCLICommand("init", env, flags);
}

/**
 * Execute "snapback status" command
 */
export async function executeStatusCommand(env: HostEnvironment): Promise<void> {
	return executeCLICommand("status", env);
}

/**
 * Execute "snapback protect" command with file paths
 */
export async function executeProtectCommand(env: HostEnvironment, files?: string[]): Promise<void> {
	return executeCLICommand("protect", env, files);
}

/**
 * Dispose of the active CLI terminal
 */
export function disposeCliTerminal(): void {
	if (activeCliTerminal) {
		logger.info("[CliExecution] Disposing CLI terminal");
		activeCliTerminal.dispose();
		activeCliTerminal = undefined;
	}
}

// Clean up terminal on extension deactivation
vscode.window.onDidCloseTerminal((terminal) => {
	if (terminal === activeCliTerminal) {
		logger.info("[CliExecution] CLI terminal closed");
		activeCliTerminal = undefined;
	}
});
