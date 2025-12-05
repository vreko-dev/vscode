import * as vscode from "vscode";
import type { CommandContext } from "./index.js";

export function registerWorkflowCommands(
	_context: vscode.ExtensionContext,
	ctx: CommandContext,
): vscode.Disposable[] {
	return [
		vscode.commands.registerCommand(
			"snapback.applyWorkflowSuggestion",
			async (suggestionId: string) => {
				if (!suggestionId) {
					vscode.window.showWarningMessage("No workflow suggestion selected");
					return;
				}

				try {
					await ctx.workflowIntegration.applySuggestion(suggestionId);
					vscode.window.showInformationMessage(
						`Applied workflow suggestion ${suggestionId}`,
					);
					ctx.refreshViews();
				} catch (error) {
					vscode.window.showErrorMessage(
						`Failed to apply workflow suggestion: ${error}`,
					);
				}
			},
		),

		vscode.commands.registerCommand(
			"snapback.autoApplySuggestions",
			async () => {
				try {
					await ctx.workflowIntegration.autoApplySuggestions();
					vscode.window.showInformationMessage(
						"Auto-applied high-confidence suggestions",
					);
					ctx.refreshViews();
				} catch (error) {
					vscode.window.showErrorMessage(
						`Failed to auto-apply suggestions: ${error}`,
					);
				}
			},
		),

		// Add other workflow commands here
	];
}
