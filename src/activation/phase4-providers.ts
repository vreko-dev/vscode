import * as vscode from "vscode";
import { registerDashboardCommands } from "../commands/dashboardCommands";
import { FileHealthDecorationProvider } from "../decorations/FileHealthDecorationProvider";
import { SnapshotDecorations } from "../decorations/snapshotDecorations";
import { NudgeManager } from "../nurturing/NudgeManager";
import { DetectionCodeActionProvider } from "../providers/DetectionCodeActionProvider";
import { ProtectionCodeLensProvider } from "../providers/ProtectionCodeLensProvider";
import { SnapshotDocumentProvider } from "../providers/SnapshotDocumentProvider";
import { WorkspaceSafetyService } from "../services/WorkspaceSafetyService";
import { DiagnosticEventTracker } from "../telemetry/diagnostic-event-tracker";
import { MCPStatusItem } from "../ui/MCPStatusItem";
import { ProtectionDecorationProvider } from "../ui/ProtectionDecorationProvider";
import { createStatusBarManager } from "../ui/StatusBarManager";
import { createStatusBarController } from "../ui/statusBar/StatusBarController";
import { createVitalsUIIntegration, registerVitalsCommands } from "../ui/VitalsUIIntegration";
import { logger } from "../utils/logger";
import { IntelligenceTreeProvider } from "../views/IntelligenceTreeProvider";
import { SessionsTreeProvider } from "../views/SessionsTreeProvider";
import { SnapBackTreeProvider } from "../views/snapBackTreeProvider";
import { SnapshotNavigatorProvider } from "../views/snapshotNavigatorProvider";
import { WelcomeView } from "../welcomeView";
import type { AppContext } from "./AppContext";
import { PhaseLogger } from "./phaseLogger";

export async function initializePhase4Providers(appContext: AppContext): Promise<void> {
	const {
		context,
		workspaceRoot,
		storage,
		protectedFileRegistry,
		daemonBridge,
		telemetryProxy,
		sessionCoordinator,
		snapshotSummaryProvider,
		operationCoordinator,
	} = appContext;

	if (
		!storage ||
		!protectedFileRegistry ||
		!daemonBridge ||
		!sessionCoordinator ||
		!snapshotSummaryProvider ||
		!operationCoordinator
	) {
		throw new Error("Missing dependencies for Phase 4");
	}

	const phase4Start = Date.now();
	logger.debug("Phase 4 starting...");
	try {
		const workspaceId = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? workspaceRoot;

		appContext.snapshotDocumentProvider = new SnapshotDocumentProvider();
		appContext.intelligenceTreeProvider = new IntelligenceTreeProvider(
			workspaceId,
			workspaceRoot,
			context.globalState,
		);
		appContext.protectionDecorationProvider = new ProtectionDecorationProvider(
			protectedFileRegistry,
			workspaceRoot,
		);
		appContext.fileHealthDecorationProvider = new FileHealthDecorationProvider();
		appContext.snapshotDecorations = new SnapshotDecorations(storage);

		const diagnosticTracker = new DiagnosticEventTracker(telemetryProxy || ({ trackEvent: () => {} } as any));
		appContext.welcomeView = new WelcomeView(context.extensionUri, context.globalState, diagnosticTracker);

		appContext.snapshotNavigatorProvider = new SnapshotNavigatorProvider(storage);
		appContext.detectionCodeActionProvider = new DetectionCodeActionProvider();
		appContext.protectionCodeLensProvider = new ProtectionCodeLensProvider(protectedFileRegistry);

		const { StorageManager: ServiceStorageManager } = await import("../services/StorageManager");
		const storageManager = new ServiceStorageManager(workspaceRoot);
		appContext.sessionsTreeProvider = new SessionsTreeProvider(sessionCoordinator, storageManager);

		const { provider: snapBackTreeProvider } = SnapBackTreeProvider.register(
			context,
			storage,
			protectedFileRegistry,
		);
		appContext.snapBackTreeProvider = snapBackTreeProvider;

		appContext.workspaceSafetyService = new WorkspaceSafetyService(snapshotSummaryProvider);
		appContext.workspaceSafetyService.startAutoRefresh();

		appContext.statusBarManager = createStatusBarManager();
		context.subscriptions.push(appContext.statusBarManager);

		appContext.mcpStatusItem = new MCPStatusItem({ bridge: daemonBridge });
		context.subscriptions.push(appContext.mcpStatusItem);

		const nudgeManager = new NudgeManager(context);
		appContext.vitalsUIIntegration = createVitalsUIIntegration(
			workspaceId,
			workspaceRoot,
			context.extensionUri,
			appContext.statusBarManager,
			nudgeManager,
		);
		registerVitalsCommands(context, appContext.vitalsUIIntegration);
		context.subscriptions.push(appContext.vitalsUIIntegration);

		const dataService = appContext.vitalsUIIntegration.getDataService();
		appContext.statusBarController = createStatusBarController(dataService, appContext.statusBarManager);
		context.subscriptions.push(appContext.statusBarController);

		const dashboardDisposables = registerDashboardCommands(context, operationCoordinator);
		for (const d of dashboardDisposables) {
			context.subscriptions.push(d);
		}

		logger.debug("Phase 4 completed", { duration: Date.now() - phase4Start });
		PhaseLogger.logPhase("4: UI Providers");
	} catch (error) {
		PhaseLogger.logError("4: UI Providers", error as Error);
		throw error;
	}
}
