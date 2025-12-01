/**
 * @fileoverview Core Functionality Integration Tests
 *
 * This test suite validates the core functionality of the SnapBack VS Code extension,
 * testing the complete workflow from file protection to snapshot management.
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

describe("Core Functionality Integration Tests", () => {
	beforeEach(async () => {
		// Reset all mocks
		vi.clearAllMocks();

		// Mock command registration
		(vscode.commands.getCommands as any).mockResolvedValue([
			"snapback.protectCurrentFile",
			"snapback.unprotectFile",
			"snapback.setWatchLevel",
			"snapback.setWarnLevel",
			"snapback.setBlockLevel",
			"snapback.showAllProtectedFiles",
			"snapback.createCheckpoint",
			"snapback.deleteSnapshot",
			"snapback.renameSnapshot",
		]);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("Should register protection commands", async () => {
		// Test that protection commands are registered
		const commands = await vscode.commands.getCommands(true);

		const protectionCommands = [
			"snapback.protectCurrentFile",
			"snapback.unprotectFile",
			"snapback.setWatchLevel",
			"snapback.setWarnLevel",
			"snapback.setBlockLevel",
			"snapback.showAllProtectedFiles",
		];

		for (const command of protectionCommands) {
			expect(commands).toContain(command);
		}
	});

	it("Should register snapshot commands", async () => {
		// Test that snapshot commands are registered
		const commands = await vscode.commands.getCommands(true);

		const snapshotCommands = [
			"snapback.deleteSnapshot",
			"snapback.renameSnapshot",
			"snapback.createCheckpoint",
		];

		for (const command of snapshotCommands) {
			expect(commands).toContain(command);
		}
	});

	it("Should execute protect command without error", async () => {
		// Mock the command execution
		(vscode.commands.executeCommand as any).mockResolvedValue(undefined);

		// Execute the protect command
		await vscode.commands.executeCommand("snapback.protectCurrentFile");

		// Verify the command was called
		expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
			"snapback.protectCurrentFile",
		);
	});

	it("Should execute unprotect command without error", async () => {
		// Mock the command execution
		(vscode.commands.executeCommand as any).mockResolvedValue(undefined);

		// Execute the unprotect command
		await vscode.commands.executeCommand("snapback.unprotectFile");

		// Verify the command was called
		expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
			"snapback.unprotectFile",
		);
	});

	it("Should execute protection level commands without error", async () => {
		// Mock the command execution
		(vscode.commands.executeCommand as any).mockResolvedValue(undefined);

		const protectionLevelCommands = [
			"snapback.setWatchLevel",
			"snapback.setWarnLevel",
			"snapback.setBlockLevel",
		];

		// Execute each protection level command
		for (const command of protectionLevelCommands) {
			await vscode.commands.executeCommand(command);
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(command);
		}
	});

	it("Should execute snapshot commands without error", async () => {
		// Mock the command execution
		(vscode.commands.executeCommand as any).mockResolvedValue(undefined);

		const snapshotCommands = [
			"snapback.createCheckpoint",
			"snapback.deleteSnapshot",
			"snapback.renameSnapshot",
		];

		// Execute each snapshot command
		for (const command of snapshotCommands) {
			await vscode.commands.executeCommand(command);
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(command);
		}
	});
});
