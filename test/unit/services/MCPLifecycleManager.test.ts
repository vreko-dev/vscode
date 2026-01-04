import { beforeEach, describe, expect, it, vi } from "vitest";
// Import vscode from the global mock
import * as vscode from "vscode";
import { MCPLifecycleManager } from "@vscode/services/MCPLifecycleManager";
import type { MCPStateChangeEvent } from "@vscode/services/MCPLifecycleManager";

// Mock Node.js modules
vi.mock("node:child_process");
vi.mock("node:fs");
vi.mock("node:net");

// Mock the RemoteMCPClient
const mockRemoteClient = {
	connect: vi.fn(),
	dispose: vi.fn(),
	isServerReady: vi.fn(),
	sendRequest: vi.fn(),
	getStatus: vi.fn().mockReturnValue({ version: "1.0.0" }),
};

vi.mock("@vscode/services/RemoteMCPClient", () => {
	return {
		RemoteMCPClient: vi.fn().mockImplementation(() => mockRemoteClient),
	};
});

// Mock MCPTelemetry - create a stable mock object
const mockTelemetry = {
	trackConnectionStateChange: vi.fn(),
	trackConnectionRetry: vi.fn(),
	trackVersionMismatch: vi.fn(),
	trackCircuitBreakerChange: vi.fn(),
	trackBridgePushMetrics: vi.fn(),
	trackDiagnoseExecuted: vi.fn(),
};

vi.mock("@vscode/services/MCPTelemetry", () => ({
	getMCPTelemetry: () => mockTelemetry,
}));

describe("MCPLifecycleManager", () => {
	let manager: MCPLifecycleManager;
	const mockExtensionPath = "/test/extension/path";
	const mockDbPath = "/test/db/path.db";
	const mockRemoteServerUrl = "https://mcp.snapback.example.com";
	const mockRemoteAuthToken = "test-token";

	beforeEach(() => {
		// Reset all mocks
		vi.clearAllMocks();

		// Clear mock remote client method call history (use mockClear, not mockReset)
		mockRemoteClient.connect.mockClear();
		mockRemoteClient.dispose.mockClear();
		mockRemoteClient.isServerReady.mockClear();
		mockRemoteClient.sendRequest.mockClear();
		mockRemoteClient.getStatus.mockClear();
		mockRemoteClient.getStatus.mockReturnValue({ version: "1.0.0" });

		// Mock VS Code configuration to enable MCP by default
		const mockConfig = {
			get: vi.fn((key: string, defaultValue?: unknown) => {
				if (key === "mcp.enabled") return true;
				if (key === "mcp.serverUrl") return "";
				if (key === "mcp.authToken") return "";
				if (key === "mcp.timeout") return 1000;
				return defaultValue;
			}),
		};

		// Mock getConfiguration to return our mock config
		vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(
			mockConfig as any,
		);

		// Create a new manager instance for each test
		manager = new MCPLifecycleManager({
			extensionPath: mockExtensionPath,
			dbPath: mockDbPath,
			timeout: 1000,
		});
	});

	describe("constructor", () => {
		it("should initialize with provided options", () => {
			expect(manager).toBeDefined();
		});
	});

	describe("start", () => {
		it("should not start when MCP is disabled in configuration", async () => {
			// Mock configuration to disable MCP
			const mockConfig = {
				get: vi.fn((key: string, defaultValue?: unknown) => {
					if (key === "mcp.enabled") return false;
					return defaultValue;
				}),
			};
			vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(
				mockConfig as any,
			);

			await expect(manager.start()).resolves.toBeUndefined();
		});

		// Note: Remote client connection tests require complex mock setup
		// and are covered by integration tests in mcpLifecycle.integration.test.ts

		it("should not start when no remote URL is configured", async () => {
			// Mock configuration with empty server URL
			const mockConfig = {
				get: vi.fn((key: string, defaultValue?: unknown) => {
					if (key === "mcp.enabled") return true;
					if (key === "mcp.serverUrl") return "";
					if (key === "mcp.authToken") return "";
					if (key === "mcp.timeout") return 1000;
					return defaultValue;
				}),
			};
			vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(
				mockConfig as any,
			);

			await expect(manager.start()).resolves.toBeUndefined();
		});
	});

	describe("stop", () => {
		it("should disconnect from remote MCP client", async () => {
			// Mock configuration to specify remote server
			const mockConfig = {
				get: vi.fn((key: string, defaultValue?: unknown) => {
					if (key === "mcp.enabled") return true;
					if (key === "mcp.serverUrl") return mockRemoteServerUrl;
					if (key === "mcp.authToken") return "";
					if (key === "mcp.timeout") return 1000;
					return defaultValue;
				}),
			};
			vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(
				mockConfig as any,
			);

			// Initialize manager with remote configuration
			const remoteManager = new MCPLifecycleManager({
				extensionPath: mockExtensionPath,
				dbPath: mockDbPath,
			});

			// Mock the remote client
			(remoteManager as any).remoteClient = mockRemoteClient;
			mockRemoteClient.dispose.mockImplementation(() => {});

			await remoteManager.stop();

			expect(mockRemoteClient.dispose).toHaveBeenCalled();
		});
	});

	describe("dispose", () => {
		it("should call stop method", async () => {
			const stopSpy = vi.spyOn(manager, "stop").mockResolvedValue();

			manager.dispose();

			expect(stopSpy).toHaveBeenCalled();
		});
	});

	describe("isServerReady", () => {
		it("should return false by default", () => {
			expect(manager.isServerReady()).toBe(false);
		});

		it("should return remote client status when using remote server", () => {
			// Mock configuration to specify remote server
			const mockConfig = {
				get: vi.fn((key: string, defaultValue?: unknown) => {
					if (key === "mcp.enabled") return true;
					if (key === "mcp.serverUrl") return mockRemoteServerUrl;
					if (key === "mcp.authToken") return "";
					if (key === "mcp.timeout") return 1000;
					return defaultValue;
				}),
			};
			vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(
				mockConfig as any,
			);

			// Initialize manager with remote configuration
			const remoteManager = new MCPLifecycleManager({
				extensionPath: mockExtensionPath,
				dbPath: mockDbPath,
			});

			// Mock the remote client
			(remoteManager as any).remoteClient = mockRemoteClient;
			mockRemoteClient.isServerReady.mockReturnValue(true);

			expect(remoteManager.isServerReady()).toBe(true);
		});
	});

	describe("sendRequest", () => {
		it("should delegate to remote client when using remote server", async () => {
			// Mock configuration to specify remote server
			const mockConfig = {
				get: vi.fn((key: string, defaultValue?: unknown) => {
					if (key === "mcp.enabled") return true;
					if (key === "mcp.serverUrl") return mockRemoteServerUrl;
					if (key === "mcp.authToken") return "";
					if (key === "mcp.timeout") return 1000;
					return defaultValue;
				}),
			};
			vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(
				mockConfig as any,
			);

			// Initialize manager with remote configuration
			const remoteManager = new MCPLifecycleManager({
				extensionPath: mockExtensionPath,
				dbPath: mockDbPath,
			});

			// Mock the remote client
			(remoteManager as any).remoteClient = mockRemoteClient;
			const mockResponse = { result: "success" };
			mockRemoteClient.sendRequest.mockResolvedValue(mockResponse);

			const result = await remoteManager.sendRequest("/test", { data: "test" });

			expect(mockRemoteClient.sendRequest).toHaveBeenCalledWith("/test", {
				data: "test",
			});
			expect(result).toEqual(mockResponse);
		});

		it("should throw error when remote client is not initialized", async () => {
			// Mock configuration to specify remote server
			const mockConfig = {
				get: vi.fn((key: string, defaultValue?: unknown) => {
					if (key === "mcp.enabled") return true;
					if (key === "mcp.serverUrl") return mockRemoteServerUrl;
					if (key === "mcp.authToken") return "";
					if (key === "mcp.timeout") return 1000;
					return defaultValue;
				}),
			};
			vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(
				mockConfig as any,
			);

			// Initialize manager with remote configuration
			const remoteManager = new MCPLifecycleManager({
				extensionPath: mockExtensionPath,
				dbPath: mockDbPath,
			});

			await expect(
				remoteManager.sendRequest("/test", { data: "test" }),
			).rejects.toThrow("Remote MCP client not initialized");
		});
	});

	// =========================================================================
	// RECOVERY SCENARIOS (Phase 4 E2E Tests)
	// =========================================================================

	describe("Recovery Scenarios", () => {
		// Note: Tests that require remote connection retry behavior
		// are difficult to test with mock hoisting issues. These scenarios
		// are covered by integration tests in mcpLifecycle.integration.test.ts

		describe("State change listener management", () => {
			it("should add and call state change listeners", () => {
				const listener = vi.fn();
				manager.addStateChangeListener(listener);

				// Trigger internal state change
				(manager as any).emitStateChange("disabled", { reason: "test" });

				expect(listener).toHaveBeenCalledWith(
					expect.objectContaining({
						state: "disabled",
						previousState: "disconnected",
					}),
				);
			});

			it("should notify listener removal correctly", () => {
				const listener = vi.fn();
				manager.addStateChangeListener(listener);
				manager.removeStateChangeListener(listener);

				// Internal state change should not call removed listener
				(manager as any).emitStateChange("connected");

				expect(listener).not.toHaveBeenCalled();
			});

			it("should handle multiple listeners", () => {
				const listener1 = vi.fn();
				const listener2 = vi.fn();
				manager.addStateChangeListener(listener1);
				manager.addStateChangeListener(listener2);

				(manager as any).emitStateChange("connected");

				expect(listener1).toHaveBeenCalled();
				expect(listener2).toHaveBeenCalled();
			});

			it("should gracefully handle listener errors", () => {
				const errorListener = vi.fn().mockImplementation(() => {
					throw new Error("Listener error");
				});
				const normalListener = vi.fn();

				manager.addStateChangeListener(errorListener);
				manager.addStateChangeListener(normalListener);

				// Should not throw and should call all listeners
				expect(() => {
					(manager as any).emitStateChange("connected");
				}).not.toThrow();

				expect(normalListener).toHaveBeenCalled();
			});
		});

		describe("Version compatibility", () => {
			// Note: Version storage test requires successful connection which
			// has mock timing issues. Tested via integration tests.

			it("should return undefined version when not connected", () => {
				expect(manager.getServerVersion()).toBeUndefined();
			});
		});

		describe("Connection state management", () => {
			it("should track connection state correctly", () => {
				expect(manager.getConnectionState()).toBe("disconnected");
			});

			it("should emit disabled state when MCP is disabled", async () => {
				// Mock configuration to disable MCP
				const mockConfig = {
					get: vi.fn((key: string, defaultValue?: unknown) => {
						if (key === "mcp.enabled") return false;
						return defaultValue;
					}),
				};
				vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(
					mockConfig as any,
				);

				const disabledManager = new MCPLifecycleManager({
					extensionPath: mockExtensionPath,
					dbPath: mockDbPath,
				});

				const stateChanges: MCPStateChangeEvent[] = [];
				disabledManager.addStateChangeListener((event) => {
					stateChanges.push(event);
				});

				await disabledManager.start();

				expect(stateChanges[0].state).toBe("disabled");
			});
		});

		describe("VS Code event emitter integration", () => {
			it("should have onStateChange event property", () => {
				// Verify the event emitter exists
				expect(manager.onStateChange).toBeDefined();
			});

			it("should fire event when state changes internally", () => {
				const eventFired = vi.fn();
				manager.onStateChange(eventFired);

				// Manually trigger internal state change
				(manager as any).emitStateChange("disabled", { reason: "test" });

				expect(eventFired).toHaveBeenCalled();
				expect(eventFired).toHaveBeenCalledWith(
					expect.objectContaining({
						state: "disabled",
						previousState: "disconnected",
						reason: "test",
					}),
				);
			});
		});
	});
});
