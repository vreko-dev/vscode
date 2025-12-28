/**
 * AIUndoNotification - One-Click AI Undo Toast
 *
 * Shows a simple toast when AI changes are detected and snapshotted:
 * "AI change detected. Snapshot created. [Undo] [Dismiss]"
 *
 * UX Best Practices Applied:
 * - Brief, actionable message (3-8 second attention span)
 * - Single primary action (Undo)
 * - Non-blocking (user can ignore)
 * - Respects user preference setting
 *
 * @see https://code.visualstudio.com/api/ux-guidelines/notifications
 */

import * as path from "node:path";
import * as vscode from "vscode";
import { logger } from "../utils/logger";

export interface AIUndoEvent {
	/** Path to the file that was modified */
	filePath: string;
	/** Snapshot ID for restoration */
	snapshotId: string;
	/** AI tool that was detected */
	aiTool: string;
	/** Confidence score (0-1) */
	confidence: number;
}

/**
 * Configuration for AI Undo notifications
 */
export interface AIUndoConfig {
	/** Show toast notifications for AI changes */
	enabled: boolean;
	/** Only show for significant changes (> threshold lines) */
	significantThreshold: number;
	/** Minimum confidence to show notification */
	minConfidence: number;
}

const DEFAULT_CONFIG: AIUndoConfig = {
	enabled: true,
	significantThreshold: 5, // lines
	minConfidence: 0.7,
};

/**
 * AIUndoNotification handles the "first-value moment" toast.
 *
 * This is the key UX that makes users feel protected:
 * They see protection happening in real-time with immediate action available.
 */
export class AIUndoNotification {
	private config: AIUndoConfig;
	private lastNotificationTime = 0;
	private static readonly COOLDOWN_MS = 5000; // 5 seconds between notifications

	constructor(config: Partial<AIUndoConfig> = {}) {
		this.config = { ...DEFAULT_CONFIG, ...config };
	}

	/**
	 * Show AI undo notification if appropriate.
	 *
	 * @param event The AI change event
	 * @param linesChanged Number of lines changed (for throttling)
	 * @returns True if notification was shown
	 */
	async show(event: AIUndoEvent, linesChanged = 0): Promise<boolean> {
		// Check if enabled
		if (!this.config.enabled) {
			logger.debug("AI undo notification disabled by config");
			return false;
		}

		// Check if change is significant enough to notify (skip tiny changes)
		if (linesChanged > 0 && linesChanged < this.config.significantThreshold) {
			logger.debug("AI undo notification skipped - below significant threshold", {
				linesChanged,
				threshold: this.config.significantThreshold,
			});
			return false;
		}

		// Check confidence threshold
		if (event.confidence < this.config.minConfidence) {
			logger.debug("AI undo notification skipped - below confidence threshold", {
				confidence: event.confidence,
				threshold: this.config.minConfidence,
			});
			return false;
		}

		// Throttle notifications (prevent toast fatigue)
		const now = Date.now();
		if (now - this.lastNotificationTime < AIUndoNotification.COOLDOWN_MS) {
			logger.debug("AI undo notification throttled", {
				timeSinceLast: now - this.lastNotificationTime,
			});
			return false;
		}

		// Check user preference
		const userPref = vscode.workspace.getConfiguration("snapback").get<boolean>("showAIChangeToasts", true);
		if (!userPref) {
			logger.debug("AI undo notification disabled by user preference");
			return false;
		}

		this.lastNotificationTime = now;

		const fileName = path.basename(event.filePath);
		const toolLabel = this.formatToolName(event.aiTool);

		// The first-value moment message
		const message = `${toolLabel} change detected in ${fileName}. Snapshot created.`;

		logger.info("Showing AI undo notification", {
			filePath: event.filePath,
			snapshotId: event.snapshotId,
			aiTool: event.aiTool,
			confidence: event.confidence,
		});

		try {
			const selection = await vscode.window.showInformationMessage(
				message,
				"Undo",
				"View Diff",
				"Don't show again",
			);

			switch (selection) {
				case "Undo":
					await this.handleUndo(event);
					break;
				case "View Diff":
					await this.handleViewDiff(event);
					break;
				case "Don't show again":
					await this.handleDisable();
					break;
				default:
					// User dismissed - that's fine
					logger.debug("AI undo notification dismissed");
			}

			return true;
		} catch (error) {
			logger.error("Failed to show AI undo notification", error instanceof Error ? error : undefined);
			return false;
		}
	}

	/**
	 * Handle Undo button click - restore to pre-AI snapshot
	 */
	private async handleUndo(event: AIUndoEvent): Promise<void> {
		logger.info("User clicked Undo on AI change notification", {
			snapshotId: event.snapshotId,
			filePath: event.filePath,
		});

		try {
			// Execute the undo command
			await vscode.commands.executeCommand("snapback.undoLastAIChange", event.snapshotId, event.filePath);

			// Show confirmation
			const fileName = path.basename(event.filePath);
			vscode.window.setStatusBarMessage(`Reverted ${fileName} to pre-AI state`, 3000);
		} catch (error) {
			logger.error("Failed to undo AI change", error instanceof Error ? error : undefined);
			vscode.window.showErrorMessage("Failed to undo AI change. Try using the Snapshots panel.");
		}
	}

	/**
	 * Handle View Diff button click
	 */
	private async handleViewDiff(event: AIUndoEvent): Promise<void> {
		logger.info("User clicked View Diff on AI change notification", {
			snapshotId: event.snapshotId,
		});

		try {
			const fileUri = vscode.Uri.file(event.filePath);
			await vscode.commands.executeCommand("snapback.compareWithSnapshot", fileUri);
		} catch (error) {
			logger.error("Failed to open diff view", error instanceof Error ? error : undefined);
			vscode.window.showErrorMessage("Failed to open diff view.");
		}
	}

	/**
	 * Handle Don't show again button click
	 */
	private async handleDisable(): Promise<void> {
		logger.info("User disabled AI undo notifications");

		await vscode.workspace.getConfiguration("snapback").update("showAIChangeToasts", false, true);

		vscode.window.showInformationMessage(
			"AI change notifications disabled. Re-enable in Settings > SnapBack > Show AI Change Toasts.",
		);
	}

	/**
	 * Format AI tool name for display
	 */
	private formatToolName(tool: string): string {
		const toolMap: Record<string, string> = {
			copilot: "GitHub Copilot",
			"github.copilot": "GitHub Copilot",
			cursor: "Cursor",
			claude: "Claude",
			tabnine: "Tabnine",
			codeium: "Codeium",
			unknown: "AI",
		};

		return toolMap[tool.toLowerCase()] || tool || "AI";
	}

	/**
	 * Update configuration dynamically
	 */
	updateConfig(config: Partial<AIUndoConfig>): void {
		this.config = { ...this.config, ...config };
	}
}

// Singleton instance for extension-wide use
let aiUndoNotificationInstance: AIUndoNotification | null = null;

/**
 * Get or create the AIUndoNotification instance
 */
export function getAIUndoNotification(): AIUndoNotification {
	if (!aiUndoNotificationInstance) {
		aiUndoNotificationInstance = new AIUndoNotification();
	}
	return aiUndoNotificationInstance;
}

/**
 * Dispose the AIUndoNotification instance
 */
export function disposeAIUndoNotification(): void {
	aiUndoNotificationInstance = null;
}
