/**
 * Health State Manager - State machine for MCP health states
 *
 * Manages health state transitions with validation rules:
 * - unknown → healthy (on first successful check)
 * - healthy → degraded (latency > degradedThreshold)
 * - degraded → healthy (latency < degradedThreshold)
 * - degraded → unhealthy (latency > unhealthyThreshold or timeout)
 * - unhealthy → healthy (3 consecutive successful checks)
 * - any → unknown (on connection lost)
 *
 * @module services/HealthStateManager
 */

import * as vscode from "vscode";
import { logger } from "../utils/logger";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Health state of the MCP server
 */
export type HealthState = "healthy" | "degraded" | "unhealthy" | "unknown";

/**
 * Health check result from polling
 */
export interface HealthCheckResult {
	type: "shallow" | "deep";
	state: HealthState;
	timestamp: number;
	latencyMs: number;
	remoteHealthy: boolean;
	localHealthy: boolean;
	serverVersion?: string;
	toolExecutionSuccess?: boolean;
	error?: string;
}

/**
 * Health state change event
 */
export interface HealthChangeEvent {
	previousState: HealthState;
	currentState: HealthState;
	timestamp: number;
	reason: string;
	latencyMs?: number;
}

/**
 * Recovery event when transitioning from unhealthy to healthy
 */
export interface RecoveryEvent {
	timestamp: number;
	downtimeDurationMs: number;
	consecutiveSuccesses: number;
}

/**
 * Failure event when transitioning to unhealthy
 */
export interface FailureEvent {
	timestamp: number;
	reason: string;
	lastLatencyMs?: number;
}

/**
 * Latency metrics for trending
 */
export interface LatencyMetrics {
	current: number;
	p50: number;
	p95: number;
	p99: number;
	jitter: number;
	trend: "improving" | "stable" | "degrading";
}

/**
 * Configuration for state manager
 */
export interface HealthStateConfig {
	/** Latency threshold for degraded state (ms) */
	degradedLatencyThreshold: number;
	/** Latency threshold for unhealthy state (ms) */
	unhealthyLatencyThreshold: number;
	/** Number of consecutive healthy checks needed to recover */
	recoveryThreshold: number;
	/** Maximum history size for latency metrics */
	maxHistorySize: number;
}

// =============================================================================
// DEFAULT CONFIGURATION
// =============================================================================

const DEFAULT_CONFIG: HealthStateConfig = {
	degradedLatencyThreshold: 500,
	unhealthyLatencyThreshold: 2000,
	recoveryThreshold: 3,
	maxHistorySize: 100,
};

// =============================================================================
// HEALTH STATE MANAGER
// =============================================================================

/**
 * HealthStateManager - Manages health state transitions
 *
 * Implements a state machine with the following states:
 * - unknown: Initial state, no health data
 * - healthy: Server responding within acceptable latency
 * - degraded: Server responding but with high latency
 * - unhealthy: Server not responding or timing out
 */
export class HealthStateManager implements vscode.Disposable {
	private currentState: HealthState = "unknown";
	private config: HealthStateConfig;

	// Recovery tracking
	private consecutiveSuccesses = 0;
	private consecutiveFailures = 0;
	private unhealthySince: number | null = null;

	// Latency history for metrics
	private latencyHistory: number[] = [];

	// Event emitters
	private readonly _onHealthChange = new vscode.EventEmitter<HealthChangeEvent>();
	private readonly _onRecovery = new vscode.EventEmitter<RecoveryEvent>();
	private readonly _onFailure = new vscode.EventEmitter<FailureEvent>();

	readonly onHealthChange = this._onHealthChange.event;
	readonly onRecovery = this._onRecovery.event;
	readonly onFailure = this._onFailure.event;

	constructor(config: Partial<HealthStateConfig> = {}) {
		this.config = { ...DEFAULT_CONFIG, ...config };
	}

	/**
	 * Get current health state
	 */
	getState(): HealthState {
		return this.currentState;
	}

	/**
	 * Process a health check result and update state
	 */
	processHealthCheck(result: HealthCheckResult): HealthChangeEvent | null {
		const previousState = this.currentState;

		// Determine new state based on result
		let newState: HealthState;
		let reason: string;

		if (result.error || (!result.remoteHealthy && !result.localHealthy)) {
			// Check failed
			newState = this.handleFailure(result);
			reason = result.error || "Health check failed";
		} else {
			// Check succeeded - determine state based on latency
			newState = this.handleSuccess(result);
			reason = this.getLatencyReason(result.latencyMs);
		}

		// Record latency for metrics
		if (result.latencyMs > 0) {
			this.recordLatency(result.latencyMs);
		}

		// Check if state changed
		if (newState !== previousState) {
			this.currentState = newState;

			const event: HealthChangeEvent = {
				previousState,
				currentState: newState,
				timestamp: result.timestamp,
				reason,
				latencyMs: result.latencyMs,
			};

			// Emit state change
			this._onHealthChange.fire(event);

			// Emit recovery/failure events as appropriate
			if (previousState === "unhealthy" && newState === "healthy") {
				this.emitRecovery();
			} else if (newState === "unhealthy" && previousState !== "unhealthy") {
				this.emitFailure(reason, result.latencyMs);
			}

			logger.info("Health state changed", {
				from: previousState,
				to: newState,
				reason,
				latencyMs: result.latencyMs,
			});

			return event;
		}

		return null;
	}

	/**
	 * Handle successful health check
	 */
	private handleSuccess(result: HealthCheckResult): HealthState {
		this.consecutiveFailures = 0;
		this.consecutiveSuccesses++;

		const latency = result.latencyMs;

		// Check recovery from unhealthy
		if (this.currentState === "unhealthy") {
			if (this.consecutiveSuccesses >= this.config.recoveryThreshold) {
				return "healthy";
			}
			// Not enough consecutive successes yet
			return "unhealthy";
		}

		// Determine state based on latency thresholds
		if (latency >= this.config.unhealthyLatencyThreshold) {
			return "unhealthy";
		}

		if (latency >= this.config.degradedLatencyThreshold) {
			return "degraded";
		}

		return "healthy";
	}

	/**
	 * Handle failed health check
	 */
	private handleFailure(result: HealthCheckResult): HealthState {
		this.consecutiveSuccesses = 0;
		this.consecutiveFailures++;

		// Track when we first became unhealthy
		if (this.currentState !== "unhealthy" && this.unhealthySince === null) {
			this.unhealthySince = result.timestamp;
		}

		return "unhealthy";
	}

	/**
	 * Get reason string based on latency
	 */
	private getLatencyReason(latencyMs: number): string {
		if (latencyMs >= this.config.unhealthyLatencyThreshold) {
			return `Latency ${latencyMs}ms exceeds unhealthy threshold (${this.config.unhealthyLatencyThreshold}ms)`;
		}
		if (latencyMs >= this.config.degradedLatencyThreshold) {
			return `Latency ${latencyMs}ms exceeds degraded threshold (${this.config.degradedLatencyThreshold}ms)`;
		}
		return `Latency ${latencyMs}ms within healthy range`;
	}

	/**
	 * Record latency for metrics calculation
	 */
	private recordLatency(latencyMs: number): void {
		this.latencyHistory.push(latencyMs);

		// Trim to max size
		if (this.latencyHistory.length > this.config.maxHistorySize) {
			this.latencyHistory.shift();
		}
	}

	/**
	 * Emit recovery event
	 */
	private emitRecovery(): void {
		const downtimeDurationMs = this.unhealthySince ? Date.now() - this.unhealthySince : 0;

		this._onRecovery.fire({
			timestamp: Date.now(),
			downtimeDurationMs,
			consecutiveSuccesses: this.consecutiveSuccesses,
		});

		// Reset unhealthy tracking
		this.unhealthySince = null;
	}

	/**
	 * Emit failure event
	 */
	private emitFailure(reason: string, lastLatencyMs?: number): void {
		this.unhealthySince = Date.now();

		this._onFailure.fire({
			timestamp: Date.now(),
			reason,
			lastLatencyMs,
		});
	}

	/**
	 * Force state to unknown (used when connection is lost)
	 */
	forceUnknown(reason = "Connection lost"): void {
		if (this.currentState !== "unknown") {
			const previousState = this.currentState;
			this.currentState = "unknown";

			this._onHealthChange.fire({
				previousState,
				currentState: "unknown",
				timestamp: Date.now(),
				reason,
			});

			// Reset counters
			this.consecutiveSuccesses = 0;
			this.consecutiveFailures = 0;
		}
	}

	/**
	 * Get latency metrics
	 */
	getLatencyMetrics(): LatencyMetrics {
		if (this.latencyHistory.length === 0) {
			return {
				current: 0,
				p50: 0,
				p95: 0,
				p99: 0,
				jitter: 0,
				trend: "stable",
			};
		}

		const sorted = [...this.latencyHistory].sort((a, b) => a - b);
		const len = sorted.length;

		const p50 = sorted[Math.floor(len * 0.5)] || 0;
		const p95 = sorted[Math.floor(len * 0.95)] || 0;
		const p99 = sorted[Math.floor(len * 0.99)] || 0;
		const current = this.latencyHistory[len - 1] || 0;

		// Calculate jitter (standard deviation)
		const mean = this.latencyHistory.reduce((a, b) => a + b, 0) / len;
		const squaredDiffs = this.latencyHistory.map((v) => (v - mean) ** 2);
		const jitter = Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / len);

		// Determine trend from recent vs older values
		const trend = this.calculateTrend();

		return { current, p50, p95, p99, jitter, trend };
	}

	/**
	 * Calculate latency trend
	 */
	private calculateTrend(): "improving" | "stable" | "degrading" {
		if (this.latencyHistory.length < 10) {
			return "stable";
		}

		const recentCount = Math.min(10, Math.floor(this.latencyHistory.length / 2));
		const recent = this.latencyHistory.slice(-recentCount);
		const older = this.latencyHistory.slice(-recentCount * 2, -recentCount);

		const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
		const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;

		const changePercent = ((recentAvg - olderAvg) / olderAvg) * 100;

		if (changePercent > 20) {
			return "degrading";
		}
		if (changePercent < -20) {
			return "improving";
		}
		return "stable";
	}

	/**
	 * Get diagnostic stats
	 */
	getStats(): {
		state: HealthState;
		consecutiveSuccesses: number;
		consecutiveFailures: number;
		unhealthySince: number | null;
		historySize: number;
	} {
		return {
			state: this.currentState,
			consecutiveSuccesses: this.consecutiveSuccesses,
			consecutiveFailures: this.consecutiveFailures,
			unhealthySince: this.unhealthySince,
			historySize: this.latencyHistory.length,
		};
	}

	/**
	 * Update configuration
	 */
	updateConfig(config: Partial<HealthStateConfig>): void {
		this.config = { ...this.config, ...config };
	}

	/**
	 * Dispose resources
	 */
	dispose(): void {
		this._onHealthChange.dispose();
		this._onRecovery.dispose();
		this._onFailure.dispose();
		this.latencyHistory = [];
	}
}
