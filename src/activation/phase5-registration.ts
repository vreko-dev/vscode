import * as vscode from "vscode";
import { COMMANDS } from "../constants/index.js";
import type { SessionCoordinator } from "../snapshot/SessionCoordinator.js";
import { VIEW_IDS } from "../views/ViewRegistry.js";
import type { Phase4Result } from "./phase4-providers.js";
import { PhaseLogger } from "./phaseLogger.js";

export type Phase5Result = Record<string, never>;

export async function initializePhase5Registration(
	context: vscode.ExtensionContext,
	phase4Result: Phase4Result,
	sessionCoordinator: SessionCoordinator,
): Promise<Phase5Result> {
	try {
		// Register tree data providers
		vscode.window.registerTreeDataProvider(
			VIEW_IDS.PROTECTED_FILES,
			phase4Result.protectedFilesTreeProvider,
		);

		// 🆕 Register sessions tree provider
		vscode.window.registerTreeDataProvider(
			VIEW_IDS.SESSIONS,
			phase4Result.sessionsTreeProvider,
		);

		// 🆕 v1.1: Register Safety Dashboard tree provider
		vscode.window.registerTreeDataProvider(
			VIEW_IDS.DASHBOARD,
			phase4Result.safetyDashboardTreeProvider,
		);

		// 🆕 v1.1: Register refresh command for external triggers (e.g., snapshot creation)
		context.subscriptions.push(
			vscode.commands.registerCommand(COMMANDS.VIEW.REFRESH_DASHBOARD, () => {
				phase4Result.safetyDashboardTreeProvider.refresh();
			}),
		);

		// Register file decoration providers
		vscode.window.registerFileDecorationProvider(
			phase4Result.protectionDecorationProvider,
		);

		// 🆕 Register file health decoration provider
		vscode.window.registerFileDecorationProvider(
			phase4Result.fileHealthDecorationProvider,
		);

		// Register document content provider
		vscode.workspace.registerTextDocumentContentProvider(
			"snapback-snapshot",
			phase4Result.snapshotDocumentProvider,
		);

		// Register code action provider
		context.subscriptions.push(
			vscode.languages.registerCodeActionsProvider(
				"*",
				phase4Result.detectionCodeActionProvider,
			),
		);

		// Register CodeLens provider for protection indicators
		context.subscriptions.push(
			vscode.languages.registerCodeLensProvider(
				"*",
				phase4Result.protectionCodeLensProvider,
			),
		);

		// Register window blur listener for session finalization
		context.subscriptions.push(
			vscode.window.onDidChangeWindowState((e) => {
				if (!e.focused) {
					console.log(
						"[Phase5] Window blur detected, triggering session finalization",
					);
					sessionCoordinator.handleWindowBlur();
				}
			}),
		);

		PhaseLogger.logPhase("5: Registration");

		return {};
	} catch (error) {
		PhaseLogger.logError("5: Registration", error as Error);
		throw error;
	}
}
