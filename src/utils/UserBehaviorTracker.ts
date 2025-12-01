/**
 * @fileoverview User Behavior Tracker - Tracks user behavior for experience classification
 *
 * This module provides utilities for tracking user behavior metrics that are
 * used by the ExperienceClassifier to determine user experience tiers.
 */

import type * as vscode from "vscode";
import { logger } from "./logger.js";

/**
 * Keys for tracking user behavior in global state
 */
export const USER_BEHAVIOR_KEYS = {
	/** Total snapshots created */
	SNAPSHOTS_CREATED: "snapshotsCreated",

	/** Total sessions recorded */
	SESSIONS_RECORDED: "sessionsRecorded",

	/** Total protected files */
	PROTECTED_FILES: "protectedFiles",

	/** Total manual restores performed */
	MANUAL_RESTORES: "manualRestores",

	/** Total AI-assisted sessions */
	AI_ASSISTED_SESSIONS: "aiAssistedSessions",

	/** Commands used and their frequency */
	COMMANDS_USED: "commandsUsed",

	/** Timestamp of first use */
	FIRST_USE_TIMESTAMP: "firstUseTimestamp",

	/** Experience tier (manual override for testing) */
	EXPERIENCE_TIER: "experienceTier",

	/** Total tips shown */
	TIPS_SHOWN: "tipsShown",

	/** Total hints shown */
	HINTS_SHOWN: "hintsShown",

	/** Total warnings shown */
	WARNINGS_SHOWN: "warningsShown",

	/** Total blocks prevented */
	BLOCKS_PREVENTED: "blocksPrevented",

	/** Total files restored */
	FILES_RESTORED: "filesRestored",

	/** Total configuration changes */
	CONFIG_CHANGES: "configChanges",

	/** Total policy overrides created */
	POLICY_OVERRIDES: "policyOverrides",
} as const;

/**
 * User Behavior Tracker - Tracks user behavior metrics
 */
export class UserBehaviorTracker {
	/** VS Code extension context */
	private context: vscode.ExtensionContext;

	/**
	 * Creates a new User Behavior Tracker
	 *
	 * @param context - VS Code extension context
	 */
	constructor(context: vscode.ExtensionContext) {
		this.context = context;

		// Initialize first use timestamp if not already set
		this.initializeFirstUseTimestamp();
	}

	/**
	 * Initializes the first use timestamp if not already set
	 */
	private initializeFirstUseTimestamp(): void {
		if (
			!this.context.globalState.get<number>(
				USER_BEHAVIOR_KEYS.FIRST_USE_TIMESTAMP,
			)
		) {
			this.context.globalState.update(
				USER_BEHAVIOR_KEYS.FIRST_USE_TIMESTAMP,
				Date.now(),
			);
			logger.info("First use timestamp initialized");
		}
	}

	/**
	 * Increments a counter in global state
	 *
	 * @param key - Key of the counter to increment
	 * @param amount - Amount to increment by (default: 1)
	 */
	incrementCounter(
		key: keyof typeof USER_BEHAVIOR_KEYS,
		amount: number = 1,
	): void {
		const keyName = USER_BEHAVIOR_KEYS[key];
		const current = this.context.globalState.get<number>(keyName, 0);
		const newValue = current + amount;
		this.context.globalState.update(keyName, newValue);

		logger.debug("Counter incremented", {
			key: keyName,
			amount,
			newValue,
		});
	}

	/**
	 * Records command usage
	 *
	 * @param command - Command that was used
	 * @param count - Number of times the command was used (default: 1)
	 */
	recordCommandUsage(command: string, count: number = 1): void {
		const commandsUsed = this.context.globalState.get<Record<string, number>>(
			USER_BEHAVIOR_KEYS.COMMANDS_USED,
			{},
		);
		const commandsUsedRecord = commandsUsed || {};
		commandsUsedRecord[command] = (commandsUsedRecord[command] || 0) + count;
		this.context.globalState.update(
			USER_BEHAVIOR_KEYS.COMMANDS_USED,
			commandsUsedRecord,
		);

		logger.debug("Command usage recorded", {
			command,
			count,
			total: commandsUsedRecord[command],
		});
	}

	/**
	 * Gets a counter value
	 *
	 * @param key - Key of the counter to get
	 * @returns Current value of the counter
	 */
	getCounter(key: keyof typeof USER_BEHAVIOR_KEYS): number {
		const keyName = USER_BEHAVIOR_KEYS[key];
		return this.context.globalState.get<number>(keyName, 0);
	}

	/**
	 * Gets command usage statistics
	 *
	 * @returns Record of commands and their usage counts
	 */
	getCommandUsage(): Record<string, number> {
		const commandsUsed = this.context.globalState.get<Record<string, number>>(
			USER_BEHAVIOR_KEYS.COMMANDS_USED,
			{},
		);
		return commandsUsed || {};
	}

	/**
	 * Gets the first use timestamp
	 *
	 * @returns Timestamp of first use
	 */
	getFirstUseTimestamp(): number {
		const timestamp = this.context.globalState.get<number>(
			USER_BEHAVIOR_KEYS.FIRST_USE_TIMESTAMP,
		);
		return timestamp !== undefined ? timestamp : Date.now();
	}

	/**
	 * Resets all behavior tracking data (for testing)
	 */
	resetAllData(): void {
		for (const key of Object.values(USER_BEHAVIOR_KEYS)) {
			if (key !== USER_BEHAVIOR_KEYS.FIRST_USE_TIMESTAMP) {
				this.context.globalState.update(key, undefined);
			}
		}

		logger.info("All behavior tracking data reset");
	}

	/**
	 * Gets a summary of all tracked behavior metrics
	 *
	 * @returns Summary of all tracked metrics
	 */
	getBehaviorSummary(): Record<string, number> {
		const summary: Record<string, number> = {};

		for (const [key, value] of Object.entries(USER_BEHAVIOR_KEYS)) {
			if (
				value !== USER_BEHAVIOR_KEYS.COMMANDS_USED &&
				value !== USER_BEHAVIOR_KEYS.EXPERIENCE_TIER &&
				value !== USER_BEHAVIOR_KEYS.FIRST_USE_TIMESTAMP
			) {
				summary[key] = this.getCounter(key as keyof typeof USER_BEHAVIOR_KEYS);
			}
		}

		return summary;
	}

	/**
	 * Gets days since first use
	 *
	 * @returns Number of days since first use
	 */
	getDaysSinceFirstUse(): number {
		const firstUse = this.getFirstUseTimestamp();
		const now = Date.now();
		return Math.floor((now - firstUse) / (1000 * 60 * 60 * 24));
	}

	/**
	 * Gets command diversity score (0-1)
	 *
	 * @returns Command diversity score
	 */
	getCommandDiversity(): number {
		const commandsUsed = this.getCommandUsage();
		const totalCommands = Object.values(commandsUsed).reduce(
			(sum, count) => sum + count,
			0,
		);
		const uniqueCommands = Object.keys(commandsUsed).length;

		if (totalCommands === 0) {
			return 0;
		}

		return uniqueCommands / Math.min(totalCommands, 20);
	}
}
