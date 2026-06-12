/**
 * @fileoverview WriterLock Tests - TDD Phase 1 (RED)
 *
 * Tests for single-writer lock per spec.json:
 * - path: "locks/writer.lock"
 * - requirement: "All writes to manifests/state/index/head-map must hold the lock"
 *
 * Following TDD_CORE.md: 4-path coverage (happy, sad, edge, error)
 */

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import * as WriterLockModule from "../../../src/storage/writerLock";

describe("WriterLock - Single Writer Guarantee", () => {
	describe("Type Exports", () => {
		it("should export WriterLock class", () => {
			expect(WriterLockModule).toHaveProperty("WriterLock");
		});

		it("should export LockAcquisitionError class", () => {
			expect(WriterLockModule).toHaveProperty("LockAcquisitionError");
		});
	});

	describe("Lock Acquisition - Happy Path", () => {
		it("should acquire lock when no other holder exists", async () => {
			const lock = new WriterLockModule.WriterLock();
			const acquired = await lock.acquire();
			expect(acquired).toBe(true);
			expect(lock.isHeld()).toBe(true);
			await lock.release();
		});

		it("should release lock and allow re-acquisition", async () => {
			const lock = new WriterLockModule.WriterLock();
			await lock.acquire();
			await lock.release();
			expect(lock.isHeld()).toBe(false);

			// Should be able to acquire again
			const reacquired = await lock.acquire();
			expect(reacquired).toBe(true);
			await lock.release();
		});
	});

	describe("Lock Acquisition - Sad Path", () => {
		it("should fail to acquire lock when already held", async () => {
			const lock = new WriterLockModule.WriterLock();
			await lock.acquire();

			// Second acquire should fail
			const secondAcquire = await lock.acquire();
			expect(secondAcquire).toBe(false);

			await lock.release();
		});

		it("should throw when releasing unheld lock", async () => {
			const lock = new WriterLockModule.WriterLock();
			await expect(lock.release()).rejects.toThrow("Cannot release lock that is not held");
		});
	});

	describe("Lock Acquisition - Edge Cases", () => {
		it("should handle multiple sequential acquire/release cycles", async () => {
			const lock = new WriterLockModule.WriterLock();

			for (let i = 0; i < 5; i++) {
				const acquired = await lock.acquire();
				expect(acquired).toBe(true);
				await lock.release();
			}
		});

		it("should track holder ID for debugging", async () => {
			const lock = new WriterLockModule.WriterLock();
			await lock.acquire();

			const holderId = lock.getHolderId();
			expect(holderId).not.toBeNull();
			expect(typeof holderId).toBe("string");
			// UUID format: 8-4-4-4-12 hex characters
			expect(holderId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

			await lock.release();
			expect(lock.getHolderId()).toBeNull();
		});
	});

	describe("withLock Helper - Happy Path", () => {
		it("should export withLock helper function", () => {
			expect(WriterLockModule).toHaveProperty("withLock");
		});

		it("should execute callback while holding lock", async () => {
			const lock = new WriterLockModule.WriterLock();
			let executed = false;

			await WriterLockModule.withLock(lock, async () => {
				executed = true;
				expect(lock.isHeld()).toBe(true);
			});

			expect(executed).toBe(true);
			expect(lock.isHeld()).toBe(false);
		});

		it("should return value from callback", async () => {
			const lock = new WriterLockModule.WriterLock();

			const result = await WriterLockModule.withLock(lock, async () => {
				return 42;
			});

			expect(result).toBe(42);
		});
	});

	describe("withLock Helper - Error Path", () => {
		it("should release lock even if callback throws", async () => {
			const lock = new WriterLockModule.WriterLock();

			await expect(
				WriterLockModule.withLock(lock, async () => {
					throw new Error("Callback error");
				}),
			).rejects.toThrow("Callback error");

			// Lock should be released despite error
			expect(lock.isHeld()).toBe(false);
		});

		it("should queue and wait when lock is held (not throw)", async () => {
			const lock = new WriterLockModule.WriterLock();
			await lock.acquire();

			const executionOrder: string[] = [];

			// Start a withLock that will queue
			const queuedPromise = WriterLockModule.withLock(lock, async () => {
				executionOrder.push("queued_callback");
				return "queued_result";
			});

			// Callback should not have executed yet (lock is held)
			expect(executionOrder).toEqual([]);

			// Release the lock
			await lock.release();

			// Now the queued callback should execute
			const result = await queuedPromise;

			expect(executionOrder).toEqual(["queued_callback"]);
			expect(result).toBe("queued_result");
		});
	});

	describe("Timeout Behavior", () => {
		it("should support timeout option on acquire", async () => {
			const lock = new WriterLockModule.WriterLock();
			await lock.acquire();

			// Try to acquire with 50ms timeout - should fail
			const start = Date.now();
			const acquired = await lock.acquire({ timeoutMs: 50 });
			const elapsed = Date.now() - start;

			expect(acquired).toBe(false);
			expect(elapsed).toBeGreaterThanOrEqual(45); // Allow some tolerance
			expect(elapsed).toBeLessThan(150);

			await lock.release();
		});
	});

	describe("Concurrency - Two Concurrent Acquires", () => {
		it("should allow only one concurrent acquire to succeed", async () => {
			const lock = new WriterLockModule.WriterLock();

			// Start two concurrent acquires using Promise.allSettled
			// (order-agnostic - either could win the race)
			const [result1, result2] = await Promise.allSettled([
				lock.acquire(),
				lock.acquire(),
			]);

			// Count successes and failures
			const successes = [result1, result2].filter(
				(r) => r.status === "fulfilled" && r.value === true,
			);
			const failures = [result1, result2].filter(
				(r) => r.status === "fulfilled" && r.value === false,
			);

			// Exactly one should succeed, one should fail
			expect(successes).toHaveLength(1);
			expect(failures).toHaveLength(1);

			await lock.release();
		});
	});

	describe("Performance Budget", () => {
		it("should acquire lock within 5ms under no contention", async () => {
			const lock = new WriterLockModule.WriterLock();

			const start = performance.now();
			const acquired = await lock.acquire();
			const elapsed = performance.now() - start;

			expect(acquired).toBe(true);
			expect(elapsed).toBeLessThan(5); // Performance budget: <5ms
			await lock.release();
		});

		it("should release lock within 1ms", async () => {
			const lock = new WriterLockModule.WriterLock();
			await lock.acquire();

			const start = performance.now();
			await lock.release();
			const elapsed = performance.now() - start;

			expect(elapsed).toBeLessThan(1);
		});
	});

	describe("Deactivation Safety", () => {
		it("should export forceRelease for deactivation cleanup", () => {
			expect(WriterLockModule.WriterLock.prototype).toHaveProperty("forceRelease");
		});

		it("should force release even when held", async () => {
			const lock = new WriterLockModule.WriterLock();
			await lock.acquire();
			expect(lock.isHeld()).toBe(true);

			// Force release (for deactivation)
			lock.forceRelease();
			expect(lock.isHeld()).toBe(false);
		});

		it("should not throw when force releasing unheld lock", () => {
			const lock = new WriterLockModule.WriterLock();
			expect(() => lock.forceRelease()).not.toThrow();
		});
	});

	describe("Cross-Process Limitation", () => {
		/**
		 * DOCUMENTED LIMITATION:
		 * This in-memory lock only protects within a single extension host process.
		 * For multi-window VS Code (separate extension hosts opening same workspace),
		 * a file-based lock would be needed.
		 *
		 * v1 mitigation: Each workspace has unique workspaceKey in storage path,
		 * so different workspaces don't conflict. Same workspace in two windows
		 * is an edge case with potential race conditions.
		 */
		it("should document per-process scope in class", () => {
			// The class docstring should mention this is memory-based
			// This test serves as documentation of the known limitation
			const lock = new WriterLockModule.WriterLock();
			expect(lock).toBeInstanceOf(WriterLockModule.WriterLock);
			// Future: Consider FileLock for cross-process safety
		});
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// BUG FIX: TOCTOU Race Condition in acquire()
	// The acquire() method has a check-then-set pattern that is not atomic.
	// This test ensures atomicity under high concurrency.
	// ═══════════════════════════════════════════════════════════════════════════
	describe("TOCTOU Race Condition Fix", () => {
		it("should guarantee exactly one winner under high concurrency stress", async () => {
			// RED: This test exposes the TOCTOU race condition
			// Under high concurrency, the check (holderId !== null) and set (holderId = uuid)
			// are not atomic, allowing multiple acquires to succeed
			const lock = new WriterLockModule.WriterLock();

			// Fire 100 concurrent acquires to stress the race window
			const promises = Array.from({ length: 100 }, () => lock.acquire());
			const results = await Promise.all(promises);

			// Count successes
			const successes = results.filter((r) => r === true).length;

			// CRITICAL: Exactly one should succeed (atomic guarantee)
			expect(successes).toBe(1);

			await lock.release();
		});

		it("should use atomic acquireQueued for safe concurrent access", async () => {
			// RED: acquireQueued should be the safe alternative to acquire()
			const lock = new WriterLockModule.WriterLock();

			const executionOrder: number[] = [];
			let counter = 0;

			// Fire 10 concurrent acquireQueued calls
			const promises = Array.from({ length: 10 }, (_, i) =>
				lock.acquireQueued().then((acquired) => {
					if (acquired) {
						const myOrder = ++counter;
						executionOrder.push(myOrder);
						// Simulate work
						return new Promise<void>((resolve) => {
							setTimeout(() => {
								lock.release().then(() => resolve());
							}, 5);
						});
					}
				}),
			);

			await Promise.all(promises);

			// All 10 should have executed in sequence
			expect(executionOrder).toHaveLength(10);
			// Order should be sequential (queued execution)
			expect(executionOrder).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
		});
	});
});
