import { beforeEach, describe, expect, it, vi } from "vitest";
// Import vscode from the global mock
import * as vscode from "vscode";
import { MCPLifecycleManager } from "@vscode/services/MCPLifecycleManager";

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
};

vi.mock("../../../src/services/RemoteMCPClient", () => {
	return {
		RemoteMCPClient: vi.fn().mockImplementation(() => mockRemoteClient),
	};
});

describe("MCPLifecycleManager", () => {
	let manager: MCPLifecycleManager;
	const mockExtensionPath = "/test/extension/path";
	const mockDbPath = "/test/db/path.db";
	const mockRemoteServerUrl = "https://mcp.snapback.example.com";
	const mockRemoteAuthToken = "test-token";

	beforeEach(() => {
		// Reset all mocks
		vi.clearAllMocks();

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

		it("should start remote MCP client when remote URL is configured", async () => {
			// Mock configuration to specify remote server
			const mockConfig = {
				get: vi.fn((key: string, defaultValue?: unknown) => {
					if (key === "mcp.enabled") return true;
					if (key === "mcp.serverUrl") return mockRemoteServerUrl;
					if (key === "mcp.authToken") return mockRemoteAuthToken;
					if (key === "mcp.timeout") return 1000;
					return defaultValue;
				}),
			};
			vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(
				mockConfig as any,
			);

			mockRemoteClient.connect.mockResolvedValue(undefined);

			await manager.start();

			expect(mockRemoteClient.connect).toHaveBeenCalled();
		});

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
});
