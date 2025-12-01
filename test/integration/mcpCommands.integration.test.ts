import { beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { registerMcpCommands } from "../../src/commands/mcpCommands";
import type { OperationCoordinator } from "../../src/operationCoordinator";
import type { StatusBarController } from "../../src/ui/statusBar";
import type { WorkflowIntegration } from "../../src/workflowIntegration";

// Mock VS Code API
vi.mock("vscode", () => {
	return {
		default: {},
		commands: {
			registerCommand: vi.fn(),
			executeCommand: vi.fn(),
		},
		window: {
			showInformationMessage: vi.fn(),
			showErrorMessage: vi.fn(),
			setStatusBarMessage: vi.fn(),
		},
		workspace: {
			getConfiguration: vi.fn().mockReturnValue({
				get: vi.fn((key: string, defaultValue?: unknown) => {
					if (key === "aiDetectionEnabled") return true;
					return defaultValue;
				}),
				update: vi.fn(),
			}),
		},
		ConfigurationTarget: {
			Global: "Global",
		},
	};
});

describe("MCP Command Handlers", () => {
	let mockContext: any;
	let mockFederation: any;
	let mockOperationCoordinator: OperationCoordinator;
	let mockWorkflowIntegration: WorkflowIntegration;
	let mockStatusBar: StatusBarController;

	beforeEach(() => {
		vi.clearAllMocks();

		// Create mock context
		mockContext = {
			subscriptions: [],
		};

		// Create mock federation service
		mockFederation = {
			executeWithFallback: vi.fn(),
			executeWithCache: vi.fn(),
			executeWithTimeout: vi.fn(),
		};

		// Create mock operation coordinator
		mockOperationCoordinator = {
			coordinateRiskAnalysis: vi.fn(),
		} as any;

		// Create mock workflow integration
		mockWorkflowIntegration = {
			applySuggestion: vi.fn(),
			autoApplySuggestions: vi.fn(),
		} as any;

		// Create mock status bar
		mockStatusBar = {
			setProtectionStatus: vi.fn(),
		} as any;
	});

	describe("MCP Federation Commands", () => {
		it("should register MCP federation test command", () => {
			const disposables = registerMcpCommands(
				mockContext,
				mockFederation,
				mockOperationCoordinator,
				mockWorkflowIntegration,
				mockStatusBar,
			);

			// Verify command was registered
			expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
				"snapback.testMCPFederation",
				expect.any(Function),
			);

			// Verify we have disposables
			expect(disposables.length).toBeGreaterThan(0);
		});

		it("should execute basic MCP federation test", async () => {
			// Register commands
			registerMcpCommands(
				mockContext,
				mockFederation,
				mockOperationCoordinator,
				mockWorkflowIntegration,
				mockStatusBar,
			);

			// Get the registered command handler
			const registerCommandCalls = vi.mocked(vscode.commands.registerCommand)
				.mock.calls;
			const testFederationCommand = registerCommandCalls.find(
				(call) => call[0] === "snapback.testMCPFederation",
			)?.[1];

			// Mock successful federation execution
			mockFederation.executeWithFallback.mockResolvedValue(
				"Successful Context7 result",
			);

			// Execute the command
			await testFederationCommand();

			// Verify federation was called correctly
			expect(mockFederation.executeWithFallback).toHaveBeenCalledWith(
				"docs",
				expect.any(Function),
				expect.any(Function),
			);

			// Verify success message was shown
			expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
				"MCP Federation Test: Successful Context7 result",
			);
		});

		it("should handle MCP federation test failure", async () => {
			// Register commands
			registerMcpCommands(
				mockContext,
				mockFederation,
				mockOperationCoordinator,
				mockWorkflowIntegration,
				mockStatusBar,
			);

			// Get the registered command handler
			const registerCommandCalls = vi.mocked(vscode.commands.registerCommand)
				.mock.calls;
			const testFederationCommand = registerCommandCalls.find(
				(call) => call[0] === "snapback.testMCPFederation",
			)?.[1];

			// Mock failed federation execution
			mockFederation.executeWithFallback.mockRejectedValue(
				new Error("Federation failed"),
			);

			// Execute the command
			await testFederationCommand();

			// Verify error message was shown
			expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
				"MCP Federation Test failed: Error: Federation failed",
			);
		});

		it("should execute comprehensive MCP federation test", async () => {
			// Register commands
			registerMcpCommands(
				mockContext,
				mockFederation,
				mockOperationCoordinator,
				mockWorkflowIntegration,
				mockStatusBar,
			);

			// Get the registered command handler
			const registerCommandCalls = vi.mocked(vscode.commands.registerCommand)
				.mock.calls;
			const testComprehensiveFederationCommand = registerCommandCalls.find(
				(call) => call[0] === "snapback.testMCPFederationComprehensive",
			)?.[1];

			// Mock various federation responses
			mockFederation.executeWithFallback
				.mockResolvedValueOnce("Circuit breaker is open, using fallback")
				.mockResolvedValueOnce("Cached result")
				.mockResolvedValueOnce("Cached result")
				.mockResolvedValueOnce("Timeout fallback result");

			mockFederation.executeWithCache
				.mockResolvedValueOnce("Cached result")
				.mockResolvedValueOnce("Cached result");

			mockFederation.executeWithTimeout.mockResolvedValueOnce(
				"Timeout fallback result",
			);

			// Execute the command
			await testComprehensiveFederationCommand();

			// Verify all federation methods were called
			expect(mockFederation.executeWithFallback).toHaveBeenCalledTimes(4);
			expect(mockFederation.executeWithCache).toHaveBeenCalledTimes(2);
			expect(mockFederation.executeWithTimeout).toHaveBeenCalledTimes(1);

			// Verify success message was shown with results
			expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
				expect.stringContaining("Comprehensive MCP Federation Test Results"),
			);
		});
	});

	describe("AI Monitoring Commands", () => {
		it("should register AI monitoring toggle command", () => {
			const disposables = registerMcpCommands(
				mockContext,
				mockFederation,
				mockOperationCoordinator,
				mockWorkflowIntegration,
				mockStatusBar,
			);

			// Verify command was registered
			expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
				"snapback.toggleAIMonitoring",
				expect.any(Function),
			);

			// Verify we have disposables
			expect(disposables.length).toBeGreaterThan(0);
		});

		it("should toggle AI monitoring on/off", async () => {
			// Register commands
			registerMcpCommands(
				mockContext,
				mockFederation,
				mockOperationCoordinator,
				mockWorkflowIntegration,
				mockStatusBar,
			);

			// Get the registered command handler
			const registerCommandCalls = vi.mocked(vscode.commands.registerCommand)
				.mock.calls;
			const toggleAIMonitoringCommand = registerCommandCalls.find(
				(call) => call[0] === "snapback.toggleAIMonitoring",
			)?.[1];

			// Mock configuration update
			const mockUpdate = vi.fn();
			vi.mocked(vscode.workspace.getConfiguration).mockReturnValueOnce({
				get: vi.fn((key: string, defaultValue?: unknown) => {
					if (key === "aiDetectionEnabled") return true;
					return defaultValue;
				}),
				update: mockUpdate,
			} as any);

			// Execute the command
			await toggleAIMonitoringCommand();

			// Verify configuration was updated
			expect(mockUpdate).toHaveBeenCalledWith(
				"aiDetectionEnabled",
				false,
				"Global",
			);

			// Verify status message was shown
			expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
				"AI Monitoring disabled",
			);

			// Verify status bar was updated
			expect(mockStatusBar.setProtectionStatus).toHaveBeenCalledWith("atRisk");
		});

		it("should show AI monitoring status", async () => {
			// Register commands
			registerMcpCommands(
				mockContext,
				mockFederation,
				mockOperationCoordinator,
				mockWorkflowIntegration,
				mockStatusBar,
			);

			// Get the registered command handler
			const registerCommandCalls = vi.mocked(vscode.commands.registerCommand)
				.mock.calls;
			const showAIMonitoringStatusCommand = registerCommandCalls.find(
				(call) => call[0] === "snapback.showAIMonitoringStatus",
			)?.[1];

			// Execute the command
			await showAIMonitoringStatusCommand();

			// Verify status message was shown
			expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
				"AI Monitoring is currently enabled",
			);
		});
	});

	describe("Workflow Commands", () => {
		it("should register workflow suggestion commands", () => {
			const disposables = registerMcpCommands(
				mockContext,
				mockFederation,
				mockOperationCoordinator,
				mockWorkflowIntegration,
				mockStatusBar,
			);

			// Verify commands were registered
			expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
				"snapback.applyWorkflowSuggestion",
				expect.any(Function),
			);
			expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
				"snapback.autoApplySuggestions",
				expect.any(Function),
			);

			// Verify we have disposables
			expect(disposables.length).toBeGreaterThan(0);
		});

		it("should apply workflow suggestion", async () => {
			// Register commands
			registerMcpCommands(
				mockContext,
				mockFederation,
				mockOperationCoordinator,
				mockWorkflowIntegration,
				mockStatusBar,
			);

			// Get the registered command handler
			const registerCommandCalls = vi.mocked(vscode.commands.registerCommand)
				.mock.calls;
			const applyWorkflowSuggestionCommand = registerCommandCalls.find(
				(call) => call[0] === "snapback.applyWorkflowSuggestion",
			)?.[1];

			// Mock successful suggestion application
			mockWorkflowIntegration.applySuggestion.mockResolvedValue(undefined);

			// Execute the command with a suggestion ID
			await applyWorkflowSuggestionCommand("suggestion-123");

			// Verify workflow integration was called
			expect(mockWorkflowIntegration.applySuggestion).toHaveBeenCalledWith(
				"suggestion-123",
			);

			// Verify success message was shown
			expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
				"Applied workflow suggestion: suggestion-123",
			);
		});

		it("should auto-apply workflow suggestions", async () => {
			// Register commands
			registerMcpCommands(
				mockContext,
				mockFederation,
				mockOperationCoordinator,
				mockWorkflowIntegration,
				mockStatusBar,
			);

			// Get the registered command handler
			const registerCommandCalls = vi.mocked(vscode.commands.registerCommand)
				.mock.calls;
			const autoApplySuggestionsCommand = registerCommandCalls.find(
				(call) => call[0] === "snapback.autoApplySuggestions",
			)?.[1];

			// Mock successful auto-application
			mockWorkflowIntegration.autoApplySuggestions.mockResolvedValue(undefined);

			// Execute the command
			await autoApplySuggestionsCommand();

			// Verify workflow integration was called
			expect(mockWorkflowIntegration.autoApplySuggestions).toHaveBeenCalled();

			// Verify success message was shown
			expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
				"Auto-applied high-confidence suggestions",
			);
		});
	});
});
