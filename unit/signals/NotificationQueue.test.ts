/**
 * NotificationQueue Tests
 *
 * Tests for FM-1 (zombie timeout) and FM-2 (priority interrupt double-drain)
 * as well as core queue behavior.
 *
 * @see docs/plans/UX-surface/extension_surface.md  -  Notification Infrastructure Reliability
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	NotificationQueue,
	NOTIFICATION_PRIORITY,
	disposeNotificationQueue,
	getNotificationQueue,
} from "../../../src/signals/NotificationQueue";

// Mock logger
vi.mock("../../../src/utils/logger", () => ({
	logger: {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}));

describe("NotificationQueue", () => {
	let queue: NotificationQueue;

	beforeEach(() => {
		vi.useFakeTimers();
		queue = new NotificationQueue();
	});

	afterEach(() => {
		queue.dispose();
		vi.useRealTimers();
		vi.clearAllMocks();
	});

	// =========================================================================
	// Core queue behavior
	// =========================================================================
	describe("core queuing", () => {
		it("shows notification immediately when queue is empty", async () => {
			const show = vi.fn().mockResolvedValue("View");
			const result = await queue.push("test", NOTIFICATION_PRIORITY.RECOVERY, show);
			expect(show).toHaveBeenCalledOnce();
			expect(result).toBe("View");
		});

		it("queues lower-priority notification when one is active", async () => {
			let resolveFirst: (v: string | undefined) => void;
			const firstShow = vi.fn(
				() =>
					new Promise<string | undefined>((resolve) => {
						resolveFirst = resolve;
					}),
			);
			const secondShow = vi.fn().mockResolvedValue("Done");

			// Start first (doesn't resolve yet)
			const firstPromise = queue.push("first", NOTIFICATION_PRIORITY.RECOVERY, firstShow);
			// Second should be pending
			const secondPromise = queue.push("second", NOTIFICATION_PRIORITY.MILESTONE_AI, secondShow);

			expect(secondShow).not.toHaveBeenCalled();

			// Dismiss first
			resolveFirst!(undefined);
			await firstPromise;

			// Second should now show
			await secondPromise;
			expect(secondShow).toHaveBeenCalledOnce();
		});

		it("drains pending queue in priority order (highest first)", async () => {
			const order: string[] = [];
			let resolveFirst: (v: string | undefined) => void;
			const firstShow = vi.fn(
				() =>
					new Promise<string | undefined>((resolve) => {
						resolveFirst = resolve;
					}),
			);

			const queue2 = new NotificationQueue();

			// Show first (active)
			const p1 = queue2.push("first", NOTIFICATION_PRIORITY.RECOVERY, firstShow);

			// Queue three more at different priorities
			const p2 = queue2.push("low", NOTIFICATION_PRIORITY.MILESTONE_AI, async () => {
				order.push("low");
				return undefined;
			});
			const p3 = queue2.push("high", NOTIFICATION_PRIORITY.DEGRADATION, async () => {
				order.push("high");
				return undefined;
			});
			const p4 = queue2.push("medium", NOTIFICATION_PRIORITY.CLOSING_CEREMONY, async () => {
				order.push("medium");
				return undefined;
			});

			resolveFirst!(undefined);
			await p1;
			await p3;
			await p4;
			await p2;
			queue2.dispose();

			// Highest priority (DEGRADATION=80) should show first, then CLOSING_CEREMONY=50, then MILESTONE_AI=30
			expect(order).toEqual(["high", "medium", "low"]);
		});

		it("clearPending() resolves all pending with undefined and empties queue", async () => {
			let resolveFirst: (v: string | undefined) => void;
			const firstShow = vi.fn(
				() =>
					new Promise<string | undefined>((resolve) => {
						resolveFirst = resolve;
					}),
			);
			const secondShow = vi.fn().mockResolvedValue("Done");

			const p1 = queue.push("first", NOTIFICATION_PRIORITY.RECOVERY, firstShow);
			const p2 = queue.push("second", NOTIFICATION_PRIORITY.MILESTONE_AI, secondShow);

			queue.clearPending();
			expect(queue.getPendingCount()).toBe(0);

			// Pending was resolved with undefined
			const secondResult = await p2;
			expect(secondResult).toBeUndefined();
			expect(secondShow).not.toHaveBeenCalled();

			resolveFirst!(undefined);
			await p1;
		});
	});

	// =========================================================================
	// FM-1: 30-second timeout guard prevents zombie active state
	// =========================================================================
	describe("FM-1: show() timeout guard", () => {
		it("resolves with undefined after 30s if show() never resolves", async () => {
			// A show() that never resolves (zombie)
			const neverResolve = vi.fn(() => new Promise<string | undefined>(() => { /* intentionally empty */ }));

			const pushPromise = queue.push("zombie", NOTIFICATION_PRIORITY.RECOVERY, neverResolve);

			// Advance past the 30s timeout
			vi.advanceTimersByTime(31_000);

			const result = await pushPromise;
			expect(result).toBeUndefined();
		});

		it("logs a warning when notification times out", async () => {
			const { logger } = await import("../../../src/utils/logger");
			const neverResolve = vi.fn(() => new Promise<string | undefined>(() => { /* intentionally empty */ }));

			const pushPromise = queue.push("zombie-log", NOTIFICATION_PRIORITY.RECOVERY, neverResolve);
			vi.advanceTimersByTime(31_000);
			await pushPromise;

			expect(logger.warn).toHaveBeenCalledWith(
				expect.stringContaining("timed out"),
				expect.objectContaining({ key: "zombie-log" }),
			);
		});

		it("queue is usable after a timeout (active cleared)", async () => {
			const neverResolve = vi.fn(() => new Promise<string | undefined>(() => { /* intentionally empty */ }));
			const nextShow = vi.fn().mockResolvedValue("after-timeout");

			// First notification zombies
			const p1 = queue.push("zombie", NOTIFICATION_PRIORITY.RECOVERY, neverResolve);
			vi.advanceTimersByTime(31_000);
			await p1;

			// Queue should be unblocked
			const result = await queue.push("next", NOTIFICATION_PRIORITY.MILESTONE_AI, nextShow);
			expect(result).toBe("after-timeout");
			expect(nextShow).toHaveBeenCalledOnce();
		});
	});

	// =========================================================================
	// FM-2: Priority interrupt orphan guard prevents double-drain
	// =========================================================================
	describe("FM-2: priority interrupt orphan guard", () => {
		it("does not double-drain when higher priority interrupts", async () => {
			const drained: string[] = [];
			let resolveActive: (v: string | undefined) => void;

			// RECOVERY (70) starts active  -  doesn't resolve immediately
			const activeShow = vi.fn(
				() =>
					new Promise<string | undefined>((resolve) => {
						resolveActive = resolve;
					}),
			);

			// MILESTONE_AI (30) < RECOVERY (70) → queued (not an interrupt)
			const pendingShow = vi.fn(async () => {
				drained.push("pending");
				return undefined;
			});

			const pActive = queue.push("active", NOTIFICATION_PRIORITY.RECOVERY, activeShow);
			const pPending = queue.push("pending", NOTIFICATION_PRIORITY.MILESTONE_AI, pendingShow);

			// MILESTONE_AI (30) < RECOVERY (70) so it must queue, not interrupt
			expect(queue.getPendingCount()).toBe(1);

			// DEGRADATION (80) > RECOVERY (70)  -  interrupts the active slot
			const interruptShow = vi.fn().mockResolvedValue(undefined);
			const pInterrupt = queue.push("interrupt", NOTIFICATION_PRIORITY.DEGRADATION, interruptShow);

			// Interrupt shows immediately (replaces active, increments generation)
			await pInterrupt;
			expect(interruptShow).toHaveBeenCalledOnce();

			// Orphaned active resolves  -  generation mismatch → must NOT call onDismissed again
			resolveActive!(undefined);
			await pActive;

			// Pending must drain exactly once (via the interrupt's onDismissed, not the orphan's)
			await pPending;
			expect(drained).toHaveLength(1);
			expect(drained[0]).toBe("pending");
		});

		it("generation increments on each interrupt", async () => {
			let resolveA: (v: string | undefined) => void;
			const showA = vi.fn(() => new Promise<string | undefined>((r) => (resolveA = r)));
			const showB = vi.fn().mockResolvedValue(undefined);
			const showC = vi.fn().mockResolvedValue(undefined);

			const pA = queue.push("a", NOTIFICATION_PRIORITY.MILESTONE_AI, showA); // active
			const pB = queue.push("b", NOTIFICATION_PRIORITY.RECOVERY, showB); // interrupts
			await pB;

			const pC = queue.push("c", NOTIFICATION_PRIORITY.DEGRADATION, showC); // interrupts again
			await pC;

			// Orphaned A resolves  -  should not corrupt state
			resolveA!(undefined);
			await pA;

			// Queue should be empty and functional
			expect(queue.isActive()).toBe(false);
		});
	});

	// =========================================================================
	// Singleton helpers
	// =========================================================================
	describe("singleton helpers", () => {
		afterEach(() => {
			disposeNotificationQueue();
		});

		it("getNotificationQueue returns the same instance each call", () => {
			const q1 = getNotificationQueue();
			const q2 = getNotificationQueue();
			expect(q1).toBe(q2);
		});

		it("disposeNotificationQueue creates fresh instance on next get", () => {
			const q1 = getNotificationQueue();
			disposeNotificationQueue();
			const q2 = getNotificationQueue();
			expect(q1).not.toBe(q2);
		});
	});
});
