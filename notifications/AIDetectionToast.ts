/**
 * AIDetectionToast - Toast notification for AI activity detection
 *
 * Replaces status bar AI detection with a non-intrusive toast notification.
 * Philosophy: "Invisible until needed, surface when beneficial."
 *
 * This is a FIRST VALUE MOMENT - the user should feel trust, not confusion.
 * We INFORM them that protection is active, we don't ASK questions.
 *
 * Reference: Status Bar Consolidation Spec
 *
 * TRIGGER RULES:
 * - AI activity detected with confidence > 70%
 * - User has not already been informed this session
 * - At least 30 seconds since last toast (prevent spam)
 *
 * @packageDocumentation
 */

import * as vscode from "vscode";

import { TelemetryService } from "../analytics/telemetry";
import { logger } from "../utils/logger";

/**
 * AI signal from detection system
 */
export interface AISignal {
	type: string;
	confidence: number;
}

/**
 * Detected AI tool types (for telemetry)
 */
const AI_TOOLS = ["Cursor", "Copilot", "Claude", "Windsurf", "Other"] as const;
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
 * - Once per session (after first detection)
 * - Respects cooldown (no spam)
 * - INFORMS, does not ASK - builds trust
 */
export class AIDetectionToast {
	private hasShownThisSession = false;
	private lastShownAt = 0;

	/**
	 * Show AI detection toast if conditions are met
	 *
	 * Philosophy: Inform the user that protection is active.
	 * This is a TRUST-BUILDING moment, not a data-gathering moment.
	 *
	 * @param signals - Detected AI signals with confidence scores
	 * @returns The inferred AI tool, or undefined if not shown
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

		// Infer the AI tool from signals
		const inferredTool = this.inferAITool(signals);

		// Show informative toast (not asking a question)
		this.lastShownAt = now;
		this.hasShownThisSession = true;

		// 🎉 FIRST VALUE MOMENT: Inform, don't ask
		const message =
			inferredTool && inferredTool !== "Other"
				? `🦎 Vreko detected ${inferredTool}. Protection active.`
				: "🦎 Vreko: AI activity detected. Protection active.";

		vscode.window.showInformationMessage(message);

		// Track detection via telemetry (non-blocking)
		this.trackDetection(signals, inferredTool);

		return inferredTool;
	}

	/**
	 * Infer AI tool from signal types
	 */
	private inferAITool(signals: AISignal[]): AITool {
		// Map signal types to AI tools
		const typeToTool: Record<string, AITool> = {
			cursor: "Cursor",
			copilot: "Copilot",
			claude: "Claude",
			windsurf: "Windsurf",
			"github-copilot": "Copilot",
			"cursor-ai": "Cursor",
		};

		for (const signal of signals) {
			const normalizedType = signal.type.toLowerCase();
			for (const [key, tool] of Object.entries(typeToTool)) {
				if (normalizedType.includes(key)) {
					return tool;
				}
			}
		}

		return "Other";
	}

	/**
	 * Reset session state (allows toast to show again)
	 * Call this when starting a new work session
	 */
	resetSession(): void {
		this.hasShownThisSession = false;
	}

	/**
	 * Track AI detection via telemetry (non-blocking)
	 */
	private trackDetection(signals: AISignal[], inferredTool: AITool): void {
		try {
			// Guard: Check if TelemetryService is initialized (debug level - expected during early startup)
			if (!TelemetryService.isInitialized()) {
				logger.debug("AIDetectionToast: TelemetryService not initialized, skipping tracking");
				return;
			}

			const telemetry = TelemetryService.getInstance();
			telemetry.track("ai_detection", {
				detected_signals: signals.map((s) => ({ type: s.type, confidence: s.confidence })),
				inferred_tool: inferredTool,
			});
		} catch (error) {
			logger.error("AIDetectionToast: Failed to track detection", error instanceof Error ? error : undefined);
		}
	}
}
