/**
 * SettingsLoader
 *
 * Provides access to AutoDecisionEngine settings.
 * Now uses hardcoded defaults for internal optimization settings.
 * Only core user-facing settings remain configurable.
 *
 * Settings simplification: 56 → 8 (86% fewer settings)
 */

import * as vscode from "vscode";
import { AUTO_DECISION_DEFAULTS, SNAPSHOT_DEFAULTS } from "./hardcodedDefaults";

/**
 * AutoDecisionEngine configuration settings
 * These are now hardcoded - users don't know what "6" means
 */
export interface AutoDecisionSettings {
	/** Risk score threshold (0-100) for automatic snapshot creation */
	riskThreshold: number;
	/** Risk score threshold (0-100) for user notifications */
	notifyThreshold: number;
	/** Minimum files changed simultaneously to trigger burst detection */
	minFilesForBurst: number;
	/** Maximum snapshots allowed per minute (rate limiting) */
	maxSnapshotsPerMinute: number;
}

/**
 * Snapshot protection settings
 */
export interface SnapshotSettings {
	/** Enable AI code detection in Guardian */
	aiDetectionEnabled: boolean;
	/** Auto-restore on critical threat detection */
	autoRestoreOnDetection: boolean;
}

/**
 * All settings combined
 */
export interface AllSettings {
	autoDecision: AutoDecisionSettings;
	snapshot: SnapshotSettings;
}

/**
 * Loads settings - now mostly hardcoded with smart defaults
 * Only aiDetection.enabled remains user-configurable
 */
export class SettingsLoader {
	private onSettingsChangeEmitter = new vscode.EventEmitter<AllSettings>();
	readonly onSettingsChange = this.onSettingsChangeEmitter.event;

	constructor(context: vscode.ExtensionContext) {
		// Listen for configuration changes (only for remaining user settings)
		context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((e) => this.onConfigurationChanged(e)));
	}

	/**
	 * Load AutoDecisionEngine settings - now hardcoded
	 * These are internal optimizations, not user choices
	 */
	loadAutoDecisionSettings(): AutoDecisionSettings {
		return {
			riskThreshold: AUTO_DECISION_DEFAULTS.riskThreshold,
			notifyThreshold: AUTO_DECISION_DEFAULTS.notifyThreshold,
			minFilesForBurst: AUTO_DECISION_DEFAULTS.minFilesForBurst,
			maxSnapshotsPerMinute: AUTO_DECISION_DEFAULTS.maxSnapshotsPerMinute,
		};
	}

	/**
	 * Load snapshot settings
	 * aiDetectionEnabled controlled by user setting, rest hardcoded
	 */
	loadSnapshotSettings(): SnapshotSettings {
		const config = vscode.workspace.getConfiguration("snapback");

		return {
			// This is controlled by the user-facing aiDetection.enabled setting
			aiDetectionEnabled: config.get<boolean>("aiDetection.enabled", true),
			// Hardcoded - auto-restore is too disruptive
			autoRestoreOnDetection: SNAPSHOT_DEFAULTS.autoRestoreOnDetection,
		};
	}

	/**
	 * Load all settings together
	 */
	loadAllSettings(): AllSettings {
		return {
			autoDecision: this.loadAutoDecisionSettings(),
			snapshot: this.loadSnapshotSettings(),
		};
	}

	/**
	 * Get current riskThreshold value (hardcoded)
	 */
	getRiskThreshold(): number {
		return AUTO_DECISION_DEFAULTS.riskThreshold;
	}

	/**
	 * Get current notifyThreshold value (hardcoded)
	 */
	getNotifyThreshold(): number {
		return AUTO_DECISION_DEFAULTS.notifyThreshold;
	}

	/**
	 * Get current minFilesForBurst value (hardcoded)
	 */
	getMinFilesForBurst(): number {
		return AUTO_DECISION_DEFAULTS.minFilesForBurst;
	}

	/**
	 * Get current maxSnapshotsPerMinute value (hardcoded)
	 */
	getMaxSnapshotsPerMinute(): number {
		return AUTO_DECISION_DEFAULTS.maxSnapshotsPerMinute;
	}

	/**
	 * Get current aiDetectionEnabled value
	 * This one is still user-configurable
	 */
	isAiDetectionEnabled(): boolean {
		return this.loadSnapshotSettings().aiDetectionEnabled;
	}

	/**
	 * Get current autoRestoreOnDetection value (hardcoded to false)
	 */
	isAutoRestoreEnabled(): boolean {
		return SNAPSHOT_DEFAULTS.autoRestoreOnDetection;
	}

	/**
	 * Update a setting value (only for remaining user settings)
	 */
	async updateSetting<T>(
		section: string,
		value: T,
		target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Workspace,
	): Promise<void> {
		const config = vscode.workspace.getConfiguration("snapback");
		await config.update(section, value, target);
	}

	/**
	 * Handle configuration change events
	 */
	private onConfigurationChanged(e: vscode.ConfigurationChangeEvent): void {
		// Check if any SnapBack settings changed
		if (!e.affectsConfiguration("snapback")) {
			return;
		}

		// Reload and emit new settings
		const settings = this.loadAllSettings();
		this.onSettingsChangeEmitter.fire(settings);
	}

	/**
	 * Dispose resources
	 */
	dispose(): void {
		this.onSettingsChangeEmitter.dispose();
	}
}
