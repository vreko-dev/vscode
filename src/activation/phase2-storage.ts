import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { ProtectionConfig } from "@snapback/contracts";
import { ProtectionManager as SDKProtectionManager } from "@snapback/sdk";
import * as vscode from "vscode";
import { StorageBridge } from "../bridges/StorageBridge";
import { SnapBackRCDecorator } from "../decorators/snapbackrcDecorator";
import { AutoProtectConfig } from "../protection/autoProtectConfig";
import { ConfigFileManager } from "../protection/ConfigFileManager";
import { SnapBackRCLoader } from "../protection/SnapBackRCLoader";
import { getDaemonBridge } from "../services/DaemonBridge";
import { ProtectedFileRegistry } from "../services/protectedFileRegistry";
import { migrateExistingSnapshots } from "../snapshot/migration/encrypt-existing-snapshots";
import { StorageManager } from "../storage/StorageManager";
import type { IStorageManager } from "../storage/types";
import { logger } from "../utils/logger";
import { findProjectRoot } from "../utils/projectRoot";
import type { AppContext } from "./AppContext";
import { PhaseLogger } from "./phaseLogger";

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

async function directoryExists(filePath: string): Promise<boolean> {
	try {
		const stats = await fs.stat(filePath);
		return stats.isDirectory();
	} catch {
		return false;
	}
}

export async function initializePhase2Storage(appContext: AppContext): Promise<void> {
	const { workspaceRoot, context, eventBus } = appContext;
	const phase2Start = Date.now();
	logger.info("[PERF] Phase 2 starting...");

	try {
		const useV2Engine = vscode.workspace.getConfiguration("snapback").get<boolean>("useV2Engine", false);
		const v1Storage = new StorageManager(context, eventBus);

		const storage = new StorageBridge({
			context,
			eventBus,
			v1Storage,
			useV2Engine,
		});
		appContext.storage = storage;

		await storage.initialize();

		// Defer snapshot migration
		setTimeout(() => {
			(async () => {
				try {
					let snapshotsDir = path.join(workspaceRoot, ".snapback");
					const projectRoot = await findProjectRoot(workspaceRoot);
					if (projectRoot) {
						const projectSnapshotsDir = path.join(projectRoot, ".snapback");
						if (await directoryExists(projectSnapshotsDir)) {
							snapshotsDir = projectSnapshotsDir;
						}
					}
					await migrateExistingSnapshots(snapshotsDir);
				} catch (err) {
					logger.warn("Background migration failed", { err });
				}
			})();
		}, 200);

		const protectedFileRegistry = new ProtectedFileRegistry(context.workspaceState, eventBus);
		appContext.protectedFileRegistry = protectedFileRegistry;

		const defaultProtectionConfig: ProtectionConfig = {
			patterns: [],
			defaultLevel: "watch",
			enabled: true,
			autoProtectConfigs: true,
		};
		const sdkProtectionManager = new SDKProtectionManager(defaultProtectionConfig);
		protectedFileRegistry.initializeSDKProtectionManager(sdkProtectionManager);
		appContext.sdkProtectionManager = sdkProtectionManager;

		try {
			protectedFileRegistry.initializeStorageManager(storage);
		} catch (_err) {
			logger.warn("[WARN] Cooldown features not available");
		}

		appContext.configManager = new ConfigFileManager(workspaceRoot);
		appContext.snapbackrcDecorator = new SnapBackRCDecorator();

		const autoProtectConfig = new AutoProtectConfig(
			protectedFileRegistry,
			workspaceRoot,
			context,
			appContext.snapbackrcDecorator,
		);
		appContext.autoProtectConfig = autoProtectConfig;
		autoProtectConfig.initialize().catch((err) => {
			logger.error("[WARN] AutoProtectConfig initialization failed", err);
		});

		appContext.daemonBridge = getDaemonBridge(workspaceRoot);
		appContext.daemonBridge.connect().catch((err) => {
			logger.error("Daemon connection failed", err);
		});

		const snapbackrcLoader = new SnapBackRCLoader(protectedFileRegistry, workspaceRoot);
		appContext.snapbackrcLoader = snapbackrcLoader;
		snapbackrcLoader.loadConfig().catch((err) => {
			logger.warn("Failed to load .snapbackrc", err);
		});

		context.subscriptions.push(appContext.daemonBridge);

		logger.info("Phase 2 (Storage) completed", { duration: Date.now() - phase2Start });
		PhaseLogger.logPhase("2: Storage & Configuration");
	} catch (error) {
		logger.error("[CRITICAL] Phase 2 failed", error as Error);
		throw error;
	}
}
