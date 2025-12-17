/**
 * @fileoverview Secure Configuration Service
 *
 * Manages sensitive configuration values (API keys, tokens) in VS Code's SecretStorage.
 * Provides backward-compatible fallback to legacy settings with deprecation warnings.
 *
 * Security:
 * - Uses OS-level encrypted storage (Keychain on macOS, Credential Manager on Windows)
 * - Secrets are never synced via Settings Sync
 * - Secrets are not visible in the Settings UI
 * - Fallback to legacy settings shows deprecation warning
 *
 * @package apps/vscode
 */

import * as vscode from "vscode";
import { logger } from "../utils/logger";

/**
 * Keys for secure configuration values
 */
export type SecureConfigKey = "api.key" | "mcp.authToken" | "mcp.apiKey";

/**
 * Storage keys for SecretStorage
 */
const STORAGE_KEYS: Record<SecureConfigKey, string> = {
	"api.key": "snapback.secure.apiKey",
	"mcp.authToken": "snapback.secure.mcpAuthToken",
	"mcp.apiKey": "snapback.secure.mcpApiKey",
};

/**
 * Deprecation warning shown to users (tracked to show only once per session)
 */
const deprecationWarningsShown = new Set<SecureConfigKey>();

/**
 * Secure Configuration Service Interface
 */
export interface SecureConfigService {
	/**
	 * Get a secure configuration value
	 * Checks SecretStorage first, falls back to legacy settings with deprecation warning
	 *
	 * @param key - The configuration key
	 * @returns The value or empty string if not set
	 */
	get(key: SecureConfigKey): Promise<string>;

	/**
	 * Set a secure configuration value in SecretStorage
	 *
	 * @param key - The configuration key
	 * @param value - The value to store
	 */
	set(key: SecureConfigKey, value: string): Promise<void>;

	/**
	 * Delete a secure configuration value from SecretStorage
	 *
	 * @param key - The configuration key
	 */
	delete(key: SecureConfigKey): Promise<void>;

	/**
	 * Check if a value exists in SecretStorage (not legacy settings)
	 *
	 * @param key - The configuration key
	 * @returns True if value exists in secure storage
	 */
	hasSecure(key: SecureConfigKey): Promise<boolean>;

	/**
	 * Migrate a value from legacy settings to SecretStorage
	 * Clears the legacy setting after successful migration
	 *
	 * @param key - The configuration key to migrate
	 * @returns True if migration was performed
	 */
	migrate(key: SecureConfigKey): Promise<boolean>;

	/**
	 * Migrate all legacy settings to SecretStorage
	 *
	 * @returns Number of keys migrated
	 */
	migrateAll(): Promise<number>;
}

/**
 * Create a SecureConfigService instance
 *
 * @param secrets - VS Code SecretStorage from ExtensionContext
 * @returns SecureConfigService instance
 *
 * @example
 * ```typescript
 * const secureConfig = createSecureConfigService(context.secrets);
 *
 * // Get API key (checks secure storage first, then legacy settings)
 * const apiKey = await secureConfig.get("api.key");
 *
 * // Set API key securely
 * await secureConfig.set("api.key", "sk-abc123");
 *
 * // Migrate all legacy settings
 * const migrated = await secureConfig.migrateAll();
 * ```
 */
export function createSecureConfigService(secrets: vscode.SecretStorage): SecureConfigService {
	const config = () => vscode.workspace.getConfiguration("snapback");

	return {
		async get(key: SecureConfigKey): Promise<string> {
			// Check secure storage first
			const storageKey = STORAGE_KEYS[key];
			const secureValue = await secrets.get(storageKey);

			if (secureValue) {
				return secureValue;
			}

			// Fallback to legacy settings
			const legacyValue = config().get<string>(key, "");

			if (legacyValue && !deprecationWarningsShown.has(key)) {
				deprecationWarningsShown.add(key);
				logger.warn(
					`[DEPRECATED] Reading "${key}" from VS Code settings is deprecated. ` +
						`Run "SnapBack: Migrate API Keys to Secure Storage" to migrate.`,
				);

				// Show user notification (once per session)
				void vscode.window
					.showWarningMessage(
						"SnapBack: API keys in VS Code settings are deprecated and may be synced or visible. " +
							`Click "Migrate" to move to secure storage.`,
						"Migrate",
						"Later",
					)
					.then((selection) => {
						if (selection === "Migrate") {
							void vscode.commands.executeCommand("snapback.migrateSecureConfig");
						}
					});
			}

			return legacyValue;
		},

		async set(key: SecureConfigKey, value: string): Promise<void> {
			const storageKey = STORAGE_KEYS[key];
			await secrets.store(storageKey, value);
			logger.debug(`Secure config "${key}" stored in SecretStorage`);
		},

		async delete(key: SecureConfigKey): Promise<void> {
			const storageKey = STORAGE_KEYS[key];
			await secrets.delete(storageKey);
			logger.debug(`Secure config "${key}" deleted from SecretStorage`);
		},

		async hasSecure(key: SecureConfigKey): Promise<boolean> {
			const storageKey = STORAGE_KEYS[key];
			const value = await secrets.get(storageKey);
			return !!value;
		},

		async migrate(key: SecureConfigKey): Promise<boolean> {
			// Check if already in secure storage
			if (await this.hasSecure(key)) {
				logger.debug(`"${key}" already in secure storage, skipping migration`);
				return false;
			}

			// Get from legacy settings
			const legacyValue = config().get<string>(key, "");

			if (!legacyValue) {
				logger.debug(`"${key}" not found in legacy settings, nothing to migrate`);
				return false;
			}

			// Store in secure storage
			await this.set(key, legacyValue);

			// Clear legacy setting
			try {
				await config().update(key, undefined, vscode.ConfigurationTarget.Global);
				await config().update(key, undefined, vscode.ConfigurationTarget.Workspace);
				logger.info(`Migrated "${key}" from settings to secure storage`);
			} catch (error) {
				logger.warn(`Could not clear legacy setting "${key}"`, error as Error);
			}

			return true;
		},

		async migrateAll(): Promise<number> {
			let migrated = 0;
			const keys: SecureConfigKey[] = ["api.key", "mcp.authToken", "mcp.apiKey"];

			for (const key of keys) {
				if (await this.migrate(key)) {
					migrated++;
				}
			}

			if (migrated > 0) {
				vscode.window.showInformationMessage(
					`SnapBack: Successfully migrated ${migrated} API key(s) to secure storage.`,
				);
			} else {
				vscode.window.showInformationMessage("SnapBack: No API keys to migrate.");
			}

			return migrated;
		},
	};
}

/**
 * Global SecureConfigService instance
 * Initialized during extension activation
 */
let secureConfigInstance: SecureConfigService | null = null;

/**
 * Initialize the global SecureConfigService
 *
 * @param secrets - VS Code SecretStorage from ExtensionContext
 */
export function initializeSecureConfig(secrets: vscode.SecretStorage): void {
	secureConfigInstance = createSecureConfigService(secrets);
}

/**
 * Get the global SecureConfigService instance
 *
 * @throws Error if not initialized
 */
export function getSecureConfig(): SecureConfigService {
	if (!secureConfigInstance) {
		throw new Error("SecureConfigService not initialized. Call initializeSecureConfig first.");
	}
	return secureConfigInstance;
}
