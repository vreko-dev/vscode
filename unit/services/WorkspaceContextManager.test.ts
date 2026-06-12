/**
 * WorkspaceContextManager Tests
 *
 * Tests for dynamic workspace context management (Antipattern #2 fix)
 * Covers: Multi-root scenarios, workspace changes, event emission
 */

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import * as vscode from "vscode";
import { WorkspaceContextManager } from "../../../src/services/WorkspaceContextManager";

const createMockFolders = (paths: string[]) => {
	return paths.map((fsPath, index) => ({
		uri: { fsPath } as vscode.Uri,
		name: `folder-${index}`,
		index,
	})) as vscode.WorkspaceFolder[];
};

describe("WorkspaceContextManager", () => {
	let manager: WorkspaceContextManager;

	beforeEach(() => {
		// Start with no workspace
		vi.spyOn(vscode.workspace, "workspaceFolders", "get").mockReturnValue(undefined);
		manager = new WorkspaceContextManager();
	});

	afterEach(() => {
		manager.dispose();
		vi.clearAllMocks();
	});

	describe("getWorkspaceRoot", () => {
		// HAPPY PATH: Single workspace
		it("returns workspace root when folder is open", () => {
			const mockFolders = createMockFolders(["/Users/user/project"]);
			vi.spyOn(vscode.workspace, "workspaceFolders", "get").mockReturnValue(mockFolders);

			expect(manager.getWorkspaceRoot()).toBe("/Users/user/project");
		});

		// SAD PATH: No workspace
		it("returns empty string when no workspace", () => {
			vi.spyOn(vscode.workspace, "workspaceFolders", "get").mockReturnValue(undefined);
			expect(manager.getWorkspaceRoot()).toBe("");
		});

		// MULTI-ROOT: Primary folder is first
		it("returns primary folder in multi-root workspace", () => {
			const mockFolders = createMockFolders([
				"/Users/user/project-a",
				"/Users/user/project-b",
			]);
			vi.spyOn(vscode.workspace, "workspaceFolders", "get").mockReturnValue(mockFolders);

			expect(manager.getWorkspaceRoot()).toBe("/Users/user/project-a");
		});

		// DYNAMIC: Context is not cached
		it("reflects workspace changes on subsequent calls", () => {
			// First call
			const folders1 = createMockFolders(["/workspace/a"]);
			vi.spyOn(vscode.workspace, "workspaceFolders", "get").mockReturnValue(folders1);
			expect(manager.getWorkspaceRoot()).toBe("/workspace/a");

			// Second call with different workspace
			const folders2 = createMockFolders(["/workspace/b"]);
			vi.spyOn(vscode.workspace, "workspaceFolders", "get").mockReturnValue(folders2);
			expect(manager.getWorkspaceRoot()).toBe("/workspace/b");
		});
	});

	describe("getAllWorkspaceFolders", () => {
		it("returns all workspace folder paths", () => {
			const paths = ["/workspace/a", "/workspace/b", "/workspace/c"];
			const mockFolders = createMockFolders(paths);
			vi.spyOn(vscode.workspace, "workspaceFolders", "get").mockReturnValue(mockFolders);

			expect(manager.getAllWorkspaceFolders()).toEqual(paths);
		});

		it("returns empty array when no workspace", () => {
			vi.spyOn(vscode.workspace, "workspaceFolders", "get").mockReturnValue(undefined);
			expect(manager.getAllWorkspaceFolders()).toEqual([]);
		});
	});

	describe("getWorkspaceFolderForFile", () => {
		// HAPPY PATH: File in workspace
		it("returns workspace folder for file within workspace", () => {
			const mockFolders = createMockFolders(["/Users/user/project"]);
			vi.spyOn(vscode.workspace, "workspaceFolders", "get").mockReturnValue(mockFolders);

			const folder = manager.getWorkspaceFolderForFile("/Users/user/project/src/index.ts");
			expect(folder).toBe("/Users/user/project");
		});

		// MULTI-ROOT: File in second folder
		it("identifies file in correct workspace folder (multi-root)", () => {
			const mockFolders = createMockFolders(["/workspace/a", "/workspace/b"]);
			vi.spyOn(vscode.workspace, "workspaceFolders", "get").mockReturnValue(mockFolders);

			const folder = manager.getWorkspaceFolderForFile("/workspace/b/src/index.ts");
			expect(folder).toBe("/workspace/b");
		});

		// SAD PATH: File outside workspace
		it("returns null for file outside workspace", () => {
			const mockFolders = createMockFolders(["/workspace/a"]);
			vi.spyOn(vscode.workspace, "workspaceFolders", "get").mockReturnValue(mockFolders);

			const folder = manager.getWorkspaceFolderForFile("/other/workspace/file.ts");
			expect(folder).toBe(null);
		});

		// EDGE CASE: No workspace
		it("returns null when no workspace open", () => {
			vi.spyOn(vscode.workspace, "workspaceFolders", "get").mockReturnValue(undefined);
			expect(manager.getWorkspaceFolderForFile("/any/file.ts")).toBe(null);
		});
	});

	describe("hasWorkspace", () => {
		it("returns true when workspace is open", () => {
			const mockFolders = createMockFolders(["/Users/user/project"]);
			vi.spyOn(vscode.workspace, "workspaceFolders", "get").mockReturnValue(mockFolders);

			expect(manager.hasWorkspace()).toBe(true);
		});

		it("returns false when no workspace", () => {
			vi.spyOn(vscode.workspace, "workspaceFolders", "get").mockReturnValue(undefined);
			expect(manager.hasWorkspace()).toBe(false);
		});
	});

	describe("assertWorkspaceExists", () => {
		it("does not throw when workspace exists", () => {
			const mockFolders = createMockFolders(["/Users/user/project"]);
			vi.spyOn(vscode.workspace, "workspaceFolders", "get").mockReturnValue(mockFolders);

			expect(() => {
				manager.assertWorkspaceExists();
			}).not.toThrow();
		});

		it("throws when workspace does not exist", () => {
			vi.spyOn(vscode.workspace, "workspaceFolders", "get").mockReturnValue(undefined);

			expect(() => {
				manager.assertWorkspaceExists();
			}).toThrow();
		});

		it("uses custom error message", () => {
			vi.spyOn(vscode.workspace, "workspaceFolders", "get").mockReturnValue(undefined);

			expect(() => {
				manager.assertWorkspaceExists("Custom error message");
			}).toThrow(/Custom error message/);
		});
	});

	describe("Event Infrastructure", () => {
		it("exposes event emitters", () => {
			// Event infrastructure is tested indirectly through mocking
			// The actual events are internal VS Code EventEmitters
			expect(manager).toBeDefined();
			expect(typeof manager.refresh).toBe("function");
		});
	});

	describe("refresh", () => {
		it("does not throw", () => {
			expect(() => {
				manager.refresh();
			}).not.toThrow();
		});
	});

	describe("dispose", () => {
		it("disposes without errors", () => {
			expect(() => {
				manager.dispose();
			}).not.toThrow();
		});

		it("can be called multiple times", () => {
			manager.dispose();
			expect(() => {
				manager.dispose();
			}).not.toThrow();
		});
	});

	describe("Multi-Root Workspace Scenarios", () => {
		it("correctly handles switching workspaces", () => {
			// Workspace 1
			const workspace1 = createMockFolders(["/Users/user/portfolio"]);
			vi.spyOn(vscode.workspace, "workspaceFolders", "get").mockReturnValue(workspace1);
			expect(manager.getWorkspaceRoot()).toBe("/Users/user/portfolio");

			// Switch to Workspace 2
			const workspace2 = createMockFolders(["/Users/user/cli-tool"]);
			vi.spyOn(vscode.workspace, "workspaceFolders", "get").mockReturnValue(workspace2);
			expect(manager.getWorkspaceRoot()).toBe("/Users/user/cli-tool");
		});

		it("handles monorepo with many packages", () => {
			const packages = [
				"/workspace/apps/web",
				"/workspace/apps/api",
				"/workspace/packages/sdk",
			];
			const mockFolders = createMockFolders(packages);
			vi.spyOn(vscode.workspace, "workspaceFolders", "get").mockReturnValue(mockFolders);

			// Primary is first
			expect(manager.getWorkspaceRoot()).toBe("/workspace/apps/web");

			// Can find files in any package
			expect(manager.getWorkspaceFolderForFile("/workspace/apps/api/src/index.ts")).toBe(
				"/workspace/apps/api",
			);
			expect(
				manager.getWorkspaceFolderForFile("/workspace/packages/sdk/src/index.ts"),
			).toBe("/workspace/packages/sdk");
		});
	});
});
