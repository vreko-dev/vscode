import * as fs from "node:fs/promises";
import { ConfigDetector, type IFileSystemProvider } from "@snapback-oss/sdk";
import { glob } from "fast-glob";
import * as vscode from "vscode";
import { COMMANDS } from "../constants/index";
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

	// Debug command - only register in development mode
	// P2 Recommendation: Removed from production to prevent clutter
	// Uncomment for local testing if needed:
	// disposables.push(
	// 	vscode.commands.registerCommand("snapback.helloWorld", () => {
	// 		vscode.window.showInformationMessage("Hello from SnapBack! 🎩");
	// 	})
	// );

	// Note: snapback.showStatus command moved to statusBarCommands.ts for enhanced UX
	// Note: snapback.testMCPFederation moved to mcpCommands.ts

	disposables.push(
		vscode.commands.registerCommand(COMMANDS.UTILITY.INITIALIZE, async () => {
			const { message } = await ctx.getProtectionStateSummary();
			vscode.window.showInformationMessage(`SnapBack protection initialized: ${message}`);
		}),
	);

	disposables.push(
		vscode.commands.registerCommand("snapback.updateConfiguration", async () => {
			const configDetector = new ConfigDetector(ctx.workspaceRoot, nodeFileSystemProvider);
			const updateCommand = new UpdateConfigurationCommand(ctx.workspaceRoot, configDetector);
			await updateCommand.execute();
		}),
	);

	// Add other utility commands here

	return disposables;
}
