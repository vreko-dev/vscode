/**
 * Type-Safe VSCode Configuration Wrapper
 *
 * Provides compile-time safety for VSCode workspace settings.
 * Eliminates typos, type mismatches, and provides autocomplete.
 *
 * @example
 * ```ts
 * const config = getSnapBackConfig();
 * const testMode = config.get("testMode"); // boolean (autocomplete!)
 * const invalid = config.get("typo"); // ❌ Compile error
 * ```
 */

import * as vscode from "vscode";

/**
 * SnapBack VSCode Configuration Schema
 *
 * Single source of truth for all VSCode settings.
 * Maps setting keys to their TypeScript types.
 */
export interface SnapBackConfigSchema {
	// Test & Debug
	testMode: boolean;

	// API Configuration
	apiBaseUrl: string;
	"api.baseUrl": string;
	"api.key": string;
	"api.preferOAuth": boolean;

	// Web Configuration
	webBaseUrl: string;

	// Protection Levels
	"protectionLevels.defaultLevel": "watch" | "warn" | "block";
	"protectionLevels.showLevelBadges": boolean;

	// File Health
	showFileHealthDecorations: boolean;

	// Snapshot Settings
	"snapshot.naming.useGit": boolean;
	"snapshot.naming.gitTimeout": number;
	"snapshot.deduplication.enabled": boolean;
	"snapshot.deduplication.cacheSize": number;
	"snapshot.deletion.confirmDelete": boolean;
	"snapshot.aiDetectionEnabled": boolean;
	"snapshot.autoRestoreOnDetection": boolean;

	// Notifications
	"notifications.showSnapshotCreated": boolean;
	"notifications.duration": number;
	"notifications.showConfigSync": boolean;
	showAutoSnapshotNotifications: boolean;

	// Guardian
	"guardian.enabled": boolean;
	"guardian.protectionLevel": "none" | "warn" | "block";
	"guardian.plugins.secretDetection": boolean;
	"guardian.plugins.mockReplacement": boolean;
	"guardian.plugins.phantomDependency": boolean;
	"guardian.thresholds.warn": number;
	"guardian.thresholds.block": number;

	// AI Detection
	"aiDetection.enabled": boolean;
	"aiDetection.showSessionBadge": boolean;
	"aiDetection.confidenceThreshold": number;

	// Auto Decision
	"autoDecision.riskThreshold": number;
	"autoDecision.notifyThreshold": number;
	"autoDecision.minFilesForBurst": number;
	"autoDecision.maxSnapshotsPerMinute": number;

	// MCP
	"mcp.enabled": boolean;
	"mcp.serverUrl": string;
	"mcp.authType": "bearer" | "apikey";
	"mcp.authToken": string;
	"mcp.apiKey": string;
	"mcp.timeout": number;

	// Config & Offline
	"config.enableExecutableConfigs": boolean;
	"offlineMode.enabled": boolean;

	// Onboarding
	"onboarding.showWelcome": boolean;
	"onboarding.autoDetectCriticalFiles": boolean;

	// Logging
	logLevel: "debug" | "info" | "warn" | "error";

	// Telemetry
	"telemetry.endpoint": string;
	"telemetry.enabled": boolean;
	"telemetry.console": boolean;
	"telemetry.sampleRate": number;
}

/**
 * Default values for all SnapBack settings
 */
export const SNAPBACK_CONFIG_DEFAULTS: SnapBackConfigSchema = {
	testMode: false,
	apiBaseUrl: "https://api.snapback.dev",
	"api.baseUrl": "https://api.snapback.dev/api",
	"api.key": "",
	"api.preferOAuth": true,
	webBaseUrl: "https://console.snapback.dev",
	"protectionLevels.defaultLevel": "watch",
	"protectionLevels.showLevelBadges": true,
	showFileHealthDecorations: true,
	"snapshot.naming.useGit": true,
	"snapshot.naming.gitTimeout": 5000,
	"snapshot.deduplication.enabled": true,
	"snapshot.deduplication.cacheSize": 500,
	"snapshot.deletion.confirmDelete": true,
	"snapshot.aiDetectionEnabled": true,
	"snapshot.autoRestoreOnDetection": false,
	"notifications.showSnapshotCreated": true,
	"notifications.duration": 3000,
	"notifications.showConfigSync": false,
	showAutoSnapshotNotifications: true,
	"guardian.enabled": true,
	"guardian.protectionLevel": "warn",
	"guardian.plugins.secretDetection": true,
	"guardian.plugins.mockReplacement": true,
	"guardian.plugins.phantomDependency": true,
	"guardian.thresholds.warn": 6,
	"guardian.thresholds.block": 8,
	"aiDetection.enabled": true,
	"aiDetection.showSessionBadge": true,
	"aiDetection.confidenceThreshold": 6,
	"autoDecision.riskThreshold": 60,
	"autoDecision.notifyThreshold": 40,
	"autoDecision.minFilesForBurst": 3,
	"autoDecision.maxSnapshotsPerMinute": 4,
	"mcp.enabled": true,
	"mcp.serverUrl": "https://mcp.snapback.dev",
	"mcp.authType": "bearer",
	"mcp.authToken": "",
	"mcp.apiKey": "",
	"mcp.timeout": 5000,
	"config.enableExecutableConfigs": false,
	"offlineMode.enabled": false,
	"onboarding.showWelcome": true,
	"onboarding.autoDetectCriticalFiles": true,
	logLevel: "info",
	"telemetry.endpoint": "http://localhost:4318/v1/traces",
	"telemetry.enabled": false,
	"telemetry.console": false,
	"telemetry.sampleRate": 1,
};

/**
 * Type-safe VSCode configuration accessor
 */
export class TypedVSCodeConfig {
	constructor(
		private readonly section: string,
		private readonly defaults: SnapBackConfigSchema,
	) {}

	/**
	 * Get a configuration value with type safety and autocomplete
	 *
	 * @example
	 * ```ts
	 * const testMode = config.get("testMode"); // boolean
	 * const apiUrl = config.get("apiBaseUrl"); // string
	 * ```
	 */
	get<K extends keyof SnapBackConfigSchema>(key: K): SnapBackConfigSchema[K] {
		const config = vscode.workspace.getConfiguration(this.section);
		return config.get<SnapBackConfigSchema[K]>(key, this.defaults[key]);
	}

	/**
	 * Update a configuration value
	 *
	 * @param key Setting key
	 * @param value New value (type-checked!)
	 * @param target Configuration target (default: Workspace)
	 */
	async update<K extends keyof SnapBackConfigSchema>(
		key: K,
		value: SnapBackConfigSchema[K],
		target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Workspace,
	): Promise<void> {
		const config = vscode.workspace.getConfiguration(this.section);
		await config.update(key, value, target);
	}

	/**
	 * Check if a configuration affects a specific setting
	 */
	affectsConfiguration<K extends keyof SnapBackConfigSchema>(e: vscode.ConfigurationChangeEvent, key: K): boolean {
		return e.affectsConfiguration(`${this.section}.${String(key)}`);
	}

	/**
	 * Get the underlying VSCode configuration object
	 */
	getRaw(): vscode.WorkspaceConfiguration {
		return vscode.workspace.getConfiguration(this.section);
	}
}

/**
 * Get type-safe SnapBack configuration
 *
 * @example
 * ```ts
 * const config = getSnapBackConfig();
 * const testMode = config.get("testMode"); // boolean (autocomplete!)
 * const threshold = config.get("autoDecision.riskThreshold"); // number
 * ```
 */
export function getSnapBackConfig(): TypedVSCodeConfig {
	return new TypedVSCodeConfig("snapback", SNAPBACK_CONFIG_DEFAULTS);
}
