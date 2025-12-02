/**
 * @fileoverview TDD RED - Tests for TimeGroupingStrategy
 *
 * Tests time-based grouping logic (Recent, Yesterday, This Week, Older).
 * These tests will FAIL until we implement TimeGroupingStrategy.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { TimeGroupingStrategy } from "../../../../src/views/grouping/TimeGroupingStrategy.js";
import type { SnapshotDisplayItem } from "../../../../src/views/types.js";

describe("TimeGroupingStrategy (TDD RED)", () => {
	let strategy: TimeGroupingStrategy;

	beforeEach(() => {
		strategy = new TimeGroupingStrategy();
	});

	describe("mode property", () => {
		it('should have mode set to "time"', () => {
			expect(strategy.mode).toBe("time");
		});
	});

	describe("group() - Time-based grouping", () => {
		it('should group snapshots from today into "recent"', () => {
			const now = new Date();
			const snapshots: SnapshotDisplayItem[] = [
				createSnapshot("snap-1", now),
				createSnapshot("snap-2", new Date(now.getTime() - 30 * 60 * 1000)), // 30 min ago
			];

			const grouped = strategy.group(snapshots);

			expect(grouped.recent).toHaveLength(2);
			expect(grouped.recent[0].id).toBe("snap-1");
			expect(grouped.recent[1].id).toBe("snap-2");
			expect(grouped.yesterday).toHaveLength(0);
			expect(grouped.thisWeek).toHaveLength(0);
			expect(grouped.older).toHaveLength(0);
		});

		it('should group snapshots from yesterday into "yesterday"', () => {
			const now = new Date();
			const yesterday = new Date(now.getTime() - 25 * 60 * 60 * 1000); // 25 hours ago
			const snapshots: SnapshotDisplayItem[] = [
				createSnapshot("snap-1", yesterday),
			];

			const grouped = strategy.group(snapshots);

			expect(grouped.recent).toHaveLength(0);
			expect(grouped.yesterday).toHaveLength(1);
			expect(grouped.yesterday[0].id).toBe("snap-1");
			expect(grouped.thisWeek).toHaveLength(0);
			expect(grouped.older).toHaveLength(0);
		});

		it('should group snapshots from this week into "thisWeek"', () => {
			const now = new Date();
			const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
			const snapshots: SnapshotDisplayItem[] = [
				createSnapshot("snap-1", threeDaysAgo),
			];

			const grouped = strategy.group(snapshots);

			expect(grouped.recent).toHaveLength(0);
			expect(grouped.yesterday).toHaveLength(0);
			expect(grouped.thisWeek).toHaveLength(1);
			expect(grouped.thisWeek[0].id).toBe("snap-1");
			expect(grouped.older).toHaveLength(0);
		});

		it('should group snapshots older than a week into "older"', () => {
			const now = new Date();
			const eightDaysAgo = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);
			const snapshots: SnapshotDisplayItem[] = [
				createSnapshot("snap-1", eightDaysAgo),
			];

			const grouped = strategy.group(snapshots);

			expect(grouped.recent).toHaveLength(0);
			expect(grouped.yesterday).toHaveLength(0);
			expect(grouped.thisWeek).toHaveLength(0);
			expect(grouped.older).toHaveLength(1);
			expect(grouped.older[0].id).toBe("snap-1");
		});

		it("should correctly group mixed timestamps", () => {
			const now = new Date();
			const snapshots: SnapshotDisplayItem[] = [
				createSnapshot("snap-today", now),
				createSnapshot(
					"snap-yesterday",
					new Date(now.getTime() - 25 * 60 * 60 * 1000),
				),
				createSnapshot(
					"snap-thisweek",
					new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
				),
				createSnapshot(
					"snap-older",
					new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000),
				),
			];

			const grouped = strategy.group(snapshots);

			expect(grouped.recent).toHaveLength(1);
			expect(grouped.yesterday).toHaveLength(1);
			expect(grouped.thisWeek).toHaveLength(1);
			expect(grouped.older).toHaveLength(1);
		});

		it("should handle empty snapshot array", () => {
			const grouped = strategy.group([]);

			expect(grouped.recent).toHaveLength(0);
			expect(grouped.yesterday).toHaveLength(0);
			expect(grouped.thisWeek).toHaveLength(0);
			expect(grouped.older).toHaveLength(0);
		});

		it("should handle snapshots at midnight boundary (today vs yesterday)", () => {
			// Create a timestamp for today at 00:00:01 (just after midnight)
			const today = new Date();
			today.setHours(0, 0, 1, 0);

			// Create a timestamp for yesterday at 23:59:59 (just before midnight)
			const yesterday = new Date(today);
			yesterday.setDate(yesterday.getDate() - 1);
			yesterday.setHours(23, 59, 59, 0);

			const snapshots: SnapshotDisplayItem[] = [
				createSnapshot("snap-today", today),
				createSnapshot("snap-yesterday", yesterday),
			];

			const grouped = strategy.group(snapshots);

			expect(grouped.recent).toHaveLength(1);
			expect(grouped.recent[0].id).toBe("snap-today");
			expect(grouped.yesterday).toHaveLength(1);
			expect(grouped.yesterday[0].id).toBe("snap-yesterday");
		});
	});

	describe("getGroupLabel()", () => {
		it('should return "RECENT" for recent group', () => {
			expect(strategy.getGroupLabel("recent")).toBe("RECENT");
		});

		it('should return "YESTERDAY" for yesterday group', () => {
			expect(strategy.getGroupLabel("yesterday")).toBe("YESTERDAY");
		});

		it('should return "THIS WEEK" for this-week group', () => {
			expect(strategy.getGroupLabel("this-week")).toBe("THIS WEEK");
		});

		it('should return "OLDER" for older group', () => {
			expect(strategy.getGroupLabel("older")).toBe("OLDER");
		});
	});

	describe("getGroupIcon()", () => {
		it("should return empty string for all time groups", () => {
			expect(strategy.getGroupIcon("recent")).toBe("");
			expect(strategy.getGroupIcon("yesterday")).toBe("");
			expect(strategy.getGroupIcon("this-week")).toBe("");
			expect(strategy.getGroupIcon("older")).toBe("");
		});
	});

	describe("isExpandedByDefault()", () => {
		it('should return true for "recent" group', () => {
			expect(strategy.isExpandedByDefault("recent")).toBe(true);
		});

		it('should return false for "yesterday" group', () => {
			expect(strategy.isExpandedByDefault("yesterday")).toBe(false);
		});

		it('should return false for "this-week" group', () => {
			expect(strategy.isExpandedByDefault("this-week")).toBe(false);
		});

		it('should return false for "older" group', () => {
			expect(strategy.isExpandedByDefault("older")).toBe(false);
		});
	});

	describe("Edge cases", () => {
		it("should handle snapshots with future timestamps", () => {
			const now = new Date();
			const future = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour in future
			const snapshots: SnapshotDisplayItem[] = [
				createSnapshot("snap-future", future),
			];

			const grouped = strategy.group(snapshots);

			// Future timestamps should be treated as "recent"
			expect(grouped.recent).toHaveLength(1);
		});

		it("should handle very old snapshots", () => {
			const veryOld = new Date("2020-01-01");
			const snapshots: SnapshotDisplayItem[] = [
				createSnapshot("snap-ancient", veryOld),
			];

			const grouped = strategy.group(snapshots);

			expect(grouped.older).toHaveLength(1);
			expect(grouped.older[0].id).toBe("snap-ancient");
		});

		it("should maintain snapshot order within groups", () => {
			const now = new Date();
			const snapshots: SnapshotDisplayItem[] = [
				createSnapshot("snap-3", new Date(now.getTime() - 10 * 60 * 1000)), // 10 min ago
				createSnapshot("snap-1", new Date(now.getTime() - 5 * 60 * 1000)), // 5 min ago
				createSnapshot("snap-2", new Date(now.getTime() - 7 * 60 * 1000)), // 7 min ago
			];

			const grouped = strategy.group(snapshots);

			// Should maintain input order
			expect(grouped.recent[0].id).toBe("snap-3");
			expect(grouped.recent[1].id).toBe("snap-1");
			expect(grouped.recent[2].id).toBe("snap-2");
		});
	});
});

// Helper function to create test snapshots
function createSnapshot(id: string, timestamp: Date): SnapshotDisplayItem {
	return {
		id,
		name: `Snapshot ${id}`,
		timestamp,
		trigger: "manual",
		fileCount: 1,
		primaryFile: "test.ts",
		description: "test snapshot",
	};
}
