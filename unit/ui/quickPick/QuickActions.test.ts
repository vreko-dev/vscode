/**
 * @fileoverview QuickActions Enhancement Tests - Phase 1.3
 *
 * Tests for enhancing SnapshotQuickPicker with:
 * - ISessionStatsProvider integration (session stats display)
 * - Recovery actions (restore, compare, timeline)
 *
 * TDD RED Phase: All tests should fail until implementation.
 *
 * @packageDocumentation
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as vscode from "vscode";
import type {
	ISessionStatsProvider,
	SessionStats,
} from "../../../../src/services/recovery/interfaces";

// =============================================================================
// MOCKS
// =============================================================================

// Mock vscode
vi.mock("vscode", () => ({
	window: {
		createQuickPick: vi.fn(() => ({
			title: "",
			placeholder: "",
			items: [],
			busy: false,
			matchOnDescription: false,
			matchOnDetail: false,
			show: vi.fn(),
			hide: vi.fn(),
			dispose: vi.fn(),
			onDidAccept: vi.fn(),
			onDidHide: vi.fn(),
			selectedItems: [],
		})),
	},
	commands: {
		executeCommand: vi.fn(),
	},
	QuickPickItemKind: {
		Separator: 1,
	},
	EventEmitter: vi.fn().mockImplementation(() => ({
		event: vi.fn(),
		fire: vi.fn(),
		dispose: vi.fn(),
	})),
}));

// =============================================================================
// FIXTURES
// =============================================================================

const createMockSessionStats = (overrides?: Partial<SessionStats>): SessionStats => ({
	duration: 7200000, // 2 hours
	snapshotCount: 42,
	filesModified: 15,
	linesChanged: 287,
	tokensEstimated: 6800,
	...overrides,
});

const createMockStatsProvider = (
	stats: SessionStats = createMockSessionStats(),
): ISessionStatsProvider => {
	const emitter = {
		event: vi.fn() as unknown as vscode.Event<SessionStats>,
		fire: vi.fn(),
		dispose: vi.fn(),
	};

	return {
		getStats: vi.fn().mockResolvedValue(stats),
		onStatsChanged: emitter.event,
	};
};

// =============================================================================
// TEST SUITES
// =============================================================================

describe("QuickActions Enhancement - Phase 1.3", () => {
	let mockStatsProvider: ISessionStatsProvider;

	beforeEach(() => {
		vi.clearAllMocks();
		mockStatsProvider = createMockStatsProvider();
	});

	// =========================================================================
	// STATS HEADER DISPLAY
	// =========================================================================

	describe("Session Stats Header", () => {
		it("should display session duration in compact format", async () => {
			const stats = createMockSessionStats({ duration: 7200000 }); // 2h
			mockStatsProvider = createMockStatsProvider(stats);

			// Import after mocks
			const { EnhancedQuickPicker } = await import(
				"../../../../src/ui/quickPick/EnhancedQuickPicker"
			);

			const picker = new EnhancedQuickPicker({
				statsProvider: mockStatsProvider,
			});

			const items = await picker.buildItems();
			const headerItem = items.find((i) => i.label?.includes("Session"));

			expect(headerItem).toBeDefined();
			expect(headerItem?.description).toMatch(/2h/);
		});

		it("should display snapshot count in header", async () => {
			const stats = createMockSessionStats({ snapshotCount: 42 });
			mockStatsProvider = createMockStatsProvider(stats);

			const { EnhancedQuickPicker } = await import(
				"../../../../src/ui/quickPick/EnhancedQuickPicker"
			);

			const picker = new EnhancedQuickPicker({
				statsProvider: mockStatsProvider,
			});

			const items = await picker.buildItems();
			const headerItem = items.find((i) => i.label?.includes("Session"));

			expect(headerItem?.description).toContain("42");
		});

		it("should display files modified count", async () => {
			const stats = createMockSessionStats({ filesModified: 15 });
			mockStatsProvider = createMockStatsProvider(stats);

			const { EnhancedQuickPicker } = await import(
				"../../../../src/ui/quickPick/EnhancedQuickPicker"
			);

			const picker = new EnhancedQuickPicker({
				statsProvider: mockStatsProvider,
			});

			const items = await picker.buildItems();
			const headerItem = items.find((i) => i.label?.includes("Session"));

			expect(headerItem?.description).toContain("15 files");
		});

		it("should format header as: 'Session: 2h • 42 snapshots • 15 files'", async () => {
			const stats = createMockSessionStats({
				duration: 7200000,
				snapshotCount: 42,
				filesModified: 15,
			});
			mockStatsProvider = createMockStatsProvider(stats);

			const { EnhancedQuickPicker } = await import(
				"../../../../src/ui/quickPick/EnhancedQuickPicker"
			);

			const picker = new EnhancedQuickPicker({
				statsProvider: mockStatsProvider,
			});

			const items = await picker.buildItems();
			const headerItem = items.find((i) => i.label?.includes("Session"));

			expect(headerItem?.description).toBe("2h • 42 snapshots • 15 files");
		});

		it("should handle zero stats gracefully", async () => {
			const stats = createMockSessionStats({
				duration: 0,
				snapshotCount: 0,
				filesModified: 0,
			});
			mockStatsProvider = createMockStatsProvider(stats);

			const { EnhancedQuickPicker } = await import(
				"../../../../src/ui/quickPick/EnhancedQuickPicker"
			);

			const picker = new EnhancedQuickPicker({
				statsProvider: mockStatsProvider,
			});

			const items = await picker.buildItems();
			const headerItem = items.find((i) => i.label?.includes("Session"));

			expect(headerItem).toBeDefined();
			expect(headerItem?.description).toContain("0 snapshots");
		});

		it("should show '< 1m' for durations under 1 minute", async () => {
			const stats = createMockSessionStats({ duration: 45000 }); // 45 seconds
			mockStatsProvider = createMockStatsProvider(stats);

			const { EnhancedQuickPicker } = await import(
				"../../../../src/ui/quickPick/EnhancedQuickPicker"
			);

			const picker = new EnhancedQuickPicker({
				statsProvider: mockStatsProvider,
			});

			const items = await picker.buildItems();
			const headerItem = items.find((i) => i.label?.includes("Session"));

			expect(headerItem?.description).toMatch(/< ?1m/);
		});
	});

	// =========================================================================
	// RECOVERY ACTIONS SECTION
	// =========================================================================

	describe("Recovery Actions", () => {
		it("should include 'Quick Recovery' action", async () => {
			const { EnhancedQuickPicker } = await import(
				"../../../../src/ui/quickPick/EnhancedQuickPicker"
			);

			const picker = new EnhancedQuickPicker({
				statsProvider: mockStatsProvider,
			});

			const items = await picker.buildItems();
			const quickRecoveryItem = items.find((i) =>
				i.label?.toLowerCase().includes("quick recovery"),
			);

			expect(quickRecoveryItem).toBeDefined();
			expect(quickRecoveryItem?.action).toBe("quick-recovery");
		});

		it("should include 'Open Recovery Timeline' action", async () => {
			const { EnhancedQuickPicker } = await import(
				"../../../../src/ui/quickPick/EnhancedQuickPicker"
			);

			const picker = new EnhancedQuickPicker({
				statsProvider: mockStatsProvider,
			});

			const items = await picker.buildItems();
			const timelineItem = items.find((i) =>
				i.label?.toLowerCase().includes("timeline"),
			);

			expect(timelineItem).toBeDefined();
			expect(timelineItem?.action).toBe("open-timeline");
		});

		it("should include 'Compare Recent Changes' action", async () => {
			const { EnhancedQuickPicker } = await import(
				"../../../../src/ui/quickPick/EnhancedQuickPicker"
			);

			const picker = new EnhancedQuickPicker({
				statsProvider: mockStatsProvider,
			});

			const items = await picker.buildItems();
			const compareItem = items.find((i) =>
				i.label?.toLowerCase().includes("compare"),
			);

			expect(compareItem).toBeDefined();
			expect(compareItem?.action).toBe("compare-recent");
		});

		it("should group recovery actions under 'Recovery' separator", async () => {
			const { EnhancedQuickPicker } = await import(
				"../../../../src/ui/quickPick/EnhancedQuickPicker"
			);

			const picker = new EnhancedQuickPicker({
				statsProvider: mockStatsProvider,
			});

			const items = await picker.buildItems();
			const separatorIndex = items.findIndex(
				(i) => i.kind === 1 && i.label === "Recovery",
			);

			expect(separatorIndex).toBeGreaterThan(-1);

			// Recovery actions should come after separator
			const actionsAfterSeparator = items.slice(separatorIndex + 1, separatorIndex + 4);
			expect(actionsAfterSeparator.some((i) => i.action === "quick-recovery")).toBe(true);
		});
	});

	// =========================================================================
	// ACTION HANDLERS
	// =========================================================================

	describe("Action Handlers", () => {
		it("should execute vreko.showQuickActions on quick-recovery", async () => {
			const { EnhancedQuickPicker } = await import(
				"../../../../src/ui/quickPick/EnhancedQuickPicker"
			);
			const vscode = await import("vscode");

			const picker = new EnhancedQuickPicker({
				statsProvider: mockStatsProvider,
			});

			await picker.handleAction("quick-recovery");

			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"vreko.showQuickActions",
			);
		});

		it("should execute vreko.openRecoveryTimeline on open-timeline", async () => {
			const { EnhancedQuickPicker } = await import(
				"../../../../src/ui/quickPick/EnhancedQuickPicker"
			);
			const vscode = await import("vscode");

			const picker = new EnhancedQuickPicker({
				statsProvider: mockStatsProvider,
			});

			await picker.handleAction("open-timeline");

			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"vreko.openRecoveryTimeline",
			);
		});

		it("should execute vreko.showRecentChanges on compare-recent", async () => {
			const { EnhancedQuickPicker } = await import(
				"../../../../src/ui/quickPick/EnhancedQuickPicker"
			);
			const vscode = await import("vscode");

			const picker = new EnhancedQuickPicker({
				statsProvider: mockStatsProvider,
			});

			await picker.handleAction("compare-recent");

			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"vreko.showRecentChanges",
			);
		});
	});

	// =========================================================================
	// STATS REFRESH
	// =========================================================================

	describe("Stats Refresh", () => {
		it("should subscribe to onStatsChanged", async () => {
			const { EnhancedQuickPicker } = await import(
				"../../../../src/ui/quickPick/EnhancedQuickPicker"
			);

			const picker = new EnhancedQuickPicker({
				statsProvider: mockStatsProvider,
			});

			// Should have subscribed to stats changes
			expect(mockStatsProvider.onStatsChanged).toHaveBeenCalled();
		});

		it("should refresh items when stats change", async () => {
			const { EnhancedQuickPicker } = await import(
				"../../../../src/ui/quickPick/EnhancedQuickPicker"
			);

			const picker = new EnhancedQuickPicker({
				statsProvider: mockStatsProvider,
			});

			// Spy on buildItems
			const buildItemsSpy = vi.spyOn(picker, "buildItems");

			// Simulate stats change
			await picker.refreshStats();

			expect(buildItemsSpy).toHaveBeenCalled();
		});
	});

	// =========================================================================
	// COMPACT MODE
	// =========================================================================

	describe("Compact Mode", () => {
		it("should support compact mode without stats header", async () => {
			const { EnhancedQuickPicker } = await import(
				"../../../../src/ui/quickPick/EnhancedQuickPicker"
			);

			const picker = new EnhancedQuickPicker({
				statsProvider: mockStatsProvider,
				compact: true,
			});

			const items = await picker.buildItems();
			const headerItem = items.find((i) => i.label?.includes("Session"));

			expect(headerItem).toBeUndefined();
		});

		it("should show reduced actions in compact mode", async () => {
			const { EnhancedQuickPicker } = await import(
				"../../../../src/ui/quickPick/EnhancedQuickPicker"
			);

			const picker = new EnhancedQuickPicker({
				statsProvider: mockStatsProvider,
				compact: true,
			});

			const items = await picker.buildItems();
			const actionItems = items.filter((i) => i.action && i.action !== "separator");

			// Compact mode should have fewer actions
			expect(actionItems.length).toBeLessThan(5);
		});
	});

	// =========================================================================
	// DURATION FORMATTING
	// =========================================================================

	describe("Duration Formatting", () => {
		it.each([
			[60000, "1m"], // 1 minute
			[3600000, "1h"], // 1 hour
			[7200000, "2h"], // 2 hours
			[3900000, "1h 5m"], // 1 hour 5 minutes
			[86400000, "24h"], // 24 hours
		])("should format %dms as '%s'", async (durationMs, expected) => {
			const stats = createMockSessionStats({ duration: durationMs });
			mockStatsProvider = createMockStatsProvider(stats);

			const { formatSessionDuration } = await import(
				"../../../../src/ui/quickPick/EnhancedQuickPicker"
			);

			expect(formatSessionDuration(durationMs)).toBe(expected);
		});
	});

	// =========================================================================
	// DISPOSABLE PATTERN
	// =========================================================================

	describe("Disposable Pattern", () => {
		it("should implement vscode.Disposable", async () => {
			const { EnhancedQuickPicker } = await import(
				"../../../../src/ui/quickPick/EnhancedQuickPicker"
			);

			const picker = new EnhancedQuickPicker({
				statsProvider: mockStatsProvider,
			});

			expect(picker.dispose).toBeInstanceOf(Function);
		});

		it("should unsubscribe from stats changes on dispose", async () => {
			const { EnhancedQuickPicker } = await import(
				"../../../../src/ui/quickPick/EnhancedQuickPicker"
			);

			const picker = new EnhancedQuickPicker({
				statsProvider: mockStatsProvider,
			});

			const disposeSpy = vi.fn();
			// @ts-expect-error - accessing private for test
			picker.statsSubscription = { dispose: disposeSpy };

			picker.dispose();

			expect(disposeSpy).toHaveBeenCalled();
		});
	});

	// =========================================================================
	// TELEMETRY
	// =========================================================================

	describe("Telemetry", () => {
		it("should track quick_actions_shown event on show", async () => {
			const { EnhancedQuickPicker } = await import(
				"../../../../src/ui/quickPick/EnhancedQuickPicker"
			);

			const mockTracker = {
				track: vi.fn(),
			};

			const picker = new EnhancedQuickPicker({
				statsProvider: mockStatsProvider,
				telemetry: mockTracker,
			});

			await picker.show();

			expect(mockTracker.track).toHaveBeenCalledWith(
				"quick_actions_shown",
				expect.objectContaining({
					snapshot_count: expect.any(Number),
				}),
			);
		});

		it("should track recovery_action_selected on action", async () => {
			const { EnhancedQuickPicker } = await import(
				"../../../../src/ui/quickPick/EnhancedQuickPicker"
			);

			const mockTracker = {
				track: vi.fn(),
			};

			const picker = new EnhancedQuickPicker({
				statsProvider: mockStatsProvider,
				telemetry: mockTracker,
			});

			await picker.handleAction("quick-recovery");

			expect(mockTracker.track).toHaveBeenCalledWith(
				"recovery_action_selected",
				expect.objectContaining({
					action: "quick-recovery",
				}),
			);
		});
	});
});
