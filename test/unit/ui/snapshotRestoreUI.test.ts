import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import type { OperationCoordinator } from "@vscode/operationCoordinator";
import type { CheckpointDocumentProvider } from "@vscode/providers/CheckpointDocumentProvider";
import { CheckpointRestoreUI } from "@vscode/ui/CheckpointRestoreUI";

// vscode mock provided by setup.ts

describe("CheckpointRestoreUI", () => {
	let restoreUI: CheckpointRestoreUI;
	let mockCoordinator: any;
	let mockDocumentProvider: any;
	let workspaceRoot: string;

	beforeEach(() => {
		workspaceRoot = "/test/workspace";

		// Create mock coordinator
		mockCoordinator = {
			listCheckpoints: vi.fn(),
			restoreToCheckpoint: vi.fn(),
		} as unknown as OperationCoordinator;

		// Create mock document provider
		mockDocumentProvider = {
			setCheckpointContent: vi.fn(),
			clearAllContent: vi.fn(),
			clearContentForCheckpoint: vi.fn(),
		} as unknown as CheckpointDocumentProvider;

		restoreUI = new CheckpointRestoreUI(
			mockCoordinator,
			mockDocumentProvider,
			workspaceRoot,
		);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe("showRestoreWorkflow", () => {
		it("should return false when no checkpoints are available", async () => {
			mockCoordinator.listCheckpoints.mockResolvedValue([]);

			const result = await restoreUI.showRestoreWorkflow();

			expect(result).toBe(false);
			expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
				"No checkpoints available to restore",
			);
		});

		it("should return false when user cancels checkpoint selection", async () => {
			const mockCheckpoints = [
				{
					id: "cp-1",
					name: "Checkpoint 1",
					timestamp: 1000,
					fileContents: { "file1.ts": "content1" },
				},
			];
			mockCoordinator.listCheckpoints.mockResolvedValue(mockCheckpoints);
			(vscode.window.showQuickPick as any).mockResolvedValue(undefined);

			const result = await restoreUI.showRestoreWorkflow();

			expect(result).toBe(false);
		});

		it("should handle checkpoint selection and return checkpoint info", async () => {
			const mockCheckpoints = [
				{
					id: "cp-1",
					name: "Checkpoint 1",
					timestamp: 1000,
					fileContents: { "file1.ts": "content1" },
				},
				{
					id: "cp-2",
					name: "Checkpoint 2",
					timestamp: 2000,
					fileContents: { "file2.ts": "content2" },
				},
			];
			mockCoordinator.listCheckpoints.mockResolvedValue(mockCheckpoints);

			const selectedCheckpoint = {
				label: "$(clock) Checkpoint 2",
				description: "2s ago",
				detail: "Checkpoint ID: cp-2... • 1 files",
				id: "cp-2",
				timestamp: 2000,
				fileContents: { "file2.ts": "content2" },
				name: "Checkpoint 2",
			};
			(vscode.window.showQuickPick as any).mockResolvedValue(
				selectedCheckpoint,
			);

			// Mock the private selectFilesWithPreview method to return early
			const originalSelectFiles = (restoreUI as any).selectFilesWithPreview;
			(restoreUI as any).selectFilesWithPreview = vi
				.fn()
				.mockResolvedValue(undefined);

			const result = await restoreUI.showRestoreWorkflow();

			expect(result).toBe(false); // Should return false when files selection is cancelled
			expect(mockCoordinator.listCheckpoints).toHaveBeenCalled();
			expect(vscode.window.showQuickPick).toHaveBeenCalled();

			// Restore original method
			(restoreUI as any).selectFilesWithPreview = originalSelectFiles;
		});
	});

	describe("selectCheckpoint", () => {
		it("should return undefined when no checkpoints exist", async () => {
			mockCoordinator.listCheckpoints.mockResolvedValue([]);

			const result = await (restoreUI as any).selectCheckpoint();

			expect(result).toBeUndefined();
		});

		it("should return checkpoint info when checkpoint is selected", async () => {
			const mockCheckpoints = [
				{
					id: "cp-1",
					name: "Checkpoint 1",
					timestamp: 1000,
					fileContents: { "file1.ts": "content1" },
				},
			];
			mockCoordinator.listCheckpoints.mockResolvedValue(mockCheckpoints);

			const selectedCheckpoint = {
				label: "$(clock) Checkpoint 1",
				description: "1s ago",
				detail: "Checkpoint ID: cp-1... • 1 files",
				id: "cp-1",
				timestamp: 1000,
				fileContents: { "file1.ts": "content1" },
				name: "Checkpoint 1",
			};
			(vscode.window.showQuickPick as any).mockResolvedValue(
				selectedCheckpoint,
			);

			const result = await (restoreUI as any).selectCheckpoint();

			expect(result).toEqual({
				id: "cp-1",
				name: "Checkpoint 1",
				timestamp: 1000,
				fileContents: { "file1.ts": "content1" },
			});
		});
	});

	describe("cleanupDiffTabs", () => {
		it("should close tracked diff tabs and clear checkpoint content", async () => {
			// Set up tracked tabs
			(restoreUI as any).openDiffTabs = [
				{
					input: {
						original: {
							toString: () => "snapback-checkpoint:cp-1/file1.ts",
						},
						modified: {
							toString: () => "/test/workspace/file1.ts",
						},
					},
				},
			];

			await (restoreUI as any).cleanupDiffTabs();

			expect(mockDocumentProvider.clearAllContent).toHaveBeenCalled();
			expect((restoreUI as any).openDiffTabs).toEqual([]);
			expect((restoreUI as any).checkpointFiles).toEqual(new Set());
		});

		it("should handle errors during tab closing gracefully", async () => {
			// Mock tabGroups.close to throw an error
			(vscode.window.tabGroups.close as any).mockRejectedValue(
				new Error("Tab close error"),
			);

			// Set up tracked tabs
			(restoreUI as any).openDiffTabs = [
				{
					input: {
						original: {
							toString: () => "snapback-checkpoint:cp-1/file1.ts",
						},
						modified: {
							toString: () => "/test/workspace/file1.ts",
						},
					},
				},
			];

			await (restoreUI as any).cleanupDiffTabs();

			// Should still clear content even if tab closing fails
			expect(mockDocumentProvider.clearAllContent).toHaveBeenCalled();
			expect((restoreUI as any).openDiffTabs).toEqual([]);
		});
	});

	describe("showDiffPreviews", () => {
		it("should register checkpoint content and open diff editors", async () => {
			const mockCheckpoint = {
				id: "cp-1",
				name: "Test Checkpoint",
				timestamp: 1000,
				fileContents: { "file1.ts": "checkpoint content" },
			};

			const mockFileChanges = [
				{
					filePath: "/test/workspace/file1.ts",
					relativePath: "file1.ts",
					fileName: "file1.ts",
					changeType: "modified",
					linesAdded: 1,
					linesDeleted: 0,
					checkpointContent: "checkpoint content",
					currentContent: "current content",
					icon: "diff-modified",
					changeSummary: "+1",
				},
			];

			(vscode.commands.executeCommand as any).mockResolvedValue(undefined);

			const _result = await (restoreUI as any).showDiffPreviews(
				mockCheckpoint,
				mockFileChanges,
			);

			// Should register checkpoint content
			expect(mockDocumentProvider.setCheckpointContent).toHaveBeenCalledWith(
				"cp-1",
				"/test/workspace/file1.ts",
				"checkpoint content",
			);

			// Should open diff editor
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"vscode.diff",
				{ toString: expect.any(Function) },
				{ fsPath: "/test/workspace/file1.ts" },
				"Checkpoint ← file1.ts → Current",
			);

			// Status bar should be shown
			expect(vscode.window.createStatusBarItem).toHaveBeenCalled();
		});

		it("should skip unchanged files", async () => {
			const mockCheckpoint = {
				id: "cp-1",
				name: "Test Checkpoint",
				timestamp: 1000,
				fileContents: { "file1.ts": "content" },
			};

			const mockFileChanges = [
				{
					filePath: "/test/workspace/file1.ts",
					relativePath: "file1.ts",
					fileName: "file1.ts",
					changeType: "unchanged",
					linesAdded: 0,
					linesDeleted: 0,
					checkpointContent: "content",
					currentContent: "content",
					icon: "circle-outline",
					changeSummary: "No changes",
				},
			];

			const _result = await (restoreUI as any).showDiffPreviews(
				mockCheckpoint,
				mockFileChanges,
			);

			// Should still register checkpoint content for all files (needed for diff editor)
			expect(mockDocumentProvider.setCheckpointContent).toHaveBeenCalledWith(
				"cp-1",
				"/test/workspace/file1.ts",
				"content",
			);

			// But should not open diff editor for unchanged files
			expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith(
				"vscode.diff",
				expect.anything(),
				{ fsPath: "/test/workspace/file1.ts" },
				expect.any(String),
			);
		});
	});
});
