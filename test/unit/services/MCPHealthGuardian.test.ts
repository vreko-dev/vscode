/**
 * MCPHealthGuardian Tests
 *
 * TDD tests for the proactive health monitoring orchestrator.
 * Uses global vscode mock from setup.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from "vitest";
import {
	MCPHealthGuardian,
	type MCPHealthGuardianConfig,
	type HealthCheckExecutor,
} from "../../../src/services/MCPHealthGuardian";
import type { HealthState } from "../../../src/services/HealthStateManager";

// Mock logger (vscode is mocked globally in setup.ts)
vi.mock("../../../src/utils/logger", () => ({
	logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe("MCPHealthGuardian", () => {
	let guardian: MCPHealthGuardian;
	let mockExecutor: HealthCheckExecutor;

	const fastConfig: Partial<MCPHealthGuardianConfig> = {
		pollerConfig: {
			activeInterval: 50,
			idleInterval: 100,
			backgroundInterval: 200,
			recoveringInterval: 25,
			deepCheckFrequency: 3,
			watchdogInterval: 500,
		},
		failureThreshold: 3,
		recoveryThreshold: 3,
	};

	beforeEach(() => {
		vi.useFakeTimers();
		mockExecutor = {
			executeShallowCheck: vi.fn().mockResolvedValue({
				healthy: true,
				latencyMs: 15,
				serverVersion: "1.0.0",
			}),
			executeDeepCheck: vi.fn().mockResolvedValue({
				healthy: true,
				latencyMs: 50,
				toolExecutionSuccess: true,
			}),
		};
		guardian = new MCPHealthGuardian(mockExecutor, fastConfig);
	});

	afterEach(() => {
		guardian.dispose();
		vi.useRealTimers();
		vi.clearAllMocks();
	});

	describe("Lifecycle", () => {
		it("should start monitoring", () => {
			expect(guardian.isMonitoring()).toBe(false);
			guardian.start();
			expect(guardian.isMonitoring()).toBe(true);
		});

		it("should stop monitoring", () => {
			guardian.start();
			guardian.stop();
			expect(guardian.isMonitoring()).toBe(false);
		});

		it("should not start twice", () => {
			guardian.start();
			guardian.start();
			expect(guardian.isMonitoring()).toBe(true);
		});

		it("should dispose cleanly", () => {
			guardian.start();
			guardian.dispose();
			expect(guardian.isMonitoring()).toBe(false);
		});
	});

	describe("Health Check Execution", () => {
		it("should execute shallow health checks on poll", async () => {
			guardian.start();
			await vi.advanceTimersByTimeAsync(100);
			expect(mockExecutor.executeShallowCheck).toHaveBeenCalled();
		});

		it("should execute deep health checks every Nth poll", async () => {
			guardian.start();
			await vi.advanceTimersByTimeAsync(300); // 3 polls
			expect(mockExecutor.executeDeepCheck).toHaveBeenCalledTimes(1);
		});

		it("should transition to healthy state on successful check", async () => {
			guardian.start();
			await vi.advanceTimersByTimeAsync(100);
			expect(guardian.getHealth()).toBe("healthy");
		});

		it("should transition to unhealthy state on failed checks", async () => {
			// Create a fresh guardian with failing executor from the start
			const failingExecutor: HealthCheckExecutor = {
				executeShallowCheck: vi.fn().mockResolvedValue({
					healthy: false,
					latencyMs: 0,
					error: "Connection refused",
				}),
				executeDeepCheck: vi.fn().mockResolvedValue({
					healthy: false,
					latencyMs: 0,
					error: "Connection refused",
				}),
			};
			const failingGuardian = new MCPHealthGuardian(failingExecutor, fastConfig);
			failingGuardian.start();
			// First poll should trigger unhealthy state
			await vi.advanceTimersByTimeAsync(150);
			expect(failingGuardian.getHealth()).toBe("unhealthy");
			failingGuardian.dispose();
		});

		it("should handle executor errors gracefully", async () => {
			(mockExecutor.executeShallowCheck as Mock).mockRejectedValue(new Error("Network error"));
			guardian.start();
			await vi.advanceTimersByTimeAsync(100);
			// Should not throw, should track as failure
			expect(guardian.getHealth()).not.toBe("healthy");
		});
	});

	describe("Pre-flight API", () => {
		it("should return false for isReady() when unknown state", () => {
			expect(guardian.isReady()).toBe(false);
		});

		it("should return true for isReady() when healthy", async () => {
			guardian.start();
			await vi.advanceTimersByTimeAsync(100);
			expect(guardian.isReady()).toBe(true);
		});

		it("should return correct health state via getHealth()", async () => {
			expect(guardian.getHealth()).toBe("unknown");
			guardian.start();
			await vi.advanceTimersByTimeAsync(100);
			expect(guardian.getHealth()).toBe("healthy");
		});

		it("should provide comprehensive status via getStatus()", async () => {
			guardian.start();
			await vi.advanceTimersByTimeAsync(100);
			const status = guardian.getStatus();
			expect(status.health).toBe("healthy");
			expect(status.isReady).toBe(true);
			expect(status.pollCount).toBeGreaterThan(0);
		});
	});

	describe("Polling Modes", () => {
		it("should start in idle mode by default", () => {
			guardian.start();
			expect(guardian.getPollingMode()).toBe("idle");
		});

		it("should switch to active mode on setActive(true)", () => {
			guardian.start();
			guardian.setActive(true);
			expect(guardian.getPollingMode()).toBe("active");
		});

		it("should switch to background mode when window loses focus", () => {
			guardian.start();
			guardian.setWindowFocused(false);
			expect(guardian.getPollingMode()).toBe("background");
		});

		it("should switch to idle mode on setActive(false)", () => {
			guardian.start();
			guardian.setActive(true);
			guardian.setActive(false);
			expect(guardian.getPollingMode()).toBe("idle");
		});
	});

	describe("Force Check", () => {
		it("should trigger immediate shallow check", async () => {
			await guardian.forceCheck("shallow");
			expect(mockExecutor.executeShallowCheck).toHaveBeenCalled();
		});

		it("should trigger immediate deep check", async () => {
			await guardian.forceCheck("deep");
			expect(mockExecutor.executeDeepCheck).toHaveBeenCalled();
		});

		it("should update health state after force check", async () => {
			expect(guardian.getHealth()).toBe("unknown");
			await guardian.forceCheck("shallow");
			expect(guardian.getHealth()).toBe("healthy");
		});
	});

	describe("Statistics", () => {
		it("should track poll count", async () => {
			guardian.start();
			await vi.advanceTimersByTimeAsync(300);
			const stats = guardian.getStats();
			expect(stats.pollCount).toBe(3);
		});

		it("should track success count", async () => {
			guardian.start();
			await vi.advanceTimersByTimeAsync(300);
			const stats = guardian.getStats();
			expect(stats.successCount).toBe(3);
		});

		it("should calculate uptime percentage", async () => {
			guardian.start();
			await vi.advanceTimersByTimeAsync(300);
			const stats = guardian.getStats();
			expect(stats.uptimePercent).toBe(100);
		});
	});

	describe("Event Broadcasting", () => {
		it("should emit onHealthChange when state changes", async () => {
			const changes: Array<{ from: HealthState; to: HealthState }> = [];
			guardian.onHealthChange((e) => changes.push(e));
			guardian.start();
			await vi.advanceTimersByTimeAsync(100);
			expect(changes.length).toBeGreaterThan(0);
			expect(changes[0].to).toBe("healthy");
		});

		it("should emit onFailure when becoming unhealthy", async () => {
			const failures: Array<{ error: string }> = [];
			guardian.onFailure((e) => failures.push(e));
			(mockExecutor.executeShallowCheck as Mock).mockResolvedValue({
				healthy: false,
				latencyMs: 0,
				error: "Down",
			});
			guardian.start();
			await vi.advanceTimersByTimeAsync(400);
			expect(failures.length).toBeGreaterThan(0);
		});
	});
});
