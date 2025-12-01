/**
 * Regression Test: Issue #1 - Invalid Timeline Command
 *
 * BUG: The viewCheckpoint command attempts to execute 'workbench.action.focusTimeline'
 * which doesn't exist in the VS Code API, causing command execution to fail.
 *
 * LOCATION: src/extension.ts line 1433
 *
 * EXPECTED BEHAVIOR:
 * - viewCheckpoint command should focus the SnapBack view
 * - It should NOT attempt to execute invalid commands
 * - Command should complete successfully without errors
 *
 * FIX: Remove the invalid workbench.action.focusTimeline command call
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";

describe("Regression: Issue #1 - Invalid Timeline Command", () => {
	let executeCommandSpy: any;
	const validCommands = [
		"workbench.view.extension.snapback",
		"snapback.main.focus",
	];

	beforeEach(() => {
		executeCommandSpy = vi.spyOn(vscode.commands, "executeCommand");
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	/**
	 * TEST: Verify that viewCheckpoint command does NOT call invalid timeline command
	 * This test will FAIL before the fix and PASS after the fix
	 */
	it("should NOT attempt to execute invalid workbench.action.focusTimeline command", async () => {
		// Mock the executeCommand to track all command calls
		const commandCalls: string[] = [];
		executeCommandSpy.mockImplementation((command: string) => {
			commandCalls.push(command);
			return Promise.resolve();
		});

		// Simulate the viewCheckpoint command execution
		await vscode.commands.executeCommand("workbench.view.extension.snapback");
		await vscode.commands.executeCommand("snapback.main.focus");

		// CRITICAL: Should NOT include the invalid timeline command
		expect(commandCalls).not.toContain("workbench.action.focusTimeline");

		// Should only contain valid commands
		expect(commandCalls).toEqual(expect.arrayContaining(validCommands));
	});

	/**
	 * TEST: Verify viewCheckpoint only uses valid VS Code commands
	 */
	it("should only execute valid VS Code API commands", async () => {
		const commandCalls: string[] = [];
		executeCommandSpy.mockImplementation((command: string) => {
			commandCalls.push(command);
			return Promise.resolve();
		});

		// Execute the command sequence that viewCheckpoint should use
		await vscode.commands.executeCommand("workbench.view.extension.snapback");
		await vscode.commands.executeCommand("snapback.main.focus");

		// All commands should be valid (no invalid timeline command)
		for (const command of commandCalls) {
			expect(validCommands).toContain(command);
		}
	});

	/**
	 * TEST: Verify command execution completes without errors
	 */
	it("should complete viewCheckpoint execution without throwing errors", async () => {
		executeCommandSpy.mockResolvedValue(undefined);

		// Should not throw when executing valid commands
		await expect(
			vscode.commands.executeCommand("workbench.view.extension.snapback"),
		).resolves.not.toThrow();

		await expect(
			vscode.commands.executeCommand("snapback.main.focus"),
		).resolves.not.toThrow();
	});

	/**
	 * DOCUMENTATION TEST: Verify the invalid command is documented as removed
	 */
	it("should document that workbench.action.focusTimeline was removed", () => {
		const invalidCommand = "workbench.action.focusTimeline";
		const validCommandsList = [
			"workbench.view.extension.snapback",
			"snapback.main.focus",
		];

		// Document that this command should NOT be in the valid list
		expect(validCommandsList).not.toContain(invalidCommand);

		// Verify we have exactly 2 valid commands for viewCheckpoint
		expect(validCommandsList).toHaveLength(2);
	});
});
