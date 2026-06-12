import * as vscode from "vscode";
import { VrekoChatParticipant } from "../chat/VrekoChatParticipant";
import { logger } from "../utils/logger";
import { CockpitTreeProvider } from "../views/CockpitTreeProvider";
import { CeremonyWebViewProvider } from "../webview/CeremonyWebViewProvider";
import { FragilityMapWebviewProvider } from "../webview/FragilityMapWebviewProvider";
import type { AppContext } from "./AppContext";
import { PhaseLogger } from "./phaseLogger";

export async function initializePhase5Registration(appContext: AppContext): Promise<void> {
	const { context, sessionCoordinator } = appContext;
	try {
		logger.debug("Phase 5: Starting provider registration", {
			protectionDecorationProvider: !!appContext.protectionDecorationProvider,
			snapshotDocumentProvider: !!appContext.snapshotDocumentProvider,
		});

		// Register Cockpit Tree Provider (vreko.cockpit sidebar view)
		if (appContext.storage && appContext.workspaceRoot) {
			const { provider } = CockpitTreeProvider.register(
				context,
				appContext.storage,
				appContext.daemonBridge ?? null,
				"vreko.cockpit",
				appContext.workspaceRoot,
			);
			appContext.treeProvider = provider;
			logger.debug("Phase 5: Registered CockpitTreeProvider");
		} else {
			logger.debug("Phase 5: Skipped CockpitTreeProvider  -  storage or workspaceRoot unavailable");
		}

		// CeremonyWebViewProvider is panel-based (createWebviewPanel), independent of sidebar.
		const ceremonyWebViewProvider = new CeremonyWebViewProvider(
			context.extensionUri,
			appContext.daemonBridge ?? null,
		);
		appContext.ceremonyWebViewProvider = ceremonyWebViewProvider;

		// Store in globalThis for access from commands
		(globalThis as { vrekoHost?: { ceremonyWebViewProvider?: typeof ceremonyWebViewProvider } }).vrekoHost ??= {};
		(globalThis as { vrekoHost?: { ceremonyWebViewProvider?: typeof ceremonyWebViewProvider } })
			.vrekoHost!.ceremonyWebViewProvider = ceremonyWebViewProvider;

		context.subscriptions.push(ceremonyWebViewProvider);
		logger.debug("Phase 5: Created CeremonyWebViewProvider (panel-based)");
		// Register FragilityMapWebviewProvider (webview view in the vreko sidebar)
		const fragilityMapProvider = new FragilityMapWebviewProvider(
			context.extensionUri,
			appContext.daemonBridge ?? null,
			appContext.workspaceRoot,
		);
		context.subscriptions.push(
			vscode.window.registerWebviewViewProvider(FragilityMapWebviewProvider.viewType, fragilityMapProvider),
		);
		logger.debug("Phase 5: Registered FragilityMapWebviewProvider");

		// Register refresh commands for the tree view
		context.subscriptions.push(
			vscode.commands.registerCommand("vreko.refreshIntelligence", () => {
				if (appContext.treeProvider) {
					appContext.treeProvider.refresh();
				}
			}),
			// Also register vreko.refreshTree for compatibility (used by auth handler)
			vscode.commands.registerCommand("vreko.refreshTree", () => {
				if (appContext.treeProvider) {
					appContext.treeProvider.refresh();
				}
			}),
		);

		if (appContext.protectionDecorationProvider) {
			context.subscriptions.push(
				vscode.window.registerFileDecorationProvider(appContext.protectionDecorationProvider),
			);
		}

		if (appContext.fileHealthDecorationProvider) {
			context.subscriptions.push(
				vscode.window.registerFileDecorationProvider(appContext.fileHealthDecorationProvider),
			);
		}

		if (appContext.snapshotDocumentProvider) {
			context.subscriptions.push(
				vscode.workspace.registerTextDocumentContentProvider(
					"vreko-snapshot",
					appContext.snapshotDocumentProvider,
				),
			);
			logger.debug("Phase 5: Registered snapshotDocumentProvider");
		} else {
			logger.error("Phase 5: snapshotDocumentProvider is undefined - RECOVERY WILL FAIL");
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

		// Register Chat Participant (VS Code 1.90+)
		// Provides @vreko command in Copilot Chat
		if (appContext.storage) {
			const chatParticipant = new VrekoChatParticipant(
				context,
				appContext.storage,
				appContext.activityPersistenceService,
			);
			chatParticipant.register();
			appContext.chatParticipant = chatParticipant;
			context.subscriptions.push(chatParticipant);
			logger.debug("Phase 5: Registered Chat Participant");
		}

		PhaseLogger.logPhase("5: Registration");
	} catch (error) {
		PhaseLogger.logError("5: Registration", error as Error);
		throw error;
	}
}
