/**
 * @fileoverview Setup Commands
 *
 * Registers commands for setting up Vreko and its integrations.
 * Covers CLI installation, service control, authentication, workspace
 * initialization, and MCP tool configuration.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as vscode from "vscode";
import { CLIResolver } from "../cli/CLIResolver";
import { autoConfigureMCP } from "../mcp/auto-configure";
import { logger } from "../utils/logger";
import { registerCommandSafely } from "./types";

const execFileAsync = promisify(execFile);

async function spawnCLICommand(args: string[]): Promise<void> {
	const resolution = await new CLIResolver().resolve();
	if (resolution.status !== "found") {
		throw new Error("Vreko CLI not found");
	}
	await execFileAsync(resolution.binaryPath!, args);
}

/**
 * Register all setup-related commands
 *
 * Commands:
 * - vreko.setupClaudeDesktop: Configure Vreko for Claude Desktop
 * - vreko.installCLI: Install the Vreko CLI
 * - vreko.startDaemon: Start the Vreko service
 * - vreko.openAuth: Open authentication page
 * - vreko.initWorkspace: Initialize the current workspace
 * - vreko.configureMCP: Configure Vreko for an AI coding tool
 */
export function registerSetupCommands(context: vscode.ExtensionContext): vscode.Disposable[] {
	logger.info("Registering setup commands");

	const disposables: vscode.Disposable[] = [];

	// -------------------------------------------------------------------------
	// vreko.setupClaudeDesktop
	// -------------------------------------------------------------------------
	disposables.push(
		registerCommandSafely("vreko.setupClaudeDesktop", async () => {
			try {
				logger.info("Running Claude Desktop setup command");

				const terminal = vscode.window.createTerminal({
					name: "Vreko Setup",
					hideFromUser: false,
				});
				terminal.show();
				terminal.sendText("vreko tools configure --claude");

				const selection = await vscode.window.showInformationMessage(
					"Configuring Vreko for Claude Desktop. Restart Claude Desktop when complete.",
					"Open Docs",
				);

				if (selection === "Open Docs") {
					vscode.env.openExternal(vscode.Uri.parse("https://vreko.dev/docs/quick-start"));
				}

				logger.info("Claude Desktop setup command executed");
			} catch (error) {
				logger.error("Failed to setup Claude Desktop", error as Error);
				vscode.window.showErrorMessage(
					`Failed to setup Claude Desktop: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}),
	);

	// -------------------------------------------------------------------------
	// vreko.installCLI  -  injects install command directly into terminal,
	// tracks exit via Shell Integration API (VS Code 1.93+), then triggers
	// MCP auto-configure on success. Falls back to sendText if SI unavailable.
	// -------------------------------------------------------------------------
	disposables.push(
		registerCommandSafely("vreko.installCLI", async () => {
			const installCmd = "npm install -g @vreko/cli";

			const terminal = vscode.window.createTerminal({
				name: "Vreko Install",
				hideFromUser: false,
			});
			terminal.show();

			// Wait for Shell Integration to activate, then execute with exit tracking
			const siListener = vscode.window.onDidChangeTerminalShellIntegration(
				({ terminal: t, shellIntegration }) => {
					if (t !== terminal) {
						return;
					}
					siListener.dispose();
					clearTimeout(fallbackTimer);

					const execution = shellIntegration.executeCommand(installCmd);

					const execListener = vscode.window.onDidEndTerminalShellExecution((event) => {
						if (event.execution !== execution) {
							return;
						}
						execListener.dispose();

						if (event.exitCode === 0) {
							logger.info("[Setup] CLI installed successfully, triggering MCP auto-configure");
							// Start agent configuration immediately  -  do NOT wait for the toast to be dismissed
							autoConfigureMCP(context);
							vscode.window.showInformationMessage(
								"Vreko CLI installed! Configuring your AI tools now...",
							);
						} else {
							logger.error(`[Setup] CLI install failed with exit code ${event.exitCode ?? "unknown"}`);
							vscode.window.showErrorMessage(
								`CLI install failed (exit ${event.exitCode ?? "unknown"}). Check the terminal for details.`,
							);
						}
					});
				},
			);

			// Fallback: sendText if Shell Integration doesn't activate within 3s
			const fallbackTimer = setTimeout(() => {
				siListener.dispose();
				if (!terminal.shellIntegration) {
					logger.warn("[Setup] Shell integration unavailable, falling back to sendText");
					terminal.sendText(installCmd);
				}
			}, 3000);
		}),
	);

	// -------------------------------------------------------------------------
	// vreko.startDaemon  -  spawns service via CLI; gate clears on reconnect
	// -------------------------------------------------------------------------
	disposables.push(
		registerCommandSafely("vreko.startDaemon", async () => {
			try {
				await spawnCLICommand(["service", "start", "--detach"]);
			} catch (err) {
				vscode.window.showErrorMessage(`Failed to start Vreko service: ${err}`);
			}
		}),
	);

	// -------------------------------------------------------------------------
	// vreko.openAuth  -  opens the authentication page in the browser
	// -------------------------------------------------------------------------
	disposables.push(
		registerCommandSafely("vreko.openAuth", async () => {
			await vscode.env.openExternal(vscode.Uri.parse("https://auth.vreko.dev"));
		}),
	);

	// -------------------------------------------------------------------------
	// vreko.initWorkspace  -  runs CLI init for the current workspace root
	// -------------------------------------------------------------------------
	disposables.push(
		registerCommandSafely("vreko.initWorkspace", async () => {
			const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
			if (!workspaceRoot) {
				vscode.window.showErrorMessage("No workspace folder open.");
				return;
			}
			try {
				await vscode.window.withProgress(
					{ location: vscode.ProgressLocation.Notification, title: "Initializing Vreko workspace..." },
					async () => {
						await spawnCLICommand(["init", "--workspace", workspaceRoot]);
					},
				);
				vscode.window.showInformationMessage("Vreko workspace initialized successfully.");
			} catch (err) {
				logger.error("[Setup] Failed to initialize workspace", err as Error);
				vscode.window.showErrorMessage(
					`Failed to initialize workspace: ${err instanceof Error ? err.message : String(err)}`,
				);
			}
		}),
	);

	// NOTE: vreko.mcp.configure is registered in mcp/auto-configure.ts
	// Do NOT re-register here to avoid "already registered" error at runtime.

	context.subscriptions.push(...disposables);
	logger.debug("Setup commands registered");

	return disposables;
}
