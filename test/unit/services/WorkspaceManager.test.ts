import { beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { WorkspaceManager } from "../../../src/services/WorkspaceManager";
import type { FileSystemStorage } from "../../../src/storage/types";

describe("WorkspaceManager", () => {
	let mockStorage: FileSystemStorage;
	let manager: WorkspaceManager;

	beforeEach(() => {
		// Create mock storage
		mockStorage = {
			getRecentFiles: vi.fn().mockResolvedValue([]),
			addRecentFile: vi.fn().mockResolvedValue(undefined),
			getRecentBranches: vi.fn().mockResolvedValue([]),
			addRecentBranch: vi.fn().mockResolvedValue(undefined),
			getProtectionStatus: vi.fn().mockResolvedValue("watch"),
			setProtectionStatus: vi.fn().mockResolvedValue(undefined),
		} as unknown as FileSystemStorage;
	});

	describe("constructor", () => {
		it("should initialize with provided workspace folders", () => {
			const folder = {
				uri: vscode.Uri.file("/project"),
				name: "project",
				index: 0,
			};

			manager = new WorkspaceManager([folder], mockStorage);

			expect(manager.hasWorkspace()).toBe(true);
			expect(manager.getWorkspaceCount()).toBe(1);
		});

		it("should initialize with empty workspace folders", () => {
			manager = new WorkspaceManager([], mockStorage);

			expect(manager.hasWorkspace()).toBe(false);
			expect(manager.getWorkspaceCount()).toBe(0);
		});

		it("should initialize with multiple workspace folders", () => {
			const folders = [
				{
					uri: vscode.Uri.file("/monorepo"),
					name: "monorepo",
					index: 0,
				},
				{
					uri: vscode.Uri.file("/monorepo/packages/app"),
					name: "app",
					index: 1,
				},
			];

			manager = new WorkspaceManager(folders, mockStorage);

			expect(manager.hasWorkspace()).toBe(true);
			expect(manager.getWorkspaceCount()).toBe(2);
			expect(manager.hasMultipleWorkspaces()).toBe(true);
		});
	});

	describe("getWorkspaceFolderForFile", () => {
		it("should return correct workspace folder for file", () => {
			const folder = {
				uri: vscode.Uri.file("/project"),
				name: "project",
				index: 0,
			};

			manager = new WorkspaceManager([folder], mockStorage);

			const fileUri = vscode.Uri.file("/project/src/index.ts");
			const result = manager.getWorkspaceFolderForFile(fileUri);

			expect(result).toBe(folder);
		});

		it("should return null for file outside workspace", () => {
			const folder = {
				uri: vscode.Uri.file("/project"),
				name: "project",
				index: 0,
			};

			manager = new WorkspaceManager([folder], mockStorage);

			const fileUri = vscode.Uri.file("/external/file.ts");
			const result = manager.getWorkspaceFolderForFile(fileUri);

			expect(result).toBeNull();
		});

		it("should return most specific folder in nested workspaces", () => {
			const rootFolder = {
				uri: vscode.Uri.file("/monorepo"),
				name: "monorepo",
				index: 0,
			};
			const nestedFolder = {
				uri: vscode.Uri.file("/monorepo/packages/app"),
				name: "app",
				index: 1,
			};

			manager = new WorkspaceManager([rootFolder, nestedFolder], mockStorage);

			const fileUri = vscode.Uri.file("/monorepo/packages/app/src/index.ts");
			const result = manager.getWorkspaceFolderForFile(fileUri);

			expect(result).toBe(nestedFolder);
		});
	});

	describe("requireSingleWorkspace", () => {
		it("should throw if no workspace folders exist", async () => {
			manager = new WorkspaceManager([], mockStorage);

			await expect(manager.requireSingleWorkspace()).rejects.toThrow(
				"SnapBack requires an open workspace folder",
			);
		});

		it("should return single workspace without prompt", async () => {
			const folder = {
				uri: vscode.Uri.file("/project"),
				name: "project",
				index: 0,
			};

			manager = new WorkspaceManager([folder], mockStorage);

			const result = await manager.requireSingleWorkspace();

			expect(result).toBe(folder);
		});

		it("should prompt user when multiple workspaces exist", async () => {
			const folder1 = {
				uri: vscode.Uri.file("/project1"),
				name: "project1",
				index: 0,
			};
			const folder2 = {
				uri: vscode.Uri.file("/project2"),
				name: "project2",
				index: 1,
			};

			manager = new WorkspaceManager([folder1, folder2], mockStorage);

			// Mock user selection
			vi.spyOn(vscode.window, "showWorkspaceFolderPick").mockResolvedValue(
				folder1,
			);

			const result = await manager.requireSingleWorkspace();

			expect(result).toBe(folder1);
			expect(vscode.window.showWorkspaceFolderPick).toHaveBeenCalledWith({
				placeHolder: "Select workspace folder for SnapBack",
				ignoreFocusOut: true,
			});
		});

		it("should throw when user cancels selection", async () => {
			const folder1 = {
				uri: vscode.Uri.file("/project1"),
				name: "project1",
				index: 0,
			};
			const folder2 = {
				uri: vscode.Uri.file("/project2"),
				name: "project2",
				index: 1,
			};

			manager = new WorkspaceManager([folder1, folder2], mockStorage);

			// Mock user cancellation
			vi.spyOn(vscode.window, "showWorkspaceFolderPick").mockResolvedValue(
				undefined,
			);

			await expect(manager.requireSingleWorkspace()).rejects.toThrow(
				"No workspace folder selected",
			);
		});
	});

	describe("workspace-specific memory operations", () => {
		beforeEach(() => {
			const folder = {
				uri: vscode.Uri.file("/project"),
				name: "project",
				index: 0,
			};

			manager = new WorkspaceManager([folder], mockStorage);
		});

		describe("getRecentFiles", () => {
			it("should delegate to storage with workspace root", async () => {
				const mockFiles = ["/project/src/index.ts", "/project/src/utils.ts"];
				mockStorage.getRecentFiles = vi.fn().mockResolvedValue(mockFiles);

				const fileUri = vscode.Uri.file("/project/src/index.ts");
				const result = await manager.getRecentFiles(fileUri);

				expect(result).toEqual(mockFiles);
				expect(mockStorage.getRecentFiles).toHaveBeenCalledWith("/project");
			});

			it("should throw if file is not in any workspace", async () => {
				const fileUri = vscode.Uri.file("/external/file.ts");

				await expect(manager.getRecentFiles(fileUri)).rejects.toThrow(
					"File is not in any workspace folder",
				);
			});
		});

		describe("addRecentFile", () => {
			it("should delegate to storage with workspace root", async () => {
				mockStorage.addRecentFile = vi.fn().mockResolvedValue(undefined);

				const fileUri = vscode.Uri.file("/project/src/index.ts");
				await manager.addRecentFile(fileUri);

				expect(mockStorage.addRecentFile).toHaveBeenCalledWith(
					"/project",
					"/project/src/index.ts",
				);
			});

			it("should throw if file is not in any workspace", async () => {
				const fileUri = vscode.Uri.file("/external/file.ts");

				await expect(manager.addRecentFile(fileUri)).rejects.toThrow(
					"File is not in any workspace folder",
				);
			});
		});

		describe("getRecentBranches", () => {
			it("should delegate to storage with workspace root", async () => {
				const mockBranches = ["main", "feature/test"];
				mockStorage.getRecentBranches = vi.fn().mockResolvedValue(mockBranches);

				const fileUri = vscode.Uri.file("/project/src/index.ts");
				const result = await manager.getRecentBranches(fileUri);

				expect(result).toEqual(mockBranches);
				expect(mockStorage.getRecentBranches).toHaveBeenCalledWith("/project");
			});
		});

		describe("addRecentBranch", () => {
			it("should delegate to storage with workspace root", async () => {
				mockStorage.addRecentBranch = vi.fn().mockResolvedValue(undefined);

				const fileUri = vscode.Uri.file("/project/src/index.ts");
				await manager.addRecentBranch(fileUri, "feature/new");

				expect(mockStorage.addRecentBranch).toHaveBeenCalledWith(
					"/project",
					"feature/new",
				);
			});
		});

		describe("getProtectionStatus", () => {
			it("should delegate to storage with workspace root and file path", async () => {
				mockStorage.getProtectionStatus = vi.fn().mockResolvedValue("block");

				const fileUri = vscode.Uri.file("/project/src/index.ts");
				const result = await manager.getProtectionStatus(fileUri);

				expect(result).toBe("block");
				expect(mockStorage.getProtectionStatus).toHaveBeenCalledWith(
					"/project",
					"/project/src/index.ts",
				);
			});
		});

		describe("setProtectionStatus", () => {
			it("should delegate to storage with workspace root and file path", async () => {
				mockStorage.setProtectionStatus = vi.fn().mockResolvedValue(undefined);

				const fileUri = vscode.Uri.file("/project/src/index.ts");
				await manager.setProtectionStatus(fileUri, "warn");

				expect(mockStorage.setProtectionStatus).toHaveBeenCalledWith(
					"/project",
					"/project/src/index.ts",
					"warn",
				);
			});
		});
	});

	describe("getAllWorkspaceFolders", () => {
		it("should return copy of all workspace folders", () => {
			const folders = [
				{
					uri: vscode.Uri.file("/project1"),
					name: "project1",
					index: 0,
				},
				{
					uri: vscode.Uri.file("/project2"),
					name: "project2",
					index: 1,
				},
			];

			manager = new WorkspaceManager(folders, mockStorage);

			const result = manager.getAllWorkspaceFolders();

			expect(result).toEqual(folders);
			expect(result).not.toBe(folders); // Should be a copy
		});
	});

	describe("dispose", () => {
		it("should dispose of workspace folder resolver", () => {
			const folder = {
				uri: vscode.Uri.file("/project"),
				name: "project",
				index: 0,
			};

			manager = new WorkspaceManager([folder], mockStorage);

			expect(() => manager.dispose()).not.toThrow();
		});

		it("should handle multiple dispose calls", () => {
			const folder = {
				uri: vscode.Uri.file("/project"),
				name: "project",
				index: 0,
			};

			manager = new WorkspaceManager([folder], mockStorage);

			manager.dispose();
			expect(() => manager.dispose()).not.toThrow();
		});
	});
});
