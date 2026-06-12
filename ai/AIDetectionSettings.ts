/**
 * AIDetectionSettings
 *
 * Type-safe wrapper for VS Code settings related to AI detection (v1)
 * Settings are enforced at data-collection time, not just UI
 *
 * Configuration ID prefix: `vreko.aiDetection.*`
 */

import * as vscode from "vscode";

import { getVrekoConfig } from "../utils/config-helpers";
import { logger } from "../utils/logger";

export class AIDetectionSettings {
	/**
	 * Returns whether AI detection is enabled globally
	 * When disabled, no change data is collected and finalizeSession returns 'unknown'
	 */
	static isEnabled(): boolean {
		const config = getVrekoConfig();
		return config.get("aiDetection.enabled"); // Type-safe autocomplete!
	}

	/**
	 * Returns whether to show AI detection badge in status bar
	 * This is UI-only; doesn't affect detection logic
	 */
	static showSessionBadge(): boolean {
		const config = getVrekoConfig();
		return config.get("aiDetection.showSessionBadge"); // Type-safe autocomplete!
	}

	/**
	 * Returns the confidence threshold for displaying AI detection results
	 * Results below this threshold are hidden from UI (but still recorded)
	 */
	static confidenceThreshold(): number {
		const config = getVrekoConfig();
		return config.get("aiDetection.confidenceThreshold"); // Type-safe autocomplete!
	}

	/**
	 * Listen for changes to AI detection settings
	 * Callback fires when any vreko.aiDetection.* setting changes
	 */
	static onSettingsChange(callback: () => void): vscode.Disposable {
		return vscode.workspace.onDidChangeConfiguration((event) => {
			if (event.affectsConfiguration("vreko.aiDetection")) {
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
			logger.warn(
				`AIDetectionSettings: confidenceThreshold out of range: ${threshold} (expected 0-10, using default 6.0)`,
			);
		}

		logger.debug(
			`AIDetectionSettings: Initialized with: enabled=${enabled}, showBadge=${badge}, threshold=${threshold}`,
		);
	}
}
