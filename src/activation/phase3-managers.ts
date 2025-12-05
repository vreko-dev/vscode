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
import { SessionCoordinator } from "../snapshot/SessionCoordinator.js";
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
	sessionCoordinator: SessionCoordinator;
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
	const phase3Start = Date.now();
	console.log("[PERF] Phase 3 starting...");
	try {
		// Initialize notification manager
		let t = Date.now();
		const notificationManager = new NotificationManager();
		console.log("[PERF] NotificationManager", { ms: Date.now() - t });

		// Initialize workspace memory manager
		t = Date.now();
		const workspaceMemoryManager = new WorkspaceMemoryManager(storage);
		console.log("[PERF] WorkspaceMemoryManager", { ms: Date.now() - t });

		// Initialize conflict resolver
		t = Date.now();
		const conflictResolver = new ConflictResolver();
		console.log("[PERF] ConflictResolver", { ms: Date.now() - t });

		// Initialize smart context detector
		t = Date.now();
		const smartContextDetector = new SmartContextDetector(
			workspaceMemoryManager,
		);
		console.log("[PERF] SmartContextDetector", { ms: Date.now() - t });

		// Initialize operation coordinator
		t = Date.now();
		const operationCoordinator = new OperationCoordinator(
			workspaceMemoryManager,
			notificationManager,
			storage,
			conflictResolver,
		);
		console.log("[PERF] OperationCoordinator", { ms: Date.now() - t });

		// Initialize confirmation service
		t = Date.now();
		const confirmationService = new VSCodeConfirmationService();
		console.log("[PERF] VSCodeConfirmationService", { ms: Date.now() - t });

		// Initialize event emitter for snapshot manager
		t = Date.now();
		const vsEventEmitter = new vscode.EventEmitter();

		// Create adapter that implements IEventEmitter interface
		const eventEmitter: IEventEmitter = {
			emit: (type: string, data: unknown) => {
				vsEventEmitter.fire({ type, data });
			},
		};
		console.log("[PERF] EventEmitter setup", { ms: Date.now() - t });

		// Initialize SessionCoordinator (needed by SnapshotManager)
		t = Date.now();
		const sessionCoordinator = new SessionCoordinator(storage);
		console.log("[PERF] SessionCoordinator", { ms: Date.now() - t });

		// Initialize SnapshotManager with SessionCoordinator
		t = Date.now();
		const snapshotManager = new SnapshotManager(
			workspaceRoot,
			new SnapshotStorageAdapter(storage),
			confirmationService,
			eventEmitter,
			sessionCoordinator,
		);
		console.log("[PERF] SnapshotManager", { ms: Date.now() - t });

		// Initialize SnapshotSummaryProvider
		t = Date.now();
		const snapshotSummaryProvider = new StorageSnapshotSummaryProvider(storage);
		console.log("[PERF] StorageSnapshotSummaryProvider", {
			ms: Date.now() - t,
		});

		// Initialize StatusBarController
		t = Date.now();
		const statusBarController = new StatusBarController(protectedFileRegistry);
		console.log("[PERF] StatusBarController", { ms: Date.now() - t });

		// Initialize SnapshotNavigatorProvider
		t = Date.now();
		const snapshotNavigatorProvider = new SnapshotNavigatorProvider(storage);
		console.log("[PERF] SnapshotNavigatorProvider", { ms: Date.now() - t });

		// Initialize WorkflowIntegration
		t = Date.now();
		const workflowIntegration = new WorkflowIntegration(
			smartContextDetector,
			notificationManager,
		);
		console.log("[PERF] WorkflowIntegration", { ms: Date.now() - t });

		// 🟢 TDD GREEN: Initialize ProtectionService for repo audit
		// Only create if protectedFileRegistry is available
		t = Date.now();
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
			console.log("[PERF] ProtectionManager + ProtectionService", {
				ms: Date.now() - t,
			});

			// ⚡ DEFER AUDIT: Run audit asynchronously after activation
			// This prevents blocking the 500ms activation budget
			setImmediate(() => {
				protectionService.auditRepo().catch((err) => {
					console.error("Deferred repo audit failed:", err);
				});
			});
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
			console.log("[PERF] ProtectionService (fallback)", {
				ms: Date.now() - t,
			});
		}

		console.log("[PERF] Phase 3 completed", { ms: Date.now() - phase3Start });
		PhaseLogger.logPhase("3: Business Logic Managers");

		return {
			workspaceMemoryManager,
			operationCoordinator,
			sessionCoordinator,
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
