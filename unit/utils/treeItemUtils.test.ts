import { describe, it, expect } from "vitest";
import * as vscode from "vscode";
import { extractTreeItemId, extractSnapshotId, createFileTreeItem, createFolderTreeItem } from "../../../src/utils/treeItemUtils";

describe("treeItemUtils", () => {
	describe("extractTreeItemId", () => {
		it("should extract ID from item.data.id when present", () => {
			const item = {
				id: "vreko:activity:snapshot:snap-123",
				data: { type: "snapshot" as const, id: "snap-123" },
			};

			const result = extractTreeItemId(item);

			expect(result).toBe("snap-123");
		});

		it("should fall back to item.id when data.id is not present", () => {
			const item = {
				id: "snap-456",
			};

			const result = extractTreeItemId(item);

			expect(result).toBe("snap-456");
		});

		it("should return undefined when item is undefined", () => {
			const result = extractTreeItemId(undefined);

			expect(result).toBeUndefined();
		});

		it("should return undefined when item has no id or data", () => {
			const item = {} as any;

			const result = extractTreeItemId(item);

			expect(result).toBeUndefined();
		});

		it("should handle tree item with data but no id in data", () => {
			const item = {
				id: "snap-789",
				data: { type: "snapshot" as const },
			};

			const result = extractTreeItemId(item);

			expect(result).toBe("snap-789");
		});
	});

	describe("extractSnapshotId", () => {
		it("should extract ID from snapshot tree item with data", () => {
			const item = {
				id: "vreko:activity:snapshot:snap-123",
				label: "My Snapshot",
				data: { type: "snapshot" as const, id: "snap-123" },
			};

			const result = extractSnapshotId(item);

			expect(result).toBe("snap-123");
		});

		it("should extract ID from direct command invocation (backward compatibility)", () => {
			const item = {
				id: "snap-456",
				label: "My Snapshot",
			};

			const result = extractSnapshotId(item);

			expect(result).toBe("snap-456");
		});

		it("should throw error when item is undefined", () => {
			expect(() => extractSnapshotId(undefined)).toThrow("Snapshot ID not found in tree item");
		});

		it("should throw error when item has no id", () => {
			const item = {
				label: "My Snapshot",
			} as any;

			expect(() => extractSnapshotId(item)).toThrow("Snapshot ID not found in tree item");
		});

		it("should handle the exact error case from bug report", () => {
			// Regression test for: "Failed to delete snapshot: Snapshot not found: vreko:activity:snapshot:snap-1765962781479-bg6b2i"
			const item = {
				id: "vreko:activity:snapshot:snap-1765962781479-bg6b2i",
				label: "test.ts",
				data: { type: "snapshot" as const, id: "snap-1765962781479-bg6b2i" },
			};

			const result = extractSnapshotId(item);

			expect(result).toBe("snap-1765962781479-bg6b2i");
			expect(result).not.toContain("vreko:activity:snapshot:");
		});
	});

	describe("type safety and contract validation", () => {
		it("should handle tree items with various data types", () => {
			const snapshotItem = {
				id: "display-id",
				data: { type: "snapshot" as const, id: "actual-id" },
			};

			const fileItem = {
				id: "display-id",
				data: { type: "file" as const, id: "file-id" },
			};

			expect(extractTreeItemId(snapshotItem)).toBe("actual-id");
			expect(extractTreeItemId(fileItem)).toBe("file-id");
		});

		it("should prioritize data.id over item.id when both exist", () => {
			const item = {
				id: "should-not-use-this",
				data: { type: "snapshot" as const, id: "should-use-this" },
			};

			const result = extractTreeItemId(item);

			expect(result).toBe("should-use-this");
			expect(result).not.toBe("should-not-use-this");
		});
	});

	describe("createFileTreeItem", () => {
		it("should create a tree item with resourceUri for file icon support", () => {
			const item = createFileTreeItem("test.ts", "/project/src/test.ts");

			expect(item.label).toBe("test.ts");
			expect(item.resourceUri).toBeDefined();
			expect(item.resourceUri?.fsPath).toBe("/project/src/test.ts");
			// Check iconPath is a ThemeIcon with id 'file'
			expect(item.iconPath).toMatchObject({ id: "file" });
			expect(item.tooltip).toBe("/project/src/test.ts");
		});

		it("should use None collapsible state by default", () => {
			const item = createFileTreeItem("test.ts", "/project/src/test.ts");

			expect(item.collapsibleState).toBe(vscode.TreeItemCollapsibleState.None);
		});

		it("should allow custom collapsible state", () => {
			const item = createFileTreeItem(
				"test.ts",
				"/project/src/test.ts",
				vscode.TreeItemCollapsibleState.Collapsed,
			);

			expect(item.collapsibleState).toBe(vscode.TreeItemCollapsibleState.Collapsed);
		});

		it("should handle relative file paths", () => {
			const item = createFileTreeItem("test.ts", "src/test.ts");

			expect(item.resourceUri?.fsPath).toContain("src/test.ts");
		});
	});

	describe("createFolderTreeItem", () => {
		it("should create a tree item with resourceUri for folder icon support", () => {
			const item = createFolderTreeItem("src", "/project/src");

			expect(item.label).toBe("src");
			expect(item.resourceUri).toBeDefined();
			expect(item.resourceUri?.fsPath).toBe("/project/src");
			// Check iconPath is a ThemeIcon with id 'folder'
			expect(item.iconPath).toMatchObject({ id: "folder" });
			expect(item.tooltip).toBe("/project/src");
		});

		it("should use Collapsed collapsible state by default", () => {
			const item = createFolderTreeItem("src", "/project/src");

			expect(item.collapsibleState).toBe(vscode.TreeItemCollapsibleState.Collapsed);
		});

		it("should allow custom collapsible state", () => {
			const item = createFolderTreeItem(
				"src",
				"/project/src",
				vscode.TreeItemCollapsibleState.Expanded,
			);

			expect(item.collapsibleState).toBe(vscode.TreeItemCollapsibleState.Expanded);
		});
	});
});
