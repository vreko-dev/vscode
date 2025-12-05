import * as vscode from "vscode";

/**
 * Configuration management for SnapBack extension
 * Handles privacy settings and feature toggles
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
 * Get the current SnapBack configuration
 * @returns Current configuration
 */
export function getConfig(): SnapBackConfig {
	const config = vscode.workspace.getConfiguration("snapback");

	return {
		privacy: {
			consent: config.get("privacy.consent", false),
			clipboard: config.get("privacy.clipboard", false),
			watcher: config.get("privacy.watcher", false),
			gitWrapper: config.get("privacy.gitWrapper", false),
			lastReminded: config.get("privacy.lastReminded", undefined),
		},
		protection: {
			enabled: config.get("protection.enabled", true),
			level: config.get("protection.level", "warn"),
			autoProtect: config.get("protection.autoProtect", true),
		},
		notifications: {
			enabled: config.get("notifications.enabled", true),
			quietHours: {
				start: config.get("notifications.quietHours.start", "22:00"),
				end: config.get("notifications.quietHours.end", "08:00"),
			},
			rateLimit: config.get("notifications.rateLimit", 5),
		},
		snapshots: {
			enabled: config.get("snapshots.enabled", true),
			autoCreate: config.get("snapshots.autoCreate", true),
			retentionDays: config.get("snapshots.retentionDays", 30),
		},
		ai: {
			enabled: config.get("ai.enabled", true),
			context: config.get("ai.context", true),
			copilot: config.get("ai.copilot", true),
		},
	};
}

/**
 * Update a specific configuration value
 * @param section Configuration section (e.g., 'privacy', 'protection')
 * @param key Configuration key (e.g., 'consent', 'enabled')
 * @param value New value
 * @param target Configuration target (Global, Workspace, etc.)
 */
export async function updateConfig(
	section: string,
	key: string,
	value: unknown,
	target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Global,
): Promise<void> {
	const config = vscode.workspace.getConfiguration(`snapback.${section}`);
	await config.update(key, value, target);
}

/**
 * Check if privacy consent has been given
 * @returns Whether privacy consent has been given
 */
export function hasPrivacyConsent(): boolean {
	const config = vscode.workspace.getConfiguration("snapback.privacy");
	return config.get("consent", false);
}

/**
 * Check if a specific feature is enabled based on consent
 * @param feature Feature to check (clipboard, watcher, gitWrapper)
 * @returns Whether the feature is enabled
 */
export function isFeatureEnabled(
	feature: "clipboard" | "watcher" | "gitWrapper",
): boolean {
	// If no consent given, features are disabled
	if (!hasPrivacyConsent()) {
		return false;
	}

	const config = vscode.workspace.getConfiguration("snapback.privacy");
	return config.get(feature, false);
}

/**
 * Check if protection is enabled
 * @returns Whether protection is enabled
 */
export function isProtectionEnabled(): boolean {
	const config = vscode.workspace.getConfiguration("snapback.protection");
	return config.get("enabled", true);
}

/**
 * Get the current protection level
 * @returns Current protection level
 */
export function getProtectionLevel(): "watch" | "warn" | "block" {
	const config = vscode.workspace.getConfiguration("snapback.protection");
	return config.get("level", "warn");
}

/**
 * Check if notifications are enabled
 * @returns Whether notifications are enabled
 */
export function areNotificationsEnabled(): boolean {
	const config = vscode.workspace.getConfiguration("snapback.notifications");
	return config.get("enabled", true);
}

/**
 * Check if snapshots are enabled
 * @returns Whether snapshots are enabled
 */
export function areSnapshotsEnabled(): boolean {
	const config = vscode.workspace.getConfiguration("snapback.snapshots");
	return config.get("enabled", true);
}

/**
 * Check if AI features are enabled
 * @returns Whether AI features are enabled
 */
export function isAiEnabled(): boolean {
	const config = vscode.workspace.getConfiguration("snapback.ai");
	return config.get("enabled", true);
}
