import * as vscode from "vscode";
import type { AuthedApiClient } from "../api/authedApiClient";
import type { CredentialsManager } from "../auth/credentials";
import { registerDashboardCommands } from "../commands/dashboardCommands";
import { FileHealthDecorationProvider } from "../decorations/FileHealthDecorationProvider";
import { SnapshotDecorations } from "../decorations/snapshotDecorations";
import { DetectionCodeActionProvider } from "../providers/DetectionCodeActionProvider";
import { ProtectionCodeLensProvider } from "../providers/ProtectionCodeLensProvider";
import { SnapshotDocumentProvider } from "../providers/SnapshotDocumentProvider";
import type { ProtectedFileRegistry } from "../services/protectedFileRegistry";
import { StorageManager as ServiceStorageManager } from "../services/StorageManager";
import { WorkspaceSafetyService } from "../services/WorkspaceSafetyService";
import type { IStorageManager } from "../storage/types";
import { DiagnosticEventTracker } from "../telemetry/diagnostic-event-tracker";
import { ProtectionDecorationProvider } from "../ui/ProtectionDecorationProvider";
import { StatusBarController } from "../ui/StatusBarController";
import { createStatusBarManager, type StatusBarManager } from "../ui/StatusBarManager";
import { createVitalsUIIntegration, registerVitalsCommands, type VitalsUIIntegration } from "../ui/VitalsUIIntegration";
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
	statusBarManager: StatusBarManager; // Legacy vitals-aware status bar
	statusBarController: StatusBarController; // New consolidated status bar
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
	telemetryProxy?: any,
): Promise<Phase4Result> {
	const phase4Start = Date.now();
	console.log("[PERF] Phase 4 starting...");
	try {
		// Initialize document provider
		let t = Date.now();
		const snapshotDocumentProvider = new SnapshotDocumentProvider();
		console.log("[PERF] SnapshotDocumentProvider", { ms: Date.now() - t });

		// Initialize tree providers
		if (!protectedFileRegistry) {
			throw new Error("ProtectedFileRegistry is required for tree providers");
		}

		t = Date.now();
		const protectedFilesTreeProvider = new ProtectedFilesTreeProvider(protectedFileRegistry);
		console.log("[PERF] ProtectedFilesTreeProvider", { ms: Date.now() - t });

		// Initialize decoration providers
		t = Date.now();
		const protectionDecorationProvider = new ProtectionDecorationProvider(protectedFileRegistry, workspaceRoot);
		console.log("[PERF] ProtectionDecorationProvider", { ms: Date.now() - t });

		// 🆕 Initialize file health decoration provider
		t = Date.now();
		const fileHealthDecorationProvider = new FileHealthDecorationProvider();
		console.log("[PERF] FileHealthDecorationProvider", { ms: Date.now() - t });

		t = Date.now();
		const snapshotDecorations = new SnapshotDecorations(storage);
		console.log("[PERF] SnapshotDecorations", { ms: Date.now() - t });

		// Initialize welcome view with diagnostic tracking
		t = Date.now();
		const diagnosticTracker = telemetryProxy
			? new DiagnosticEventTracker(telemetryProxy)
			: new DiagnosticEventTracker({ trackEvent: () => {} } as any);
		const welcomeView = new WelcomeView(context.extensionUri, context.globalState, diagnosticTracker);
		console.log("[PERF] WelcomeView with DiagnosticEventTracker", {
			ms: Date.now() - t,
		});

		// Initialize snapshot navigator provider
		t = Date.now();
		const snapshotNavigatorProvider = new SnapshotNavigatorProvider(storage);
		console.log("[PERF] SnapshotNavigatorProvider", { ms: Date.now() - t });

		// Initialize detection code action provider
		t = Date.now();
		const detectionCodeActionProvider = new DetectionCodeActionProvider();
		console.log("[PERF] DetectionCodeActionProvider", { ms: Date.now() - t });

		// Initialize protection CodeLens provider
		t = Date.now();
		const protectionCodeLensProvider = new ProtectionCodeLensProvider(protectedFileRegistry);
		console.log("[PERF] ProtectionCodeLensProvider", { ms: Date.now() - t });

		// 🆕 Initialize sessions tree provider with storage manager
		// Use SessionCoordinator from phase3 (already wired to SnapshotManager)
		t = Date.now();
		const storageManager = new ServiceStorageManager(workspaceRoot);
		const sessionsTreeProvider = new SessionsTreeProvider(phase3Result.sessionCoordinator, storageManager);
		console.log("[PERF] SessionsTreeProvider", { ms: Date.now() - t });

		// 🟢 Phase 2: Initialize SnapBack TreeView (replaces SafetyDashboard)
		t = Date.now();
		const { provider: snapBackTreeProvider } = SnapBackTreeProvider.register(
			context,
			storage,
			protectedFileRegistry,
		);
		console.log("[PERF] SnapBackTreeProvider", { ms: Date.now() - t });

		t = Date.now();
		// Initialize WorkspaceSafetyService (still used by other components)
		const workspaceSafetyService = new WorkspaceSafetyService(phase3Result.snapshotSummaryProvider);
		workspaceSafetyService.startAutoRefresh(); // Auto-refresh every 60s
		console.log("[PERF] WorkspaceSafetyService", { ms: Date.now() - t });

		// Initialize StatusBarManager for vitals display (legacy)
		t = Date.now();
		const statusBarManager = createStatusBarManager();
		context.subscriptions.push(statusBarManager);
		console.log("[PERF] StatusBarManager", { ms: Date.now() - t });

		// Initialize StatusBarController (new consolidated status bar)
		t = Date.now();
		const statusBarController = new StatusBarController();
		context.subscriptions.push(statusBarController);
		console.log("[PERF] StatusBarController", { ms: Date.now() - t });

		// Initialize VitalsUIIntegration - connects data service to UI components
		t = Date.now();
		const workspaceId = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? workspaceRoot;
		const vitalsUIIntegration = createVitalsUIIntegration(
			workspaceId,
			workspaceRoot,
			context.extensionUri,
			statusBarManager,
		);
		registerVitalsCommands(context, vitalsUIIntegration);
		context.subscriptions.push(vitalsUIIntegration);
		console.log("[PERF] VitalsUIIntegration", { ms: Date.now() - t });

		// Register new Dashboard commands (3-tab dashboard)
		t = Date.now();
		const dashboardDisposables = registerDashboardCommands(context, phase3Result.operationCoordinator);
		for (const d of dashboardDisposables) {
			context.subscriptions.push(d);
		}
		console.log("[PERF] DashboardCommands", { ms: Date.now() - t });

		console.log("[PERF] Phase 4 completed", { ms: Date.now() - phase4Start });
		PhaseLogger.logPhase("4: UI Providers");

		return {
			snapBackTreeProvider,
			protectedFilesTreeProvider,
			snapshotDocumentProvider,
			protectionDecorationProvider,
			protectionCodeLensProvider,
			statusBarManager,
			statusBarController,
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
