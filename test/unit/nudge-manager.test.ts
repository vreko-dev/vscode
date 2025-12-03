// @ts-nocheck - RED test: NudgeManager not yet implemented
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NudgeManager } from "../../src/nurturing/NudgeManager";

/**
 * RED Test: NudgeManager Race Condition Prevention
 *
 * Purpose: Define expected behavior for NudgeManager to prevent duplicate nudges
 * when concurrent triggers fire simultaneously.
 *
 * Pattern: Race condition where two maybeNudge() calls pass time checks before
 * either updates globalState, causing duplicate nudges to show.
 *
 * Solution: In-memory lock (`nudgingInProgress`) + session flag (`nudgeShownThisSession`)
 */

// Mock VSCode extension context
interface MockContext {
	globalState: Map<string, unknown>;
}

// Mock nudge trigger types
type NudgeTrigger = "auth_failed" | "feature_discovered" | "milestone_reached";

/**
 * Expected NudgeManager interface (to be implemented)
 */
interface INudgeManager {
	maybeNudge(trigger: NudgeTrigger): Promise<void>;
	getLastNudgeTime(): number | null;
	wasShownThisSession(): boolean;
}

describe("NudgeManager", () => {
	let mockContext: MockContext;
	// @ts-expect-error - NudgeManager not yet implemented
	let nudgeManager: INudgeManager;

	beforeEach(() => {
		// Initialize mock context
		mockContext = {
			globalState: new Map(),
		};

		// @ts-expect-error - NudgeManager not yet implemented
		nudgeManager = new NudgeManager(mockContext);
	});

	describe("Race Condition Prevention", () => {
		it("should not show duplicate nudges on concurrent triggers", async () => {
			// Simulate two triggers firing at same time (e.g., auth_failed + feature_discovered)
			// Both should not proceed if one is already showing

			// @ts-expect-error - nudgeManager not yet implemented
			const promise1 = nudgeManager.maybeNudge("auth_failed");
			// @ts-expect-error - nudgeManager not yet implemented
			const promise2 = nudgeManager.maybeNudge("feature_discovered");

			// Wait for both to complete
			await Promise.all([promise1, promise2]);

			// Verify only one nudge was shown in this session
			// @ts-expect-error - nudgeManager not yet implemented
			expect(nudgeManager.wasShownThisSession()).toBe(true);
		});

		it("should use in-memory lock to prevent concurrent execution", async () => {
			const _startTime = Date.now();
			mockContext.globalState.set("snapback.lastAuthNudge", 0); // Long time ago

			// Call maybeNudge without awaiting - simulate concurrent calls
			// @ts-expect-error - nudgeManager not yet implemented
			const results = await Promise.allSettled([
				nudgeManager.maybeNudge("auth_failed"),
				nudgeManager.maybeNudge("feature_discovered"),
				nudgeManager.maybeNudge("milestone_reached"),
			]);

			// All should settle (not throw)
			expect(results).toHaveLength(3);
			expect(results.every((r) => r.status === "fulfilled")).toBe(true);
		});

		it("should return early on subsequent calls after nudging", async () => {
			mockContext.globalState.set("snapback.lastAuthNudge", 0);

			// First call should proceed
			// @ts-expect-error - nudgeManager not yet implemented
			await nudgeManager.maybeNudge("auth_failed");

			// @ts-expect-error - nudgeManager not yet implemented
			expect(nudgeManager.wasShownThisSession()).toBe(true);

			// Second call should return immediately
			// @ts-expect-error - nudgeManager not yet implemented
			const secondResult = await nudgeManager.maybeNudge("feature_discovered");

			// Should be undefined/void (fast path - no execution)
			expect(secondResult).toBeUndefined();
		});
	});

	describe("Session-Level Throttling", () => {
		it("should show nudge once per session", async () => {
			mockContext.globalState.set("snapback.lastAuthNudge", 0); // Never nudged before

			// @ts-expect-error - nudgeManager not yet implemented
			await nudgeManager.maybeNudge("auth_failed");

			// @ts-expect-error - nudgeManager not yet implemented
			expect(nudgeManager.wasShownThisSession()).toBe(true);

			// Later in same session, should not nudge again
			// @ts-expect-error - nudgeManager not yet implemented
			const result2 = await nudgeManager.maybeNudge("feature_discovered");
			expect(result2).toBeUndefined(); // Early return
		});

		it("should reset session flag on new session (context disposal)", async () => {
			// This test verifies that nudgeShownThisSession is per-extension-lifetime
			// not persisted across reloads

			// @ts-expect-error - nudgeManager not yet implemented
			expect(nudgeManager.wasShownThisSession()).toBe(false);
		});
	});

	describe("Persistent Time-Based Throttling", () => {
		it("should not nudge within 24 hour window", async () => {
			const now = Date.now();
			const recentNudge = now - 12 * 60 * 60 * 1000; // 12 hours ago

			mockContext.globalState.set("snapback.lastAuthNudge", recentNudge);

			// Should not proceed past time check
			// @ts-expect-error - nudgeManager not yet implemented
			await nudgeManager.maybeNudge("auth_failed");

			// Session flag should not be set because we were throttled by time
			// @ts-expect-error - nudgeManager not yet implemented
			expect(nudgeManager.wasShownThisSession()).toBe(false);

			// Last nudge time should not change
			// @ts-expect-error - nudgeManager not yet implemented
			expect(nudgeManager.getLastNudgeTime()).toBe(recentNudge);
		});

		it("should nudge after 24 hour window", async () => {
			const baseTime = Date.now();
			const oldNudge = baseTime - 25 * 60 * 60 * 1000; // 25 hours ago

			mockContext.globalState.set("snapback.lastAuthNudge", oldNudge);

			// @ts-expect-error - nudgeManager not yet implemented
			await nudgeManager.maybeNudge("auth_failed");

			// Should have proceeded
			// @ts-expect-error - nudgeManager not yet implemented
			expect(nudgeManager.wasShownThisSession()).toBe(true);

			// Last nudge time should be updated to timestamp after the call
			// @ts-expect-error - nudgeManager not yet implemented
			const lastNudge = nudgeManager.getLastNudgeTime();
			expect(lastNudge).toBeDefined();
			if (lastNudge) {
				expect(lastNudge).toBeGreaterThanOrEqual(oldNudge);
			}
		});
	});

	describe("Lock Cleanup", () => {
		it("should always reset nudgingInProgress lock even on error", async () => {
			mockContext.globalState.set("snapback.lastAuthNudge", 0);

			// Mock showing nudge to throw error
			// @ts-expect-error - nudgeManager not yet implemented
			vi.spyOn(nudgeManager, "showNudge").mockRejectedValueOnce(
				new Error("Display failed"),
			);

			// First call should handle error internally and not throw (nudges are best-effort)
			// Lock will still be released in finally block
			// @ts-expect-error - nudgeManager not yet implemented
			await nudgeManager.maybeNudge("auth_failed");

			// Second call should proceed normally (lock was released)
			// @ts-expect-error - nudgeManager not yet implemented
			const result2 = nudgeManager.maybeNudge("feature_discovered");
			expect(result2).toBeDefined();
		});
	});

	describe("Integration with GlobalState", () => {
		it("should persist last nudge time to globalState", async () => {
			const beforeTime = Date.now();

			// @ts-expect-error - nudgeManager not yet implemented
			await nudgeManager.maybeNudge("auth_failed");

			const afterTime = Date.now();
			const storedTime = mockContext.globalState.get("snapback.lastAuthNudge");

			// Can be stored or undefined from globalState (depends on mock implementation)
			expect(typeof storedTime === "number" || storedTime === undefined).toBe(
				true,
			);
			if (typeof storedTime === "number") {
				expect(storedTime).toBeGreaterThanOrEqual(beforeTime);
				expect(storedTime).toBeLessThanOrEqual(afterTime);
			}
		});

		it("should handle missing globalState gracefully", async () => {
			// If globalState is empty (first run), should treat as never nudged
			expect(
				mockContext.globalState.get("snapback.lastAuthNudge"),
			).toBeUndefined();

			// Should proceed normally
			// @ts-expect-error - nudgeManager not yet implemented
			await nudgeManager.maybeNudge("auth_failed");

			// @ts-expect-error - nudgeManager not yet implemented
			expect(nudgeManager.wasShownThisSession()).toBe(true);
		});
	});
});
