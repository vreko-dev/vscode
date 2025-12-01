/**
 * AIDetectionSettings
 *
 * Type-safe wrapper for VS Code settings related to AI detection (v1)
 * Settings are enforced at data-collection time, not just UI
 *
 * Configuration ID prefix: `snapback.aiDetection.*`
 */

import * as vscode from "vscode";

// biome-ignore lint/complexity/noStaticOnlyClass: This is a utility class pattern for grouping related static methods
export class AIDetectionSettings {
	/**
	 * Returns whether AI detection is enabled globally
	 * When disabled, no change data is collected and finalizeSession returns 'unknown'
	 */
	static isEnabled(): boolean {
		const config = vscode.workspace.getConfiguration("snapback.aiDetection");
		return config.get<boolean>("enabled", true); // Default: enabled
	}

	/**
	 * Returns whether to show AI detection badge in status bar
	 * This is UI-only; doesn't affect detection logic
	 */
	static showSessionBadge(): boolean {
		const config = vscode.workspace.getConfiguration("snapback.aiDetection");
		return config.get<boolean>("showSessionBadge", true); // Default: show badge
	}

	/**
	 * Returns the confidence threshold for displaying AI detection results
	 * Results below this threshold are hidden from UI (but still recorded)
	 */
	static confidenceThreshold(): number {
		const config = vscode.workspace.getConfiguration("snapback.aiDetection");
		return config.get<number>("confidenceThreshold", 6.0); // Default: 6.0/10
	}

	/**
	 * Listen for changes to AI detection settings
	 * Callback fires when any snapback.aiDetection.* setting changes
	 */
	static onSettingsChange(callback: () => void): vscode.Disposable {
		return vscode.workspace.onDidChangeConfiguration((event) => {
			if (event.affectsConfiguration("snapback.aiDetection")) {
				callback();
			}
		});
	}

	/**
	 * Validate settings at startup; log warnings if invalid
	 */
	static validate(): void {
		const enabled = AIDetectionSettings.isEnabled();
		const badge = AIDetectionSettings.showSessionBadge();
		const threshold = AIDetectionSettings.confidenceThreshold();

		if (threshold < 0 || threshold > 10) {
			console.warn(
				`[AIDetectionSettings] confidenceThreshold out of range: ${threshold} (expected 0-10, using default 6.0)`,
			);
		}

		console.debug(
			`[AIDetectionSettings] Initialized with: enabled=${enabled}, showBadge=${badge}, threshold=${threshold}`,
		);
	}
}
