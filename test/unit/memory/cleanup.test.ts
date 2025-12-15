import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { CheckpointDocumentProvider } from "@vscode/providers/CheckpointDocumentProvider";
import { CheckpointRestoreUI } from "@vscode/ui/CheckpointRestoreUI";

// vscode mock provided by setup.ts
,
		createStatusBarItem: vi.fn().mockReturnValue({
			text: "",
			tooltip: "",
			command: "",
			show: vi.fn(),
			dispose: vi.fn(),
		}),
		tabGroups: {
			all: [],
			close: vi.fn(),
			onDidChangeActiveTextEditor: vi
				.fn()
				.mockReturnValue({ dispose: vi.fn() }),
		},
		onDidChangeActiveTextEditor: vi.fn().mockReturnValue({ dispose: vi.fn() }),
	},
	commands: {
		registerCommand: vi.fn(),
		executeCommand: vi.fn(),
	},
	Uri: {
		parse: vi.fn().mockImplementation((str) => ({ toString: () => str })),
		file: vi.fn().mockImplementation((path) => ({ fsPath: path })),
	},
	EventEmitter: vi.fn().mockImplementation(() => ({
		event: vi.fn(),
		fire: vi.fn(),
		dispose: vi.fn(),
	})),
}));

describe("Memory Cleanup", () => {
	let restoreUI: CheckpointRestoreUI;
	let documentProvider: CheckpointDocumentProvider;
	let mockCoordinator: any;

	beforeEach(() => {
		mockCoordinator = {
			listCheckpoints: vi.fn(),
			restoreToCheckpoint: vi.fn(),
		};

		documentProvider = new CheckpointDocumentProvider();
		restoreUI = new CheckpointRestoreUI(
			mockCoordinator,
			documentProvider,
			"/test/workspace",
		);
	});

	afterEach(() => {
		vi.clearAllMocks();
		try {
			documentProvider.dispose();
		} catch (_error) {
			// Ignore disposal errors in tests
		}
	});

	describe("CheckpointDocumentProvider Cleanup", () => {
		it("should clear all content when dispose is called", () => {
			// Set some content
			documentProvider.setCheckpointContent("test.ts", "test content");

			// Verify content exists
			let result = documentProvider.provideTextDocumentContent({
				path: "test.ts",
			} as any);
			expect(result).toBe("test content");

			// Dispose should clear all content
			documentProvider.dispose();

			// Verify content is cleared
			result = documentProvider.provideTextDocumentContent({
				path: "test.ts",
			} as any);
			expect(result).toBe("");
		});

		it("should clear specific checkpoint content", () => {
			// Set content for multiple checkpoints
			documentProvider.setCheckpointContent("cp-1", "file1.ts", "content1");
			documentProvider.setCheckpointContent("cp-2", "file1.ts", "content2");

			// Verify content exists
			let result1 = documentProvider.provideTextDocumentContent({
				path: "cp-1/file1.ts",
			} as any);
			let result2 = documentProvider.provideTextDocumentContent({
				path: "cp-2/file1.ts",
			} as any);
			expect(result1).toBe("content1");
			expect(result2).toBe("content2");

			// Clear content for specific checkpoint
			(documentProvider as any).clearContentForCheckpoint("cp-1", "file1.ts");

			// Verify only that checkpoint's content is cleared
			result1 = documentProvider.provideTextDocumentContent({
				path: "cp-1/file1.ts",
			} as any);
			result2 = documentProvider.provideTextDocumentContent({
				path: "cp-2/file1.ts",
			} as any);
			expect(result1).toBe("");
			expect(result2).toBe("content2");
		});
	});

	describe("CheckpointRestoreUI Cleanup", () => {
		it("should clear diff tabs and checkpoint content on cleanup", async () => {
			// Set up tracked tabs and files
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
			(restoreUI as any).checkpointFiles = new Set(["file1.ts"]);

			// Mock tab closing
			(vscode.window.tabGroups.close as any).mockResolvedValue(undefined);

			// Call cleanup
			await (restoreUI as any).cleanupDiffTabs();

			// Verify tabs were attempted to be closed
			expect(vscode.window.tabGroups.close).toHaveBeenCalled();

			// Verify content was cleared
			expect(
				documentProvider.provideTextDocumentContent({
					path: "cp-1/file1.ts",
				} as any),
			).toBe("");

			// Verify tracking arrays were cleared
			expect((restoreUI as any).openDiffTabs).toEqual([]);
			expect((restoreUI as any).checkpointFiles).toEqual(new Set());
		});

		it("should handle tab closing errors gracefully", async () => {
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

			// Mock tab closing to throw an error
			(vscode.window.tabGroups.close as any).mockRejectedValue(
				new Error("Tab close failed"),
			);

			// Should not throw even if tab closing fails
			await expect((restoreUI as any).cleanupDiffTabs()).resolves.not.toThrow();

			// Content should still be cleared
			expect(
				documentProvider.provideTextDocumentContent({
					path: "cp-1/file1.ts",
				} as any),
			).toBe("");
		});

		it("should dispose status bar item", () => {
			// Create a status bar item
			const mockStatusBarItem = {
				dispose: vi.fn(),
			};
			(vscode.window.createStatusBarItem as any).mockReturnValue(
				mockStatusBarItem,
			);

			// Show status bar
			(restoreUI as any).showRestoreStatusBar("Test Checkpoint", 1);

			// Dispose status bar
			(restoreUI as any).disposeStatusBar();

			// Should have called dispose
			expect(mockStatusBarItem.dispose).toHaveBeenCalled();
		});
	});

	describe("Resource Leak Prevention", () => {
		it("should not accumulate content over multiple operations", async () => {
			// Simulate multiple restore operations
			for (let i = 0; i < 3; i++) {
				const checkpointId = `cp-${i}`;
				const fileName = `file${i}.ts`;

				// Set content
				documentProvider.setCheckpointContent(
					checkpointId,
					fileName,
					`content${i}`,
				);

				// Verify content exists
				const result = documentProvider.provideTextDocumentContent({
					path: `${checkpointId}/${fileName}`,
				} as any);
				expect(result).toBe(`content${i}`);

				// Clean up
				(documentProvider as any).clearContentForCheckpoint(
					checkpointId,
					fileName,
				);

				// Verify content is cleared
				const clearedResult = documentProvider.provideTextDocumentContent({
					path: `${checkpointId}/${fileName}`,
				} as any);
				expect(clearedResult).toBe("");
			}
		});

		it("should handle rapid cleanup calls", async () => {
			// Set up content
			documentProvider.setCheckpointContent("cp-1", "file1.ts", "content1");
			documentProvider.setCheckpointContent("cp-2", "file2.ts", "content2");

			// Call cleanup multiple times rapidly
			await Promise.all([
				(restoreUI as any).cleanupDiffTabs(),
				(restoreUI as any).cleanupDiffTabs(),
				(restoreUI as any).cleanupDiffTabs(),
			]);

			// Should not throw and should clear content
			const result1 = documentProvider.provideTextDocumentContent({
				path: "cp-1/file1.ts",
			} as any);
			const result2 = documentProvider.provideTextDocumentContent({
				path: "cp-2/file2.ts",
			} as any);
			expect(result1).toBe("");
			expect(result2).toBe("");
		});
	});
});
