/**
 * @fileoverview Extension Integration Tests - Comprehensive Activation & Command Validation
 *
 * This test suite validates the complete extension lifecycle including activation,
 * component initialization, command registration, and core functionality integration.
 *
 * TEST COVERAGE:
 * - Extension activation sequence and component initialization
 * - Command registration and handler binding
 * - MCP service federation integration
 * - Event handling and cross-component coordination
 * - Error handling and graceful degradation
 *
 * @author SnapBack QA Team
 * @version 1.0.0
 * @since 2024-01-01
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as vscode from "vscode";
import * as mockGuardian from "./__mocks__/guardian.js";
import * as mockStorage from "./__mocks__/storage.js";
import * as mockCommands from "./__mocks__/vscode/commands.js";
import * as mockWindow from "./__mocks__/vscode/window.js";
import * as mockWorkspace from "./__mocks__/vscode/workspace.js";

// Legacy integration coverage - see snapshot-refactor plan for replacement.
describe.skip("VS Code Extension (legacy integration)", () => {
	beforeEach(() => {
		// Clear all mocks before each test
		vi.clearAllMocks();

		// Mock workspace folders
		mockWorkspace.workspaceFolders.splice(
			0,
			mockWorkspace.workspaceFolders.length,
			{ uri: { fsPath: "/test/workspace" } },
		);
	});

	afterEach(() => {
		// Reset any changed state
		vi.resetAllMocks();
	});

	it("should register all expected commands on activation", async () => {
		// Import the extension module
		const extension = await import("../src/extension");

		// Create a mock context
		const mockContext = {
			subscriptions: [],
			globalStorageUri: { fsPath: "/tmp" },
			extensionUri: { fsPath: "/tmp" },
		} as unknown as vscode.ExtensionContext;

		await extension.activate(mockContext);

		// List of all expected commands including protection level commands
		const expectedCommands = [
			"snapback.helloWorld",
			"snapback.testMCPFederation",
			"snapback.testMCPFederationComprehensive",
			"snapback.showStatus",
			"snapback.createCheckpoint",
			"snapback.showProtectionStatus",
			"snapback.protectCurrentFile",
			"snapback.analyzeRisk",
			"snapback.autoCheckpointBranch",
			"snapback.refreshViews",
			"snapback.applyWorkflowSuggestion",
			"snapback.autoApplySuggestions",
			"snapback.toggleAIMonitoring",
			"snapback.showAIMonitoringStatus",
			// Protection level commands that should be registered
			"snapback.setWatchLevel",
			"snapback.setWarnLevel",
			"snapback.setBlockLevel",
			"snapback.protectFile",
			"snapback.changeProtectionLevel",
			"snapback.unprotectFile",
		];

		// Check that all commands were registered
		for (const command of expectedCommands) {
			const commandCall = mockCommands.registerCommand.mock.calls.find(
				(call) => call[0] === command,
			);
			expect(
				commandCall,
				`Command ${command} should be registered`,
			).toBeDefined();
		}

		// Check that we have commands registered
		expect(mockCommands.registerCommand).toHaveBeenCalled();
	});

	it("should create snapshot when command is executed", async () => {
		const extension = await import("../src/extension");
		const mockContext = {
			subscriptions: [],
			globalStorageUri: { fsPath: "/tmp" },
			extensionUri: { fsPath: "/tmp" },
		} as unknown as vscode.ExtensionContext;

		await extension.activate(mockContext);

		// Get the registered command handler
		const commandCall = mockCommands.registerCommand.mock.calls.find(
			(call) => call[0] === "snapback.createCheckpoint",
		);

		expect(commandCall).toBeDefined();
		if (!commandCall) return;

		// Mock the storage response
		const mockCheckpoint = { id: "test-cp-123", timestamp: Date.now() };
		mockStorage.create.mockResolvedValue(mockCheckpoint);

		// Execute the command handler
		const handler = commandCall[1];
		await handler();

		// Check that storage.create was called
		expect(mockStorage.create).toHaveBeenCalledWith({ trigger: "manual" });

		// Check that success message was shown
		expect(mockWindow.showInformationMessage).toHaveBeenCalledWith(
			"Snapshot test-cp-123 created successfully",
		);
	});

	it("should handle pre-save interception for risky documents", async () => {
		const extension = await import("../src/extension");
		const mockContext: vscode.ExtensionContext = {
			subscriptions: [],
			globalStorageUri: { fsPath: "/tmp" },
			extensionUri: { fsPath: "/tmp" },
		} as unknown as vscode.ExtensionContext;

		await extension.activate(mockContext);

		// Get the save event handler
		const saveHandlerCall = mockWorkspace.onWillSaveTextDocument.mock.calls[0];
		const saveHandler = saveHandlerCall[0];

		// Mock a document with risky content
		const mockDocument = {
			getText: vi.fn().mockReturnValue("Risk content\n".repeat(100)), // Large content
		};

		const mockEvent = {
			document: mockDocument,
		};

		// Mock guardian to return high risk
		mockGuardian.quickCheckDoc.mockResolvedValue({
			score: 0.8,
			factors: [],
			severity: "high",
		});

		// Mock storage response
		mockStorage.create.mockResolvedValue({
			id: "cp-risk-123",
			timestamp: Date.now(),
		});

		// Trigger the save handler
		await saveHandler(mockEvent);

		// Check that guardian was called
		expect(mockGuardian.quickCheckDoc).toHaveBeenCalledWith(
			"Risk content\n".repeat(100),
		);

		// Check that snapshot was created
		expect(mockStorage.create).toHaveBeenCalledWith({
			trigger: "pre-save",
			risk: 0.8,
			content: "Risk content\n".repeat(100),
		});

		// Check that warning message was shown
		expect(mockWindow.showWarningMessage).toHaveBeenCalledWith(
			"⚠️ Risky change detected — snapshot created",
		);
	});

	it("should not create snapshot for low-risk documents", async () => {
		const extension = await import("../src/extension");
		const mockContext: vscode.ExtensionContext = {
			subscriptions: [],
			globalStorageUri: { fsPath: "/tmp" },
			extensionUri: { fsPath: "/tmp" },
		} as unknown as vscode.ExtensionContext;

		await extension.activate(mockContext);

		// Get the save event handler
		const saveHandlerCall = mockWorkspace.onWillSaveTextDocument.mock.calls[0];
		const saveHandler = saveHandlerCall[0];

		// Mock a document with safe content
		const mockDocument = {
			getText: vi.fn().mockReturnValue("Safe content"),
		};

		const mockEvent = {
			document: mockDocument,
		};

		// Mock guardian to return low risk
		mockGuardian.quickCheckDoc.mockResolvedValue({
			score: 0.1,
			factors: [],
			severity: "low",
		});

		// Trigger the save handler
		await saveHandler(mockEvent);

		// Check that guardian was called
		expect(mockGuardian.quickCheckDoc).toHaveBeenCalledWith("Safe content");

		// Check that no snapshot was created
		expect(mockStorage.create).not.toHaveBeenCalled();

		// Check that no warning was shown
		expect(mockWindow.showWarningMessage).not.toHaveBeenCalled();
	});

	it("should toggle AI monitoring when command is executed", async () => {
		const extension = await import("../src/extension");
		const mockContext = {
			subscriptions: [],
			globalStorageUri: { fsPath: "/tmp" },
			extensionUri: { fsPath: "/tmp" },
		} as unknown as vscode.ExtensionContext;

		await extension.activate(mockContext);

		// Get the registered command handler
		const commandCall = mockCommands.registerCommand.mock.calls.find(
			(call) => call[0] === "snapback.toggleAIMonitoring",
		);

		expect(commandCall).toBeDefined();
		if (!commandCall) return;

		// Execute the command handler
		const handler = commandCall[1];
		await handler();

		// Check that configuration was updated
		expect(mockWorkspace.getConfiguration).toHaveBeenCalledWith("snapback");
		expect(mockWorkspace.getConfiguration().get).toHaveBeenCalledWith(
			"aiDetectionEnabled",
			true,
		);
		expect(mockWorkspace.getConfiguration().update).toHaveBeenCalledWith(
			"aiDetectionEnabled",
			false, // Should toggle from default true to false
			"Global",
		);

		// Check that success message was shown
		expect(mockWindow.showInformationMessage).toHaveBeenCalledWith(
			"AI Monitoring disabled",
		);
	});

	it("should show AI monitoring status when command is executed", async () => {
		const extension = await import("../src/extension");
		const mockContext = {
			subscriptions: [],
			globalStorageUri: { fsPath: "/tmp" },
			extensionUri: { fsPath: "/tmp" },
		} as unknown as vscode.ExtensionContext;

		await extension.activate(mockContext);

		// Get the registered command handler
		const commandCall = mockCommands.registerCommand.mock.calls.find(
			(call) => call[0] === "snapback.showAIMonitoringStatus",
		);

		expect(commandCall).toBeDefined();
		if (!commandCall) return;

		// Execute the command handler
		const handler = commandCall[1];
		await handler();

		// Check that configuration was accessed
		expect(mockWorkspace.getConfiguration).toHaveBeenCalledWith("snapback");
		expect(mockWorkspace.getConfiguration().get).toHaveBeenCalledWith(
			"aiDetectionEnabled",
			true,
		);

		// Check that status message was shown
		expect(mockWindow.showInformationMessage).toHaveBeenCalledWith(
			"AI Monitoring is currently enabled",
		);
	});

	it("should auto-snapshot protected files on save", async () => {
		const extension = await import("../src/extension");
		const mockContext = {
			subscriptions: [],
			globalStorageUri: { fsPath: "/tmp" },
			extensionUri: { fsPath: "/tmp" },
			workspaceState: {
				get: vi.fn(),
				update: vi.fn(),
			},
		} as unknown as vscode.ExtensionContext;

		await extension.activate(mockContext);

		// Get the save event handler
		const saveHandlerCall = mockWorkspace.onWillSaveTextDocument.mock.calls[0];
		const saveHandler = saveHandlerCall[0];

		// Mock a document that is protected
		const mockDocument = {
			uri: { fsPath: "/workspace/src/protected-file.ts" },
			fileName: "/workspace/src/protected-file.ts",
		};

		const mockEvent = {
			document: mockDocument,
			waitUntil: vi.fn(),
		};

		// Execute the save handler
		await saveHandler(mockEvent);

		// Verify that waitUntil was called with a promise
		expect(mockEvent.waitUntil).toHaveBeenCalled();
	});

	it("should register timeline provider with VS Code API", async () => {
		const extension = await import("../src/extension");
		const mockContext = {
			subscriptions: [],
			globalStorageUri: { fsPath: "/tmp" },
			extensionUri: { fsPath: "/tmp" },
		} as unknown as vscode.ExtensionContext;

		await extension.activate(mockContext);

		// Check that registerTimelineProvider was called with correct parameters
		expect(mockWorkspace.registerTimelineProvider).toHaveBeenCalledWith(
			["file", "untitled"],
			expect.any(Object), // The timeline provider instance
		);
	});

	it("should register protection level commands", async () => {
		const extension = await import("../src/extension");
		const mockContext = {
			subscriptions: [],
			globalStorageUri: { fsPath: "/tmp" },
			extensionUri: { fsPath: "/tmp" },
		} as unknown as vscode.ExtensionContext;

		await extension.activate(mockContext);

		// Check that protection level commands are registered
		const watchCommandCall = mockCommands.registerCommand.mock.calls.find(
			(call) => call[0] === "snapback.setWatchLevel",
		);
		expect(
			watchCommandCall,
			"snapback.setWatchLevel should be registered",
		).toBeDefined();

		const warnCommandCall = mockCommands.registerCommand.mock.calls.find(
			(call) => call[0] === "snapback.setWarnLevel",
		);
		expect(
			warnCommandCall,
			"snapback.setWarnLevel should be registered",
		).toBeDefined();

		const blockCommandCall = mockCommands.registerCommand.mock.calls.find(
			(call) => call[0] === "snapback.setBlockLevel",
		);
		expect(
			blockCommandCall,
			"snapback.setBlockLevel should be registered",
		).toBeDefined();

		// Check that protection management commands are registered
		const protectFileCall = mockCommands.registerCommand.mock.calls.find(
			(call) => call[0] === "snapback.protectFile",
		);
		expect(
			protectFileCall,
			"snapback.protectFile should be registered",
		).toBeDefined();

		const changeProtectionLevelCall =
			mockCommands.registerCommand.mock.calls.find(
				(call) => call[0] === "snapback.changeProtectionLevel",
			);
		expect(
			changeProtectionLevelCall,
			"snapback.changeProtectionLevel should be registered",
		).toBeDefined();

		const unprotectFileCall = mockCommands.registerCommand.mock.calls.find(
			(call) => call[0] === "snapback.unprotectFile",
		);
		expect(
			unprotectFileCall,
			"snapback.unprotectFile should be registered",
		).toBeDefined();
	});
});
