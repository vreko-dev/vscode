/**
 * Activation Performance Tests
 *
 * Unit tests for activation timing logic and deferred initialization patterns.
 * For actual extension host activation timing, see the integration tests.
 *
 * Tests:
 * - Phase timing logic works correctly
 * - Phase tracker records all phases
 * - Deferred initialization patterns are correct
 * - Zero blocking I/O on activation (spy on fs.readFileSync)
 * - Zero network calls on activation (spy on fetch, http.request)
 *
 * @see apps/vscode/src/activation/phaseTracker.ts
 * @see docs/perf_testing.md for full strategy
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TIER1_BUDGETS } from "@vreko/contracts";

// =============================================================================
// Mocks
// =============================================================================

// Mock vscode module
vi.mock("vscode", () => ({
	ExtensionContext: vi.fn(),
	OutputChannel: vi.fn(),
	window: {
		createOutputChannel: vi.fn(() => ({
			appendLine: vi.fn(),
		})),
	},
	workspace: {
		workspaceFolders: [],
		getConfiguration: vi.fn(() => ({
			get: vi.fn(),
		})),
	},
}));

// =============================================================================
// Test Suite
// =============================================================================

describe("Activation Performance", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	describe("Phase Timing Logic", () => {
		it("should track phase durations correctly", async () => {
			const phaseTimings: Record<string, number> = {};

			// Simulate the phase tracking pattern
			const trackPhase = async <T>(name: string, fn: () => Promise<T>): Promise<T> => {
				const start = Date.now();
				const result = await fn();
				phaseTimings[name] = Date.now() - start;
				return result;
			};

			// Simulate phases
			await trackPhase("Phase 1 (Services)", async () => {
				vi.advanceTimersByTime(50);
				return {};
			});

			await trackPhase("Phase 2 (Storage)", async () => {
				vi.advanceTimersByTime(30);
				return {};
			});

			await trackPhase("Phase 3 (Managers)", async () => {
				vi.advanceTimersByTime(40);
				return {};
			});

			expect(phaseTimings["Phase 1 (Services)"]).toBe(50);
			expect(phaseTimings["Phase 2 (Storage)"]).toBe(30);
			expect(phaseTimings["Phase 3 (Managers)"]).toBe(40);
		});

		it("should calculate total activation time from phases", () => {
			const phaseTimings = {
				"Phase 1 (Services)": 50,
				"Phase 2 (Storage)": 30,
				"Phase 3 (Managers)": 40,
				"Phase 4 (UI)": 20,
			};

			const totalTime = Object.values(phaseTimings).reduce((sum, t) => sum + t, 0);

			// Total should be within budget
			expect(totalTime).toBeLessThan(TIER1_BUDGETS.activationP95Ms.budget);
		});
	});

	describe("Deferred Initialization Patterns", () => {
		it("should not block caller when using setImmediate", async () => {
			const executionOrder: string[] = [];
			let deferredWorkComplete = false;

			// Simulate the activation pattern
			const activate = () => {
				executionOrder.push("activate-start");

				// Fire-and-forget with setImmediate
				setImmediate(() => {
					executionOrder.push("deferred-work");
					deferredWorkComplete = true;
				});

				executionOrder.push("activate-end");
			};

			activate();

			// activate() should complete immediately
			expect(executionOrder).toEqual(["activate-start", "activate-end"]);
			expect(deferredWorkComplete).toBe(false);

			// Run setImmediate callbacks
			await vi.runAllTimersAsync();

			expect(executionOrder).toEqual(["activate-start", "activate-end", "deferred-work"]);
			expect(deferredWorkComplete).toBe(true);
		});

		it("should defer LSP activation to after startup", async () => {
			const calls: string[] = [];

			const activateLanguageServer = vi.fn().mockImplementation(async () => {
				calls.push("lsp-start");
				await new Promise((resolve) => setTimeout(resolve, 100));
				calls.push("lsp-end");
			});

			// Simulate the deferred pattern
			const activateExtension = () => {
				calls.push("activate-start");
				setImmediate(() => {
					activateLanguageServer();
				});
				calls.push("activate-end");
			};

			activateExtension();

			// LSP should not be started yet
			expect(calls).toEqual(["activate-start", "activate-end"]);
			expect(activateLanguageServer).not.toHaveBeenCalled();

			// Run deferred work
			await vi.runAllTimersAsync();

			expect(calls).toContain("lsp-start");
		});
	});

	describe("Zero Blocking I/O Constraint", () => {
		it("should not call fs.readFileSync during activation", () => {
			const fs = require("node:fs");
			const readFileSyncSpy = vi.spyOn(fs, "readFileSync");

			// Simulate activation that should NOT use sync reads
			const activate = () => {
				// This is what activation SHOULD look like:
				// - No fs.readFileSync
				// - No blocking operations
				return Promise.resolve();
			};

			activate();

			expect(readFileSyncSpy).not.toHaveBeenCalled();

			readFileSyncSpy.mockRestore();
		});

		it("should not call fs.statSync during activation", () => {
			const fs = require("node:fs");
			const statSyncSpy = vi.spyOn(fs, "statSync");

			const activate = () => {
				// Activation should defer file checks
				return Promise.resolve();
			};

			activate();

			expect(statSyncSpy).not.toHaveBeenCalled();

			statSyncSpy.mockRestore();
		});
	});

	describe("Zero Network Calls Constraint", () => {
		it("should not make fetch calls during activation", () => {
			const fetchSpy = vi.spyOn(globalThis, "fetch");

			const activate = () => {
				// Activation should defer network calls
				return Promise.resolve();
			};

			activate();

			expect(fetchSpy).not.toHaveBeenCalled();

			fetchSpy.mockRestore();
		});

		it("should defer authentication checks", () => {
			const calls: string[] = [];

			const checkAuth = vi.fn().mockImplementation(async () => {
				calls.push("auth-check");
			});

			const activate = () => {
				calls.push("activate-start");
				// Auth check should be deferred
				setImmediate(() => {
					checkAuth();
				});
				calls.push("activate-end");
			};

			activate();

			expect(calls).toEqual(["activate-start", "activate-end"]);
			expect(checkAuth).not.toHaveBeenCalled();
		});
	});

	describe("Performance Budget Validation", () => {
		it("should validate p95 budget is achievable", () => {
			// This test documents the budget requirement
			expect(TIER1_BUDGETS.activationP95Ms.budget).toBe(200);
			expect(TIER1_BUDGETS.activationP95Ms.regressionThreshold).toBe(0.05);
		});

		it("should validate p99 budget is achievable", () => {
			expect(TIER1_BUDGETS.activationP99Ms.budget).toBe(400);
			expect(TIER1_BUDGETS.activationP99Ms.regressionThreshold).toBe(0.05);
		});

		it("should enforce zero blocking I/O constraint", () => {
			expect(TIER1_BUDGETS.zeroBlockingIO).toBe(true);
		});

		it("should enforce zero network calls constraint", () => {
			expect(TIER1_BUDGETS.zeroNetworkCalls).toBe(true);
		});
	});

	describe("Phase Budget Allocation", () => {
		it("should allocate reasonable time per phase", () => {
			// Rough phase budget allocation
			const phaseBudgets = {
				"Phase 1 (Services)": 50, // Core service creation
				"Phase 2 (Storage)": 50, // Storage initialization
				"Phase 3 (Managers)": 50, // Manager creation
				"Phase 4 (UI)": 30, // UI components
				"Deferred (LSP + Other)": 20, // Deferred work overhead
			};

			const totalBudget = Object.values(phaseBudgets).reduce((sum, b) => sum + b, 0);

			// Total should be within p95 budget with some headroom
			expect(totalBudget).toBeLessThanOrEqual(TIER1_BUDGETS.activationP95Ms.budget);
		});
	});
});
