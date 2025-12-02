/**
 * @fileoverview AI Detection Warning Manager
 *
 * Manages user-facing notifications when AI-assisted code generation is detected.
 * Integrates with detection pipeline and provides telemetry for accuracy validation.
 *
 * Flow:
 * 1. SaveHandler detects AI (via BurstHeuristicsDetector or AIPresenceDetector)
 * 2. AIWarningManager.showWarning(detection) called
 * 3. User sees warning with tool name and confidence
 * 4. User chooses: Accept & Save, Review Changes, or Restore Previous
 * 5. Telemetry tracks choice for accuracy monitoring
 */

import { logger } from "@snapback/infrastructure";
import type { BurstDetectionResult } from "@snapback/sdk";
import * as vscode from "vscode";
import { SNAPBACK_ICONS } from "../constants/index.js";
import type { Result } from "../types/result.js";
import { Ok } from "../types/result.js";

/**
 * AI detection data passed to warning manager
 */
export interface AIDetection {
	/** AI tool detected (GITHUB_COPILOT, CLAUDE, CURSOR, etc.) */
	tool: string;

	/** Confidence score (0-1) */
	confidence: number;

	/** Pattern type that triggered detection (burst, extension-presence, etc.) */
	pattern: string;

	/** Burst analysis details if available */
	burst?: BurstDetectionResult;
}

/**
 * User choice from AI warning dialog
 */
export type AIWarningChoice = "accept" | "review" | "restore" | "dismissed";

/**
 * Error type for AI warning dialog
 */
export type AIWarningError =
	| { type: "dialog_dismissed"; reason: "timeout" | "no_choice" }
	| { type: "dialog_failed"; message: string; cause?: Error };

/**
 * Result of warning display - success variant
 */
export interface AIWarningSuccess {
	/** User's choice */
	choice: AIWarningChoice;

	/** Timestamp when warning was shown */
	timestamp: number;

	/** How long user took to decide (ms) */
	responseTime: number;
}

/**
 * Result type for warning display
 * @example
 * ```typescript
 * const result = await warningManager.showWarning(detection);
 * if (isOk(result)) {
 *   const { choice, responseTime } = result.value;
 * } else {
 *   logger.error('Warning dialog failed', result.error);
 * }
 * ```
 */
export type AIWarningResult = Result<AIWarningSuccess, AIWarningError>;

/**
 * Manages AI detection warnings and user responses
 */
export class AIWarningManager {
	/**
	 * Show warning when AI is detected during save
	 *
	 * @param detection - AI detection result
	 * @returns Result with user's choice and timing data, or error if dialog failed
	 */
	async showWarning(detection: AIDetection): Promise<AIWarningResult> {
		const startTime = Date.now();

		// Build warning message
		const confidencePercent = Math.round(detection.confidence * 100);
		const message = this.buildWarningMessage(detection, confidencePercent);

		logger.debug("Showing AI detection warning", {
			tool: detection.tool,
			confidence: detection.confidence,
			pattern: detection.pattern,
		});

		// Show warning dialog with options
		const choice = await vscode.window.showWarningMessage(
			message,
			{ modal: false },
			"Review Changes",
			"Accept & Save",
			"Restore Previous",
		);

		const responseTime = Date.now() - startTime;
		const normalizedChoice = this.normalizeChoice(choice);

		// Log the warning shown
		await this.telemetryWarningShown(detection, normalizedChoice, responseTime);

		return Ok({
			choice: normalizedChoice,
			timestamp: startTime,
			responseTime,
		});
	}

	/**
	 * Build user-friendly warning message
	 */
	private buildWarningMessage(
		detection: AIDetection,
		confidencePercent: number,
	): string {
		const toolName = this.formatToolName(detection.tool);

		if (detection.burst) {
			// Include burst details if available
			const insertedChars = detection.burst.details?.totalInserted || 0;
			return (
				`${SNAPBACK_ICONS.AI} AI-assisted edit detected (${toolName}, ${confidencePercent}% confidence)\n\n` +
				`Rapid insertion of ~${insertedChars} characters detected.\n\n` +
				`Review changes before saving, or restore previous version.`
			);
		}

		// Simple message for extension-presence detection
		return (
			`${SNAPBACK_ICONS.AI} AI-assisted edit detected (${toolName}, ${confidencePercent}% confidence)\n\n` +
			`Review changes before saving, or restore previous version.`
		);
	}

	/**
	 * Convert button label to choice enum
	 */
	private normalizeChoice(buttonLabel: string | undefined): AIWarningChoice {
		switch (buttonLabel) {
			case "Review Changes":
				return "review";
			case "Accept & Save":
				return "accept";
			case "Restore Previous":
				return "restore";
			default:
				return "dismissed"; // User closed dialog without choosing
		}
	}

	/**
	 * Format tool name for display
	 */
	private formatToolName(tool: string): string {
		const mapping: Record<string, string> = {
			GITHUB_COPILOT: "GitHub Copilot",
			CLAUDE: "Claude",
			CURSOR: "Cursor",
			TABNINE: "Tabnine",
			CODEIUM: "Codeium",
			KITE: "Kite",
			AMAZON_CODEWHISPERER: "Amazon CodeWhisperer",
			JETBRAINS_AI: "JetBrains AI",
			GITHUB_COPILOT_X: "GitHub Copilot X",
		};

		return mapping[tool] || tool.replace(/_/g, " ");
	}

	/**
	 * Track AI warning telemetry
	 */
	private async telemetryWarningShown(
		detection: AIDetection,
		choice: AIWarningChoice,
		responseTime: number,
	): Promise<void> {
		try {
			logger.info("AI warning shown", {
				tool: detection.tool,
				confidence: detection.confidence,
				pattern: detection.pattern,
				choice,
				responseTime,
				burstDetail: detection.burst
					? {
							totalInserted: detection.burst.details?.totalInserted,
							totalDeleted: detection.burst.details?.totalDeleted,
							ratio: detection.burst.details?.ratio,
						}
					: undefined,
			});
		} catch (error) {
			logger.error("Failed to log AI warning telemetry", error as Error);
		}
	}

	/**
	 * Get formatted AI confidence for UI display
	 */
	static getConfidenceLabel(confidence: number): string {
		if (confidence >= 0.9) return "Very High";
		if (confidence >= 0.7) return "High";
		if (confidence >= 0.5) return "Medium";
		return "Low";
	}

	/**
	 * Check if AI detection confidence is high enough to warn
	 * (configurable threshold)
	 */
	static shouldWarn(confidence: number, threshold = 0.6): boolean {
		return confidence >= threshold;
	}
}
