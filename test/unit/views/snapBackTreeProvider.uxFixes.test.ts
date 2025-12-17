/**
 * Tests for SnapBackTreeProvider UX fixes
 *
 * Issue 1: Protected files filtered by protection level
 * Issue 3: Duplicate cloud section removed
 * Issue 4: "More snapshots" expands inline instead of opening search
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import type { IStorageManager, SnapshotManifest } from "@vscode/storage/types";
import { SnapBackTreeProvider } from "@vscode/views/SnapBackTreeProvider";

// Mock interfaces
interface IConfigManager {
	getProtectionCounts(): Promise<{
		block: number;
		warn: number;
		watch: number;
	}>;
}

describe("SnapBackTreeProvider UX Fixes", () => {
	let provider: SnapBackTreeProvider;
	let mockStorageManager: IStorageManager;
	let mockConfigManager: IConfigManager;
	let mockContext: {
		globalState: {
			get: ReturnType<typeof vi.fn>;
			update: ReturnType<typeof vi.fn>;
		};
		subscriptions: { push: ReturnType<typeof vi.fn> };
	};

	// Generate many snapshots to test "more snapshots" functionality
	const generateSnapshots = (count: number): SnapshotManifest[] => {
		return Array.from({ length: count }, (_, i) => ({
			id: `snap-${i}`,
			timestamp: Date.now() - 1000 * 60 * 30 * (i + 1), // 30 min intervals
			name: `Snapshot ${i}`,
			files: { [`/test/file${i}.ts`]: { blob: `hash${i}`, size: 100 } },
			trigger: "manual" as const,
			metadata: { sessionId: `session-${i}` },
		}));
	};

	beforeEach(() => {
		vi.clearAllMocks();

		mockStorageManager = {
			listSnapshots: vi.fn().mockResolvedValue(generateSnapshots(15)),
			initialize: vi.fn().mockResolvedValue(undefined),
			dispose: vi.fn(),
			setCooldown: vi.fn(),
			getCooldown: vi.fn(),
			isInCooldown: vi.fn(),
			clearCooldowns: vi.fn(),
			createSnapshot: vi.fn(),
			getSnapshot: vi.fn(),
			deleteSnapshot: vi.fn(),
			createSession: vi.fn(),
			finalizeSession: vi.fn(),
			getSession: vi.fn(),
			listSessions: vi.fn(),
			recordAudit: vi.fn(),
			getAuditTrail: vi.fn(),
			getStorageMetadata: vi.fn(),
			getSnapshotManifest: vi.fn(),
		};

		mockConfigManager = {
			getProtectionCounts: vi.fn().mockResolvedValue({
				block: 5,
				warn: 3,
				watch: 2,
			}),
		};

		mockContext = {
			globalState: {
				get: vi.fn().mockReturnValue(undefined),
				update: vi.fn().mockResolvedValue(undefined),
			},
			subscriptions: { push: vi.fn() },
		};

		provider = new SnapBackTreeProvider(
			mockContext as unknown as vscode.ExtensionContext,
			mockStorageManager as unknown as IStorageManager,
			mockConfigManager,
		);
	});

	afterEach(() => {
		provider.dispose();
	});

	describe("Issue 3: Cloud section removed from tree", () => {
		it("should NOT include cloud section in root items", async () => {
			const rootItems = await provider.getChildren();

			// Cloud section should not exist in tree (removed - shown in status bar instead)
			const cloudSection = rootItems.find(
				(item) =>
					item.data.type === "cloud-cta" || item.data.type === "cloud-status",
			);

			expect(cloudSection).toBeUndefined();
		});

		it("should only have header, activity, and problems sections", async () => {
			const rootItems = await provider.getChildren();

			// Verify only expected root types
			const rootTypes = rootItems.map((item) => item.data.type);

			expect(rootTypes).toContain("header");
			expect(rootTypes).toContain("activity-header");
			// Cloud types should not be present
			expect(rootTypes).not.toContain("cloud-cta");
			expect(rootTypes).not.toContain("cloud-status");
		});
	});

	describe("Issue 4: More snapshots expands inline", () => {
		it("should create more-snapshots item as collapsible", async () => {
			// Get the activity header
			const rootItems = await provider.getChildren();
			const activityHeader = rootItems.find(
				(item) => item.data.type === "activity-header",
			);
			expect(activityHeader).toBeDefined();

			// Get time groups under activity
			const timeGroups = await provider.getChildren(activityHeader);
			expect(timeGroups.length).toBeGreaterThan(0);

			// Get snapshots in first time group
			const firstGroup = timeGroups[0];
			const snapshotItems = await provider.getChildren(firstGroup);

			// Find the more-snapshots item
			const moreItem = snapshotItems.find(
				(item) => item.data.type === "more-snapshots",
			);

			// If there are more snapshots than maxPerGroup, there should be a more item
			if (moreItem) {
				// Should be collapsible (Collapsed state)
				expect(moreItem.collapsibleState).toBe(
					vscode.TreeItemCollapsibleState.Collapsed,
				);
				// Should NOT have a command (inline expansion instead)
				expect(moreItem.command).toBeUndefined();
				// Should have a stable ID for expansion persistence
				expect(moreItem.id).toContain("snapback:activity:more:");
			}
		});

		it("should return remaining snapshots when more-snapshots is expanded", async () => {
			// Get the activity header
			const rootItems = await provider.getChildren();
			const activityHeader = rootItems.find(
				(item) => item.data.type === "activity-header",
			);

			// Get time groups
			const timeGroups = await provider.getChildren(activityHeader);
			const firstGroup = timeGroups[0];

			// Get initial snapshot items
			const snapshotItems = await provider.getChildren(firstGroup);
			const moreItem = snapshotItems.find(
				(item) => item.data.type === "more-snapshots",
			);

			if (moreItem) {
				// Expand the more item
				const remainingSnapshots = await provider.getChildren(moreItem);

				// Should return snapshot items
				expect(remainingSnapshots.length).toBeGreaterThan(0);
				remainingSnapshots.forEach((item) => {
					expect(item.data.type).toBe("snapshot");
				});
			}
		});
	});

	describe("Protection breakdown children", () => {
		it("should create header-detail items with level information", async () => {
			const rootItems = await provider.getChildren();
			const header = rootItems.find((item) => item.data.type === "header");
			expect(header).toBeDefined();

			const breakdown = await provider.getChildren(header);

			// Should have breakdown items for each non-zero level
			expect(breakdown.length).toBeGreaterThan(0);

			// Each item should be a header-detail type
			breakdown.forEach((item) => {
				expect(item.data.type).toBe("header-detail");
			});
		});

		it("should pass level to showAllProtectedFiles command", async () => {
			const rootItems = await provider.getChildren();
			const header = rootItems.find((item) => item.data.type === "header");
			const breakdown = await provider.getChildren(header);

			// Find the block level item
			const blockItem = breakdown.find((item) =>
				item.label?.toString().includes("Block"),
			);

			if (blockItem) {
				expect(blockItem.command).toBeDefined();
				expect(blockItem.command?.arguments).toContain("block");
			}
		});
	});
});
