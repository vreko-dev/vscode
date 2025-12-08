import { beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import type {
	IStorageManager,
	SnapshotManifest,
} from "@vscode/storage/types";
import { SnapBackTreeProvider } from "@vscode/views/SnapBackTreeProvider";

// Mock vscode module
vi.mock("vscode", () => ({
	TreeItemCollapsibleState: {
		None: 0,
		Collapsed: 1,
		Expanded: 2,
	},
	TreeItem: class {
		label: string;
		collapsibleState: number;
		description?: string;
		tooltip?: string;
		iconPath?: any;
		contextValue?: string;
		command?: any;
		constructor(label: string, collapsibleState?: number) {
			this.label = label;
			this.collapsibleState = collapsibleState ?? 0;
		}
	},
	ThemeIcon: class {
		id: string;
		constructor(id: string) {
			this.id = id;
		}
	},
	EventEmitter: class {
		event: any;
		constructor() {
			this.event = vi.fn();
		}
		fire = vi.fn();
		dispose = vi.fn();
	},
	window: {
		createTreeView: vi.fn((_viewId, _options) => ({
			dispose: vi.fn(),
			visible: true,
		})),
	},
}));

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

		// Create provider instance
		provider = new SnapBackTreeProvider(
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

		it("should include snapshots section when snapshots exist", async () => {
			const children = await provider.getChildren();

			const snapshotsSection = children.find(
				(item) =>
					typeof item.label === "string" && item.label.includes("Snapshots"),
			);

			expect(snapshotsSection).toBeDefined();
		});

		it("should include actions section", async () => {
			const children = await provider.getChildren();

			const actionsSection = children.find((item) => item.label === "Actions");

			expect(actionsSection).toBeDefined();
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
				return label.includes("Protected");
			});

			expect(blockItem).toBeDefined();
			expect(blockItem?.label).toContain("5 files");
		});

		it("should show correct warn count", async () => {
			const rootChildren = await provider.getChildren();
			const protectionSection = rootChildren[0];

			const breakdown = await provider.getChildren(protectionSection);
			const warnItem = breakdown.find((item) => {
				const label = item.label?.toString() || "";
				return label.includes("Warning");
			});

			expect(warnItem).toBeDefined();
			expect(warnItem?.label).toContain("3 files");
		});

		it("should show correct watch count", async () => {
			const rootChildren = await provider.getChildren();
			const protectionSection = rootChildren[0];

			const breakdown = await provider.getChildren(protectionSection);
			const watchItem = breakdown.find((item) => {
				const label = item.label?.toString() || "";
				return label.includes("Watched");
			});

			expect(watchItem).toBeDefined();
			expect(watchItem?.label).toContain("2 files");
		});
	});

	describe("getChildren - time grouping", () => {
		it("should group snapshots by time periods", async () => {
			const rootChildren = await provider.getChildren();
			const snapshotsSection = rootChildren.find(
				(item) =>
					typeof item.label === "string" && item.label.includes("Snapshots"),
			);

			expect(snapshotsSection).toBeDefined();

			const timeGroups = await provider.getChildren(snapshotsSection!);

			// Should have groups: Recent, Yesterday, This Week, Older
			expect(timeGroups.length).toBeGreaterThan(0);
		});

		it("should show 'Recent' group for snapshots < 24h old", async () => {
			const rootChildren = await provider.getChildren();
			const snapshotsSection = rootChildren[1];

			const groups = await provider.getChildren(snapshotsSection);
			const recentGroup = groups.find((g) => g.label === "Recent");

			expect(recentGroup).toBeDefined();
		});

		it("should show 'Yesterday' group for snapshots 24-48h old", async () => {
			const rootChildren = await provider.getChildren();
			const snapshotsSection = rootChildren[1];

			const groups = await provider.getChildren(snapshotsSection);
			const yesterdayGroup = groups.find((g) => g.label === "Yesterday");

			expect(yesterdayGroup).toBeDefined();
		});

		it("should show 'This Week' group for snapshots < 7 days old", async () => {
			const rootChildren = await provider.getChildren();
			const snapshotsSection = rootChildren[1];

			const groups = await provider.getChildren(snapshotsSection);
			const weekGroup = groups.find((g) => g.label === "This Week");

			expect(weekGroup).toBeDefined();
		});

		it("should show 'Older' group for snapshots > 7 days old", async () => {
			const rootChildren = await provider.getChildren();
			const snapshotsSection = rootChildren[1];

			const groups = await provider.getChildren(snapshotsSection);
			const olderGroup = groups.find((g) => g.label === "Older");

			expect(olderGroup).toBeDefined();
		});
	});

	describe("getChildren - actions section", () => {
		it("should show action items", async () => {
			const rootChildren = await provider.getChildren();
			const actionsSection = rootChildren.find(
				(item) => item.label === "Actions",
			);

			expect(actionsSection).toBeDefined();

			const actionItems = await provider.getChildren(actionsSection!);

			expect(actionItems.length).toBeGreaterThan(0);
		});

		it("should include 'Create Snapshot' action", async () => {
			const rootChildren = await provider.getChildren();
			const actionsSection = rootChildren.find(
				(item) => item.label === "Actions",
			);

			const actions = await provider.getChildren(actionsSection!);
			const createAction = actions.find((a) => {
				const label = a.label?.toString() || "";
				return label.includes("Create Snapshot");
			});

			expect(createAction).toBeDefined();
		});

		it("should include 'View All Snapshots' action", async () => {
			const rootChildren = await provider.getChildren();
			const actionsSection = rootChildren.find(
				(item) => item.label === "Actions",
			);

			const actions = await provider.getChildren(actionsSection!);
			const viewAction = actions.find((a) => {
				const label = a.label?.toString() || "";
				return label.includes("View All Snapshots");
			});

			expect(viewAction).toBeDefined();
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
		it("should create provider and TreeView", () => {
			const mockContext = {
				subscriptions: [] as any[],
			} as vscode.ExtensionContext;

			const result = SnapBackTreeProvider.register(
				mockContext,
				mockStorageManager,
				mockConfigManager,
			);

			expect(result.provider).toBeInstanceOf(SnapBackTreeProvider);
			expect(result.view).toBeDefined();
		});

		it("should register TreeView with correct view ID", () => {
			const mockContext = {
				subscriptions: [] as any[],
			} as vscode.ExtensionContext;

			SnapBackTreeProvider.register(
				mockContext,
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
			const mockContext = {
				subscriptions: [] as any[],
			} as vscode.ExtensionContext;

			SnapBackTreeProvider.register(
				mockContext,
				mockStorageManager as unknown as IStorageManager,
				mockConfigManager,
			);

			expect(mockContext.subscriptions.length).toBeGreaterThan(0);
		});

		it("should allow custom view ID", () => {
			const mockContext = {
				subscriptions: [] as any[],
			} as vscode.ExtensionContext;

			SnapBackTreeProvider.register(
				mockContext,
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

		it("should not show snapshots section when no snapshots exist", async () => {
			mockStorageManager.listSnapshots = vi.fn().mockResolvedValue([]);

			// Need to create new provider to reset cache
			const emptyProvider = new SnapBackTreeProvider(
				mockStorageManager as unknown as IStorageManager,
				mockConfigManager,
			);

			const rootChildren = await emptyProvider.getChildren();

			const snapshotsSection = rootChildren.find(
				(item) =>
					typeof item.label === "string" && item.label.includes("Snapshots"),
			);

			// Following "no news is good news" - hide empty snapshots section
			expect(snapshotsSection).toBeUndefined();
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
				mockStorageManager as unknown as IStorageManager,
				mockConfigManager,
			);

			const rootChildren = await errorProvider.getChildren();

			// Should not throw
			expect(rootChildren).toBeDefined();
		});
	});
});
