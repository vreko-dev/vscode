import * as path from "node:path";
import * as vscode from "vscode";
import type { ExtensionContext } from "vscode";
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
import { DiagnosticCheck } from "./diagnostic-check.js";
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
	// Run pre-flight diagnostic checks
	const diagnostics = await DiagnosticCheck.runAll();
	if (!diagnostics.sqliteImplementationAvailable) {
		logger.warn("[WARNING] SQLite check skipped - using file-based storage", {
			diagnostics: JSON.stringify(diagnostics),
		});
	}

	try {
		const storage = new StorageManager(context);
		await storage.initialize();

		// Migrate existing plaintext snapshots to encrypted format
		// Only run migration if storage is available
		try {
			// Try to find the correct .snapback directory
			// First check the current workspace root
			let snapshotsDir = path.join(workspaceRoot, ".snapback");

			// If that doesn't exist, try going up directories to find the project root
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
		} catch (migrationError) {
			logger.warn(
				"Snapshot migration failed, continuing with extension activation",
				{
					error:
						migrationError instanceof Error
							? migrationError.message
							: String(migrationError),
				},
			);
			// Don't fail the entire extension activation if migration fails
		}

		// Initialize protected file registry
		const protectedFileRegistry = new ProtectedFileRegistry(
			context.workspaceState,
		);

		// 🆕 Initialize CooldownManager via storage manager
		// TODO: Update protectedFileRegistry.initializeCooldownManager to accept StorageManager
		// For now, cooldown caching is managed directly by StorageManager.CooldownCache
		try {
			// CooldownCache is now part of StorageManager initialization
			logger.info("CooldownManager initialized via StorageManager");
		} catch (cooldownError) {
			const err = cooldownError instanceof Error ? cooldownError : new Error(String(cooldownError));
			logger.error("[CooldownManager] Initialization failed", err);
			// CooldownManager is optional - don't show user error, just warn
			logger.warn(
				"[WARN] CooldownManager not available - rate-limiting and audit features disabled",
			);
		}

		// Initialize config manager
		const configManager = new ConfigFileManager(workspaceRoot);

		// Initialize snapbackrc decorator
		const snapbackrcDecorator = new SnapBackRCDecorator();

		// Initialize auto protect config
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
		// Watch for future changes (explicit user edits to .snapbackrc will auto-apply)
		snapbackrcLoader.watchConfigFile();

		// Check for user migration (100+ protected files from auto-protection)
		const migrationService = new MigrationService(
			context,
			protectedFileRegistry,
		);
		await migrationService.checkAndMigrate();

		logger.info(
			"Storage and configuration components initialized successfully",
		);
		PhaseLogger.logPhase("2: Storage & Configuration");

		// Start bundled MCP server in background (non-blocking):
		const mcpManager = new MCPLifecycleManager({
			extensionPath: context.extensionPath,
			dbPath: path.join(workspaceRoot, ".snapback", "snapback.db"),
			timeout: 3000,
		});

		// Start MCP asynchronously (don't block extension activation):
		mcpManager.start().catch((err) => {
			logger.error("MCP server failed to start", err);
			// Extension continues with reduced functionality
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
			`⚠️ SnapBack: Activation failed. Sessions and snapshots will not be available. Details: ${errorMessage}`,
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
