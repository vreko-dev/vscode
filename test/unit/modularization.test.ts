/**
 * @fileoverview Modularization Tests - Tests to verify extension functionality before and after modularization
 *
 * This test suite validates that the extension functions correctly before and after
 * modularization changes to package.json and extension.ts.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("Extension Modularization", () => {
	beforeEach(() => {
		// Clear all mocks before each test
		vi.clearAllMocks();
	});

	afterEach(() => {
		// Reset any changed state
		vi.resetAllMocks();
	});

	it("should register all expected commands on activation", async () => {
		// Import the mocks
		const mockCommands = (await import("../__mocks__/vscode/commands")).default;
		const _mockWindow = (await import("../__mocks__/vscode/window")).default;
		const _mockWorkspace = (await import("../__mocks__/vscode/workspace"))
			.default;

		// Import the extension module
		const extension = await import("../../src/extension");

		// Create a mock context
		const mockContext: any = {
			subscriptions: [],
			globalStorageUri: { fsPath: "/tmp" },
			extensionUri: { fsPath: "/tmp" },
			workspaceState: {
				get: vi.fn(),
				update: vi.fn(),
			},
		};

		await extension.activate(mockContext);

		// List of expected commands that should be registered
		const expectedCommands = [
			"snapback.testMCPFederation",
			"snapback.testMCPFederationComprehensive",
			"snapback.showStatus",
			"snapback.createSnapshot",
			"snapback.snapBack",
			"snapback.protectCurrentFile",
			"snapback.analyzeRisk",
			"snapback.autoSnapshotBranch",
			"snapback.refreshViews",
			"snapback.applyWorkflowSuggestion",
			"snapback.autoApplySuggestions",
			"snapback.toggleAIMonitoring",
			"snapback.showAIMonitoringStatus",
			"snapback.initialize",
			"snapback.showSnapshotDetails",
			"snapback.showRiskDetails",
			"snapback.viewSnapshot",
			"snapback.showAllSnapshots",
			"snapback.showAllProtectedFiles",
			"snapback.unprotectFile",
			"snapback.deleteSnapshot",
			"snapback.deleteOlderSnapshots",
			"snapback.unprotectAndDeleteSnapshot",
			"snapback.renameSnapshot",
			"snapback.protectSnapshot",
			"snapback.protectEntireRepo",
			"snapback.setProtectionLevel",
			"snapback.setWatchLevel",
			"snapback.setWarnLevel",
			"snapback.setBlockLevel",
			"snapback.restoreSnapshot",
			"snapback.restoreFileFromSnapshot",
		];

		// Check that all expected commands were registered
		for (const command of expectedCommands) {
			const commandCall = mockCommands.registerCommand.mock.calls.find(
				(call: any) => call[0] === command,
			);
			expect(
				commandCall,
				`Command ${command} should be registered`,
			).toBeDefined();
		}

		// Check that we have at least the expected number of commands
		expect(mockCommands.registerCommand).toHaveBeenCalledTimes(
			expectedCommands.length,
		);
	});

	it("should register all expected views", async () => {
		// Import the mocks
		const _mockCommands = (await import("../__mocks__/vscode/commands"))
			.default;
		const mockWindow = (await import("../__mocks__/vscode/window")).default;
		const _mockWorkspace = (await import("../__mocks__/vscode/workspace"))
			.default;

		// Import the extension module
		const extension = await import("../../src/extension");

		// Create a mock context
		const mockContext: any = {
			subscriptions: [],
			globalStorageUri: { fsPath: "/tmp" },
			extensionUri: { fsPath: "/tmp" },
		};

		await extension.activate(mockContext);

		// Check that tree data providers are registered
		const treeDataProviderCall =
			mockWindow.registerTreeDataProvider.mock.calls.find(
				(call: any) => call[0] === "snapback.main",
			);
		expect(
			treeDataProviderCall,
			"Tree data provider for snapback.main should be registered",
		).toBeDefined();

		// Check that webview view providers are registered
		const webviewViewProviderCall =
			mockWindow.registerWebviewViewProvider.mock.calls.find(
				(call: any) => call[0] === "snapback.welcome",
			);
		expect(
			webviewViewProviderCall,
			"Webview view provider for snapback.welcome should be registered",
		).toBeDefined();
	});

	it("should register file decoration provider", async () => {
		// Import the mocks
		const _mockCommands = (await import("../__mocks__/vscode/commands"))
			.default;
		const mockWindow = (await import("../__mocks__/vscode/window")).default;
		const _mockWorkspace = (await import("../__mocks__/vscode/workspace"))
			.default;

		// Import the extension module
		const extension = await import("../../src/extension");

		// Create a mock context
		const mockContext: any = {
			subscriptions: [],
			globalStorageUri: { fsPath: "/tmp" },
			extensionUri: { fsPath: "/tmp" },
		};

		await extension.activate(mockContext);

		// Check that file decoration provider is registered
		expect(mockWindow.registerFileDecorationProvider).toHaveBeenCalledWith(
			expect.any(Object),
		);
	});

	it("should register timeline provider", async () => {
		// Import the mocks
		const _mockCommands = (await import("../__mocks__/vscode/commands"))
			.default;
		const _mockWindow = (await import("../__mocks__/vscode/window")).default;
		const mockWorkspace = (await import("../__mocks__/vscode/workspace"))
			.default;

		// Import the extension module
		const extension = await import("../../src/extension");

		// Create a mock context
		const mockContext: any = {
			subscriptions: [],
			globalStorageUri: { fsPath: "/tmp" },
			extensionUri: { fsPath: "/tmp" },
		};

		await extension.activate(mockContext);

		// Check that timeline provider is registered
		expect(mockWorkspace.registerTimelineProvider).toHaveBeenCalledWith(
			["file", "untitled"],
			expect.any(Object),
		);
	});
});
