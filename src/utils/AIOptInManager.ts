/**
 * @fileoverview AI Opt-In Manager - Manages user opt-in for AI-assisted session checkpointing
 *
 * This module provides utilities for managing user preferences around automatic
 * checkpointing of AI-assisted coding sessions. It includes a one-time Quick Pick
 * dialog to ask users if they want to enable automatic checkpointing for AI bursts.
 */

import * as vscode from "vscode";
import { logger } from "./logger.js";

/**
 * Keys for storing AI opt-in preferences
 */
const AI_OPT_IN_KEYS = {
	/** Whether user has made a choice about AI checkpointing */
	USER_CHOICE_MADE: "aiCheckpointingChoiceMade",

	/** Whether AI checkpointing is enabled */
	ENABLED: "aiCheckpointingEnabled",

	/** Timestamp of when the choice was made */
	CHOICE_TIMESTAMP: "aiCheckpointingChoiceTimestamp",
};

/**
 * AI Opt-In Manager - Manages user preferences for AI-assisted session checkpointing
 */
export class AIOptInManager {
	/** VS Code extension context */
	private context: vscode.ExtensionContext;

	/**
	 * Creates a new AI Opt-In Manager
	 *
	 * @param context - VS Code extension context
	 */
	constructor(context: vscode.ExtensionContext) {
		this.context = context;
	}

	/**
	 * Checks if the user has already made a choice about AI checkpointing
	 *
	 * @returns True if user has made a choice, false otherwise
	 */
	hasUserMadeChoice(): boolean {
		return !!this.context.globalState.get<boolean>(
			AI_OPT_IN_KEYS.USER_CHOICE_MADE,
		);
	}

	/**
	 * Checks if AI checkpointing is enabled
	 *
	 * @returns True if AI checkpointing is enabled, false otherwise
	 */
	isAIcheckpointingEnabled(): boolean {
		// If user hasn't made a choice yet, default to false
		if (!this.hasUserMadeChoice()) {
			return false;
		}

		return !!this.context.globalState.get<boolean>(AI_OPT_IN_KEYS.ENABLED);
	}

	/**
	 * Shows a one-time Quick Pick dialog to ask user about AI checkpointing
	 *
	 * @returns Promise that resolves to true if user enabled AI checkpointing, false otherwise
	 */
	async showAIOptInQuickPick(): Promise<boolean> {
		// Don't show if user has already made a choice
		if (this.hasUserMadeChoice()) {
			return this.isAIcheckpointingEnabled();
		}

		const items: (vscode.QuickPickItem & { value: boolean })[] = [
			{
				label: "$(check) Enable automatic checkpoints",
				description:
					"Create snapshots automatically during AI-assisted coding sessions",
				detail:
					"SnapBack will create checkpoints when it detects rapid, large insertions typical of AI assistants",
				value: true,
			},
			{
				label: "$(x) Keep manual snapshots only",
				description: "Continue creating snapshots manually as usual",
				detail:
					"You can still create snapshots manually with the existing commands",
				value: false,
			},
		];

		const selection = await vscode.window.showQuickPick(items, {
			title: "AI-Assisted Coding Detected",
			placeHolder:
				"Would you like to enable automatic checkpoints for AI-assisted sessions?",
		});

		if (selection) {
			const enabled = selection.value;
			this.saveUserChoice(enabled);
			return enabled;
		}

		// Default to false if dismissed
		this.saveUserChoice(false);
		return false;
	}

	/**
	 * Saves the user's choice about AI checkpointing
	 *
	 * @param enabled - Whether AI checkpointing is enabled
	 */
	private saveUserChoice(enabled: boolean): void {
		this.context.globalState.update(AI_OPT_IN_KEYS.USER_CHOICE_MADE, true);
		this.context.globalState.update(AI_OPT_IN_KEYS.ENABLED, enabled);
		this.context.globalState.update(
			AI_OPT_IN_KEYS.CHOICE_TIMESTAMP,
			Date.now(),
		);

		logger.info("AI checkpointing preference saved", {
			enabled,
			timestamp: Date.now(),
		});
	}

	/**
	 * Resets the user's choice (for testing or if user wants to change preference)
	 */
	resetUserChoice(): void {
		this.context.globalState.update(AI_OPT_IN_KEYS.USER_CHOICE_MADE, undefined);
		this.context.globalState.update(AI_OPT_IN_KEYS.ENABLED, undefined);
		this.context.globalState.update(AI_OPT_IN_KEYS.CHOICE_TIMESTAMP, undefined);

		logger.info("AI checkpointing preference reset");
	}

	/**
	 * Gets information about the user's choice
	 *
	 * @returns Object with information about the user's choice
	 */
	getUserChoiceInfo(): {
		choiceMade: boolean;
		enabled: boolean;
		timestamp?: number;
	} {
		return {
			choiceMade: this.hasUserMadeChoice(),
			enabled: this.isAIcheckpointingEnabled(),
			timestamp: this.context.globalState.get<number>(
				AI_OPT_IN_KEYS.CHOICE_TIMESTAMP,
			),
		};
	}
}
