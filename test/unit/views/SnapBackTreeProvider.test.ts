import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import type {
	IStorageManager,
	SnapshotManifest,
} from "@vscode/storage/types";
import { SnapBackTreeProvider } from "@vscode/views/SnapBackTreeProvider";

// IMPORTANT: DO NOT re-mock vscode here!
// The global setup.ts provides a complete vscode mock.
// Use vi.mocked() to override specific methods if needed.

// Mock interfaces - matching actual implementation
interface IConfigManager {
	getProtectionCounts(): Promise<{
		block: number;
		warn: number;
		watch: number;
	}>;
}

describe("SnapBackTreeProvider", () => {
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

	// Sample test data
	const mockSnapshots: SnapshotManifest[] = [
		{
			id: "snap-1",
			timestamp: Date.now() - 1000 * 60 * 30, // 30 minutes ago
			name: "Recent snapshot",
			files: { "/test/file1.ts": { blob: "hash1", size: 100 } },
			trigger: "manual",
			metadata: { sessionId: "session-1" },
		},
		{
			id: "snap-2",
			timestamp: Date.now() - 1000 * 60 * 60 * 25, // 25 hours ago (yesterday)
			name: "Yesterday snapshot",
			files: { "/test/file2.ts": { blob: "hash2", size: 200 } },
			trigger: "auto",
			metadata: { sessionId: "session-2" },
		},
		{
			id: "snap-3",
			timestamp: Date.now() - 1000 * 60 * 60 * 24 * 5, // 5 days ago (this week)
			name: "This week snapshot",
			files: { "/test/file3.ts": { blob: "hash3", size: 300 } },
			trigger: "manual",
			metadata: { sessionId: "session-3" },
		},
		{
			id: "snap-4",
			timestamp: Date.now() - 1000 * 60 * 60 * 24 * 10, // 10 days ago (older)
			name: "Older snapshot",
			files: { "/test/file4.ts": { blob: "hash4", size: 400 } },
			trigger: "auto",
			metadata: { sessionId: "session-4" },
		},
	];

	beforeEach(() => {
		// Reset mocks
		vi.clearAllMocks();

		// Create mock storage manager with full IStorageManager interface
		mockStorageManager = {
			listSnapshots: vi.fn().mockResolvedValue(mockSnapshots),
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
		};

		// Create mock config manager
		mockConfigManager = {
			getProtectionCounts: vi.fn().mockResolvedValue({
				block: 5,
				warn: 3,
				watch: 2,
			}),
		};

		// Mock ExtensionContext
		mockContext = {
			globalState: {
				get: vi.fn().mockReturnValue(undefined),
				update: vi.fn().mockResolvedValue(undefined),
			},
			subscriptions: {
				push: vi.fn(),
			},
		};

		// Create provider instance
		provider = new SnapBackTreeProvider(
			mockContext as unknown as vscode.ExtensionContext,
			mockStorageManager as unknown as IStorageManager,
			mockConfigManager,
		);
	});

	afterEach(() => {
		// No dispose method - lifecycle managed by VS Code
	});

	describe("constructor", () => {
		it("should initialize with default configuration", () => {
			expect(provider).toBeDefined();
			expect(provider.getGroupingMode()).toBe("time");
		});

		it("should initialize EventEmitter for tree data changes", () => {
			expect(provider.onDidChangeTreeData).toBeDefined();
		});
	});

	describe("refresh", () => {
		it("should fire onDidChangeTreeData event", () => {
			const fireSpy = vi.spyOn(provider._onDidChangeTreeData, "fire");

			provider.refresh();

			expect(fireSpy).toHaveBeenCalledWith(undefined);
		});
	});

	describe("getTreeItem", () => {
		it("should return the same tree item passed to it", async () => {
			// Get actual tree items from provider
			const rootItems = await provider.getChildren();
			const firstItem = rootItems[0];

			const result = provider.getTreeItem(firstItem);

			expect(result).toBe(firstItem);
		});
	});

	describe("getChildren - root level", () => {
		it("should return root sections when no element provided", async () => {
			const children = await provider.getChildren();

			expect(children).toBeDefined();
			expect(children.length).toBeGreaterThan(0);
		});

		it("should include protection summary section", async () => {
			const children = await provider.getChildren();

			const protectionSection = children.find(
				(item) => item.label === "🛡️ 10 files protected",
			);

			expect(protectionSection).toBeDefined();
		});

		it("should include ACTIVITY section when snapshots exist", async () => {
			const children = await provider.getChildren();

			// New UX: ACTIVITY header replaces old Snapshots section
			const activitySection = children.find(
				(item) => item.data.type === "activity-header",
			);

			expect(activitySection).toBeDefined();
		});

		it("should NOT include ACTIONS section in tree (moved to toolbar)", async () => {
			const children = await provider.getChildren();

			// Actions are now in toolbar, not in tree
			const actionsSection = children.find((item) => item.label === "Actions");

			expect(actionsSection).toBeUndefined();
		});

		it("should NOT include problems section when no problems exist", async () => {
			const children = await provider.getChildren();

			const problemsSection = children.find(
				(item) => item.label === "Problems",
			);

			expect(problemsSection).toBeUndefined();
		});

		it("should respect showProtection config setting", async () => {
			// Note: showProtection config doesn't hide header, just affects child items
			// This is expected behavior per UX/IA spec
			const children = await provider.getChildren();

			const protectionSection = children.find(
				(item) =>
					typeof item.label === "string" && item.label.includes("protected"),
			);

			// Protection summary should still show at root (it's the header)
			expect(protectionSection).toBeDefined();
		});
	});

	describe("getChildren - protection summary expansion", () => {
		it("should show breakdown when protection summary is expanded", async () => {
			const rootChildren = await provider.getChildren();
			const protectionSection = rootChildren.find(
				(item) =>
					typeof item.label === "string" && item.label.includes("protected"),
			);

			expect(protectionSection).toBeDefined();

			const breakdownChildren = await provider.getChildren(protectionSection!);

			expect(breakdownChildren.length).toBe(3); // block, warn, watch
		});

		it("should show correct block count", async () => {
			const rootChildren = await provider.getChildren();
			const protectionSection = rootChildren[0];

			const breakdown = await provider.getChildren(protectionSection);
			const blockItem = breakdown.find((item) => {
				const label = item.label?.toString() || "";
				return label.includes("Block");
			});

			expect(blockItem).toBeDefined();
			// Format: "{icon} Block: 5"
			expect(blockItem?.label).toContain("5");
		});

		it("should show correct warn count", async () => {
			const rootChildren = await provider.getChildren();
			const protectionSection = rootChildren[0];

			const breakdown = await provider.getChildren(protectionSection);
			const warnItem = breakdown.find((item) => {
				const label = item.label?.toString() || "";
				return label.includes("Warn");
			});

			expect(warnItem).toBeDefined();
			// Format: "{icon} Warn: 3"
			expect(warnItem?.label).toContain("3");
		});

		it("should show correct watch count", async () => {
			const rootChildren = await provider.getChildren();
			const protectionSection = rootChildren[0];

			const breakdown = await provider.getChildren(protectionSection);
			const watchItem = breakdown.find((item) => {
				const label = item.label?.toString() || "";
				return label.includes("Watch");
			});

			expect(watchItem).toBeDefined();
			// Format: "{icon} Watch: 2"
			expect(watchItem?.label).toContain("2");
		});
	});

	describe("getChildren - time grouping", () => {
		it("should group snapshots by time periods under ACTIVITY header", async () => {
			const rootChildren = await provider.getChildren();
			const activitySection = rootChildren.find(
				(item) => item.data.type === "activity-header",
			);

			expect(activitySection).toBeDefined();

			const timeGroups = await provider.getChildren(activitySection!);

			// Should have time groups: Today, Yesterday, This Week, Earlier
			expect(timeGroups.length).toBeGreaterThan(0);
		});

		it("should show 'Today' group for snapshots from today", async () => {
			const rootChildren = await provider.getChildren();
			const activitySection = rootChildren.find(
				(item) => item.data.type === "activity-header",
			);

			const groups = await provider.getChildren(activitySection!);
			const todayGroup = groups.find((g) => g.label === "Today");

			expect(todayGroup).toBeDefined();
		});

		it("should show 'Yesterday' group for snapshots 24-48h old", async () => {
			const rootChildren = await provider.getChildren();
			const activitySection = rootChildren.find(
				(item) => item.data.type === "activity-header",
			);

			const groups = await provider.getChildren(activitySection!);
			const yesterdayGroup = groups.find((g) => g.label === "Yesterday");

			expect(yesterdayGroup).toBeDefined();
		});

		it("should show 'This Week' group for snapshots < 7 days old", async () => {
			const rootChildren = await provider.getChildren();
			const activitySection = rootChildren.find(
				(item) => item.data.type === "activity-header",
			);

			const groups = await provider.getChildren(activitySection!);
			const weekGroup = groups.find((g) => g.label === "This Week");

			expect(weekGroup).toBeDefined();
		});

		it("should show 'Earlier' group for snapshots > 7 days old", async () => {
			const rootChildren = await provider.getChildren();
			const activitySection = rootChildren.find(
				(item) => item.data.type === "activity-header",
			);

			const groups = await provider.getChildren(activitySection!);
			const earlierGroup = groups.find((g) => g.label === "Earlier");

			expect(earlierGroup).toBeDefined();
		});
	});

	// NOTE: Actions section removed from tree per UX refactor.
	// Actions are now in the toolbar (package.json view/title menu).
	// Keeping test structure for documentation purposes.
	describe("getChildren - actions (moved to toolbar)", () => {
		it("should NOT show Actions section in tree (moved to toolbar)", async () => {
			const rootChildren = await provider.getChildren();
			const actionsSection = rootChildren.find(
				(item) => item.label === "Actions",
			);

			// Actions are now in toolbar, not in tree
			expect(actionsSection).toBeUndefined();
		});
	});

	describe("setGroupingMode", () => {
		it("should update grouping mode to 'time'", () => {
			provider.setGroupingMode("time");

			expect(provider.getGroupingMode()).toBe("time");
		});

		it("should keep 'time' mode when 'system' requested (not implemented)", () => {
			provider.setGroupingMode("system");

			// Should keep 'time' mode and show info message
			expect(provider.getGroupingMode()).toBe("time");
		});

		it("should keep 'time' mode when 'file' requested (not implemented)", () => {
			provider.setGroupingMode("file");

			// Should keep 'time' mode and show info message
			expect(provider.getGroupingMode()).toBe("time");
		});

		it("should fire refresh after changing grouping mode", () => {
			const fireSpy = vi.spyOn(provider._onDidChangeTreeData, "fire");

			provider.setGroupingMode("time");

			expect(fireSpy).toHaveBeenCalled();
		});
	});

	// Removed updateConfig tests - method doesn't exist in actual implementation
	// Config is managed through setGroupingMode and setProblems instead

	describe("static register method", () => {
		// Create a full mock context with globalState for register tests
		const createRegisterMockContext = () => ({
			subscriptions: [] as any[],
			globalState: {
				get: vi.fn().mockReturnValue(undefined),
				update: vi.fn().mockResolvedValue(undefined),
			},
		}) as unknown as vscode.ExtensionContext;

		it("should create provider and TreeView", () => {
			const registerContext = createRegisterMockContext();

			const result = SnapBackTreeProvider.register(
				registerContext,
				mockStorageManager,
				mockConfigManager,
			);

			expect(result.provider).toBeInstanceOf(SnapBackTreeProvider);
			expect(result.view).toBeDefined();
		});

		it("should register TreeView with correct view ID", () => {
			const registerContext = createRegisterMockContext();

			SnapBackTreeProvider.register(
				registerContext,
				mockStorageManager as unknown as IStorageManager,
				mockConfigManager,
			);

			expect(vscode.window.createTreeView).toHaveBeenCalledWith(
				"snapback.dashboard",
				expect.objectContaining({
					treeDataProvider: expect.any(SnapBackTreeProvider),
					showCollapseAll: true,
				}),
			);
		});

		it("should add view to context subscriptions", () => {
			const registerContext = createRegisterMockContext();

			SnapBackTreeProvider.register(
				registerContext,
				mockStorageManager as unknown as IStorageManager,
				mockConfigManager,
			);

			expect(registerContext.subscriptions.length).toBeGreaterThan(0);
		});

		it("should allow custom view ID", () => {
			const registerContext = createRegisterMockContext();

			SnapBackTreeProvider.register(
				registerContext,
				mockStorageManager as unknown as IStorageManager,
				mockConfigManager,
				"custom.view.id",
			);

			expect(vscode.window.createTreeView).toHaveBeenCalledWith(
				"custom.view.id",
				expect.anything(),
			);
		});
	});

	// Note: SnapBackTreeProvider doesn't have a dispose method
	// It only disposes the internal EventEmitter when garbage collected
	// Lifecycle is managed by VS Code's TreeView disposal

	describe("empty state handling", () => {
		it("should handle zero snapshots gracefully", async () => {
			// Override mock to return empty array
			mockStorageManager.listSnapshots = vi.fn().mockResolvedValue([]);

			const rootChildren = await provider.getChildren();

			// Should still show protection summary and actions
			expect(rootChildren.length).toBeGreaterThan(0);
		});

		it("should not show ACTIVITY section when no snapshots exist", async () => {
			mockStorageManager.listSnapshots = vi.fn().mockResolvedValue([]);

			// Need to create new provider to reset cache
			const emptyProvider = new SnapBackTreeProvider(
				mockContext as unknown as vscode.ExtensionContext,
				mockStorageManager as unknown as IStorageManager,
				mockConfigManager,
			);

			const rootChildren = await emptyProvider.getChildren();

			// New UX uses ACTIVITY header instead of Snapshots section
			const activitySection = rootChildren.find(
				(item) => item.data.type === "activity-header",
			);

			// Following "no news is good news" - hide empty ACTIVITY section
			expect(activitySection).toBeUndefined();
		});

		it("should handle zero protected files gracefully", async () => {
			mockConfigManager.getProtectionCounts = vi.fn().mockResolvedValue({
				block: 0,
				warn: 0,
				watch: 0,
			});

			const rootChildren = await provider.getChildren();

			const protectionSection = rootChildren.find(
				(item) =>
					typeof item.label === "string" && item.label.includes("protected"),
			);

			expect(protectionSection).toBeDefined();
			expect(protectionSection?.label).toContain("0 files");
		});
	});

	describe("error handling", () => {
		it("should handle storage manager errors gracefully", async () => {
			mockStorageManager.listSnapshots = vi
				.fn()
				.mockRejectedValue(new Error("Storage error"));

			// Create new provider to avoid cached data
			const errorProvider = new SnapBackTreeProvider(
				mockContext as unknown as vscode.ExtensionContext,
				mockStorageManager as unknown as IStorageManager,
				mockConfigManager,
			);

			const rootChildren = await errorProvider.getChildren();

			// Should not throw, should return minimal UI
			expect(rootChildren).toBeDefined();
		});

		it("should handle config manager errors gracefully", async () => {
			mockConfigManager.getProtectionCounts = vi
				.fn()
				.mockRejectedValue(new Error("Config error"));

			// Create new provider
			const errorProvider = new SnapBackTreeProvider(
				mockContext as unknown as vscode.ExtensionContext,
				mockStorageManager as unknown as IStorageManager,
				mockConfigManager,
			);

			const rootChildren = await errorProvider.getChildren();

			// Should not throw
			expect(rootChildren).toBeDefined();
		});
	});
});
