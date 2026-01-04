import * as vscode from "vscode";
import { ConflictResolver } from "../conflictResolver";
import { NotificationManager } from "../notificationManager";
import { OperationCoordinator } from "../operationCoordinator";
import { NoopAIRiskService } from "../services/aiRiskService";
import type { ProtectedFileRegistry } from "../services/protectedFileRegistry";
import { ProtectionManager } from "../services/protectionPolicy";
import { ProtectionService } from "../services/protectionService";
import { StorageSnapshotSummaryProvider } from "../services/snapshotSummaryProvider";
import { SmartContextDetector } from "../smartContext";
import { SessionCoordinator } from "../snapshot/SessionCoordinator";
import { SnapshotManager } from "../snapshot/SnapshotManager";
import { SnapshotStorageAdapter } from "../snapshot/SnapshotStorageAdapter";
import { VSCodeConfirmationService } from "../snapshot/VSCodeConfirmationService";
import type { IStorageManager } from "../storage/types";
import type { IEventEmitter } from "../types/snapshot";
import { SnapshotNavigatorProvider } from "../views/snapshotNavigatorProvider";
import { WorkflowIntegration } from "../workflowIntegration";
import { WorkspaceMemoryManager } from "../workspaceMemory";
import { PhaseLogger } from "./phaseLogger";

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
	protectionService: ProtectionService; // 🟢 TDD GREEN: Protection audit service
	milestoneService: MilestoneService;
	mcpToolsService: MCPToolsService | null; // 🔧 MCP Tools integration
}

import { MCPToolsService } from "../services/MCPToolsService";
import { MilestoneService } from "../services/MilestoneService";
import type { TelemetryProxy } from "../services/telemetry-proxy";
import { logger } from "../utils/logger";

export async function initializePhase3Managers(
	_context: vscode.ExtensionContext,
	workspaceRoot: string,
	storage: IStorageManager,
	telemetryProxy: TelemetryProxy,
	protectedFileRegistry?: ProtectedFileRegistry,
	snapbackrcLoader?: import("../protection/SnapBackRCLoader.js").SnapBackRCLoader,
	eventBus?: import("@snapback/contracts").SnapBackEventBus,
): Promise<Phase3Result> {
	const phase3Start = Date.now();
	logger.debug("Phase 3 starting...");
	try {
		// Initialize notification manager
		let t = Date.now();
		const notificationManager = new NotificationManager();
		logger.debug("NotificationManager", { ms: Date.now() - t });

		// Initialize workspace memory manager
		t = Date.now();
		const workspaceMemoryManager = new WorkspaceMemoryManager(storage);
		logger.debug("WorkspaceMemoryManager", { ms: Date.now() - t });

		// Initialize conflict resolver
		t = Date.now();
		const conflictResolver = new ConflictResolver();
		logger.debug("ConflictResolver", { ms: Date.now() - t });

		// Initialize smart context detector
		t = Date.now();
		const smartContextDetector = new SmartContextDetector(workspaceMemoryManager);
		logger.debug("SmartContextDetector", { ms: Date.now() - t });

		// Initialize Milestone Service
		t = Date.now();
		const milestoneService = new MilestoneService(_context, telemetryProxy, notificationManager);
		logger.debug("MilestoneService", { ms: Date.now() - t });

		// Initialize SessionCoordinator (needed by OperationCoordinator for snapshot file tracking)
		t = Date.now();
		const sessionCoordinator = new SessionCoordinator(storage);
		logger.debug("SessionCoordinator", { ms: Date.now() - t });

		// Initialize operation coordinator
		t = Date.now();
		const operationCoordinator = new OperationCoordinator(
			workspaceMemoryManager,
			notificationManager,
			storage,
			telemetryProxy,
			conflictResolver,
			milestoneService,
			sessionCoordinator, // BUG FIX: Wire in SessionCoordinator for snapshot file tracking
			eventBus, // Wire in event bus
		);
		logger.debug("OperationCoordinator", { ms: Date.now() - t });

		// Initialize confirmation service
		t = Date.now();
		const confirmationService = new VSCodeConfirmationService();
		logger.debug("VSCodeConfirmationService", { ms: Date.now() - t });

		// Initialize event emitter for snapshot manager
		t = Date.now();
		const vsEventEmitter = new vscode.EventEmitter();

		// Create adapter that implements IEventEmitter interface
		const eventEmitter: IEventEmitter = {
			emit: (type: string, data: unknown) => {
				vsEventEmitter.fire({ type, data });
			},
		};
		logger.debug("EventEmitter setup", { ms: Date.now() - t });

		// Initialize SnapshotManager with SessionCoordinator
		t = Date.now();
		const snapshotManager = new SnapshotManager(
			workspaceRoot,
			new SnapshotStorageAdapter(storage),
			confirmationService,
			eventEmitter,
			sessionCoordinator,
		);
		logger.debug("SnapshotManager", { ms: Date.now() - t });

		// Initialize SnapshotSummaryProvider
		t = Date.now();
		const snapshotSummaryProvider = new StorageSnapshotSummaryProvider(storage);
		logger.debug("StorageSnapshotSummaryProvider", {
			ms: Date.now() - t,
		});

		// Initialize SnapshotNavigatorProvider
		t = Date.now();
		const snapshotNavigatorProvider = new SnapshotNavigatorProvider(storage);
		logger.debug("SnapshotNavigatorProvider", { ms: Date.now() - t });

		// Initialize WorkflowIntegration
		t = Date.now();
		const workflowIntegration = new WorkflowIntegration(smartContextDetector, notificationManager);
		logger.debug("WorkflowIntegration", { ms: Date.now() - t });

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
				(key, value) => {
					// Fire-and-forget for performance - IPC overhead adds 700-1000ms to activation
					vscode.commands.executeCommand("setContext", key, value);
					return Promise.resolve();
				},
			);
			logger.debug("ProtectionManager + ProtectionService", {
				ms: Date.now() - t,
			});

			// ⚡ DEFER AUDIT: Run audit asynchronously after activation
			// This prevents blocking the 500ms activation budget
			setImmediate(() => {
				protectionService.auditRepo().catch((err) => {
					logger.error("Deferred repo audit failed:", err);
				});
			});
		} else {
			// Fallback: create minimal noop service
			// This path should rarely execute since protectedFileRegistry is usually available
			const noopRegistry = {} as ProtectedFileRegistry;
			const noopManager = new ProtectionManager(noopRegistry, () => null);
			protectionService = new ProtectionService(noopRegistry, noopManager, new NoopAIRiskService(), () =>
				Promise.resolve(),
			);
			logger.debug("ProtectionService (fallback)", {
				ms: Date.now() - t,
			});
		}

		// 🔧 Initialize MCPToolsService for direct MCP tool access
		t = Date.now();
		let mcpToolsService: MCPToolsService | null = null;
		if (protectedFileRegistry) {
			mcpToolsService = new MCPToolsService({
				workspaceRoot,
				sessionCoordinator,
				protectedFileRegistry,
				storage,
			});
			logger.debug("MCPToolsService", { ms: Date.now() - t });
		} else {
			logger.debug("MCPToolsService skipped (no registry)");
		}

		logger.debug("Phase 3 completed", { ms: Date.now() - phase3Start });
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
			protectionService, // 🟢 TDD GREEN
			milestoneService,
			mcpToolsService, // 🔧 MCP Tools integration
		};
	} catch (error) {
		PhaseLogger.logError("3: Business Logic Managers", error as Error);
		throw error;
	}
}
