import type * as vscode from "vscode";
import { FileHealthDecorationProvider } from "../decorations/FileHealthDecorationProvider.js";
import { SnapshotDecorations } from "../decorations/snapshotDecorations.js";
import { DetectionCodeActionProvider } from "../providers/DetectionCodeActionProvider.js";
import { ProtectionCodeLensProvider } from "../providers/ProtectionCodeLensProvider.js";
import { SnapshotDocumentProvider } from "../providers/SnapshotDocumentProvider.js";
import type { ProtectedFileRegistry } from "../services/protectedFileRegistry.js";
import { StorageManager as ServiceStorageManager } from "../services/StorageManager.js";
import { WorkspaceSafetyService } from "../services/WorkspaceSafetyService.js";
import { SessionCoordinator } from "../snapshot/SessionCoordinator.js";
import type { StorageManager } from "../storage/StorageManager.js";
import { ProtectionDecorationProvider } from "../ui/ProtectionDecorationProvider.js";
import type { StatusBarController } from "../ui/statusBar.js";
import { ProtectedFilesTreeProvider } from "../views/ProtectedFilesTreeProvider.js";
import { SafetyDashboardTreeProvider } from "../views/SafetyDashboardTreeProvider.js";
import { SessionsTreeProvider } from "../views/SessionsTreeProvider.js";

import { SnapshotNavigatorProvider } from "../views/snapshotNavigatorProvider.js";
import { WelcomeView } from "../welcomeView.js";
import type { Phase3Result } from "./phase3-managers.js";
import { PhaseLogger } from "./phaseLogger.js";

export interface Phase4Result {
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
	safetyDashboardTreeProvider: SafetyDashboardTreeProvider;
}

export async function initializePhase4Providers(
	context: vscode.ExtensionContext,
	phase3Result: Phase3Result,
	storage: StorageManager,
	protectedFileRegistry: ProtectedFileRegistry,
	workspaceRoot: string,
): Promise<Phase4Result> {
	try {
		// Initialize document provider
		const snapshotDocumentProvider = new SnapshotDocumentProvider();

		// Initialize tree providers
		if (!protectedFileRegistry) {
			throw new Error("ProtectedFileRegistry is required for tree providers");
		}

		const protectedFilesTreeProvider = new ProtectedFilesTreeProvider(
			protectedFileRegistry,
		);

		// Initialize decoration providers
		const protectionDecorationProvider = new ProtectionDecorationProvider(
			protectedFileRegistry,
			workspaceRoot,
		);

		// 🆕 Initialize file health decoration provider
		const fileHealthDecorationProvider = new FileHealthDecorationProvider();

		const snapshotDecorations = new SnapshotDecorations(storage);

		// Use the status bar controller from phase 3
		const statusBarController = phase3Result.statusBarController;

		// Initialize welcome view
		const welcomeView = new WelcomeView(context.extensionUri);

		// Initialize snapshot navigator provider
		const snapshotNavigatorProvider = new SnapshotNavigatorProvider(storage);

		// Initialize detection code action provider
		const detectionCodeActionProvider = new DetectionCodeActionProvider();

		// Initialize protection CodeLens provider
		const protectionCodeLensProvider = new ProtectionCodeLensProvider(
			protectedFileRegistry,
		);

		// 🆕 Initialize sessions tree provider with storage manager
		const storageManager = new ServiceStorageManager(workspaceRoot);
		const sessionCoordinator = new SessionCoordinator(storage);
		const sessionsTreeProvider = new SessionsTreeProvider(
			sessionCoordinator,
			storageManager,
		);

		// 🟢 v1.1: Initialize Safety Dashboard
		const workspaceSafetyService = new WorkspaceSafetyService(
			phase3Result.snapshotSummaryProvider,
		);
		workspaceSafetyService.startAutoRefresh(); // Auto-refresh every 60s

		const safetyDashboardTreeProvider = new SafetyDashboardTreeProvider(
			workspaceSafetyService,
			phase3Result.snapshotSummaryProvider,
			protectedFileRegistry,
			phase3Result.protectionService,
		);

		PhaseLogger.logPhase("4: UI Providers");

		return {
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
			safetyDashboardTreeProvider,
		};
	} catch (error) {
		PhaseLogger.logError("4: UI Providers", error as Error);
		throw error;
	}
}
