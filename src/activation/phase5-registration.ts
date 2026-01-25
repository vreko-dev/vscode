import * as vscode from "vscode";
import { registerConnectCommand, registerOpenSnapshotInWebCommand } from "../commands/authCommands";
import { registerToggleGroupingModeCommand } from "../commands/toggleGroupingMode";
import { COMMANDS } from "../constants/index";
import { logger } from "../utils/logger";
import { VIEW_IDS } from "../views/ViewRegistry";
import type { AppContext } from "./AppContext";
import { PhaseLogger } from "./phaseLogger";

export async function initializePhase5Registration(appContext: AppContext): Promise<void> {
	const { context, sessionCoordinator } = appContext;
	try {
		if (appContext.intelligenceTreeProvider) {
			vscode.window.registerTreeDataProvider(VIEW_IDS.INTELLIGENCE, appContext.intelligenceTreeProvider);
		}

		if (appContext.sessionsTreeProvider) {
			vscode.window.registerTreeDataProvider(VIEW_IDS.SESSIONS, appContext.sessionsTreeProvider);
		}

		if (appContext.snapBackTreeProvider) {
			context.subscriptions.push(
				registerConnectCommand(context, () => appContext.snapBackTreeProvider?.refresh()),
				registerOpenSnapshotInWebCommand(context),
			);

			context.subscriptions.push(
				vscode.commands.registerCommand(COMMANDS.VIEW.REFRESH_DASHBOARD, () => {
					appContext.snapBackTreeProvider?.refresh();
				}),
			);

			registerToggleGroupingModeCommand(context, appContext.snapBackTreeProvider);
		}

		if (appContext.intelligenceTreeProvider) {
			context.subscriptions.push(
				vscode.commands.registerCommand("snapback.refreshIntelligence", () => {
					appContext.intelligenceTreeProvider?.refresh();
				}),
			);
		}

		if (appContext.protectionDecorationProvider) {
			vscode.window.registerFileDecorationProvider(appContext.protectionDecorationProvider);
		}

		if (appContext.fileHealthDecorationProvider) {
			vscode.window.registerFileDecorationProvider(appContext.fileHealthDecorationProvider);
		}

		if (appContext.snapshotDocumentProvider) {
			vscode.workspace.registerTextDocumentContentProvider(
				"snapback-snapshot",
				appContext.snapshotDocumentProvider,
			);
		}

		if (appContext.detectionCodeActionProvider) {
			context.subscriptions.push(
				vscode.languages.registerCodeActionsProvider("*", appContext.detectionCodeActionProvider),
			);
		}

		if (appContext.protectionCodeLensProvider) {
			context.subscriptions.push(
				vscode.languages.registerCodeLensProvider("*", appContext.protectionCodeLensProvider),
			);
		}

		if (sessionCoordinator) {
			context.subscriptions.push(
				vscode.window.onDidChangeWindowState((e) => {
					if (!e.focused) {
						logger.debug("Window blur detected, triggering session finalization");
						sessionCoordinator.handleWindowBlur();
					}
				}),
			);
		}

		PhaseLogger.logPhase("5: Registration");
	} catch (error) {
		PhaseLogger.logError("5: Registration", error as Error);
		throw error;
	}
}
