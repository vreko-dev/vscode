/**
 * Daemon Health Consumer
 *
 * Single extension-side consumer of daemon health state. The daemon is the
 * authority  -  this consumer listens for $/health-changed push notifications
 * and falls back to polling health/check as a heartbeat.
 *
 * Design:
 * - Push-first: subscribes to $/health-changed (daemon broadcasts on transition)
 * - Poll-fallback: 30s heartbeat via health/check (only checks "is daemon alive")
 * - Crash circuit breaker: 5 connection failures in 3 minutes = stop retrying
 * - Does NOT reclassify health based on latency  -  trusts daemon's declared state
 *
 * @module services/DaemonHealthConsumer
 */

import type { DaemonHealthReportType, DaemonHealthStateType } from "@vreko/contracts/local-service";
import * as vscode from "vscode";
import { logger } from "../utils/logger";

// =============================================================================
// Configuration
// =============================================================================

/** Heartbeat poll interval (ms)  -  only used when push notifications aren't working */
const HEARTBEAT_INTERVAL_MS = 30_000;

/** Circuit breaker: max failures within the window before tripping */
const CIRCUIT_BREAKER_MAX_FAILURES = 5;

/** Circuit breaker: time window for failure counting (ms) */
const CIRCUIT_BREAKER_WINDOW_MS = 3 * 60 * 1000; // 3 minutes

/** Circuit breaker: cooldown before retrying after trip (ms) */
const CIRCUIT_BREAKER_COOLDOWN_MS = 60_000; // 1 minute

// =============================================================================
// Types
// =============================================================================

export interface HealthStateChangeEvent {
	previousState: DaemonHealthStateType;
	currentState: DaemonHealthStateType;
	reason: string;
	report?: DaemonHealthReportType;
}

/** IPC interface  -  injected to avoid circular dependency on DaemonBridge */
export interface DaemonIPC {
	request(method: string, params?: unknown): Promise<unknown>;
	onNotification(handler: (notification: { method: string; params: unknown }) => void): vscode.Disposable;
}

// =============================================================================
// DaemonHealthConsumer
// =============================================================================

export class DaemonHealthConsumer implements vscode.Disposable {
	private state: DaemonHealthStateType = "unknown";
	private lastReport?: DaemonHealthReportType;
	private heartbeatTimer: NodeJS.Timeout | null = null;
	private disposables: vscode.Disposable[] = [];

	// Circuit breaker state
	private failureTimestamps: number[] = [];
	private circuitOpen = false;
	private circuitCooldownTimer: NodeJS.Timeout | null = null;

	// Events
	private readonly _onStateChange = new vscode.EventEmitter<HealthStateChangeEvent>();
	readonly onStateChange = this._onStateChange.event;

	private readonly log = logger.child("health-consumer");

	/**
	 * Activate the consumer with an IPC interface.
	 *
	 * @param ipc - Daemon IPC bridge for requests and notification subscription
	 */
	activate(ipc: DaemonIPC): void {
		// Subscribe to push notifications from daemon
		const sub = ipc.onNotification((notification) => {
			if (notification.method === "$/health-changed") {
				this.handleHealthChanged(notification.params);
			}
		});
		this.disposables.push(sub);

		// Start heartbeat polling as fallback
		this.startHeartbeat(ipc);

		// Do an initial health check
		this.doHeartbeat(ipc);

		this.log.info("DaemonHealthConsumer activated");
	}

	/**
	 * Pre-flight check: is the daemon ready for operations?
	 * Fail-open: returns true on errors (guardian crash should not block operations).
	 */
	isReady(): boolean {
		if (this.circuitOpen) {
			return false;
		}
		return this.state === "healthy" || this.state === "degraded";
	}

	/**
	 * Get current health state (as declared by daemon).
	 */
	getState(): DaemonHealthStateType {
		return this.state;
	}

	/**
	 * Get the last full health report from daemon.
	 */
	getLastReport(): DaemonHealthReportType | undefined {
		return this.lastReport;
	}

	/**
	 * Check if the circuit breaker is tripped.
	 */
	isCircuitOpen(): boolean {
		return this.circuitOpen;
	}

	/**
	 * Handle daemon disconnection  -  transition to unknown.
	 */
	handleDisconnection(): void {
		this.transitionTo("unknown", "Daemon disconnected");
		this.stopHeartbeat();
	}

	/**
	 * Handle daemon reconnection  -  restart heartbeat.
	 */
	handleReconnection(ipc: DaemonIPC): void {
		this.resetCircuitBreaker();
		this.startHeartbeat(ipc);
		this.doHeartbeat(ipc);
	}

	// =========================================================================
	// Push notification handler
	// =========================================================================

	private handleHealthChanged(params: unknown): void {
		const p = params as {
			previousState?: DaemonHealthStateType;
			currentState?: DaemonHealthStateType;
			reason?: string;
			report?: DaemonHealthReportType;
		};

		if (!p?.currentState) {
			return;
		}

		// Reset circuit breaker on successful push (daemon is clearly alive)
		this.resetCircuitBreaker();

		this.lastReport = p.report;
		this.transitionTo(p.currentState, p.reason ?? "Push notification from daemon");
	}

	// =========================================================================
	// Heartbeat polling (fallback)
	// =========================================================================

	private startHeartbeat(ipc: DaemonIPC): void {
		this.stopHeartbeat();

		this.heartbeatTimer = setInterval(() => {
			this.doHeartbeat(ipc);
		}, HEARTBEAT_INTERVAL_MS);
	}

	private stopHeartbeat(): void {
		if (this.heartbeatTimer) {
			clearInterval(this.heartbeatTimer);
			this.heartbeatTimer = null;
		}
	}

	private async doHeartbeat(ipc: DaemonIPC): Promise<void> {
		if (this.circuitOpen) {
			return; // Don't poll when circuit is open
		}

		try {
			const result = await ipc.request("health/check", {});
			const report = result as DaemonHealthReportType;

			// Trust daemon's declared state
			if (report?.state) {
				this.lastReport = report;

				if (report.state !== this.state) {
					this.transitionTo(report.state, "Heartbeat poll");
				}
			}

			// Successful check  -  clear failure tracking
			this.recordSuccess();
		} catch {
			this.recordFailure();
		}
	}

	// =========================================================================
	// Circuit breaker (rust-analyzer pattern: 5 failures in 3 min = stop)
	// =========================================================================

	private recordSuccess(): void {
		this.failureTimestamps = [];
	}

	private recordFailure(): void {
		const now = Date.now();
		this.failureTimestamps.push(now);

		// Prune old failures outside the window
		const cutoff = now - CIRCUIT_BREAKER_WINDOW_MS;
		this.failureTimestamps = this.failureTimestamps.filter((t) => t > cutoff);

		if (this.failureTimestamps.length >= CIRCUIT_BREAKER_MAX_FAILURES && !this.circuitOpen) {
			this.tripCircuitBreaker();
		}
	}

	private tripCircuitBreaker(): void {
		this.circuitOpen = true;
		this.stopHeartbeat();
		this.transitionTo("unhealthy", "Circuit breaker tripped: too many connection failures");

		this.log.warn("Circuit breaker tripped  -  stopping health checks", {
			failures: this.failureTimestamps.length,
			windowMs: CIRCUIT_BREAKER_WINDOW_MS,
			cooldownMs: CIRCUIT_BREAKER_COOLDOWN_MS,
		});

		// Schedule cooldown: after CIRCUIT_BREAKER_COOLDOWN_MS, allow one retry
		this.circuitCooldownTimer = setTimeout(() => {
			this.log.info("Circuit breaker cooldown expired  -  will retry on next connection");
			this.circuitOpen = false;
			this.circuitCooldownTimer = null;
			// Don't restart heartbeat here  -  wait for handleReconnection()
		}, CIRCUIT_BREAKER_COOLDOWN_MS);
	}

	private resetCircuitBreaker(): void {
		this.failureTimestamps = [];
		this.circuitOpen = false;
		if (this.circuitCooldownTimer) {
			clearTimeout(this.circuitCooldownTimer);
			this.circuitCooldownTimer = null;
		}
	}

	// =========================================================================
	// State transitions
	// =========================================================================

	private transitionTo(newState: DaemonHealthStateType, reason: string): void {
		if (newState === this.state) {
			return;
		}

		const previousState = this.state;
		this.state = newState;

		this.log.info("Health state transition", {
			from: previousState,
			to: newState,
			reason,
		});

		this._onStateChange.fire({
			previousState,
			currentState: newState,
			reason,
			report: this.lastReport,
		});
	}

	// =========================================================================
	// Disposal
	// =========================================================================

	dispose(): void {
		this.stopHeartbeat();
		if (this.circuitCooldownTimer) {
			clearTimeout(this.circuitCooldownTimer);
			this.circuitCooldownTimer = null;
		}
		this._onStateChange.dispose();
		for (const d of this.disposables) {
			d.dispose();
		}
		this.disposables = [];
		this.log.info("DaemonHealthConsumer disposed");
	}
}
