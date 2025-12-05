import * as vscode from "vscode";
import { ConfigDetector } from "../config-detector.js";
import { COMMANDS } from "../constants/index.js";
import type { CommandContext } from "./index.js";
import { UpdateConfigurationCommand } from "./updateConfiguration.js";

export function registerUtilityCommands(
	_context: vscode.ExtensionContext,
	ctx: CommandContext,
): vscode.Disposable[] {
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
			vscode.window.showInformationMessage(
				`SnapBack protection initialized: ${message}`,
			);
		}),
	);

	disposables.push(
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
	);

	// Add other utility commands here

	return disposables;
}
