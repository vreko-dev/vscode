import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { registerPolicyOverrideCommands } from "../../src/commands/policyOverrideCommands";

// vscode mock provided by setup.ts
describe("PolicyOverrideCommands", () => {
	const mockContext: any = {
		subscriptions: [],
	};

	const mockCommandContext: any = {
		workspaceRoot: "/test/workspace",
	};

	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("should register the createPolicyOverride command", () => {
		const disposables = registerPolicyOverrideCommands(
			mockContext,
			mockCommandContext,
		);

		expect(disposables).toHaveLength(1);
		expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
			"snapback.createPolicyOverride",
			expect.any(Function),
		);
	});

	it("should show error when no workspace folder is found", async () => {
		// Temporarily remove workspace folders
		const originalWorkspaceFolders = vscode.workspace.workspaceFolders;
		Object.defineProperty(vscode.workspace, "workspaceFolders", {
			value: undefined,
			configurable: true,
		});

		const _disposables = registerPolicyOverrideCommands(
			mockContext,
			mockCommandContext,
		);

		// Get the command callback
		const registerCommandMock = vscode.commands.registerCommand as any;
		const commandCallback = registerCommandMock.mock.calls[0][1];

		// Execute the command
		await commandCallback({ fsPath: "/test/workspace/test.ts" });

		// Verify error message was shown
		expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
			"No workspace folder found",
		);

		// Restore workspace folders
		Object.defineProperty(vscode.workspace, "workspaceFolders", {
			value: originalWorkspaceFolders,
			configurable: true,
		});
	});
});
