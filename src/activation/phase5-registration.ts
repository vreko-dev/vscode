import * as vscode from "vscode";
import { registerConnectCommand, registerOpenSnapshotInWebCommand } from "../commands/authCommands";
import { registerToggleGroupingModeCommand } from "../commands/toggleGroupingMode";
import { COMMANDS } from "../constants/index";
import type { SessionCoordinator } from "../snapshot/SessionCoordinator";
import { VIEW_IDS } from "../views/ViewRegistry";
import type { Phase4Result } from "./phase4-providers";
import { PhaseLogger } from "./phaseLogger";

export type Phase5Result = Record<string, never>;

export async function initializePhase5Registration(
	context: vscode.ExtensionContext,
	phase4Result: Phase4Result,
	sessionCoordinator: SessionCoordinator,
): Promise<Phase5Result> {
	try {
		// Register tree data providers
		vscode.window.registerTreeDataProvider(VIEW_IDS.PROTECTED_FILES, phase4Result.protectedFilesTreeProvider);

		// 🟢 Phase 2: Register SnapBack TreeView (primary dashboard view)
		// Note: SnapBackTreeProvider already creates and registers its own TreeView
		// via SnapBackTreeProvider.register() in phase4, so no additional registration needed

		// Register sessions tree provider
		vscode.window.registerTreeDataProvider(VIEW_IDS.SESSIONS, phase4Result.sessionsTreeProvider);

		// NOTE: SnapBack Cloud view removed - Pioneer status shown in status bar
		// Connect commands still available via command palette
		context.subscriptions.push(
			registerConnectCommand(context, () => phase4Result.snapBackTreeProvider.refresh()),
			registerOpenSnapshotInWebCommand(context),
		);

		// 🆕 v1.1: Register Safety Dashboard tree provider
		// Note: Replaced by SnapBackTreeProvider in Phase 2
		// vscode.window.registerTreeDataProvider(
		// 	VIEW_IDS.DASHBOARD,
		// 	phase4Result.safetyDashboardTreeProvider,
		// );

		// 🆕 v1.1: Register refresh command for SnapBackTreeProvider (Phase 2)
		context.subscriptions.push(
			vscode.commands.registerCommand(COMMANDS.VIEW.REFRESH_DASHBOARD, () => {
				phase4Result.snapBackTreeProvider.refresh();
			}),
		);

		// 🟢 Phase 2: Register toggle grouping mode command
		registerToggleGroupingModeCommand(context, phase4Result.snapBackTreeProvider);

		// Register file decoration providers
		vscode.window.registerFileDecorationProvider(phase4Result.protectionDecorationProvider);

		// 🆕 Register file health decoration provider
		vscode.window.registerFileDecorationProvider(phase4Result.fileHealthDecorationProvider);

		// Register document content provider
		vscode.workspace.registerTextDocumentContentProvider(
			"snapback-snapshot",
			phase4Result.snapshotDocumentProvider,
		);

		// Register code action provider
		context.subscriptions.push(
			vscode.languages.registerCodeActionsProvider("*", phase4Result.detectionCodeActionProvider),
		);

		// Register CodeLens provider for protection indicators
		context.subscriptions.push(
			vscode.languages.registerCodeLensProvider("*", phase4Result.protectionCodeLensProvider),
		);

		// Register window blur listener for session finalization
		context.subscriptions.push(
			vscode.window.onDidChangeWindowState((e) => {
				if (!e.focused) {
					console.log("[Phase5] Window blur detected, triggering session finalization");
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
