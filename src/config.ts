/**
 * Configuration management for SnapBack extension
 * Uses unified ConfigStore v2 for all settings
 */

import { getInitializedConfigStore } from "./config/configStore";

/**
 * Configuration type inferred from ConfigStore schema
 */
export interface SnapBackConfig {
	privacy: {
		consent: boolean;
		clipboard: boolean;
		watcher: boolean;
		gitWrapper: boolean;
		lastReminded: string | undefined;
	};
	protection: {
		enabled: boolean;
		level: "watch" | "warn" | "block";
		autoProtect: boolean;
	};
	notifications: {
		enabled: boolean;
		quietHours: {
			start: string;
			end: string;
		};
		rateLimit: number;
	};
	snapshots: {
		enabled: boolean;
		autoCreate: boolean;
		retentionDays: number;
	};
	ai: {
		enabled: boolean;
		context: boolean;
		copilot: boolean;
	};
}

/**
 * Get the current SnapBack configuration from ConfigStore
 * @returns Current configuration
 */
export function getConfig(): SnapBackConfig {
	const store = getInitializedConfigStore();
	const config = store.getConfig();
	const settings = config.settings;

	return {
		privacy: {
			consent: settings.privacy?.consent ?? false,
			clipboard: settings.privacy?.clipboard ?? false,
			watcher: settings.privacy?.watcher ?? false,
			gitWrapper: settings.privacy?.gitWrapper ?? false,
			lastReminded: settings.privacy?.lastReminded,
		},
		protection: {
			enabled: true,
			level: settings.defaultProtectionLevel || "warn",
			autoProtect: true,
		},
		notifications: {
			enabled: settings.notifications?.enabled ?? true,
			quietHours: settings.notifications?.quietHours || { start: "22:00", end: "08:00" },
			rateLimit: settings.notifications?.rateLimit ?? 5,
		},
		snapshots: {
			enabled: settings.snapshots?.enabled ?? true,
			autoCreate: settings.snapshots?.autoCreate ?? true,
			retentionDays: settings.snapshots?.retentionDays ?? 30,
		},
		ai: {
			enabled: settings.ai?.enabled ?? true,
			context: settings.ai?.context ?? true,
			copilot: settings.ai?.copilot ?? true,
		},
	};
}

/**
 * Update a specific configuration value in ConfigStore
 * @param path Dot notation path (e.g., 'privacy.consent', 'notifications.enabled')
 * @param value New value
 */
export async function updateConfig(path: string, value: unknown): Promise<void> {
	const store = getInitializedConfigStore();
	const config = store.getConfig();

	// Update nested property
	const keys = path.split(".");
	let current: any = config;

	for (let i = 0; i < keys.length - 1; i++) {
		if (!(keys[i] in current)) {
			current[keys[i]] = {};
		}
		current = current[keys[i]];
	}

	current[keys[keys.length - 1]] = value;
	await store.saveSnapbackrc(config);
}

/**
 * Check if privacy consent has been given
 * @returns Whether privacy consent has been given
 */
export function hasPrivacyConsent(): boolean {
	const store = getInitializedConfigStore();
	return store.get<boolean>("settings.privacy.consent") || false;
}

/**
 * Check if a specific feature is enabled based on consent
 * @param feature Feature to check (clipboard, watcher, gitWrapper)
 * @returns Whether the feature is enabled
 */
export function isFeatureEnabled(feature: "clipboard" | "watcher" | "gitWrapper"): boolean {
	if (!hasPrivacyConsent()) {
		return false;
	}

	const store = getInitializedConfigStore();
	return store.get<boolean>(`settings.privacy.${feature}`) || false;
}

/**
 * Check if protection is enabled
 * @returns Whether protection is enabled
 */
export function isProtectionEnabled(): boolean {
	const store = getInitializedConfigStore();
	const level = store.get<string>("settings.defaultProtectionLevel");
	return level !== "watch";
}

/**
 * Get the current protection level
 * @returns Current protection level
 */
export function getProtectionLevel(): "watch" | "warn" | "block" {
	const store = getInitializedConfigStore();
	return store.get<"watch" | "warn" | "block">("settings.defaultProtectionLevel") || "warn";
}

/**
 * Check if notifications are enabled
 * @returns Whether notifications are enabled
 */
export function areNotificationsEnabled(): boolean {
	const store = getInitializedConfigStore();
	return store.get<boolean>("settings.notifications.enabled") !== false;
}

/**
 * Check if snapshots are enabled
 * @returns Whether snapshots are enabled
 */
export function areSnapshotsEnabled(): boolean {
	const store = getInitializedConfigStore();
	return store.get<boolean>("settings.snapshots.enabled") !== false;
}

/**
 * Check if AI features are enabled
 * @returns Whether AI features are enabled
 */
export function isAiEnabled(): boolean {
	const store = getInitializedConfigStore();
	return store.get<boolean>("settings.ai.enabled") !== false;
}
