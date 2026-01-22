/**
 * Snapshot Commands - Daemon Delegation Tests
 *
 * Unit tests for ARCHITECTURE_REFACTOR_SPEC.md Phase 2:
 * Validates hybrid delegation pattern for snapshot commands
 *
 * Test Coverage:
 * - Daemon delegation when available and connected
 * - Graceful fallback to local when daemon fails
 * - Local-only execution when daemon disconnected
 * - Backward compatibility when daemon undefined
 * - Workspace path validation for delegation
 *
 * Context: Commit 9b36b8845 implemented daemon delegation for deleteSnapshot.
 * These tests verify the hybrid pattern works correctly across all scenarios.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import type { CommandContext } from "../../../src/commands/types";
import { registerSnapshotCommands } from "../../../src/commands/snapshotCommands";
import type { DaemonBridge } from "../../../src/services/DaemonBridge";
import type { SnapshotManager } from "../../../src/snapshot/SnapshotManager";

// IMPORTANT: DO NOT re-mock vscode here!
// The global setup.ts provides a complete vscode mock.
// Use vi.mocked() to override specific methods if needed.

/**
 * Tree item structure matching VSCode tree view format
 */
interface SnapshotTreeItem {
	id: string;
	label: string;
	data?: { type: "snapshot"; id: string };
}

describe("Snapshot Commands - Daemon Delegation", () => {
	let mockDaemonBridge: DaemonBridge;
	let mockSnapshotManager: SnapshotManager;
	let commandContext: CommandContext;

	beforeEach(() => {
		vi.clearAllMocks();

		// Create mock DaemonBridge with configurable behavior
		mockDaemonBridge = {
			isConnected: vi.fn().mockReturnValue(true),
			deleteSnapshot: vi.fn().mockResolvedValue(undefined), // void = success
			initialize: vi.fn().mockResolvedValue(undefined),
			dispose: vi.fn(),
		} as unknown as DaemonBridge;

		// Create mock SnapshotManager for fallback
		mockSnapshotManager = {
			deleteSnapshot: vi.fn().mockResolvedValue({ success: true }),
		} as unknown as SnapshotManager;

		// Create CommandContext with mocks
		commandContext = {
			snapshotManager: mockSnapshotManager,
			refreshViews: vi.fn(),
			daemonBridge: mockDaemonBridge,
			workspaceRoot: "/test/workspace",
			// Minimal required fields for CommandContext
			protectedFileRegistry: {} as any,
			operationCoordinator: {} as any,
			workflowIntegration: {} as any,
			notificationManager: {} as any,
			workspaceMemoryManager: {} as any,
			conflictResolver: {} as any,
			featureFlagService: {} as any,
			snapshotDocumentProvider: {} as any,
			protectionDecorationProvider: {} as any,
			fileHealthDecorationProvider: {} as any,
			snapshotRestoreUI: {} as any,
			intelligenceTreeProvider: {} as any,
			snapshotSummaryProvider: {} as any,
			configManager: {} as any,
			fileWatcher: {} as any,
			snapbackrcLoader: {} as any,
			welcomeView: {} as any,
			storage: {} as any,
			updateFileProtectionContext: vi.fn(),
			updateHasProtectedFilesContext: vi.fn(),
			getProtectionStateSummary: vi.fn(),
		} as unknown as CommandContext;
	});

	afterEach(() => {
		vi.resetAllMocks();
	});

	describe("deleteSnapshot - Daemon Delegation Success", () => {
		it("should delegate to daemon when connected and workspace available", async () => {
			// Arrange
			const treeItem: SnapshotTreeItem = {
				id: "snapshot-123",
				label: "Test Snapshot",
				data: { type: "snapshot", id: "snapshot-123" },
			};

			const _disposables = registerSnapshotCommands({} as any, commandContext);
			const deleteCommand = vi
				.mocked(vscode.commands.registerCommand)
				.mock.calls.find((call) => call[0] === "snapback.deleteSnapshot")?.[1];

			// Act
			await deleteCommand?.(treeItem);

			// Assert - Daemon should be called
			expect(mockDaemonBridge.isConnected).toHaveBeenCalled();
			expect(mockDaemonBridge.deleteSnapshot).toHaveBeenCalledWith("/test/workspace", "snapshot-123");

			// Assert - Local should NOT be called (daemon succeeded)
			expect(mockSnapshotManager.deleteSnapshot).not.toHaveBeenCalled();

			// Assert - Success message shown
			expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('Snapshot "Test Snapshot" deleted successfully');

			// Assert - Views refreshed
			expect(commandContext.refreshViews).toHaveBeenCalled();
		});

		it("should extract snapshot ID from tree item data.id", async () => {
			// Arrange
			const treeItem: SnapshotTreeItem = {
				id: "display-id-123", // Display ID (different from actual ID)
				label: "Test Snapshot",
				data: { type: "snapshot", id: "actual-snapshot-456" }, // Actual snapshot ID
			};

			const _disposables = registerSnapshotCommands({} as any, commandContext);
			const deleteCommand = vi
				.mocked(vscode.commands.registerCommand)
				.mock.calls.find((call) => call[0] === "snapback.deleteSnapshot")?.[1];

			// Act
			await deleteCommand?.(treeItem);

			// Assert - Daemon called with actual snapshot ID, not display ID
			expect(mockDaemonBridge.deleteSnapshot).toHaveBeenCalledWith("/test/workspace", "actual-snapshot-456");
		});
	});

	describe("deleteSnapshot - Graceful Fallback", () => {
		it("should fall back to local when daemon throws error", async () => {
			// Arrange
			const treeItem: SnapshotTreeItem = {
				id: "snapshot-123",
				label: "Test Snapshot",
				data: { type: "snapshot", id: "snapshot-123" },
			};

			// Configure daemon to fail
			vi.mocked(mockDaemonBridge.deleteSnapshot).mockRejectedValueOnce(new Error("Daemon connection lost"));

			const _disposables = registerSnapshotCommands({} as any, commandContext);
			const deleteCommand = vi
				.mocked(vscode.commands.registerCommand)
				.mock.calls.find((call) => call[0] === "snapback.deleteSnapshot")?.[1];

			// Act
			await deleteCommand?.(treeItem);

			// Assert - Daemon should be tried first
			expect(mockDaemonBridge.deleteSnapshot).toHaveBeenCalledWith("/test/workspace", "snapshot-123");

			// Assert - Local should be called as fallback
			expect(mockSnapshotManager.deleteSnapshot).toHaveBeenCalledWith("snapshot-123");

			// Assert - Success message shown (from local fallback)
			expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('Snapshot "Test Snapshot" deleted successfully');
		});

		it("should use local when daemon is disconnected", async () => {
			// Arrange
			const treeItem: SnapshotTreeItem = {
				id: "snapshot-123",
				label: "Test Snapshot",
				data: { type: "snapshot", id: "snapshot-123" },
			};

			// Configure daemon as disconnected
			vi.mocked(mockDaemonBridge.isConnected).mockReturnValue(false);

			const _disposables = registerSnapshotCommands({} as any, commandContext);
			const deleteCommand = vi
				.mocked(vscode.commands.registerCommand)
				.mock.calls.find((call) => call[0] === "snapback.deleteSnapshot")?.[1];

			// Act
			await deleteCommand?.(treeItem);

			// Assert - Daemon should NOT be called (disconnected)
			expect(mockDaemonBridge.deleteSnapshot).not.toHaveBeenCalled();

			// Assert - Local should be called directly
			expect(mockSnapshotManager.deleteSnapshot).toHaveBeenCalledWith("snapshot-123");

			// Assert - Success message shown (from local)
			expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('Snapshot "Test Snapshot" deleted successfully');
		});

		it("should use local when workspace root is undefined", async () => {
			// Arrange
			const treeItem: SnapshotTreeItem = {
				id: "snapshot-123",
				label: "Test Snapshot",
				data: { type: "snapshot", id: "snapshot-123" },
			};

			// Configure context with no workspace root
			commandContext.workspaceRoot = undefined as any;

			const _disposables = registerSnapshotCommands({} as any, commandContext);
			const deleteCommand = vi
				.mocked(vscode.commands.registerCommand)
				.mock.calls.find((call) => call[0] === "snapback.deleteSnapshot")?.[1];

			// Act
			await deleteCommand?.(treeItem);

			// Assert - Daemon should NOT be called (no workspace)
			expect(mockDaemonBridge.deleteSnapshot).not.toHaveBeenCalled();

			// Assert - Local should be called directly
			expect(mockSnapshotManager.deleteSnapshot).toHaveBeenCalledWith("snapshot-123");
		});

		it("should use local when workspace root is empty string", async () => {
			// Arrange
			const treeItem: SnapshotTreeItem = {
				id: "snapshot-123",
				label: "Test Snapshot",
				data: { type: "snapshot", id: "snapshot-123" },
			};

			// Configure context with empty workspace root
			commandContext.workspaceRoot = "";

			const _disposables = registerSnapshotCommands({} as any, commandContext);
			const deleteCommand = vi
				.mocked(vscode.commands.registerCommand)
				.mock.calls.find((call) => call[0] === "snapback.deleteSnapshot")?.[1];

			// Act
			await deleteCommand?.(treeItem);

			// Assert - Daemon should NOT be called (empty workspace)
			expect(mockDaemonBridge.deleteSnapshot).not.toHaveBeenCalled();

			// Assert - Local should be called directly
			expect(mockSnapshotManager.deleteSnapshot).toHaveBeenCalledWith("snapshot-123");
		});
	});

	describe("deleteSnapshot - Backward Compatibility", () => {
		it("should work without daemonBridge (backward compatibility)", async () => {
			// Arrange
			const treeItem: SnapshotTreeItem = {
				id: "snapshot-123",
				label: "Test Snapshot",
				data: { type: "snapshot", id: "snapshot-123" },
			};

			// Configure context without daemon bridge
			commandContext.daemonBridge = undefined;

			const _disposables = registerSnapshotCommands({} as any, commandContext);
			const deleteCommand = vi
				.mocked(vscode.commands.registerCommand)
				.mock.calls.find((call) => call[0] === "snapback.deleteSnapshot")?.[1];

			// Act
			await deleteCommand?.(treeItem);

			// Assert - Local should be called directly
			expect(mockSnapshotManager.deleteSnapshot).toHaveBeenCalledWith("snapshot-123");

			// Assert - Success message shown (from local)
			expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('Snapshot "Test Snapshot" deleted successfully');
		});

		it("should use local when both daemon unavailable and workspace missing", async () => {
			// Arrange
			const treeItem: SnapshotTreeItem = {
				id: "snapshot-123",
				label: "Test Snapshot",
				data: { type: "snapshot", id: "snapshot-123" },
			};

			// Configure context with no daemon and no workspace
			commandContext.daemonBridge = undefined;
			commandContext.workspaceRoot = undefined as any;

			const _disposables = registerSnapshotCommands({} as any, commandContext);
			const deleteCommand = vi
				.mocked(vscode.commands.registerCommand)
				.mock.calls.find((call) => call[0] === "snapback.deleteSnapshot")?.[1];

			// Act
			await deleteCommand?.(treeItem);

			// Assert - Local should be called directly
			expect(mockSnapshotManager.deleteSnapshot).toHaveBeenCalledWith("snapshot-123");
		});
	});

	describe("deleteSnapshot - Error Handling", () => {
		it("should show error message when no snapshot is selected", async () => {
			// Arrange
			const _disposables = registerSnapshotCommands({} as any, commandContext);
			const deleteCommand = vi
				.mocked(vscode.commands.registerCommand)
				.mock.calls.find((call) => call[0] === "snapback.deleteSnapshot")?.[1];

			// Act - Call without tree item
			await deleteCommand?.(undefined);

			// Assert
			expect(vscode.window.showErrorMessage).toHaveBeenCalledWith("No snapshot selected");

			// Assert - No operations attempted
			expect(mockDaemonBridge.deleteSnapshot).not.toHaveBeenCalled();
			expect(mockSnapshotManager.deleteSnapshot).not.toHaveBeenCalled();
		});

		it("should show error message when local deletion fails", async () => {
			// Arrange
			const treeItem: SnapshotTreeItem = {
				id: "snapshot-123",
				label: "Test Snapshot",
				data: { type: "snapshot", id: "snapshot-123" },
			};

			// Configure daemon as disconnected to force local
			vi.mocked(mockDaemonBridge.isConnected).mockReturnValue(false);

			// Configure local to fail
			vi.mocked(mockSnapshotManager.deleteSnapshot).mockRejectedValueOnce(new Error("Database error"));

			const _disposables = registerSnapshotCommands({} as any, commandContext);
			const deleteCommand = vi
				.mocked(vscode.commands.registerCommand)
				.mock.calls.find((call) => call[0] === "snapback.deleteSnapshot")?.[1];

			// Act
			await deleteCommand?.(treeItem);

			// Assert - Error message shown
			expect(vscode.window.showErrorMessage).toHaveBeenCalledWith("Failed to delete snapshot: Database error");

			// Assert - No success message
			expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
		});

		it("should show error when both daemon and local fail", async () => {
			// Arrange
			const treeItem: SnapshotTreeItem = {
				id: "snapshot-123",
				label: "Test Snapshot",
				data: { type: "snapshot", id: "snapshot-123" },
			};

			// Configure daemon to fail
			vi.mocked(mockDaemonBridge.deleteSnapshot).mockRejectedValueOnce(new Error("Daemon error"));

			// Configure local to fail
			vi.mocked(mockSnapshotManager.deleteSnapshot).mockRejectedValueOnce(new Error("Storage error"));

			const _disposables = registerSnapshotCommands({} as any, commandContext);
			const deleteCommand = vi
				.mocked(vscode.commands.registerCommand)
				.mock.calls.find((call) => call[0] === "snapback.deleteSnapshot")?.[1];

			// Act
			await deleteCommand?.(treeItem);

			// Assert - Both should be attempted
			expect(mockDaemonBridge.deleteSnapshot).toHaveBeenCalled();
			expect(mockSnapshotManager.deleteSnapshot).toHaveBeenCalled();

			// Assert - Error message shown from final failure
			expect(vscode.window.showErrorMessage).toHaveBeenCalledWith("Failed to delete snapshot: Storage error");
		});
	});

	describe("deleteOlderSnapshots - Daemon Delegation", () => {
		beforeEach(() => {
			// Add bulkDeleteSnapshots mock to daemon bridge
			(mockDaemonBridge as any).bulkDeleteSnapshots = vi.fn().mockResolvedValue({
				deletedCount: 3,
				success: true,
			});

			// Add deleteOlderThan mock to snapshot manager for fallback
			(mockSnapshotManager as any).deleteOlderThan = vi.fn().mockResolvedValue({
				success: true,
				deletedCount: 3,
			});
		});

		it("should delegate to daemon when connected and workspace available", async () => {
			// Arrange
			const _disposables = registerSnapshotCommands({} as any, commandContext);
			const deleteOlderCommand = vi
				.mocked(vscode.commands.registerCommand)
				.mock.calls.find((call) => call[0] === "snapback.deleteOlderSnapshots")?.[1];

			// Mock user inputs
			vi.mocked(vscode.window.showInputBox).mockResolvedValueOnce("30"); // days
			(vscode.window.showQuickPick as any).mockResolvedValueOnce("Yes"); // keep protected

			// Act
			await deleteOlderCommand?.();

			// Assert - Daemon should be called
			expect(mockDaemonBridge.isConnected).toHaveBeenCalled();
			expect((mockDaemonBridge as any).bulkDeleteSnapshots).toHaveBeenCalledWith(
				"/test/workspace",
				expect.objectContaining({
					olderThanDays: 30,
					keepProtected: true,
				}),
			);

			// Assert - Local should NOT be called (daemon succeeded)
			expect((mockSnapshotManager as any).deleteOlderThan).not.toHaveBeenCalled();

			// Assert - Success message shown
			expect(vscode.window.showInformationMessage).toHaveBeenCalledWith("Deleted 3 snapshot(s) older than 30 days");

			// Assert - Views refreshed
			expect(commandContext.refreshViews).toHaveBeenCalled();
		});

		it("should fall back to local when daemon fails", async () => {
			// Arrange
			vi.mocked((mockDaemonBridge as any).bulkDeleteSnapshots).mockRejectedValueOnce(
				new Error("Daemon connection lost"),
			);

			const _disposables = registerSnapshotCommands({} as any, commandContext);
			const deleteOlderCommand = vi
				.mocked(vscode.commands.registerCommand)
				.mock.calls.find((call) => call[0] === "snapback.deleteOlderSnapshots")?.[1];

			// Mock user inputs
			vi.mocked(vscode.window.showInputBox).mockResolvedValueOnce("30");
			(vscode.window.showQuickPick as any).mockResolvedValueOnce("Yes");

			// Act
			await deleteOlderCommand?.();

			// Assert - Daemon should be tried first
			expect((mockDaemonBridge as any).bulkDeleteSnapshots).toHaveBeenCalled();

			// Assert - Local should be called as fallback
			expect((mockSnapshotManager as any).deleteOlderThan).toHaveBeenCalled();

			// Assert - Success message shown (from local fallback)
			expect(vscode.window.showInformationMessage).toHaveBeenCalledWith("Deleted 3 snapshot(s) older than 30 days");
		});

		it("should use local when daemon is disconnected", async () => {
			// Arrange
			vi.mocked(mockDaemonBridge.isConnected).mockReturnValue(false);

			const _disposables = registerSnapshotCommands({} as any, commandContext);
			const deleteOlderCommand = vi
				.mocked(vscode.commands.registerCommand)
				.mock.calls.find((call) => call[0] === "snapback.deleteOlderSnapshots")?.[1];

			// Mock user inputs
			vi.mocked(vscode.window.showInputBox).mockResolvedValueOnce("30");
			(vscode.window.showQuickPick as any).mockResolvedValueOnce("No"); // Don't keep protected

			// Act
			await deleteOlderCommand?.();

			// Assert - Daemon should NOT be called (disconnected)
			expect((mockDaemonBridge as any).bulkDeleteSnapshots).not.toHaveBeenCalled();

			// Assert - Local should be called directly
			expect((mockSnapshotManager as any).deleteOlderThan).toHaveBeenCalledWith(
				expect.any(Number), // cutoff timestamp
				false, // keepProtected = false (user selected "No")
			);
		});
	});
});
