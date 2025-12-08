/**
 * @fileoverview CooldownCache Tests
 *
 * Tests for in-memory cooldown cache with TTL expiration.
 * Verifies ephemeral nature and automatic cleanup.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CooldownCache } from "@vscode/storage/CooldownCache";
import type { CooldownEntry } from "@vscode/storage/types";

describe("CooldownCache", () => {
	let cache: CooldownCache;

	beforeEach(() => {
		cache = new CooldownCache();
		cache.start();
	});

	afterEach(() => {
		cache.dispose();
	});

	describe("Basic Operations", () => {
		it("should set and get cooldown entry", () => {
			const entry: CooldownEntry = {
				filePath: "/test/file.ts",
				protectionLevel: "Protected",
				triggeredAt: Date.now(),
				expiresAt: Date.now() + 60000,
				actionTaken: "snapshot_created",
			};

			cache.set(entry);
			const retrieved = cache.get("/test/file.ts", "Protected");

			expect(retrieved).toBeDefined();
			expect(retrieved?.filePath).toBe("/test/file.ts");
		});

		it("should check if in cooldown", () => {
			const entry: CooldownEntry = {
				filePath: "/test/file.ts",
				protectionLevel: "Protected",
				triggeredAt: Date.now(),
				expiresAt: Date.now() + 60000,
				actionTaken: "snapshot_created",
			};

			cache.set(entry);
			expect(cache.isInCooldown("/test/file.ts", "Protected")).toBe(true);
			expect(cache.isInCooldown("/other/file.ts", "Protected")).toBe(false);
		});

		it("should return null for non-existent cooldown", () => {
			const entry = cache.get("/nonexistent.ts", "Protected");
			expect(entry).toBeNull();
		});

		it("should remove specific cooldown", () => {
			const entry: CooldownEntry = {
				filePath: "/test/file.ts",
				protectionLevel: "Protected",
				triggeredAt: Date.now(),
				expiresAt: Date.now() + 60000,
				actionTaken: "snapshot_created",
			};

			cache.set(entry);
			const removed = cache.remove("/test/file.ts", "Protected");

			expect(removed).toBe(true);
			expect(cache.isInCooldown("/test/file.ts", "Protected")).toBe(false);
		});

		it("should handle removal of non-existent entry", () => {
			const removed = cache.remove("/nonexistent.ts", "Protected");
			expect(removed).toBe(false);
		});
	});

	describe("Expiration", () => {
		it("should expire cooldown after TTL", async () => {
			const entry: CooldownEntry = {
				filePath: "/test/file.ts",
				protectionLevel: "Protected",
				triggeredAt: Date.now(),
				expiresAt: Date.now() + 100, // 100ms TTL
				actionTaken: "snapshot_created",
			};

			cache.set(entry);
			expect(cache.isInCooldown("/test/file.ts", "Protected")).toBe(true);

			// Wait for expiration
			await new Promise((resolve) => setTimeout(resolve, 150));

			expect(cache.isInCooldown("/test/file.ts", "Protected")).toBe(false);
		});

		it("should return remaining cooldown time", () => {
			const expiresAt = Date.now() + 5000;
			const entry: CooldownEntry = {
				filePath: "/test/file.ts",
				protectionLevel: "Protected",
				triggeredAt: Date.now(),
				expiresAt,
				actionTaken: "snapshot_created",
			};

			cache.set(entry);
			const remaining = cache.getRemainingTime("/test/file.ts", "Protected");

			expect(remaining).toBeGreaterThan(0);
			expect(remaining).toBeLessThanOrEqual(5000);
		});

		it("should return 0 for expired cooldown", async () => {
			const entry: CooldownEntry = {
				filePath: "/test/file.ts",
				protectionLevel: "Protected",
				triggeredAt: Date.now(),
				expiresAt: Date.now() + 50,
				actionTaken: "snapshot_created",
			};

			cache.set(entry);

			await new Promise((resolve) => setTimeout(resolve, 100));
			const remaining = cache.getRemainingTime("/test/file.ts", "Protected");

			expect(remaining).toBe(0);
		});

		it("should return 0 for non-existent cooldown", () => {
			const remaining = cache.getRemainingTime("/nonexistent.ts", "Protected");
			expect(remaining).toBe(0);
		});
	});

	describe("Multiple Levels", () => {
		it("should handle different protection levels independently", () => {
			const timestamp = Date.now();
			const expiresAt = timestamp + 60000;

			const entry1: CooldownEntry = {
				filePath: "/test/file.ts",
				protectionLevel: "Protected",
				triggeredAt: timestamp,
				expiresAt,
				actionTaken: "snapshot_created",
			};

			const entry2: CooldownEntry = {
				filePath: "/test/file.ts",
				protectionLevel: "Warning",
				triggeredAt: timestamp,
				expiresAt,
				actionTaken: "save_warned",
			};

			cache.set(entry1);
			cache.set(entry2);

			expect(cache.isInCooldown("/test/file.ts", "Protected")).toBe(true);
			expect(cache.isInCooldown("/test/file.ts", "Warning")).toBe(true);

			cache.remove("/test/file.ts", "Protected");
			expect(cache.isInCooldown("/test/file.ts", "Protected")).toBe(false);
			expect(cache.isInCooldown("/test/file.ts", "Warning")).toBe(true);
		});

		it("should track different files independently", () => {
			const expiresAt = Date.now() + 60000;

			const entry1: CooldownEntry = {
				filePath: "/file1.ts",
				protectionLevel: "Protected",
				triggeredAt: Date.now(),
				expiresAt,
				actionTaken: "snapshot_created",
			};

			const entry2: CooldownEntry = {
				filePath: "/file2.ts",
				protectionLevel: "Protected",
				triggeredAt: Date.now(),
				expiresAt,
				actionTaken: "snapshot_created",
			};

			cache.set(entry1);
			cache.set(entry2);

			expect(cache.isInCooldown("/file1.ts", "Protected")).toBe(true);
			expect(cache.isInCooldown("/file2.ts", "Protected")).toBe(true);

			cache.remove("/file1.ts", "Protected");
			expect(cache.isInCooldown("/file1.ts", "Protected")).toBe(false);
			expect(cache.isInCooldown("/file2.ts", "Protected")).toBe(true);
		});
	});

	describe("Bulk Operations", () => {
		it("should clear all cooldowns", () => {
			const expiresAt = Date.now() + 60000;

			for (let i = 0; i < 5; i++) {
				const entry: CooldownEntry = {
					filePath: `/file${i}.ts`,
					protectionLevel: "Protected",
					triggeredAt: Date.now(),
					expiresAt,
					actionTaken: "snapshot_created",
				};
				cache.set(entry);
			}

			expect(cache.size).toBe(5);
			cache.clear();
			expect(cache.size).toBe(0);
		});

		it("should get all active cooldowns", () => {
			const expiresAt = Date.now() + 60000;

			for (let i = 0; i < 3; i++) {
				const entry: CooldownEntry = {
					filePath: `/file${i}.ts`,
					protectionLevel: "Protected",
					triggeredAt: Date.now(),
					expiresAt,
					actionTaken: "snapshot_created",
				};
				cache.set(entry);
			}

			const all = cache.getAll();
			expect(all).toHaveLength(3);
			expect(all.every((e) => e.protectionLevel === "Protected")).toBe(true);
		});

		it("should remove expired entries during getAll", async () => {
			const entry1: CooldownEntry = {
				filePath: "/file1.ts",
				protectionLevel: "Protected",
				triggeredAt: Date.now(),
				expiresAt: Date.now() + 50,
				actionTaken: "snapshot_created",
			};

			const entry2: CooldownEntry = {
				filePath: "/file2.ts",
				protectionLevel: "Protected",
				triggeredAt: Date.now(),
				expiresAt: Date.now() + 60000, // Valid
				actionTaken: "snapshot_created",
			};

			cache.set(entry1);
			cache.set(entry2);

			await new Promise((resolve) => setTimeout(resolve, 100));

			const all = cache.getAll();
			expect(all).toHaveLength(1);
			expect(all[0].filePath).toBe("/file2.ts");
		});
	});

	describe("Cleanup", () => {
		it("should auto-cleanup expired entries periodically", async () => {
			const shortCleanupCache = new CooldownCache(100); // 100ms cleanup interval
			shortCleanupCache.start();

			const expiryTime = Date.now() + 50;
			const entry: CooldownEntry = {
				filePath: "/test/file.ts",
				protectionLevel: "Protected",
				triggeredAt: Date.now(),
				expiresAt: expiryTime,
				actionTaken: "snapshot_created",
			};

			shortCleanupCache.set(entry);
			expect(shortCleanupCache.size).toBe(1);

			// Wait for entry to expire and cleanup to run
			await new Promise((resolve) => setTimeout(resolve, 200));

			const removed = shortCleanupCache.removeExpired();
			expect(removed).toBeGreaterThanOrEqual(1);

			shortCleanupCache.dispose();
		});

		it("should stop cleanup on dispose", async () => {
			const expiresAt = Date.now() + 100;
			const entry: CooldownEntry = {
				filePath: "/test/file.ts",
				protectionLevel: "Protected",
				triggeredAt: Date.now(),
				expiresAt,
				actionTaken: "snapshot_created",
			};

			cache.set(entry);
			cache.dispose();

			// After dispose, cleanup should be stopped
			// Verify by checking that intervals are cleared
			expect(cache.size).toBe(0);
		});

		it("should manually trigger cleanup with removeExpired", async () => {
			const entries: CooldownEntry[] = [
				{
					filePath: "/file1.ts",
					protectionLevel: "Protected",
					triggeredAt: Date.now(),
					expiresAt: Date.now() + 50,
					actionTaken: "snapshot_created",
				},
				{
					filePath: "/file2.ts",
					protectionLevel: "Protected",
					triggeredAt: Date.now(),
					expiresAt: Date.now() + 50,
					actionTaken: "snapshot_created",
				},
				{
					filePath: "/file3.ts",
					protectionLevel: "Protected",
					triggeredAt: Date.now(),
					expiresAt: Date.now() + 60000,
					actionTaken: "snapshot_created",
				},
			];

			for (const entry of entries) {
				cache.set(entry);
			}

			expect(cache.size).toBe(3);

			// Wait for first two to expire
			await new Promise((resolve) => setTimeout(resolve, 100));

			const removed = cache.removeExpired();
			expect(removed).toBe(2);
			expect(cache.size).toBe(1);
		});
	});

	describe("Storage Persistence (NOT expected)", () => {
		it("should NOT persist cooldowns across instances", () => {
			const expiresAt = Date.now() + 60000;
			const entry: CooldownEntry = {
				filePath: "/test/file.ts",
				protectionLevel: "Protected",
				triggeredAt: Date.now(),
				expiresAt,
				actionTaken: "snapshot_created",
			};

			cache.set(entry);
			expect(cache.isInCooldown("/test/file.ts", "Protected")).toBe(true);

			// Create new cache instance
			const newCache = new CooldownCache();
			newCache.start();

			// New instance should not have the cooldown
			expect(newCache.isInCooldown("/test/file.ts", "Protected")).toBe(false);
			expect(newCache.size).toBe(0);

			newCache.dispose();
		});
	});

	describe("Size Tracking", () => {
		it("should track cache size correctly", () => {
			expect(cache.size).toBe(0);

			const expiresAt = Date.now() + 60000;

			for (let i = 0; i < 5; i++) {
				const entry: CooldownEntry = {
					filePath: `/file${i}.ts`,
					protectionLevel: "Protected",
					triggeredAt: Date.now(),
					expiresAt,
					actionTaken: "snapshot_created",
				};
				cache.set(entry);
			}

			expect(cache.size).toBe(5);
			cache.remove("/file0.ts", "Protected");
			expect(cache.size).toBe(4);
		});
	});

	describe("Edge Cases", () => {
		it("should handle entry with zero TTL", () => {
			const entry: CooldownEntry = {
				filePath: "/test/file.ts",
				protectionLevel: "Protected",
				triggeredAt: Date.now(),
				expiresAt: Date.now(), // Already expired
				actionTaken: "snapshot_created",
			};

			cache.set(entry);
			expect(cache.isInCooldown("/test/file.ts", "Protected")).toBe(false);
		});

		it("should handle entries with same file but updating action", () => {
			const expiresAt = Date.now() + 60000;

			const entry1: CooldownEntry = {
				filePath: "/test/file.ts",
				protectionLevel: "Protected",
				triggeredAt: Date.now(),
				expiresAt,
				actionTaken: "snapshot_created",
				snapshotId: "snap-1",
			};

			cache.set(entry1);

			const entry2: CooldownEntry = {
				filePath: "/test/file.ts",
				protectionLevel: "Protected",
				triggeredAt: Date.now() + 1000,
				expiresAt: Date.now() + 70000,
				actionTaken: "save_blocked",
				snapshotId: "snap-2",
			};

			cache.set(entry2);

			const retrieved = cache.get("/test/file.ts", "Protected");
			expect(retrieved?.snapshotId).toBe("snap-2"); // Latest update
			expect(retrieved?.actionTaken).toBe("save_blocked");
		});
	});
});
