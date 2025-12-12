import * as path from "node:path";
import type { ProtectionConfig } from "@snapback/contracts";
import { ProtectionManager as SDKProtectionManager } from "@snapback/sdk";
import type { ExtensionContext } from "vscode";
import * as vscode from "vscode";
import { migrateConfigIfNeeded } from "../config/migrate";
import { SNAPBACK_ICONS } from "../constants/index";
import { SnapBackRCDecorator } from "../decorators/snapbackrcDecorator";
import { AutoProtectConfig } from "../protection/autoProtectConfig";
import { ConfigFileManager } from "../protection/ConfigFileManager";
import { MCPLifecycleManager } from "../services/MCPLifecycleManager";
import { ProtectedFileRegistry } from "../services/protectedFileRegistry";
import { migrateExistingSnapshots } from "../snapshot/migration/encrypt-existing-snapshots";
import { StorageManager } from "../storage/StorageManager";
import { logger } from "../utils/logger";
import { directoryExists, findProjectRoot } from "../utils/projectRoot";
import { MigrationService } from "./migration-service";
import { PhaseLogger } from "./phaseLogger";

export interface Phase2Result {
	storage: StorageManager;
	protectedFileRegistry: ProtectedFileRegistry;
	configManager: ConfigFileManager;
	autoProtectConfig: AutoProtectConfig;
	snapbackrcDecorator: SnapBackRCDecorator;
	/** @deprecated Use ConfigStore from @snapback/config instead */
	snapbackrcLoader?: any;
	mcpManager?: MCPLifecycleManager;
	/** SDK ProtectionManager - Single Source of Truth for protection decisions */
	sdkProtectionManager: SDKProtectionManager;
}

export async function initializePhase2Storage(
	workspaceRoot: string,
	context: ExtensionContext,
	eventBus?: any,
): Promise<Phase2Result> {
	const phase2Start = Date.now();
	logger.info("[PERF] Phase 2 starting...");

	// Note: SQLite diagnostic checks removed - extension uses file-based storage
	// Previous diagnostic checks are dead code and not needed for activation performance

	try {
		const storageStart = Date.now();
		const storage = new StorageManager(context, eventBus); // GREEN: Pass eventBus
		console.log("[PERF] StorageManager created", {
			ms: Date.now() - storageStart,
		});

		const initStart = Date.now();
		await storage.initialize();
		console.log("[PERF] Storage initialized", { ms: Date.now() - initStart });

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

		// Initialize protected file registry
		const regStart = Date.now();
		const protectedFileRegistry = new ProtectedFileRegistry(context.workspaceState, eventBus); // GREEN: Pass eventBus
		console.log("[PERF] ProtectedFileRegistry created", {
			ms: Date.now() - regStart,
		});

		/**
		 * Initialize SDK ProtectionManager - Single Source of Truth for protection decisions.
		 * Per arch_remediation.md Task 1.2: SDK owns the "whether" decisions.
		 * VSCode's ProtectedFileRegistry delegates isProtected() and getProtectionLevel() to SDK.
		 */
		const sdkStart = Date.now();
		const defaultProtectionConfig: ProtectionConfig = {
			patterns: [],
			defaultLevel: "watch",
			enabled: true,
			autoProtectConfigs: true,
		};
		const sdkProtectionManager = new SDKProtectionManager(defaultProtectionConfig);
		protectedFileRegistry.initializeSDKProtectionManager(sdkProtectionManager);
		console.log("[PERF] SDK ProtectionManager initialized", {
			ms: Date.now() - sdkStart,
		});

		// 🆕 Initialize StorageManager for ProtectedFileRegistry
		// Per arch_remediation.md Task 2.3: CooldownCache is single source for cooldowns
		try {
			protectedFileRegistry.initializeStorageManager(storage);
			logger.info("StorageManager wired to ProtectedFileRegistry (cooldowns, audit)");
		} catch (cooldownError) {
			const err = cooldownError instanceof Error ? cooldownError : new Error(String(cooldownError));
			logger.error("[StorageManager] Failed to wire to ProtectedFileRegistry", err);
			// CooldownCache is optional - don't show user error, just warn
			logger.warn("[WARN] Cooldown features not available");
		}

		const cfgStart = Date.now();
		const configManager = new ConfigFileManager(workspaceRoot);
		console.log("[PERF] ConfigFileManager created", {
			ms: Date.now() - cfgStart,
		});

		const decStart = Date.now();
		const snapbackrcDecorator = new SnapBackRCDecorator();
		console.log("[PERF] SnapBackRCDecorator created", {
			ms: Date.now() - decStart,
		});

		// DEBUG: Verify we're running the correct bundle (2025-12-12 build)
		console.log("[DEBUG_BUILD] Phase2 marker - build 2025-12-12-v2");

		// ⚡ Initialize AutoProtectConfig with minimal work
		// Heavy initialization (file watching) deferred to background
		const autoStart = Date.now();
		const autoProtectConfig = new AutoProtectConfig(
			protectedFileRegistry,
			workspaceRoot,
			context,
			snapbackrcDecorator,
		);
		console.log("[PERF] AutoProtectConfig created", {
			ms: Date.now() - autoStart,
		});
		// Run async initialization without awaiting
		const autoInitStart = Date.now();
		autoProtectConfig.initialize().catch((err) => {
			logger.error("[WARN] AutoProtectConfig initialization failed", err as Error);
		});
		console.log("[PERF] AutoProtectConfig.initialize() started", {
			ms: Date.now() - autoInitStart,
		});

		// ⚡ Initialize ConfigStore asynchronously
		// Don't await - load in background
		const configStoreStart = Date.now();
		let configStoreCleanup: (() => void) | null = null;
		(async () => {
			console.log("[CONFIG_MIGRATION] Async block started");
			try {
				console.log("[CONFIG_MIGRATION] About to call migrateConfigIfNeeded");
				// 🆕 Run config migration v1 → v2 before initializing ConfigStore
				const migrationResult = await migrateConfigIfNeeded(context, workspaceRoot);
				console.log("[CONFIG_MIGRATION] Result:", migrationResult);
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
				console.error("[CONFIG_MIGRATION] Error in async block:", err);
				logger.warn("Failed to initialize ConfigStore in background", err as Error);
			}
		})();
		console.log("[PERF] ConfigStore initialization started", {
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

		logger.info("Storage and configuration components initialized (async ops deferred)");
		console.log("[PERF] Phase 2 completed", { ms: Date.now() - phase2Start });
		PhaseLogger.logPhase("2: Storage & Configuration");

		// Start bundled MCP server in background (non-blocking):
		console.log("[PERF] Before MCP initialization...");
		const t = Date.now();
		const mcpManager = new MCPLifecycleManager({
			extensionPath: context.extensionPath,
			dbPath: path.join(workspaceRoot, ".snapback", "snapback.db"),
			timeout: 3000,
		});
		console.log("[PERF] MCPLifecycleManager created", { ms: Date.now() - t });

		// Start MCP asynchronously (don't block extension activation):
		const startT = Date.now();
		mcpManager.start().catch((err) => {
			logger.error("MCP server failed to start", err);
			// Extension continues with reduced functionality
		});
		console.log("[PERF] MCPLifecycleManager.start() called", {
			ms: Date.now() - startT,
		});

		// Register for cleanup:
		context.subscriptions.push(mcpManager);

		return {
			storage,
			protectedFileRegistry,
			configManager,
			autoProtectConfig,
			mcpManager,
			snapbackrcDecorator,
			sdkProtectionManager,
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
			mcpManager: undefined,
			snapbackrcDecorator,
			sdkProtectionManager: fallbackSdkManager,
		};
	}
}
