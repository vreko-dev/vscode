import * as vscode from "vscode";
import { ConflictResolver } from "../conflictResolver.js";
import { NotificationManager } from "../notificationManager.js";
import { OperationCoordinator } from "../operationCoordinator.js";
import { NoopAIRiskService } from "../services/aiRiskService.js";
import type { ProtectedFileRegistry } from "../services/protectedFileRegistry.js";
import { ProtectionManager } from "../services/protectionPolicy.js";
import { ProtectionService } from "../services/protectionService.js";
import { StorageSnapshotSummaryProvider } from "../services/snapshotSummaryProvider.js";
import { SmartContextDetector } from "../smartContext.js";
import { SnapshotManager } from "../snapshot/SnapshotManager.js";
import { SnapshotStorageAdapter } from "../snapshot/SnapshotStorageAdapter.js";
import { VSCodeConfirmationService } from "../snapshot/VSCodeConfirmationService.js";
import type { StorageManager } from "../storage/StorageManager.js";
import type { IEventEmitter } from "../types/snapshot.js";
import { StatusBarController } from "../ui/statusBar.js";
import { SnapshotNavigatorProvider } from "../views/snapshotNavigatorProvider.js";
import { WorkflowIntegration } from "../workflowIntegration.js";
import { WorkspaceMemoryManager } from "../workspaceMemory.js";
import { PhaseLogger } from "./phaseLogger.js";

export interface Phase3Result {
	workspaceMemoryManager: WorkspaceMemoryManager;
	operationCoordinator: OperationCoordinator;
	snapshotManager: SnapshotManager;
	smartContextDetector: SmartContextDetector;
	workflowIntegration: WorkflowIntegration;
	conflictResolver: ConflictResolver;
	notificationManager: NotificationManager;
	snapshotSummaryProvider: StorageSnapshotSummaryProvider;
	// snapshotRestoreUI will be created in phase 4 after SnapshotDocumentProvider is available
	snapshotNavigatorProvider: SnapshotNavigatorProvider;
	statusBarController: StatusBarController;
	protectionService: ProtectionService; // 🟢 TDD GREEN: Protection audit service
}

export async function initializePhase3Managers(
	_context: vscode.ExtensionContext,
	workspaceRoot: string,
	storage: StorageManager,
	protectedFileRegistry?: ProtectedFileRegistry,
	snapbackrcLoader?: import("../protection/SnapBackRCLoader.js").SnapBackRCLoader,
): Promise<Phase3Result> {
	try {
		// Initialize notification manager
		const notificationManager = new NotificationManager();

		// Initialize workspace memory manager
		const workspaceMemoryManager = new WorkspaceMemoryManager(storage);

		// Initialize conflict resolver
		const conflictResolver = new ConflictResolver();

		// Initialize smart context detector
		const smartContextDetector = new SmartContextDetector(
			workspaceMemoryManager,
		);

		// Initialize operation coordinator
		const operationCoordinator = new OperationCoordinator(
			workspaceMemoryManager,
			notificationManager,
			storage,
			conflictResolver,
		);

		// Initialize confirmation service
		const confirmationService = new VSCodeConfirmationService();

		// Initialize event emitter for snapshot manager
		const vsEventEmitter = new vscode.EventEmitter();

		// Create adapter that implements IEventEmitter interface
		const eventEmitter: IEventEmitter = {
			emit: (type: string, data: unknown) => {
				vsEventEmitter.fire({ type, data });
			},
		};

		// Initialize SnapshotManager
		const snapshotManager = new SnapshotManager(
			workspaceRoot,
			new SnapshotStorageAdapter(storage),
			confirmationService,
			eventEmitter,
		);

		// Initialize SnapshotSummaryProvider
		const snapshotSummaryProvider = new StorageSnapshotSummaryProvider(storage);

		// Initialize StatusBarController
		const statusBarController = new StatusBarController(protectedFileRegistry);

		// Remove SnapshotRestoreUI initialization - it will be created in phase 4
		// when SnapshotDocumentProvider is available

		// Initialize SnapshotNavigatorProvider
		const snapshotNavigatorProvider = new SnapshotNavigatorProvider(storage);

		// Initialize WorkflowIntegration
		const workflowIntegration = new WorkflowIntegration(
			smartContextDetector,
			notificationManager,
		);

		// 🟢 TDD GREEN: Initialize ProtectionService for repo audit
		// Only create if protectedFileRegistry is available
		let protectionService: ProtectionService;
		if (protectedFileRegistry) {
			const protectionManager = new ProtectionManager(
				protectedFileRegistry,
				() => snapbackrcLoader?.getMergedConfig() ?? null,
				workspaceRoot,
			);
			const aiRiskService = new NoopAIRiskService(); // Phase 2.0 - no AI risk yet
			protectionService = new ProtectionService(
				protectedFileRegistry,
				protectionManager,
				aiRiskService,
				async (key, value) => {
					await vscode.commands.executeCommand("setContext", key, value);
				},
			);

			// Run initial audit to set context keys
			await protectionService.auditRepo();
		} else {
			// Fallback: create minimal noop service
			// This path should rarely execute since protectedFileRegistry is usually available
			const noopRegistry = {} as ProtectedFileRegistry;
			const noopManager = new ProtectionManager(noopRegistry, () => null);
			protectionService = new ProtectionService(
				noopRegistry,
				noopManager,
				new NoopAIRiskService(),
				() => Promise.resolve(),
			);
		}

		PhaseLogger.logPhase("3: Business Logic Managers");

		return {
			workspaceMemoryManager,
			operationCoordinator,
			snapshotManager,
			smartContextDetector,
			workflowIntegration,
			conflictResolver,
			notificationManager,
			snapshotSummaryProvider,
			// snapshotRestoreUI will be added in phase 4
			snapshotNavigatorProvider,
			statusBarController,
			protectionService, // 🟢 TDD GREEN
		};
	} catch (error) {
		PhaseLogger.logError("3: Business Logic Managers", error as Error);
		throw error;
	}
}
