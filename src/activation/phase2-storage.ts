import * as path from "node:path";
import type { ProtectionConfig, SnapBackEventBus } from "@snapback/contracts";
import { ProtectionManager as SDKProtectionManager } from "@snapback/sdk";
import type { ExtensionContext } from "vscode";
import * as vscode from "vscode";
import { StorageBridge } from "../bridges/StorageBridge";
import { migrateConfigIfNeeded } from "../config/migrate";
import { SNAPBACK_ICONS } from "../constants/index";
import { ContextFileManager, type ContextFileManagerDeps } from "../context";
import { SnapBackRCDecorator } from "../decorators/snapbackrcDecorator";
import { AutoProtectConfig } from "../protection/autoProtectConfig";
import { ConfigFileManager } from "../protection/ConfigFileManager";
import { SnapBackRCLoader } from "../protection/SnapBackRCLoader";
import { type DaemonBridge, getDaemonBridge } from "../services/DaemonBridge";
import { ProtectedFileRegistry } from "../services/protectedFileRegistry";
import { migrateExistingSnapshots } from "../snapshot/migration/encrypt-existing-snapshots";
import { StorageManager } from "../storage/StorageManager";
import { logger } from "../utils/logger";
import { directoryExists, findProjectRoot } from "../utils/projectRoot";
import { MigrationService } from "./migration-service";
import { PhaseLogger } from "./phaseLogger";

export interface Phase2Result {
	/** Storage interface - routes to V1 or V2 via StorageBridge */
	storage: StorageManager | StorageBridge;
	protectedFileRegistry: ProtectedFileRegistry;
	configManager: ConfigFileManager;
	autoProtectConfig: AutoProtectConfig;
	snapbackrcDecorator: SnapBackRCDecorator;
	/** Loads and parses .snapbackrc configuration files */
	snapbackrcLoader: SnapBackRCLoader;
	/** DaemonBridge for MCP connection (simplified architecture) */
	daemonBridge: DaemonBridge;
	/** SDK ProtectionManager - Single Source of Truth for protection decisions */
	sdkProtectionManager: SDKProtectionManager;
}

export async function initializePhase2Storage(
	workspaceRoot: string,
	context: ExtensionContext,
	eventBus?: SnapBackEventBus,
): Promise<Phase2Result> {
	const phase2Start = Date.now();
	const componentTimings: Record<string, number> = {};
	logger.info("[PERF] Phase 2 starting...");

	// Note: SQLite diagnostic checks removed - extension uses file-based storage
	// Previous diagnostic checks are dead code and not needed for activation performance

	try {
		// Component 1: StorageBridge creation
		let componentStart = Date.now();
		const useV2Engine = vscode.workspace.getConfiguration("snapback").get<boolean>("useV2Engine", false);
		const v1Storage = new StorageManager(context, eventBus); // V1 storage instance

		const storage = new StorageBridge({
			context,
			eventBus,
			v1Storage,
			useV2Engine,
		});
		componentTimings["StorageBridge.create"] = Date.now() - componentStart;
		logger.info("StorageBridge created", {
			ms: componentTimings["StorageBridge.create"],
			useV2: useV2Engine,
		});

		// Component 2: Storage initialization
		componentStart = Date.now();
		await storage.initialize();
		componentTimings["StorageBridge.initialize"] = Date.now() - componentStart;
		logger.info("StorageBridge initialized", { ms: componentTimings["StorageBridge.initialize"] });

		// Migrate existing plaintext snapshots to encrypted format
		// DEFERRED: Run this after activation completes
		// Don't block activation for snapshot migration
		setTimeout(() => {
			(async () => {
				try {
					// Try to find the correct .snapback directory
					let snapshotsDir = path.join(workspaceRoot, ".snapback");

					if (!(await directoryExists(snapshotsDir))) {
						const projectRoot = await findProjectRoot(workspaceRoot);
						if (projectRoot) {
							const projectSnapshotsDir = path.join(projectRoot, ".snapback");
							if (await directoryExists(projectSnapshotsDir)) {
								snapshotsDir = projectSnapshotsDir;
								logger.info("Found .snapback directory at project root", {
									projectRoot,
								});
							}
						}
					}

					await migrateExistingSnapshots(snapshotsDir);
					logger.info("Snapshot migration completed in background");
				} catch (migrationError) {
					logger.warn("Background snapshot migration failed, continuing", {
						error: migrationError instanceof Error ? migrationError.message : String(migrationError),
					});
				}
			})();
		}, 200); // Start after context updates

		// Component 3: ProtectedFileRegistry creation
		componentStart = Date.now();
		const protectedFileRegistry = new ProtectedFileRegistry(context.workspaceState, eventBus); // GREEN: Pass eventBus
		componentTimings["ProtectedFileRegistry.create"] = Date.now() - componentStart;
		logger.info("ProtectedFileRegistry created", {
			ms: componentTimings["ProtectedFileRegistry.create"],
		});

		/**
		 * Initialize SDK ProtectionManager - Single Source of Truth for protection decisions.
		 * Per arch_remediation.md Task 1.2: SDK owns the "whether" decisions.
		 * VSCode's ProtectedFileRegistry delegates isProtected() and getProtectionLevel() to SDK.
		 */
		// Component 4: SDK ProtectionManager initialization
		componentStart = Date.now();
		const defaultProtectionConfig: ProtectionConfig = {
			patterns: [],
			defaultLevel: "watch",
			enabled: true,
			autoProtectConfigs: true,
		};
		const sdkProtectionManager = new SDKProtectionManager(defaultProtectionConfig);
		protectedFileRegistry.initializeSDKProtectionManager(sdkProtectionManager);
		componentTimings["SDKProtectionManager.init"] = Date.now() - componentStart;
		logger.info("SDK ProtectionManager initialized", {
			ms: componentTimings["SDKProtectionManager.init"],
		});

		// Component 5: StorageManager wiring
		componentStart = Date.now();
		try {
			protectedFileRegistry.initializeStorageManager(storage);
			componentTimings["ProtectedFileRegistry.wireStorage"] = Date.now() - componentStart;
			logger.info("StorageBridge wired to ProtectedFileRegistry", {
				ms: componentTimings["ProtectedFileRegistry.wireStorage"],
			});
		} catch (cooldownError) {
			componentTimings["ProtectedFileRegistry.wireStorage"] = Date.now() - componentStart;
			const err = cooldownError instanceof Error ? cooldownError : new Error(String(cooldownError));
			logger.error("[StorageManager] Failed to wire to ProtectedFileRegistry", err);
			// CooldownCache is optional - don't show user error, just warn
			logger.warn("[WARN] Cooldown features not available");
		}

		// Component 6: ConfigFileManager creation
		componentStart = Date.now();
		const configManager = new ConfigFileManager(workspaceRoot);
		componentTimings["ConfigFileManager.create"] = Date.now() - componentStart;
		logger.info("ConfigFileManager created", {
			ms: componentTimings["ConfigFileManager.create"],
		});

		// Component 7: SnapBackRCDecorator creation
		componentStart = Date.now();
		const snapbackrcDecorator = new SnapBackRCDecorator();
		componentTimings["SnapBackRCDecorator.create"] = Date.now() - componentStart;
		logger.info("SnapBackRCDecorator created", {
			ms: componentTimings["SnapBackRCDecorator.create"],
		});

		// Component 8: AutoProtectConfig creation (async init deferred)
		componentStart = Date.now();
		const autoProtectConfig = new AutoProtectConfig(
			protectedFileRegistry,
			workspaceRoot,
			context,
			snapbackrcDecorator,
		);
		componentTimings["AutoProtectConfig.create"] = Date.now() - componentStart;
		logger.info("AutoProtectConfig created", {
			ms: componentTimings["AutoProtectConfig.create"],
		});
		// Run async initialization without awaiting
		autoProtectConfig.initialize().catch((err) => {
			logger.error("[WARN] AutoProtectConfig initialization failed", err as Error);
		});

		// ⚡ Initialize ConfigStore asynchronously
		// Don't await - load in background
		const configStoreStart = Date.now();
		let configStoreCleanup: (() => void) | null = null;
		(async () => {
			logger.debug("Async block started");
			try {
				logger.debug("About to call migrateConfigIfNeeded");
				// 🆕 Run config migration v1 → v2 before initializing ConfigStore
				const migrationResult = await migrateConfigIfNeeded(context, workspaceRoot);
				logger.debug("Result:", migrationResult);
				if (migrationResult.migrated) {
					logger.info("Config migration completed", {
						protectionsMigrated: migrationResult.protectionsMigrated,
					});
				} else {
					logger.debug("Config migration skipped", { reason: migrationResult.message });
				}

				const { initializeConfigStore, disposeConfigStore } = await import("../config/configStore");
				await initializeConfigStore(workspaceRoot);
				configStoreCleanup = disposeConfigStore;
				logger.info("ConfigStore initialized in background");
			} catch (err) {
				logger.error("Config migration error in async block", err as Error);
				logger.warn("Failed to initialize ConfigStore in background", err as Error);
			}
		})();
		logger.debug("ConfigStore initialization started", {
			ms: Date.now() - configStoreStart,
		});
		// Register ConfigStore cleanup
		if (configStoreCleanup) {
			context.subscriptions.push({ dispose: configStoreCleanup });
		}

		// ⚡ Migration check deferred - don't block activation
		const migrationService = new MigrationService(context, protectedFileRegistry);
		// Run migration check asynchronously
		migrationService.checkAndMigrate().catch((err) => {
			logger.error("Migration service failed", err as Error);
		});

		// Component 9: DaemonBridge initialization (simplified MCP architecture)
		componentStart = Date.now();
		const daemonBridge = getDaemonBridge();
		componentTimings["DaemonBridge.get"] = Date.now() - componentStart;
		logger.info("DaemonBridge obtained", { ms: componentTimings["DaemonBridge.get"] });

		// Start daemon connection asynchronously (don't block extension activation)
		daemonBridge.connect().catch((err: Error) => {
			logger.error("Daemon connection failed", err);
		});

		// Component 10: SnapBackRCLoader creation
		componentStart = Date.now();
		const snapbackrcLoader = new SnapBackRCLoader(protectedFileRegistry, workspaceRoot);
		// Don't await - load config asynchronously
		snapbackrcLoader.loadConfig().catch((err) => {
			logger.warn("Failed to load .snapbackrc in background", err as Error);
		});
		componentTimings["SnapBackRCLoader.create"] = Date.now() - componentStart;
		logger.info("SnapBackRCLoader created", {
			ms: componentTimings["SnapBackRCLoader.create"],
		});

		// Register DaemonBridge for cleanup
		context.subscriptions.push(daemonBridge);

		// Phase 2 component timing breakdown
		const phase2Duration = Date.now() - phase2Start;
		const sortedComponents = Object.entries(componentTimings)
			.sort(([, a], [, b]) => b - a)
			.map(([name, ms]) => ({ name, ms }));

		logger.info("Phase 2 component timing breakdown", {
			total: phase2Duration,
			components: sortedComponents,
			slowest: sortedComponents[0]?.name,
			slowestMs: sortedComponents[0]?.ms,
		});

		logger.info("Phase 2 (Storage) completed successfully", {
			duration: phase2Duration,
			workspaceRoot,
			timestamp: Date.now(),
		});
		PhaseLogger.logPhase("2: Storage & Configuration");

		return {
			storage,
			protectedFileRegistry,
			configManager,
			autoProtectConfig,
			daemonBridge,
			snapbackrcDecorator,
			sdkProtectionManager,
			snapbackrcLoader,
		};
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		const errorName = error instanceof Error ? error.name : "Error";
		const err = error instanceof Error ? error : new Error(String(error));

		logger.error("[CRITICAL] Failed to initialize storage and configuration components", err);

		// Show user-friendly error notification based on error type
		if (errorName === "StorageSpaceError") {
			// Disk full - provide actionable guidance
			const choice = await vscode.window.showErrorMessage(
				`${SNAPBACK_ICONS.CRITICAL} SnapBack: Your disk is full - snapshots disabled`,
				{
					modal: false,
					detail: "Free up disk space, then reload VS Code (Cmd+Shift+P → 'Developer: Reload Window') to re-enable snapshot features.",
				},
				"Free Space Guide",
				"Reload Window",
			);

			if (choice === "Free Space Guide") {
				await vscode.env.openExternal(vscode.Uri.parse("https://docs.snapback.dev/troubleshooting/disk-space"));
			} else if (choice === "Reload Window") {
				await vscode.commands.executeCommand("workbench.action.reloadWindow");
			}
		} else if (errorName === "StoragePermissionError") {
			// Permission denied - guide user to fix permissions
			const choice = await vscode.window.showErrorMessage(
				`${SNAPBACK_ICONS.WARN} SnapBack: Permission denied accessing storage`,
				{
					modal: false,
					detail: `Cannot write to storage directory. Check folder permissions and reload VS Code.\n\nPath: ${context.globalStorageUri.fsPath}`,
				},
				"Show Folder",
				"Reload Window",
			);

			if (choice === "Show Folder") {
				await vscode.commands.executeCommand("revealFileInOS", context.globalStorageUri);
			} else if (choice === "Reload Window") {
				await vscode.commands.executeCommand("workbench.action.reloadWindow");
			}
		} else {
			// Unknown error - provide debug info
			const choice = await vscode.window.showErrorMessage(
				`${SNAPBACK_ICONS.WARN} SnapBack: Storage initialization failed`,
				{
					modal: false,
					detail: `Snapshot features are disabled.

Error: ${errorMessage}

Check the Output panel for details.`,
				},
				"View Logs",
				"Report Issue",
			);

			if (choice === "View Logs") {
				await vscode.commands.executeCommand("workbench.action.output.show");
			} else if (choice === "Report Issue") {
				await vscode.env.openExternal(
					vscode.Uri.parse(
						`https://github.com/snapback-dev/snapback/issues/new?title=Storage%20Initialization%20Failed&body=${encodeURIComponent(`Error: ${errorMessage}\n\nPlatform: ${process.platform}\nVS Code: ${vscode.version}`)}`,
					),
				);
			}
		}

		// Log that we're in fallback mode
		logger.warn(
			"[WARN] Extension activating in fallback mode (limited functionality) due to storage initialization failure",
		);

		// Create minimal fallback objects
		const protectedFileRegistry = new ProtectedFileRegistry(context.workspaceState);

		// Initialize SDK ProtectionManager even in fallback mode
		const fallbackProtectionConfig: ProtectionConfig = {
			patterns: [],
			defaultLevel: "watch",
			enabled: true,
			autoProtectConfigs: true,
		};
		const fallbackSdkManager = new SDKProtectionManager(fallbackProtectionConfig);
		protectedFileRegistry.initializeSDKProtectionManager(fallbackSdkManager);

		const configManager = new ConfigFileManager(workspaceRoot);
		const snapbackrcDecorator = new SnapBackRCDecorator();

		const autoProtectConfig = new AutoProtectConfig(
			protectedFileRegistry,
			workspaceRoot,
			context,
			snapbackrcDecorator,
		);
		await autoProtectConfig.initialize();

		// Initialize ConfigStore for fallback mode
		const { initializeConfigStore, disposeConfigStore } = await import("../config/configStore");
		await initializeConfigStore(workspaceRoot);
		context.subscriptions.push({ dispose: disposeConfigStore });

		// Create a fallback SnapBackRCLoader
		const fallbackSnapbackrcLoader = new SnapBackRCLoader(protectedFileRegistry, workspaceRoot);
		// Try to load config asynchronously (non-blocking)
		fallbackSnapbackrcLoader.loadConfig().catch((err) => {
			logger.warn("Failed to load .snapbackrc in fallback mode", err as Error);
		});

		// Create a fallback storage adapter using the new file-based system
		const storage = new StorageManager(context);
		await storage.initialize();

		logger.info("[PERF] Phase 2 completed (error path)", {
			ms: Date.now() - phase2Start,
		});
		PhaseLogger.logPhase("2: Storage & Configuration (limited mode)");

		return {
			storage,
			protectedFileRegistry,
			configManager,
			autoProtectConfig,
			daemonBridge: getDaemonBridge(),
			snapbackrcDecorator,
			sdkProtectionManager: fallbackSdkManager,
			snapbackrcLoader: fallbackSnapbackrcLoader,
		};
	}
}

/**
 * Initialize Context File Manager (non-blocking)
 *
 * Creates and maintains .snapback/ctx/context.json - the intelligence layer
 * that informs AI assistants about project state, constraints, and SnapBack activity.
 *
 * 🧢 SnapBack
 */
export function initializeContextFileManager(
	context: ExtensionContext,
	workspaceRoot: string,
	storage: StorageManager | StorageBridge,
	eventBus?: { onSnapshotCreated(handler: () => void): vscode.Disposable },
): void {
	// Create adapter for snapshot service
	const snapshotServiceAdapter: ContextFileManagerDeps["snapshotService"] = {
		list: async () => {
			try {
				const snapshots = await storage.listSnapshots();
				return snapshots.map((s) => ({
					id: s.id,
					timestamp: s.timestamp,
				}));
			} catch {
				return [];
			}
		},
		onSnapshotCreated: (handler: () => void) => {
			// Use eventBus if available, otherwise create a no-op disposable
			if (eventBus?.onSnapshotCreated) {
				return eventBus.onSnapshotCreated(handler);
			}
			// Fallback: no-op disposable
			return { dispose: () => {} };
		},
	};

	// Create minimal vitals service adapter (Phase 2 enhancement)
	const vitalsServiceAdapter: ContextFileManagerDeps["vitalsService"] = {
		getVitals: async () => {
			// Returns null - will be enhanced in Phase 2 to wire to actual vitals
			return null;
		},
	};

	// Create minimal session tracker adapter (Phase 2 enhancement)
	const sessionTrackerAdapter: ContextFileManagerDeps["sessionTracker"] = {
		getCurrentSession: () => {
			// Returns null - will be enhanced in Phase 2 to wire to actual session tracking
			return null;
		},
	};

	const contextManager = new ContextFileManager(workspaceRoot, {
		snapshotService: snapshotServiceAdapter,
		vitalsService: vitalsServiceAdapter,
		sessionTracker: sessionTrackerAdapter,
	});

	// Initialize asynchronously (non-blocking)
	contextManager.initialize().catch((err) => {
		logger.warn("Failed to initialize Context File Manager", err as Error);
	});

	// Register for cleanup
	context.subscriptions.push(contextManager);

	logger.info("Context File Manager initialized in background");
}
