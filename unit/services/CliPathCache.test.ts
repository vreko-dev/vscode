/**
 * CLI Path Cache Tests
 *
 * Tests the LRU+TTL cache pattern for CLI path discovery.
 * Pattern: packages/intelligence/test/brain/daemon.test.ts (vitest fake timers)
 */

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from "vitest";
import { CliPathCache, getCliPathCache } from "../../../src/services/CliPathCache";

// Mock node:fs
const mockExistsSync = vi.fn();
vi.mock("node:fs", () => ({
	existsSync: mockExistsSync,
}));

// Mock logger
vi.mock("../../../src/utils/logger", () => ({
	logger: {
		info: vi.fn(),
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}));

describe("CliPathCache", () => {
	let cache: CliPathCache;

	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();
		// Reset singleton between tests
		cache = new CliPathCache();
		mockExistsSync.mockReturnValue(true); // Default: CLI exists
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("Cache hit behavior", () => {
		it("should cache CLI path on first discovery", () => {
			mockExistsSync.mockReturnValue(true);

			const path = cache.get();
			expect(path).toBeTruthy();

			// Clear mock to verify no fs checks on second call
			mockExistsSync.mockClear();

			// Second call should return cached value (no fs checks)
			const cachedPath = cache.get();
			expect(cachedPath).toBe(path);
			expect(mockExistsSync).not.toHaveBeenCalled();
		});

		it("should return cached path within TTL (5min)", () => {
			const path = cache.get();
			expect(path).toBeTruthy();

			mockExistsSync.mockClear();

			// Advance time but stay within TTL
			vi.advanceTimersByTime(4 * 60 * 1000); // 4 minutes

			const cachedPath = cache.get();
			expect(cachedPath).toBe(path);
			expect(mockExistsSync).not.toHaveBeenCalled(); // Still cached
		});
	});

	describe("Cache miss behavior", () => {
		it("should expire cache after TTL (5min)", () => {
			const path = cache.get();
			expect(path).toBeTruthy();

			// Advance time past TTL
			vi.advanceTimersByTime(6 * 60 * 1000); // 6 minutes

			mockExistsSync.mockClear();

			// Should rediscover (cache expired)
			const newPath = cache.get();
			expect(newPath).toBeTruthy();
			expect(mockExistsSync).toHaveBeenCalled(); // Filesystem check performed
		});

		it("should return null and not cache if CLI not found", () => {
			// Mock fs.existsSync to return false for all paths
			mockExistsSync.mockReturnValue(false);

			const path = cache.get();
			expect(path).toBeNull();

			mockExistsSync.mockClear();

			// Verify cache wasn't populated with null - should re-check
			const secondCall = cache.get();
			expect(secondCall).toBeNull();
			expect(mockExistsSync).toHaveBeenCalled(); // Should re-check, not return stale null
		});
	});

	describe("Manual invalidation", () => {
		it("should invalidate cache manually", () => {
			cache.get(); // Populate cache
			cache.invalidate();

			mockExistsSync.mockClear();

			// Next call should rediscover (cache was cleared)
			const path = cache.get();
			expect(path).toBeTruthy();
			expect(mockExistsSync).toHaveBeenCalled();
		});

		it("should handle invalidation when cache is empty", () => {
			// Invalidate before any get() calls
			expect(() => cache.invalidate()).not.toThrow();
		});
	});

	describe("Singleton pattern", () => {
		it("should return the same instance from getCliPathCache", () => {
			const instance1 = getCliPathCache();
			const instance2 = getCliPathCache();

			expect(instance1).toBe(instance2);
		});
	});

	describe("CLI path discovery order", () => {
		it("should check paths in correct priority order", () => {
			const callOrder: string[] = [];

			mockExistsSync.mockImplementation((path: string) => {
				callOrder.push(path);
				return false; // Not found, keep checking
			});

			cache.get();

			// Verify paths are checked in order:
			// 1. .npm-global
			// 2. pnpm
			// 3. /usr/local/bin
			// 4. /opt/homebrew/bin
			expect(callOrder.length).toBeGreaterThan(0);
			expect(callOrder[0]).toContain(".npm-global");
		});

		it("should stop checking after first found path", () => {
			let checkCount = 0;

			mockExistsSync.mockImplementation((path: string) => {
				checkCount++;
				// Return true on second check
				return checkCount === 2;
			});

			const path = cache.get();
			expect(path).toBeTruthy();
			expect(checkCount).toBe(2); // Should stop after finding CLI
		});
	});
});
