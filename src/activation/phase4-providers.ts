import type * as vscode from "vscode";
import type { AuthedApiClient } from "../api/authedApiClient.js";
import type { CredentialsManager } from "../auth/credentials.js";
import { FileHealthDecorationProvider } from "../decorations/FileHealthDecorationProvider.js";
import { SnapshotDecorations } from "../decorations/snapshotDecorations.js";
import { DetectionCodeActionProvider } from "../providers/DetectionCodeActionProvider.js";
import { ProtectionCodeLensProvider } from "../providers/ProtectionCodeLensProvider.js";
import { SnapshotDocumentProvider } from "../providers/SnapshotDocumentProvider.js";
import type { ProtectedFileRegistry } from "../services/protectedFileRegistry.js";
import { StorageManager as ServiceStorageManager } from "../services/StorageManager.js";
import { WorkspaceSafetyService } from "../services/WorkspaceSafetyService.js";
import type { StorageManager } from "../storage/StorageManager.js";
import { DiagnosticEventTracker } from "../telemetry/diagnostic-event-tracker.js";
import { ProtectionDecorationProvider } from "../ui/ProtectionDecorationProvider.js";
import type { StatusBarController } from "../ui/statusBar.js";
import { SnapBackExplorerTreeProvider } from "../views/explorerTree/SnapBackExplorerTreeProvider.js";
import { ProtectedFilesTreeProvider } from "../views/ProtectedFilesTreeProvider.js";
import { SessionsTreeProvider } from "../views/SessionsTreeProvider.js";
import { SnapBackTreeProvider } from "../views/SnapBackTreeProvider.js";
import { SnapshotNavigatorProvider } from "../views/snapshotNavigatorProvider.js";
import { WelcomeView } from "../welcomeView.js";
import type { Phase3Result } from "./phase3-managers.js";
import { PhaseLogger } from "./phaseLogger.js";

export interface Phase4Result {
	snapBackTreeProvider: SnapBackTreeProvider;
	protectedFilesTreeProvider: ProtectedFilesTreeProvider;
	snapshotDocumentProvider: SnapshotDocumentProvider;
	protectionDecorationProvider: ProtectionDecorationProvider;
	protectionCodeLensProvider: ProtectionCodeLensProvider;
	statusBarController: StatusBarController;
	welcomeView: WelcomeView;
	snapshotDecorations: SnapshotDecorations;
	snapshotNavigatorProvider: SnapshotNavigatorProvider;
	detectionCodeActionProvider: DetectionCodeActionProvider;
	fileHealthDecorationProvider: FileHealthDecorationProvider;
	sessionsTreeProvider: SessionsTreeProvider;
	workspaceSafetyService: WorkspaceSafetyService;
	explorerTreeProvider?: SnapBackExplorerTreeProvider;
}

export async function initializePhase4Providers(
	context: vscode.ExtensionContext,
	phase3Result: Phase3Result,
	storage: StorageManager,
	protectedFileRegistry: ProtectedFileRegistry,
	workspaceRoot: string,
	apiClient?: AuthedApiClient,
	credentialsManager?: CredentialsManager,
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
		const protectedFilesTreeProvider = new ProtectedFilesTreeProvider(
			protectedFileRegistry,
		);
		console.log("[PERF] ProtectedFilesTreeProvider", { ms: Date.now() - t });

		// Initialize decoration providers
		t = Date.now();
		const protectionDecorationProvider = new ProtectionDecorationProvider(
			protectedFileRegistry,
			workspaceRoot,
		);
		console.log("[PERF] ProtectionDecorationProvider", { ms: Date.now() - t });

		// 🆕 Initialize file health decoration provider
		t = Date.now();
		const fileHealthDecorationProvider = new FileHealthDecorationProvider();
		console.log("[PERF] FileHealthDecorationProvider", { ms: Date.now() - t });

		t = Date.now();
		const snapshotDecorations = new SnapshotDecorations(storage);
		console.log("[PERF] SnapshotDecorations", { ms: Date.now() - t });

		// Use the status bar controller from phase 3
		t = Date.now();
		const statusBarController = phase3Result.statusBarController;
		console.log("[PERF] StatusBarController (from Phase 3)", {
			ms: Date.now() - t,
		});

		// Initialize welcome view with diagnostic tracking
		t = Date.now();
		const diagnosticTracker = telemetryProxy
			? new DiagnosticEventTracker(telemetryProxy)
			: new DiagnosticEventTracker({ trackEvent: () => {} } as any);
		const welcomeView = new WelcomeView(
			context.extensionUri,
			context.globalState,
			diagnosticTracker,
		);
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
		const protectionCodeLensProvider = new ProtectionCodeLensProvider(
			protectedFileRegistry,
		);
		console.log("[PERF] ProtectionCodeLensProvider", { ms: Date.now() - t });

		// 🆕 Initialize sessions tree provider with storage manager
		// Use SessionCoordinator from phase3 (already wired to SnapshotManager)
		t = Date.now();
		const storageManager = new ServiceStorageManager(workspaceRoot);
		const sessionsTreeProvider = new SessionsTreeProvider(
			phase3Result.sessionCoordinator,
			storageManager,
		);
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
		const workspaceSafetyService = new WorkspaceSafetyService(
			phase3Result.snapshotSummaryProvider,
		);
		workspaceSafetyService.startAutoRefresh(); // Auto-refresh every 60s
		console.log("[PERF] WorkspaceSafetyService", { ms: Date.now() - t });

		// 🌐 Initialize SnapBack Explorer Tree (cloud features)
		let explorerTreeProvider: SnapBackExplorerTreeProvider | undefined;
		if (apiClient && credentialsManager) {
			t = Date.now();
			explorerTreeProvider = new SnapBackExplorerTreeProvider(
				apiClient,
				credentialsManager,
			);
			console.log("[PERF] SnapBackExplorerTreeProvider", {
				ms: Date.now() - t,
			});
		}

		console.log("[PERF] Phase 4 completed", { ms: Date.now() - phase4Start });
		PhaseLogger.logPhase("4: UI Providers");

		return {
			snapBackTreeProvider,
			protectedFilesTreeProvider,
			snapshotDocumentProvider,
			protectionDecorationProvider,
			protectionCodeLensProvider,
			statusBarController,
			welcomeView,
			snapshotDecorations,
			snapshotNavigatorProvider,
			detectionCodeActionProvider,
			fileHealthDecorationProvider,
			sessionsTreeProvider,
			workspaceSafetyService,
			explorerTreeProvider,
		};
	} catch (error) {
		PhaseLogger.logError("4: UI Providers", error as Error);
		throw error;
	}
}
