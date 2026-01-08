import * as vscode from "vscode";
import type { AuthedApiClient } from "../api/authedApiClient";
import type { CredentialsManager } from "../auth/credentials";
import { registerDashboardCommands } from "../commands/dashboardCommands";
import { FileHealthDecorationProvider } from "../decorations/FileHealthDecorationProvider";
import { SnapshotDecorations } from "../decorations/snapshotDecorations";
import { NudgeManager } from "../nurturing/NudgeManager";
import { DetectionCodeActionProvider } from "../providers/DetectionCodeActionProvider";
import { ProtectionCodeLensProvider } from "../providers/ProtectionCodeLensProvider";
import { SnapshotDocumentProvider } from "../providers/SnapshotDocumentProvider";
import type { MCPLifecycleManager } from "../services/MCPLifecycleManager";
import type { ProtectedFileRegistry } from "../services/protectedFileRegistry";
import { StorageManager as ServiceStorageManager } from "../services/StorageManager";
import type { TelemetryProxy } from "../services/telemetry-proxy";
import { WorkspaceSafetyService } from "../services/WorkspaceSafetyService";
import type { IStorageManager } from "../storage/types";
import { DiagnosticEventTracker } from "../telemetry/diagnostic-event-tracker";
import { MCPStatusItem } from "../ui/MCPStatusItem";
import { ProtectionDecorationProvider } from "../ui/ProtectionDecorationProvider";
import { createStatusBarManager, type StatusBarManager } from "../ui/StatusBarManager";
import { createVitalsUIIntegration, registerVitalsCommands, type VitalsUIIntegration } from "../ui/VitalsUIIntegration";
import { logger } from "../utils/logger";
import { ProtectedFilesTreeProvider } from "../views/ProtectedFilesTreeProvider";
import { SessionsTreeProvider } from "../views/SessionsTreeProvider";
import { SnapBackTreeProvider } from "../views/snapBackTreeProvider";
import { SnapshotNavigatorProvider } from "../views/snapshotNavigatorProvider";
import { WelcomeView } from "../welcomeView";
import type { Phase3Result } from "./phase3-managers";
import { PhaseLogger } from "./phaseLogger";

export interface Phase4Result {
	snapBackTreeProvider: SnapBackTreeProvider;
	protectedFilesTreeProvider: ProtectedFilesTreeProvider;
	snapshotDocumentProvider: SnapshotDocumentProvider;
	protectionDecorationProvider: ProtectionDecorationProvider;
	protectionCodeLensProvider: ProtectionCodeLensProvider;
	statusBarManager: StatusBarManager; // Consolidated status bar
	mcpStatusItem?: MCPStatusItem; // MCP connection status indicator
	welcomeView: WelcomeView;
	snapshotDecorations: SnapshotDecorations;
	snapshotNavigatorProvider: SnapshotNavigatorProvider;
	detectionCodeActionProvider: DetectionCodeActionProvider;
	fileHealthDecorationProvider: FileHealthDecorationProvider;
	sessionsTreeProvider: SessionsTreeProvider;
	workspaceSafetyService: WorkspaceSafetyService;
	vitalsUIIntegration: VitalsUIIntegration;
}

export async function initializePhase4Providers(
	context: vscode.ExtensionContext,
	phase3Result: Phase3Result,
	storage: IStorageManager,
	protectedFileRegistry: ProtectedFileRegistry,
	workspaceRoot: string,
	_apiClient?: AuthedApiClient,
	_credentialsManager?: CredentialsManager,
	telemetryProxy?: TelemetryProxy,
	mcpManager?: MCPLifecycleManager,
): Promise<Phase4Result> {
	const phase4Start = Date.now();
	logger.debug("Phase 4 starting...");
	try {
		// Initialize document provider
		let t = Date.now();
		const snapshotDocumentProvider = new SnapshotDocumentProvider();
		logger.debug("SnapshotDocumentProvider", { ms: Date.now() - t });

		// Initialize tree providers
		if (!protectedFileRegistry) {
			throw new Error("ProtectedFileRegistry is required for tree providers");
		}

		t = Date.now();
		const protectedFilesTreeProvider = new ProtectedFilesTreeProvider(protectedFileRegistry);
		logger.debug("ProtectedFilesTreeProvider", { ms: Date.now() - t });

		// Initialize decoration providers
		t = Date.now();
		const protectionDecorationProvider = new ProtectionDecorationProvider(protectedFileRegistry, workspaceRoot);
		logger.debug("ProtectionDecorationProvider", { ms: Date.now() - t });

		// 🆕 Initialize file health decoration provider
		t = Date.now();
		const fileHealthDecorationProvider = new FileHealthDecorationProvider();
		logger.debug("FileHealthDecorationProvider", { ms: Date.now() - t });

		t = Date.now();
		const snapshotDecorations = new SnapshotDecorations(storage);
		logger.debug("SnapshotDecorations", { ms: Date.now() - t });

		// Initialize welcome view with diagnostic tracking
		t = Date.now();
		const diagnosticTracker = telemetryProxy
			? new DiagnosticEventTracker(telemetryProxy)
			: new DiagnosticEventTracker({ trackEvent: () => {} } as unknown as TelemetryProxy);
		const welcomeView = new WelcomeView(context.extensionUri, context.globalState, diagnosticTracker);
		logger.debug("WelcomeView with DiagnosticEventTracker", {
			ms: Date.now() - t,
		});

		// Initialize snapshot navigator provider
		t = Date.now();
		const snapshotNavigatorProvider = new SnapshotNavigatorProvider(storage);
		logger.debug("SnapshotNavigatorProvider", { ms: Date.now() - t });

		// Initialize detection code action provider
		t = Date.now();
		const detectionCodeActionProvider = new DetectionCodeActionProvider();
		logger.debug("DetectionCodeActionProvider", { ms: Date.now() - t });

		// Initialize protection CodeLens provider
		t = Date.now();
		const protectionCodeLensProvider = new ProtectionCodeLensProvider(protectedFileRegistry);
		logger.debug("ProtectionCodeLensProvider", { ms: Date.now() - t });

		// 🆕 Initialize sessions tree provider with storage manager
		// Use SessionCoordinator from phase3 (already wired to SnapshotManager)
		t = Date.now();
		const storageManager = new ServiceStorageManager(workspaceRoot);
		const sessionsTreeProvider = new SessionsTreeProvider(phase3Result.sessionCoordinator, storageManager);
		logger.debug("SessionsTreeProvider", { ms: Date.now() - t });

		// 🟢 Phase 2: Initialize SnapBack TreeView (replaces SafetyDashboard)
		t = Date.now();
		const { provider: snapBackTreeProvider } = SnapBackTreeProvider.register(
			context,
			storage,
			protectedFileRegistry,
		);
		logger.debug("SnapBackTreeProvider", { ms: Date.now() - t });

		t = Date.now();
		// Initialize WorkspaceSafetyService (still used by other components)
		const workspaceSafetyService = new WorkspaceSafetyService(phase3Result.snapshotSummaryProvider);
		workspaceSafetyService.startAutoRefresh(); // Auto-refresh every 60s
		logger.debug("WorkspaceSafetyService", { ms: Date.now() - t });

		// Initialize StatusBarManager (consolidated status bar)
		t = Date.now();
		const statusBarManager = createStatusBarManager();
		context.subscriptions.push(statusBarManager);
		logger.debug("StatusBarManager", { ms: Date.now() - t });

		// Initialize MCPStatusItem for MCP connection visibility
		let mcpStatusItem: MCPStatusItem | undefined;
		if (mcpManager) {
			t = Date.now();
			mcpStatusItem = new MCPStatusItem({
				statusBarManager,
				mcpManager,
			});
			context.subscriptions.push(mcpStatusItem);
			logger.debug("MCPStatusItem", { ms: Date.now() - t });
		}

		// Initialize NudgeManager for educational messaging
		t = Date.now();
		const nudgeManager = new NudgeManager(context);
		logger.debug("NudgeManager", { ms: Date.now() - t });

		// Initialize VitalsUIIntegration - connects data service to UI components
		t = Date.now();
		const workspaceId = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? workspaceRoot;
		const vitalsUIIntegration = createVitalsUIIntegration(
			workspaceId,
			workspaceRoot,
			context.extensionUri,
			statusBarManager,
			nudgeManager,
		);
		registerVitalsCommands(context, vitalsUIIntegration);
		context.subscriptions.push(vitalsUIIntegration);
		logger.debug("VitalsUIIntegration", { ms: Date.now() - t });

		// Register new Dashboard commands (3-tab dashboard)
		t = Date.now();
		const dashboardDisposables = registerDashboardCommands(context, phase3Result.operationCoordinator);
		for (const d of dashboardDisposables) {
			context.subscriptions.push(d);
		}
		logger.debug("DashboardCommands", { ms: Date.now() - t });

		logger.debug("Phase 4 completed", { ms: Date.now() - phase4Start });
		PhaseLogger.logPhase("4: UI Providers");

		return {
			snapBackTreeProvider,
			protectedFilesTreeProvider,
			snapshotDocumentProvider,
			protectionDecorationProvider,
			protectionCodeLensProvider,
			statusBarManager,
			mcpStatusItem,
			welcomeView,
			snapshotDecorations,
			snapshotNavigatorProvider,
			detectionCodeActionProvider,
			fileHealthDecorationProvider,
			sessionsTreeProvider,
			workspaceSafetyService,
			vitalsUIIntegration,
		};
	} catch (error) {
		PhaseLogger.logError("4: UI Providers", error as Error);
		throw error;
	}
}
