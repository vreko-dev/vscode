/**
 * SnapBack ConfigStore Wrapper
 *
 * Unified configuration management using @snapback/config
 * Replaces fragmented VSCode settings, SnapBackRCLoader, and SettingsLoader
 *
 * This module provides the single point of config access for the VS Code Extension.
 */

import {
	type ConfigPath,
	ConfigStore,
	type ConfigStoreV2 as ConfigStoreV2Type,
	getConfigStore,
	type PathValue,
} from "@snapback/config";
import { logger } from "@snapback/infrastructure";

/**
 * Global ConfigStore instance
 */
let configStore: InstanceType<typeof ConfigStore> | null = null;
let disposed = false;

/**
 * Initialize ConfigStore on extension activation
 */
export async function initializeConfigStore(workspaceRoot: string): Promise<InstanceType<typeof ConfigStore>> {
	if (configStore) {
		return configStore;
	}

	try {
		configStore = await getConfigStore({ workspaceRoot });
		logger.info("ConfigStore initialized", { workspaceRoot });

		// Watch for .snapbackrc changes in the background
		// Start in background - don't block initialization
		configStore.watchForChanges();
		logger.debug("ConfigStore file watcher started");

		return configStore;
	} catch (error) {
		logger.error("Failed to initialize ConfigStore", {
			error: error instanceof Error ? error.message : String(error),
		});
		throw error;
	}
}

/**
 * Get the initialized ConfigStore instance
 * Throws if not yet initialized
 */
export function getInitializedConfigStore(): InstanceType<typeof ConfigStore> {
	if (!configStore) {
		throw new Error("ConfigStore not initialized. Call initializeConfigStore() first");
	}
	return configStore;
}

/**
 * Subscribe to config changes with hot-reload support
 * Returns unsubscribe function
 */
export function onConfigChange(callback: (config: ConfigStoreV2Type) => void): () => void {
	const store = getInitializedConfigStore();
	return store.onChange(callback);
}

/**
 * Get full config
 */
export function getConfig(): ConfigStoreV2Type {
	return getInitializedConfigStore().getConfig();
}

/**
 * Get config value by dot notation path (TYPE-SAFE)
 *
 * Examples:
 * ```ts
 * getConfigValue("settings.privacy.consent") // boolean (autocomplete!)
 * getConfigValue("engine.maxDepth") // number (autocomplete!)
 * getConfigValue("fake.path") // ❌ Compile error
 * ```
 */
export function getConfigValue<P extends ConfigPath<ConfigStoreV2Type> & string>(
	path: P,
): PathValue<ConfigStoreV2Type, P> | undefined {
	const store = getInitializedConfigStore();
	try {
		return store.get(path);
	} catch (error) {
		logger.warn("Failed to get config value", {
			path,
			error: error instanceof Error ? error.message : String(error),
		});
		return undefined;
	}
}

/**
 * Get config value with fallback default
 *
 * Note: For type safety, path must be a valid ConfigPath
 */
export function getConfigValueOrDefault<P extends ConfigPath<ConfigStoreV2Type> & string>(
	path: P,
	defaultValue: PathValue<ConfigStoreV2Type, P>,
): PathValue<ConfigStoreV2Type, P> {
	return getConfigValue(path) ?? defaultValue;
}

/**
 * Save config to .snapbackrc
 */
export async function saveConfig(config: ConfigStoreV2Type): Promise<void> {
	const store = getInitializedConfigStore();
	await store.saveSnapbackrc(config);
}

/**
 * Dispose ConfigStore on extension deactivation
 */
export function disposeConfigStore(): void {
	if (configStore && !disposed) {
		try {
			configStore.stopWatching();
			logger.info("ConfigStore disposed");
		} catch (error) {
			logger.warn("Error disposing ConfigStore", {
				error: error instanceof Error ? error.message : String(error),
			});
		}
		configStore = null;
		disposed = true;
	}
}

/**
 * Check if ConfigStore is initialized
 */
export function isInitialized(): boolean {
	return configStore !== null && !disposed;
}

/**
 * Reset ConfigStore (for testing)
 */
export function reset(): void {
	disposeConfigStore();
	ConfigStore.reset();
}

export type { ConfigStoreV2Type };
