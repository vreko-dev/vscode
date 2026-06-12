/**
 * VS Code Init Command
 *
 * Thin-client wrapper around CLI `vreko init`.
 * Calls CLI via execFileAsync with --yes --non-interactive --json flags.
 * Stores results in context.globalState for other commands to reference.
 *
 * @see docs/plans/cli-refactor/vreko_init_doctor.md §1.7
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as vscode from "vscode";
import { CLIResolver } from "../cli/CLIResolver";

const execFileAsync = promisify(execFile);

/**
 * Init JSON result type (matches CLI output)
 * This is the contract between CLI and extension
 */
export interface InitJsonResult {
	success: boolean;
	version: string;
	timestamp: string;
	workspace: {
		path: string;
		alreadyInitialized: boolean;
		reinitialized: boolean;
	};
	detection: {
		stack: string[];
		fileCount: number;
		hasGit: boolean;
	};
	configuration: {
		configPath: string;
		gitignoreUpdated: boolean;
	};
	service: {
		registered: boolean;
		workspaceId?: string;
	};
	mcp: {
		detected: string[];
		configured: string[];
		skipped: string[];
	};
	verification: {
		configValid: boolean;
		daemonResponsive: boolean;
	};
	errors: string[];
	error?: string;
}

/**
 * Register the vreko.init command
 *
 * This command initializes Vreko for the current workspace by:
 * 1. Resolving the CLI binary
 * 2. Calling `vreko init <workspace> --yes --non-interactive --json`
 * 3. Storing the result in globalState
 *
 * @param context - VS Code extension context
 */
export function registerInitCommand(context: vscode.ExtensionContext): vscode.Disposable {
	return vscode.commands.registerCommand("vreko.init", async () => {
		const resolver = new CLIResolver();
		const resolution = await resolver.resolve();

		if (resolution.status !== "found" || !resolution.binaryPath) {
			vscode.window.showErrorMessage("🦎 Vreko: CLI not found. Install with: npm install -g @vreko/cli");
			return;
		}

		const binaryPath = resolution.binaryPath; // TypeScript narrowing
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders || workspaceFolders.length === 0) {
			vscode.window.showErrorMessage("No workspace folder open.");
			return;
		}

		const workspacePath = workspaceFolders[0].uri.fsPath;

		await vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.Notification,
				title: "🦎 Vreko: Initializing...",
				cancellable: false,
			},
			async (progress) => {
				try {
					progress.report({ message: "Detecting workspace..." });

					const { stdout } = await execFileAsync(
						binaryPath,
						["init", workspacePath, "--yes", "--non-interactive", "--json"],
						{ timeout: 30000, maxBuffer: 1024 * 1024 },
					);

					const result = JSON.parse(stdout.trim()) as InitJsonResult;

					// Store in globalState for other commands to reference
					await context.globalState.update("init.result", result);
					await context.globalState.update("init.workspace", result.workspace.path);
					await context.globalState.update("init.stack", result.detection.stack);
					await context.globalState.update("init.timestamp", result.timestamp);

					if (result.workspace.alreadyInitialized && !result.workspace.reinitialized) {
						vscode.window.showInformationMessage("Workspace already initialized.");
					} else if (result.success) {
						const toolMsg =
							result.mcp.configured.length > 0
								? ` · ${result.mcp.configured.length} AI tools configured`
								: "";
						vscode.window.showInformationMessage(
							`🦎 Vreko: Initialized  -  ${result.detection.fileCount} files indexed${toolMsg}`,
						);

						// Suggest running doctor to verify
						const runDoctor = await vscode.window.showInformationMessage(
							"Run doctor to verify setup?",
							"Run Doctor",
							"Later",
						);
						if (runDoctor === "Run Doctor") {
							await vscode.commands.executeCommand("vreko.doctor");
						}
					} else {
						vscode.window.showWarningMessage(
							`Init completed with issues: ${result.error || result.errors.join(", ")}`,
						);
					}
				} catch (error) {
					const errorMessage = error instanceof Error ? error.message : "Unknown error";
					vscode.window.showErrorMessage(`Init failed: ${errorMessage}`);
				}
			},
		);
	});
}

/**
 * Get the last init result from globalState
 */
export function getInitResult(context: vscode.ExtensionContext): InitJsonResult | undefined {
	return context.globalState.get<InitJsonResult>("init.result");
}

/**
 * Check if workspace is initialized
 */
export function isWorkspaceInitialized(context: vscode.ExtensionContext): boolean {
	const result = getInitResult(context);
	return result?.success ?? false;
}
