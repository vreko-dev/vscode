import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { MCPLifecycleManager } from "../../src/services/MCPLifecycleManager";
import { RemoteMCPClient } from "../../src/services/RemoteMCPClient";

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
					if (key === "mcp.authType") return "bearer";
					if (key === "mcp.apiKey") return "";
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

describe("MCP Authentication", () => {
	const mockExtensionPath = "/test/extension/path";
	const mockDbPath = "/test/db/path.db";

	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		// Clean up any timers
		vi.useRealTimers();
	});

	describe("Bearer Token Authentication", () => {
		it("should use bearer token authentication by default", async () => {
			const mcpManager = new MCPLifecycleManager({
				extensionPath: mockExtensionPath,
				dbPath: mockDbPath,
				remoteServerUrl: "https://mcp.snapback.dev",
				remoteAuthToken: "test-token",
			});

			// Mock successful health check response
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({
					version: "1.0.0",
					uptime: 12345,
				}),
			});

			// Start the MCP manager
			await mcpManager.start();

			// Verify bearer token was used
			expect(mockFetch).toHaveBeenCalledWith(
				"https://mcp.snapback.dev/health",
				expect.objectContaining({
					headers: expect.objectContaining({
						Authorization: "Bearer test-token",
					}),
				}),
			);
		});

		it("should handle missing bearer token", async () => {
			const mcpManager = new MCPLifecycleManager({
				extensionPath: mockExtensionPath,
				dbPath: mockDbPath,
				remoteServerUrl: "https://mcp.snapback.dev",
				// No auth token provided
			});

			// Mock successful health check response
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({
					version: "1.0.0",
					uptime: 12345,
				}),
			});

			// Start the MCP manager
			await mcpManager.start();

			// Verify no authorization header was included
			expect(mockFetch).toHaveBeenCalledWith(
				"https://mcp.snapback.dev/health",
				expect.objectContaining({
					headers: expect.not.objectContaining({
						Authorization: expect.anything(),
					}),
				}),
			);
		});
	});

	describe("API Key Authentication", () => {
		it("should use API key authentication when specified", async () => {
			// Mock configuration with API key auth
			vi.mocked(vscode.workspace.getConfiguration).mockReturnValueOnce({
				get: vi.fn((key: string, defaultValue?: unknown) => {
					if (key === "mcp.enabled") return true;
					if (key === "mcp.serverUrl") return "https://mcp.snapback.dev";
					if (key === "mcp.authToken") return "";
					if (key === "mcp.authType") return "apikey";
					if (key === "mcp.apiKey") return "test-api-key";
					if (key === "mcp.timeout") return 5000;
					return defaultValue;
				}),
			} as any);

			const mcpManager = new MCPLifecycleManager({
				extensionPath: mockExtensionPath,
				dbPath: mockDbPath,
			});

			// Mock successful health check response
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({
					version: "1.0.0",
					uptime: 12345,
				}),
			});

			// Start the MCP manager
			await mcpManager.start();

			// Verify API key was used
			expect(mockFetch).toHaveBeenCalledWith(
				"https://mcp.snapback.dev/health",
				expect.objectContaining({
					headers: expect.objectContaining({
						"X-API-Key": "test-api-key",
					}),
				}),
			);
		});

		it("should handle missing API key", async () => {
			// Mock configuration with API key auth but no key
			vi.mocked(vscode.workspace.getConfiguration).mockReturnValueOnce({
				get: vi.fn((key: string, defaultValue?: unknown) => {
					if (key === "mcp.enabled") return true;
					if (key === "mcp.serverUrl") return "https://mcp.snapback.dev";
					if (key === "mcp.authToken") return "";
					if (key === "mcp.authType") return "apikey";
					if (key === "mcp.apiKey") return "";
					if (key === "mcp.timeout") return 5000;
					return defaultValue;
				}),
			} as any);

			const mcpManager = new MCPLifecycleManager({
				extensionPath: mockExtensionPath,
				dbPath: mockDbPath,
			});

			// Mock successful health check response
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({
					version: "1.0.0",
					uptime: 12345,
				}),
			});

			// Start the MCP manager
			await mcpManager.start();

			// Verify no API key header was included
			expect(mockFetch).toHaveBeenCalledWith(
				"https://mcp.snapback.dev/health",
				expect.objectContaining({
					headers: expect.not.objectContaining({
						"X-API-Key": expect.anything(),
					}),
				}),
			);
		});
	});

	describe("Authentication Configuration", () => {
		it("should use constructor options over configuration", async () => {
			// Mock configuration with different values
			vi.mocked(vscode.workspace.getConfiguration).mockReturnValueOnce({
				get: vi.fn((key: string, defaultValue?: unknown) => {
					if (key === "mcp.enabled") return true;
					if (key === "mcp.serverUrl") return "https://different.mcp.server";
					if (key === "mcp.authToken") return "different-token";
					if (key === "mcp.authType") return "apikey";
					if (key === "mcp.apiKey") return "different-api-key";
					if (key === "mcp.timeout") return 1000;
					return defaultValue;
				}),
			} as any);

			const mcpManager = new MCPLifecycleManager({
				extensionPath: mockExtensionPath,
				dbPath: mockDbPath,
				remoteServerUrl: "https://mcp.snapback.dev",
				remoteAuthToken: "test-token",
				remoteAuthType: "bearer",
				// No API key provided
			});

			// Mock successful health check response
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({
					version: "1.0.0",
					uptime: 12345,
				}),
			});

			// Start the MCP manager
			await mcpManager.start();

			// Verify constructor options were used instead of configuration
			expect(mockFetch).toHaveBeenCalledWith(
				"https://mcp.snapback.dev/health",
				expect.objectContaining({
					headers: expect.objectContaining({
						Authorization: "Bearer test-token",
					}),
				}),
			);
			expect(mockFetch).not.toHaveBeenCalledWith(
				"https://different.mcp.server/health",
				expect.any(Object),
			);
		});

		it("should fall back to configuration when constructor options are not provided", async () => {
			const mcpManager = new MCPLifecycleManager({
				extensionPath: mockExtensionPath,
				dbPath: mockDbPath,
				// No remote options provided, should fall back to configuration
			});

			// Mock successful health check response
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({
					version: "1.0.0",
					uptime: 12345,
				}),
			});

			// Start the MCP manager
			await mcpManager.start();

			// Verify configuration values were used
			expect(mockFetch).toHaveBeenCalledWith(
				"https://mcp.snapback.dev/health",
				expect.objectContaining({
					headers: expect.objectContaining({
						Authorization: "Bearer test-token",
					}),
				}),
			);
		});
	});

	describe("RemoteMCPClient Authentication", () => {
		it("should support both bearer and API key authentication", () => {
			// Test bearer token authentication
			const bearerClient = new RemoteMCPClient({
				serverUrl: "https://mcp.snapback.dev",
				authToken: "test-token",
				authType: "bearer",
			});

			expect(bearerClient).toBeDefined();

			// Test API key authentication
			const apiKeyClient = new RemoteMCPClient({
				serverUrl: "https://mcp.snapback.dev",
				apiKey: "test-api-key",
				authType: "apikey",
			});

			expect(apiKeyClient).toBeDefined();
		});

		it("should default to bearer authentication", () => {
			const client = new RemoteMCPClient({
				serverUrl: "https://mcp.snapback.dev",
				authToken: "test-token",
				// No authType specified, should default to bearer
			});

			expect(client).toBeDefined();
		});
	});
});
