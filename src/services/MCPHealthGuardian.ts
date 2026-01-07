/**
 * MCP Health Guardian - Proactive Health Monitoring Orchestrator
 *
 * Central orchestrator for MCP health monitoring that coordinates:
 * - HealthStateManager: State machine for health transitions
 * - AdaptivePoller: Dynamic polling intervals based on context
 * - Health Check Execution: Shallow (HTTP) and Deep (tool call) checks
 * - Event Broadcasting: Notify subscribers of health changes
 *
 * Pre-flight API:
 * - isReady(): Instant boolean check for LLM pre-flight
 * - getHealth(): Current health state
 * - getLatency(): Latency metrics (p50, p95, p99)
 *
 * @module services/MCPHealthGuardian
 */

import * as vscode from "vscode";
import { logger } from "../utils/logger";
import { AdaptivePoller, type AdaptivePollerConfig, type CheckType, type PollingMode } from "./AdaptivePoller";
import {
	type HealthCheckResult,
	type HealthState,
	type HealthStateConfig,
	HealthStateManager,
	type LatencyMetrics,
} from "./HealthStateManager";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Result from a shallow health check (HTTP GET /health)
 */
export interface ShallowCheckResult {
	healthy: boolean;
	latencyMs: number;
	serverVersion?: string;
	error?: string;
}

/**
 * Result from a deep health check (tool execution)
 */
export interface DeepCheckResult {
	healthy: boolean;
	latencyMs: number;
	toolExecutionSuccess?: boolean;
	error?: string;
}

/**
 * Executor interface for health checks
 * Injected dependency to allow testing and flexibility
 */
export interface HealthCheckExecutor {
	executeShallowCheck(): Promise<ShallowCheckResult>;
	executeDeepCheck(): Promise<DeepCheckResult>;
}

/**
 * Health change event
 */
export interface HealthChangeEvent {
	from: HealthState;
	to: HealthState;
	timestamp: number;
	latencyMs?: number;
}

/**
 * Recovery event
 */
export interface RecoveryEvent {
	latencyMs: number;
	downtimeMs: number;
	timestamp: number;
}

/**
 * Failure event
 */
export interface FailureEvent {
	error: string;
	consecutiveFailures: number;
	timestamp: number;
}

/**
 * Guardian status for comprehensive state reporting
 */
export interface GuardianStatus {
	health: HealthState;
	isReady: boolean;
	pollingMode: PollingMode;
	pollCount: number;
	lastCheckTime: number;
	latency: LatencyMetrics;
	serverVersion?: string;
}

/**
 * Guardian statistics
 */
export interface GuardianStats {
	pollCount: number;
	successCount: number;
	failureCount: number;
	uptimePercent: number;
	averageLatencyMs: number;
}

/**
 * Configuration for MCPHealthGuardian
 */
export interface MCPHealthGuardianConfig {
	/** Poller configuration */
	pollerConfig?: Partial<AdaptivePollerConfig>;
	/** State manager configuration */
	stateConfig?: Partial<HealthStateConfig>;
	/** Latency threshold for degraded state (ms) */
	degradedLatencyThreshold?: number;
	/** Number of failures before unhealthy */
	failureThreshold?: number;
	/** Number of successes to recover */
	recoveryThreshold?: number;
}

// =============================================================================
// DEFAULT CONFIGURATION
// =============================================================================

const DEFAULT_CONFIG: Required<MCPHealthGuardianConfig> = {
	pollerConfig: {},
	stateConfig: {},
	degradedLatencyThreshold: 200,
	failureThreshold: 3,
	recoveryThreshold: 3,
};

// =============================================================================
// MCP HEALTH GUARDIAN
// =============================================================================

/**
 * MCPHealthGuardian - Proactive health monitoring orchestrator
 *
 * Coordinates health state management and adaptive polling to provide
 * instant health verification for LLM agents and proactive failure detection.
 */
export class MCPHealthGuardian implements vscode.Disposable {
	private readonly config: Required<MCPHealthGuardianConfig>;
	private readonly executor: HealthCheckExecutor;
	private readonly stateManager: HealthStateManager;
	private readonly poller: AdaptivePoller;

	// Tracking
	private successCount = 0;
	private failureCount = 0;
	private lastCheckTime = 0;
	private serverVersion?: string;
	private unhealthyStartTime?: number;
	private windowFocused = true;
	private isActive = false;
	private monitoring = false;

	// Event emitters
	private readonly _onHealthChange = new vscode.EventEmitter<HealthChangeEvent>();
	readonly onHealthChange = this._onHealthChange.event;

	private readonly _onRecovery = new vscode.EventEmitter<RecoveryEvent>();
	readonly onRecovery = this._onRecovery.event;

	private readonly _onFailure = new vscode.EventEmitter<FailureEvent>();
	readonly onFailure = this._onFailure.event;

	// Subscriptions
	private readonly disposables: vscode.Disposable[] = [];

	constructor(executor: HealthCheckExecutor, config: Partial<MCPHealthGuardianConfig> = {}) {
		this.config = { ...DEFAULT_CONFIG, ...config };
		this.executor = executor;

		// Create state manager
		const stateConfig: Partial<HealthStateConfig> = { ...this.config.stateConfig };
		if (this.config.recoveryThreshold) {
			stateConfig.recoveryThreshold = this.config.recoveryThreshold;
		}
		this.stateManager = new HealthStateManager(stateConfig);

		// Create poller
		this.poller = new AdaptivePoller(this.config.pollerConfig);

		// Wire up events
		this.setupEventHandlers();
	}

	/**
	 * Set up internal event handlers
	 */
	private setupEventHandlers(): void {
		// Handle poll requests
		this.disposables.push(
			this.poller.onPollRequest(async (request) => {
				await this.handlePollRequest(request.type);
			}),
		);

		// Forward state manager events
		this.disposables.push(
			this.stateManager.onHealthChange((event) => {
				this._onHealthChange.fire({
					from: event.previousState,
					to: event.currentState,
					timestamp: Date.now(),
					latencyMs: event.latencyMs,
				});

				// Track unhealthy start time
				if (event.currentState === "unhealthy") {
					this.unhealthyStartTime = Date.now();
				}

				// Adjust polling mode based on state
				this.adjustPollingModeForHealth(event.currentState);
			}),
		);

		this.disposables.push(
			this.stateManager.onRecovery(() => {
				const downtimeMs = this.unhealthyStartTime ? Date.now() - this.unhealthyStartTime : 0;

				this._onRecovery.fire({
					latencyMs: this.stateManager.getLatencyMetrics().p50,
					downtimeMs,
					timestamp: Date.now(),
				});

				this.unhealthyStartTime = undefined;
			}),
		);

		this.disposables.push(
			this.stateManager.onFailure((event) => {
				this._onFailure.fire({
					error: event.reason || "Unknown error",
					consecutiveFailures: 1,
					timestamp: event.timestamp,
				});
			}),
		);
	}

	/**
	 * Adjust polling mode based on health state
	 */
	private adjustPollingModeForHealth(health: HealthState): void {
		if (health === "unhealthy") {
			// Will switch to recovering on first success
			return;
		}

		// Determine mode based on context
		this.updatePollingMode();
	}

	/**
	 * Update polling mode based on all context factors
	 */
	private updatePollingMode(): void {
		const health = this.stateManager.getState();

		// Recovering takes priority
		if (health === "unhealthy") {
			return; // Stay in current mode until we see success
		}

		// Check if we're in recovery window
		if (this.poller.getMode() === "recovering") {
			// Check if we've fully recovered
			if (health === "healthy") {
				// Exit recovering mode based on context
				if (this.isActive) {
					this.poller.setMode("active");
				} else if (!this.windowFocused) {
					this.poller.setMode("background");
				} else {
					this.poller.setMode("idle");
				}
			}
			return;
		}

		// Normal mode selection
		if (!this.windowFocused) {
			this.poller.setMode("background");
		} else if (this.isActive) {
			this.poller.setMode("active");
		} else {
			this.poller.setMode("idle");
		}
	}

	/**
	 * Handle a poll request by executing the appropriate health check
	 */
	private async handlePollRequest(type: CheckType): Promise<void> {
		try {
			const result = type === "deep" ? await this.executeDeepCheck() : await this.executeShallowCheck();

			this.processCheckResult(result, type);
		} catch (error) {
			logger.error("Health check failed with exception", { error, type });
			this.processCheckResult(
				{
					type,
					state: "unhealthy",
					timestamp: Date.now(),
					latencyMs: 0,
					remoteHealthy: false,
					localHealthy: true,
					error: error instanceof Error ? error.message : String(error),
				},
				type,
			);
		}
	}

	/**
	 * Execute a shallow health check
	 */
	private async executeShallowCheck(): Promise<HealthCheckResult> {
		const start = Date.now();

		try {
			const result = await this.executor.executeShallowCheck();
			const latencyMs = Date.now() - start;

			this.serverVersion = result.serverVersion;

			return {
				type: "shallow",
				state: this.determineState(result.healthy, latencyMs),
				timestamp: Date.now(),
				latencyMs,
				remoteHealthy: result.healthy,
				localHealthy: true,
				serverVersion: result.serverVersion,
				error: result.error,
			};
		} catch (error) {
			return {
				type: "shallow",
				state: "unhealthy",
				timestamp: Date.now(),
				latencyMs: Date.now() - start,
				remoteHealthy: false,
				localHealthy: true,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	/**
	 * Execute a deep health check
	 */
	private async executeDeepCheck(): Promise<HealthCheckResult> {
		const start = Date.now();

		try {
			const result = await this.executor.executeDeepCheck();
			const latencyMs = Date.now() - start;

			return {
				type: "deep",
				state: this.determineState(result.healthy, latencyMs),
				timestamp: Date.now(),
				latencyMs,
				remoteHealthy: result.healthy,
				localHealthy: true,
				toolExecutionSuccess: result.toolExecutionSuccess,
				error: result.error,
			};
		} catch (error) {
			return {
				type: "deep",
				state: "unhealthy",
				timestamp: Date.now(),
				latencyMs: Date.now() - start,
				remoteHealthy: false,
				localHealthy: true,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	/**
	 * Determine health state from check result
	 */
	private determineState(healthy: boolean, latencyMs: number): HealthState {
		if (!healthy) {
			return "unhealthy";
		}

		if (latencyMs > this.config.degradedLatencyThreshold) {
			return "degraded";
		}

		return "healthy";
	}

	/**
	 * Process a health check result
	 */
	private processCheckResult(result: HealthCheckResult, _type: CheckType): void {
		this.lastCheckTime = Date.now();

		// Track success/failure
		if (result.state === "healthy" || result.state === "degraded") {
			this.successCount++;

			// If we were unhealthy, enter recovering mode
			if (this.stateManager.getState() === "unhealthy") {
				this.poller.setMode("recovering");
			}
		} else {
			this.failureCount++;
		}

		// Update state manager
		this.stateManager.processHealthCheck(result);
	}

	// =========================================================================
	// PUBLIC API - Lifecycle
	// =========================================================================

	/**
	 * Start health monitoring
	 */
	start(): void {
		if (this.monitoring) {
			logger.debug("MCPHealthGuardian already started");
			return;
		}

		logger.info("MCPHealthGuardian started");
		this.monitoring = true;
		this.poller.start();
	}

	/**
	 * Stop health monitoring
	 */
	stop(): void {
		if (!this.monitoring) {
			return;
		}

		logger.info("MCPHealthGuardian stopped");
		this.monitoring = false;
		this.poller.stop();
	}

	/**
	 * Check if monitoring is active
	 */
	isMonitoring(): boolean {
		return this.monitoring;
	}

	// =========================================================================
	// PUBLIC API - Pre-flight
	// =========================================================================

	/**
	 * Instant check if MCP is ready for use
	 * Use this for LLM pre-flight checks
	 */
	isReady(): boolean {
		const state = this.stateManager.getState();
		return state === "healthy" || state === "degraded";
	}

	/**
	 * Get current health state
	 */
	getHealth(): HealthState {
		return this.stateManager.getState();
	}

	/**
	 * Get latency metrics
	 */
	getLatency(): LatencyMetrics {
		return this.stateManager.getLatencyMetrics();
	}

	/**
	 * Get comprehensive status
	 */
	getStatus(): GuardianStatus {
		return {
			health: this.stateManager.getState(),
			isReady: this.isReady(),
			pollingMode: this.poller.getMode(),
			pollCount: this.poller.getStats().pollCount,
			lastCheckTime: this.lastCheckTime,
			latency: this.stateManager.getLatencyMetrics(),
			serverVersion: this.serverVersion,
		};
	}

	/**
	 * Get statistics
	 */
	getStats(): GuardianStats {
		const total = this.successCount + this.failureCount;
		const latencyMetrics = this.stateManager.getLatencyMetrics();

		return {
			pollCount: this.poller.getStats().pollCount,
			successCount: this.successCount,
			failureCount: this.failureCount,
			uptimePercent: total > 0 ? (this.successCount / total) * 100 : 0,
			averageLatencyMs: latencyMetrics.p50,
		};
	}

	// =========================================================================
	// PUBLIC API - Control
	// =========================================================================

	/**
	 * Get current polling mode
	 */
	getPollingMode(): PollingMode {
		return this.poller.getMode();
	}

	/**
	 * Set active state (LLM surface is actively using MCP)
	 */
	setActive(active: boolean): void {
		this.isActive = active;
		this.updatePollingMode();
	}

	/**
	 * Set window focus state
	 */
	setWindowFocused(focused: boolean): void {
		this.windowFocused = focused;
		this.updatePollingMode();
	}

	/**
	 * Force an immediate health check
	 */
	async forceCheck(type: CheckType = "shallow"): Promise<HealthCheckResult> {
		const result = type === "deep" ? await this.executeDeepCheck() : await this.executeShallowCheck();

		this.processCheckResult(result, type);
		return result;
	}

	// =========================================================================
	// DISPOSAL
	// =========================================================================

	/**
	 * Dispose resources
	 */
	dispose(): void {
		this.stop();

		for (const disposable of this.disposables) {
			disposable.dispose();
		}
		this.disposables.length = 0;

		this.stateManager.dispose();
		this.poller.dispose();
		this._onHealthChange.dispose();
		this._onRecovery.dispose();
		this._onFailure.dispose();
	}
}
