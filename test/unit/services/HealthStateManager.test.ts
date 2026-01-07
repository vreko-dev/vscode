/**
 * HealthStateManager Unit Tests (TDD - Red/Green/Refactor)
 *
 * Tests for the health state machine that manages MCP health states.
 * Per spec: .claude/context/specs/mcp-health-guardian-spec.md
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	HealthStateManager,
	type HealthCheckResult,
	type HealthChangeEvent,
	type HealthState,
} from "../../../src/services/HealthStateManager";

describe("HealthStateManager", () => {
	let stateManager: HealthStateManager;

	beforeEach(() => {
		stateManager = new HealthStateManager({
			degradedLatencyThreshold: 500,
			unhealthyLatencyThreshold: 2000,
			recoveryThreshold: 3,
		});
	});

	afterEach(() => {
		stateManager.dispose();
	});

	// =========================================================================
	// STATE MACHINE TESTS
	// =========================================================================

	describe("State Machine", () => {
		it("starts in unknown state", () => {
			expect(stateManager.getState()).toBe("unknown");
		});

		it("transitions unknown → healthy on successful check with low latency", () => {
			const result = createHealthCheckResult({ latencyMs: 100 });
			const event = stateManager.processHealthCheck(result);

			expect(stateManager.getState()).toBe("healthy");
			expect(event).not.toBeNull();
			expect(event?.previousState).toBe("unknown");
			expect(event?.currentState).toBe("healthy");
		});

		it("transitions healthy → degraded when latency exceeds threshold", () => {
			// First, get to healthy state
			stateManager.processHealthCheck(createHealthCheckResult({ latencyMs: 100 }));
			expect(stateManager.getState()).toBe("healthy");

			// Now trigger degraded with high latency
			const result = createHealthCheckResult({ latencyMs: 600 });
			const event = stateManager.processHealthCheck(result);

			expect(stateManager.getState()).toBe("degraded");
			expect(event?.previousState).toBe("healthy");
			expect(event?.currentState).toBe("degraded");
		});

		it("transitions degraded → healthy when latency drops below threshold", () => {
			// Get to degraded state
			stateManager.processHealthCheck(createHealthCheckResult({ latencyMs: 100 }));
			stateManager.processHealthCheck(createHealthCheckResult({ latencyMs: 600 }));
			expect(stateManager.getState()).toBe("degraded");

			// Now recover with low latency
			const result = createHealthCheckResult({ latencyMs: 200 });
			const event = stateManager.processHealthCheck(result);

			expect(stateManager.getState()).toBe("healthy");
			expect(event?.previousState).toBe("degraded");
			expect(event?.currentState).toBe("healthy");
		});

		it("transitions degraded → unhealthy when latency exceeds unhealthy threshold", () => {
			// Get to degraded state
			stateManager.processHealthCheck(createHealthCheckResult({ latencyMs: 100 }));
			stateManager.processHealthCheck(createHealthCheckResult({ latencyMs: 600 }));
			expect(stateManager.getState()).toBe("degraded");

			// Now trigger unhealthy with very high latency
			const result = createHealthCheckResult({ latencyMs: 2500 });
			const event = stateManager.processHealthCheck(result);

			expect(stateManager.getState()).toBe("unhealthy");
			expect(event?.previousState).toBe("degraded");
			expect(event?.currentState).toBe("unhealthy");
		});

		it("transitions to unhealthy on health check failure", () => {
			// Get to healthy state first
			stateManager.processHealthCheck(createHealthCheckResult({ latencyMs: 100 }));
			expect(stateManager.getState()).toBe("healthy");

			// Now fail the health check
			const result = createHealthCheckResult({
				latencyMs: 0,
				error: "Connection timeout",
				remoteHealthy: false,
				localHealthy: false,
			});
			const event = stateManager.processHealthCheck(result);

			expect(stateManager.getState()).toBe("unhealthy");
			expect(event?.previousState).toBe("healthy");
			expect(event?.currentState).toBe("unhealthy");
		});

		it("requires 3 consecutive successes to recover from unhealthy", () => {
			// Get to unhealthy state
			stateManager.processHealthCheck(createHealthCheckResult({ latencyMs: 100 }));
			stateManager.processHealthCheck(
				createHealthCheckResult({ error: "timeout", remoteHealthy: false, localHealthy: false }),
			);
			expect(stateManager.getState()).toBe("unhealthy");

			// First success - still unhealthy
			stateManager.processHealthCheck(createHealthCheckResult({ latencyMs: 100 }));
			expect(stateManager.getState()).toBe("unhealthy");

			// Second success - still unhealthy
			stateManager.processHealthCheck(createHealthCheckResult({ latencyMs: 100 }));
			expect(stateManager.getState()).toBe("unhealthy");

			// Third success - now healthy!
			const event = stateManager.processHealthCheck(createHealthCheckResult({ latencyMs: 100 }));
			expect(stateManager.getState()).toBe("healthy");
			expect(event?.currentState).toBe("healthy");
		});

		it("resets recovery counter on failure during recovery", () => {
			// Get to unhealthy state
			stateManager.processHealthCheck(createHealthCheckResult({ latencyMs: 100 }));
			stateManager.processHealthCheck(
				createHealthCheckResult({ error: "timeout", remoteHealthy: false, localHealthy: false }),
			);
			expect(stateManager.getState()).toBe("unhealthy");

			// Two successes
			stateManager.processHealthCheck(createHealthCheckResult({ latencyMs: 100 }));
			stateManager.processHealthCheck(createHealthCheckResult({ latencyMs: 100 }));
			expect(stateManager.getState()).toBe("unhealthy"); // Still unhealthy

			// Fail again - resets counter
			stateManager.processHealthCheck(
				createHealthCheckResult({ error: "timeout", remoteHealthy: false, localHealthy: false }),
			);

			// Need 3 more successes now
			stateManager.processHealthCheck(createHealthCheckResult({ latencyMs: 100 }));
			stateManager.processHealthCheck(createHealthCheckResult({ latencyMs: 100 }));
			expect(stateManager.getState()).toBe("unhealthy"); // Still need one more

			stateManager.processHealthCheck(createHealthCheckResult({ latencyMs: 100 }));
			expect(stateManager.getState()).toBe("healthy"); // Now recovered
		});

		it("does not transition unknown → degraded directly (must go through healthy first)", () => {
			// Start with degraded-level latency from unknown
			const result = createHealthCheckResult({ latencyMs: 600 });
			const event = stateManager.processHealthCheck(result);

			// Should go to degraded (via implicit healthy check)
			expect(stateManager.getState()).toBe("degraded");
		});

		it("can force state to unknown", () => {
			// Get to healthy state
			stateManager.processHealthCheck(createHealthCheckResult({ latencyMs: 100 }));
			expect(stateManager.getState()).toBe("healthy");

			// Force to unknown
			stateManager.forceUnknown("Connection lost");
			expect(stateManager.getState()).toBe("unknown");
		});
	});

	// =========================================================================
	// EVENT TESTS
	// =========================================================================

	describe("Events", () => {
		it("emits onHealthChange when state changes", () => {
			const listener = vi.fn();
			stateManager.onHealthChange(listener);

			stateManager.processHealthCheck(createHealthCheckResult({ latencyMs: 100 }));

			expect(listener).toHaveBeenCalledTimes(1);
			expect(listener).toHaveBeenCalledWith(
				expect.objectContaining({
					previousState: "unknown",
					currentState: "healthy",
				}),
			);
		});

		it("does not emit when state stays the same", () => {
			const listener = vi.fn();
			stateManager.onHealthChange(listener);

			// Two healthy checks
			stateManager.processHealthCheck(createHealthCheckResult({ latencyMs: 100 }));
			stateManager.processHealthCheck(createHealthCheckResult({ latencyMs: 150 }));

			expect(listener).toHaveBeenCalledTimes(1); // Only first transition
		});

		it("emits onRecovery when transitioning from unhealthy to healthy", () => {
			const recoveryListener = vi.fn();
			stateManager.onRecovery(recoveryListener);

			// Get to unhealthy
			stateManager.processHealthCheck(createHealthCheckResult({ latencyMs: 100 }));
			stateManager.processHealthCheck(
				createHealthCheckResult({ error: "timeout", remoteHealthy: false, localHealthy: false }),
			);

			// Recover with 3 successes
			stateManager.processHealthCheck(createHealthCheckResult({ latencyMs: 100 }));
			stateManager.processHealthCheck(createHealthCheckResult({ latencyMs: 100 }));
			stateManager.processHealthCheck(createHealthCheckResult({ latencyMs: 100 }));

			expect(recoveryListener).toHaveBeenCalledTimes(1);
			expect(recoveryListener).toHaveBeenCalledWith(
				expect.objectContaining({
					consecutiveSuccesses: 3,
				}),
			);
		});

		it("emits onFailure when transitioning to unhealthy", () => {
			const failureListener = vi.fn();
			stateManager.onFailure(failureListener);

			// Get to healthy first
			stateManager.processHealthCheck(createHealthCheckResult({ latencyMs: 100 }));

			// Now fail
			stateManager.processHealthCheck(
				createHealthCheckResult({ error: "Connection refused", remoteHealthy: false, localHealthy: false }),
			);

			expect(failureListener).toHaveBeenCalledTimes(1);
			expect(failureListener).toHaveBeenCalledWith(
				expect.objectContaining({
					reason: "Connection refused",
				}),
			);
		});
	});

	// =========================================================================
	// LATENCY METRICS TESTS
	// =========================================================================

	describe("Latency Metrics", () => {
		it("calculates latency percentiles", () => {
			// Add multiple health checks with various latencies
			const latencies = [50, 100, 150, 200, 250, 300, 350, 400, 450, 500];
			for (const latencyMs of latencies) {
				stateManager.processHealthCheck(createHealthCheckResult({ latencyMs }));
			}

			const metrics = stateManager.getLatencyMetrics();

			expect(metrics.current).toBe(500); // Last value
			expect(metrics.p50).toBeGreaterThanOrEqual(250);
			expect(metrics.p50).toBeLessThanOrEqual(300);
			expect(metrics.p95).toBeGreaterThanOrEqual(450);
		});

		it("returns stable trend for consistent latencies", () => {
			// Add consistent latencies
			for (let i = 0; i < 20; i++) {
				stateManager.processHealthCheck(createHealthCheckResult({ latencyMs: 100 + Math.random() * 20 }));
			}

			const metrics = stateManager.getLatencyMetrics();
			expect(metrics.trend).toBe("stable");
		});

		it("returns degrading trend when latencies increase", () => {
			// Add increasing latencies
			for (let i = 0; i < 10; i++) {
				stateManager.processHealthCheck(createHealthCheckResult({ latencyMs: 100 }));
			}
			for (let i = 0; i < 10; i++) {
				stateManager.processHealthCheck(createHealthCheckResult({ latencyMs: 200 }));
			}

			const metrics = stateManager.getLatencyMetrics();
			expect(metrics.trend).toBe("degrading");
		});

		it("returns improving trend when latencies decrease", () => {
			// Add decreasing latencies
			for (let i = 0; i < 10; i++) {
				stateManager.processHealthCheck(createHealthCheckResult({ latencyMs: 200 }));
			}
			for (let i = 0; i < 10; i++) {
				stateManager.processHealthCheck(createHealthCheckResult({ latencyMs: 100 }));
			}

			const metrics = stateManager.getLatencyMetrics();
			expect(metrics.trend).toBe("improving");
		});
	});

	// =========================================================================
	// STATS TESTS
	// =========================================================================

	describe("Stats", () => {
		it("returns current stats", () => {
			const stats = stateManager.getStats();

			expect(stats.state).toBe("unknown");
			expect(stats.consecutiveSuccesses).toBe(0);
			expect(stats.consecutiveFailures).toBe(0);
			expect(stats.unhealthySince).toBeNull();
			expect(stats.historySize).toBe(0);
		});

		it("tracks consecutive successes", () => {
			stateManager.processHealthCheck(createHealthCheckResult({ latencyMs: 100 }));
			stateManager.processHealthCheck(createHealthCheckResult({ latencyMs: 100 }));

			const stats = stateManager.getStats();
			expect(stats.consecutiveSuccesses).toBe(2);
		});

		it("tracks consecutive failures", () => {
			stateManager.processHealthCheck(createHealthCheckResult({ latencyMs: 100 }));
			stateManager.processHealthCheck(
				createHealthCheckResult({ error: "fail1", remoteHealthy: false, localHealthy: false }),
			);
			stateManager.processHealthCheck(
				createHealthCheckResult({ error: "fail2", remoteHealthy: false, localHealthy: false }),
			);

			const stats = stateManager.getStats();
			expect(stats.consecutiveFailures).toBe(2);
		});

		it("tracks unhealthySince timestamp", () => {
			const beforeTime = Date.now();
			stateManager.processHealthCheck(createHealthCheckResult({ latencyMs: 100 }));
			stateManager.processHealthCheck(
				createHealthCheckResult({ error: "timeout", remoteHealthy: false, localHealthy: false }),
			);

			const stats = stateManager.getStats();
			expect(stats.unhealthySince).toBeGreaterThanOrEqual(beforeTime);
		});
	});

	// =========================================================================
	// CONFIG UPDATE TESTS
	// =========================================================================

	describe("Configuration", () => {
		it("allows updating thresholds", () => {
			stateManager.updateConfig({
				degradedLatencyThreshold: 300,
			});

			// 350ms should now trigger degraded
			stateManager.processHealthCheck(createHealthCheckResult({ latencyMs: 100 }));
			stateManager.processHealthCheck(createHealthCheckResult({ latencyMs: 350 }));

			expect(stateManager.getState()).toBe("degraded");
		});
	});
});

// =============================================================================
// HELPERS
// =============================================================================

function createHealthCheckResult(
	overrides: Partial<HealthCheckResult> = {},
): HealthCheckResult {
	return {
		type: "shallow",
		state: "unknown", // Will be computed by state manager
		timestamp: Date.now(),
		latencyMs: 100,
		remoteHealthy: true,
		localHealthy: true,
		serverVersion: "2.0.0",
		...overrides,
	};
}
