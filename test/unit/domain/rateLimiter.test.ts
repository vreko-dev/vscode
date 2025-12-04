import { describe, it, expect } from "vitest";
import { createRateLimiter, SnapshotRateLimiter } from "@/domain/rateLimiter";

/**
 * SnapshotRateLimiter Tests
 *
 * Tests sliding window rate limiting for snapshot creation with:
 * - Configurable max snapshots per window
 * - Sliding window with millisecond precision
 * - Automatic cleanup of expired snapshots
 * - Status reporting (count, remaining, wait time)
 */

describe("SnapshotRateLimiter", () => {
	describe("Basic rate limiting", () => {
		it("should allow snapshot when under limit", () => {
			const limiter = createRateLimiter(4, 60000);

			expect(limiter.canSnapshot(1000)).toBe(true);
			expect(limiter.recordSnapshot(1000)).toBe(true);
			expect(limiter.recordSnapshot(2000)).toBe(true);
			expect(limiter.recordSnapshot(3000)).toBe(true);

			expect(limiter.getCount(5000)).toBe(3);
			expect(limiter.getRemaining(5000)).toBe(1);
		});

		it("should allow snapshot at exact limit", () => {
			const limiter = createRateLimiter(4, 60000);

			expect(limiter.recordSnapshot(1000)).toBe(true);
			expect(limiter.recordSnapshot(2000)).toBe(true);
			expect(limiter.recordSnapshot(3000)).toBe(true);
			expect(limiter.recordSnapshot(4000)).toBe(true);

			expect(limiter.getCount(5000)).toBe(4);
			expect(limiter.getRemaining(5000)).toBe(0);
		});

		it("should block snapshot when over limit", () => {
			const limiter = createRateLimiter(4, 60000);

			expect(limiter.recordSnapshot(1000)).toBe(true);
			expect(limiter.recordSnapshot(2000)).toBe(true);
			expect(limiter.recordSnapshot(3000)).toBe(true);
			expect(limiter.recordSnapshot(4000)).toBe(true);

			// 5th snapshot should be blocked
			expect(limiter.canSnapshot(5000)).toBe(false);
			expect(limiter.recordSnapshot(5000)).toBe(false);
		});

		it("should reset count after window expires", () => {
			const limiter = createRateLimiter(4, 60000);

			limiter.recordSnapshot(1000);
			limiter.recordSnapshot(2000);

			// At exactly 61000, window is [1000, 61000], so both snapshots are still active
			expect(limiter.getCount(61000)).toBe(2);

			// At 61001, window is [1001, 61001], only snapshot at 2000 is still active
			expect(limiter.getCount(61001)).toBe(1);

			// After both expire
			const afterWindow = 2000 + 60000 + 1;
			expect(limiter.getCount(afterWindow)).toBe(0);
			expect(limiter.canSnapshot(afterWindow)).toBe(true);
		});
	});

	describe("Sliding window behavior", () => {
		it("should remove snapshots outside window", () => {
			const limiter = createRateLimiter(10, 60000);

			limiter.recordSnapshot(10000);
			limiter.recordSnapshot(20000);

			// Window at 70000 is [10000, 70000], both snapshots are active
			expect(limiter.getCount(70000)).toBe(2);

			// Window at 70001 is [10001, 70001], first snapshot removed, second active
			expect(limiter.getCount(70001)).toBe(1);

			// Window at 100000 is [40000, 100000], both snapshots are outside
			expect(limiter.getCount(100000)).toBe(0);
		});

		it("should maintain sliding window correctly", () => {
			const limiter = createRateLimiter(10, 60000);

			limiter.recordSnapshot(5000);
			limiter.recordSnapshot(10000);
			limiter.recordSnapshot(15000);
			limiter.recordSnapshot(20000);
			limiter.recordSnapshot(65000);

			const currentTime = 70000;

			// 5000 is 65000ms old (outside window), others inside
			expect(limiter.getCount(currentTime)).toBe(4);
		});

		it("should allow new snapshot after oldest expires", () => {
			const limiter = createRateLimiter(4, 60000);

			limiter.recordSnapshot(1000);
			limiter.recordSnapshot(2000);
			limiter.recordSnapshot(3000);
			limiter.recordSnapshot(4000);

			const currentTime = 61001; // Just after first snapshot expires

			// 1000 is outside window, so count is 3
			expect(limiter.getCount(currentTime)).toBe(3);
			expect(limiter.canSnapshot(currentTime)).toBe(true);
		});
	});

	describe("Status reporting", () => {
		it("should report remaining quota", () => {
			const limiter = createRateLimiter(4, 60000);

			limiter.recordSnapshot(1000);
			limiter.recordSnapshot(2000);

			expect(limiter.getRemaining(5000)).toBe(2);
		});

		it("should report zero remaining when at limit", () => {
			const limiter = createRateLimiter(4, 60000);

			for (let i = 1; i <= 4; i++) {
				limiter.recordSnapshot(i * 1000);
			}

			expect(limiter.getRemaining(5000)).toBe(0);
		});

		it("should report wait time until next slot", () => {
			const limiter = createRateLimiter(4, 60000);

			for (let i = 1; i <= 4; i++) {
				limiter.recordSnapshot(i * 1000);
			}

			const currentTime = 5000;
			const waitTime = limiter.getWaitTime(currentTime);

			// Should wait until oldest (1000) expires: 1000 + 60000 - 5000 = 56000
			expect(waitTime).toBe(56000);
		});

		it("should report zero wait time when under limit", () => {
			const limiter = createRateLimiter(4, 60000);

			limiter.recordSnapshot(1000);
			limiter.recordSnapshot(2000);
			limiter.recordSnapshot(3000);

			const waitTime = limiter.getWaitTime(5000);

			expect(waitTime).toBe(0);
		});

		it("should get status with all fields", () => {
			const limiter = createRateLimiter(4, 60000);

			for (let i = 1; i <= 3; i++) {
				limiter.recordSnapshot(i * 1000);
			}

			const status = limiter.getStatus(5000);

			expect(status.count).toBe(3);
			expect(status.remaining).toBe(1);
			expect(status.canSnapshot).toBe(true);
			expect(status.waitTimeMs).toBe(0);
		});
	});

	describe("Burst scenarios", () => {
		it("should allow burst when window resets", () => {
			const limiter = createRateLimiter(4, 60000);

			// First burst
			for (let i = 1; i <= 4; i++) {
				limiter.recordSnapshot(i * 1000);
			}

			// At 61000, window is [1000, 61000], first snapshot still active
			expect(limiter.getCount(61000)).toBe(4);

			// Well past window
			const afterWindowReset = 65001;
			expect(limiter.getCount(afterWindowReset)).toBe(0);

			// New burst allowed
			expect(limiter.canSnapshot(afterWindowReset)).toBe(true);
			for (let i = 1; i <= 4; i++) {
				expect(limiter.recordSnapshot(afterWindowReset + i * 1000)).toBe(true);
			}
		});

		it("should track independent bursts correctly", () => {
			const limiter = createRateLimiter(4, 60000);

			// Burst 1
			limiter.recordSnapshot(1000);
			limiter.recordSnapshot(2000);
			limiter.recordSnapshot(3000);
			limiter.recordSnapshot(4000);

			expect(limiter.getCount(5000)).toBe(4);

			// At 61000, window is [1000, 61000], first snapshot still active
			const burst2Start = 65001;
			expect(limiter.getCount(burst2Start)).toBe(0);

			limiter.recordSnapshot(burst2Start);
			limiter.recordSnapshot(burst2Start + 1000);
			limiter.recordSnapshot(burst2Start + 2000);
			limiter.recordSnapshot(burst2Start + 3000);

			expect(limiter.getCount(burst2Start + 5000)).toBe(4);
		});
	});

	describe("Edge cases", () => {
		it("should handle no snapshots yet", () => {
			const limiter = createRateLimiter(4, 60000);

			expect(limiter.getCount(1000)).toBe(0);
			expect(limiter.canSnapshot(1000)).toBe(true);
		});

		it("should handle single snapshot", () => {
			const limiter = createRateLimiter(4, 60000);

			limiter.recordSnapshot(1000);

			expect(limiter.getCount(2000)).toBe(1);
			expect(limiter.getRemaining(2000)).toBe(3);
		});

		it("should handle timestamps at window boundary", () => {
			const limiter = createRateLimiter(4, 60000);

			limiter.recordSnapshot(1000);

			// At 61000, window is [1000, 61000], snapshot at 1000 is still active (>=)
			expect(limiter.getCount(61000)).toBe(1);

			// Just past: 61001, window is [1001, 61001], snapshot at 1000 is outside
			expect(limiter.getCount(61001)).toBe(0);
		});

		it("should handle custom window sizes", () => {
			const limiter = createRateLimiter(2, 30000); // 30 second window, max 2

			limiter.recordSnapshot(1000);
			limiter.recordSnapshot(2000);

			// Within window [1000, 31000]
			expect(limiter.getCount(31000)).toBe(2);

			// Just past: window is [1001, 31001]
			expect(limiter.getCount(31001)).toBe(1);

			// Well past
			expect(limiter.getCount(35000)).toBe(0);
		});

		it("should handle custom max snapshots", () => {
			const limiter = createRateLimiter(10, 60000);

			for (let i = 1; i <= 10; i++) {
				expect(limiter.recordSnapshot(i * 1000)).toBe(true);
			}

			expect(limiter.canSnapshot(15000)).toBe(false);
		});
	});

	describe("Reset functionality", () => {
		it("should reset all snapshots", () => {
			const limiter = createRateLimiter(4, 60000);

			limiter.recordSnapshot(1000);
			limiter.recordSnapshot(2000);
			limiter.recordSnapshot(3000);

			expect(limiter.getCount(5000)).toBe(3);

			limiter.reset();

			expect(limiter.getCount(5000)).toBe(0);
			expect(limiter.canSnapshot(5000)).toBe(true);
		});

		it("should allow recording after reset", () => {
			const limiter = createRateLimiter(4, 60000);

			limiter.recordSnapshot(1000);
			limiter.recordSnapshot(2000);
			limiter.reset();

			expect(limiter.recordSnapshot(3000)).toBe(true);
			expect(limiter.recordSnapshot(4000)).toBe(true);
			expect(limiter.getCount(5000)).toBe(2);
		});
	});

	describe("Configuration", () => {
		it("should throw on invalid max snapshots", () => {
			expect(() => createRateLimiter(0, 60000)).toThrow();
			expect(() => createRateLimiter(-1, 60000)).toThrow();
		});

		it("should throw on invalid window size", () => {
			expect(() => createRateLimiter(4, 0)).toThrow();
			expect(() => createRateLimiter(4, -1000)).toThrow();
		});

		it("should use default window size if not provided", () => {
			const limiter = new SnapshotRateLimiter({ maxSnapshots: 4 });

			// Default window is 60000ms
			limiter.recordSnapshot(1000);
			expect(limiter.getCount(61000)).toBe(1); // At boundary
			expect(limiter.getCount(61001)).toBe(0); // Past boundary
		});
	});

	describe("Real-world workflow", () => {
		it("should allow 4 snapshots in first minute", () => {
			const limiter = createRateLimiter(4, 60000);

			const snapshots = [5000, 10000, 15000, 20000];
			snapshots.forEach((ts) => {
				expect(limiter.recordSnapshot(ts)).toBe(true);
			});

			expect(limiter.getCount(30000)).toBe(4);
			expect(limiter.canSnapshot(30000)).toBe(false);
		});

		it("should allow 5th snapshot after first expires", () => {
			const limiter = createRateLimiter(4, 60000);

			for (let i = 1; i <= 4; i++) {
				limiter.recordSnapshot(i * 1000);
			}

			// At 61000, first snapshot is at boundary (still active)
			const atBoundary = 61000;
			expect(limiter.getCount(atBoundary)).toBe(4);

			// Just past boundary
			const pastBoundary = 61001;
			expect(limiter.getCount(pastBoundary)).toBe(3);
			expect(limiter.canSnapshot(pastBoundary)).toBe(true);
			expect(limiter.recordSnapshot(pastBoundary)).toBe(true);
		});

		it("should track correct wait time during backpressure", () => {
			const limiter = createRateLimiter(4, 60000);

			for (let i = 1; i <= 4; i++) {
				limiter.recordSnapshot(i * 1000);
			}

			const currentTime = 25000;
			const waitTime = limiter.getWaitTime(currentTime);

			// Must wait until first snapshot (1000) expires: 1000 + 60000 - 25000 = 36000
			expect(waitTime).toBe(36000);
		});
	});
});
