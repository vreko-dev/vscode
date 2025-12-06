import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { SnapBackExplorerTreeProvider } from "../../../src/views/explorerTree/SnapBackExplorerTreeProvider";
import type {
	SnapBackTreeNode,
	WorkspaceSafetyResponse,
	WorkspaceSnapshotsResponse,
} from "../../../src/views/explorerTree/types";

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

// Mock logger
vi.mock("@snapback/infrastructure", () => ({
	logger: {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}));

// Mock interfaces
interface MockAuthedApiClient {
	fetch: <T>(endpoint: string) => Promise<T>;
}

interface MockCredentialsManager {
	getCredentials: () => Promise<{ accessToken: string } | null>;
	clearCredentials: () => Promise<void>;
}

describe("SnapBackExplorerTreeProvider", () => {
	let provider: SnapBackExplorerTreeProvider;
	let mockApiClient: MockAuthedApiClient;
	let mockCredentialsManager: MockCredentialsManager;

	// Sample test data
	const mockSafetyResponse: WorkspaceSafetyResponse = {
		blockingIssues: [
			{
				id: "issue-1",
				kind: "blocking",
				message: "Critical security vulnerability detected",
				severity: "high",
				createdAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(), // 30 min ago
				filePath: "/src/auth/login.ts",
			},
			{
				id: "issue-2",
				kind: "blocking",
				message: "Type error in user model",
				severity: "medium",
				createdAt: new Date(Date.now() - 1000 * 60 * 60).toISOString(), // 1 hour ago
				filePath: "/src/models/user.ts",
			},
		],
		watchItems: [
			{
				id: "watch-1",
				kind: "watch",
				message: "Deprecated API usage detected",
				severity: "low",
				createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(), // 2 hours ago
			},
		],
	};

	const mockSnapshotsResponse: WorkspaceSnapshotsResponse = {
		total: 42,
		recommendedRecoveryPoints: [
			{
				id: "snap-1",
				reason: "Before major refactor",
				createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(), // 1 day ago
				trigger: "manual",
				branch: "main",
				label: "Pre-refactor checkpoint",
			},
			{
				id: "snap-2",
				reason: "Stable build",
				createdAt: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(), // 2 days ago
				trigger: "auto",
				branch: "develop",
				label: "Build #142",
			},
		],
		activeBranches: [
			{
				branch: "main",
				snapshots: 15,
				lastSnapshotAgeSeconds: 3600, // 1 hour
				status: "healthy",
			},
			{
				branch: "feature/new-ui",
				snapshots: 8,
				lastSnapshotAgeSeconds: 7200, // 2 hours
				status: "needs_snapshot",
			},
		],
		cleanupCandidates: [
			{
				id: "snap-old-1",
				reason: "Stale feature branch",
				ageSeconds: 2592000, // 30 days
				storageBytes: 5242880, // 5 MB
			},
		],
	};

	beforeEach(() => {
		vi.clearAllMocks();

		// Create mock API client
		mockApiClient = {
			fetch: vi.fn(),
		};

		// Create mock credentials manager (authenticated by default)
		mockCredentialsManager = {
			getCredentials: vi.fn().mockResolvedValue({ accessToken: "test-token" }),
			clearCredentials: vi.fn().mockResolvedValue(undefined),
		};

		// Create provider instance
		provider = new SnapBackExplorerTreeProvider(
			mockApiClient as any,
			mockCredentialsManager as any,
		);
	});

	afterEach(() => {
		provider.dispose();
	});

	describe("constructor", () => {
		it("should initialize with empty caches", () => {
			expect(provider).toBeDefined();
			expect(provider.safetyCache).toBeNull();
			expect(provider.snapshotsCache).toBeNull();
			expect(provider.lastUpdatedAt).toBeNull();
		});

		it("should initialize EventEmitter for tree data changes", () => {
			expect(provider.onDidChangeTreeData).toBeDefined();
		});
	});

	describe("refresh", () => {
		it("should clear all caches", () => {
			// Set cache data
			provider.safetyCache = mockSafetyResponse;
			provider.snapshotsCache = mockSnapshotsResponse;
			provider.lastUpdatedAt = new Date();

			provider.refresh();

			expect(provider.safetyCache).toBeNull();
			expect(provider.snapshotsCache).toBeNull();
			expect(provider.lastUpdatedAt).toBeNull();
		});

		it("should fire onDidChangeTreeData event", () => {
			const fireSpy = vi.spyOn(provider._onDidChangeTreeData, "fire");

			provider.refresh();

			expect(fireSpy).toHaveBeenCalledWith(undefined);
		});
	});

	describe("getTreeItem", () => {
		it("should convert node to TreeItem with label", () => {
			const node: SnapBackTreeNode = {
				id: "test",
				kind: "section",
				label: "Test Section",
				collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
			};

			const item = provider.getTreeItem(node);

			expect(item.label).toBe("Test Section");
			expect(item.collapsibleState).toBe(
				vscode.TreeItemCollapsibleState.Collapsed,
			);
		});

		it("should include description when present", () => {
			const node: SnapBackTreeNode = {
				id: "test",
				kind: "section",
				label: "Test Section",
				description: "Test Description",
				collapsibleState: vscode.TreeItemCollapsibleState.None,
			};

			const item = provider.getTreeItem(node);

			expect(item.description).toBe("Test Description");
		});

		it("should include icon when present", () => {
			const node: SnapBackTreeNode = {
				id: "test",
				kind: "section",
				label: "Test Section",
				icon: "shield",
				collapsibleState: vscode.TreeItemCollapsibleState.None,
			};

			const item = provider.getTreeItem(node);

			expect(item.iconPath).toBeDefined();
			expect((item.iconPath as any).id).toBe("shield");
		});

		it("should set contextValue for blocking issue nodes", () => {
			const node: SnapBackTreeNode = {
				id: "issue-1",
				kind: "blockingIssue",
				label: "Test Issue",
				filePath: "/test.ts",
				collapsibleState: vscode.TreeItemCollapsibleState.None,
			};

			const item = provider.getTreeItem(node);

			expect(item.contextValue).toBe("blockingIssue");
		});

		it("should set contextValue for snapshot nodes", () => {
			const node: SnapBackTreeNode = {
				id: "snap-1",
				kind: "snapshot",
				label: "Test Snapshot",
				snapshotId: "snap-1",
				collapsibleState: vscode.TreeItemCollapsibleState.None,
			};

			const item = provider.getTreeItem(node);

			expect(item.contextValue).toBe("snapshot");
		});
	});

	describe("getChildren - unauthenticated", () => {
		beforeEach(() => {
			// Mock unauthenticated state
			mockCredentialsManager.getCredentials = vi.fn().mockResolvedValue(null);
			provider = new SnapBackExplorerTreeProvider(
				mockApiClient as any,
				mockCredentialsManager as any,
			);
		});

		it("should show connect node when not authenticated", async () => {
			const children = await provider.getChildren();

			expect(children).toHaveLength(1);
			expect(children[0].kind).toBe("section");
			expect(children[0].label).toBe("Connect SnapBack Account");
			expect(children[0].icon).toBe("account");
		});
	});

	describe("getChildren - authenticated root", () => {
		it("should show status node and sections when authenticated", async () => {
			const children = await provider.getChildren();

			expect(children.length).toBeGreaterThan(1);
			expect(children[0].kind).toBe("rootStatus");
			expect(children[0].label).toContain("Last updated");
		});

		it("should include workspace safety section", async () => {
			const children = await provider.getChildren();

			const safetySection = children.find(
				(node) => node.kind === "section" && node.section === "workspaceSafety",
			);

			expect(safetySection).toBeDefined();
			expect(safetySection?.label).toBe("Workspace Safety");
			expect(safetySection?.icon).toBe("shield");
		});

		it("should include snapshots section", async () => {
			const children = await provider.getChildren();

			const snapshotsSection = children.find(
				(node) => node.kind === "section" && node.section === "snapshots",
			);

			expect(snapshotsSection).toBeDefined();
			expect(snapshotsSection?.label).toBe("Snapshots");
			expect(snapshotsSection?.icon).toBe("history");
		});
	});

	describe("getChildren - workspace safety section", () => {
		beforeEach(() => {
			mockApiClient.fetch = vi.fn().mockResolvedValue(mockSafetyResponse);
		});

		it("should fetch safety data from API", async () => {
			const sectionNode: SnapBackTreeNode = {
				id: "workspaceSafety",
				kind: "section",
				section: "workspaceSafety",
				label: "Workspace Safety",
				collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
			};

			await provider.getChildren(sectionNode);

			expect(mockApiClient.fetch).toHaveBeenCalledWith(
				"/api/v1/workspace/safety",
			);
		});

		it("should include blocking issues group", async () => {
			const sectionNode: SnapBackTreeNode = {
				id: "workspaceSafety",
				kind: "section",
				section: "workspaceSafety",
				label: "Workspace Safety",
				collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
			};

			const children = await provider.getChildren(sectionNode);

			const blockingGroup = children.find(
				(node) => node.id === "blockingIssues",
			);
			expect(blockingGroup).toBeDefined();
			expect(blockingGroup?.label).toBe("Blocking Issues (2)");
			expect(blockingGroup?.icon).toBe("error");
		});

		it("should include blocking issue nodes", async () => {
			const sectionNode: SnapBackTreeNode = {
				id: "workspaceSafety",
				kind: "section",
				section: "workspaceSafety",
				label: "Workspace Safety",
				collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
			};

			const children = await provider.getChildren(sectionNode);

			const issueNodes = children.filter(
				(node) => node.kind === "blockingIssue",
			);
			expect(issueNodes).toHaveLength(2);
			expect(issueNodes[0].label).toBe(
				"Critical security vulnerability detected",
			);
			expect(issueNodes[0].filePath).toBe("/src/auth/login.ts");
		});

		it("should include watch items group", async () => {
			const sectionNode: SnapBackTreeNode = {
				id: "workspaceSafety",
				kind: "section",
				section: "workspaceSafety",
				label: "Workspace Safety",
				collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
			};

			const children = await provider.getChildren(sectionNode);

			const watchGroup = children.find((node) => node.id === "watchItems");
			expect(watchGroup).toBeDefined();
			expect(watchGroup?.label).toBe("Watch Items (1)");
			expect(watchGroup?.icon).toBe("eye");
		});

		it("should cache safety data after first fetch", async () => {
			const sectionNode: SnapBackTreeNode = {
				id: "workspaceSafety",
				kind: "section",
				section: "workspaceSafety",
				label: "Workspace Safety",
				collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
			};

			// First call
			await provider.getChildren(sectionNode);
			// Second call
			await provider.getChildren(sectionNode);

			// API should only be called once (cached on second call)
			expect(mockApiClient.fetch).toHaveBeenCalledTimes(1);
		});
	});

	describe("getChildren - snapshots section", () => {
		beforeEach(() => {
			mockApiClient.fetch = vi.fn().mockResolvedValue(mockSnapshotsResponse);
		});

		it("should fetch snapshots data from API", async () => {
			const sectionNode: SnapBackTreeNode = {
				id: "snapshots",
				kind: "section",
				section: "snapshots",
				label: "Snapshots",
				collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
			};

			await provider.getChildren(sectionNode);

			expect(mockApiClient.fetch).toHaveBeenCalledWith(
				"/api/v1/workspace/snapshots",
			);
		});

		it("should include total snapshots node", async () => {
			const sectionNode: SnapBackTreeNode = {
				id: "snapshots",
				kind: "section",
				section: "snapshots",
				label: "Snapshots",
				collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
			};

			const children = await provider.getChildren(sectionNode);

			const totalNode = children.find((node) => node.id === "snapshotsTotal");
			expect(totalNode).toBeDefined();
			expect(totalNode?.label).toBe("Total Snapshots: 42");
		});

		it("should include recommended recovery points", async () => {
			const sectionNode: SnapBackTreeNode = {
				id: "snapshots",
				kind: "section",
				section: "snapshots",
				label: "Snapshots",
				collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
			};

			const children = await provider.getChildren(sectionNode);

			const recoveryNodes = children.filter(
				(node) => node.kind === "snapshot" && node.icon === "star-full",
			);
			expect(recoveryNodes).toHaveLength(2);
			expect(recoveryNodes[0].label).toBe("Pre-refactor checkpoint");
			expect(recoveryNodes[0].snapshotId).toBe("snap-1");
		});

		it("should include active branches group", async () => {
			const sectionNode: SnapBackTreeNode = {
				id: "snapshots",
				kind: "section",
				section: "snapshots",
				label: "Snapshots",
				collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
			};

			const children = await provider.getChildren(sectionNode);

			const branchGroup = children.find((node) => node.id === "activeBranches");
			expect(branchGroup).toBeDefined();
			expect(branchGroup?.label).toContain("Active Branches (2)");
		});

		it("should include cleanup candidates group", async () => {
			const sectionNode: SnapBackTreeNode = {
				id: "snapshots",
				kind: "section",
				section: "snapshots",
				label: "Snapshots",
				collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
			};

			const children = await provider.getChildren(sectionNode);

			const cleanupGroup = children.find(
				(node) => node.id === "cleanupCandidates",
			);
			expect(cleanupGroup).toBeDefined();
			expect(cleanupGroup?.label).toContain("Cleanup Candidates (1)");
		});

		it("should cache snapshots data after first fetch", async () => {
			const sectionNode: SnapBackTreeNode = {
				id: "snapshots",
				kind: "section",
				section: "snapshots",
				label: "Snapshots",
				collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
			};

			// First call
			await provider.getChildren(sectionNode);
			// Second call
			await provider.getChildren(sectionNode);

			// API should only be called once
			expect(mockApiClient.fetch).toHaveBeenCalledTimes(1);
		});
	});

	describe("error handling", () => {
		it("should handle session expiry", async () => {
			const sessionError = new Error("Session expired");
			mockApiClient.fetch = vi.fn().mockRejectedValue(sessionError);

			const sectionNode: SnapBackTreeNode = {
				id: "workspaceSafety",
				kind: "section",
				section: "workspaceSafety",
				label: "Workspace Safety",
				collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
			};

			const children = await provider.getChildren(sectionNode);

			expect(children).toHaveLength(1);
			expect(children[0].kind).toBe("section");
			expect(children[0].label).toBe("Session Expired");
			expect(mockCredentialsManager.clearCredentials).toHaveBeenCalled();
		});

		it("should handle generic API errors", async () => {
			const apiError = new Error("Network timeout");
			mockApiClient.fetch = vi.fn().mockRejectedValue(apiError);

			const sectionNode: SnapBackTreeNode = {
				id: "snapshots",
				kind: "section",
				section: "snapshots",
				label: "Snapshots",
				collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
			};

			const children = await provider.getChildren(sectionNode);

			expect(children).toHaveLength(1);
			expect(children[0].kind).toBe("section");
			expect(children[0].label).toBe("Error loading data");
			expect(children[0].description).toBe("Network timeout");
		});

		it("should refresh tree on session expiry", async () => {
			const sessionError = new Error("Session expired");
			mockApiClient.fetch = vi.fn().mockRejectedValue(sessionError);
			const fireSpy = vi.spyOn(provider._onDidChangeTreeData, "fire");

			const sectionNode: SnapBackTreeNode = {
				id: "workspaceSafety",
				kind: "section",
				section: "workspaceSafety",
				label: "Workspace Safety",
				collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
			};

			await provider.getChildren(sectionNode);

			expect(fireSpy).toHaveBeenCalledWith(undefined);
		});
	});

	describe("dispose", () => {
		it("should dispose EventEmitter", () => {
			const disposeSpy = vi.spyOn(provider._onDidChangeTreeData, "dispose");

			provider.dispose();

			expect(disposeSpy).toHaveBeenCalled();
		});
	});

	describe("leaf nodes", () => {
		it("should return empty array for group nodes", async () => {
			const groupNode: SnapBackTreeNode = {
				id: "blockingIssues",
				kind: "group",
				label: "Blocking Issues (0)",
				collapsibleState: vscode.TreeItemCollapsibleState.None,
			};

			const children = await provider.getChildren(groupNode);

			expect(children).toEqual([]);
		});

		it("should return empty array for blocking issue nodes", async () => {
			const issueNode: SnapBackTreeNode = {
				id: "issue-1",
				kind: "blockingIssue",
				label: "Test Issue",
				filePath: "/test.ts",
				collapsibleState: vscode.TreeItemCollapsibleState.None,
			};

			const children = await provider.getChildren(issueNode);

			expect(children).toEqual([]);
		});

		it("should return empty array for snapshot nodes", async () => {
			const snapshotNode: SnapBackTreeNode = {
				id: "snap-1",
				kind: "snapshot",
				label: "Test Snapshot",
				snapshotId: "snap-1",
				collapsibleState: vscode.TreeItemCollapsibleState.None,
			};

			const children = await provider.getChildren(snapshotNode);

			expect(children).toEqual([]);
		});
	});
});
