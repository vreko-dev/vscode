/**
 * Session Commands Tests
 *
 * Tests for the session command handlers that manage session-aware snapshots.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CommandContext } from "@vscode/commands/index";
import { registerSessionCommands } from "@vscode/commands/sessionCommands";
import type { SessionManifest } from "@vscode/snapshot/sessionTypes";

// Mock VS Code APIs
const mockVscode = {
	commands: {
		registerCommand: vi.fn(),
	},
	window: {
		showErrorMessage: vi.fn(),
		showWarningMessage: vi.fn(),
		showInformationMessage: vi.fn(),
	},
	workspace: {
		workspaceFolders: [{ uri: { fsPath: "/test/workspace" } }],
	},
};

// Use the global mock from setup.ts
vi.mock("vscode", () => mockVscode);

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
			expect(mockVscode.commands.registerCommand).toHaveBeenCalledWith(
				"snapback.restoreSession",
				expect.any(Function),
			);
			expect(disposables).toHaveLength(2); // Should register both commands
		});

		it("should show error message when no session is selected", async () => {
			// Arrange
			const _disposables = registerSessionCommands({} as any, commandContext);
			const restoreCommand =
				mockVscode.commands.registerCommand.mock.calls.find(
					(call) => call[0] === "snapback.restoreSession",
				)[1];

			// Act
			await restoreCommand();

			// Assert
			expect(mockVscode.window.showErrorMessage).toHaveBeenCalledWith(
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
				mockVscode.commands.registerCommand.mock.calls.find(
					(call) => call[0] === "snapback.restoreSession",
				)[1];

			// Mock snapshot manager to return snapshots
			mockSnapshotManager.get
				.mockResolvedValueOnce({ id: "snapshot-1" })
				.mockResolvedValueOnce({ id: "snapshot-2" });

			// Mock storage restore to succeed
			mockStorage.restore.mockResolvedValue({ success: true });

			// Mock user confirmation
			mockVscode.window.showWarningMessage.mockResolvedValue("Restore Session");

			// Act
			await restoreCommand({ session });

			// Assert
			expect(mockVscode.window.showWarningMessage).toHaveBeenCalledWith(
				`Restore 2 files from session "${session.id}"?`,
				{ modal: true },
				"Restore Session",
			);
			expect(mockSnapshotManager.get).toHaveBeenCalledTimes(2);
			expect(mockStorage.restore).toHaveBeenCalledTimes(2);
			expect(mockVscode.window.showInformationMessage).toHaveBeenCalledWith(
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
				mockVscode.commands.registerCommand.mock.calls.find(
					(call) => call[0] === "snapback.restoreSession",
				)[1];

			// Mock snapshot manager to return a snapshot
			mockSnapshotManager.get.mockResolvedValue({ id: "snapshot-1" });

			// Mock storage restore to fail
			mockStorage.restore.mockResolvedValue({
				success: false,
				error: "Restore failed",
			});

			// Mock user confirmation
			mockVscode.window.showWarningMessage.mockResolvedValue("Restore Session");

			// Act
			await restoreCommand({ session });

			// Assert
			expect(mockVscode.window.showErrorMessage).toHaveBeenCalledWith(
				expect.stringContaining("Failed to restore session"),
			);
		});
	});

	describe("snapback.previewRestoreSession", () => {
		it("should register the preview restore session command", () => {
			// Act
			const _disposables = registerSessionCommands({} as any, commandContext);

			// Assert
			expect(mockVscode.commands.registerCommand).toHaveBeenCalledWith(
				"snapback.previewRestoreSession",
				expect.any(Function),
			);
		});

		it("should show error message when no session is selected", async () => {
			// Arrange
			const _disposables = registerSessionCommands({} as any, commandContext);
			const previewCommand =
				mockVscode.commands.registerCommand.mock.calls.find(
					(call) => call[0] === "snapback.previewRestoreSession",
				)[1];

			// Act
			await previewCommand();

			// Assert
			expect(mockVscode.window.showErrorMessage).toHaveBeenCalledWith(
				"No session selected",
			);
		});
	});
});
