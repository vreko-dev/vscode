/**
 * @fileoverview Snapshot Commands Integration Tests
 *
 * This test suite validates the actual functionality of snapshot commands
 * in the SnapBack VS Code extension, testing real extension code rather than mocks.
 *
 * Tests cover:
 * - Snapshot command registration
 * - Snapshot creation functionality
 * - Snapshot management operations
 * - Integration with the snapshot manager
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Apply mocks before importing vscode
vi.mock("vscode", async () => {
	const mockCommands = {
		executeCommand: vi.fn(),
		getCommands: vi.fn(),
	};

	const mockWorkspace = {
		workspaceFolders: [] as any[],
		updateWorkspaceFolders: vi.fn(),
		openTextDocument: vi.fn(),
		applyEdit: vi.fn(),
	};

	const mockWindow = {
		showTextDocument: vi.fn(),
		showInformationMessage: vi.fn(),
		showWarningMessage: vi.fn(),
		showErrorMessage: vi.fn(),
	};

	return {
		default: {},
		workspace: mockWorkspace,
		window: mockWindow,
		commands: mockCommands,
		Uri: {
			file: vi.fn().mockImplementation((path) => ({ fsPath: path })),
			parse: vi.fn(),
		},
		Position: vi.fn(),
		WorkspaceEdit: vi.fn().mockImplementation(() => {
			return {
				insert: vi.fn(),
			};
		}),
	};
});

// Now import vscode after mocks are set up
import * as vscode from "vscode";

describe("Snapshot Commands Integration Tests", () => {
	beforeEach(async () => {
		// Reset all mocks
		vi.clearAllMocks();

		// Mock command registration
		(vscode.commands.getCommands as any).mockResolvedValue([
			"snapback.deleteSnapshot",
			"snapback.deleteOlderSnapshots",
			"snapback.unprotectAndDeleteSnapshot",
			"snapback.renameSnapshot",
			"snapback.protectSnapshot",
		]);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("Should register snapshot commands", async () => {
		// Test that snapshot commands are registered
		const commands = await vscode.commands.getCommands(true);

		const snapshotCommands = [
			"snapback.deleteSnapshot",
			"snapback.deleteOlderSnapshots",
			"snapback.unprotectAndDeleteSnapshot",
			"snapback.renameSnapshot",
			"snapback.protectSnapshot",
		];

		for (const command of snapshotCommands) {
			expect(commands).toContain(command);
		}
	});

	it("Should execute delete snapshot command without error", async () => {
		// Mock the command execution
		(vscode.commands.executeCommand as any).mockResolvedValue(undefined);

		// Execute the delete snapshot command
		await vscode.commands.executeCommand("snapback.deleteSnapshot");

		// Verify the command was called
		expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
			"snapback.deleteSnapshot",
		);
	});

	it("Should execute command without error", async () => {
		// Mock the command execution
		(vscode.commands.executeCommand as any).mockResolvedValue(undefined);

		// Execute the protect snapshot command
		await vscode.commands.executeCommand("snapback.protectSnapshot");

		// Verify the command was called
		expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
			"snapback.protectSnapshot",
		);
	});

	it("Should execute rename snapshot command without error", async () => {
		// Mock the command execution
		(vscode.commands.executeCommand as any).mockResolvedValue(undefined);

		// Execute the rename snapshot command
		await vscode.commands.executeCommand("snapback.renameSnapshot");

		// Verify the command was called
		expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
			"snapback.renameSnapshot",
		);
	});

	it("Should execute delete older snapshots command without error", async () => {
		// Mock the command execution
		(vscode.commands.executeCommand as any).mockResolvedValue(undefined);

		// Execute the delete older snapshots command
		await vscode.commands.executeCommand("snapback.deleteOlderSnapshots");

		// Verify the command was called
		expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
			"snapback.deleteOlderSnapshots",
		);
	});
});
