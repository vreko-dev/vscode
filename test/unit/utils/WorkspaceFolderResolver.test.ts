import { describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { WorkspaceFolderResolver } from "@vscode/utils/WorkspaceFolderResolver";

describe("WorkspaceFolderResolver", () => {
	describe("getWorkspaceFolderForFile", () => {
		it("should return correct workspace folder for file URI", () => {
			// Given: Multi-root workspace with 2 folders
			const folder1 = createMockWorkspaceFolder("/project1");
			const folder2 = createMockWorkspaceFolder("/project2");
			const mockWorkspace = [folder1, folder2];

			// When: File is in project2
			const fileUri = vscode.Uri.file("/project2/src/index.ts");
			const resolver = new WorkspaceFolderResolver(mockWorkspace);

			// Then: Should return folder2
			const result = resolver.getWorkspaceFolderForFile(fileUri);
			expect(result).toBe(folder2);
		});

		it("should return null for file outside workspace", () => {
			// Given: Workspace with 1 folder
			const folder = createMockWorkspaceFolder("/project");
			const resolver = new WorkspaceFolderResolver([folder]);

			// When: File is outside workspace
			const fileUri = vscode.Uri.file("/external/file.ts");

			// Then: Should return null
			const result = resolver.getWorkspaceFolderForFile(fileUri);
			expect(result).toBeNull();
		});

		it("should handle nested workspace folders correctly", () => {
			// Given: Nested workspace folders
			const parentFolder = createMockWorkspaceFolder("/monorepo");
			const childFolder = createMockWorkspaceFolder("/monorepo/packages/app");
			const resolver = new WorkspaceFolderResolver([parentFolder, childFolder]);

			// When: File is in child folder
			const fileUri = vscode.Uri.file("/monorepo/packages/app/src/index.ts");

			// Then: Should return most specific folder (child)
			const result = resolver.getWorkspaceFolderForFile(fileUri);
			expect(result).toBe(childFolder);
		});

		it("should handle Windows-style paths", () => {
			// Given: Windows paths
			const folder = createMockWorkspaceFolder("C:\\Users\\test\\project");
			const resolver = new WorkspaceFolderResolver([folder]);

			// When: File with Windows path
			const fileUri = vscode.Uri.file(
				"C:\\Users\\test\\project\\src\\index.ts",
			);

			// Then: Should resolve correctly
			const result = resolver.getWorkspaceFolderForFile(fileUri);
			expect(result).toBe(folder);
		});
	});

	describe("getAllWorkspaceFolders", () => {
		it("should return all workspace folders sorted by depth", () => {
			const shallow = createMockWorkspaceFolder("/project");
			const deep = createMockWorkspaceFolder("/project/nested/deep");
			const medium = createMockWorkspaceFolder("/project/nested");
			const resolver = new WorkspaceFolderResolver([shallow, deep, medium]);

			const folders = resolver.getAllWorkspaceFolders();

			// Should return deepest first for specificity
			expect(folders[0]).toBe(deep);
			expect(folders[1]).toBe(medium);
			expect(folders[2]).toBe(shallow);
		});

		it("should return empty array when no workspaces", () => {
			const resolver = new WorkspaceFolderResolver([]);
			expect(resolver.getAllWorkspaceFolders()).toEqual([]);
		});
	});

	describe("requireSingleWorkspace", () => {
		it("should return workspace folder when exactly one exists", async () => {
			const folder = createMockWorkspaceFolder("/project");
			const resolver = new WorkspaceFolderResolver([folder]);

			const result = await resolver.requireSingleWorkspace();
			expect(result).toBe(folder);
		});

		it("should throw error when no workspace folders exist", async () => {
			const resolver = new WorkspaceFolderResolver([]);

			await expect(resolver.requireSingleWorkspace()).rejects.toThrow(
				"SnapBack requires an open workspace folder",
			);
		});

		it("should prompt user to select when multiple workspaces exist", async () => {
			const folder1 = createMockWorkspaceFolder("/project1");
			const folder2 = createMockWorkspaceFolder("/project2");
			const resolver = new WorkspaceFolderResolver([folder1, folder2]);

			// Mock user selection
			const showWorkspaceFolderPickSpy = vi.spyOn(
				vscode.window,
				"showWorkspaceFolderPick",
			);
			showWorkspaceFolderPickSpy.mockResolvedValue(folder1);

			const result = await resolver.requireSingleWorkspace();

			expect(result).toBe(folder1);
			expect(showWorkspaceFolderPickSpy).toHaveBeenCalledWith({
				placeHolder: "Select workspace folder for SnapBack",
				ignoreFocusOut: true,
			});
		});

		it("should throw error when user cancels selection", async () => {
			const folder1 = createMockWorkspaceFolder("/project1");
			const folder2 = createMockWorkspaceFolder("/project2");
			const resolver = new WorkspaceFolderResolver([folder1, folder2]);

			// Mock user cancellation
			vi.spyOn(vscode.window, "showWorkspaceFolderPick").mockResolvedValue(
				undefined,
			);

			await expect(resolver.requireSingleWorkspace()).rejects.toThrow(
				"No workspace folder selected",
			);
		});
	});

	describe("clearCache", () => {
		it("should clear cached workspace folder lookups", () => {
			const folder = createMockWorkspaceFolder("/project");
			const resolver = new WorkspaceFolderResolver([folder]);
			const fileUri = vscode.Uri.file("/project/src/index.ts");

			// First lookup (uncached)
			const result1 = resolver.getWorkspaceFolderForFile(fileUri);
			expect(result1).toBe(folder);

			// Clear cache
			resolver.clearCache();

			// Should still work after cache clear
			const result2 = resolver.getWorkspaceFolderForFile(fileUri);
			expect(result2).toBe(folder);
		});
	});
});

// Test helper
function createMockWorkspaceFolder(path: string): vscode.WorkspaceFolder {
	return {
		uri: vscode.Uri.file(path),
		name: path.split(/[/\\]/).pop() || "root",
		index: 0,
	};
}
