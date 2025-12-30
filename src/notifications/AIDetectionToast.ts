/**
 * AIDetectionToast - Toast notification for AI activity detection
 *
 * Replaces status bar AI detection with a non-intrusive toast notification.
 * Users can provide feedback about which AI tool they're using.
 *
 * Reference: Status Bar Consolidation Spec
 *
 * TRIGGER RULES:
 * - AI activity detected with confidence > 70%
 * - User has not already provided feedback this session
 * - At least 30 seconds since last toast (prevent spam)
 *
 * @packageDocumentation
 */

import * as vscode from "vscode";
import { TelemetryService } from "../analytics/telemetry";

/**
 * AI signal from detection system
 */
export interface AISignal {
	type: string;
	confidence: number;
}

/**
 * Available AI tool options
 */
const AI_TOOLS = ["Cursor", "Copilot", "Claude", "Windsurf", "Other", "Not AI"] as const;
export type AITool = (typeof AI_TOOLS)[number];

/**
 * Confidence threshold for showing toast (70%)
 */
const CONFIDENCE_THRESHOLD = 0.7;

/**
 * Cooldown period between toasts (30 seconds)
 */
const COOLDOWN_MS = 30_000;

/**
 * AIDetectionToast - Shows toast notification for AI activity detection
 *
 * Design principles:
 * - Non-intrusive (toast, not modal)
 * - Once per session (after feedback)
 * - Respects cooldown (no spam)
 * - Tracks feedback for improvement
 */
export class AIDetectionToast {
	private hasShownThisSession = false;
	private lastShownAt = 0;

	/**
	 * Show AI detection toast if conditions are met
	 *
	 * @param signals - Detected AI signals with confidence scores
	 * @returns Selected AI tool or undefined if dismissed/not shown
	 */
	async show(signals: AISignal[]): Promise<AITool | undefined> {
		// Check confidence threshold (use max confidence from signals)
		// Must be STRICTLY greater than 70% (spec: "confidence > 70%")
		const maxConfidence = signals.length > 0 ? Math.max(...signals.map((s) => s.confidence)) : 0;
		if (maxConfidence <= CONFIDENCE_THRESHOLD) {
			return undefined;
		}

		// Check if already shown this session
		if (this.hasShownThisSession) {
			return undefined;
		}

		// Check cooldown
		const now = Date.now();
		if (now - this.lastShownAt < COOLDOWN_MS) {
			return undefined;
		}

		// Show toast
		this.lastShownAt = now;

		const selection = await vscode.window.showInformationMessage(
			"🧢 AI activity detected. Which assistant are you using?",
			...AI_TOOLS,
		);

		if (selection) {
			this.hasShownThisSession = true;

			// Track feedback via telemetry
			this.trackFeedback(signals, selection as AITool);
		}

		return selection as AITool | undefined;
	}

	/**
	 * Reset session state (allows toast to show again)
	 * Call this when starting a new work session
	 */
	resetSession(): void {
		this.hasShownThisSession = false;
	}

	/**
	 * Track AI tool feedback via telemetry
	 */
	private trackFeedback(signals: AISignal[], selection: AITool): void {
		try {
			// Guard: Check if TelemetryService is initialized
			if (!TelemetryService.isInitialized()) {
				console.warn("[AIDetectionToast] TelemetryService not initialized, skipping feedback tracking");
				return;
			}

			const telemetry = TelemetryService.getInstance();
			telemetry.track("ai_tool_feedback", {
				detected_signals: signals.map((s) => ({ type: s.type, confidence: s.confidence })),
				user_selection: selection,
			});
		} catch (error) {
			console.error("[AIDetectionToast] Failed to track feedback:", error);
		}
	}
}
