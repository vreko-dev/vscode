/**
 * SnapBack ConfigStore Wrapper
 *
 * Unified configuration management using @snapback/config
 * Replaces fragmented VSCode settings, SnapBackRCLoader, and SettingsLoader
 *
 * This module provides the single point of config access for the VS Code Extension.
 */

import {
	ConfigStore as ConfigStoreV2,
	type ConfigStoreV2 as ConfigStoreV2Type,
	getConfigStore,
} from "@snapback/config";
import { logger } from "@snapback/infrastructure";

/**
 * Global ConfigStore instance
 */
let configStore: ConfigStoreV2Type | null = null;
let disposed = false;

/**
 * Initialize ConfigStore on extension activation
 */
export async function initializeConfigStore(workspaceRoot: string): Promise<ConfigStoreV2Type> {
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
export function getInitializedConfigStore(): ConfigStoreV2Type {
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
 * Get config value by dot notation path
 * Example: getConfigValue<number>("engine.maxDepth") → 2
 */
export function getConfigValue<T>(path: string): T | undefined {
	const store = getInitializedConfigStore();
	try {
		return store.get<T>(path);
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
 */
export function getConfigValueOrDefault<T>(path: string, defaultValue: T): T {
	return getConfigValue<T>(path) ?? defaultValue;
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
	ConfigStoreV2.reset();
}

export type { ConfigStoreV2Type };
