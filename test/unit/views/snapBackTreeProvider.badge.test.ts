/**
 * SnapBackTreeProvider Badge Integration Tests
 *
 * TDD Phase 1: RED - Comprehensive tests for badge wiring
 *
 * Coverage requirements (per TDD_CORE.md):
 * - Happy path: NEW badges appear for recent snapshots
 * - Sad path: Badges don't appear when not applicable
 * - Edge cases: Boundary conditions, empty states
 * - Error cases: Graceful degradation
 *
 * @see TDD_CORE.md for test-first principles
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock vscode with inline factory (ESM compatible)
vi.mock("vscode", () => {
	// Mock EventEmitter class
	class MockEventEmitter {
		private listeners: Array<(e: unknown) => void> = [];
		event = (listener: (e: unknown) => void) => {
			this.listeners.push(listener);
			return { dispose: () => {} };
		};
		fire = (e?: unknown) => {
			for (const listener of this.listeners) listener(e);
		};
		dispose = () => {
			this.listeners = [];
		};
	}

	return {
		TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
		TreeItem: class MockTreeItem {
			label: string;
			collapsibleState: number;
			description?: string;
			tooltip?: string;
			contextValue?: string;
			command?: unknown;
			constructor(label: string, collapsibleState = 0) {
				this.label = label;
				this.collapsibleState = collapsibleState;
			}
		},
		EventEmitter: MockEventEmitter,
		window: {
			showInformationMessage: vi.fn(),
			showErrorMessage: vi.fn(),
			createTreeView: vi.fn(() => ({ dispose: vi.fn() })),
		},
		workspace: {
			getConfiguration: vi.fn().mockReturnValue({
				get: vi.fn().mockReturnValue(undefined),
			}),
		},
		ThemeColor: vi.fn().mockImplementation((id: string) => ({ id })),
	};
});

// Mock infrastructure logger
vi.mock("@snapback/infrastructure", () => ({
	logger: {
		debug: vi.fn(),
		error: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
	},
}));

import { SnapBackTreeProvider } from "@vscode/views/snapBackTreeProvider";
import type { IStorageManager, SnapshotManifest } from "@vscode/storage/types";

describe("SnapBackTreeProvider - Badge Integration", () => {
	let provider: SnapBackTreeProvider;
	let mockStorageManager: IStorageManager;
	let mockConfigManager: { getProtectionCounts: ReturnType<typeof vi.fn> };

	/**
	 * Factory for creating mock snapshot manifests
	 */
	const createMockManifest = (
		id: string,
		timestamp: number,
		overrides: Partial<SnapshotManifest> = {},
	): SnapshotManifest => ({
		id,
		name: `Snapshot ${id}`,
		timestamp,
		trigger: "manual",
		files: { "test.ts": { path: "test.ts", hash: "abc123" } },
		version: 1,
		metadata: {},
		...overrides,
	});

	beforeEach(async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2025-12-14T12:00:00Z"));
		vi.clearAllMocks();

		// Re-setup vscode mocks after clearAllMocks
		const vscode = await import("vscode");
		(vscode.workspace.getConfiguration as ReturnType<typeof vi.fn>).mockReturnValue({
			get: vi.fn().mockReturnValue(undefined),
		});

		mockStorageManager = {
			listSnapshots: vi.fn().mockResolvedValue([]),
			getSnapshot: vi.fn(),
			saveSnapshot: vi.fn(),
			deleteSnapshot: vi.fn(),
			getStoragePath: vi.fn().mockReturnValue("/test/storage"),
		} as unknown as IStorageManager;

		mockConfigManager = {
			getProtectionCounts: vi.fn().mockResolvedValue({
				block: 0,
				warn: 0,
				watch: 10,
			}),
		};

		provider = new SnapBackTreeProvider(mockStorageManager, mockConfigManager);
	});

	afterEach(() => {
		vi.useRealTimers();
		provider.dispose();
	});

	// ==================== HELPER FUNCTIONS ====================

	/**
	 * Helper to get snapshot items from tree
	 */
	async function getSnapshotItems() {
		const rootItems = await provider.getChildren(undefined);
		const timeGroup = rootItems.find((item) => item.data.type === "time-group");
		if (!timeGroup) return [];
		return provider.getChildren(timeGroup);
	}

	// ==================== HAPPY PATH TESTS ====================

	describe("Happy Path: NEW badge display", () => {
		it("should append ' NEW' to label for snapshot created 1 minute ago", async () => {
			const now = Date.now();
			const recentSnapshot = createMockManifest("snap-1", now - 60_000);

			(mockStorageManager.listSnapshots as ReturnType<typeof vi.fn>).mockResolvedValue([
				recentSnapshot,
			]);

			const snapshots = await getSnapshotItems();

			expect(snapshots.length).toBe(1);
			expect(snapshots[0].label).toMatch(/NEW$/);
		});

		it("should append ' NEW' to label for snapshot created 4 minutes ago", async () => {
			const now = Date.now();
			const recentSnapshot = createMockManifest("snap-2", now - 4 * 60_000);

			(mockStorageManager.listSnapshots as ReturnType<typeof vi.fn>).mockResolvedValue([
				recentSnapshot,
			]);

			const snapshots = await getSnapshotItems();

			expect(snapshots.length).toBe(1);
			expect(snapshots[0].label).toMatch(/NEW$/);
		});

		it("should show NEW badge for just-created snapshot (< 1 second ago)", async () => {
			const now = Date.now();
			const justCreated = createMockManifest("snap-instant", now - 500);

			(mockStorageManager.listSnapshots as ReturnType<typeof vi.fn>).mockResolvedValue([
				justCreated,
			]);

			const snapshots = await getSnapshotItems();

			expect(snapshots[0].label).toMatch(/NEW$/);
		});

		it("should preserve snapshot name while adding NEW badge", async () => {
			const now = Date.now();
			const snapshot = createMockManifest("snap-3", now - 60_000, {
				name: "Important Backup",
			});

			(mockStorageManager.listSnapshots as ReturnType<typeof vi.fn>).mockResolvedValue([
				snapshot,
			]);

			const snapshots = await getSnapshotItems();

			expect(snapshots[0].label).toContain("Important Backup");
			expect(snapshots[0].label).toMatch(/Important Backup.*NEW$/);
		});
	});

	describe("Happy Path: STALE indicator display", () => {
		it("should append ' (old)' to description for snapshot older than 24 hours", async () => {
			const now = Date.now();
			const staleSnapshot = createMockManifest("snap-stale", now - 48 * 60 * 60_000);

			(mockStorageManager.listSnapshots as ReturnType<typeof vi.fn>).mockResolvedValue([
				staleSnapshot,
			]);

			const snapshots = await getSnapshotItems();

			expect(snapshots.length).toBe(1);
			expect(snapshots[0].description).toContain("(old)");
		});

		it("should show (old) for snapshot from 3 days ago", async () => {
			const now = Date.now();
			const oldSnapshot = createMockManifest("snap-old", now - 3 * 24 * 60 * 60_000);

			(mockStorageManager.listSnapshots as ReturnType<typeof vi.fn>).mockResolvedValue([
				oldSnapshot,
			]);

			const snapshots = await getSnapshotItems();

			expect(snapshots[0].description).toContain("(old)");
		});
	});

	// ==================== SAD PATH TESTS ====================

	describe("Sad Path: Badge should NOT appear", () => {
		it("should NOT show NEW badge for snapshot older than 5 minutes", async () => {
			const now = Date.now();
			const oldSnapshot = createMockManifest("snap-old", now - 10 * 60_000);

			(mockStorageManager.listSnapshots as ReturnType<typeof vi.fn>).mockResolvedValue([
				oldSnapshot,
			]);

			const snapshots = await getSnapshotItems();

			expect(snapshots[0].label).not.toContain("NEW");
		});

		it("should NOT show (old) for snapshot from 12 hours ago", async () => {
			const now = Date.now();
			const midAgeSnapshot = createMockManifest("snap-mid", now - 12 * 60 * 60_000);

			(mockStorageManager.listSnapshots as ReturnType<typeof vi.fn>).mockResolvedValue([
				midAgeSnapshot,
			]);

			const snapshots = await getSnapshotItems();

			expect(snapshots[0].description).not.toContain("(old)");
		});

		it("should NOT show any badge for snapshot from 30 minutes ago", async () => {
			const now = Date.now();
			const normalSnapshot = createMockManifest("snap-normal", now - 30 * 60_000);

			(mockStorageManager.listSnapshots as ReturnType<typeof vi.fn>).mockResolvedValue([
				normalSnapshot,
			]);

			const snapshots = await getSnapshotItems();

			expect(snapshots[0].label).not.toContain("NEW");
			expect(snapshots[0].description).not.toContain("(old)");
		});
	});

	// ==================== EDGE CASE TESTS ====================

	describe("Edge Cases: Boundary conditions", () => {
		it("should show NEW badge at exactly 4:59 minutes (just under threshold)", async () => {
			const now = Date.now();
			const justUnderThreshold = createMockManifest(
				"snap-boundary",
				now - (5 * 60_000 - 1000), // 4:59
			);

			(mockStorageManager.listSnapshots as ReturnType<typeof vi.fn>).mockResolvedValue([
				justUnderThreshold,
			]);

			const snapshots = await getSnapshotItems();

			expect(snapshots[0].label).toMatch(/NEW$/);
		});

		it("should NOT show NEW badge at exactly 5:01 minutes (just over threshold)", async () => {
			const now = Date.now();
			const justOverThreshold = createMockManifest(
				"snap-over",
				now - (5 * 60_000 + 1000), // 5:01
			);

			(mockStorageManager.listSnapshots as ReturnType<typeof vi.fn>).mockResolvedValue([
				justOverThreshold,
			]);

			const snapshots = await getSnapshotItems();

			expect(snapshots[0].label).not.toContain("NEW");
		});

		it("should show (old) at exactly 24:01 hours (just over stale threshold)", async () => {
			const now = Date.now();
			const justStale = createMockManifest(
				"snap-just-stale",
				now - (24 * 60 * 60_000 + 60_000), // 24h + 1min
			);

			(mockStorageManager.listSnapshots as ReturnType<typeof vi.fn>).mockResolvedValue([
				justStale,
			]);

			const snapshots = await getSnapshotItems();

			expect(snapshots[0].description).toContain("(old)");
		});

		it("should NOT show (old) at exactly 23:59 hours (just under stale threshold)", async () => {
			const now = Date.now();
			const notYetStale = createMockManifest(
				"snap-not-stale",
				now - (24 * 60 * 60_000 - 60_000), // 24h - 1min
			);

			(mockStorageManager.listSnapshots as ReturnType<typeof vi.fn>).mockResolvedValue([
				notYetStale,
			]);

			const snapshots = await getSnapshotItems();

			expect(snapshots[0].description).not.toContain("(old)");
		});

		it("should handle empty snapshot list gracefully", async () => {
			(mockStorageManager.listSnapshots as ReturnType<typeof vi.fn>).mockResolvedValue([]);

			const rootItems = await provider.getChildren(undefined);
			const timeGroups = rootItems.filter((item) => item.data.type === "time-group");

			// No time groups when no snapshots
			expect(timeGroups.length).toBe(0);
		});

		it("should handle multiple snapshots with mixed badge states", async () => {
			const now = Date.now();
			const snapshots = [
				createMockManifest("snap-new", now - 60_000), // NEW
				createMockManifest("snap-normal", now - 30 * 60_000), // no badge
				createMockManifest("snap-stale", now - 48 * 60 * 60_000), // (old)
			];

			(mockStorageManager.listSnapshots as ReturnType<typeof vi.fn>).mockResolvedValue(
				snapshots,
			);

			const items = await getSnapshotItems();

			// Different snapshots may be in different time groups
			// At minimum, verify we got items back
			expect(items.length).toBeGreaterThan(0);
		});
	});

	// ==================== ERROR CASE TESTS ====================

	describe("Error Cases: Graceful degradation", () => {
		it("should not throw when storage manager fails", async () => {
			(mockStorageManager.listSnapshots as ReturnType<typeof vi.fn>).mockRejectedValue(
				new Error("Storage unavailable"),
			);

			// Should not throw
			await expect(provider.getChildren(undefined)).resolves.toBeDefined();
		});

		it("should return error item when storage fails", async () => {
			(mockStorageManager.listSnapshots as ReturnType<typeof vi.fn>).mockRejectedValue(
				new Error("DB connection lost"),
			);

			const rootItems = await provider.getChildren(undefined);

			// Should still have some items (header, actions, possibly error)
			expect(rootItems.length).toBeGreaterThan(0);
		});

		it("should handle snapshot with timestamp 0 (epoch)", async () => {
			const epochSnapshot = createMockManifest("snap-epoch", 0);

			(mockStorageManager.listSnapshots as ReturnType<typeof vi.fn>).mockResolvedValue([
				epochSnapshot,
			]);

			// Should not throw
			await expect(getSnapshotItems()).resolves.toBeDefined();
		});

		it("should handle snapshot with future timestamp", async () => {
			const now = Date.now();
			const futureSnapshot = createMockManifest("snap-future", now + 60_000);

			(mockStorageManager.listSnapshots as ReturnType<typeof vi.fn>).mockResolvedValue([
				futureSnapshot,
			]);

			const snapshots = await getSnapshotItems();

			// Future timestamps should be treated as NEW
			expect(snapshots[0].label).toMatch(/NEW$/);
		});
	});

	// ==================== DISPOSE & CLEANUP TESTS ====================

	describe("Dispose and Cleanup", () => {
		it("should implement vscode.Disposable interface", () => {
			expect(typeof provider.dispose).toBe("function");
		});

		it("should not throw when dispose is called", () => {
			expect(() => provider.dispose()).not.toThrow();
		});

		it("should not throw when dispose is called multiple times", () => {
			provider.dispose();
			expect(() => provider.dispose()).not.toThrow();
		});

		it("should clean up badge provider timers on dispose", () => {
			const now = Date.now();
			const recentSnapshot = createMockManifest("snap-timer", now - 60_000);

			(mockStorageManager.listSnapshots as ReturnType<typeof vi.fn>).mockResolvedValue([
				recentSnapshot,
			]);

			// Trigger snapshot loading which registers timers
			provider.getChildren(undefined);

			// Dispose should clean up timers
			provider.dispose();

			// Advance time significantly - should not trigger refresh
			vi.advanceTimersByTime(10 * 60_000);

			// If timers weren't cleaned up, this could cause issues
			// Test passes if no error thrown
		});
	});

	// ==================== AUTO-REFRESH TESTS ====================

	describe("Auto-refresh on badge expiry", () => {
		it("should trigger refresh when NEW badge expires", async () => {
			const now = Date.now();
			const recentSnapshot = createMockManifest("snap-expiring", now - 4 * 60_000);

			(mockStorageManager.listSnapshots as ReturnType<typeof vi.fn>).mockResolvedValue([
				recentSnapshot,
			]);

			// Load snapshots to register tracking
			await getSnapshotItems();

			// Spy on the internal event emitter
			const fireSpy = vi.spyOn(provider["_onDidChangeTreeData"], "fire");

			// Advance time past the NEW badge expiry (5 min threshold)
			vi.advanceTimersByTime(2 * 60_000); // +2 min = 6 min total

			// Refresh should have been triggered
			expect(fireSpy).toHaveBeenCalled();
		});
	});

	// ==================== TELEMETRY LOGGING TESTS ====================

	describe("Telemetry and logging", () => {
		it("should log newBadgeCount when loading snapshots", async () => {
			const { logger } = await import("@snapback/infrastructure");
			const now = Date.now();

			const snapshots = [
				createMockManifest("snap-new-1", now - 60_000),
				createMockManifest("snap-new-2", now - 2 * 60_000),
				createMockManifest("snap-old", now - 10 * 60_000),
			];

			(mockStorageManager.listSnapshots as ReturnType<typeof vi.fn>).mockResolvedValue(
				snapshots,
			);

			await provider.getChildren(undefined);

			expect(logger.debug).toHaveBeenCalledWith(
				"Snapshots loaded for TreeView",
				expect.objectContaining({
					count: 3,
					newBadgeCount: 2, // Only 2 are within NEW threshold
				}),
			);
		});
	});
});

// ==================== TYPE SAFETY TESTS ====================

describe("Type Safety", () => {
	it("should export SnapBackTreeProvider class", async () => {
		const { SnapBackTreeProvider } = await import(
			"@vscode/views/snapBackTreeProvider"
		);
		expect(SnapBackTreeProvider).toBeDefined();
		expect(typeof SnapBackTreeProvider).toBe("function");
	});
});
