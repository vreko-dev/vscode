import * as vscode from "vscode";
import { ConfigDetector } from "../config-detector.js";
import type { CommandContext } from "./index.js";
import { UpdateConfigurationCommand } from "./updateConfiguration.js";

export function registerUtilityCommands(
	_context: vscode.ExtensionContext,
	ctx: CommandContext,
): vscode.Disposable[] {
	return [
		vscode.commands.registerCommand("snapback.helloWorld", () => {
			vscode.window.showInformationMessage("Hello from SnapBack! 🎩");
		}),

		// Note: snapback.showStatus command moved to statusBarCommands.ts for enhanced UX
		// Note: snapback.testMCPFederation moved to mcpCommands.ts

		vscode.commands.registerCommand("snapback.initialize", async () => {
			const { message } = await ctx.getProtectionStateSummary();
			vscode.window.showInformationMessage(
				`SnapBack protection initialized: ${message}`,
			);
		}),

		vscode.commands.registerCommand(
			"snapback.updateConfiguration",
			async () => {
				const configDetector = new ConfigDetector(ctx.workspaceRoot);
				const updateCommand = new UpdateConfigurationCommand(
					ctx.workspaceRoot,
					configDetector,
				);
				await updateCommand.execute();
			},
		),

		// Add other utility commands here
	];
}
