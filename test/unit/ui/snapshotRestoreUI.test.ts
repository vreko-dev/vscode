import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import type { OperationCoordinator } from "../../../src/operationCoordinator";
import type { SnapshotDocumentProvider } from "../../../src/providers/SnapshotDocumentProvider";
import { SnapshotRestoreUI } from "../../../src/ui/SnapshotRestoreUI";

// Alias for backwards compatibility with existing tests
type CheckpointDocumentProvider = SnapshotDocumentProvider;
const CheckpointRestoreUI = SnapshotRestoreUI;

// vscode mock provided by setup.ts

describe("SnapshotRestoreUI (CheckpointRestoreUI alias)", () => {
	let restoreUI: SnapshotRestoreUI;
	let mockCoordinator: any;
	let mockDocumentProvider: any;
	let workspaceRoot: string;

	beforeEach(() => {
		workspaceRoot = "/test/workspace";

		// Create mock coordinator with CORRECT method names for SnapshotRestoreUI
		mockCoordinator = {
			listSnapshots: vi.fn().mockResolvedValue([]),
			listCheckpoints: vi.fn().mockResolvedValue([]), // Legacy alias
			getSnapshotWithContent: vi.fn().mockResolvedValue(null),
			restoreToSnapshot: vi.fn().mockResolvedValue(true),
			restoreToCheckpoint: vi.fn().mockResolvedValue(true), // Legacy alias
		} as unknown as OperationCoordinator;

		// Create mock document provider with CORRECT method names
		mockDocumentProvider = {
			setSnapshotContent: vi.fn(),
			setCheckpointContent: vi.fn(), // Legacy alias
			clearAllContent: vi.fn(),
			clearContentForSnapshot: vi.fn(),
			clearContentForCheckpoint: vi.fn(), // Legacy alias
		} as unknown as SnapshotDocumentProvider;

		restoreUI = new SnapshotRestoreUI(
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

	// ===========================================================================
	// P0 BUG: Status bar disposal on cancel (TDD - should FAIL before fix)
	// ===========================================================================

	describe("P0: status bar disposal on cancel", () => {
		it("should dispose status bar when user cancels from diff preview", async () => {
			// ARRANGE: Set up a checkpoint with file contents
			const mockCheckpoints = [
				{
					id: "cp-1",
					name: "Checkpoint 1",
					timestamp: Date.now(),
					fileContents: { "file1.ts": "content1" },
					anchorFile: "file1.ts",
					fileCount: 1,
				},
			];
			mockCoordinator.listSnapshots = vi.fn().mockResolvedValue(mockCheckpoints);
			mockCoordinator.getSnapshotWithContent = vi.fn().mockResolvedValue({
				id: "cp-1",
				timestamp: Date.now(),
				fileContents: { "file1.ts": "content1" },
			});

			// Mock user selects the checkpoint
			(vscode.window.showQuickPick as any).mockResolvedValueOnce({
				label: "⏱️ file1.ts",
				id: "cp-1",
				timestamp: Date.now(),
				name: "file1.ts",
			});

			// Create a mock QuickPick that will be returned by createQuickPick
			const mockQuickPick = {
				items: [] as any[],
				selectedItems: [] as any[],
				title: "",
				placeholder: "",
				canSelectMany: false,
				matchOnDetail: false,
				matchOnDescription: false,
				onDidAccept: vi.fn((cb) => {
					// Simulate user pressing enter to accept
					setTimeout(() => {
						mockQuickPick.selectedItems = [{
							change: {
								filePath: "/test/workspace/file1.ts",
								relativePath: "file1.ts",
								fileName: "file1.ts",
								changeType: "modified",
								snapshotContent: "content1",
								currentContent: "current",
								icon: "diff-modified",
								changeSummary: "+1",
							},
						}];
						cb();
					}, 0);
					return { dispose: vi.fn() };
				}),
				onDidHide: vi.fn(() => ({ dispose: vi.fn() })),
				show: vi.fn(),
				hide: vi.fn(),
				dispose: vi.fn(),
			};
			(vscode.window.createQuickPick as any).mockReturnValue(mockQuickPick);

			// Track status bar creation and disposal
			const statusBarDisposeSpy = vi.fn();
			(vscode.window.createStatusBarItem as any).mockReturnValue({
				text: "",
				tooltip: "",
				command: "",
				show: vi.fn(),
				hide: vi.fn(),
				dispose: statusBarDisposeSpy,
			});

			// Mock user clicks "Cancel" in the information message
			(vscode.window.showInformationMessage as any).mockResolvedValue("Cancel");

			// Mock command registration to capture the resolve callback
			let resolveCallback: (() => void) | null = null;
			(vscode.commands.registerCommand as any).mockImplementation((cmd: string, cb: () => void) => {
				if (cmd === "snapback.internal.restoreFromPreview") {
					resolveCallback = cb;
				}
				return { dispose: vi.fn() };
			});

			// ACT: Run the workflow
			const result = await restoreUI.showRestoreWorkflow();

			// ASSERT: Result should be false (cancelled)
			expect(result).toBe(false);

			// ASSERT: Status bar should be disposed (THIS IS THE P0 BUG - will fail before fix)
			expect(statusBarDisposeSpy).toHaveBeenCalled();
		});
	});

	// ===========================================================================
	// P1 BUG: Tab close watcher (TDD - should FAIL before fix)
	// ===========================================================================

	describe("P1: tab close watcher", () => {
		it("should register onDidChangeTabs listener in waitForRestoreDecision", async () => {
			// ARRANGE: Track onDidChangeTabs registration
			const tabWatcherDispose = vi.fn();
			const mockOnDidChangeTabs = vi.fn(() => ({ dispose: tabWatcherDispose }));
			(vscode.window.tabGroups as any).onDidChangeTabs = mockOnDidChangeTabs;

			// Track status bar
			(vscode.window.createStatusBarItem as any).mockReturnValue({
				text: "",
				tooltip: "",
				command: "",
				show: vi.fn(),
				hide: vi.fn(),
				dispose: vi.fn(),
			});

			// Set up openDiffTabs so the watcher has something to track
			(restoreUI as any).openDiffTabs = [{ id: "mock-tab" }];

			// Mock info message to resolve with Cancel immediately
			(vscode.window.showInformationMessage as any).mockResolvedValue("Cancel");

			// ACT: Call showRestoreStatusBar then waitForRestoreDecision
			(restoreUI as any).showRestoreStatusBar("test-snapshot", 1);
			const result = await (restoreUI as any).waitForRestoreDecision("test-snapshot", 1);

			// ASSERT: Tab watcher should have been registered
			expect(mockOnDidChangeTabs).toHaveBeenCalled();

			// ASSERT: Result should be false (cancelled)
			expect(result).toBe(false);

			// ASSERT: Tab watcher should be disposed on cleanup
			expect(tabWatcherDispose).toHaveBeenCalled();
		});
	});

	// ===========================================================================
	// P2 BUG: Double disposal guard (TDD - should FAIL before fix)
	// ===========================================================================

	describe("P2: double disposal guard", () => {
		it("should not throw when commands are disposed multiple times", async () => {
			// ARRANGE: Track disposal calls
			const disposeCalls: string[] = [];
			let restoreCommandDisposed = false;
			let cancelCommandDisposed = false;

			(vscode.commands.registerCommand as any).mockImplementation((cmd: string, _cb: () => void) => {
				return {
					dispose: vi.fn(() => {
						disposeCalls.push(cmd);
						if (cmd === "snapback.internal.restoreFromPreview") {
							if (restoreCommandDisposed) {
								throw new Error("Command already disposed: " + cmd);
							}
							restoreCommandDisposed = true;
						}
						if (cmd === "snapback.internal.cancelRestore") {
							if (cancelCommandDisposed) {
								throw new Error("Command already disposed: " + cmd);
							}
							cancelCommandDisposed = true;
						}
					}),
				};
			});

			// Create mock snapshot
			const mockSnapshot = {
				id: "cp-1",
				name: "Test Snapshot",
				timestamp: Date.now(),
				fileContents: { "file1.ts": "content" },
			};
			const mockFileChanges = [
				{
					filePath: "/test/workspace/file1.ts",
					relativePath: "file1.ts",
					fileName: "file1.ts",
					changeType: "modified",
					snapshotContent: "content",
					currentContent: "current",
					icon: "diff-modified",
					changeSummary: "+1",
				},
			];

			// Mock: User clicks Cancel in the dialog
			(vscode.window.showInformationMessage as any).mockResolvedValue("Cancel");

			// Track status bar
			(vscode.window.createStatusBarItem as any).mockReturnValue({
				text: "",
				tooltip: "",
				command: "",
				show: vi.fn(),
				hide: vi.fn(),
				dispose: vi.fn(),
			});

			// ACT & ASSERT: Should not throw even though both paths might try to dispose
			await expect((restoreUI as any).showDiffPreviews(mockSnapshot, mockFileChanges))
				.resolves.not.toThrow();

			// Each command should only be disposed once (THIS IS P2 - may pass but ensures no double-disposal)
			const restoreDisposals = disposeCalls.filter(c => c === "snapback.internal.restoreFromPreview");
			const cancelDisposals = disposeCalls.filter(c => c === "snapback.internal.cancelRestore");
			
			expect(restoreDisposals.length).toBeLessThanOrEqual(1);
			expect(cancelDisposals.length).toBeLessThanOrEqual(1);
		});
	});
});
