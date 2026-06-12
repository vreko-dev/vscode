/**
 * SnapshotTreeDataProvider Tests
 *
 * Reference: Snapshot Display Specification
 * - Sidebar browse and manage experience
 * - Date-grouped snapshots (Today, Yesterday, This Week, Older)
 * - Collapse/expand groups
 * - Context menu actions
 *
 * @packageDocumentation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as vscode from "vscode";
import {
	SnapshotTreeDataProvider,
	SnapshotTreeItem,
	DateGroupTreeItem,
	type SnapshotTreeConfig,
} from "../../../../src/ui/snapshot-display/SnapshotTreeDataProvider";
import type { SnapshotManifestV2, OriginLabel, ReasonCode } from "../../../../src/storage/types";

// =============================================================================
// TEST HELPERS
// =============================================================================

function createMockSnapshotV2(overrides: Partial<SnapshotManifestV2> = {}): SnapshotManifestV2 {
	return {
		schemaVersion: 2,
		id: `snap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
		seq: 1,
		parentSeq: null,
		parentId: null,
		timestamp: Date.now(),
		name: "Test Snapshot",
		type: "POST",
		anchorFile: "/path/to/file.ts",
		files: {
			"/path/to/file.ts": { blobHash: "abc123", size: 1024 },
		},
		metadata: {
			origin: "INTERACTIVE" as OriginLabel,
			reasons: [] as ReasonCode[],
		},
		...overrides,
	};
}

function createMockStorageManager() {
	return {
		listSnapshots: vi.fn().mockResolvedValue([]),
		getSnapshotManifest: vi.fn().mockResolvedValue(null),
		getSnapshot: vi.fn().mockResolvedValue(null),
		initialize: vi.fn().mockResolvedValue(undefined),
		dispose: vi.fn(),
		isInitialized: vi.fn().mockReturnValue(true),
		getStorageUri: vi.fn().mockReturnValue({ fsPath: "/tmp/vreko" }),
	};
}

// =============================================================================
// DATE GROUP TESTS
// =============================================================================

describe("DateGroupTreeItem", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2025-12-30T12:00:00.000Z"));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("should create Today group with correct label", () => {
		const item = new DateGroupTreeItem("Today", 3);

		expect(item.label).toBe("Today");
		expect(item.description).toBe("3 snapshots");
		expect(item.collapsibleState).toBe(vscode.TreeItemCollapsibleState.Expanded);
	});

	it("should create Yesterday group with collapsed state", () => {
		const item = new DateGroupTreeItem("Yesterday", 5);

		expect(item.label).toBe("Yesterday");
		expect(item.collapsibleState).toBe(vscode.TreeItemCollapsibleState.Collapsed);
	});

	it("should create This Week group", () => {
		const item = new DateGroupTreeItem("This Week", 10);

		expect(item.label).toBe("This Week");
		expect(item.description).toBe("10 snapshots");
	});

	it("should create Older group", () => {
		const item = new DateGroupTreeItem("Older", 100);

		expect(item.label).toBe("Older");
		expect(item.description).toBe("100 snapshots");
	});

	it("should use singular for 1 snapshot", () => {
		const item = new DateGroupTreeItem("Today", 1);

		expect(item.description).toBe("1 snapshot");
	});
});

// =============================================================================
// SNAPSHOT TREE ITEM TESTS
// =============================================================================

describe("SnapshotTreeItem", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2025-12-30T12:00:00.000Z"));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("label formatting", () => {
		it("should show icon and file name in label", () => {
			const snapshot = createMockSnapshotV2({
				anchorFile: "/path/to/api.ts",
				metadata: { origin: "INTERACTIVE", reasons: ["MANUAL_CHECKPOINT"] },
			});

			const item = new SnapshotTreeItem(snapshot);

			expect(item.label).toContain("api.ts");
			expect(item.label).toMatch(/^📸/); // Manual snapshot icon
		});

		it("should show robot icon for AI snapshots", () => {
			const snapshot = createMockSnapshotV2({
				metadata: { origin: "AUTOMATED", reasons: ["AI_DETECTED"] },
			});

			const item = new SnapshotTreeItem(snapshot);

			expect(item.label).toMatch(/^🤖/);
		});

		it("should show file count for multi-file snapshots", () => {
			const snapshot = createMockSnapshotV2({
				anchorFile: "/path/to/index.ts",
				files: {
					"/path/to/index.ts": { blobHash: "abc", size: 100 },
					"/path/to/api.ts": { blobHash: "def", size: 200 },
				},
			});

			const item = new SnapshotTreeItem(snapshot);

			expect(item.label).toContain("index.ts (+1)");
		});
	});

	describe("description", () => {
		it("should show absolute time in description", () => {
			const snapshot = createMockSnapshotV2({
				timestamp: new Date("2025-12-30T14:30:00.000Z").getTime(),
			});

			const item = new SnapshotTreeItem(snapshot);

			// Should show time like "2:30 PM"
			expect(item.description).toMatch(/\d{1,2}:\d{2}/);
		});
	});

	describe("tooltip", () => {
		it("should show detailed info in tooltip", () => {
			const snapshot = createMockSnapshotV2({
				anchorFile: "/project/src/api.ts",
				metadata: { origin: "AUTOMATED", reasons: ["RISK_BURST_START"] },
			});

			const item = new SnapshotTreeItem(snapshot);

			// Tooltip should be a MarkdownString with file and reason info
			expect(item.tooltip).toBeDefined();
		});
	});

	describe("context value", () => {
		it("should set context value for context menu", () => {
			const snapshot = createMockSnapshotV2();

			const item = new SnapshotTreeItem(snapshot);

			expect(item.contextValue).toBe("snapshot");
		});
	});

	describe("command", () => {
		it("should set command for clicking on item", () => {
			const snapshot = createMockSnapshotV2({ id: "snap-123" });

			const item = new SnapshotTreeItem(snapshot);

			expect(item.command).toBeDefined();
			expect(item.command?.command).toBe("vreko.diffSnapshot");
			expect(item.command?.arguments).toContain("snap-123");
		});
	});

	describe("icon path", () => {
		it("should not have iconPath (uses label emoji)", () => {
			const snapshot = createMockSnapshotV2();

			const item = new SnapshotTreeItem(snapshot);

			// We use emoji in label, so no iconPath needed
			expect(item.iconPath).toBeUndefined();
		});
	});
});

// =============================================================================
// TREE DATA PROVIDER TESTS
// =============================================================================

describe("SnapshotTreeDataProvider", () => {
	let mockStorageManager: ReturnType<typeof createMockStorageManager>;

	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2025-12-30T12:00:00.000Z"));
		mockStorageManager = createMockStorageManager();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	describe("getTreeItem", () => {
		it("should return the element unchanged", async () => {
			const provider = new SnapshotTreeDataProvider(mockStorageManager as any);
			const snapshot = createMockSnapshotV2();
			const item = new SnapshotTreeItem(snapshot);

			const result = await provider.getTreeItem(item);

			expect(result).toBe(item);
		});
	});

	describe("getChildren", () => {
		it("should return date groups when no element provided (root level)", async () => {
			const todaySnapshot = createMockSnapshotV2({ timestamp: Date.now() - 60000 });
			const yesterdaySnapshot = createMockSnapshotV2({
				timestamp: Date.now() - 86400000,
			});
			mockStorageManager.listSnapshots.mockResolvedValue([
				todaySnapshot,
				yesterdaySnapshot,
			]);

			const provider = new SnapshotTreeDataProvider(mockStorageManager as any);
			const children = await provider.getChildren();

			// Should have date group items
			expect(children.length).toBeGreaterThan(0);
			expect(children.some((c) => c instanceof DateGroupTreeItem)).toBe(true);
		});

		it("should return snapshots for a date group", async () => {
			const snapshot1 = createMockSnapshotV2({
				id: "snap-1",
				timestamp: Date.now() - 60000,
			});
			const snapshot2 = createMockSnapshotV2({
				id: "snap-2",
				timestamp: Date.now() - 120000,
			});
			mockStorageManager.listSnapshots.mockResolvedValue([snapshot1, snapshot2]);

			const provider = new SnapshotTreeDataProvider(mockStorageManager as any);
			const dateGroup = new DateGroupTreeItem("Today", 2);
			(dateGroup as any).snapshots = [snapshot1, snapshot2];

			const children = await provider.getChildren(dateGroup);

			expect(children.length).toBe(2);
			expect(children.every((c) => c instanceof SnapshotTreeItem)).toBe(true);
		});

		it("should return empty array for snapshot items", async () => {
			const provider = new SnapshotTreeDataProvider(mockStorageManager as any);
			const snapshot = createMockSnapshotV2();
			const item = new SnapshotTreeItem(snapshot);

			const children = await provider.getChildren(item);

			expect(children).toEqual([]);
		});

		it("should only show non-empty date groups", async () => {
			// Only create today snapshots
			const todaySnapshot = createMockSnapshotV2({ timestamp: Date.now() - 60000 });
			mockStorageManager.listSnapshots.mockResolvedValue([todaySnapshot]);

			const provider = new SnapshotTreeDataProvider(mockStorageManager as any);
			const children = await provider.getChildren();

			// Should only have Today group, not empty Yesterday/This Week/Older
			const labels = children.map((c) => (c as DateGroupTreeItem).label);
			expect(labels).toContain("Today");
			expect(labels.filter((l) => l === "Yesterday")).toHaveLength(0);
		});

		it("should handle empty snapshot list", async () => {
			mockStorageManager.listSnapshots.mockResolvedValue([]);

			const provider = new SnapshotTreeDataProvider(mockStorageManager as any);
			const children = await provider.getChildren();

			expect(children.length).toBe(0);
		});
	});

	describe("refresh", () => {
		it("should fire onDidChangeTreeData event", async () => {
			const provider = new SnapshotTreeDataProvider(mockStorageManager as any);
			const listener = vi.fn();
			provider.onDidChangeTreeData(listener);

			provider.refresh();

			expect(listener).toHaveBeenCalled();
		});
	});

	describe("configuration", () => {
		it("should respect maxItems config", async () => {
			const snapshots = Array.from({ length: 100 }, (_, i) =>
				createMockSnapshotV2({ timestamp: Date.now() - i * 60000 }),
			);
			mockStorageManager.listSnapshots.mockResolvedValue(snapshots);

			const config: SnapshotTreeConfig = { maxItems: 20 };
			const provider = new SnapshotTreeDataProvider(mockStorageManager as any, config);
			await provider.getChildren();

			expect(mockStorageManager.listSnapshots).toHaveBeenCalledWith(
				expect.objectContaining({ limit: 20 }),
			);
		});
	});
});
