import * as vscode from "vscode";
import { ConflictResolver } from "../conflictResolver";
import { NotificationManager } from "../notificationManager";
import { OperationCoordinator } from "../operationCoordinator";
import { PlatformCoordinator } from "../platform/PlatformCoordinator";
import { NoopAIRiskService } from "../services/aiRiskService";
import { getDaemonBridge } from "../services/DaemonBridge";
import { MCPToolsService } from "../services/MCPToolsService";
import { ProtectionManager } from "../services/protectionPolicy";
import { ProtectionService } from "../services/protectionService";
import { StorageSnapshotSummaryProvider } from "../services/snapshotSummaryProvider";
import { SmartContextDetector } from "../smartContext";
import { SessionCoordinator } from "../snapshot/SessionCoordinator";
import { SnapshotManager } from "../snapshot/SnapshotManager";
import { SnapshotStorageAdapter } from "../snapshot/SnapshotStorageAdapter";
import { VSCodeConfirmationService } from "../snapshot/VSCodeConfirmationService";
import { logger } from "../utils/logger";
import { SnapshotNavigatorProvider } from "../views/snapshotNavigatorProvider";
import { WorkflowIntegration } from "../workflowIntegration";
import { WorkspaceMemoryManager } from "../workspaceMemory";
import type { AppContext } from "./AppContext";
import { PhaseLogger } from "./phaseLogger";

export async function initializePhase3Managers(appContext: AppContext): Promise<void> {
	const { context, workspaceRoot, storage, telemetryProxy, protectedFileRegistry, snapbackrcLoader, eventBus } =
		appContext;

	if (!storage || !telemetryProxy || !protectedFileRegistry) {
		throw new Error("Missing dependencies for Phase 3");
	}

	const phase3Start = Date.now();
	logger.info("Phase 3 (Managers) starting");

	try {
		appContext.notificationManager = new NotificationManager();
		appContext.workspaceMemoryManager = new WorkspaceMemoryManager(storage);
		appContext.conflictResolver = new ConflictResolver();
		appContext.smartContextDetector = new SmartContextDetector(appContext.workspaceMemoryManager);

		const { UnifiedOnboardingService } = await import("../services/UnifiedOnboardingService");
		appContext.unifiedOnboarding = new UnifiedOnboardingService(
			context.globalState,
			telemetryProxy,
			appContext.notificationManager,
		);

		appContext.sessionCoordinator = new SessionCoordinator(storage);
		appContext.operationCoordinator = new OperationCoordinator(
			appContext.workspaceMemoryManager,
			appContext.notificationManager,
			storage,
			telemetryProxy,
			appContext.conflictResolver,
			appContext.unifiedOnboarding,
			appContext.sessionCoordinator,
			eventBus,
		);

		const confirmationService = new VSCodeConfirmationService();
		const vsEventEmitter = new vscode.EventEmitter();
		const eventEmitter = {
			emit: (type: string, data: unknown) => {
				vsEventEmitter.fire({ type, data });
			},
		};

		appContext.snapshotManager = new SnapshotManager(
			workspaceRoot,
			new SnapshotStorageAdapter(storage),
			confirmationService,
			eventEmitter,
			appContext.sessionCoordinator,
		);

		appContext.snapshotSummaryProvider = new StorageSnapshotSummaryProvider(storage);
		appContext.snapshotNavigatorProvider = new SnapshotNavigatorProvider(storage);
		appContext.workflowIntegration = new WorkflowIntegration(
			appContext.smartContextDetector,
			appContext.notificationManager,
		);

		const protectionManager = new ProtectionManager(
			protectedFileRegistry,
			() => snapbackrcLoader?.getMergedConfig() ?? null,
			workspaceRoot,
		);
		const aiRiskService = new NoopAIRiskService();
		appContext.protectionService = new ProtectionService(
			protectedFileRegistry,
			protectionManager,
			aiRiskService,
			(key, value) => {
				vscode.commands.executeCommand("setContext", key, value);
				return Promise.resolve();
			},
		);

		setImmediate(() => {
			appContext.protectionService?.auditRepo().catch((err) => {
				logger.error("Deferred repo audit failed:", err);
			});
		});

		appContext.mcpToolsService = new MCPToolsService({
			workspaceRoot,
			sessionCoordinator: appContext.sessionCoordinator,
			protectedFileRegistry,
			storage,
		});

		appContext.platformCoordinator = new PlatformCoordinator(context, workspaceRoot);
		appContext.platformCoordinator.onCelebration((celebration) => {
			logger.info("Celebration event", { type: celebration.type, message: celebration.message });
		});

		const daemonBridge = getDaemonBridge();
		appContext.platformCoordinator.wireDaemonBridge(daemonBridge);

		const packageJson = context.extension?.packageJSON as { version?: string } | undefined;
		const version = packageJson?.version || "unknown";

		appContext.platformCoordinator
			.initialize("extension", version)
			.catch((err) => logger.warn("PlatformCoordinator init failed", { err }));

		logger.info("Phase 3 (Managers) completed", { duration: Date.now() - phase3Start });
		PhaseLogger.logPhase("3: Business Logic Managers");
	} catch (error) {
		PhaseLogger.logError("3: Business Logic Managers", error as Error);
		throw error;
	}
}
