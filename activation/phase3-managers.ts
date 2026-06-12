import { getGlobalProbeStore } from "@vreko/core";
import * as vscode from "vscode";
import { isDiagnosticsEnabled } from "../config/diagnostics";
import { ConflictResolver } from "../conflictResolver";
import { OperationCoordinator } from "../operationCoordinator";
import { PlatformCoordinator } from "../platform/PlatformCoordinator";
import { getDaemonBridge } from "../services/DaemonBridge";
import { MCPToolsService } from "../services/MCPToolsService";
import { ProtectionManager } from "../services/protectionPolicy";
import { ProtectionService } from "../services/protectionService";
import { StorageSnapshotSummaryProvider } from "../services/snapshotSummaryProvider";
import { SmartContextDetector } from "../smartContext";
import { SessionCoordinator } from "../snapshot/SessionCoordinator";
import { SnapshotManager } from "../snapshot/SnapshotManager";
import { VSCodeConfirmationService } from "../snapshot/VSCodeConfirmationService";
import { HybridSnapshotAdapter } from "../storage/HybridSnapshotAdapter";
import type { AIRiskAssessment, AIRiskService } from "../types/risk-types";
import { NotificationCoordinator } from "../ui/NotificationCoordinator";
import { logger } from "../utils/logger";
import { SnapshotNavigatorProvider } from "../views/snapshotNavigatorProvider";
import { WorkflowIntegration } from "../workflowIntegration";
import { WorkspaceMemoryManager } from "../workspaceMemory";
import type { AppContext } from "./AppContext";
import { PhaseLogger } from "./phaseLogger";

export async function initializePhase3Managers(appContext: AppContext): Promise<true> {
	const { context, workspaceRoot, storage, telemetryProxy, protectedFileRegistry, vrekorcLoader, eventBus } =
		appContext;

	if (!storage || !telemetryProxy || !protectedFileRegistry) {
		throw new Error("Missing dependencies for Phase 3");
	}

	const phase3Start = Date.now();
	logger.info("Phase 3 (Managers) starting");

	try {
		appContext.notificationCoordinator = new NotificationCoordinator();
		appContext.workspaceMemoryManager = new WorkspaceMemoryManager(storage);
		appContext.conflictResolver = new ConflictResolver();
		appContext.smartContextDetector = new SmartContextDetector(appContext.workspaceMemoryManager);

		const { UnifiedOnboardingService } = await import("../services/UnifiedOnboardingService");
		appContext.unifiedOnboarding = new UnifiedOnboardingService(
			context.globalState,
			telemetryProxy,
			appContext.notificationCoordinator,
		);

		appContext.sessionCoordinator = new SessionCoordinator(storage);

		// WU-3.2: Get DaemonBridge early for thin-client snapshot operations
		const daemonBridge = getDaemonBridge(workspaceRoot);
		logger.info("[DAEMON-PHASE3] DaemonBridge retrieved", {
			isConnected: daemonBridge?.isConnected() ?? false,
			workspaceRoot,
		});

		appContext.operationCoordinator = new OperationCoordinator(
			appContext.workspaceMemoryManager,
			appContext.notificationCoordinator,
			storage,
			telemetryProxy,
			appContext.conflictResolver,
			appContext.unifiedOnboarding,
			appContext.sessionCoordinator,
			eventBus,
			daemonBridge,
		);

		const confirmationService = new VSCodeConfirmationService();
		const vsEventEmitter = new vscode.EventEmitter();
		const eventEmitter = {
			emit: (type: string, data: unknown) => {
				vsEventEmitter.fire({ type, data });
			},
		};

		// WU-3.2 (fixed): HybridSnapshotAdapter starts on local storage and upgrades
		// to daemon adapter the moment onStateChange fires 'connected'.  This avoids
		// the cold-start race where isConnected() returns false during phase 3 init
		// even though the daemon connects 1–8 s later.
		const snapshotStorage = new HybridSnapshotAdapter(daemonBridge, storage, workspaceRoot);

		logger.info("[DAEMON-PHASE3] HybridSnapshotAdapter created", {
			daemonAlreadyConnected: daemonBridge.isConnected(),
		});

		appContext.snapshotManager = new SnapshotManager(
			workspaceRoot,
			snapshotStorage,
			confirmationService,
			eventEmitter,
			appContext.sessionCoordinator,
		);

		appContext.snapshotSummaryProvider = new StorageSnapshotSummaryProvider(storage);
		appContext.snapshotNavigatorProvider = new SnapshotNavigatorProvider(storage);
		appContext.workflowIntegration = new WorkflowIntegration(
			appContext.smartContextDetector,
			appContext.notificationCoordinator,
		);

		const protectionManager = new ProtectionManager(
			protectedFileRegistry,
			() => vrekorcLoader?.getMergedConfig() ?? null,
			workspaceRoot,
		);

		// Delegate risk assessment to daemon IPC  -  thin-client pattern (Phase 2B)
		// RemoteAIRiskService/NoopAIRiskService removed: all risk computation lives in the daemon.
		const riskDaemonConnected = daemonBridge.isConnected();
		const riskServiceType: "daemon" | "noop" = riskDaemonConnected ? "daemon" : "noop";
		const riskDegradedReason: string | undefined = !riskDaemonConnected ? "daemon_not_connected" : undefined;

		const aiRiskService: AIRiskService = {
			async assessChange(change) {
				try {
					return await daemonBridge.request<AIRiskAssessment>("risk/assess", {
						filePath: change.filePath,
						...(change.category !== undefined && { category: change.category }),
					});
				} catch {
					logger.debug("risk/assess: daemon unavailable, defaulting to low risk");
					return { level: "low" as const, score: 0, confidence: 0.5, factors: [], timestamp: Date.now() };
				}
			},
			getCachedRisk(_filePath: string) {
				return null;
			},
			clearCache(_filePath: string) {
				/* noop  -  daemon handles caching */
			},
		};

		// Path Attribution Probe: Record risk service instantiation
		const diagnosticsEnabled = isDiagnosticsEnabled();
		if (diagnosticsEnabled) {
			const probeStore = getGlobalProbeStore();
			probeStore.record({
				capability: "risk",
				impl: riskServiceType === "daemon" ? "DaemonRiskService" : "NoopRiskService",
				reason: riskDegradedReason ?? (riskServiceType === "daemon" ? "daemon_connected" : "default_fallback"),
				latency_ms: 0,
				wired: riskServiceType === "daemon",
			});
			logger.info("[Path Attribution] Risk service probe recorded", {
				impl: riskServiceType === "daemon" ? "DaemonRiskService" : "NoopRiskService",
				reason: riskDegradedReason,
			});
		}

		// Store risk service type in app context for probe instrumentation
		(appContext as unknown as Record<string, unknown>)._riskServiceInfo = {
			type: riskServiceType,
			degradedReason: riskDegradedReason,
		};

		logger.info("AIRiskService initialization complete", { riskServiceType, degradedReason: riskDegradedReason });

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
		});

		appContext.platformCoordinator = new PlatformCoordinator(context, workspaceRoot);
		appContext.platformCoordinator.onCelebration((celebration) => {
			logger.info("Celebration event", { type: celebration.type, message: celebration.message });
		});

		logger.info("[DAEMON-PHASE3] Wiring DaemonBridge to PlatformCoordinator", {
			daemonConnected: daemonBridge?.isConnected() ?? false,
		});
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
	return true;
}
