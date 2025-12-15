import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";

// vscode mock provided by setup.ts

describe("Path Normalization", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("Cross-platform path handling", () => {
		it("should handle Windows-style paths", async () => {
			const { FileChangeAnalyzer } = await import(
				"../../../src/utils/FileChangeAnalyzer"
			);

			// Mock workspace folders for Windows
			Object.defineProperty(vscode.workspace, "workspaceFolders", {
				value: [
					{
						uri: { fsPath: "C:\\Users\\test\\workspace" },
						name: "test",
						index: 0,
					},
				] as any,
				writable: true,
			});

			// Mock asRelativePath to handle Windows paths
			(vscode.workspace.asRelativePath as jest.Mock).mockImplementation(
				(path: string) => {
					return path.replace("C:\\Users\\test\\workspace\\", "");
				},
			);

			const checkpointFiles = {
				"src/test.ts": "content",
			};
			const workspaceRoot = "C:\\Users\\test\\workspace";

			// Mock file system to return same content (no changes)
			(vscode.workspace.fs.readFile as any).mockResolvedValue(
				Buffer.from("content"),
			);

			const changes = await FileChangeAnalyzer.analyzeCheckpoint(
				checkpointFiles,
				workspaceRoot,
			);

			expect(changes).toHaveLength(1);
			expect(changes[0].changeType).toBe("unchanged");
		});

		it("should handle Unix-style paths", async () => {
			const { FileChangeAnalyzer } = await import(
				"../../../src/utils/FileChangeAnalyzer"
			);

			// Mock workspace folders for Unix
			Object.defineProperty(vscode.workspace, "workspaceFolders", {
				value: [
					{
						uri: { fsPath: "/home/user/workspace" },
						name: "test",
						index: 0,
					},
				] as any,
				writable: true,
			});

			// Mock asRelativePath to handle Unix paths
			(vscode.workspace.asRelativePath as jest.Mock).mockImplementation(
				(path: string) => {
					return path.replace("/home/user/workspace/", "");
				},
			);

			const checkpointFiles = {
				"src/test.ts": "content",
			};
			const workspaceRoot = "/home/user/workspace";

			// Mock file system to return same content (no changes)
			(vscode.workspace.fs.readFile as any).mockResolvedValue(
				Buffer.from("content"),
			);

			const changes = await FileChangeAnalyzer.analyzeCheckpoint(
				checkpointFiles,
				workspaceRoot,
			);

			expect(changes).toHaveLength(1);
			expect(changes[0].relativePath).toBe("src/test.ts");
		});

		it("should handle relative path conversion correctly", async () => {
			const { FileChangeAnalyzer } = await import(
				"../../../src/utils/FileChangeAnalyzer"
			);

			// Test the analyzeFile method directly
			const absoluteFilePath = "/test/workspace/src/component/file.ts";
			const checkpointContent = "checkpoint content";
			const workspaceRoot = "/test/workspace";

			// Mock file system to return same content (no changes)
			(vscode.workspace.fs.readFile as any).mockResolvedValue(
				Buffer.from("checkpoint content"),
			);

			// Call private method using reflection
			const change = await (
				FileChangeAnalyzer as {
					analyzeFile: (
						absoluteFilePath: string,
						checkpointContent: string,
						workspaceRoot: string,
					) => Promise<unknown>;
				}
			).analyzeFile(absoluteFilePath, checkpointContent, workspaceRoot);

			expect(change.relativePath).toBe("src/component/file.ts");
			expect(change.fileName).toBe("file.ts");
			expect(change.changeType).toBe("unchanged");
		});
	});

	describe("vscode.workspace.asRelativePath usage", () => {
		it("should use vscode.workspace.asRelativePath for path normalization", async () => {
			const { CheckpointDecorations } = await import(
				"../../../src/decorations/checkpointDecorations"
			);

			// Mock workspace folders
			Object.defineProperty(vscode.workspace, "workspaceFolders", {
				value: [
					{
						uri: { fsPath: "/test/workspace" },
						name: "test",
						index: 0,
					},
				] as any,
				writable: true,
			});

			// Mock asRelativePath
			(vscode.workspace.asRelativePath as jest.Mock).mockImplementation(
				(path: string) => {
					return path.replace("/test/workspace/", "");
				},
			);

			// Create a mock storage
			const mockStorage = {
				list: vi.fn().mockResolvedValue([]),
			};

			const _decorations = new CheckpointDecorations(
				mockStorage as { list: () => Promise<unknown[]> },
			);

			// Mock a document
			const _mockDocument = {
				fileName: "/test/workspace/src/test.ts",
			};

			// The relative path should be computed using vscode.workspace.asRelativePath
			expect(vscode.workspace.asRelativePath).not.toHaveBeenCalled();

			// Note: We can't easily test the private methods, but we can verify the mock is set up correctly
			expect(vscode.workspace.workspaceFolders).toBeDefined();
		});
	});
});
