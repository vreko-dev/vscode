import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import {
	applyConflictResolutions,
	type ConflictResolution,
	ConflictResolver,
	detectConflicts,
	type FileConflict,
	showConflictResolutionUI,
} from "../../src/conflictResolver";

// vscode mock provided by setup.ts

describe("ConflictResolver", () => {
	let resolver: ConflictResolver;
	let mockDocumentProvider: any;

	beforeEach(() => {
		resolver = new ConflictResolver();
		mockDocumentProvider = {
			setCheckpointContent: vi.fn(),
		};
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("constructor", () => {
		it("should create conflict resolver instance", () => {
			expect(resolver).toBeDefined();
		});
	});

	describe("setCheckpointDocumentProvider", () => {
		it("should set checkpoint document provider", () => {
			resolver.setCheckpointDocumentProvider(mockDocumentProvider);
			// No direct way to verify private property, but we can test behavior
		});
	});

	describe("resolveConflicts", () => {
		it("should resolve single conflict with use_checkpoint resolution", async () => {
			const conflicts: FileConflict[] = [
				{
					file: "test.ts",
					currentContent: "current",
					checkpointContent: "checkpoint",
					conflictType: "modified",
				},
			];

			(vscode.window.showQuickPick as any).mockResolvedValue({
				label: "Use Checkpoint Version",
			});

			const result = await resolver.resolveConflicts(conflicts);

			expect(result).toEqual([
				{
					file: "test.ts",
					resolution: "use_checkpoint",
				},
			]);
		});

		it("should resolve multiple conflicts", async () => {
			const conflicts: FileConflict[] = [
				{
					file: "file1.ts",
					currentContent: "current1",
					checkpointContent: "checkpoint1",
					conflictType: "modified",
				},
				{
					file: "file2.ts",
					currentContent: "current2",
					checkpointContent: "checkpoint2",
					conflictType: "added",
				},
			];

			(vscode.window.showQuickPick as any)
				.mockResolvedValueOnce({ label: "Use Checkpoint Version" })
				.mockResolvedValueOnce({ label: "Keep File" });

			const result = await resolver.resolveConflicts(conflicts);

			expect(result).toEqual([
				{ file: "file1.ts", resolution: "use_checkpoint" },
				{ file: "file2.ts", resolution: "use_current" },
			]);
		});

		it("should return null when user cancels", async () => {
			const conflicts: FileConflict[] = [
				{
					file: "test.ts",
					currentContent: "current",
					checkpointContent: "checkpoint",
					conflictType: "modified",
				},
			];

			(vscode.window.showQuickPick as any).mockResolvedValue(undefined);

			const result = await resolver.resolveConflicts(conflicts);

			expect(result).toBeNull();
		});

		it("should handle empty conflicts array", async () => {
			const result = await resolver.resolveConflicts([]);
			expect(result).toEqual([]);
		});
	});

	describe("showSingleConflictResolution", () => {
		it("should show resolution options for modified file", async () => {
			const conflict: FileConflict = {
				file: "test.ts",
				currentContent: "current",
				checkpointContent: "checkpoint",
				conflictType: "modified",
			};

			(vscode.window.showQuickPick as any).mockResolvedValue({
				label: "Use Checkpoint Version",
			});

			// @ts-expect-error - accessing private method for testing
			const result = await resolver.showSingleConflictResolution(conflict);

			expect(result).toEqual({
				file: "test.ts",
				resolution: "use_checkpoint",
			});
		});

		it("should show delete option for deleted files", async () => {
			const conflict: FileConflict = {
				file: "deleted.ts",
				currentContent: "current",
				checkpointContent: "",
				conflictType: "deleted",
			};

			(vscode.window.showQuickPick as any).mockResolvedValue({
				label: "Delete File",
			});

			// @ts-expect-error - accessing private method for testing
			const result = await resolver.showSingleConflictResolution(conflict);

			expect(result).toEqual({
				file: "deleted.ts",
				resolution: "skip",
			});
		});

		it("should show keep option for added files", async () => {
			const conflict: FileConflict = {
				file: "added.ts",
				currentContent: "new content",
				checkpointContent: "",
				conflictType: "added",
			};

			(vscode.window.showQuickPick as any).mockResolvedValue({
				label: "Keep File",
			});

			// @ts-expect-error - accessing private method for testing
			const result = await resolver.showSingleConflictResolution(conflict);

			expect(result).toEqual({
				file: "added.ts",
				resolution: "use_current",
			});
		});

		it("should handle merge option", async () => {
			const conflict: FileConflict = {
				file: "merge.ts",
				currentContent: "current",
				checkpointContent: "checkpoint",
				conflictType: "modified",
			};

			(vscode.window.showQuickPick as any).mockResolvedValue({
				label: "Merge Manually",
			});

			(vscode.commands.executeCommand as any).mockResolvedValue(undefined);

			// @ts-expect-error - accessing private method for testing
			const result = await resolver.showSingleConflictResolution(conflict);

			expect(result).toEqual({
				file: "merge.ts",
				resolution: "use_checkpoint",
			});
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"vscode.diff",
				expect.any(Object),
				expect.any(Object),
				"merge.ts (Checkpoint ↔ Current)",
			);
		});

		it("should return null when user cancels", async () => {
			const conflict: FileConflict = {
				file: "test.ts",
				currentContent: "current",
				checkpointContent: "checkpoint",
				conflictType: "modified",
			};

			(vscode.window.showQuickPick as any).mockResolvedValue(undefined);

			// @ts-expect-error - accessing private method for testing
			const result = await resolver.showSingleConflictResolution(conflict);

			expect(result).toBeNull();
		});
	});

	describe("openDiffEditor", () => {
		it("should open diff editor with checkpoint document provider", async () => {
			resolver.setCheckpointDocumentProvider(mockDocumentProvider);

			const conflict: FileConflict = {
				file: "test.ts",
				currentContent: "current",
				checkpointContent: "checkpoint",
				conflictType: "modified",
			};

			(vscode.commands.executeCommand as any).mockResolvedValue(undefined);

			// @ts-expect-error - accessing private method for testing
			await resolver.openDiffEditor(conflict);

			expect(mockDocumentProvider.setCheckpointContent).toHaveBeenCalledWith(
				"test.ts",
				"checkpoint",
			);
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"vscode.diff",
				expect.objectContaining({ toString: expect.any(Function) }),
				expect.objectContaining({ fsPath: "/test/workspace/test.ts" }),
				"test.ts (Checkpoint ↔ Current)",
			);
		});

		it("should handle missing workspace root", async () => {
			// @ts-expect-error - mock workspace folders
			vscode.workspace.workspaceFolders = undefined;

			const conflict: FileConflict = {
				file: "test.ts",
				currentContent: "current",
				checkpointContent: "checkpoint",
				conflictType: "modified",
			};

			// @ts-expect-error - accessing private method for testing
			await resolver.openDiffEditor(conflict);

			expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
				"No workspace folder open",
			);
		});

		it("should handle diff editor errors gracefully", async () => {
			resolver.setCheckpointDocumentProvider(mockDocumentProvider);

			const conflict: FileConflict = {
				file: "test.ts",
				currentContent: "current",
				checkpointContent: "checkpoint",
				conflictType: "modified",
			};

			(vscode.commands.executeCommand as any).mockRejectedValue(
				new Error("Diff editor error"),
			);

			// @ts-expect-error - accessing private method for testing
			await resolver.openDiffEditor(conflict);

			expect(vscode.window.showErrorMessage).toHaveBeenCalled();
		});
	});
});

describe("Standalone Conflict Functions", () => {
	describe("detectConflicts", () => {
		it("should detect modified file conflicts", async () => {
			const checkpoint = {
				id: "cp-1",
				timestamp: Date.now(),
				files: {
					"modified.ts": "checkpoint content",
				},
			};

			(vscode.workspace.fs.readFile as any).mockResolvedValue(
				Buffer.from("current content"),
			);

			const result = await detectConflicts(checkpoint, ["modified.ts"]);

			expect(result).toEqual([
				{
					file: "modified.ts",
					currentContent: "current content",
					checkpointContent: "checkpoint content",
					conflictType: "modified",
				},
			]);
		});

		it("should detect added file conflicts", async () => {
			const checkpoint = {
				id: "cp-1",
				timestamp: Date.now(),
				files: {}, // File not in checkpoint
			};

			(vscode.workspace.fs.readFile as any).mockResolvedValue(
				Buffer.from("new content"),
			);

			const result = await detectConflicts(checkpoint, ["added.ts"]);

			expect(result).toEqual([
				{
					file: "added.ts",
					currentContent: "new content",
					checkpointContent: "",
					conflictType: "added",
				},
			]);
		});

		it("should detect deleted file conflicts", async () => {
			const checkpoint = {
				id: "cp-1",
				timestamp: Date.now(),
				files: {
					"deleted.ts": "checkpoint content",
				},
			};

			(vscode.workspace.fs.readFile as any).mockRejectedValue(
				new Error("File not found"),
			);

			const result = await detectConflicts(checkpoint, ["deleted.ts"]);

			expect(result).toEqual([
				{
					file: "deleted.ts",
					currentContent: "",
					checkpointContent: "checkpoint content",
					conflictType: "deleted",
				},
			]);
		});

		it("should handle file read errors gracefully", async () => {
			const checkpoint = {
				id: "cp-1",
				timestamp: Date.now(),
				files: {
					"error.ts": "content",
				},
			};

			(vscode.workspace.fs.readFile as any).mockRejectedValue(
				new Error("Permission denied"),
			);

			const result = await detectConflicts(checkpoint, ["error.ts"]);

			expect(result).toEqual([]);
		});

		it("should handle empty files array", async () => {
			const checkpoint = {
				id: "cp-1",
				timestamp: Date.now(),
				files: {},
			};

			const result = await detectConflicts(checkpoint, []);

			expect(result).toEqual([]);
		});
	});

	describe("showConflictResolutionUI", () => {
		it("should show resolution UI for conflicts", async () => {
			const conflicts: FileConflict[] = [
				{
					file: "test.ts",
					currentContent: "current",
					checkpointContent: "checkpoint",
					conflictType: "modified",
				},
			];

			(vscode.window.showQuickPick as any).mockResolvedValue({
				label: "Use Checkpoint Version",
			});

			const result = await showConflictResolutionUI(conflicts);

			expect(result).toEqual([
				{
					file: "test.ts",
					resolution: "use_checkpoint",
				},
			]);
		});

		it("should handle user cancellation", async () => {
			const conflicts: FileConflict[] = [
				{
					file: "test.ts",
					currentContent: "current",
					checkpointContent: "checkpoint",
					conflictType: "modified",
				},
			];

			(vscode.window.showQuickPick as any).mockResolvedValue(undefined);

			const result = await showConflictResolutionUI(conflicts);

			expect(result).toEqual([]);
		});
	});

	describe("applyConflictResolutions", () => {
		it("should apply use_checkpoint resolution", async () => {
			const checkpoint = {
				id: "cp-1",
				timestamp: Date.now(),
				files: {
					"test.ts": "checkpoint content",
				},
			};

			const resolutions: ConflictResolution[] = [
				{
					file: "test.ts",
					resolution: "use_checkpoint",
				},
			];

			(vscode.workspace.fs.writeFile as any).mockResolvedValue(undefined);

			const result = await applyConflictResolutions(checkpoint, resolutions);

			expect(result).toBe(true);
			expect(vscode.workspace.fs.writeFile).toHaveBeenCalledWith(
				expect.objectContaining({ fsPath: "test.ts" }),
				Buffer.from("checkpoint content"),
			);
		});

		it("should apply use_current resolution (no action)", async () => {
			const checkpoint = {
				id: "cp-1",
				timestamp: Date.now(),
				files: {},
			};

			const resolutions: ConflictResolution[] = [
				{
					file: "test.ts",
					resolution: "use_current",
				},
			];

			const result = await applyConflictResolutions(checkpoint, resolutions);

			expect(result).toBe(true);
			expect(vscode.workspace.fs.writeFile).not.toHaveBeenCalled();
		});

		it("should apply skip resolution (delete file)", async () => {
			const checkpoint = {
				id: "cp-1",
				timestamp: Date.now(),
				files: {},
			};

			const resolutions: ConflictResolution[] = [
				{
					file: "test.ts",
					resolution: "skip",
				},
			];

			(vscode.workspace.fs.delete as any).mockResolvedValue(undefined);

			const result = await applyConflictResolutions(checkpoint, resolutions);

			expect(result).toBe(true);
			expect(vscode.workspace.fs.delete).toHaveBeenCalledWith(
				expect.objectContaining({ fsPath: "test.ts" }),
			);
		});

		it("should handle file deletion errors gracefully", async () => {
			const checkpoint = {
				id: "cp-1",
				timestamp: Date.now(),
				files: {},
			};

			const resolutions: ConflictResolution[] = [
				{
					file: "nonexistent.ts",
					resolution: "skip",
				},
			];

			(vscode.workspace.fs.delete as any).mockRejectedValue(
				new Error("File not found"),
			);

			const result = await applyConflictResolutions(checkpoint, resolutions);

			expect(result).toBe(true); // Should still succeed
		});

		it("should handle apply errors gracefully", async () => {
			const checkpoint = {
				id: "cp-1",
				timestamp: Date.now(),
				files: {
					"test.ts": "content",
				},
			};

			const resolutions: ConflictResolution[] = [
				{
					file: "test.ts",
					resolution: "use_checkpoint",
				},
			];

			(vscode.workspace.fs.writeFile as any).mockRejectedValue(
				new Error("Write error"),
			);

			const result = await applyConflictResolutions(checkpoint, resolutions);

			expect(result).toBe(false);
			expect(vscode.window.showErrorMessage).toHaveBeenCalled();
		});
	});

	describe("edge cases", () => {
		it("should handle files with special characters", async () => {
			const conflicts: FileConflict[] = [
				{
					file: "file with spaces & special@chars.ts",
					currentContent: "current",
					checkpointContent: "checkpoint",
					conflictType: "modified",
				},
			];

			(vscode.window.showQuickPick as any).mockResolvedValue({
				label: "Use Checkpoint Version",
			});

			const result = await showConflictResolutionUI(conflicts);

			expect(result).toEqual([
				{
					file: "file with spaces & special@chars.ts",
					resolution: "use_checkpoint",
				},
			]);
		});

		it("should handle unicode file names", async () => {
			const conflicts: FileConflict[] = [
				{
					file: "файл.ts",
					currentContent: "current",
					checkpointContent: "checkpoint",
					conflictType: "modified",
				},
			];

			(vscode.window.showQuickPick as any).mockResolvedValue({
				label: "Use Checkpoint Version",
			});

			const result = await showConflictResolutionUI(conflicts);

			expect(result).toEqual([
				{
					file: "файл.ts",
					resolution: "use_checkpoint",
				},
			]);
		});

		it("should handle very long file paths", async () => {
			const longPath = `${"a".repeat(1000)}/test.ts`;
			const conflicts: FileConflict[] = [
				{
					file: longPath,
					currentContent: "current",
					checkpointContent: "checkpoint",
					conflictType: "modified",
				},
			];

			(vscode.window.showQuickPick as any).mockResolvedValue({
				label: "Use Checkpoint Version",
			});

			const result = await showConflictResolutionUI(conflicts);

			expect(result).toEqual([
				{
					file: longPath,
					resolution: "use_checkpoint",
				},
			]);
		});

		it("should handle empty conflict arrays", async () => {
			const result = await showConflictResolutionUI([]);
			expect(result).toEqual([]);
		});
	});
});
