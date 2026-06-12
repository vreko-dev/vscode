/**
 * VS Code Doctor Command
 *
 * Thin-client wrapper around CLI `vreko doctor`.
 * Calls CLI via execFileAsync with --json flag.
 * Stores results in context.globalState for status bar and other consumers.
 *
 * @see docs/plans/cli-refactor/vreko_init_doctor.md §2.7
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as vscode from "vscode";
import { CLIResolver } from "../cli/CLIResolver";

const execFileAsync = promisify(execFile);

/**
 * Doctor check status type (matches CLI output)
 */
export type CheckStatus = "pass" | "warn" | "fail" | "skip";

/**
 * Doctor check result type (matches CLI output)
 */
export interface DoctorCheck {
	id: string;
	group: string;
	label: string;
	status: CheckStatus;
	detail?: string;
	fix?: string;
	fixCommand?: string;
}

/**
 * Doctor JSON result type (matches CLI output)
 * This is the contract between CLI and extension
 */
export interface DoctorJsonResult {
	success: boolean;
	version: string;
	timestamp: string;
	workspace: string | null;
	platform: {
		os: string;
		arch: string;
		nodeVersion: string;
		shell: string;
	};
	summary: {
		total: number;
		pass: number;
		warn: number;
		fail: number;
		skip: number;
	};
	checks: DoctorCheck[];
}

/**
 * Register the vreko.doctor command
 *
 * This command runs diagnostics on the Vreko installation by:
 * 1. Resolving the CLI binary
 * 2. Calling `vreko doctor --json`
 * 3. Displaying results in output channel
 * 4. Storing results in globalState
 *
 * @param context - VS Code extension context
 */
export function registerDoctorCommand(context: vscode.ExtensionContext): vscode.Disposable {
	return vscode.commands.registerCommand("vreko.doctor", async () => {
		const resolver = new CLIResolver();
		const resolution = await resolver.resolve();

		if (resolution.status !== "found" || !resolution.binaryPath) {
			vscode.window.showErrorMessage("🦎 Vreko: CLI not found. Install: npm install -g @vreko/cli");
			return;
		}

		const binaryPath = resolution.binaryPath; // TypeScript narrowing
		const outputChannel = vscode.window.createOutputChannel("Vreko Doctor");

		await vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.Notification,
				title: "🦎 Vreko: Running diagnostics...",
				cancellable: false,
			},
			async () => {
				try {
					const { stdout } = await execFileAsync(binaryPath, ["doctor", "--json"], {
						timeout: 30000,
						maxBuffer: 2 * 1024 * 1024,
					});

					const result = JSON.parse(stdout.trim()) as DoctorJsonResult;

					// Store for other commands to reference
					await context.globalState.update("doctor.result", result);
					await context.globalState.update("doctor.timestamp", new Date().toISOString());

					// Show in output channel
					outputChannel.clear();
					outputChannel.appendLine("Vreko Doctor Results");
					outputChannel.appendLine("=".repeat(40));
					outputChannel.appendLine("");

					// Group checks by category
					const groupedChecks = new Map<string, DoctorCheck[]>();
					for (const check of result.checks) {
						const group = groupedChecks.get(check.group) ?? [];
						group.push(check);
						groupedChecks.set(check.group, group);
					}

					// Display grouped results
					const groupLabels: Record<string, string> = {
						cli: "CLI",
						service: "Service",
						workspace: "Workspace",
						knowledge: "Knowledge Store",
						mcp: "MCP",
						network: "Network",
						extension: "Extension",
					};

					for (const [group, checks] of groupedChecks) {
						outputChannel.appendLine(`${groupLabels[group] || group}`);
						for (const check of checks) {
							const icon =
								check.status === "pass"
									? "✔"
									: check.status === "warn"
										? "⚠"
										: check.status === "fail"
											? "✖"
											: "○";
							outputChannel.appendLine(
								`${icon} ${check.label}${check.detail ? ` (${check.detail})` : ""}`,
							);
							if (check.fix && check.status !== "pass") {
								outputChannel.appendLine(`  → ${check.fix}`);
							}
						}
						outputChannel.appendLine("");
					}

					outputChannel.appendLine(
						`Summary: ${result.summary.pass} passed, ${result.summary.warn} warnings, ${result.summary.fail} failures`,
					);

					outputChannel.show(true);

					// Show notification
					if (result.success) {
						vscode.window.showInformationMessage(
							`🦎 Vreko: Healthy  -  ${result.summary.pass} checks passed, ${result.summary.warn} warnings`,
						);
					} else {
						vscode.window
							.showWarningMessage(
								`🦎 Vreko: ${result.summary.fail} issue(s). See Output panel for details.`,
								"Show Details",
							)
							.then((selection) => {
								if (selection === "Show Details") {
									outputChannel.show(true);
								}
							});
					}
				} catch (error) {
					const errorMessage = error instanceof Error ? error.message : "Unknown error";
					vscode.window.showErrorMessage(`Doctor failed: ${errorMessage}`);
					outputChannel.appendLine(`Error: ${errorMessage}`);
					outputChannel.show(true);
				}
			},
		);
	});
}

/**
 * Get the last doctor result from globalState
 */
export function getDoctorResult(context: vscode.ExtensionContext): DoctorJsonResult | undefined {
	return context.globalState.get<DoctorJsonResult>("doctor.result");
}

/**
 * Get the timestamp of the last doctor run
 */
export function getDoctorTimestamp(context: vscode.ExtensionContext): string | undefined {
	return context.globalState.get<string>("doctor.timestamp");
}

/**
 * Check if Vreko is healthy based on last doctor result
 */
export function isVrekoHealthy(context: vscode.ExtensionContext): boolean {
	const result = getDoctorResult(context);
	return result?.success ?? false;
}

/**
 * Get failing checks from last doctor result
 */
export function getFailingChecks(context: vscode.ExtensionContext): DoctorCheck[] {
	const result = getDoctorResult(context);
	if (!result) {
		return [];
	}
	return result.checks.filter((c) => c.status === "fail");
}

/**
 * Get warning checks from last doctor result
 */
export function getWarningChecks(context: vscode.ExtensionContext): DoctorCheck[] {
	const result = getDoctorResult(context);
	if (!result) {
		return [];
	}
	return result.checks.filter((c) => c.status === "warn");
}
