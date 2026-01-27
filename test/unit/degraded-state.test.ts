/**
 * Tests for P0: Degraded State Management
 *
 * Tests the graceful degradation system that replaces silent catch {} blocks.
 *
 * 4-Path Coverage:
 * - Happy: Component marked degraded, then recovered
 * - Sad: Multiple components degraded simultaneously
 * - Edge: Recovery attempts tracked, listeners notified
 * - Error: withTimeout handles timeouts gracefully
 *
 * @vitest-environment node
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	degradedState,
	type DegradedComponent,
	type DegradedInfo,
	withDegradedFallback,
	withDegradedFallbackSync,
	withTimeout,
} from "../../src/utils/degraded-state";

// =============================================================================
// Setup
// =============================================================================

describe("DegradedStateManager", () => {
	beforeEach(() => {
		// Reset state before each test
		degradedState.reset();
	});

	// =========================================================================
	// HAPPY PATH
	// =========================================================================

	describe("Happy Path", () => {
		it("should mark a component as degraded", () => {
			degradedState.markDegraded("daemon", "Connection failed");

			expect(degradedState.isDegraded("daemon")).toBe(true);
			const info = degradedState.getDegradedInfo("daemon");
			expect(info).toBeDefined();
			expect(info?.reason).toBe("Connection failed");
			expect(info?.recoveryAttempts).toBe(0);
		});

		it("should mark a component as recovered", () => {
			degradedState.markDegraded("storage", "Disk full");
			expect(degradedState.isDegraded("storage")).toBe(true);

			degradedState.markRecovered("storage");
			expect(degradedState.isDegraded("storage")).toBe(false);
		});

		it("should provide default suggestions for known components", () => {
			degradedState.markDegraded("daemon", "Test failure");

			const info = degradedState.getDegradedInfo("daemon");
			expect(info?.suggestion).toContain("Restart");
		});

		it("should allow custom suggestions", () => {
			degradedState.markDegraded("api_client", "Auth failed", undefined, "Check your API key");

			const info = degradedState.getDegradedInfo("api_client");
			expect(info?.suggestion).toBe("Check your API key");
		});
	});

	// =========================================================================
	// SAD PATH
	// =========================================================================

	describe("Sad Path - Multiple Components", () => {
		it("should track multiple degraded components", () => {
			degradedState.markDegraded("daemon", "Connection lost");
			degradedState.markDegraded("storage", "Disk full");
			degradedState.markDegraded("mcp_bridge", "Bridge down");

			const all = degradedState.getAllDegraded();
			expect(all.size).toBe(3);
			expect(degradedState.isDegraded("daemon")).toBe(true);
			expect(degradedState.isDegraded("storage")).toBe(true);
			expect(degradedState.isDegraded("mcp_bridge")).toBe(true);
		});

		it("should generate summary for multiple degraded components", () => {
			degradedState.markDegraded("daemon", "Connection lost");
			degradedState.markDegraded("storage", "Disk full");

			const summary = degradedState.getSummary();
			expect(summary).toContain("Degraded:");
			expect(summary).toContain("daemon");
			expect(summary).toContain("storage");
		});

		it("should return 'All systems operational' when nothing is degraded", () => {
			const summary = degradedState.getSummary();
			expect(summary).toBe("All systems operational");
		});
	});

	// =========================================================================
	// EDGE CASES
	// =========================================================================

	describe("Edge Cases", () => {
		it("should track recovery attempts", () => {
			degradedState.markDegraded("daemon", "Connection failed");
			degradedState.recordRecoveryAttempt("daemon");
			degradedState.recordRecoveryAttempt("daemon");

			const info = degradedState.getDegradedInfo("daemon");
			expect(info?.recoveryAttempts).toBe(2);
			expect(info?.lastRecoveryAttempt).toBeDefined();
		});

		it("should not track recovery attempts for non-degraded components", () => {
			// Should not throw, just do nothing
			degradedState.recordRecoveryAttempt("daemon");
			expect(degradedState.isDegraded("daemon")).toBe(false);
		});

		it("should preserve recovery attempts when re-degraded", () => {
			degradedState.markDegraded("daemon", "First failure");
			degradedState.recordRecoveryAttempt("daemon");
			degradedState.recordRecoveryAttempt("daemon");

			// Re-degrade
			degradedState.markDegraded("daemon", "Second failure");

			const info = degradedState.getDegradedInfo("daemon");
			expect(info?.recoveryAttempts).toBe(2);
		});

		it("should notify listeners on state change", () => {
			const listener = vi.fn();
			const unsubscribe = degradedState.onStateChange(listener);

			degradedState.markDegraded("daemon", "Test failure");
			expect(listener).toHaveBeenCalledTimes(1);
			expect(listener).toHaveBeenCalledWith("daemon", expect.objectContaining({ reason: "Test failure" }));

			degradedState.markRecovered("daemon");
			expect(listener).toHaveBeenCalledTimes(2);
			expect(listener).toHaveBeenLastCalledWith("daemon", null);

			unsubscribe();
			degradedState.markDegraded("storage", "Test");
			// Should not be called again after unsubscribe
			expect(listener).toHaveBeenCalledTimes(2);
		});

		it("should handle error objects correctly", () => {
			const error = new Error("Test error message");
			degradedState.markDegraded("storage", "Operation failed", error);

			const info = degradedState.getDegradedInfo("storage");
			expect(info?.error).toBe(error);
		});

		it("should convert non-Error objects to Error", () => {
			degradedState.markDegraded("storage", "Operation failed", "string error");

			const info = degradedState.getDegradedInfo("storage");
			expect(info?.error).toBeInstanceOf(Error);
			expect(info?.error?.message).toBe("string error");
		});
	});
});

// =============================================================================
// withDegradedFallback Tests
// =============================================================================

describe("withDegradedFallback", () => {
	beforeEach(() => {
		degradedState.reset();
	});

	it("should return successful result and not mark degraded", async () => {
		const result = await withDegradedFallback(
			"daemon",
			async () => "success",
			"fallback",
		);

		expect(result).toBe("success");
		expect(degradedState.isDegraded("daemon")).toBe(false);
	});

	it("should return fallback on failure and mark degraded", async () => {
		const result = await withDegradedFallback(
			"daemon",
			async () => {
				throw new Error("Connection failed");
			},
			"fallback",
		);

		expect(result).toBe("fallback");
		expect(degradedState.isDegraded("daemon")).toBe(true);
	});

	it("should mark recovered if previously degraded and now succeeds", async () => {
		// First fail
		await withDegradedFallback(
			"daemon",
			async () => {
				throw new Error("Connection failed");
			},
			null,
		);
		expect(degradedState.isDegraded("daemon")).toBe(true);

		// Then succeed
		await withDegradedFallback(
			"daemon",
			async () => "success",
			null,
		);
		expect(degradedState.isDegraded("daemon")).toBe(false);
	});

	it("should use custom reason and suggestion", async () => {
		await withDegradedFallback(
			"storage",
			async () => {
				throw new Error("Disk full");
			},
			null,
			{ reason: "Cannot write to disk", suggestion: "Free up disk space" },
		);

		const info = degradedState.getDegradedInfo("storage");
		expect(info?.reason).toBe("Cannot write to disk");
		expect(info?.suggestion).toBe("Free up disk space");
	});
});

// =============================================================================
// withDegradedFallbackSync Tests
// =============================================================================

describe("withDegradedFallbackSync", () => {
	beforeEach(() => {
		degradedState.reset();
	});

	it("should return successful result synchronously", () => {
		const result = withDegradedFallbackSync(
			"daemon",
			() => "success",
			"fallback",
		);

		expect(result).toBe("success");
		expect(degradedState.isDegraded("daemon")).toBe(false);
	});

	it("should return fallback on failure synchronously", () => {
		const result = withDegradedFallbackSync(
			"daemon",
			() => {
				throw new Error("Sync failure");
			},
			"fallback",
		);

		expect(result).toBe("fallback");
		expect(degradedState.isDegraded("daemon")).toBe(true);
	});
});

// =============================================================================
// withTimeout Tests (P2: Activation timeout wrappers)
// =============================================================================

describe("withTimeout", () => {
	beforeEach(() => {
		degradedState.reset();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("should return result when operation completes before timeout", async () => {
		const promise = Promise.resolve("success");

		const resultPromise = withTimeout(promise, {
			timeout: 5000,
			component: "storage",
		});

		await vi.runAllTimersAsync();
		const result = await resultPromise;

		expect(result).toBe("success");
		expect(degradedState.isDegraded("storage")).toBe(false);
	});

	it("should return fallback and mark degraded on timeout", async () => {
		// Promise that never resolves
		const promise = new Promise<string>(() => {});

		const resultPromise = withTimeout(promise, {
			timeout: 5000,
			component: "storage",
			fallback: "fallback-value",
		});

		// Advance time past timeout
		vi.advanceTimersByTime(5001);
		const result = await resultPromise;

		expect(result).toBe("fallback-value");
		expect(degradedState.isDegraded("storage")).toBe(true);

		const info = degradedState.getDegradedInfo("storage");
		expect(info?.reason).toContain("timed out after 5000ms");
	});

	it("should return undefined as default fallback", async () => {
		const promise = new Promise<string>(() => {});

		const resultPromise = withTimeout(promise, {
			timeout: 1000,
			component: "daemon",
		});

		vi.advanceTimersByTime(1001);
		const result = await resultPromise;

		expect(result).toBeUndefined();
	});

	it("should use custom reason when provided", async () => {
		const promise = new Promise<string>(() => {});

		const resultPromise = withTimeout(promise, {
			timeout: 1000,
			component: "storage",
			reason: "Phase 2 initialization timed out",
		});

		vi.advanceTimersByTime(1001);
		await resultPromise;

		const info = degradedState.getDegradedInfo("storage");
		expect(info?.reason).toBe("Phase 2 initialization timed out");
	});

	it("should mark degraded on error even before timeout", async () => {
		const promise = Promise.reject(new Error("Connection refused"));

		const result = await withTimeout(promise, {
			timeout: 5000,
			component: "daemon",
			fallback: "fallback",
		});

		expect(result).toBe("fallback");
		expect(degradedState.isDegraded("daemon")).toBe(true);
	});

	it("should mark recovered if previously degraded and now succeeds", async () => {
		// First timeout
		const timeoutPromise = new Promise<string>(() => {});
		const timeoutResultPromise = withTimeout(timeoutPromise, {
			timeout: 100,
			component: "storage",
		});
		vi.advanceTimersByTime(101);
		await timeoutResultPromise;
		expect(degradedState.isDegraded("storage")).toBe(true);

		// Then succeed
		const successPromise = Promise.resolve("recovered");
		const successResultPromise = withTimeout(successPromise, {
			timeout: 5000,
			component: "storage",
		});
		await vi.runAllTimersAsync();
		const result = await successResultPromise;

		expect(result).toBe("recovered");
		expect(degradedState.isDegraded("storage")).toBe(false);
	});
});
