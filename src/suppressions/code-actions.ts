import * as vscode from "vscode";
import type { SuppressionManager } from "./manager";

export class SuppressionCodeActionsProvider
	implements vscode.CodeActionProvider
{
	constructor(readonly _suppressionManager: SuppressionManager) {}

	provideCodeActions(
		document: vscode.TextDocument,
		range: vscode.Range | vscode.Selection,
		context: vscode.CodeActionContext,
		_token: vscode.CancellationToken,
	): vscode.ProviderResult<(vscode.Command | vscode.CodeAction)[]> {
		const actions: vscode.CodeAction[] = [];

		// Only show suppressions if there are diagnostics in this range
		if (context.diagnostics.length > 0) {
			// Add line-level suppression
			const lineAction = new vscode.CodeAction(
				"Suppress this line (7 days)",
				vscode.CodeActionKind.QuickFix,
			);
			lineAction.command = {
				title: "Suppress this line",
				command: "snapback.suppressLine",
				arguments: [document.uri, range.start.line, context.diagnostics],
			};
			actions.push(lineAction);

			// Add file-level suppression
			const fileAction = new vscode.CodeAction(
				"Suppress this file (30 days)",
				vscode.CodeActionKind.QuickFix,
			);
			fileAction.command = {
				title: "Suppress this file",
				command: "snapback.suppressFile",
				arguments: [document.uri, context.diagnostics],
			};
			actions.push(fileAction);

			// Add repo-level suppression
			const repoAction = new vscode.CodeAction(
				"Suppress across repo (90 days)",
				vscode.CodeActionKind.QuickFix,
			);
			repoAction.command = {
				title: "Suppress across repo",
				command: "snapback.suppressRepo",
				arguments: [document.uri, context.diagnostics],
			};
			actions.push(repoAction);
		}

		return actions;
	}
}
