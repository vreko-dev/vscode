import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import * as fs from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { getDefaultSocketPath } from "@vreko/local-service-client";
import { glob } from "fast-glob";
import * as vscode from "vscode";
import { COMMANDS } from "../constants/index";
import { ConfigDetector, type IFileSystemProvider } from "../types/oss-sdk";
import { logger } from "../utils/logger";
import type { CommandContext } from "./types";
import { UpdateConfigurationCommand } from "./updateConfiguration";

/**
 * Node.js file system adapter for SDK ConfigDetector
 */
const nodeFileSystemProvider: IFileSystemProvider = {
	async glob(patterns: string[], cwd: string, options?: { ignore?: string[] }): Promise<string[]> {
		return glob(patterns, { cwd, ignore: options?.ignore });
	},
	async readFile(filePath: string): Promise<string> {
		return fs.readFile(filePath, "utf-8");
	},
};

export function registerUtilityCommands(_context: vscode.ExtensionContext, ctx: CommandContext): vscode.Disposable[] {
	const disposables: vscode.Disposable[] = [];

	// Note: vreko.showStatus command moved to statusBarCommands.ts for enhanced UX
	// Note: vreko.testMCPFederation moved to mcpCommands.ts

	disposables.push(
		vscode.commands.registerCommand(COMMANDS.UTILITY.INITIALIZE, async () => {
			const { message } = await ctx.getProtectionStateSummary();
			vscode.window.showInformationMessage(`🦎 Vreko: Protection initialized  -  ${message}`);
		}),
	);

	disposables.push(
		vscode.commands.registerCommand("vreko.updateConfiguration", async () => {
			const configDetector = new ConfigDetector(ctx.workspaceRoot, nodeFileSystemProvider);
			const updateCommand = new UpdateConfigurationCommand(ctx.workspaceRoot, configDetector);
			await updateCommand.execute();
		}),
	);

	// =============================================================================
	// Settings Commands
	// =============================================================================

	disposables.push(
		vscode.commands.registerCommand(COMMANDS.UTILITY.OPEN_SETTINGS, async () => {
			await vscode.commands.executeCommand("workbench.action.openSettings", "@ext:vreko.vreko");
		}),
	);

	disposables.push(
		vscode.commands.registerCommand(COMMANDS.UTILITY.REPORT_ISSUE, async () => {
			await vscode.env.openExternal(vscode.Uri.parse("https://github.com/marcellelabs/vreko/issues/new"));
		}),
	);

	disposables.push(
		vscode.commands.registerCommand("vreko.viewChangelog", async () => {
			await vscode.env.openExternal(
				vscode.Uri.parse("https://github.com/marcellelabs/vreko/blob/main/apps/vscode/CHANGELOG.md"),
			);
		}),
	);

	// =============================================================================
	// Hint/Nudge Commands (used by AdaptiveHintManager)
	// These are placeholder implementations that delegate to existing functionality
	// =============================================================================

	disposables.push(
		vscode.commands.registerCommand(COMMANDS.HINTS.SHOW_SESSIONS, async () => {
			// Delegate to session list command
			await vscode.commands.executeCommand(COMMANDS.SESSION.LIST);
		}),
	);

	disposables.push(
		vscode.commands.registerCommand(COMMANDS.HINTS.ANALYZE_SESSIONS, async () => {
			// Show session analysis - delegates to session browser
			await vscode.commands.executeCommand("vreko.showSessionBrowser");
		}),
	);

	disposables.push(
		vscode.commands.registerCommand(COMMANDS.HINTS.ADVANCED_RESTORE, async () => {
			// Delegate to the restore workflow
			await vscode.commands.executeCommand(COMMANDS.SNAPSHOT.RESTORE_LEGACY);
		}),
	);

	disposables.push(
		vscode.commands.registerCommand(COMMANDS.HINTS.PROFILE_PERFORMANCE, async () => {
			await vscode.window
				.showInformationMessage("🦎 Vreko: Performance Profiling", "View Diagnostics")
				.then((selection) => {
					if (selection === "View Diagnostics") {
						void vscode.commands.executeCommand("vreko.service.diagnose");
					}
				});
		}),
	);

	// =============================================================================
	// Workflow Commands (used by WorkflowIntegration)
	// =============================================================================

	disposables.push(
		vscode.commands.registerCommand(COMMANDS.WORKFLOW.VIEW_CHANGES, async () => {
			// Show the diff view for recent changes
			await vscode.commands.executeCommand(COMMANDS.SNAPSHOT.COMPARE);
		}),
	);

	disposables.push(
		vscode.commands.registerCommand(COMMANDS.WORKFLOW.UNDO_SUGGESTION, async () => {
			// Undo the last applied suggestion by restoring the previous snapshot
			await vscode.commands.executeCommand(COMMANDS.SNAPSHOT.RESTORE_LEGACY);
		}),
	);

	// =============================================================================
	// File Commands (used by tree views)
	// =============================================================================

	disposables.push(
		vscode.commands.registerCommand(COMMANDS.FILE.OPEN_FILE, async (uri: vscode.Uri | string) => {
			const fileUri = typeof uri === "string" ? vscode.Uri.file(uri) : uri;
			await vscode.commands.executeCommand("vscode.open", fileUri);
		}),
	);

	// =============================================================================
	// Diff Commands (legacy alias for backward compatibility)
	// =============================================================================

	disposables.push(
		vscode.commands.registerCommand(COMMANDS.DIFF.LEGACY_DIFF, async (snapshotId: string) => {
			// Redirect to the correct command
			await vscode.commands.executeCommand(COMMANDS.DIFF.SNAPSHOT_DIFF, snapshotId);
		}),
	);

	// Service diagnostics command - helps debug service startup issues
	disposables.push(
		vscode.commands.registerCommand("vreko.service.diagnose", async () => {
			const outputChannel = vscode.window.createOutputChannel("Vreko Daemon Diagnostics");
			outputChannel.show();

			outputChannel.appendLine("=== Vreko Daemon Diagnostics ===");
			outputChannel.appendLine("");

			// Check CLI path
			const workspaceFolders = vscode.workspace.workspaceFolders;
			let cliPath: string | null = null;

			// Priority 1: Local dev CLI
			if (workspaceFolders && workspaceFolders.length > 0) {
				for (const folder of workspaceFolders) {
					const localCliPath = join(folder.uri.fsPath, "apps", "cli", "dist", "index.js");
					if (existsSync(localCliPath)) {
						cliPath = localCliPath;
						outputChannel.appendLine(`✓ Found local dev CLI: ${localCliPath}`);
						break;
					}
				}
			}

			if (!cliPath) {
				// Try global paths
				const possiblePaths = [
					join(homedir(), ".npm-global", "bin", "vreko"),
					join(homedir(), ".local", "share", "pnpm", "vreko"),
					"/usr/local/bin/vreko",
					"/opt/homebrew/bin/vreko",
				];

				for (const p of possiblePaths) {
					if (existsSync(p)) {
						cliPath = p;
						outputChannel.appendLine(`✓ Found global CLI: ${p}`);
						break;
					}
				}
			}

			if (!cliPath) {
				outputChannel.appendLine("✗ CLI not found in any expected location");
				outputChannel.appendLine("");
				outputChannel.appendLine("Install the CLI:");
				outputChannel.appendLine("  npm install -g @vreko/cli");
				outputChannel.appendLine("  or");
				outputChannel.appendLine("  pnpm install -g @vreko/cli");
				return;
			}

			outputChannel.appendLine("");
			outputChannel.appendLine("=== Socket Path ===");
			const socketPath = getDefaultSocketPath();
			outputChannel.appendLine(`Expected: ${socketPath}`);
			outputChannel.appendLine(`Exists: ${existsSync(socketPath)}`);
			outputChannel.appendLine("");

			outputChannel.appendLine("=== Starting Daemon in Foreground ===");
			outputChannel.appendLine("This will show service startup logs...");
			outputChannel.appendLine("");

			// Determine spawn command
			const isJsFile = cliPath.endsWith(".js");
			const spawnCommand = isJsFile ? process.execPath : cliPath;
			const spawnArgs = isJsFile
				? [cliPath, "service", "start"] // No --detach for foreground
				: ["service", "start"];

			outputChannel.appendLine(`Command: ${spawnCommand} ${spawnArgs.join(" ")}`);
			outputChannel.appendLine("");

			// Spawn service in foreground
			const child = spawn(spawnCommand, spawnArgs, {
				shell: false,
			});

			let hasOutput = false;

			child.stdout?.on("data", (data) => {
				hasOutput = true;
				outputChannel.append(data.toString());
			});

			child.stderr?.on("data", (data) => {
				hasOutput = true;
				outputChannel.append(`[stderr] ${data.toString()}`);
			});

			child.on("error", (err) => {
				outputChannel.appendLine("");
				outputChannel.appendLine(`✗ Spawn error: ${err.message}`);
				logger.error("Daemon diagnostic spawn failed", err);
			});

			child.on("exit", (code, signal) => {
				outputChannel.appendLine("");
				if (code === 0) {
					outputChannel.appendLine("✓ Daemon exited cleanly");
				} else if (code !== null) {
					outputChannel.appendLine(`✗ Daemon exited with code ${code}`);
				} else if (signal) {
					outputChannel.appendLine(`✗ Daemon terminated by signal ${signal}`);
				}

				if (!hasOutput) {
					outputChannel.appendLine("");
					outputChannel.appendLine("⚠️  No output captured - service may have crashed immediately");
				}
			});

			// Wait a few seconds then check socket
			setTimeout(() => {
				outputChannel.appendLine("");
				outputChannel.appendLine("=== Socket Check (after 5s) ===");
				outputChannel.appendLine(`Socket exists: ${existsSync(socketPath)}`);
				if (existsSync(socketPath)) {
					outputChannel.appendLine("✓ Socket created successfully.");
					outputChannel.appendLine("");
					outputChannel.appendLine("Next: Try connecting with netcat:");
					outputChannel.appendLine(`  nc -U ${socketPath}`);
				} else {
					outputChannel.appendLine("✗ Socket not created - check service output above for errors");
				}
			}, 5000);

			vscode.window.showInformationMessage(
				"Service diagnostics running - check output channel. Press Ctrl+C in terminal to stop service.",
			);
		}),
	);

	// Add other utility commands here

	return disposables;
}
