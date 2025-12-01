import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OperationCache } from "../../../src/performance/operationCache.js";

describe("OperationCache - Memory Leak Prevention", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.clearAllTimers();
		vi.useRealTimers();
	});

	describe("Basic Operations", () => {
		it("should store and retrieve values", () => {
			const cache = new OperationCache<string>(100, 5000);
			cache.set("key1", "value1");

			expect(cache.get("key1")).toBe("value1");
		});

		it("should return undefined for non-existent keys", () => {
			const cache = new OperationCache<string>(100, 5000);

			expect(cache.get("nonexistent")).toBeUndefined();
		});

		it("should overwrite existing keys", () => {
			const cache = new OperationCache<string>(100, 5000);
			cache.set("key1", "value1");
			cache.set("key1", "value2");

			expect(cache.get("key1")).toBe("value2");
		});

		it("should report correct size", () => {
			const cache = new OperationCache<string>(100, 5000);

			expect(cache.size()).toBe(0);
			cache.set("key1", "value1");
			expect(cache.size()).toBe(1);
			cache.set("key2", "value2");
			expect(cache.size()).toBe(2);
		});
	});

	describe("TTL Auto-Deletion", () => {
		it("should auto-delete entries after TTL expires", () => {
			const cache = new OperationCache<string>(100, 5000);
			cache.set("key1", "value1");

			expect(cache.get("key1")).toBe("value1");
			vi.advanceTimersByTime(5001);
			expect(cache.get("key1")).toBeUndefined();
		});

		it("should not delete entries before TTL expires", () => {
			const cache = new OperationCache<string>(100, 5000);
			cache.set("key1", "value1");

			vi.advanceTimersByTime(4999);
			expect(cache.get("key1")).toBe("value1");
		});

		it("should handle multiple entries with different TTLs", () => {
			const cache = new OperationCache<string>(100, 5000);
			cache.set("key1", "value1");
			vi.advanceTimersByTime(1000);
			cache.set("key2", "value2");
			vi.advanceTimersByTime(1000);
			cache.set("key3", "value3");

			// After 5001ms total, key1 should expire (5001ms since key1 was set)
			vi.advanceTimersByTime(3001);
			expect(cache.get("key1")).toBeUndefined();
			expect(cache.get("key2")).toBe("value2");
			expect(cache.get("key3")).toBe("value3");

			// After another 1000ms, key2 should expire
			vi.advanceTimersByTime(1000);
			expect(cache.get("key2")).toBeUndefined();
			expect(cache.get("key3")).toBe("value3");
		});

		it("should update TTL when overwriting a key", () => {
			const cache = new OperationCache<string>(100, 5000);
			cache.set("key1", "value1");

			vi.advanceTimersByTime(4000);
			cache.set("key1", "value2"); // Reset TTL

			vi.advanceTimersByTime(3000); // 7000ms total, but key1 TTL reset at 4000ms
			expect(cache.get("key1")).toBe("value2"); // Should still exist (only 3000ms since reset)

			vi.advanceTimersByTime(2001); // Now 5001ms since reset
			expect(cache.get("key1")).toBeUndefined();
		});
	});

	describe("Size Limiting with FIFO Eviction", () => {
		it("should enforce maximum size limit", () => {
			const cache = new OperationCache<string>(3, 5000);
			cache.set("key1", "value1");
			cache.set("key2", "value2");
			cache.set("key3", "value3");

			expect(cache.size()).toBe(3);

			cache.set("key4", "value4"); // Should evict key1

			expect(cache.size()).toBe(3);
			expect(cache.get("key1")).toBeUndefined(); // Evicted
			expect(cache.get("key2")).toBe("value2");
			expect(cache.get("key3")).toBe("value3");
			expect(cache.get("key4")).toBe("value4");
		});

		it("should evict oldest entry when limit reached (FIFO)", () => {
			const cache = new OperationCache<string>(3, 5000);
			cache.set("key1", "value1");
			cache.set("key2", "value2");
			cache.set("key3", "value3");
			cache.set("key4", "value4"); // Evict key1
			cache.set("key5", "value5"); // Evict key2

			expect(cache.get("key1")).toBeUndefined();
			expect(cache.get("key2")).toBeUndefined();
			expect(cache.get("key3")).toBe("value3");
			expect(cache.get("key4")).toBe("value4");
			expect(cache.get("key5")).toBe("value5");
		});

		it("should clear timer when evicting entries", () => {
			const cache = new OperationCache<string>(2, 5000);
			cache.set("key1", "value1");
			cache.set("key2", "value2");

			const timerCount = vi.getTimerCount();
			expect(timerCount).toBe(2); // Two active timers

			cache.set("key3", "value3"); // Should evict key1 and clear its timer

			expect(vi.getTimerCount()).toBe(2); // Still 2 timers (key2, key3)
		});
	});

	describe("Manual Deletion", () => {
		it("should delete entries manually", () => {
			const cache = new OperationCache<string>(100, 5000);
			cache.set("key1", "value1");

			const deleted = cache.delete("key1");

			expect(deleted).toBe(true);
			expect(cache.get("key1")).toBeUndefined();
			expect(cache.size()).toBe(0);
		});

		it("should return false when deleting non-existent key", () => {
			const cache = new OperationCache<string>(100, 5000);

			const deleted = cache.delete("nonexistent");

			expect(deleted).toBe(false);
		});

		it("should clear timer when manually deleting", () => {
			const cache = new OperationCache<string>(100, 5000);
			cache.set("key1", "value1");
			cache.set("key2", "value2");

			expect(vi.getTimerCount()).toBe(2);

			cache.delete("key1");

			expect(vi.getTimerCount()).toBe(1); // Only key2 timer remains
		});
	});

	describe("Clear All Operations", () => {
		it("should clear all entries", () => {
			const cache = new OperationCache<string>(100, 5000);
			cache.set("key1", "value1");
			cache.set("key2", "value2");
			cache.set("key3", "value3");

			cache.clear();

			expect(cache.size()).toBe(0);
			expect(cache.get("key1")).toBeUndefined();
			expect(cache.get("key2")).toBeUndefined();
			expect(cache.get("key3")).toBeUndefined();
		});

		it("should clear all timers when clearing cache", () => {
			const cache = new OperationCache<string>(100, 5000);
			cache.set("key1", "value1");
			cache.set("key2", "value2");
			cache.set("key3", "value3");

			expect(vi.getTimerCount()).toBe(3);

			cache.clear();

			expect(vi.getTimerCount()).toBe(0);
		});
	});

	describe("Memory Leak Prevention", () => {
		it("should not grow unbounded with 1000 operations", () => {
			const cache = new OperationCache<string>(500, 5000);

			// Add 1000 operations
			for (let i = 0; i < 1000; i++) {
				cache.set(`key${i}`, `value${i}`);
			}

			// Cache should be limited to 500 entries
			expect(cache.size()).toBe(500);

			// First 500 entries should be evicted (FIFO)
			expect(cache.get("key0")).toBeUndefined();
			expect(cache.get("key499")).toBeUndefined();

			// Last 500 entries should exist
			expect(cache.get("key500")).toBe("value500");
			expect(cache.get("key999")).toBe("value999");
		});

		it("should not accumulate timers beyond max size", () => {
			const cache = new OperationCache<string>(100, 5000);

			// Add 500 operations
			for (let i = 0; i < 500; i++) {
				cache.set(`key${i}`, `value${i}`);
			}

			// Should only have 100 active timers (matching cache size)
			expect(vi.getTimerCount()).toBe(100);
		});

		it("should handle TTL cleanup preventing memory leaks over time", () => {
			const cache = new OperationCache<string>(500, 1000); // 1 second TTL

			// Add 1000 operations
			for (let i = 0; i < 1000; i++) {
				cache.set(`key${i}`, `value${i}`);
			}

			expect(cache.size()).toBe(500);

			// Advance time past TTL
			vi.advanceTimersByTime(1001);

			// All entries should be expired
			expect(cache.size()).toBe(0);

			// Add more operations
			for (let i = 1000; i < 1500; i++) {
				cache.set(`key${i}`, `value${i}`);
			}

			// Should still be limited to 500
			expect(cache.size()).toBe(500);
		});
	});

	describe("Complex Type Support", () => {
		it("should support object values", () => {
			interface TestData {
				name: string;
				count: number;
			}

			const cache = new OperationCache<TestData>(100, 5000);
			const data: TestData = { name: "test", count: 42 };

			cache.set("key1", data);

			const retrieved = cache.get("key1");
			expect(retrieved).toEqual(data);
			expect(retrieved?.name).toBe("test");
			expect(retrieved?.count).toBe(42);
		});

		it("should support array values", () => {
			const cache = new OperationCache<number[]>(100, 5000);
			const arr = [1, 2, 3, 4, 5];

			cache.set("key1", arr);

			expect(cache.get("key1")).toEqual(arr);
		});
	});

	describe("Edge Cases", () => {
		it("should handle zero max size gracefully", () => {
			const cache = new OperationCache<string>(0, 5000);
			cache.set("key1", "value1");

			// Should not store anything
			expect(cache.size()).toBe(0);
			expect(cache.get("key1")).toBeUndefined();
		});

		it("should handle size of 1", () => {
			const cache = new OperationCache<string>(1, 5000);
			cache.set("key1", "value1");

			expect(cache.size()).toBe(1);
			expect(cache.get("key1")).toBe("value1");

			cache.set("key2", "value2");

			expect(cache.size()).toBe(1);
			expect(cache.get("key1")).toBeUndefined();
			expect(cache.get("key2")).toBe("value2");
		});

		it("should handle immediate TTL expiration", () => {
			const cache = new OperationCache<string>(100, 0);
			cache.set("key1", "value1");

			vi.advanceTimersByTime(1);

			expect(cache.get("key1")).toBeUndefined();
		});
	});
});
