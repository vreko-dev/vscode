/**
 * Phase 4b: Deferred UI Components (Non-Blocking)
 *
 * Task #14: Activation Event Optimization
 * These components are NOT needed immediately - deferred via setImmediate
 * Target: Runs AFTER activation completes
 *
 * @see phase4a-critical-ui.ts for critical UI components
 */

import * as vscode from "vscode";
import { registerDashboardCommands } from "../commands/dashboardCommands";
import { SnapshotDecorations } from "../decorations/snapshotDecorations";
// RecurrenceNotificationManager import removed: surface gate CLOSED (RECUR-02/03/04 pending).
import { DaemonHealthConsumer } from "../services/DaemonHealthConsumer";
import { WorkspaceSafetyService } from "../services/WorkspaceSafetyService";
import { WorkspaceDataService } from "../services/workspace-data";
import { getSignalEventBus } from "../signals/SignalEventBus";
import type { VrekoSignalEvent } from "../signals/types";
import { ActivityFeedBridge } from "../ui/ActivityFeedBridge";
import { registerVitalsCommands } from "../ui/VitalsUIIntegration";
import { logger } from "../utils/logger";
import type { AppContext } from "./AppContext";
import { PhaseLogger } from "./phaseLogger";

/**
 * Initialize non-critical UI components after activation completes
 *
 * Deferred UI components:
 * - Tree providers (user won't expand views immediately)
 * - Decoration providers (files not opened yet)
 * - Document providers (snapshots not viewed yet)
 * - Welcome view (not shown immediately)
 * - Workspace safety service (background monitoring)
 * - Dashboard commands (user won't invoke immediately)
 * - Vitals commands (user won't invoke immediately)
 *
 * All deferred to setImmediate - runs AFTER activation completes
 */
export async function initializePhase4bDeferredUI(appContext: AppContext): Promise<void> {
	const {
		context,
		workspaceRoot,
		storage,
		protectedFileRegistry,
		sessionCoordinator,
		snapshotSummaryProvider,
		operationCoordinator,
	} = appContext;

	if (
		!storage ||
		!protectedFileRegistry ||
		!sessionCoordinator ||
		!snapshotSummaryProvider ||
		!operationCoordinator
	) {
		logger.warn("Phase 4b: Missing dependencies, skipping deferred UI initialization");
		return;
	}

	const phase4bStart = Date.now();
	logger.debug("Phase 4b (Deferred UI) starting...");

	try {
		// 🐛 FIX: All provider initialization moved to Phase 4a
		// Phase 4b now only handles deferred/heavy UI work that doesn't block activation
		// This ensures providers exist before Phase 5 registration runs
		logger.debug("Phase 4b: Providers already initialized in Phase 4a, proceeding with deferred UI");

		// Get projection store from appContext (initialized in Phase 4a)
		const projectionStore = appContext.projectionStore;
		const workspaceId = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? workspaceRoot;

		// Snapshot Decorations - visual indicators for snapshots (heavy, can be deferred)
		if (storage) {
			appContext.snapshotDecorations = new SnapshotDecorations(storage);
			logger.debug("Phase 4b: snapshotDecorations created");
		}

		// ActivityFeedBridge  -  connects ProjectionStore daemon events to webview activity tab
		if (projectionStore) {
			const activityFeedBridge = new ActivityFeedBridge(projectionStore);
			appContext.activityFeedBridge = activityFeedBridge;
			context.subscriptions.push(activityFeedBridge);

			// Wire bridge → WorkspaceDataService so events flow to webview
			const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? workspaceRoot;
			const workspaceDataService = WorkspaceDataService.for(workspaceId, workspacePath, operationCoordinator);
			activityFeedBridge.wireTo((event) => workspaceDataService.pushDaemonEvent(event));

			// Wire ActivityPersistenceService → WorkspaceDataService for persisted events
			if (appContext.activityPersistenceService) {
				workspaceDataService.setActivityPersistenceService(appContext.activityPersistenceService);
			}
		}

		// Workspace Safety Service - background monitoring
		appContext.workspaceSafetyService = new WorkspaceSafetyService(snapshotSummaryProvider);
		// Defer auto-refresh to avoid blocking (runs every 30s)
		setImmediate(() => {
			appContext.workspaceSafetyService?.startAutoRefresh();
		});

		// Wire Integration Health Updates (Daemon Brain Pattern)
		// Query integration health from MCP daemon and update status bar tooltip
		const updateIntegrationHealth = async () => {
			try {
				const mcpClient = (
					appContext as { mcpClient?: { callTool: (tool: string, args: unknown) => Promise<unknown> } }
				).mcpClient;
				if (!mcpClient) {
					return;
				}

				const result = (await mcpClient.callTool("check", {
					mode: "integrations",
					workspaceRoot,
				})) as { content?: Array<{ text?: string }> };

				if (result?.content?.[0]?.text) {
					const data = JSON.parse(result.content[0].text);
					if (data.integrations) {
						const health = {
							github: {
								enabled: data.integrations.github?.enabled ?? false,
								connected: data.integrations.github?.connected ?? false,
								status: data.integrations.github?.connected
									? "✓ Connected"
									: "Not connected - configure in .vrekorc",
							},
							sentry: {
								enabled: data.integrations.sentry?.enabled ?? false,
								connected: data.integrations.sentry?.connected ?? false,
								status: data.integrations.sentry?.connected
									? "✓ Connected"
									: "Not connected - configure in .vrekorc",
							},
							context7: {
								enabled: data.integrations.context7?.enabled ?? false,
								connected: data.integrations.context7?.connected ?? false,
								status: data.integrations.context7?.connected
									? "✓ Connected"
									: "Not connected - configure in .vrekorc",
							},
						};
						appContext.statusFlagManager?.updateIntegrationHealth(health);
					}
				}
			} catch (error) {
				logger.debug("Could not fetch integration health", { error });
			}
		};

		// Poll integration health every 30s
		const healthInterval = setInterval(() => void updateIntegrationHealth(), 30000);
		context.subscriptions.push({ dispose: () => clearInterval(healthInterval) });

		// Initial health check (delayed to allow daemon connection to settle)
		setTimeout(() => void updateIntegrationHealth(), 5000);

		// Register vitals commands (dashboard, metrics)
		if (appContext.vitalsUIIntegration) {
			registerVitalsCommands(context, appContext.vitalsUIIntegration);
		}

		// Register dashboard commands (snapshot actions, protection actions)
		const dashboardDisposables = registerDashboardCommands(context, operationCoordinator);
		for (const d of dashboardDisposables) {
			context.subscriptions.push(d);
		}

		// =================================================================
		// DaemonHealthConsumer Activation
		// =================================================================
		const daemonBridge = appContext.daemonBridge;
		if (daemonBridge) {
			try {
				const healthConsumer = new DaemonHealthConsumer();

				// Activate with IPC adapter
				healthConsumer.activate({
					request: (method: string, params?: unknown) =>
						daemonBridge.request(method, (params ?? {}) as Record<string, unknown>),
					onNotification: (handler) => {
						// Subscribe to $/health-changed via DaemonBridge event system
						return daemonBridge.onHealthChanged((event) => {
							handler({ method: "$/health-changed", params: event as unknown });
						});
					},
				});

				// Wire health events to signal system
				let lastRecoveryAttemptMs = 0;
				healthConsumer.onStateChange((event) => {
					const eventBus = getSignalEventBus();

					if (event.currentState === "degraded" || event.currentState === "unhealthy") {
						const degradedEvent: VrekoSignalEvent = {
							type: "health.degraded",
							data: {
								pid: process.pid,
								componentType: "mcp",
								workspace: workspaceRoot,
								elapsed: 0,
								timestamp: Date.now(),
							},
						};
						eventBus.fire(degradedEvent);

						// Trigger automatic daemon recovery when unhealthy and disconnected,
						// with a 30s cooldown to prevent hammer behavior
						if (event.currentState === "unhealthy" && !daemonBridge.isConnected()) {
							const now = Date.now();
							if (now - lastRecoveryAttemptMs > 30_000) {
								lastRecoveryAttemptMs = now;
								logger.info("Phase 4b: Health consumer unhealthy  -  triggering daemon recovery");
								daemonBridge.resetAndRetry();
							}
						}
					} else if (
						(event.previousState === "unhealthy" || event.previousState === "degraded") &&
						event.currentState === "healthy"
					) {
						const recoveredEvent: VrekoSignalEvent = {
							type: "health.recovered",
							data: {
								pid: process.pid,
								componentType: "mcp",
								workspace: workspaceRoot,
								previousMissed: 0,
								timestamp: Date.now(),
							},
						};
						eventBus.fire(recoveredEvent);
					}
				});

				context.subscriptions.push(healthConsumer);
				appContext.daemonHealthConsumer = healthConsumer;
				logger.debug("Phase 4b: DaemonHealthConsumer activated");
			} catch (error) {
				// Non-critical - don't block activation
				logger.warn("Phase 4b: DaemonHealthConsumer activation failed (non-critical)", error as Error);
			}
		}

		// RecurrenceNotificationManager intentionally disabled: surface gate CLOSED.
		// RECUR-02 (calibrated stamp), RECUR-03 (evidence survival), RECUR-04 (aiReintroduced)
		// must ship and Pioneer calibration data must exist before this surface opens.
		// Re-enable by writing a gate spec and re-registering here.
		logger.debug("Phase 4b: RecurrenceNotificationManager skipped - surface gate closed (RECUR-02/03/04 pending)");

		const duration = Date.now() - phase4bStart;
		logger.debug("Phase 4b (Deferred UI) completed", { duration });
		PhaseLogger.logPhase(`4b: Deferred UI (${duration}ms)`);
	} catch (error) {
		PhaseLogger.logError("4b: Deferred UI", error as Error);
		// Don't throw - deferred UI failures shouldn't block activation
		logger.error("Phase 4b failed, continuing without deferred UI", error as Error);
	}
}
