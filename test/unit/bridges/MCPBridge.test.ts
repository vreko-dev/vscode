import { beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { MCPBridge } from "@vscode/bridges/MCPBridge";

// Mock MCPTelemetry - create a stable mock object
const mockTelemetry = {
	trackConnectionStateChange: vi.fn(),
	trackConnectionRetry: vi.fn(),
	trackVersionMismatch: vi.fn(),
	trackCircuitBreakerChange: vi.fn(),
	trackBridgePushMetrics: vi.fn(),
	trackDiagnoseExecuted: vi.fn(),
};

vi.mock("@vscode/services/MCPTelemetry", () => ({
	getMCPTelemetry: () => mockTelemetry,
}));

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("MCPBridge", () => {
	let bridge: MCPBridge;

	beforeEach(() => {
		vi.clearAllMocks();
		mockFetch.mockReset();

		// Clear telemetry mock method call history
		mockTelemetry.trackConnectionStateChange.mockClear();
		mockTelemetry.trackConnectionRetry.mockClear();
		mockTelemetry.trackVersionMismatch.mockClear();
		mockTelemetry.trackCircuitBreakerChange.mockClear();
		mockTelemetry.trackBridgePushMetrics.mockClear();
		mockTelemetry.trackDiagnoseExecuted.mockClear();

		// Mock workspace folders
		vi.mocked(vscode.workspace).workspaceFolders = [
			{
				uri: { fsPath: "/test/workspace" },
				name: "test",
				index: 0,
			},
		] as any;

		bridge = new MCPBridge({
			mcpEndpoint: "http://127.0.0.1:3100",
			flushInterval: 5000,
		});
	});

	describe("Circuit Breaker", () => {
		describe("Initial state", () => {
			it("should start with circuit closed", () => {
				const state = bridge.getCircuitState();
				expect(state.state).toBe("closed");
				expect(state.consecutiveFailures).toBe(0);
			});
		});

		describe("Circuit opening", () => {
			it("should open circuit after 5 consecutive failures", async () => {
				// Queue some data
				bridge.pushObservation({
					type: "progress",
					message: "Test observation",
					timestamp: Date.now(),
				});

				// Make fetch fail 5 times
				mockFetch.mockRejectedValue(new Error("Network error"));

				for (let i = 0; i < 5; i++) {
					await bridge.flushToMCP();
				}

				const state = bridge.getCircuitState();
				expect(state.state).toBe("open");
				expect(state.consecutiveFailures).toBe(5);
			});

			it("should skip pushes when circuit is open", async () => {
				// Queue some data
				bridge.pushObservation({
					type: "progress",
					message: "Test observation",
					timestamp: Date.now(),
				});

				// Make fetch fail 5 times to open circuit
				mockFetch.mockRejectedValue(new Error("Network error"));
				for (let i = 0; i < 5; i++) {
					await bridge.flushToMCP();
				}

				// Reset fetch mock to track subsequent calls
				mockFetch.mockClear();

				// Try to flush again
				await bridge.flushToMCP();

				// Should not have attempted fetch (circuit is open)
				expect(mockFetch).not.toHaveBeenCalled();
			});

			it("should not count successful responses as failures", async () => {
				// Queue some data
				bridge.pushObservation({
					type: "progress",
					message: "Test observation",
					timestamp: Date.now(),
				});

				// Make fetch succeed
				mockFetch.mockResolvedValue({ ok: true });

				await bridge.flushToMCP();

				const state = bridge.getCircuitState();
				expect(state.state).toBe("closed");
				expect(state.consecutiveFailures).toBe(0);
			});
		});

		describe("Circuit half-open recovery", () => {
			it("should transition to half-open after reset timeout", async () => {
				// Queue some data
				bridge.pushObservation({
					type: "progress",
					message: "Test observation",
					timestamp: Date.now(),
				});

				// Make fetch fail 5 times to open circuit
				mockFetch.mockRejectedValue(new Error("Network error"));
				for (let i = 0; i < 5; i++) {
					await bridge.flushToMCP();
				}

				// Verify circuit is open
				expect(bridge.getCircuitState().state).toBe("open");

				// Manually set lastFailureTime to past (simulate timeout passed)
				// We need to access private field for testing
				const bridgeAny = bridge as any;
				bridgeAny.lastFailureTime = Date.now() - 35000; // 35 seconds ago

				// Transition to half-open on next check
				mockFetch.mockClear();
				await bridge.flushToMCP();

				// Should have attempted (half-open allows one try)
				expect(mockFetch).toHaveBeenCalled();
			});

			it("should close circuit on successful push in half-open state", async () => {
				// Queue some data
				bridge.pushObservation({
					type: "progress",
					message: "Test observation",
					timestamp: Date.now(),
				});

				// Make fetch fail 5 times to open circuit
				mockFetch.mockRejectedValue(new Error("Network error"));
				for (let i = 0; i < 5; i++) {
					await bridge.flushToMCP();
				}

				// Manually transition to half-open
				const bridgeAny = bridge as any;
				bridgeAny.circuitState = "half-open";

				// Queue more data and make fetch succeed
				bridge.pushObservation({
					type: "progress",
					message: "Recovery test",
					timestamp: Date.now(),
				});
				mockFetch.mockResolvedValue({ ok: true });

				await bridge.flushToMCP();

				const state = bridge.getCircuitState();
				expect(state.state).toBe("closed");
				expect(state.consecutiveFailures).toBe(0);
			});

			it("should reopen circuit on failure in half-open state", async () => {
				// Queue some data
				bridge.pushObservation({
					type: "progress",
					message: "Test observation",
					timestamp: Date.now(),
				});

				// Manually set to half-open state
				const bridgeAny = bridge as any;
				bridgeAny.circuitState = "half-open";
				bridgeAny.consecutiveFailures = 5;

				// Make fetch fail
				mockFetch.mockRejectedValue(new Error("Network error"));

				await bridge.flushToMCP();

				const state = bridge.getCircuitState();
				expect(state.state).toBe("open");
			});
		});

		describe("Circuit state diagnostics", () => {
			it("should report nextRetryIn when circuit is open", async () => {
				// Queue some data
				bridge.pushObservation({
					type: "progress",
					message: "Test observation",
					timestamp: Date.now(),
				});

				// Make fetch fail 5 times to open circuit
				mockFetch.mockRejectedValue(new Error("Network error"));
				for (let i = 0; i < 5; i++) {
					await bridge.flushToMCP();
				}

				const state = bridge.getCircuitState();
				expect(state.state).toBe("open");
				expect(state.nextRetryIn).toBeDefined();
				expect(state.nextRetryIn).toBeGreaterThan(0);
				expect(state.nextRetryIn).toBeLessThanOrEqual(30000);
			});

			it("should not have nextRetryIn when circuit is closed", () => {
				const state = bridge.getCircuitState();
				expect(state.state).toBe("closed");
				expect(state.nextRetryIn).toBeUndefined();
			});
		});
	});

	describe("Observation Queue", () => {
		it("should limit queue size to 50 observations", () => {
			for (let i = 0; i < 60; i++) {
				bridge.pushObservation({
					type: "progress",
					message: `Observation ${i}`,
					timestamp: Date.now(),
				});
			}

			const status = bridge.getStatus();
			expect(status.pendingObservations).toBe(50);
		});

		it("should trigger immediate flush for risk observations", async () => {
			mockFetch.mockResolvedValue({ ok: true });

			bridge.pushObservation({
				type: "risk",
				message: "High-risk file modified",
				timestamp: Date.now(),
			});

			// Flush is async, wait a tick
			await new Promise((resolve) => setTimeout(resolve, 0));

			expect(mockFetch).toHaveBeenCalled();
		});

		it("should trigger immediate flush for warning observations", async () => {
			mockFetch.mockResolvedValue({ ok: true });

			bridge.warn("Warning message");

			// Flush is async, wait a tick
			await new Promise((resolve) => setTimeout(resolve, 0));

			expect(mockFetch).toHaveBeenCalled();
		});
	});

	describe("Status Reporting", () => {
		it("should track push count and failure count", async () => {
			// Queue some data
			bridge.pushObservation({
				type: "progress",
				message: "Test",
				timestamp: Date.now(),
			});

			// Successful push
			mockFetch.mockResolvedValue({ ok: true });
			await bridge.flushToMCP();

			let status = bridge.getStatus();
			expect(status.pushCount).toBe(1);
			expect(status.failureCount).toBe(0);

			// Queue more data
			bridge.pushObservation({
				type: "progress",
				message: "Test 2",
				timestamp: Date.now(),
			});

			// Failed push
			mockFetch.mockRejectedValue(new Error("Network error"));
			await bridge.flushToMCP();

			status = bridge.getStatus();
			expect(status.pushCount).toBe(1);
			expect(status.failureCount).toBe(1);
		});

		it("should track last push time", async () => {
			// Queue some data
			bridge.pushObservation({
				type: "progress",
				message: "Test",
				timestamp: Date.now(),
			});

			const beforePush = Date.now();
			mockFetch.mockResolvedValue({ ok: true });
			await bridge.flushToMCP();
			const afterPush = Date.now();

			const status = bridge.getStatus();
			expect(status.lastPushTime).toBeGreaterThanOrEqual(beforePush);
			expect(status.lastPushTime).toBeLessThanOrEqual(afterPush);
		});

		it("should report pending observations and changes", () => {
			bridge.pushObservation({
				type: "progress",
				message: "Test",
				timestamp: Date.now(),
			});

			const status = bridge.getStatus();
			expect(status.pendingObservations).toBe(1);
			expect(status.pendingChanges).toBe(0);
		});
	});

	describe("Health Check", () => {
		it("should return true when endpoint is healthy", async () => {
			mockFetch.mockResolvedValue({ ok: true });

			const healthy = await bridge.checkHealth();

			expect(healthy).toBe(true);
			expect(mockFetch).toHaveBeenCalledWith(
				"http://127.0.0.1:3100/bridge/health",
				expect.objectContaining({ method: "GET" }),
			);
		});

		it("should return false when endpoint is unreachable", async () => {
			mockFetch.mockRejectedValue(new Error("Network error"));

			const healthy = await bridge.checkHealth();

			expect(healthy).toBe(false);
		});

		it("should return false when endpoint returns error status", async () => {
			mockFetch.mockResolvedValue({ ok: false, status: 500 });

			const healthy = await bridge.checkHealth();

			expect(healthy).toBe(false);
		});
	});
});
