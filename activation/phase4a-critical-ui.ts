/**
 * Phase 4a: Critical UI Components (Activation-Blocking)
 *
 * Task #14: Activation Event Optimization
 * These components MUST be ready immediately for core UX.
 * Target: <20ms completion time
 *
 * DISPOSAL PATTERN (SB-274):
 * All components created here must be registered for cleanup:
 * - Push disposables to context.subscriptions for auto-cleanup on deactivation
 * - Store event bus subscription disposables (eventBus.on() returns Disposable)
 * - Tree providers should implement vscode.Disposable with dispose() method
 *
 * Example:
 *   const disposable = eventBus.on('event', handler);
 *   context.subscriptions.push(disposable);
 *
 * @see phase4b-deferred-ui.ts for non-critical UI components
 */

import * as vscode from "vscode";
import { COMMANDS } from "../constants/index";
import { MCPStatusItem } from "../ui/MCPStatusItem";
import { getProjectionStore } from "../ui/ProjectionStore";
import { createStatusBarController } from "../ui/statusBar/StatusBarController";
import { createVitalsUIIntegration } from "../ui/VitalsUIIntegration";
import { logger } from "../utils/logger";
import type { AppContext } from "./AppContext";
import { PhaseLogger } from "./phaseLogger";

/**
 * Initialize only critical UI components that must be ready at activation
 *
 * Critical UI components:
 * - Status bar controller (data backend for status bar)
 * - MCP status item (connection indicator)
 * - Vitals UI integration (data service only, UI deferred)
 *
 * All tree providers, decorations, and non-essential UI deferred to Phase 4b
 */
export async function initializePhase4aCriticalUI(appContext: AppContext): Promise<true> {
	const { context, workspaceRoot } = appContext;

	const phase4aStart = Date.now();
	logger.debug("Phase 4a (Critical UI) starting...");

	try {
		const workspaceId = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? workspaceRoot;

		// StatusFlagManager is already created by initializeSignalSystem in extension.ts
		// No need to create a separate StatusBarManager - use statusFlagManager from appContext
		if (!appContext.statusFlagManager) {
			logger.warn("Phase 4a: statusFlagManager not available - status bar may not display correctly");
		}

		// Show degraded status messaging if NoopAIRiskService is active
		// This ensures users know risk assessment is disabled
		const riskServiceInfo = (appContext as unknown as Record<string, unknown>)._riskServiceInfo as
			| { type?: string }
			| undefined;
		if (riskServiceInfo?.type === "noop") {
			setImmediate(() => {
				appContext.statusFlagManager?.enqueueMessage({
					id: "risk-engine-disabled",
					priority: "medium",
					text: "🛡️ Risk engine: Disabled (connect account)",
					tooltip:
						"**Advanced risk scoring unavailable**\n\nConnect your Vreko account to enable AI-powered risk analysis.\n\n*Click to open settings*",
					duration: 15000, // 15 seconds - long enough to be noticed
					command: COMMANDS.UTILITY.OPEN_SETTINGS,
				});
				logger.info("Status bar: Shown degraded risk service message");
			});
		}

		// Wire SNAPSHOT_CREATED event → incrementSnapshotCount()
		// This is the ONLY place the counter should be incremented.
		// SB-267: Store disposable to prevent memory leak
		if (appContext.eventBus) {
			const snapshotCreatedDisposable = appContext.eventBus.on("snapshot:created", () => {
				appContext.statusFlagManager?.incrementSnapshotCount();
			});
			context.subscriptions.push(snapshotCreatedDisposable);
			logger.debug("SNAPSHOT_CREATED event handler registered for status bar counter");
		}

		// ProjectionStore - CRITICAL (central projection cache for all surfaces)
		// Must be activated before any surface that consumes projected state.
		if (appContext.daemonBridge) {
			const projectionStore = getProjectionStore(workspaceId);
			projectionStore.activate(appContext.daemonBridge, workspaceId);
			appContext.projectionStore = projectionStore;
			context.subscriptions.push(projectionStore);
			logger.debug("ProjectionStore activated with DaemonBridge");
		}

		// MCP Status Item - CRITICAL (connection indicator)
		appContext.mcpStatusItem = new MCPStatusItem();
		context.subscriptions.push(appContext.mcpStatusItem);

		// Vitals UI Integration - Data service only (UI deferred)
		// Create NudgeManager inline to avoid heavy import
		const { NudgeManager } = await import("../nurturing/NudgeManager");
		const nudgeManager = new NudgeManager(context);

		appContext.vitalsUIIntegration = createVitalsUIIntegration(
			workspaceId,
			workspaceRoot,
			context.extensionUri,
			appContext.statusFlagManager!,
			nudgeManager,
		);
		context.subscriptions.push(appContext.vitalsUIIntegration);

		// Status Bar Controller - Data backend for status bar
		const dataService = appContext.vitalsUIIntegration.getDataService();
		appContext.statusBarController = createStatusBarController(dataService, appContext.statusFlagManager!);
		context.subscriptions.push(appContext.statusBarController);

		// 🐛 FIX: Initialize providers in Phase 4a so they exist before Phase 5 registration
		// Previously these were in Phase 4b (deferred), causing all providers to be undefined
		// when Phase 5 tried to register them. Provider creation is lightweight - the heavy
		// work (data loading, tree refreshes) happens asynchronously after registration.
		logger.debug("Phase 4a: Initializing providers before Phase 5 registration");

		// Snapshot Document Provider - for viewing snapshot diffs
		if (!appContext.snapshotDocumentProvider) {
			const { SnapshotDocumentProvider } = await import("../providers/SnapshotDocumentProvider");
			appContext.snapshotDocumentProvider = new SnapshotDocumentProvider();
			logger.debug("Phase 4a: snapshotDocumentProvider created");
		}

		// Protection Decoration Provider
		if (appContext.protectedFileRegistry) {
			const { ProtectionDecorationProvider } = await import("../ui/ProtectionDecorationProvider");
			appContext.protectionDecorationProvider = new ProtectionDecorationProvider(
				appContext.protectedFileRegistry,
				workspaceRoot,
			);
			logger.debug("Phase 4a: protectionDecorationProvider created");
		}

		// File Health Decoration Provider
		const { FileHealthDecorationProvider } = await import("../decorations/FileHealthDecorationProvider");
		appContext.fileHealthDecorationProvider = new FileHealthDecorationProvider();
		logger.debug("Phase 4a: fileHealthDecorationProvider created");

		// Snapshot Navigator Provider
		if (appContext.storage) {
			const { SnapshotNavigatorProvider } = await import("../views/snapshotNavigatorProvider");
			appContext.snapshotNavigatorProvider = new SnapshotNavigatorProvider(appContext.storage);
			logger.debug("Phase 4a: snapshotNavigatorProvider created");
		}

		// Detection Code Action Provider
		const { DetectionCodeActionProvider } = await import("../providers/DetectionCodeActionProvider");
		appContext.detectionCodeActionProvider = new DetectionCodeActionProvider();
		logger.debug("Phase 4a: detectionCodeActionProvider created");

		// Protection CodeLens Provider
		if (appContext.protectedFileRegistry) {
			const { ProtectionCodeLensProvider } = await import("../providers/ProtectionCodeLensProvider");
			appContext.protectionCodeLensProvider = new ProtectionCodeLensProvider(appContext.protectedFileRegistry);
			logger.debug("Phase 4a: protectionCodeLensProvider created");
		}

		// NOTE: CockpitTreeProvider is registered in phase5-registration.ts
		// Per spec Section 4: ONE sidebar view only (no separate Intelligence/Sessions/Dashboard trees)

		const duration = Date.now() - phase4aStart;
		logger.debug("Phase 4a (Critical UI) completed", { duration });
		PhaseLogger.logPhase(`4a: Critical UI (${duration}ms)`);
	} catch (error) {
		PhaseLogger.logError("4a: Critical UI", error as Error);
		throw error;
	}
	return true;
}
