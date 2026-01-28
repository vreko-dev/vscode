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
		
		// 🐛 FIX: Wire SNAPSHOT_CREATED event → incrementSnapshotCount()
		// This is the ONLY place the counter should be incremented.
		// Without this handler, snapshots stay at 0 despite constant activity.
		if (appContext.eventBus) {
			appContext.eventBus.on("snapshot:created", () => {
				appContext.statusBarManager?.incrementSnapshotCount();
			});
			logger.debug("SNAPSHOT_CREATED event handler registered for status bar counter");
		}
		
		// 🔌 Wire Integration Health Updates (Daemon Brain Pattern)
		// Query integration health from MCP daemon and update status bar tooltip
		const updateIntegrationHealth = async () => {
			try {
				// Access integration health via daemon-backed MCP client
				// The MCP client is the "daemon brain" that manages IntegrationOrchestratorService
				const mcpClient = (appContext as any).mcpClient; // Will be set after phase4
				if (!mcpClient) {
					return;
				}
		
				// Query via check({mode:'integrations'}) tool through daemon
				const result = await mcpClient.callTool("check", {
					mode: "integrations",
					workspaceRoot,
				});
		
				if (result?.content?.[0]?.text) {
					const data = JSON.parse(result.content[0].text);
					if (data.integrations) {
						// Transform to IntegrationHealthDisplay format
						const health = {
							github: {
								enabled: data.integrations.github?.enabled ?? false,
								connected: data.integrations.github?.connected ?? false,
								status: data.integrations.github?.connected
									? "✓ Connected"
									: "Not connected - configure in .snapbackrc",
							},
							sentry: {
								enabled: data.integrations.sentry?.enabled ?? false,
								connected: data.integrations.sentry?.connected ?? false,
								status: data.integrations.sentry?.connected
									? "✓ Connected"
									: "Not connected - configure in .snapbackrc",
							},
							context7: {
								enabled: data.integrations.context7?.enabled ?? false,
								connected: data.integrations.context7?.connected ?? false,
								status: data.integrations.context7?.connected
									? "✓ Connected"
									: "Not connected - configure in .snapbackrc",
							},
						};
						appContext.statusBarManager?.updateIntegrationHealth(health);
					}
				}
			} catch (error) {
				// Integration health is optional - fail silently
				logger.debug("Could not fetch integration health", { error });
			}
		};
		
		// Poll integration health every 30s (daemon brain pattern)
		const healthInterval = setInterval(() => void updateIntegrationHealth(), 30000);
		context.subscriptions.push({ dispose: () => clearInterval(healthInterval) });
		
		// Initial health check (delayed after MCPClient is ready)
		setTimeout(() => void updateIntegrationHealth(), 5000);
		
		// MCP Status Item - workspace-aware, no bridge dependency
		appContext.mcpStatusItem = new MCPStatusItem();
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
