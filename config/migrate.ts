/**
 * VS Code Config Migration
 *
 * Handles migration from v1 ConfigStore (globalStorage) to v2 ConfigStore (.vrekorc).
 * This is a one-time migration that runs on extension activation.
 *
 * Migration Flow:
 * 1. Check if v1 config exists in globalStorage
 * 2. Check if v2 config already exists (.vrekorc)
 * 3. If v1 exists and v2 doesn't, migrate v1 → v2
 * 4. Write migrated config to .vrekorc
 * 5. Mark migration complete in globalState
 *
 * Safety:
 * - Creates backup before migration
 * - Validates migrated config before writing
 * - Idempotent (skips if already migrated)
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type * as vscode from "vscode";
import type { ConfigStoreV2, V1ConfigSchema } from "../types/config";
import { isV1Config, migrateV1ToV2, validateConfig } from "../types/config";
import { logger } from "../utils/logger";

/**
 * Migration state keys stored in VS Code globalState
 */
const MIGRATION_STATE_KEY = "vreko.configMigration";

/**
 * Migration state structure
 */
interface MigrationState {
	migrated: boolean;
	migratedAt?: string;
	v1Path?: string;
	v2Path?: string;
	protectionsMigrated?: number;
	error?: string;
}

/**
 * Result of migration attempt
 */
export interface ConfigMigrationResult {
	success: boolean;
	migrated: boolean;
	message: string;
	protectionsMigrated?: number;
}

/**
 * Check if migration has already been completed
 */
export async function isMigrationComplete(globalState: vscode.Memento): Promise<boolean> {
	const state = globalState.get<MigrationState>(MIGRATION_STATE_KEY);
	return state?.migrated === true;
}

/**
 * Get migration state
 */
export function getMigrationState(globalState: vscode.Memento): MigrationState | undefined {
	return globalState.get<MigrationState>(MIGRATION_STATE_KEY);
}

/**
 * Load v1 config from VS Code globalStorage
 */
async function loadV1Config(storageUri: vscode.Uri): Promise<V1ConfigSchema | null> {
	try {
		// CRITICAL: fsPath can be undefined for non-file URIs
		const storagePath = storageUri?.fsPath;
		if (!storagePath) {
			logger.debug("Cannot load v1 config: storageUri.fsPath is undefined (remote workspace?)");
			return null;
		}
		const configPath = path.join(storagePath, "config.json");
		const content = await fs.readFile(configPath, "utf-8");
		const data = JSON.parse(content);

		if (isV1Config(data)) {
			logger.info("Found v1 config in globalStorage", { path: configPath });
			return data;
		}

		logger.debug("Config in globalStorage is not v1 format", { path: configPath });
		return null;
	} catch (error) {
		const nodeErr = error as NodeJS.ErrnoException;
		if (nodeErr.code === "ENOENT") {
			logger.debug("No v1 config found in globalStorage");
			return null;
		}

		logger.warn("Failed to load v1 config", {
			error: error instanceof Error ? error.message : String(error),
		});
		return null;
	}
}

/**
 * Check if v2 config (.vrekorc) already exists
 */
async function v2ConfigExists(workspaceRoot: string): Promise<boolean> {
	try {
		const vrekorcPath = path.join(workspaceRoot, ".vrekorc");
		await fs.access(vrekorcPath);
		return true;
	} catch {
		return false;
	}
}

/**
 * Write v2 config to .vrekorc with backup
 */
async function writeV2Config(workspaceRoot: string, config: ConfigStoreV2): Promise<void> {
	const vrekorcPath = path.join(workspaceRoot, ".vrekorc");

	// Validate before writing
	const validation = validateConfig(config);
	if (!validation.valid) {
		throw new Error(`Invalid config: ${validation.errors?.join(", ") || "Unknown validation error"}`);
	}

	// Atomic write: tmp file → rename
	const tmpPath = `${vrekorcPath}.tmp`;
	await fs.writeFile(tmpPath, JSON.stringify(validation.data, null, 2), "utf-8");
	await fs.rename(tmpPath, vrekorcPath);

	logger.info("Migrated config written to .vrekorc", { path: vrekorcPath });
}

/**
 * Create backup of v1 config
 */
async function backupV1Config(storageUri: vscode.Uri): Promise<void> {
	try {
		// CRITICAL: fsPath can be undefined for non-file URIs
		const storagePath = storageUri?.fsPath;
		if (!storagePath) {
			logger.debug("Cannot backup v1 config: storageUri.fsPath is undefined (remote workspace?)");
			return;
		}
		const configPath = path.join(storagePath, "config.json");
		const backupPath = path.join(storagePath, "config.v1-backup.json");

		await fs.copyFile(configPath, backupPath);
		logger.info("Created v1 config backup", { backupPath });
	} catch (error) {
		logger.warn("Failed to create v1 backup", {
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

/**
 * Migrate v1 ConfigStore to v2 ConfigStore
 *
 * This function is idempotent - it will skip migration if already complete
 * or if v2 config already exists.
 */
export async function migrateConfigIfNeeded(
	context: vscode.ExtensionContext,
	workspaceRoot: string,
): Promise<ConfigMigrationResult> {
	logger.info("[CONFIG_MIGRATION] Starting v1→v2 config migration check...", {
		workspaceRoot,
	});

	const { globalState, globalStorageUri } = context;

	// Check if already migrated
	if (await isMigrationComplete(globalState)) {
		logger.info("[CONFIG_MIGRATION] Already complete, skipping");
		return {
			success: true,
			migrated: false,
			message: "Migration already complete",
		};
	}

	// Check if v2 already exists (manual setup or previous migration)
	if (await v2ConfigExists(workspaceRoot)) {
		logger.info("V2 config already exists, marking migration complete");
		await globalState.update(MIGRATION_STATE_KEY, {
			migrated: true,
			migratedAt: new Date().toISOString(),
			v2Path: path.join(workspaceRoot, ".vrekorc"),
		} as MigrationState);

		return {
			success: true,
			migrated: false,
			message: "V2 config already exists",
		};
	}

	// Check if globalStorageUri is available
	if (!globalStorageUri) {
		logger.warn("globalStorageUri not available, skipping migration");
		return {
			success: true,
			migrated: false,
			message: "No globalStorageUri available",
		};
	}

	// Load v1 config
	const v1Config = await loadV1Config(globalStorageUri);

	if (!v1Config) {
		// No v1 config to migrate - mark as complete (fresh install)
		logger.info("[CONFIG_MIGRATION] No v1 config found (fresh install)");
		await globalState.update(MIGRATION_STATE_KEY, {
			migrated: true,
			migratedAt: new Date().toISOString(),
		} as MigrationState);

		return {
			success: true,
			migrated: false,
			message: "No v1 config found (fresh install)",
		};
	}

	// Backup v1 config before migration
	await backupV1Config(globalStorageUri);

	// Perform migration
	const { config: migratedConfig, result: migrationResult } = migrateV1ToV2(v1Config);

	if (!migrationResult.success) {
		const errorMessage = migrationResult.error;
		logger.error(`Config migration failed: ${errorMessage}`);

		await globalState.update(MIGRATION_STATE_KEY, {
			migrated: false,
			error: errorMessage,
		} as MigrationState);

		return {
			success: false,
			migrated: false,
			message: `Migration failed: ${errorMessage}`,
		};
	}

	// Write migrated config
	try {
		await writeV2Config(workspaceRoot, migratedConfig);

		const protectionCount = migratedConfig.protectedFiles?.length ?? 0;

		// CRITICAL: fsPath can be undefined for non-file URIs
		const v1Path = globalStorageUri?.fsPath ? path.join(globalStorageUri.fsPath, "config.json") : "unknown";

		await globalState.update(MIGRATION_STATE_KEY, {
			migrated: true,
			migratedAt: new Date().toISOString(),
			v1Path,
			v2Path: path.join(workspaceRoot, ".vrekorc"),
			protectionsMigrated: protectionCount,
		} as MigrationState);

		logger.info("Config migration complete", {
			protectionsMigrated: protectionCount,
		});

		return {
			success: true,
			migrated: true,
			message: `Migrated ${protectionCount} protections from v1 to v2`,
			protectionsMigrated: protectionCount,
		};
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		logger.error(`Failed to write migrated config: ${errorMessage}`);

		await globalState.update(MIGRATION_STATE_KEY, {
			migrated: false,
			error: errorMessage,
		} as MigrationState);

		return {
			success: false,
			migrated: false,
			message: `Failed to write config: ${errorMessage}`,
		};
	}
}

/**
 * Reset migration state (for testing)
 */
export async function resetMigrationState(globalState: vscode.Memento): Promise<void> {
	await globalState.update(MIGRATION_STATE_KEY, undefined);
	logger.debug("Migration state reset");
}
