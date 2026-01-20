import * as vscode from "vscode";
import { ConflictResolver } from "../conflictResolver";
import { NotificationManager } from "../notificationManager";
import { OperationCoordinator } from "../operationCoordinator";
import { PlatformCoordinator } from "../platform/PlatformCoordinator";
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
	unifiedOnboarding: import("../services/UnifiedOnboardingService").UnifiedOnboardingService;
	mcpToolsService: MCPToolsService | null; // 🔧 MCP Tools integration
	platformCoordinator: PlatformCoordinator; // 🎯 Multi-surface coordination
}

import { MCPToolsService } from "../services/MCPToolsService";
import type { TelemetryProxy } from "../services/telemetry-proxy";
import { logger } from "../utils/logger";

export async function initializePhase3Managers(
	context: vscode.ExtensionContext,
	workspaceRoot: string,
	storage: IStorageManager,
	telemetryProxy: TelemetryProxy,
	protectedFileRegistry?: ProtectedFileRegistry,
	snapbackrcLoader?: import("../protection/SnapBackRCLoader.js").SnapBackRCLoader,
	eventBus?: import("@snapback/contracts").SnapBackEventBus,
	mcpHealthGuardian?: import("../services/MCPHealthGuardian").MCPHealthGuardian,
): Promise<Phase3Result> {
	const phase3Start = Date.now();
	logger.info("Phase 3 (Managers) starting - tracking file operations", {
		workspaceRoot,
		timestamp: Date.now(),
	});
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

		// SnapBack Unified Onboarding is initialized here (replaces MilestoneService)
		// This must happen in Phase 3 because OperationCoordinator depends on it
		t = Date.now();
		const { UnifiedOnboardingService } = await import("../services/UnifiedOnboardingService");
		const unifiedOnboarding = new UnifiedOnboardingService(
			context.globalState,
			telemetryProxy,
			notificationManager,
		);
		// Note: initialize() will be called in Phase 15 to avoid blocking Phase 3
		logger.debug("UnifiedOnboardingService created", { ms: Date.now() - t });

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
			unifiedOnboarding,
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

		const phase3Duration = Date.now() - phase3Start;
		logger.info("Phase 3 (Managers) completed successfully", {
			duration: phase3Duration,
			workspaceRoot,
			timestamp: Date.now(),
		});
		logger.debug("Phase 3 completed", { ms: phase3Duration });
		PhaseLogger.logPhase("3: Business Logic Managers");

		// 🎯 Initialize PlatformCoordinator for multi-surface coordination
		// This happens after all managers are created so it can wire up celebrations
		// PERF: Fire-and-forget initialization saves ~300ms from activation critical path
		t = Date.now();
		const platformCoordinator = new PlatformCoordinator(context, workspaceRoot);

		// Wire celebration events to notification manager (sync, fast)
		platformCoordinator.onCelebration((celebration) => {
			logger.info("Celebration event", { type: celebration.type, message: celebration.message });
			// Celebrations are already shown as toasts by PlatformCoordinator
		});

		// Wire MCPHealthGuardian if available (sync, fast)
		if (mcpHealthGuardian) {
			logger.debug("Wiring MCPHealthGuardian to PlatformCoordinator");
			platformCoordinator.wireHealthGuardian(mcpHealthGuardian);
		}

		// Fire-and-forget: Initialize with extension surface (async, deferred)
		// Celebrations and first-init detection happen in background
		const packageJson = context.extension?.packageJSON as { version?: string } | undefined;
		const version = packageJson?.version || "unknown";

		platformCoordinator
			.initialize("extension", version)
			.then((initResult) => {
				if (initResult.celebration) {
					logger.info("Platform initialized (deferred)", {
						firstInit: initResult.firstInit,
						workspaceId: initResult.workspaceId,
						celebration: initResult.celebration.message,
					});
				}
			})
			.catch((error) => {
				logger.warn("PlatformCoordinator initialization failed (non-critical)", {
					error: error instanceof Error ? error.message : String(error),
				});
			});

		logger.debug("PlatformCoordinator (deferred init)", { ms: Date.now() - t });

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
			unifiedOnboarding,
			mcpToolsService, // 🔧 MCP Tools integration
			platformCoordinator, // 🎯 Multi-surface coordination
		};
	} catch (error) {
		PhaseLogger.logError("3: Business Logic Managers", error as Error);
		throw error;
	}
}
