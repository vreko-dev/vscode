/**
 * TreeItemBadgeProvider Unit Tests
 *
 * TDD Phase: RED - Write failing tests first
 *
 * This utility provides badge management for tree items with:
 * - "NEW" badge for recently created snapshots
 * - Time-decay logic (badge fades after configurable duration)
 * - Badge priority/stacking (NEW vs WARNING)
 * - Auto-refresh callback when badges expire
 * - Performance optimization for 100+ items
 * - ThemeColor fallback for accessibility
 *
 * @see TDD_CORE.md for test-first principles
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as vscode from "vscode";

// Import the utility we're about to create (will fail until implemented)
import {
	type BadgeConfig,
	type BadgeState,
	type BadgeType,
	TreeItemBadgeProvider,
	createTreeItemBadgeProvider,
	BADGE_PRESETS,
	DEFAULT_BADGE_CONFIG,
} from "@vscode/utils/treeItemBadgeProvider";

// IMPORTANT: DO NOT re-mock vscode here!
// The global setup.ts provides a complete vscode mock.
// Use vi.mocked() to override specific methods if needed.

describe("TreeItemBadgeProvider", () => {
	let badgeProvider: TreeItemBadgeProvider;
	let mockRefreshCallback: ReturnType<typeof vi.fn>;
	let mockGetConfiguration: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		vi.useFakeTimers();
		vi.clearAllMocks();

		mockRefreshCallback = vi.fn();

		// Setup configuration mock
		mockGetConfiguration = vi.fn().mockReturnValue({
			get: vi.fn().mockImplementation((key: string, defaultValue: unknown) => {
				if (key === "newBadgeDurationMinutes") return 5;
				if (key === "staleBadgeDurationHours") return 24;
				return defaultValue;
			}),
		});

		const vscode = await import("vscode");
		(vscode.workspace.getConfiguration as ReturnType<typeof vi.fn>) =
			mockGetConfiguration;

		badgeProvider = createTreeItemBadgeProvider({
			onRefreshNeeded: mockRefreshCallback,
		});
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
		badgeProvider.dispose();
	});

	// ==================== NEW BADGE TESTS ====================

	describe("NEW badge", () => {
		it("should return NEW badge for snapshots created within decay duration", () => {
			const now = Date.now();
			const createdAt = now - 60_000; // 1 minute ago

			const badge = badgeProvider.getBadge(createdAt);

			expect(badge).toBeDefined();
			expect(badge?.type).toBe("new");
			expect(badge?.text).toBe("NEW");
		});

		it("should not return NEW badge for snapshots older than decay duration", () => {
			const now = Date.now();
			const createdAt = now - 10 * 60_000; // 10 minutes ago (> 5 min default)

			const badge = badgeProvider.getBadge(createdAt);

			// Should not have NEW badge (may have other badge or none)
			expect(badge?.type).not.toBe("new");
		});

		it("should use configurable decay duration", () => {
			// Create provider with 10 minute decay
			const customProvider = createTreeItemBadgeProvider({
				config: { newBadgeDurationMs: 10 * 60_000 },
				onRefreshNeeded: mockRefreshCallback,
			});

			const now = Date.now();
			const createdAt = now - 7 * 60_000; // 7 minutes ago

			const badge = customProvider.getBadge(createdAt);

			expect(badge?.type).toBe("new");
			customProvider.dispose();
		});

		it("should show NEW badge for just-created items", () => {
			const now = Date.now();
			const createdAt = now - 100; // 100ms ago

			const badge = badgeProvider.getBadge(createdAt);

			expect(badge?.type).toBe("new");
		});
	});

	// ==================== TIME DECAY & AUTO-REFRESH ====================

	describe("time decay and auto-refresh", () => {
		it("should trigger refresh callback when NEW badge expires", () => {
			const now = Date.now();
			const createdAt = now - 4 * 60_000; // 4 minutes ago

			// Register the snapshot for tracking
			badgeProvider.trackSnapshot("snap-1", createdAt);

			// Badge should be NEW now
			expect(badgeProvider.getBadge(createdAt)?.type).toBe("new");

			// Advance time past decay threshold (5 min default)
			vi.advanceTimersByTime(2 * 60_000); // +2 minutes = 6 minutes total

			// Refresh should have been triggered
			expect(mockRefreshCallback).toHaveBeenCalled();
		});

		it("should schedule refresh for exact decay time", () => {
			const now = Date.now();
			const createdAt = now - 4 * 60_000; // 4 minutes ago
			const remainingMs = 1 * 60_000; // 1 minute until decay

			badgeProvider.trackSnapshot("snap-2", createdAt);

			// Advance just before decay
			vi.advanceTimersByTime(remainingMs - 100);
			expect(mockRefreshCallback).not.toHaveBeenCalled();

			// Cross the threshold
			vi.advanceTimersByTime(200);
			expect(mockRefreshCallback).toHaveBeenCalled();
		});

		it("should not leak timers - cleanup on dispose", () => {
			const now = Date.now();

			// Track multiple snapshots
			badgeProvider.trackSnapshot("snap-1", now - 60_000);
			badgeProvider.trackSnapshot("snap-2", now - 120_000);
			badgeProvider.trackSnapshot("snap-3", now - 180_000);

			// Dispose provider
			badgeProvider.dispose();

			// Advance time - should not trigger refresh
			vi.advanceTimersByTime(10 * 60_000);
			expect(mockRefreshCallback).not.toHaveBeenCalled();
		});

		it("should handle multiple pending expirations efficiently", () => {
			const now = Date.now();

			// Track many snapshots with different creation times
			for (let i = 0; i < 10; i++) {
				badgeProvider.trackSnapshot(`snap-${i}`, now - i * 30_000);
			}

			// Should consolidate into efficient batch refresh, not 10 separate timers
			const timerCount = badgeProvider.getPendingTimerCount();
			expect(timerCount).toBeLessThanOrEqual(10); // At most one per unique expiry
		});
	});

	// ==================== BADGE PRIORITY / STACKING ====================

	describe("badge priority and stacking", () => {
		it("should prioritize WARNING over NEW", () => {
			const now = Date.now();
			const createdAt = now - 60_000; // 1 minute ago (would be NEW)

			const badge = badgeProvider.getBadgeWithContext(createdAt, {
				hasWarning: true,
			});

			expect(badge?.type).toBe("warning");
		});

		it("should prioritize ERROR over WARNING", () => {
			const now = Date.now();
			const createdAt = now - 60_000;

			const badge = badgeProvider.getBadgeWithContext(createdAt, {
				hasWarning: true,
				hasError: true,
			});

			expect(badge?.type).toBe("error");
		});

		it("should show NEW when no other priority badges", () => {
			const now = Date.now();
			const createdAt = now - 60_000;

			const badge = badgeProvider.getBadgeWithContext(createdAt, {
				hasWarning: false,
				hasError: false,
			});

			expect(badge?.type).toBe("new");
		});

		it("should return undefined when no badges apply", () => {
			const now = Date.now();
			const createdAt = now - 60 * 60_000; // 60 minutes ago (not NEW, not STALE yet)

			const badge = badgeProvider.getBadgeWithContext(createdAt, {
				hasWarning: false,
				hasError: false,
			});

			// Old enough to not be NEW, not old enough to be STALE
			expect(badge).toBeUndefined();
		});
	});

	// ==================== STALE BADGE ====================

	describe("STALE badge", () => {
		it("should return STALE badge for old snapshots", () => {
			const now = Date.now();
			const createdAt = now - 48 * 60 * 60_000; // 48 hours ago

			const badge = badgeProvider.getBadge(createdAt);

			expect(badge?.type).toBe("stale");
		});

		it("should use configurable stale threshold", () => {
			const customProvider = createTreeItemBadgeProvider({
				config: { staleBadgeDurationMs: 12 * 60 * 60_000 }, // 12 hours
				onRefreshNeeded: mockRefreshCallback,
			});

			const now = Date.now();
			const createdAt = now - 15 * 60 * 60_000; // 15 hours ago

			const badge = customProvider.getBadge(createdAt);

			expect(badge?.type).toBe("stale");
			customProvider.dispose();
		});
	});

	// ==================== PERFORMANCE ====================

	describe("performance with 100+ items", () => {
		it("should calculate badges for 100 items in under 10ms", () => {
			const now = Date.now();
			const items = Array.from({ length: 100 }, (_, i) => ({
				id: `snap-${i}`,
				createdAt: now - i * 60_000, // Spread across 100 minutes
			}));

			const start = performance.now();
			for (const item of items) {
				badgeProvider.getBadge(item.createdAt);
			}
			const duration = performance.now() - start;

			expect(duration).toBeLessThan(10);
		});

		it("should use batch processing for multiple items", () => {
			const now = Date.now();
			const timestamps = Array.from({ length: 50 }, (_, i) => now - i * 60_000);

			const badges = badgeProvider.getBadgesBatch(timestamps);

			expect(badges).toHaveLength(50);
			expect(badges[0]?.type).toBe("new"); // Most recent
		});

		it("should cache badge calculations when timestamp unchanged", () => {
			const createdAt = Date.now() - 60_000;

			// First call
			const badge1 = badgeProvider.getBadge(createdAt);
			// Second call with same timestamp
			const badge2 = badgeProvider.getBadge(createdAt);

			// Should return same reference (cached)
			expect(badge1).toBe(badge2);
		});
	});

	// ==================== THEMECOLOR FALLBACK ====================

	describe("ThemeColor fallback", () => {
		it("should use charts.green for NEW badge", () => {
			expect(BADGE_PRESETS.new.themeColorId).toBe("charts.green");
		});

		it("should use charts.yellow for WARNING badge", () => {
			expect(BADGE_PRESETS.warning.themeColorId).toBe("charts.yellow");
		});

		it("should use charts.red for ERROR badge", () => {
			expect(BADGE_PRESETS.error.themeColorId).toBe("charts.red");
		});

		it("should use editorGutter.commentRangeForeground for STALE badge", () => {
			expect(BADGE_PRESETS.stale.themeColorId).toBe(
				"editorGutter.commentRangeForeground",
			);
		});

		it("should create ThemeColor for badge color", () => {
			const now = Date.now();
			const createdAt = now - 60_000;

			const badge = badgeProvider.getBadge(createdAt);

			expect(badge?.color).toBeDefined();
			// ThemeColor is mocked - verify it's truthy (color object created)
			expect(badge?.type).toBe("new");
		});
	});

	// ==================== CONFIGURABLE DECAY DURATION ====================

	describe("configurable decay duration", () => {
		it("should read newBadgeDurationMinutes from settings", () => {
			mockGetConfiguration.mockReturnValue({
				get: vi.fn().mockImplementation((key: string) => {
					if (key === "newBadgeDurationMinutes") return 10;
					return undefined;
				}),
			});

			const configuredProvider = createTreeItemBadgeProvider({
				onRefreshNeeded: mockRefreshCallback,
			});

			// Provider should use 10 minutes from config
			expect(configuredProvider.getConfig().newBadgeDurationMs).toBe(
				10 * 60_000,
			);
			configuredProvider.dispose();
		});

		it("should use default when setting not configured", () => {
			mockGetConfiguration.mockReturnValue({
				get: vi.fn().mockReturnValue(undefined),
			});

			const defaultProvider = createTreeItemBadgeProvider({
				onRefreshNeeded: mockRefreshCallback,
			});

			expect(defaultProvider.getConfig().newBadgeDurationMs).toBe(
				DEFAULT_BADGE_CONFIG.newBadgeDurationMs,
			);
			defaultProvider.dispose();
		});

		it("should allow runtime config update", () => {
			const now = Date.now();
			const createdAt = now - 7 * 60_000; // 7 minutes ago

			// Initially no NEW badge (5 min default)
			expect(badgeProvider.getBadge(createdAt)?.type).not.toBe("new");

			// Update config to 10 minutes
			badgeProvider.updateConfig({ newBadgeDurationMs: 10 * 60_000 });

			// Now should show NEW badge
			expect(badgeProvider.getBadge(createdAt)?.type).toBe("new");
		});
	});

	// ==================== EDGE CASES ====================

	describe("edge cases", () => {
		it("should handle future timestamps gracefully", () => {
			const futureTime = Date.now() + 60_000; // 1 minute in future

			const badge = badgeProvider.getBadge(futureTime);

			// Should treat as NEW (just created)
			expect(badge?.type).toBe("new");
		});

		it("should handle zero timestamp", () => {
			expect(() => badgeProvider.getBadge(0)).not.toThrow();
		});

		it("should handle negative timestamp", () => {
			expect(() => badgeProvider.getBadge(-1)).not.toThrow();
		});

		it("should handle very old timestamps (epoch)", () => {
			const badge = badgeProvider.getBadge(1); // Near Unix epoch

			expect(badge?.type).toBe("stale");
		});

		it("should untrack disposed snapshots", () => {
			const now = Date.now();
			badgeProvider.trackSnapshot("snap-1", now - 60_000);

			expect(badgeProvider.getTrackedCount()).toBe(1);

			badgeProvider.untrackSnapshot("snap-1");

			expect(badgeProvider.getTrackedCount()).toBe(0);
		});
	});

	// ==================== INTEGRATION WITH TREE ITEMS ====================

	describe("tree item integration", () => {
		it("should provide badge decoration object", () => {
			const now = Date.now();
			const createdAt = now - 60_000;

			const decoration = badgeProvider.getTreeItemBadge(createdAt);

			expect(decoration).toHaveProperty("badge");
			expect(decoration).toHaveProperty("tooltip");
		});

		it("should format tooltip with creation time", () => {
			const now = Date.now();
			const createdAt = now - 60_000;

			const decoration = badgeProvider.getTreeItemBadge(createdAt);

			expect(decoration?.tooltip).toContain("Created");
		});

		it("should return undefined decoration when no badge applies", () => {
			const now = Date.now();
			const createdAt = now - 30 * 60_000; // 30 min ago - no badge

			const decoration = badgeProvider.getTreeItemBadge(createdAt);

			expect(decoration).toBeUndefined();
		});
	});
});

// ==================== TYPE TESTS ====================

describe("BadgeConfig types", () => {
	it("should have required config fields", () => {
		const config: BadgeConfig = {
			newBadgeDurationMs: 300_000,
			staleBadgeDurationMs: 86_400_000,
		};
		expect(config.newBadgeDurationMs).toBe(300_000);
	});
});

describe("BadgeState types", () => {
	it("should define badge state structure", () => {
		const state: BadgeState = {
			type: "new",
			text: "NEW",
			color: { id: "charts.green" } as vscode.ThemeColor,
		};
		expect(state.type).toBe("new");
	});
});

describe("BadgeType enum", () => {
	it("should include all badge types", () => {
		const types: BadgeType[] = ["new", "stale", "warning", "error"];
		expect(types).toHaveLength(4);
	});
});
