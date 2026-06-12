import * as fs from "node:fs/promises";
import { FeatureManager } from "@vreko/contracts";
import * as vscode from "vscode";
import { StorageBridge } from "../bridges/StorageBridge";
import { VrekoRCDecorator } from "../decorators/vrekorcDecorator";
import { AutoProtectConfig } from "../protection/autoProtectConfig";
import { ConfigFileManager } from "../protection/ConfigFileManager";
import { VrekoRCLoader } from "../protection/VrekoRCLoader";
import { ActivityPersistenceService } from "../services/ActivityPersistenceService";
import { getDaemonBridge } from "../services/DaemonBridge";
import { spawnStateManager } from "../services/daemon-bridge/ConnectionManager";
import type { IProtectionManager } from "../services/protectedFileRegistry";
import { ProtectedFileRegistry } from "../services/protectedFileRegistry";
import { StalePRECleanupService } from "../services/StalePrecleanupService";
import { StorageManager } from "../storage/StorageManager";
import type { IStorageManager } from "../storage/types";
import { logger } from "../utils/logger";
import type { AppContext } from "./AppContext";
import { PhaseLogger } from "./phaseLogger";

/**
 * Create a simple in-memory protection manager for the extension.
 * This provides the SDK interface without heavy dependencies.
 */
function createInMemoryProtectionManager(): IProtectionManager {
	const protectedFiles = new Map<string, { level: "watch" | "warn" | "block"; reason?: string; addedAt: Date }>();

	return {
		protect(filePath: string, level: "watch" | "warn" | "block", reason?: string): void {
			protectedFiles.set(filePath, {
				level,
				reason,
				addedAt: new Date(),
			});
		},

		unprotect(filePath: string): void {
			protectedFiles.delete(filePath);
		},

		isProtected(filePath: string): boolean {
			return protectedFiles.has(filePath);
		},

		getLevel(filePath: string): "watch" | "warn" | "block" | null {
			return protectedFiles.get(filePath)?.level ?? null;
		},

		listProtected(): Array<{ path: string; level: "watch" | "warn" | "block"; reason?: string; addedAt: Date }> {
			return Array.from(protectedFiles.entries()).map(([path, data]) => ({
				path,
				...data,
			}));
		},
	};
}

/**
 * Initializes the Context File Manager for AI assistant awareness
 */
export function initializeContextFileManager(
	_context: vscode.ExtensionContext,
	_workspaceRoot: string,
	_storage: IStorageManager,
): void {
	// Implementation would go here - simplified for this refactor
	logger.info("ContextFileManager initialization stub called");
}

async function _directoryExists(filePath: string): Promise<boolean> {
	try {
		const stats = await fs.stat(filePath);
		return stats.isDirectory();
	} catch {
		return false;
	}
}

export async function initializePhase2Storage(appContext: AppContext): Promise<true> {
	const { workspaceRoot, context, eventBus } = appContext;
	const phase2Start = Date.now();
	logger.info("[PERF] Phase 2 starting...");

	try {
		// =========================================================================
		// STEP 1: Storage initialization
		// =========================================================================
		const step1Start = Date.now();
		const useV2Engine = vscode.workspace.getConfiguration("vreko").get<boolean>("useV2Engine", false);
		const v1Storage = new StorageManager(context, eventBus, workspaceRoot);

		const storage = new StorageBridge({
			context,
			eventBus,
			v1Storage,
			useV2Engine,
		});
		appContext.storage = storage;

		await storage.initialize();
		logger.info("[PERF] Step 1: Storage initialized", { durationMs: Date.now() - step1Start });

		// Run stale PRE cleanup in background (non-blocking)
		// Cleans up orphaned PRE checkpoints from crashed/interrupted saves
		StalePRECleanupService.registerOnActivation(context, storage);

		// =========================================================================
		// STEP 2: ProtectedFileRegistry initialization
		// =========================================================================
		const step2Start = Date.now();
		const protectedFileRegistry = new ProtectedFileRegistry(context.workspaceState, eventBus);
		appContext.protectedFileRegistry = protectedFileRegistry;

		// 🐛 FIX: Initialize in-memory SDK ProtectionManager to prevent "SDK not initialized" warnings
		// The extension uses ProtectedFileRegistry as persistence layer, but we need a simple
		// in-memory SDK manager to satisfy the delegation pattern and avoid race conditions
		// between provider registration and protection checks
		const inMemoryProtectionManager = createInMemoryProtectionManager();
		protectedFileRegistry.initializeSDKProtectionManager(inMemoryProtectionManager);
		logger.info("[Phase 2] SDK ProtectionManager initialized (in-memory)");

		try {
			protectedFileRegistry.initializeStorageManager(storage);
		} catch (_err) {
			logger.warn("[WARN] Cooldown features not available");
		}
		logger.info("[PERF] Step 2: ProtectedFileRegistry initialized", { durationMs: Date.now() - step2Start });

		// =========================================================================
		// STEP 3: Config managers
		// =========================================================================
		const step3Start = Date.now();
		appContext.configManager = new ConfigFileManager(workspaceRoot);
		appContext.vrekorcDecorator = new VrekoRCDecorator();

		const autoProtectConfig = new AutoProtectConfig(
			protectedFileRegistry,
			workspaceRoot,
			context,
			appContext.vrekorcDecorator,
		);
		appContext.autoProtectConfig = autoProtectConfig;
		autoProtectConfig.initialize().catch((err) => {
			logger.error("[WARN] AutoProtectConfig initialization failed", err);
		});
		logger.info("[PERF] Step 3: Config managers initialized", { durationMs: Date.now() - step3Start });

		// =========================================================================
		// STEP 4: Daemon bridge initialization
		// =========================================================================
		const step4Start = Date.now();
		logger.info("[DAEMON-STARTUP] Step 4 BEGIN: Daemon bridge initialization");

		// Initialize cross-window spawn state coordination BEFORE creating bridge
		// This prevents multiple VS Code windows from spawning daemons simultaneously
		spawnStateManager.initialize(context.globalState);
		logger.debug("[DAEMON-STARTUP] Spawn state manager initialized with globalState");

		const existingSpawnAttempts = spawnStateManager.getAttempts();
		logger.info("[DAEMON-STARTUP] Cross-window spawn state", {
			existingAttempts: existingSpawnAttempts,
			lastAttempt: spawnStateManager.getLastAttempt(),
		});

		appContext.daemonBridge = getDaemonBridge(workspaceRoot);
		logger.debug("[DAEMON-STARTUP] DaemonBridge instance created", {
			workspaceRoot,
			bridgeCreated: !!appContext.daemonBridge,
		});

		// Check if daemon auto-start is enabled (user can disable via settings)
		const config = vscode.workspace.getConfiguration("vreko");
		const autoStartEnabled = config.get<boolean>("daemon.autoStart", true);
		const connectTimeoutMs = config.get<number>("daemon.connectTimeout", 5000);

		logger.info("[DAEMON-STARTUP] Daemon config", {
			autoStartEnabled,
			connectTimeoutMs,
		});

		if (autoStartEnabled) {
			logger.info("[DAEMON-STARTUP] Starting daemon connection attempt...", {
				timeout: connectTimeoutMs,
				workspaceRoot,
			});
			const daemonConnectStart = Date.now();

			// Attempt to connect and auto-start daemon (with timeout to prevent blocking activation)
			const daemonConnectPromise = appContext.daemonBridge.connect();

			// Race against timeout to prevent blocking activation
			const connectResult = await Promise.race([
				daemonConnectPromise,
				new Promise<boolean>((_, reject) => {
					setTimeout(() => {
						reject(new Error(`Daemon connection timed out after ${connectTimeoutMs}ms`));
					}, connectTimeoutMs);
				}),
			]).catch((err) => {
				const elapsed = Date.now() - daemonConnectStart;
				logger.warn("[PERF] Step 4: Daemon connection FAILED", {
					error: err instanceof Error ? err.message : String(err),
					elapsedMs: elapsed,
					workspaceRoot,
				});
				return false;
			});

			const daemonElapsed = Date.now() - daemonConnectStart;
			if (connectResult) {
				logger.info("[PERF] Step 4: Daemon connected successfully", {
					durationMs: daemonElapsed,
					workspaceRoot,
				});
			} else {
				// Schedule periodic background retries for self-recovery (non-blocking)
				// Retry every 30 seconds for up to 5 minutes (10 retries total)
				const RETRY_INTERVAL_MS = 30000; // 30 seconds
				const MAX_RETRY_DURATION_MS = 5 * 60 * 1000; // 5 minutes
				const maxRetries = Math.floor(MAX_RETRY_DURATION_MS / RETRY_INTERVAL_MS);
				let retryCount = 0;

				logger.info("[PERF] Step 4: Scheduling periodic daemon retries in background", {
					retryIntervalMs: RETRY_INTERVAL_MS,
					maxRetries,
					maxDurationMs: MAX_RETRY_DURATION_MS,
				});

				const retryTimer = setInterval(() => {
					retryCount++;
					if (retryCount > maxRetries) {
						clearInterval(retryTimer);
						logger.warn("Daemon retry exhausted after maximum attempts", {
							retryCount,
							maxRetries,
						});
						return;
					}

					appContext.daemonBridge
						?.connect()
						.then((success) => {
							if (success) {
								clearInterval(retryTimer);
								logger.info("Daemon connected on background retry", {
									retryCount,
									elapsedMs: retryCount * RETRY_INTERVAL_MS,
								});
							} else {
								logger.debug("Daemon retry failed, will try again", {
									retryCount,
									maxRetries,
								});
							}
						})
						.catch((retryErr) => {
							logger.debug("Daemon retry error", {
								retryCount,
								error: String(retryErr),
							});
						});
				}, RETRY_INTERVAL_MS);
			}
		} else {
			logger.info("Daemon auto-start disabled via settings");
		}
		logger.info("[PERF] Step 4: Daemon bridge setup complete", { durationMs: Date.now() - step4Start });

		// =========================================================================
		// STEP 5: .vrekorc loader
		// =========================================================================
		const step5Start = Date.now();
		const vrekorcLoader = new VrekoRCLoader(protectedFileRegistry, workspaceRoot);
		appContext.vrekorcLoader = vrekorcLoader;
		vrekorcLoader.loadConfig().catch((err) => {
			logger.warn("Failed to load .vrekorc", err);
		});
		logger.info("[PERF] Step 5: .vrekorc loader initialized", { durationMs: Date.now() - step5Start });

		// =========================================================================
		// STEP 6: Activity persistence service
		// =========================================================================
		const step6Start = Date.now();
		// Initialize activity persistence service
		// Persists snapshot/protection events to workspaceState for activity feed
		if (eventBus) {
			const activityPersistenceService = new ActivityPersistenceService(eventBus, context.workspaceState);
			appContext.activityPersistenceService = activityPersistenceService;
			context.subscriptions.push(activityPersistenceService);
		}
		logger.info("[PERF] Step 6: Activity persistence initialized", { durationMs: Date.now() - step6Start });

		// =============================================================================
		// STEP 7: FEATURE MANAGER INITIALIZATION
		// =============================================================================
		const step7Start = Date.now();
		// Mark: Start of FeatureManager initialization (will pattern)
		if (typeof performance !== "undefined" && typeof performance.mark === "function") {
			performance.mark("vreko/willInitFeatureManager");
		}

		const _featureManagerStartTime = Date.now();

		// Initialize FeatureManager singleton for feature flag management
		const featureManager = FeatureManager.getInstance();
		appContext.featureManager = featureManager;
		logger.info("[Phase 2] FeatureManager singleton initialized");
		logger.info("[PERF] Step 7: FeatureManager initialized", { durationMs: Date.now() - step7Start });

		// Mark: End of FeatureManager initialization (did pattern)
		if (typeof performance !== "undefined" && typeof performance.mark === "function") {
			performance.mark("vreko/didInitFeatureManager");
		}

		// Measure: FeatureManager initialization duration
		if (typeof performance !== "undefined" && typeof performance.measure === "function") {
			try {
				performance.measure(
					"vreko/featureManagerInit",
					"vreko/willInitFeatureManager",
					"vreko/didInitFeatureManager",
				);
			} catch (err) {
				logger.debug("Failed to measure FeatureManager initialization", err);
			}
		}

		// Wire lazy PostHog client to FeatureManager for dynamic flag evaluation
		// This enables A/B testing and gradual rollouts via PostHog
		// The lazy client defers actual instantiation until first feature flag check
		try {
			// Mark: Start of PostHog client creation (will pattern)
			if (typeof performance !== "undefined" && typeof performance.mark === "function") {
				performance.mark("vreko/willInitPostHog");
			}

			const postHogStartTime = Date.now();

			const { createLazyPostHogClient } = await import("../services/PostHogClient");
			const lazyPostHogClient = createLazyPostHogClient(context);
			featureManager.setPostHogClient(lazyPostHogClient);
			logger.info("[Phase 2] FeatureManager wired with lazy PostHog client (initialization deferred)");

			// Mark: End of PostHog client creation (did pattern)
			if (typeof performance !== "undefined" && typeof performance.mark === "function") {
				performance.mark("vreko/didInitPostHog");
			}

			// Measure: PostHog initialization duration
			if (typeof performance !== "undefined" && typeof performance.measure === "function") {
				try {
					performance.measure("vreko/postHogInit", "vreko/willInitPostHog", "vreko/didInitPostHog");
				} catch (err) {
					logger.debug("Failed to measure PostHog initialization", err);
				}
			}

			logger.info("[Phase 2] PostHog client setup complete", {
				durationMs: Date.now() - postHogStartTime,
			});

			// =============================================================================
			// CONFIGURATION CHANGE WATCHER FOR FEATURE FLAG REACTIVITY
			// =============================================================================
			// Watch for telemetry configuration changes and refresh feature flags
			context.subscriptions.push(
				vscode.workspace.onDidChangeConfiguration(async (e) => {
					if (e.affectsConfiguration("vreko.telemetry")) {
						logger.info("Telemetry config changed, refreshing feature flags");
						try {
							// Clear PostHog cache to force re-fetch with new telemetry settings
							if (lazyPostHogClient && typeof lazyPostHogClient.clearCache === "function") {
								await lazyPostHogClient.clearCache();
								logger.info("Feature flag cache cleared due to telemetry config change");
							}
						} catch (err) {
							logger.warn("Failed to clear feature flag cache on config change", err);
						}
					}
				}),
			);

			// Clean up PostHog client on deactivation
			context.subscriptions.push({
				dispose: () => {
					lazyPostHogClient.shutdown().catch((err: unknown) => {
						logger.warn("Failed to shutdown PostHog client", err as Error);
					});
				},
			});
		} catch (err) {
			logger.warn("[Phase 2] Failed to configure PostHog client, using static feature flags", err);
			// Continue with static feature flags - FeatureManager falls back gracefully
		}

		context.subscriptions.push(appContext.daemonBridge);

		logger.info("Phase 2 (Storage) completed", { duration: Date.now() - phase2Start });
		PhaseLogger.logPhase("2: Storage & Configuration");
	} catch (error) {
		logger.error("[CRITICAL] Phase 2 failed", error as Error);
		throw error;
	}
	return true;
}
