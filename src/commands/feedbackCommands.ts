/**
 * @fileoverview Feedback Commands
 *
 * Registers commands for user feedback on AI detection accuracy.
 * Integrates FeedbackManager with VS Code command system.
 */

import * as vscode from "vscode";
import { FeedbackManager } from "../engine/FeedbackManager";
import { logger } from "../utils/logger";
import { registerCommandSafely } from "./types";

/**
 * Register all feedback-related commands
 *
 * Commands:
 * - snapback.feedback.reportFalsePositive: User reports AI detection as false positive
 */
export function registerFeedbackCommands(context: vscode.ExtensionContext): vscode.Disposable[] {
	logger.info("Registering feedback commands");

	const disposables: vscode.Disposable[] = [];

	// Command: Report False Positive
	const reportFalsePositiveDisposable = registerCommandSafely("snapback.feedback.reportFalsePositive", async () => {
		try {
			const feedbackManager = FeedbackManager.getInstance();
			await feedbackManager.reportFalsePositive();
			logger.info("False positive report submitted via command");
		} catch (error) {
			logger.error("Failed to report false positive", error as Error);
			vscode.window.showErrorMessage(
				`Failed to report false positive: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	});

	disposables.push(reportFalsePositiveDisposable);
	context.subscriptions.push(...disposables);
	logger.debug("Feedback command 'snapback.feedback.reportFalsePositive' registered");

	return disposables;
}
