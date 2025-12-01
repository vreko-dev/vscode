import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { MCPLifecycleManager } from "../../src/services/MCPLifecycleManager";

// Mock VS Code API
vi.mock("vscode", () => {
	return {
		default: {},
		workspace: {
			getConfiguration: vi.fn().mockReturnValue({
				get: vi.fn((key: string, defaultValue?: unknown) => {
					if (key === "mcp.enabled") return true;
					if (key === "mcp.serverUrl") return "https://mcp.snapback.dev";
					if (key === "mcp.authToken") return "test-token";
					if (key === "mcp.timeout") return 5000;
					return defaultValue;
				}),
			}),
		},
	};
});

// Mock fetch API
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock logger
vi.mock("../../src/utils/logger", () => {
	return {
		logger: {
			info: vi.fn(),
			error: vi.fn(),
			warn: vi.fn(),
		},
	};
});

describe("MCP Server Lifecycle Management", () => {
	let mcpManager: MCPLifecycleManager;
	const mockExtensionPath = "/test/extension/path";
	const mockDbPath = "/test/db/path.db";

	beforeEach(() => {
		vi.clearAllMocks();
		mcpManager = new MCPLifecycleManager({
			extensionPath: mockExtensionPath,
			dbPath: mockDbPath,
		});
	});

	afterEach(() => {
		// Clean up any timers
		vi.useRealTimers();
	});

	describe("MCP Manager Initialization", () => {
		it("should initialize with default options", () => {
			const manager = new MCPLifecycleManager({
				extensionPath: mockExtensionPath,
				dbPath: mockDbPath,
			});

			expect(manager).toBeDefined();
		});

		it("should initialize with remote server options", () => {
			const manager = new MCPLifecycleManager({
				extensionPath: mockExtensionPath,
				dbPath: mockDbPath,
				remoteServerUrl: "https://mcp.snapback.dev",
				remoteAuthToken: "test-token",
			});

			expect(manager).toBeDefined();
		});
	});

	describe("MCP Startup Process", () => {
		it("should start when MCP is enabled", async () => {
			// Mock configuration to enable MCP
			vi.mocked(vscode.workspace.getConfiguration).mockReturnValueOnce({
				get: vi.fn((key: string, defaultValue?: unknown) => {
					if (key === "mcp.enabled") return true;
					if (key === "mcp.serverUrl") return "https://mcp.snapback.dev";
					if (key === "mcp.authToken") return "test-token";
					if (key === "mcp.timeout") return 5000;
					return defaultValue;
				}),
			} as any);

			// Mock successful health check
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({
					version: "1.0.0",
					uptime: 12345,
				}),
			});

			// Start the manager
			await mcpManager.start();

			// Verify connection was established
			expect(mcpManager.isServerReady()).toBe(true);
		});

		it("should not start when MCP is disabled", async () => {
			// Mock configuration to disable MCP
			vi.mocked(vscode.workspace.getConfiguration).mockReturnValueOnce({
				get: vi.fn((key: string, defaultValue?: unknown) => {
					if (key === "mcp.enabled") return false;
					return defaultValue;
				}),
			} as any);

			// Start the manager
			await mcpManager.start();

			// Verify no connection was attempted
			expect(mockFetch).not.toHaveBeenCalled();
			expect(mcpManager.isServerReady()).toBe(false);
		});

		it("should handle startup failure gracefully", async () => {
			// Mock configuration to enable MCP
			vi.mocked(vscode.workspace.getConfiguration).mockReturnValueOnce({
				get: vi.fn((key: string, defaultValue?: unknown) => {
					if (key === "mcp.enabled") return true;
					if (key === "mcp.serverUrl") return "https://mcp.snapback.dev";
					if (key === "mcp.authToken") return "test-token";
					if (key === "mcp.timeout") return 5000;
					return defaultValue;
				}),
			} as any);

			// Mock failed health check
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 500,
				statusText: "Internal Server Error",
			});

			// Start the manager and expect it to handle the error
			await expect(mcpManager.start()).rejects.toThrow(
				"Failed to connect to remote MCP server after 3 attempts",
			);

			// Verify connection state
			expect(mcpManager.isServerReady()).toBe(false);
		});
	});

	describe("MCP Shutdown Process", () => {
		it("should stop remote MCP client", async () => {
			// Mock configuration to enable MCP
			vi.mocked(vscode.workspace.getConfiguration).mockReturnValueOnce({
				get: vi.fn((key: string, defaultValue?: unknown) => {
					if (key === "mcp.enabled") return true;
					if (key === "mcp.serverUrl") return "https://mcp.snapback.dev";
					if (key === "mcp.authToken") return "test-token";
					if (key === "mcp.timeout") return 5000;
					return defaultValue;
				}),
			} as any);

			// Mock successful health check
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({
					version: "1.0.0",
					uptime: 12345,
				}),
			});

			// Start the manager
			await mcpManager.start();

			// Verify connection was established
			expect(mcpManager.isServerReady()).toBe(true);

			// Stop the manager
			await mcpManager.stop();

			// Verify connection was closed
			expect(mcpManager.isServerReady()).toBe(false);
		});

		it("should handle shutdown when not connected", async () => {
			// Stop the manager without starting it
			await mcpManager.stop();

			// Should not throw an error
			expect(mcpManager.isServerReady()).toBe(false);
		});
	});

	describe("MCP Disposal", () => {
		it("should dispose properly", async () => {
			// Mock configuration to enable MCP
			vi.mocked(vscode.workspace.getConfiguration).mockReturnValueOnce({
				get: vi.fn((key: string, defaultValue?: unknown) => {
					if (key === "mcp.enabled") return true;
					if (key === "mcp.serverUrl") return "https://mcp.snapback.dev";
					if (key === "mcp.authToken") return "test-token";
					if (key === "mcp.timeout") return 5000;
					return defaultValue;
				}),
			} as any);

			// Mock successful health check
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({
					version: "1.0.0",
					uptime: 12345,
				}),
			});

			// Start the manager
			await mcpManager.start();

			// Verify connection was established
			expect(mcpManager.isServerReady()).toBe(true);

			// Dispose the manager
			mcpManager.dispose();

			// Verify connection was closed
			expect(mcpManager.isServerReady()).toBe(false);
		});
	});

	describe("MCP Configuration Handling", () => {
		it("should use remote server URL from constructor", async () => {
			const managerWithUrl = new MCPLifecycleManager({
				extensionPath: mockExtensionPath,
				dbPath: mockDbPath,
				remoteServerUrl: "https://custom.mcp.server",
				remoteAuthToken: "custom-token",
			});

			// Mock successful health check
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({
					version: "1.0.0",
					uptime: 12345,
				}),
			});

			// Start the manager
			await managerWithUrl.start();

			// Verify connection was made to the custom URL
			expect(mockFetch).toHaveBeenCalledWith(
				"https://custom.mcp.server/health",
				expect.any(Object),
			);
			expect(managerWithUrl.isServerReady()).toBe(true);
		});

		it("should use remote server URL from configuration", async () => {
			// Mock configuration with custom server URL
			vi.mocked(vscode.workspace.getConfiguration).mockReturnValueOnce({
				get: vi.fn((key: string, defaultValue?: unknown) => {
					if (key === "mcp.enabled") return true;
					if (key === "mcp.serverUrl") return "https://config.mcp.server";
					if (key === "mcp.authToken") return "config-token";
					if (key === "mcp.timeout") return 5000;
					return defaultValue;
				}),
			} as any);

			// Mock successful health check
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({
					version: "1.0.0",
					uptime: 12345,
				}),
			});

			// Start the manager
			await mcpManager.start();

			// Verify connection was made to the configured URL
			expect(mockFetch).toHaveBeenCalledWith(
				"https://config.mcp.server/health",
				expect.any(Object),
			);
			expect(mcpManager.isServerReady()).toBe(true);
		});

		it("should skip initialization when no server URL is configured", async () => {
			// Mock configuration with empty server URL
			vi.mocked(vscode.workspace.getConfiguration).mockReturnValueOnce({
				get: vi.fn((key: string, defaultValue?: unknown) => {
					if (key === "mcp.enabled") return true;
					if (key === "mcp.serverUrl") return "";
					if (key === "mcp.authToken") return "";
					if (key === "mcp.timeout") return 5000;
					return defaultValue;
				}),
			} as any);

			// Start the manager
			await mcpManager.start();

			// Verify no connection was attempted
			expect(mockFetch).not.toHaveBeenCalled();
			expect(mcpManager.isServerReady()).toBe(false);
		});
	});
});
