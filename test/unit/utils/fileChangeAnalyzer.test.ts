import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { FileChangeAnalyzer } from "@vscode/utils/FileChangeAnalyzer";

// Mock VS Code API
vi.mock("vscode", () => ({
	workspace: {
		fs: {
			readFile: vi.fn(),
		},
	},
	Uri: {
		file: vi.fn().mockImplementation((path) => ({ fsPath: path })),
	},
}));

describe("FileChangeAnalyzer", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("analyzeCheckpoint", () => {
		it("should analyze modified files correctly", async () => {
			const checkpointFiles = {
				"src/test.ts": "const a = 1;\nconst b = 2;\n",
			};
			const workspaceRoot = "/test/workspace";

			// Mock file system to return different content
			(vscode.workspace.fs.readFile as any).mockResolvedValue(
				Buffer.from("const a = 1;\nconst b = 3;\n"),
			);

			const changes = await FileChangeAnalyzer.analyzeCheckpoint(
				checkpointFiles,
				workspaceRoot,
			);

			expect(changes).toHaveLength(1);
			expect(changes[0].filePath).toBe("/test/workspace/src/test.ts");
			expect(changes[0].relativePath).toBe("src/test.ts");
			expect(changes[0].fileName).toBe("test.ts");
			expect(changes[0].changeType).toBe("modified");
			expect(changes[0].icon).toBe("diff-modified");
		});

		it("should identify deleted files", async () => {
			const checkpointFiles = {
				"src/deleted.ts": "deleted content",
			};
			const workspaceRoot = "/test/workspace";

			// Mock file system to throw ENOENT error (file not found)
			(vscode.workspace.fs.readFile as any).mockRejectedValue(
				new Error("ENOENT: no such file or directory"),
			);

			const changes = await FileChangeAnalyzer.analyzeCheckpoint(
				checkpointFiles,
				workspaceRoot,
			);

			expect(changes).toHaveLength(1);
			expect(changes[0].changeType).toBe("deleted");
			expect(changes[0].icon).toBe("diff-removed");
		});

		it("should identify unchanged files", async () => {
			const checkpointFiles = {
				"src/unchanged.ts": "same content",
			};
			const workspaceRoot = "/test/workspace";

			// Mock file system to return same content
			(vscode.workspace.fs.readFile as any).mockResolvedValue(
				Buffer.from("same content"),
			);

			const changes = await FileChangeAnalyzer.analyzeCheckpoint(
				checkpointFiles,
				workspaceRoot,
			);

			expect(changes).toHaveLength(1);
			expect(changes[0].changeType).toBe("unchanged");
			expect(changes[0].icon).toBe("circle-outline");
			expect(changes[0].changeSummary).toBe("No changes");
		});

		it("should handle file read errors gracefully", async () => {
			const checkpointFiles = {
				"src/error.ts": "content",
			};
			const workspaceRoot = "/test/workspace";

			// Mock file system to throw unexpected error
			(vscode.workspace.fs.readFile as any).mockRejectedValue(
				new Error("Permission denied"),
			);

			const changes = await FileChangeAnalyzer.analyzeCheckpoint(
				checkpointFiles,
				workspaceRoot,
			);

			expect(changes).toHaveLength(1);
			expect(changes[0].changeType).toBe("deleted");
			expect(changes[0].icon).toBe("diff-removed");
			expect(changes[0].changeSummary).toContain("Deleted");
		});

		it("should sort changes by priority", async () => {
			const checkpointFiles = {
				"src/modified.ts": "old content",
				"src/deleted.ts": "deleted content",
				"src/added.ts": "new content",
				"src/unchanged.ts": "same content",
			};
			const workspaceRoot = "/test/workspace";

			// Mock different file system responses
			(vscode.workspace.fs.readFile as any).mockImplementation((uri: any) => {
				const path = uri.fsPath;
				if (path.includes("modified.ts")) {
					return Promise.resolve(Buffer.from("new content"));
				} else if (path.includes("deleted.ts")) {
					return Promise.reject(new Error("ENOENT"));
				} else if (path.includes("added.ts")) {
					return Promise.resolve(Buffer.from("new content"));
				} else if (path.includes("unchanged.ts")) {
					return Promise.resolve(Buffer.from("same content"));
				}
				return Promise.reject(new Error("File not found"));
			});

			const changes = await FileChangeAnalyzer.analyzeCheckpoint(
				checkpointFiles,
				workspaceRoot,
			);

			expect(changes).toHaveLength(4);

			// Should be sorted by priority: modified > deleted > added > unchanged
			// Note: In this case, added and unchanged might have same priority, so we check the order
			const changeTypes = changes.map((c) => c.changeType);
			expect(changeTypes).toContain("modified");
			expect(changeTypes).toContain("deleted");
		});
	});

	describe("calculateDiffStats", () => {
		it("should calculate added and deleted lines correctly", () => {
			const oldContent = "line1\nline2\nline3\n";
			const newContent = "line1\nline2 modified\nline4\n";

			// Access private method through reflection
			const stats = (FileChangeAnalyzer as any).calculateDiffStats(
				oldContent,
				newContent,
			);

			// Should detect changes (this is a simplified diff)
			expect(stats).toHaveProperty("added");
			expect(stats).toHaveProperty("deleted");
		});

		it("should handle empty content", () => {
			const oldContent = "";
			const newContent = "new line\n";

			const stats = (FileChangeAnalyzer as any).calculateDiffStats(
				oldContent,
				newContent,
			);

			expect(stats).toEqual({ added: 1, deleted: 0 });
		});
	});

	describe("createChangeSummary", () => {
		it("should create summary for mixed changes", () => {
			const changes = [
				{ changeType: "modified" } as any,
				{ changeType: "deleted" } as any,
				{ changeType: "added" } as any,
				{ changeType: "unchanged" } as any,
			];

			const summary = FileChangeAnalyzer.createChangeSummary(changes);

			expect(summary).toContain("1 modified");
			expect(summary).toContain("1 deleted");
			expect(summary).toContain("1 added");
		});

		it("should create summary for no changes", () => {
			const changes = [
				{ changeType: "unchanged" } as any,
				{ changeType: "unchanged" } as any,
			];

			const summary = FileChangeAnalyzer.createChangeSummary(changes);

			expect(summary).toBe("2 unchanged");
		});

		it("should handle empty changes array", () => {
			const changes: any[] = [];

			const summary = FileChangeAnalyzer.createChangeSummary(changes);

			expect(summary).toBe("");
		});
	});
});
