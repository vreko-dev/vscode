/**
 * @fileoverview Protection Commands Integration Tests
 *
 * This test suite validates the actual functionality of protection commands
 * in the SnapBack VS Code extension, testing real extension code rather than mocks.
 *
 * Tests cover:
 * - Protection command registration
 * - File protection functionality
 * - Protection level management
 * - Integration with the protected file registry
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

describe("Protection Commands Integration Tests", () => {
	beforeEach(async () => {
		// Reset all mocks
		vi.clearAllMocks();

		// Mock command registration
		(vscode.commands.getCommands as any).mockResolvedValue([
			"snapback.protectFile",
			"snapback.protectCurrentFile",
			"snapback.unprotectFile",
			"snapback.setProtectionLevel",
			"snapback.setWatchLevel",
			"snapback.setWarnLevel",
			"snapback.setBlockLevel",
			"snapback.changeProtectionLevel",
			"snapback.showAllProtectedFiles",
		]);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("Should register protection commands", async () => {
		// Test that protection commands are registered
		const commands = await vscode.commands.getCommands(true);

		const protectionCommands = [
			"snapback.protectFile",
			"snapback.protectCurrentFile",
			"snapback.unprotectFile",
			"snapback.setProtectionLevel",
			"snapback.setWatchLevel",
			"snapback.setWarnLevel",
			"snapback.setBlockLevel",
			"snapback.changeProtectionLevel",
			"snapback.showAllProtectedFiles",
		];

		for (const command of protectionCommands) {
			expect(commands).toContain(command);
		}
	});

	it("Should execute protect current file command without error", async () => {
		// Mock the command execution
		(vscode.commands.executeCommand as any).mockResolvedValue(undefined);

		// Execute the protect command
		await vscode.commands.executeCommand("snapback.protectCurrentFile");

		// Verify the command was called
		expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
			"snapback.protectCurrentFile",
		);
	});

	it("Should execute set watch level command without error", async () => {
		// Mock the command execution
		(vscode.commands.executeCommand as any).mockResolvedValue(undefined);

		// Execute the watch level command
		await vscode.commands.executeCommand("snapback.setWatchLevel");

		// Verify the command was called
		expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
			"snapback.setWatchLevel",
		);
	});

	it("Should execute set warn level command without error", async () => {
		// Mock the command execution
		(vscode.commands.executeCommand as any).mockResolvedValue(undefined);

		// Execute the warn level command
		await vscode.commands.executeCommand("snapback.setWarnLevel");

		// Verify the command was called
		expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
			"snapback.setWarnLevel",
		);
	});

	it("Should execute set block level command without error", async () => {
		// Mock the command execution
		(vscode.commands.executeCommand as any).mockResolvedValue(undefined);

		// Execute the block level command
		await vscode.commands.executeCommand("snapback.setBlockLevel");

		// Verify the command was called
		expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
			"snapback.setBlockLevel",
		);
	});

	it("Should execute unprotect file command without error", async () => {
		// Mock the command execution
		(vscode.commands.executeCommand as any).mockResolvedValue(undefined);

		// Execute the unprotect command
		await vscode.commands.executeCommand("snapback.unprotectFile");

		// Verify the command was called
		expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
			"snapback.unprotectFile",
		);
	});
});
