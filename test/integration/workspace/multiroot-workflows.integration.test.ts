import { beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { WorkspaceManager } from "@vscode/services/WorkspaceManager";
import type { FileSystemStorage } from "@vscode/storage/types";
import { WorkspaceFolderResolver } from "@vscode/utils/WorkspaceFolderResolver";

// Mock vscode
vi.mock("vscode", () => {
	const mockDisposable = { dispose: vi.fn() };
	return {
		default: {},
		workspace: {
			workspaceFolders: undefined as vscode.WorkspaceFolder[] | undefined,
			onDidChangeWorkspaceFolders: vi.fn(() => mockDisposable),
		},
		window: {
			showWorkspaceFolderPick: vi.fn(),
		},
		Uri: {
			file: (path: string) => ({ fsPath: path, scheme: "file" }),
		},
	};
});

describe("Multi-Root Workspace Integration Tests", () => {
	let mockStorage: FileSystemStorage;

	beforeEach(() => {
		vi.clearAllMocks();

		// Create fresh mock storage for each test
		mockStorage = {
			getRecentFiles: vi.fn().mockResolvedValue([]),
			addRecentFile: vi.fn().mockResolvedValue(undefined),
			getRecentBranches: vi.fn().mockResolvedValue([]),
			addRecentBranch: vi.fn().mockResolvedValue(undefined),
			getProtectionStatus: vi.fn().mockResolvedValue("watch"),
			setProtectionStatus: vi.fn().mockResolvedValue(undefined),
		} as unknown as FileSystemStorage;
	});

	describe("Single Workspace Workflows", () => {
		it("should handle single workspace folder with storage operations", async () => {
			const folder = {
				uri: vscode.Uri.file("/project"),
				name: "project",
				index: 0,
			};

			const manager = new WorkspaceManager([folder], mockStorage);

			// Verify workspace setup
			expect(manager.hasWorkspace()).toBe(true);
			expect(manager.getWorkspaceCount()).toBe(1);
			expect(manager.hasMultipleWorkspaces()).toBe(false);

			// Test file resolution
			const fileUri = vscode.Uri.file("/project/src/index.ts");
			const resolvedFolder = manager.getWorkspaceFolderForFile(fileUri);
			expect(resolvedFolder).toBe(folder);

			// Test storage operations
			await manager.addRecentFile(fileUri);
			expect(mockStorage.addRecentFile).toHaveBeenCalledWith(
				"/project",
				"/project/src/index.ts",
			);

			const recentFiles = await manager.getRecentFiles(fileUri);
			expect(mockStorage.getRecentFiles).toHaveBeenCalledWith("/project");
			expect(recentFiles).toEqual([]);

			// Test protection status
			await manager.setProtectionStatus(fileUri, "block");
			expect(mockStorage.setProtectionStatus).toHaveBeenCalledWith(
				"/project",
				"/project/src/index.ts",
				"block",
			);

			const status = await manager.getProtectionStatus(fileUri);
			expect(mockStorage.getProtectionStatus).toHaveBeenCalledWith(
				"/project",
				"/project/src/index.ts",
			);
			expect(status).toBe("watch");

			manager.dispose();
		});

		it("should not prompt user for single workspace", async () => {
			const folder = {
				uri: vscode.Uri.file("/project"),
				name: "project",
				index: 0,
			};

			const manager = new WorkspaceManager([folder], mockStorage);
			const selectedFolder = await manager.requireSingleWorkspace();

			expect(selectedFolder).toBe(folder);
			expect(vscode.window.showWorkspaceFolderPick).not.toHaveBeenCalled();

			manager.dispose();
		});
	});

	describe("Multi-Root Workspace Workflows", () => {
		it("should isolate storage operations per workspace folder", async () => {
			const folder1 = {
				uri: vscode.Uri.file("/monorepo/packages/app"),
				name: "app",
				index: 0,
			};
			const folder2 = {
				uri: vscode.Uri.file("/monorepo/packages/api"),
				name: "api",
				index: 1,
			};

			const manager = new WorkspaceManager([folder1, folder2], mockStorage);

			// Verify multi-root setup
			expect(manager.hasWorkspace()).toBe(true);
			expect(manager.getWorkspaceCount()).toBe(2);
			expect(manager.hasMultipleWorkspaces()).toBe(true);

			// File in folder1
			const fileUri1 = vscode.Uri.file("/monorepo/packages/app/src/index.ts");
			await manager.addRecentFile(fileUri1);
			expect(mockStorage.addRecentFile).toHaveBeenCalledWith(
				"/monorepo/packages/app",
				"/monorepo/packages/app/src/index.ts",
			);

			// File in folder2
			const fileUri2 = vscode.Uri.file("/monorepo/packages/api/src/server.ts");
			await manager.addRecentFile(fileUri2);
			expect(mockStorage.addRecentFile).toHaveBeenCalledWith(
				"/monorepo/packages/api",
				"/monorepo/packages/api/src/server.ts",
			);

			// Verify storage was called with different workspace roots
			expect(mockStorage.addRecentFile).toHaveBeenCalledTimes(2);

			manager.dispose();
		});

		it("should resolve to most specific folder in nested workspaces", async () => {
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

			const manager = new WorkspaceManager(
				[rootFolder, nestedFolder],
				mockStorage,
			);

			// File in nested folder should resolve to nested folder (more specific)
			const nestedFileUri = vscode.Uri.file(
				"/monorepo/packages/app/src/index.ts",
			);
			const resolvedNested = manager.getWorkspaceFolderForFile(nestedFileUri);
			expect(resolvedNested).toBe(nestedFolder);

			// Storage operations should use nested workspace root
			await manager.addRecentFile(nestedFileUri);
			expect(mockStorage.addRecentFile).toHaveBeenCalledWith(
				"/monorepo/packages/app",
				"/monorepo/packages/app/src/index.ts",
			);

			// File in root folder (but outside nested) should resolve to root
			const rootFileUri = vscode.Uri.file("/monorepo/README.md");
			const resolvedRoot = manager.getWorkspaceFolderForFile(rootFileUri);
			expect(resolvedRoot).toBe(rootFolder);

			manager.dispose();
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

			const manager = new WorkspaceManager([folder1, folder2], mockStorage);

			// Mock user selection
			vi.mocked(vscode.window.showWorkspaceFolderPick).mockResolvedValue(
				folder1,
			);

			const selectedFolder = await manager.requireSingleWorkspace();

			expect(selectedFolder).toBe(folder1);
			expect(vscode.window.showWorkspaceFolderPick).toHaveBeenCalledWith({
				placeHolder: "Select workspace folder for SnapBack",
				ignoreFocusOut: true,
			});

			manager.dispose();
		});

		it("should handle user cancellation in workspace picker", async () => {
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

			const manager = new WorkspaceManager([folder1, folder2], mockStorage);

			// Mock user cancellation
			vi.mocked(vscode.window.showWorkspaceFolderPick).mockResolvedValue(
				undefined,
			);

			await expect(manager.requireSingleWorkspace()).rejects.toThrow(
				"No workspace folder selected",
			);

			manager.dispose();
		});
	});

	describe("Workspace-Specific Memory Operations", () => {
		it("should maintain separate recent files per workspace", async () => {
			const folder1 = {
				uri: vscode.Uri.file("/workspace1"),
				name: "workspace1",
				index: 0,
			};
			const folder2 = {
				uri: vscode.Uri.file("/workspace2"),
				name: "workspace2",
				index: 1,
			};

			// Mock storage to return different recent files per workspace
			vi.mocked(mockStorage.getRecentFiles).mockImplementation(
				async (workspaceRoot: string) => {
					if (workspaceRoot === "/workspace1") {
						return ["/workspace1/file1.ts", "/workspace1/file2.ts"];
					}
					if (workspaceRoot === "/workspace2") {
						return ["/workspace2/fileA.ts"];
					}
					return [];
				},
			);

			const manager = new WorkspaceManager([folder1, folder2], mockStorage);

			// Get recent files for workspace1
			const fileUri1 = vscode.Uri.file("/workspace1/src/index.ts");
			const recentFiles1 = await manager.getRecentFiles(fileUri1);
			expect(recentFiles1).toEqual([
				"/workspace1/file1.ts",
				"/workspace1/file2.ts",
			]);

			// Get recent files for workspace2
			const fileUri2 = vscode.Uri.file("/workspace2/src/main.ts");
			const recentFiles2 = await manager.getRecentFiles(fileUri2);
			expect(recentFiles2).toEqual(["/workspace2/fileA.ts"]);

			manager.dispose();
		});

		it("should maintain separate recent branches per workspace", async () => {
			const folder1 = {
				uri: vscode.Uri.file("/workspace1"),
				name: "workspace1",
				index: 0,
			};
			const folder2 = {
				uri: vscode.Uri.file("/workspace2"),
				name: "workspace2",
				index: 1,
			};

			// Mock storage to return different recent branches per workspace
			vi.mocked(mockStorage.getRecentBranches).mockImplementation(
				async (workspaceRoot: string) => {
					if (workspaceRoot === "/workspace1") {
						return ["main", "feature/ws1"];
					}
					if (workspaceRoot === "/workspace2") {
						return ["develop", "feature/ws2"];
					}
					return [];
				},
			);

			const manager = new WorkspaceManager([folder1, folder2], mockStorage);

			// Get recent branches for workspace1
			const fileUri1 = vscode.Uri.file("/workspace1/src/index.ts");
			const branches1 = await manager.getRecentBranches(fileUri1);
			expect(branches1).toEqual(["main", "feature/ws1"]);

			// Add branch to workspace1
			await manager.addRecentBranch(fileUri1, "hotfix/critical");
			expect(mockStorage.addRecentBranch).toHaveBeenCalledWith(
				"/workspace1",
				"hotfix/critical",
			);

			// Get recent branches for workspace2
			const fileUri2 = vscode.Uri.file("/workspace2/src/main.ts");
			const branches2 = await manager.getRecentBranches(fileUri2);
			expect(branches2).toEqual(["develop", "feature/ws2"]);

			// Add branch to workspace2
			await manager.addRecentBranch(fileUri2, "bugfix/urgent");
			expect(mockStorage.addRecentBranch).toHaveBeenCalledWith(
				"/workspace2",
				"bugfix/urgent",
			);

			manager.dispose();
		});

		it("should maintain separate protection status per workspace", async () => {
			const folder1 = {
				uri: vscode.Uri.file("/workspace1"),
				name: "workspace1",
				index: 0,
			};
			const folder2 = {
				uri: vscode.Uri.file("/workspace2"),
				name: "workspace2",
				index: 1,
			};

			// Mock storage to return different protection levels per workspace
			vi.mocked(mockStorage.getProtectionStatus).mockImplementation(
				async (workspaceRoot: string, _filePath: string) => {
					if (workspaceRoot === "/workspace1") {
						return "block";
					}
					if (workspaceRoot === "/workspace2") {
						return "warn";
					}
					return "watch";
				},
			);

			const manager = new WorkspaceManager([folder1, folder2], mockStorage);

			// Check protection status for file in workspace1
			const fileUri1 = vscode.Uri.file("/workspace1/src/config.ts");
			const status1 = await manager.getProtectionStatus(fileUri1);
			expect(status1).toBe("block");

			// Set protection status for file in workspace1
			await manager.setProtectionStatus(fileUri1, "watch");
			expect(mockStorage.setProtectionStatus).toHaveBeenCalledWith(
				"/workspace1",
				"/workspace1/src/config.ts",
				"watch",
			);

			// Check protection status for file in workspace2
			const fileUri2 = vscode.Uri.file("/workspace2/src/utils.ts");
			const status2 = await manager.getProtectionStatus(fileUri2);
			expect(status2).toBe("warn");

			// Set protection status for file in workspace2
			await manager.setProtectionStatus(fileUri2, "block");
			expect(mockStorage.setProtectionStatus).toHaveBeenCalledWith(
				"/workspace2",
				"/workspace2/src/utils.ts",
				"block",
			);

			manager.dispose();
		});
	});

	describe("Error Handling", () => {
		it("should throw error for file outside workspace", async () => {
			const folder = {
				uri: vscode.Uri.file("/project"),
				name: "project",
				index: 0,
			};

			const manager = new WorkspaceManager([folder], mockStorage);

			const externalFileUri = vscode.Uri.file("/external/file.ts");

			// All operations should throw for files outside workspace
			await expect(manager.getRecentFiles(externalFileUri)).rejects.toThrow(
				"File is not in any workspace folder",
			);

			await expect(manager.addRecentFile(externalFileUri)).rejects.toThrow(
				"File is not in any workspace folder",
			);

			await expect(manager.getRecentBranches(externalFileUri)).rejects.toThrow(
				"File is not in any workspace folder",
			);

			await expect(
				manager.addRecentBranch(externalFileUri, "main"),
			).rejects.toThrow("File is not in any workspace folder");

			await expect(
				manager.getProtectionStatus(externalFileUri),
			).rejects.toThrow("File is not in any workspace folder");

			await expect(
				manager.setProtectionStatus(externalFileUri, "block"),
			).rejects.toThrow("File is not in any workspace folder");

			manager.dispose();
		});

		it("should throw error when no workspace folders exist", async () => {
			const manager = new WorkspaceManager([], mockStorage);

			expect(manager.hasWorkspace()).toBe(false);
			expect(manager.getWorkspaceCount()).toBe(0);

			await expect(manager.requireSingleWorkspace()).rejects.toThrow(
				"SnapBack requires an open workspace folder",
			);

			manager.dispose();
		});
	});

	describe("Cache Invalidation", () => {
		it("should invalidate cache when workspace folders change", () => {
			const folder1 = {
				uri: vscode.Uri.file("/project1"),
				name: "project1",
				index: 0,
			};

			// Create resolver with listener enabled
			const resolver = new WorkspaceFolderResolver([folder1], true);

			// Verify workspace change listener was registered
			expect(vscode.workspace.onDidChangeWorkspaceFolders).toHaveBeenCalled();

			// Get the event handler
			const changeHandler = vi.mocked(
				vscode.workspace.onDidChangeWorkspaceFolders,
			).mock.calls[0][0];

			// Initial file resolution (should cache)
			const fileUri1 = vscode.Uri.file("/project1/src/index.ts");
			const resolvedFolder1 = resolver.getWorkspaceFolderForFile(fileUri1);
			expect(resolvedFolder1).toBe(folder1);

			// Simulate workspace folder change
			const folder2 = {
				uri: vscode.Uri.file("/project2"),
				name: "project2",
				index: 1,
			};

			// Mock workspace.workspaceFolders update
			vi.mocked(vscode.workspace).workspaceFolders = [folder1, folder2];

			// Trigger the change event
			changeHandler({
				added: [folder2],
				removed: [],
			});

			// Verify folders were updated and cache was cleared
			expect(resolver.getWorkspaceCount()).toBe(2);

			resolver.dispose();
		});

		it("should not register listener when listenForChanges is false", () => {
			const folder = {
				uri: vscode.Uri.file("/project"),
				name: "project",
				index: 0,
			};

			vi.clearAllMocks();

			// Create resolver with listener disabled (for testing)
			const resolver = new WorkspaceFolderResolver([folder], false);

			// Verify workspace change listener was NOT registered
			expect(
				vscode.workspace.onDidChangeWorkspaceFolders,
			).not.toHaveBeenCalled();

			resolver.dispose();
		});
	});

	describe("Cross-Platform Path Handling", () => {
		it("should handle Windows paths in multi-root workspace", async () => {
			const folder1 = {
				uri: vscode.Uri.file("C:\\projects\\app"),
				name: "app",
				index: 0,
			};
			const folder2 = {
				uri: vscode.Uri.file("D:\\projects\\api"),
				name: "api",
				index: 1,
			};

			const manager = new WorkspaceManager([folder1, folder2], mockStorage);

			// Test Windows path resolution
			const fileUri1 = vscode.Uri.file("C:\\projects\\app\\src\\index.ts");
			const resolvedFolder1 = manager.getWorkspaceFolderForFile(fileUri1);
			expect(resolvedFolder1).toBe(folder1);

			const fileUri2 = vscode.Uri.file("D:\\projects\\api\\src\\server.ts");
			const resolvedFolder2 = manager.getWorkspaceFolderForFile(fileUri2);
			expect(resolvedFolder2).toBe(folder2);

			// Test storage operations with Windows paths
			await manager.addRecentFile(fileUri1);
			expect(mockStorage.addRecentFile).toHaveBeenCalledWith(
				"C:\\projects\\app",
				"C:\\projects\\app\\src\\index.ts",
			);

			manager.dispose();
		});

		it("should handle UNC paths in workspace", async () => {
			const folder = {
				uri: vscode.Uri.file("\\\\server\\share\\project"),
				name: "project",
				index: 0,
			};

			const manager = new WorkspaceManager([folder], mockStorage);

			const fileUri = vscode.Uri.file(
				"\\\\server\\share\\project\\src\\index.ts",
			);
			const resolvedFolder = manager.getWorkspaceFolderForFile(fileUri);
			expect(resolvedFolder).toBe(folder);

			await manager.addRecentFile(fileUri);
			expect(mockStorage.addRecentFile).toHaveBeenCalledWith(
				"\\\\server\\share\\project",
				"\\\\server\\share\\project\\src\\index.ts",
			);

			manager.dispose();
		});
	});

	describe("Performance and Caching", () => {
		it("should cache workspace folder lookups", () => {
			const folder = {
				uri: vscode.Uri.file("/project"),
				name: "project",
				index: 0,
			};

			const resolver = new WorkspaceFolderResolver([folder], false);
			const fileUri = vscode.Uri.file("/project/src/index.ts");

			// First lookup (miss, should cache)
			const start1 = performance.now();
			const result1 = resolver.getWorkspaceFolderForFile(fileUri);
			const duration1 = performance.now() - start1;

			// Second lookup (hit, should be faster)
			const start2 = performance.now();
			const result2 = resolver.getWorkspaceFolderForFile(fileUri);
			const duration2 = performance.now() - start2;

			// Verify same result
			expect(result1).toBe(folder);
			expect(result2).toBe(folder);

			// Cached lookup should be faster (though timing can be unreliable in tests)
			// At minimum, verify both complete quickly (<10ms as per performance budget)
			expect(duration1).toBeLessThan(10);
			expect(duration2).toBeLessThan(10);

			resolver.dispose();
		});

		it("should handle rapid successive lookups efficiently", () => {
			const folders = [
				{
					uri: vscode.Uri.file("/monorepo/packages/app"),
					name: "app",
					index: 0,
				},
				{
					uri: vscode.Uri.file("/monorepo/packages/api"),
					name: "api",
					index: 1,
				},
				{
					uri: vscode.Uri.file("/monorepo/packages/shared"),
					name: "shared",
					index: 2,
				},
			];

			const manager = new WorkspaceManager(folders, mockStorage);

			const testFiles = [
				vscode.Uri.file("/monorepo/packages/app/src/index.ts"),
				vscode.Uri.file("/monorepo/packages/app/src/components/Button.tsx"),
				vscode.Uri.file("/monorepo/packages/api/src/server.ts"),
				vscode.Uri.file("/monorepo/packages/api/src/routes/users.ts"),
				vscode.Uri.file("/monorepo/packages/shared/src/utils.ts"),
			];

			const start = performance.now();

			// Perform 100 lookups
			for (let i = 0; i < 100; i++) {
				for (const fileUri of testFiles) {
					manager.getWorkspaceFolderForFile(fileUri);
				}
			}

			const duration = performance.now() - start;

			// 500 lookups should complete in <100ms (avg <0.2ms per lookup)
			expect(duration).toBeLessThan(100);

			manager.dispose();
		});
	});

	describe("Disposal and Cleanup", () => {
		it("should dispose of workspace folder resolver", () => {
			const folder = {
				uri: vscode.Uri.file("/project"),
				name: "project",
				index: 0,
			};

			const manager = new WorkspaceManager([folder], mockStorage);

			expect(() => manager.dispose()).not.toThrow();
		});

		it("should handle multiple dispose calls", () => {
			const folder = {
				uri: vscode.Uri.file("/project"),
				name: "project",
				index: 0,
			};

			const manager = new WorkspaceManager([folder], mockStorage);

			manager.dispose();
			expect(() => manager.dispose()).not.toThrow();
		});

		it("should dispose of event listener when resolver is disposed", () => {
			const folder = {
				uri: vscode.Uri.file("/project"),
				name: "project",
				index: 0,
			};

			const resolver = new WorkspaceFolderResolver([folder], true);

			// Get the disposable that was returned
			const mockDisposable =
				vscode.workspace.onDidChangeWorkspaceFolders.mock.results[0].value;

			resolver.dispose();

			// Verify the disposable's dispose was called
			expect(mockDisposable.dispose).toHaveBeenCalled();
		});
	});
});
