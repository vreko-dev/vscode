/**
 * Adaptive Poller - Intelligent polling with dynamic intervals
 *
 * Adjusts polling frequency based on context:
 * - active: 2-3s (LLM surface actively using MCP)
 * - idle: 5-10s (User in VS Code but no active LLM calls)
 * - background: 10-30s (Window minimized or inactive)
 * - recovering: 1s (Rapid checks during recovery window)
 *
 * Features:
 * - Adaptive interval adjustment based on context
 * - Deep check scheduling (every Nth poll)
 * - Watchdog to detect stuck polling
 * - Pause/resume support
 *
 * @module services/AdaptivePoller
 */

import * as vscode from "vscode";
import { logger } from "../utils/logger";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Polling mode determines interval
 */
export type PollingMode = "active" | "idle" | "background" | "recovering";

/**
 * Type of health check to perform
 */
export type CheckType = "shallow" | "deep";

/**
 * Poll request emitted by the poller
 */
export interface PollRequest {
	type: CheckType;
	mode: PollingMode;
	pollNumber: number;
	timestamp: number;
}

/**
 * Configuration for adaptive poller
 */
export interface AdaptivePollerConfig {
	/** Interval for active mode (ms) */
	activeInterval: number;
	/** Interval for idle mode (ms) */
	idleInterval: number;
	/** Interval for background mode (ms) */
	backgroundInterval: number;
	/** Interval for recovering mode (ms) */
	recoveringInterval: number;
	/** Frequency of deep checks (every N polls) */
	deepCheckFrequency: number;
	/** Watchdog check interval (ms) */
	watchdogInterval: number;
}

// =============================================================================
// DEFAULT CONFIGURATION
// =============================================================================

const DEFAULT_CONFIG: AdaptivePollerConfig = {
	activeInterval: 3000, // 3s
	idleInterval: 10000, // 10s
	backgroundInterval: 30000, // 30s
	recoveringInterval: 1000, // 1s
	deepCheckFrequency: 5, // Every 5th poll
	watchdogInterval: 60000, // Check every minute
};

// =============================================================================
// ADAPTIVE POLLER
// =============================================================================

/**
 * AdaptivePoller - Manages polling with dynamic intervals
 *
 * Emits poll requests at configured intervals based on the current mode.
 * Supports deep check scheduling and watchdog monitoring.
 */
export class AdaptivePoller implements vscode.Disposable {
	private config: AdaptivePollerConfig;
	private mode: PollingMode = "idle";
	private pollTimer: NodeJS.Timeout | null = null;
	private watchdogTimer: NodeJS.Timeout | null = null;
	private pollCount = 0;
	private lastPollTime = 0;
	private isPaused = false;
	private forceDeepOnNextPoll = false;

	// Event emitters
	private readonly _onPollRequest = new vscode.EventEmitter<PollRequest>();
	readonly onPollRequest = this._onPollRequest.event;

	constructor(config: Partial<AdaptivePollerConfig> = {}) {
		this.config = { ...DEFAULT_CONFIG, ...config };
	}

	/**
	 * Start polling
	 */
	start(): void {
		if (this.pollTimer) {
			logger.debug("AdaptivePoller already started");
			return;
		}

		logger.info("AdaptivePoller started", { mode: this.mode });
		this.isPaused = false;
		this.scheduleNextPoll();
		this.startWatchdog();
	}

	/**
	 * Stop polling
	 */
	stop(): void {
		if (this.pollTimer) {
			clearTimeout(this.pollTimer);
			this.pollTimer = null;
		}

		if (this.watchdogTimer) {
			clearInterval(this.watchdogTimer);
			this.watchdogTimer = null;
		}

		logger.info("AdaptivePoller stopped");
	}

	/**
	 * Pause polling (keeps state, can resume)
	 */
	pause(): void {
		this.isPaused = true;
		if (this.pollTimer) {
			clearTimeout(this.pollTimer);
			this.pollTimer = null;
		}
		logger.debug("AdaptivePoller paused");
	}

	/**
	 * Resume polling
	 */
	resume(): void {
		if (!this.isPaused) {
			return;
		}
		this.isPaused = false;
		this.scheduleNextPoll();
		logger.debug("AdaptivePoller resumed");
	}

	/**
	 * Set polling mode
	 */
	setMode(mode: PollingMode): void {
		if (this.mode === mode) {
			return;
		}

		const previousMode = this.mode;
		this.mode = mode;

		logger.debug("AdaptivePoller mode changed", {
			from: previousMode,
			to: mode,
			interval: this.getCurrentInterval(),
		});

		// Reschedule with new interval if running
		if (this.pollTimer && !this.isPaused) {
			clearTimeout(this.pollTimer);
			this.scheduleNextPoll();
		}
	}

	/**
	 * Get current polling mode
	 */
	getMode(): PollingMode {
		return this.mode;
	}

	/**
	 * Get current interval based on mode
	 */
	getCurrentInterval(): number {
		switch (this.mode) {
			case "active":
				return this.config.activeInterval;
			case "idle":
				return this.config.idleInterval;
			case "background":
				return this.config.backgroundInterval;
			case "recovering":
				return this.config.recoveringInterval;
			default:
				return this.config.idleInterval;
		}
	}

	/**
	 * Force a deep check on the next poll
	 */
	forceDeepCheck(): void {
		this.forceDeepOnNextPoll = true;
	}

	/**
	 * Trigger an immediate poll (bypasses scheduling)
	 */
	triggerImmediate(type: CheckType = "shallow"): void {
		this.emitPollRequest(type);
	}

	/**
	 * Schedule the next poll
	 */
	private scheduleNextPoll(): void {
		if (this.isPaused) {
			return;
		}

		const interval = this.getCurrentInterval();

		this.pollTimer = setTimeout(() => {
			this.executePoll();
		}, interval);
	}

	/**
	 * Execute a poll
	 */
	private executePoll(): void {
		this.pollCount++;
		this.lastPollTime = Date.now();

		// Determine check type
		let checkType: CheckType = "shallow";

		if (this.forceDeepOnNextPoll) {
			checkType = "deep";
			this.forceDeepOnNextPoll = false;
		} else if (this.pollCount % this.config.deepCheckFrequency === 0) {
			checkType = "deep";
		}

		// Special case: always do deep check in recovering mode
		if (this.mode === "recovering") {
			checkType = "deep";
		}

		this.emitPollRequest(checkType);

		// Schedule next poll
		if (!this.isPaused) {
			this.scheduleNextPoll();
		}
	}

	/**
	 * Emit a poll request
	 */
	private emitPollRequest(type: CheckType): void {
		const request: PollRequest = {
			type,
			mode: this.mode,
			pollNumber: this.pollCount,
			timestamp: Date.now(),
		};

		this._onPollRequest.fire(request);
	}

	/**
	 * Start watchdog to detect stuck polling
	 */
	private startWatchdog(): void {
		if (this.watchdogTimer) {
			clearInterval(this.watchdogTimer);
		}

		this.watchdogTimer = setInterval(() => {
			this.checkWatchdog();
		}, this.config.watchdogInterval);
	}

	/**
	 * Check if polling is stuck
	 */
	private checkWatchdog(): void {
		if (this.isPaused || !this.pollTimer) {
			return;
		}

		const timeSinceLastPoll = Date.now() - this.lastPollTime;
		const expectedInterval = this.getCurrentInterval();

		// If last poll was more than 2x the expected interval ago, we're stuck
		if (timeSinceLastPoll > expectedInterval * 2) {
			logger.warn("AdaptivePoller watchdog detected stuck polling", {
				timeSinceLastPoll,
				expectedInterval,
			});

			// Force a poll and reschedule
			this.executePoll();
		}
	}

	/**
	 * Get poller statistics
	 */
	getStats(): {
		mode: PollingMode;
		pollCount: number;
		lastPollTime: number;
		currentInterval: number;
		isPaused: boolean;
		isRunning: boolean;
	} {
		return {
			mode: this.mode,
			pollCount: this.pollCount,
			lastPollTime: this.lastPollTime,
			currentInterval: this.getCurrentInterval(),
			isPaused: this.isPaused,
			isRunning: this.pollTimer !== null,
		};
	}

	/**
	 * Update configuration
	 */
	updateConfig(config: Partial<AdaptivePollerConfig>): void {
		this.config = { ...this.config, ...config };

		// Reschedule if running
		if (this.pollTimer && !this.isPaused) {
			clearTimeout(this.pollTimer);
			this.scheduleNextPoll();
		}
	}

	/**
	 * Dispose resources
	 */
	dispose(): void {
		this.stop();
		this._onPollRequest.dispose();
	}
}
