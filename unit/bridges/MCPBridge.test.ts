import { beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { MCPClient } from "@vscode/mcp/MCPClient";

// Mock MCPStorage
vi.mock("@vscode/mcp/MCPStorage", () => ({
	MCPStorage: vi.fn().mockImplementation(() => ({
		loadObservationQueue: vi.fn().mockReturnValue([]),
		loadChangeQueue: vi.fn().mockReturnValue([]),
		saveObservationQueue: vi.fn().mockResolvedValue(undefined),
		saveChangeQueue: vi.fn().mockResolvedValue(undefined),
		clearObservationQueue: vi.fn().mockResolvedValue(undefined),
		clearChangeQueue: vi.fn().mockResolvedValue(undefined),
		updateLastSyncAt: vi.fn().mockResolvedValue(undefined),
		getStats: vi.fn().mockReturnValue({ pending: 0, lastSync: null }),
	})),
}));

// Mock TelemetryProxy
vi.mock("@vscode/services/telemetry-proxy", () => ({
	TelemetryProxy: vi.fn().mockImplementation(() => ({
		trackEvent: vi.fn(),
	})),
}));

// Mock logger
vi.mock("@vscode/utils/logger", () => ({
	logger: {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}));

// Mock documentFilters
vi.mock("@vscode/utils/documentFilters", () => ({
	isMonitorableDocument: vi.fn().mockReturnValue(true),
}));

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("MCPClient", () => {
	let client: MCPClient;

	beforeEach(() => {
		vi.clearAllMocks();
		mockFetch.mockReset();

		// Mock workspace folders
		vi.mocked(vscode.workspace).workspaceFolders = [
			{
				uri: { fsPath: "/test/workspace", toString: () => "file:///test/workspace" },
				name: "test",
				index: 0,
			},
		] as any;

		client = new MCPClient({
			localEndpoint: "http://127.0.0.1:3100",
			flushInterval: 5000,
		});
	});

	describe("Circuit Breaker", () => {
		describe("Initial state", () => {
			it("should start with circuit closed", () => {
				const state = client.getCircuitState();
				expect(state.state).toBe("closed");
				expect(state.consecutiveFailures).toBe(0);
			});
		});

		describe("Circuit opening", () => {
			it("should open circuit after 5 consecutive failures", async () => {
				// Queue some data
				client.pushObservation({
					type: "progress",
					message: "Test observation",
					timestamp: Date.now(),
					workspaceId: "test",
				});

				// Make fetch fail 5 times
				mockFetch.mockRejectedValue(new Error("Network error"));

				for (let i = 0; i < 5; i++) {
					await client.flushToMCP();
				}

				const state = client.getCircuitState();
				expect(state.state).toBe("open");
				expect(state.consecutiveFailures).toBe(5);
			});

			it("should skip pushes when circuit is open", async () => {
				// Queue some data
				client.pushObservation({
					type: "progress",
					message: "Test observation",
					timestamp: Date.now(),
					workspaceId: "test",
				});

				// Make fetch fail 5 times to open circuit
				mockFetch.mockRejectedValue(new Error("Network error"));
				for (let i = 0; i < 5; i++) {
					await client.flushToMCP();
				}

				// Reset fetch mock to track subsequent calls
				mockFetch.mockClear();

				// Try to flush again
				await client.flushToMCP();

				// Should not have attempted fetch (circuit is open)
				expect(mockFetch).not.toHaveBeenCalled();
			});

			it("should not count successful responses as failures", async () => {
				// Queue some data
				client.pushObservation({
					type: "progress",
					message: "Test observation",
					timestamp: Date.now(),
					workspaceId: "test",
				});

				// Make fetch succeed
				mockFetch.mockResolvedValue({ ok: true });

				await client.flushToMCP();

				const state = client.getCircuitState();
				expect(state.state).toBe("closed");
				expect(state.consecutiveFailures).toBe(0);
			});
		});

		describe("Circuit half-open recovery", () => {
			it("should transition to half-open after reset timeout", async () => {
				// Queue some data
				client.pushObservation({
					type: "progress",
					message: "Test observation",
					timestamp: Date.now(),
					workspaceId: "test",
				});

				// Make fetch fail 5 times to open circuit
				mockFetch.mockRejectedValue(new Error("Network error"));
				for (let i = 0; i < 5; i++) {
					await client.flushToMCP();
				}

				// Verify circuit is open
				expect(client.getCircuitState().state).toBe("open");

				// Manually set lastFailureTime to past (simulate timeout passed)
				const clientAny = client as any;
				clientAny.lastFailureTime = Date.now() - 35000; // 35 seconds ago

				// Transition to half-open on next check
				mockFetch.mockClear();
				await client.flushToMCP();

				// Should have attempted (half-open allows one try)
				expect(mockFetch).toHaveBeenCalled();
			});

			it("should close circuit on successful push in half-open state", async () => {
				// Queue some data
				client.pushObservation({
					type: "progress",
					message: "Test observation",
					timestamp: Date.now(),
					workspaceId: "test",
				});

				// Make fetch fail 5 times to open circuit
				mockFetch.mockRejectedValue(new Error("Network error"));
				for (let i = 0; i < 5; i++) {
					await client.flushToMCP();
				}

				// Manually transition to half-open
				const clientAny = client as any;
				clientAny.circuitState = "half-open";

				// Queue more data and make fetch succeed
				client.pushObservation({
					type: "progress",
					message: "Recovery test",
					timestamp: Date.now(),
					workspaceId: "test",
				});
				mockFetch.mockResolvedValue({ ok: true });

				await client.flushToMCP();

				const state = client.getCircuitState();
				expect(state.state).toBe("closed");
				expect(state.consecutiveFailures).toBe(0);
			});

			it("should reopen circuit on failure in half-open state", async () => {
				// Queue some data
				client.pushObservation({
					type: "progress",
					message: "Test observation",
					timestamp: Date.now(),
					workspaceId: "test",
				});

				// Manually set to half-open state
				const clientAny = client as any;
				clientAny.circuitState = "half-open";
				clientAny.consecutiveFailures = 5;

				// Make fetch fail
				mockFetch.mockRejectedValue(new Error("Network error"));

				await client.flushToMCP();

				const state = client.getCircuitState();
				expect(state.state).toBe("open");
			});
		});

		describe("Circuit state diagnostics", () => {
			it("should report nextRetryIn when circuit is open", async () => {
				// Queue some data
				client.pushObservation({
					type: "progress",
					message: "Test observation",
					timestamp: Date.now(),
					workspaceId: "test",
				});

				// Make fetch fail 5 times to open circuit
				mockFetch.mockRejectedValue(new Error("Network error"));
				for (let i = 0; i < 5; i++) {
					await client.flushToMCP();
				}

				const state = client.getCircuitState();
				expect(state.state).toBe("open");
				expect(state.nextRetryIn).toBeDefined();
				expect(state.nextRetryIn).toBeGreaterThan(0);
				expect(state.nextRetryIn).toBeLessThanOrEqual(30000);
			});

			it("should not have nextRetryIn when circuit is closed", () => {
				const state = client.getCircuitState();
				expect(state.state).toBe("closed");
				expect(state.nextRetryIn).toBeUndefined();
			});
		});
	});

	describe("Observation Queue", () => {
		it("should limit queue size to 50 observations", () => {
			for (let i = 0; i < 60; i++) {
				client.pushObservation({
					type: "progress",
					message: `Observation ${i}`,
					timestamp: Date.now(),
					workspaceId: "test",
				});
			}

			const status = client.getStatus();
			expect(status.pendingObservations).toBe(50);
		});

		it("should trigger immediate flush for risk observations", async () => {
			mockFetch.mockResolvedValue({ ok: true });

			client.pushObservation({
				type: "risk",
				message: "High-risk file modified",
				timestamp: Date.now(),
				workspaceId: "test",
			});

			// Flush is async, wait a tick
			await new Promise((resolve) => setTimeout(resolve, 0));

			expect(mockFetch).toHaveBeenCalled();
		});

		it("should trigger immediate flush for warning observations", async () => {
			mockFetch.mockResolvedValue({ ok: true });

			client.warn("Warning message");

			// Flush is async, wait a tick
			await new Promise((resolve) => setTimeout(resolve, 0));

			expect(mockFetch).toHaveBeenCalled();
		});
	});

	describe("Status Reporting", () => {
		it("should track push count and failure count", async () => {
			// Queue some data
			client.pushObservation({
				type: "progress",
				message: "Test",
				timestamp: Date.now(),
				workspaceId: "test",
			});

			// Successful push
			mockFetch.mockResolvedValue({ ok: true });
			await client.flushToMCP();

			let status = client.getStatus();
			expect(status.pushCount).toBe(1);
			expect(status.failureCount).toBe(0);

			// Queue more data
			client.pushObservation({
				type: "progress",
				message: "Test 2",
				timestamp: Date.now(),
				workspaceId: "test",
			});

			// Failed push
			mockFetch.mockRejectedValue(new Error("Network error"));
			await client.flushToMCP();

			status = client.getStatus();
			expect(status.pushCount).toBe(1);
			expect(status.failureCount).toBe(1);
		});

		it("should report pending observations and changes", () => {
			client.pushObservation({
				type: "progress",
				message: "Test",
				timestamp: Date.now(),
				workspaceId: "test",
			});

			const status = client.getStatus();
			expect(status.pendingObservations).toBe(1);
			expect(status.pendingChanges).toBe(0);
		});

		it("should report circuit state in status", () => {
			const status = client.getStatus();
			expect(status.circuitState).toBe("closed");
		});
	});

	describe("Force Circuit Control", () => {
		it("should force open the circuit breaker", () => {
			client.forceOpenCircuit("test reason");

			const state = client.getCircuitState();
			expect(state.state).toBe("open");
		});

		it("should force close the circuit breaker", () => {
			client.forceOpenCircuit("test");
			client.forceCloseCircuit("recovery");

			const state = client.getCircuitState();
			expect(state.state).toBe("closed");
			expect(state.consecutiveFailures).toBe(0);
		});
	});
});
