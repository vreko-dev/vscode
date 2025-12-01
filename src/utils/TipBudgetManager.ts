/**
 * @fileoverview Tip Budget Manager - Manages tip budgets to prevent overwhelming users
 *
 * This module provides utilities for managing tip budgets to ensure users don't
 * get overwhelmed with too many tips. It enforces limits on how often tips
 * can be shown based on time intervals and session boundaries.
 */

import type * as vscode from "vscode";
import { logger } from "./logger.js";

/**
 * Tip budget configuration
 */
const TIP_BUDGET_CONFIG = {
	/** Maximum tips per 48-hour period */
	MAX_TIPS_PER_48H: 1,

	/** Maximum tips per session */
	MAX_TIPS_PER_SESSION: 1,

	/** 48-hour period in milliseconds */
	PERIOD_48H: 48 * 60 * 60 * 1000,
} as const;

/**
 * Keys for tracking tip budget in global state
 */
const TIP_BUDGET_KEYS = {
	/** Timestamps of tips shown in last 48 hours */
	TIPS_SHOWN_TIMESTAMPS: "tipBudget.tipsShownTimestamps",

	/** Tips shown in current session */
	TIPS_SHOWN_CURRENT_SESSION: "tipBudget.tipsShownCurrentSession",

	/** Current session ID */
	CURRENT_SESSION_ID: "tipBudget.currentSessionId",
} as const;

/**
 * Tip Budget Manager - Manages tip budgets to prevent overwhelming users
 */
export class TipBudgetManager {
	/** VS Code extension context */
	private context: vscode.ExtensionContext;

	/** Current session ID */
	private currentSessionId: string;

	/**
	 * Creates a new Tip Budget Manager
	 *
	 * @param context - VS Code extension context
	 */
	constructor(context: vscode.ExtensionContext) {
		this.context = context;
		this.currentSessionId = this.generateSessionId();

		// Initialize session tracking
		this.initializeSession();
	}

	/**
	 * Generates a session ID
	 *
	 * @returns Session ID
	 */
	private generateSessionId(): string {
		return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
	}

	/**
	 * Initializes session tracking
	 */
	private initializeSession(): void {
		const storedSessionId = this.context.globalState.get<string>(
			TIP_BUDGET_KEYS.CURRENT_SESSION_ID,
		);

		if (storedSessionId) {
			this.currentSessionId = storedSessionId;
		} else {
			this.context.globalState.update(
				TIP_BUDGET_KEYS.CURRENT_SESSION_ID,
				this.currentSessionId,
			);
		}

		// Initialize current session tip count if not already set
		if (
			!this.context.globalState.get<number>(
				TIP_BUDGET_KEYS.TIPS_SHOWN_CURRENT_SESSION,
			)
		) {
			this.context.globalState.update(
				TIP_BUDGET_KEYS.TIPS_SHOWN_CURRENT_SESSION,
				0,
			);
		}

		logger.debug("Tip budget session initialized", {
			sessionId: this.currentSessionId,
		});
	}

	/**
	 * Checks if a tip can be shown based on budget constraints
	 *
	 * @returns True if a tip can be shown, false otherwise
	 */
	canShowTip(): boolean {
		const now = Date.now();

		// Check session budget
		const tipsShownCurrentSession = this.context.globalState.get<number>(
			TIP_BUDGET_KEYS.TIPS_SHOWN_CURRENT_SESSION,
			0,
		);
		if (tipsShownCurrentSession >= TIP_BUDGET_CONFIG.MAX_TIPS_PER_SESSION) {
			logger.debug("Tip budget exceeded for current session", {
				tipsShown: tipsShownCurrentSession,
				maxPerSession: TIP_BUDGET_CONFIG.MAX_TIPS_PER_SESSION,
			});
			return false;
		}

		// Check 48-hour budget
		const tipsShownTimestamps = this.context.globalState.get<number[]>(
			TIP_BUDGET_KEYS.TIPS_SHOWN_TIMESTAMPS,
			[],
		);
		const recentTips = tipsShownTimestamps.filter(
			(timestamp) => now - timestamp < TIP_BUDGET_CONFIG.PERIOD_48H,
		);

		if (recentTips.length >= TIP_BUDGET_CONFIG.MAX_TIPS_PER_48H) {
			logger.debug("Tip budget exceeded for 48-hour period", {
				recentTips: recentTips.length,
				maxPer48h: TIP_BUDGET_CONFIG.MAX_TIPS_PER_48H,
			});
			return false;
		}

		return true;
	}

	/**
	 * Records that a tip was shown
	 */
	recordTipShown(): void {
		const now = Date.now();

		// Update session counter
		const tipsShownCurrentSession = this.context.globalState.get<number>(
			TIP_BUDGET_KEYS.TIPS_SHOWN_CURRENT_SESSION,
			0,
		);
		this.context.globalState.update(
			TIP_BUDGET_KEYS.TIPS_SHOWN_CURRENT_SESSION,
			tipsShownCurrentSession + 1,
		);

		// Update 48-hour timestamps
		const tipsShownTimestamps = this.context.globalState.get<number[]>(
			TIP_BUDGET_KEYS.TIPS_SHOWN_TIMESTAMPS,
			[],
		);
		const recentTips = tipsShownTimestamps.filter(
			(timestamp) => now - timestamp < TIP_BUDGET_CONFIG.PERIOD_48H,
		);
		recentTips.push(now);
		this.context.globalState.update(
			TIP_BUDGET_KEYS.TIPS_SHOWN_TIMESTAMPS,
			recentTips,
		);

		logger.debug("Tip shown recorded", {
			sessionId: this.currentSessionId,
			tipsShownCurrentSession: tipsShownCurrentSession + 1,
			totalRecentTips: recentTips.length,
		});
	}

	/**
	 * Starts a new session
	 */
	startNewSession(): void {
		this.currentSessionId = this.generateSessionId();
		this.context.globalState.update(
			TIP_BUDGET_KEYS.CURRENT_SESSION_ID,
			this.currentSessionId,
		);
		this.context.globalState.update(
			TIP_BUDGET_KEYS.TIPS_SHOWN_CURRENT_SESSION,
			0,
		);

		logger.info("New tip budget session started", {
			sessionId: this.currentSessionId,
		});
	}

	/**
	 * Gets current session ID
	 *
	 * @returns Current session ID
	 */
	getCurrentSessionId(): string {
		return this.currentSessionId;
	}

	/**
	 * Gets tip budget status
	 *
	 * @returns Current tip budget status
	 */
	getBudgetStatus(): {
		canShowTip: boolean;
		tipsShownCurrentSession: number;
		tipsShownLast48h: number;
		maxTipsPerSession: number;
		maxTipsPer48h: number;
	} {
		const tipsShownCurrentSession = this.context.globalState.get<number>(
			TIP_BUDGET_KEYS.TIPS_SHOWN_CURRENT_SESSION,
			0,
		);
		const tipsShownTimestamps = this.context.globalState.get<number[]>(
			TIP_BUDGET_KEYS.TIPS_SHOWN_TIMESTAMPS,
			[],
		);
		const now = Date.now();
		const recentTips = tipsShownTimestamps.filter(
			(timestamp) => now - timestamp < TIP_BUDGET_CONFIG.PERIOD_48H,
		);

		return {
			canShowTip: this.canShowTip(),
			tipsShownCurrentSession,
			tipsShownLast48h: recentTips.length,
			maxTipsPerSession: TIP_BUDGET_CONFIG.MAX_TIPS_PER_SESSION,
			maxTipsPer48h: TIP_BUDGET_CONFIG.MAX_TIPS_PER_48H,
		};
	}

	/**
	 * Resets tip budget data (for testing)
	 */
	resetBudgetData(): void {
		this.context.globalState.update(
			TIP_BUDGET_KEYS.TIPS_SHOWN_TIMESTAMPS,
			undefined,
		);
		this.context.globalState.update(
			TIP_BUDGET_KEYS.TIPS_SHOWN_CURRENT_SESSION,
			undefined,
		);
		this.context.globalState.update(
			TIP_BUDGET_KEYS.CURRENT_SESSION_ID,
			undefined,
		);

		logger.info("Tip budget data reset");
	}

	/**
	 * Gets remaining budget for current session
	 *
	 * @returns Number of tips remaining in current session
	 */
	getRemainingSessionBudget(): number {
		const tipsShownCurrentSession = this.context.globalState.get<number>(
			TIP_BUDGET_KEYS.TIPS_SHOWN_CURRENT_SESSION,
			0,
		);
		return Math.max(
			0,
			TIP_BUDGET_CONFIG.MAX_TIPS_PER_SESSION - tipsShownCurrentSession,
		);
	}

	/**
	 * Gets remaining budget for 48-hour period
	 *
	 * @returns Number of tips remaining in 48-hour period
	 */
	getRemaining48hBudget(): number {
		const tipsShownTimestamps = this.context.globalState.get<number[]>(
			TIP_BUDGET_KEYS.TIPS_SHOWN_TIMESTAMPS,
			[],
		);
		const now = Date.now();
		const recentTips = tipsShownTimestamps.filter(
			(timestamp) => now - timestamp < TIP_BUDGET_CONFIG.PERIOD_48H,
		);
		return Math.max(0, TIP_BUDGET_CONFIG.MAX_TIPS_PER_48H - recentTips.length);
	}
}
