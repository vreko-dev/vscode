import { beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { ProtectedFilesTreeProvider } from "../../../src/views/ProtectedFilesTreeProvider";
import type {
	ProtectedFileEntry,
	ProtectedFileProvider,
} from "../../../src/views/types";

// Mock VS Code API
vi.mock("vscode", () => ({
	TreeItem: class TreeItem {
		constructor(
			public label: string,
			public collapsibleState?: number,
		) {}
		id?: string;
		contextValue?: string;
		iconPath?:
			| string
			| vscode.Uri
			| { light: string | vscode.Uri; dark: string | vscode.Uri }
			| vscode.ThemeIcon;
		description?: string;
		tooltip?: string | vscode.MarkdownString;
		command?: vscode.Command;
	},
	TreeItemCollapsibleState: {
		None: 0,
		Collapsed: 1,
		Expanded: 2,
	},
	ThemeIcon: class ThemeIcon {
		constructor(
			public id: string,
			public color?: vscode.ThemeColor,
		) {}
	},
	ThemeColor: class ThemeColor {
		constructor(public id: string) {}
	},
	MarkdownString: class MarkdownString {
		value = "";
		supportHtml = false;
		isTrusted = false;
		appendMarkdown(value: string) {
			this.value += value;
		}
	},
	Uri: {
		file: (path: string) => ({ fsPath: path, scheme: "file", path }),
	},
	EventEmitter: class EventEmitter<T> {
		private listeners: ((data: T) => void)[] = [];
		event = (listener: (data: T) => void) => {
			this.listeners.push(listener);
			return { dispose: () => {} };
		};
		fire(data: T) {
			this.listeners.forEach((l) => {
				l(data);
			});
		}
		dispose() {
			this.listeners = [];
		}
	},
	workspace: {
		workspaceFolders: [
			{
				uri: { fsPath: "/test/workspace" },
				name: "test-workspace",
				index: 0,
			},
		],
	},
}));

describe("ProtectedFilesTreeProvider", () => {
	let provider: ProtectedFilesTreeProvider;
	let mockRegistry: ProtectedFileProvider;
	let mockFiles: ProtectedFileEntry[];

	beforeEach(() => {
		// Reset mock files
		mockFiles = [];

		// Create mock registry
		mockRegistry = {
			list: vi.fn(async () => mockFiles),
			total: vi.fn(async () => mockFiles.length),
			onDidChangeProtectedFiles: vi.fn(() => ({ dispose: () => {} })),
		};

		// Create provider
		provider = new ProtectedFilesTreeProvider(mockRegistry);
	});

	describe("getChildren()", () => {
		it("should return empty array when no protected files", async () => {
			mockFiles = [];

			const children = await provider.getChildren();

			expect(children).toEqual([]);
			expect(mockRegistry.list).toHaveBeenCalled();
		});

		it("should return flat list of protected files", async () => {
			mockFiles = [
				{
					id: "file1",
					label: "file1.ts",
					path: "/test/workspace/file1.ts",
					protectionLevel: "watch",
					lastProtectedAt: Date.now(),
				},
				{
					id: "file2",
					label: "file2.ts",
					path: "/test/workspace/file2.ts",
					protectionLevel: "warn",
					lastProtectedAt: Date.now(),
				},
			];

			const children = await provider.getChildren();

			expect(children).toHaveLength(2);
			expect(children[0].label).toContain("file2.ts"); // Warn comes before Watch
			expect(children[1].label).toContain("file1.ts");
		});

		it("should sort by protection level (block > warn > watch)", async () => {
			mockFiles = [
				{
					id: "watch",
					label: "watch.ts",
					path: "/test/workspace/watch.ts",
					protectionLevel: "watch",
					lastProtectedAt: Date.now(),
				},
				{
					id: "block",
					label: "block.ts",
					path: "/test/workspace/block.ts",
					protectionLevel: "block",
					lastProtectedAt: Date.now(),
				},
				{
					id: "warn",
					label: "warn.ts",
					path: "/test/workspace/warn.ts",
					protectionLevel: "warn",
					lastProtectedAt: Date.now(),
				},
			];

			const children = await provider.getChildren();

			expect(children[0].label).toContain("block.ts");
			expect(children[1].label).toContain("warn.ts");
			expect(children[2].label).toContain("watch.ts");
		});

		it("should return no children for file items (flat list)", async () => {
			mockFiles = [
				{
					id: "file1",
					label: "file1.ts",
					path: "/test/workspace/file1.ts",
					protectionLevel: "watch",
					lastProtectedAt: Date.now(),
				},
			];

			const rootChildren = await provider.getChildren();
			expect(rootChildren).toHaveLength(1);

			// Tree items should have no children (flat list)
			const nestedChildren = await provider.getChildren(rootChildren[0]);
			expect(nestedChildren).toEqual([]);
		});

		it("should handle errors gracefully", async () => {
			vi.mocked(mockRegistry.list).mockRejectedValueOnce(
				new Error("Registry error"),
			);

			const children = await provider.getChildren();

			expect(children).toEqual([]);
		});
	});

	describe("Tree Item Properties", () => {
		it("should include hat emoji in label based on protection level", async () => {
			mockFiles = [
				{
					id: "watch",
					label: "watch.ts",
					path: "/test/workspace/watch.ts",
					protectionLevel: "watch",
					lastProtectedAt: Date.now(),
				},
				{
					id: "warn",
					label: "warn.ts",
					path: "/test/workspace/warn.ts",
					protectionLevel: "warn",
					lastProtectedAt: Date.now(),
				},
				{
					id: "block",
					label: "block.ts",
					path: "/test/workspace/block.ts",
					protectionLevel: "block",
					lastProtectedAt: Date.now(),
				},
			];

			const children = await provider.getChildren();

			// Block should be first
			expect(children[0].label).toBe("block.ts Block");

			// Warn should be second
			expect(children[1].label).toBe("warn.ts Warn");

			// Watch should be third
			expect(children[2].label).toBe("watch.ts Watch");
		});

		it("should set correct context value for menu integration", async () => {
			mockFiles = [
				{
					id: "file1",
					label: "file1.ts",
					path: "/test/workspace/file1.ts",
					protectionLevel: "watch",
					lastProtectedAt: Date.now(),
				},
			];

			const children = await provider.getChildren();

			expect(children[0].contextValue).toBe("snapback.item.protectedFile");
		});

		it("should include workspace-relative path in description", async () => {
			mockFiles = [
				{
					id: "file1",
					label: "file1.ts",
					path: "/test/workspace/src/lib/file1.ts",
					protectionLevel: "watch",
					lastProtectedAt: Date.now(),
				},
			];

			const children = await provider.getChildren();

			// Description should show directory path relative to workspace
			expect(children[0].description).toContain("src/lib");
		});

		it("should set click-to-open command", async () => {
			mockFiles = [
				{
					id: "file1",
					label: "file1.ts",
					path: "/test/workspace/file1.ts",
					protectionLevel: "watch",
					lastProtectedAt: Date.now(),
				},
			];

			const children = await provider.getChildren();

			expect(children[0].command).toBeDefined();
			expect(children[0].command?.command).toBe("snapback.openProtectedFile");
			expect(children[0].command?.arguments).toHaveLength(1);
		});

		it("should create rich tooltip with protection metadata", async () => {
			mockFiles = [
				{
					id: "file1",
					label: "file1.ts",
					path: "/test/workspace/file1.ts",
					protectionLevel: "watch",
					lastProtectedAt: Date.now(),
					lastCheckpointId: "checkpoint-123",
				},
			];

			const children = await provider.getChildren();

			expect(children[0].tooltip).toBeDefined();
			// Tooltip should be a MarkdownString with file details
			const tooltip = children[0].tooltip as vscode.MarkdownString;
			expect(tooltip.value).toContain("file1.ts");
			expect(tooltip.value).toContain("Watch");
			expect(tooltip.value).toContain("checkpoint-123");
		});
	});

	describe("refresh()", () => {
		it("should fire onDidChangeTreeData event", () => {
			const eventSpy = vi.fn();
			provider.onDidChangeTreeData(eventSpy);

			provider.refresh();

			expect(eventSpy).toHaveBeenCalledWith(undefined);
		});
	});

	describe("getTreeItem()", () => {
		it("should return the tree item unchanged", async () => {
			mockFiles = [
				{
					id: "file1",
					label: "file1.ts",
					path: "/test/workspace/file1.ts",
					protectionLevel: "watch",
					lastProtectedAt: Date.now(),
				},
			];

			const children = await provider.getChildren();
			const treeItem = provider.getTreeItem(children[0]);

			expect(treeItem).toBe(children[0]);
		});
	});

	describe("Registry Integration", () => {
		it("should subscribe to protection changes on construction", () => {
			expect(mockRegistry.onDidChangeProtectedFiles).toHaveBeenCalled();
		});

		it("should refresh when registry fires change event", () => {
			const refreshSpy = vi.spyOn(provider, "refresh");

			// Simulate registry firing change event
			const changeHandler = vi.mocked(mockRegistry.onDidChangeProtectedFiles)
				.mock.calls[0][0];
			if (changeHandler) {
				changeHandler();
			}

			expect(refreshSpy).toHaveBeenCalled();
		});
	});

	describe("Edge Cases", () => {
		it("should handle files without lastProtectedAt", async () => {
			mockFiles = [
				{
					id: "file1",
					label: "file1.ts",
					path: "/test/workspace/file1.ts",
					protectionLevel: "watch",
					// lastProtectedAt missing
				},
			];

			const children = await provider.getChildren();

			expect(children).toHaveLength(1);
			expect(children[0].label).toContain("file1.ts");
		});

		it("should handle files without lastCheckpointId", async () => {
			mockFiles = [
				{
					id: "file1",
					label: "file1.ts",
					path: "/test/workspace/file1.ts",
					protectionLevel: "watch",
					lastProtectedAt: Date.now(),
					// lastCheckpointId missing
				},
			];

			const children = await provider.getChildren();

			expect(children).toHaveLength(1);
			// Should not throw error
		});

		it("should default to watch level if protection level missing", async () => {
			mockFiles = [
				{
					id: "file1",
					label: "file1.ts",
					path: "/test/workspace/file1.ts",
					// protectionLevel missing
					lastProtectedAt: Date.now(),
				},
			];

			const children = await provider.getChildren();

			expect(children[0].label).toBe("file1.ts Watch");
		});

		it("should handle workspace without folders", async () => {
			// Override workspace mock
			(
				vscode.workspace as unknown as { workspaceFolders: undefined }
			).workspaceFolders = undefined;

			mockFiles = [
				{
					id: "file1",
					label: "file1.ts",
					path: "/test/workspace/file1.ts",
					protectionLevel: "watch",
					lastProtectedAt: Date.now(),
				},
			];

			const children = await provider.getChildren();

			// Should handle gracefully with empty description
			expect(children[0].description).toBe("");
		});
	});

	describe("Alphabetical Sorting Within Level", () => {
		it("should sort alphabetically within same protection level", async () => {
			mockFiles = [
				{
					id: "zebra",
					label: "zebra.ts",
					path: "/test/workspace/zebra.ts",
					protectionLevel: "watch",
					lastProtectedAt: Date.now(),
				},
				{
					id: "alpha",
					label: "alpha.ts",
					path: "/test/workspace/alpha.ts",
					protectionLevel: "watch",
					lastProtectedAt: Date.now(),
				},
				{
					id: "beta",
					label: "beta.ts",
					path: "/test/workspace/beta.ts",
					protectionLevel: "watch",
					lastProtectedAt: Date.now(),
				},
			];

			const children = await provider.getChildren();

			expect(children[0].label).toContain("alpha.ts");
			expect(children[1].label).toContain("beta.ts");
			expect(children[2].label).toContain("zebra.ts");
		});
	});
});
