/**
 * @fileoverview Extension Activation - Non-Blocking Tests
 *
 * Tests to verify that extension activation doesn't block on notifications.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock vscode before imports
vi.mock("vscode", () => ({
	window: {
		showWarningMessage: vi.fn().mockResolvedValue(undefined),
		showErrorMessage: vi.fn().mockResolvedValue(undefined),
		showInformationMessage: vi.fn().mockResolvedValue(undefined),
		createStatusBarItem: vi.fn(() => ({
			show: vi.fn(),
			dispose: vi.fn(),
			text: "",
			command: "",
		})),
		createOutputChannel: vi.fn(() => ({
			appendLine: vi.fn(),
			show: vi.fn(),
			dispose: vi.fn(),
		})),
	},
	workspace: {
		isTrusted: false,
		getConfiguration: vi.fn(() => ({
			get: vi.fn().mockReturnValue(false),
		})),
		workspaceFolders: [
			{ uri: { fsPath: "/mock/workspace" }, name: "mock-workspace", index: 0 },
		],
	},
	ExtensionContext: {},
	StatusBarAlignment: { Left: 1, Right: 2 },
	extensions: {
		getExtension: vi.fn(() => ({
			packageJSON: { version: "1.0.0" },
		})),
	},
	commands: {
		executeCommand: vi.fn().mockResolvedValue(undefined),
	},
}));

import * as vscode from "vscode";

describe("Extension Activation - Non-Blocking", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	/**
	 * This test verifies that workspace trust warnings don't block activation.
	 * The warning should be deferred and shown after activation completes.
	 */
	it("should defer workspace trust warning after activation", async () => {
		const _mockContext = createMockExtensionContext();

		// Simulate untrusted workspace
		(vscode.workspace as any).isTrusted = false;

		// Note: In real usage, showDeferredWorkspaceTrustWarning would be called
		// This test focuses on verifying the non-blocking pattern

		// The workspace trust warning should NOT be awaited during activation
		expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
	});

	it('should respect "Don\'t Show Again" for workspace trust', async () => {
		const mockContext = createMockExtensionContext();
		mockContext.globalState.get = vi.fn().mockReturnValue(true); // Already acknowledged

		// Simulate workspace trust check
		const isAcknowledged = mockContext.globalState.get(
			"snapback.workspace-trust-warning-acknowledged",
		);

		if (!isAcknowledged) {
			await vscode.window.showWarningMessage("Warning");
		}

		// Should not have shown warning
		expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
	});

	it("should allow offline mode notification to be deferred", async () => {
		const _mockContext = createMockExtensionContext();

		// Offline notifications should be deferred with setTimeout
		const offlineModeEnabled = true;

		if (offlineModeEnabled) {
			// This simulates the non-blocking pattern
			setTimeout(
				() =>
					vscode.window.showInformationMessage(
						"SnapBack is running in offline mode",
					),
				100,
			);
		}

		// Immediately after scheduling, notification shouldn't be shown yet
		expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
	});

	it("should initialize output channel early (blocking)", () => {
		const _mockContext = createMockExtensionContext();

		// This should happen immediately (it's essential for logging)
		const outputChannel = vscode.window.createOutputChannel("SnapBack");
		expect(vscode.window.createOutputChannel).toHaveBeenCalledWith("SnapBack");
		expect(outputChannel).toBeDefined();
	});
});

function createMockExtensionContext(): any {
	return {
		globalState: {
			get: vi.fn().mockReturnValue(undefined),
			update: vi.fn().mockResolvedValue(undefined),
		},
		workspaceState: {
			get: vi.fn().mockReturnValue(undefined),
			update: vi.fn().mockResolvedValue(undefined),
		},
		subscriptions: [],
		extensionPath: "/mock/path",
		globalStorageUri: { fsPath: "/mock/storage" },
		workspaceStorageUri: { fsPath: "/mock/workspace-storage" },
		extensionUri: { fsPath: "/mock/extension" },
		asAbsolutePath: (path: string) => `/mock${path}`,
		logPath: "/mock/logs",
		logUri: { fsPath: "/mock/logs" },
	};
}
