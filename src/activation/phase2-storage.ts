import * as path from "node:path";
import type { ExtensionContext } from "vscode";
import * as vscode from "vscode";
import { SNAPBACK_ICONS } from "../constants/index.js";
import { SnapBackRCDecorator } from "../decorators/snapbackrcDecorator.js";
import { AutoProtectConfig } from "../protection/autoProtectConfig.js";
import { ConfigFileManager } from "../protection/ConfigFileManager.js";
import { SnapBackRCLoader } from "../protection/SnapBackRCLoader.js";
import { MCPLifecycleManager } from "../services/MCPLifecycleManager.js";
import { ProtectedFileRegistry } from "../services/protectedFileRegistry.js";
import { migrateExistingSnapshots } from "../snapshot/migration/encrypt-existing-snapshots.js";
import { StorageManager } from "../storage/StorageManager.js";
import { logger } from "../utils/logger.js";
import { directoryExists, findProjectRoot } from "../utils/projectRoot.js";
import { MigrationService } from "./migration-service.js";
import { PhaseLogger } from "./phaseLogger.js";

export interface Phase2Result {
	storage: StorageManager;
	protectedFileRegistry: ProtectedFileRegistry;
	configManager: ConfigFileManager;
	autoProtectConfig: AutoProtectConfig;
	snapbackrcDecorator: SnapBackRCDecorator;
	snapbackrcLoader: SnapBackRCLoader;
	mcpManager?: MCPLifecycleManager;
}

export async function initializePhase2Storage(
	workspaceRoot: string,
	context: ExtensionContext,
): Promise<Phase2Result> {
	const phase2Start = Date.now();
	logger.info("[PERF] Phase 2 starting...");

	// Note: SQLite diagnostic checks removed - extension uses file-based storage
	// Previous diagnostic checks are dead code and not needed for activation performance

	try {
		const storageStart = Date.now();
		const storage = new StorageManager(context);
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
						error:
							migrationError instanceof Error
								? migrationError.message
								: String(migrationError),
					});
				}
			})();
		}, 200); // Start after context updates

		// Initialize protected file registry
		const regStart = Date.now();
		const protectedFileRegistry = new ProtectedFileRegistry(
			context.workspaceState,
		);
		console.log("[PERF] ProtectedFileRegistry created", {
			ms: Date.now() - regStart,
		});

		// 🆕 Initialize CooldownManager via storage manager
		// TODO: Update protectedFileRegistry.initializeCooldownManager to accept StorageManager
		// For now, cooldown caching is managed directly by StorageManager.CooldownCache
		try {
			// CooldownCache is now part of StorageManager initialization
			logger.info("CooldownManager initialized via StorageManager");
		} catch (cooldownError) {
			const err =
				cooldownError instanceof Error
					? cooldownError
					: new Error(String(cooldownError));
			logger.error("[CooldownManager] Initialization failed", err);
			// CooldownManager is optional - don't show user error, just warn
			logger.warn(
				"[WARN] CooldownManager not available - rate-limiting and audit features disabled",
			);
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
			logger.error(
				"[WARN] AutoProtectConfig initialization failed",
				err as Error,
			);
		});
		console.log("[PERF] AutoProtectConfig.initialize() started", {
			ms: Date.now() - autoInitStart,
		});

		// ⚡ Load .snapbackrc asynchronously
		// Don't await - load in background
		const loaderStart = Date.now();
		const snapbackrcLoader = new SnapBackRCLoader(
			protectedFileRegistry,
			workspaceRoot,
		);
		console.log("[PERF] SnapBackRCLoader created", {
			ms: Date.now() - loaderStart,
		});
		// Load config without awaiting - will be available when needed
		const loadConfigStart = Date.now();
		snapbackrcLoader.loadConfig().catch((err) => {
			logger.warn("Failed to load .snapbackrc in background", err as Error);
		});
		console.log("[PERF] loadConfig() started", {
			ms: Date.now() - loadConfigStart,
		});
		// Still need to watch for changes
		const watchStart = Date.now();
		snapbackrcLoader.watchConfigFile();
		console.log("[PERF] watchConfigFile() called", {
			ms: Date.now() - watchStart,
		});

		// ⚡ Migration check deferred - don't block activation
		const migrationService = new MigrationService(
			context,
			protectedFileRegistry,
		);
		// Run migration check asynchronously
		migrationService.checkAndMigrate().catch((err) => {
			logger.error("Migration service failed", err as Error);
		});

		logger.info(
			"Storage and configuration components initialized (async ops deferred)",
		);
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
			snapbackrcLoader,
		};
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		const err = error instanceof Error ? error : new Error(String(error));

		logger.error(
			"[CRITICAL] Failed to initialize storage and configuration components",
			err,
		);

		// Show user-facing error
		vscode.window.showErrorMessage(
			`${SNAPBACK_ICONS.WARN} SnapBack: Activation failed. Sessions and snapshots will not be available. Details: ${errorMessage}`,
			"View Logs",
		);

		// Log that we're in fallback mode
		logger.warn(
			"[WARN] Extension activating in fallback mode (limited functionality) due to storage initialization failure",
		);

		// Create minimal fallback objects
		const protectedFileRegistry = new ProtectedFileRegistry(
			context.workspaceState,
		);

		const configManager = new ConfigFileManager(workspaceRoot);
		const snapbackrcDecorator = new SnapBackRCDecorator();

		const autoProtectConfig = new AutoProtectConfig(
			protectedFileRegistry,
			workspaceRoot,
			context,
			snapbackrcDecorator,
		);
		await autoProtectConfig.initialize();

		const snapbackrcLoader = new SnapBackRCLoader(
			protectedFileRegistry,
			workspaceRoot,
		);
		await snapbackrcLoader.loadConfig();
		snapbackrcLoader.watchConfigFile();

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
			snapbackrcLoader,
		};
	}
}
