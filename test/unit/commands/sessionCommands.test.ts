/**
 * Session Commands Tests
 *
 * Tests for the session command handlers that manage session-aware snapshots.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import type { CommandContext } from "@vscode/commands/index";
import { registerSessionCommands } from "@vscode/commands/sessionCommands";
import type { SessionManifest } from "@vscode/snapshot/sessionTypes";

// IMPORTANT: DO NOT re-mock vscode here!
// The global setup.ts provides a complete vscode mock.
// Use vi.mocked() to override specific methods if needed.

describe("Session Commands", () => {
	let commandContext: CommandContext;
	let mockSnapshotManager: any;
	let mockStorage: any;
	let mockOperationCoordinator: any;

	beforeEach(() => {
		// Reset mocks
		vi.clearAllMocks();

		// Create mock services
		mockSnapshotManager = {
			get: vi.fn(),
		};

		mockStorage = {
			restore: vi.fn(),
		};

		mockOperationCoordinator = {};

		// Create command context
		commandContext = {
			snapshotManager: mockSnapshotManager,
			storage: mockStorage,
			operationCoordinator: mockOperationCoordinator,
			// Add other required properties with minimal mocks
		} as unknown as CommandContext;
	});

	describe("snapback.restoreSession", () => {
		it("should register the restore session command", () => {
			// Act
			const disposables = registerSessionCommands({} as any, commandContext);

			// Assert
			expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
				"snapback.restoreSession",
				expect.any(Function),
			);
			expect(disposables).toHaveLength(2); // Should register both commands
		});

		it("should show error message when no session is selected", async () => {
			// Arrange
			const _disposables = registerSessionCommands({} as any, commandContext);
			const restoreCommand =
				vi.mocked(vscode.commands.registerCommand).mock.calls.find(
					(call) => call[0] === "snapback.restoreSession",
				)?.[1];

			// Act
			await restoreCommand?.();

			// Assert
			expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
				"No session selected",
			);
		});

		it("should restore all files in a session", async () => {
			// Arrange
			const session: SessionManifest = {
				id: "test-session-1",
				startedAt: Date.now() - 1000,
				endedAt: Date.now(),
				reason: "manual",
				files: [
					{
						uri: "/test/workspace/file1.ts",
						snapshotId: "snapshot-1",
					},
					{
						uri: "/test/workspace/file2.ts",
						snapshotId: "snapshot-2",
					},
				],
			};

			const _disposables = registerSessionCommands({} as any, commandContext);
			const restoreCommand =
				vi.mocked(vscode.commands.registerCommand).mock.calls.find(
					(call) => call[0] === "snapback.restoreSession",
				)?.[1];

			// Mock snapshot manager to return snapshots
			mockSnapshotManager.get
				.mockResolvedValueOnce({ id: "snapshot-1" })
				.mockResolvedValueOnce({ id: "snapshot-2" });

			// Mock storage restore to succeed
			mockStorage.restore.mockResolvedValue({ success: true });

			// Mock user confirmation
			vi.mocked(vscode.window.showWarningMessage).mockResolvedValue("Restore Session" as any);

			// Act
			await restoreCommand?.({ session });

			// Assert
			expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
				`Restore 2 files from session "${session.id}"?`,
				{ modal: true },
				"Restore Session",
			);
			expect(mockSnapshotManager.get).toHaveBeenCalledTimes(2);
			expect(mockStorage.restore).toHaveBeenCalledTimes(2);
			expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
				`Restored 2 files from session ${session.id}`,
			);
		});

		it("should handle restore errors gracefully", async () => {
			// Arrange
			const session: SessionManifest = {
				id: "test-session-2",
				startedAt: Date.now() - 1000,
				endedAt: Date.now(),
				reason: "manual",
				files: [
					{
						uri: "/test/workspace/file1.ts",
						snapshotId: "snapshot-1",
					},
				],
			};

			const _disposables = registerSessionCommands({} as any, commandContext);
			const restoreCommand =
				vi.mocked(vscode.commands.registerCommand).mock.calls.find(
					(call) => call[0] === "snapback.restoreSession",
				)?.[1];

			// Mock snapshot manager to return a snapshot
			mockSnapshotManager.get.mockResolvedValue({ id: "snapshot-1" });

			// Mock storage restore to fail
			mockStorage.restore.mockResolvedValue({
				success: false,
				error: "Restore failed",
			});

			// Mock user confirmation
			vi.mocked(vscode.window.showWarningMessage).mockResolvedValue("Restore Session" as any);

			// Act
			await restoreCommand?.({ session });

			// Assert
			expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
				expect.stringContaining("Failed to restore session"),
			);
		});
	});

	describe("snapback.previewRestoreSession", () => {
		it("should register the preview restore session command", () => {
			// Act
			const _disposables = registerSessionCommands({} as any, commandContext);

			// Assert
			expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
				"snapback.previewRestoreSession",
				expect.any(Function),
			);
		});

		it("should show error message when no session is selected", async () => {
			// Arrange
			const _disposables = registerSessionCommands({} as any, commandContext);
			const previewCommand =
				vi.mocked(vscode.commands.registerCommand).mock.calls.find(
					(call) => call[0] === "snapback.previewRestoreSession",
				)?.[1];

			// Act
			await previewCommand?.();

			// Assert
			expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
				"No session selected",
			);
		});
	});
});
