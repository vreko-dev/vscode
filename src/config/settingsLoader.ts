/**
 * SettingsLoader
 *
 * Loads and manages AutoDecisionEngine settings from VS Code workspace configuration.
 * Provides type-safe access to all settings with validation and defaults.
 * Supports settings changes via configuration update events.
 */

import * as vscode from "vscode";

/**
 * AutoDecisionEngine configuration settings
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
 * Loads and validates settings from VS Code workspace configuration
 */
export class SettingsLoader {
	private onSettingsChangeEmitter =
		new vscode.EventEmitter<AllSettings>();
	readonly onSettingsChange =
		this.onSettingsChangeEmitter.event;

	constructor(context: vscode.ExtensionContext) {
		// Listen for configuration changes
		context.subscriptions.push(
			vscode.workspace.onDidChangeConfiguration(
				(e) => this.onConfigurationChanged(e),
			),
		);
	}

	/**
	 * Load AutoDecisionEngine settings with defaults and validation
	 */
	loadAutoDecisionSettings(): AutoDecisionSettings {
		const config =
			vscode.workspace.getConfiguration("snapback");

		const riskThreshold = this.clamp(
			config.get<number>(
				"autoDecision.riskThreshold",
				60,
			),
			0,
			100,
		);

		const notifyThreshold = this.clamp(
			config.get<number>(
				"autoDecision.notifyThreshold",
				40,
			),
			0,
			100,
		);

		const minFilesForBurst = Math.max(
			1,
			config.get<number>(
				"autoDecision.minFilesForBurst",
				3,
			),
		);

		const maxSnapshotsPerMinute = Math.max(
			1,
			config.get<number>(
				"autoDecision.maxSnapshotsPerMinute",
				4,
			),
		);

		// Validate threshold relationships
		if (notifyThreshold > riskThreshold) {
			console.warn(
				"SnapBack: notifyThreshold > riskThreshold. Using defaults.",
			);
			return {
				riskThreshold: 60,
				notifyThreshold: 40,
				minFilesForBurst,
				maxSnapshotsPerMinute,
			};
		}

		return {
			riskThreshold,
			notifyThreshold,
			minFilesForBurst,
			maxSnapshotsPerMinute,
		};
	}

	/**
	 * Load snapshot settings with defaults
	 */
	loadSnapshotSettings(): SnapshotSettings {
		const config =
			vscode.workspace.getConfiguration("snapback");

		return {
			aiDetectionEnabled: config.get<boolean>(
				"snapshot.aiDetectionEnabled",
				true,
			),
			autoRestoreOnDetection: config.get<boolean>(
				"snapshot.autoRestoreOnDetection",
				false,
			),
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
	 * Get current riskThreshold value
	 */
	getRiskThreshold(): number {
		return this.loadAutoDecisionSettings().riskThreshold;
	}

	/**
	 * Get current notifyThreshold value
	 */
	getNotifyThreshold(): number {
		return this.loadAutoDecisionSettings()
			.notifyThreshold;
	}

	/**
	 * Get current minFilesForBurst value
	 */
	getMinFilesForBurst(): number {
		return this.loadAutoDecisionSettings()
			.minFilesForBurst;
	}

	/**
	 * Get current maxSnapshotsPerMinute value
	 */
	getMaxSnapshotsPerMinute(): number {
		return this.loadAutoDecisionSettings()
			.maxSnapshotsPerMinute;
	}

	/**
	 * Get current aiDetectionEnabled value
	 */
	isAiDetectionEnabled(): boolean {
		return this.loadSnapshotSettings()
			.aiDetectionEnabled;
	}

	/**
	 * Get current autoRestoreOnDetection value
	 */
	isAutoRestoreEnabled(): boolean {
		return this.loadSnapshotSettings()
			.autoRestoreOnDetection;
	}

	/**
	 * Update a setting value
	 */
	async updateSetting<T>(
		section: string,
		value: T,
		target: vscode.ConfigurationTarget = vscode.ConfigurationTarget
			.Workspace,
	): Promise<void> {
		const config =
			vscode.workspace.getConfiguration("snapback");
		await config.update(section, value, target);
	}

	/**
	 * Handle configuration change events
	 */
	private onConfigurationChanged(
		e: vscode.ConfigurationChangeEvent,
	): void {
		// Check if any SnapBack settings changed
		if (!e.affectsConfiguration("snapback")) {
			return;
		}

		// Reload and emit new settings
		const settings = this.loadAllSettings();
		this.onSettingsChangeEmitter.fire(settings);
	}

	/**
	 * Clamp value between min and max
	 */
	private clamp(
		value: number,
		min: number,
		max: number,
	): number {
		return Math.min(Math.max(value, min), max);
	}

	/**
	 * Dispose resources
	 */
	dispose(): void {
		this.onSettingsChangeEmitter.dispose();
	}
}
