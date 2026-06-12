import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync } from "node:fs";
import * as vscode from "vscode";
import { MCPController, MCPMode } from "../../../src/mcp/MCPController";

// Mock Node.js modules
vi.mock("node:fs");
vi.mock("node:os", () => ({
	homedir: () => "/mock/home",
	platform: () => "darwin",
}));

// Mock mcp-config detection (now imported through types/mcp-config)
const mockDetectAIClients = vi.fn();
const mockDetectWorkspaceConfig = vi.fn();
vi.mock("../../../src/types/mcp-config", () => ({
	detectAIClients: (...args: any[]) => mockDetectAIClients(...args),
	detectWorkspaceConfig: (...args: any[]) => mockDetectWorkspaceConfig(...args),
}));

// Mock DaemonBridge
const mockDaemonBridge = {
	isConnected: vi.fn().mockReturnValue(false),
	connect: vi.fn().mockResolvedValue(false),
	onStateChange: vi.fn().mockReturnValue({ dispose: vi.fn() }),
	getReconnectAttempt: vi.fn().mockReturnValue(0),
	getMaxReconnectAttempts: vi.fn().mockReturnValue(5),
};
vi.mock("../../../src/services/DaemonBridge", () => ({
	getDaemonBridge: vi.fn(() => mockDaemonBridge),
	getCurrentWorkspaceId: vi.fn(() => "test-workspace"),
}));

// Mock logger
vi.mock("../../../src/utils/logger", () => ({
	logger: {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}));

describe("MCPController", () => {
	let controller: MCPController;

	beforeEach(() => {
		vi.clearAllMocks();

		// Default: no daemon, no AI clients, no workspace config
		vi.mocked(existsSync).mockReturnValue(false);
		mockDetectAIClients.mockReturnValue({
			clients: [],
			detected: [],
			needsSetup: [],
		});
		mockDetectWorkspaceConfig.mockReturnValue(null);

		// Mock showInformationMessage to return a thenable (REMOTE_API path calls .then())
		vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(undefined as any);

		// Mock VS Code configuration
		const mockConfig = {
			get: vi.fn((key: string, defaultValue?: unknown) => {
				if (key === "apiKey") return "";
				if (key === "cliPath") return "";
				if (key === "mcp.enabled") return true;
				return defaultValue;
			}),
		};
		vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(mockConfig as any);

		// Mock workspace folders
		vi.mocked(vscode.workspace).workspaceFolders = [
			{
				uri: { fsPath: "/mock/workspace", toString: () => "file:///mock/workspace" },
				name: "test",
				index: 0,
			},
		] as any;

		controller = new MCPController();
	});

	afterEach(() => {
		controller.dispose();
	});

	describe("Initial State", () => {
		it("should start in UNCONFIGURED mode", () => {
			expect(controller.getMode()).toBe(MCPMode.UNCONFIGURED);
		});

		it("should start disconnected", () => {
			expect(controller.getConnectionState()).toBe("disconnected");
		});

		it("should not be ready before start", () => {
			expect(controller.isReady()).toBe(false);
		});
	});

	describe("Mode Detection via start()", () => {
		it("should detect LOCAL_CLI mode when daemon socket exists", async () => {
			vi.mocked(existsSync).mockReturnValue(true);
			mockDaemonBridge.isConnected.mockReturnValue(true);

			await controller.start();

			expect(controller.getMode()).toBe(MCPMode.LOCAL_CLI);
		});

		it("should detect LOCAL_CLI mode when CLI is configured in AI client", async () => {
			vi.mocked(existsSync).mockReturnValue(false);
			mockDetectAIClients.mockReturnValue({
				clients: [],
				detected: [
					{
						name: "cursor",
						displayName: "Cursor",
						configPath: "/mock/.cursor/mcp.json",
						exists: true,
						hasVreko: true,
						format: "cursor",
					},
				],
				needsSetup: [],
			});

			await controller.start();

			expect(controller.getMode()).toBe(MCPMode.LOCAL_CLI);
		});

		it("should detect REMOTE_API mode when API key exists but no CLI", async () => {
			const mockConfig = {
				get: vi.fn((key: string, defaultValue?: unknown) => {
					if (key === "apiKey") return "test-api-key";
					if (key === "cliPath") return "";
					if (key === "mcp.enabled") return true;
					return defaultValue;
				}),
			};
			vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(mockConfig as any);

			await controller.start();

			expect(controller.getMode()).toBe(MCPMode.REMOTE_API);
		});

		it("should detect UNCONFIGURED mode when nothing is configured", async () => {
			await controller.start();

			expect(controller.getMode()).toBe(MCPMode.UNCONFIGURED);
		});

		it("should not start when MCP is disabled", async () => {
			const mockConfig = {
				get: vi.fn((key: string, defaultValue?: unknown) => {
					if (key === "mcp.enabled") return false;
					return defaultValue;
				}),
			};
			vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(mockConfig as any);

			await controller.start();

			expect(controller.getConnectionState()).toBe("disabled");
		});
	});

	describe("checkConfigurationStatus", () => {
		it("should return daemon running but not configured when daemon exists but no config", () => {
			vi.mocked(existsSync).mockReturnValue(true);

			const status = controller.checkConfigurationStatus();

			expect(status.daemonRunning).toBe(true);
			expect(status.configured).toBe(false);
			expect(status.configuredClients).toEqual([]);
			expect(status.workspaceConfig).toBeNull();
		});

		it("should return configured when workspace config exists", () => {
			vi.mocked(existsSync).mockReturnValue(true);
			mockDetectWorkspaceConfig.mockReturnValue({
				path: "/mock/workspace/.qoder-mcp-config.json",
				type: "qoder",
				hasConfig: true,
			});

			const status = controller.checkConfigurationStatus();

			expect(status.daemonRunning).toBe(true);
			expect(status.configured).toBe(true);
			expect(status.workspaceConfig).toMatchObject({
				path: "/mock/workspace/.qoder-mcp-config.json",
				type: "qoder",
			});
		});

		it("should return configured when AI client has vreko configured", () => {
			vi.mocked(existsSync).mockReturnValue(true);
			mockDetectAIClients.mockReturnValue({
				clients: [],
				detected: [
					{
						name: "cursor",
						displayName: "Cursor",
						configPath: "/mock/.cursor/mcp.json",
						exists: true,
						hasVreko: true,
						format: "cursor",
					},
					{
						name: "claude",
						displayName: "Claude Desktop",
						configPath: "/mock/claude/config.json",
						exists: true,
						hasVreko: true,
						format: "claude",
					},
				],
				needsSetup: [],
			});

			const status = controller.checkConfigurationStatus();

			expect(status.daemonRunning).toBe(true);
			expect(status.configured).toBe(true);
			expect(status.configuredClients).toEqual(["Cursor", "Claude Desktop"]);
		});

		it("should handle multiple configured clients correctly", () => {
			vi.mocked(existsSync).mockReturnValue(false);
			mockDetectAIClients.mockReturnValue({
				clients: [],
				detected: [
					{
						name: "cursor",
						displayName: "Cursor",
						configPath: "/mock/.cursor/mcp.json",
						exists: true,
						hasVreko: true,
						format: "cursor",
					},
					{
						name: "qoder",
						displayName: "Qoder",
						configPath: "/mock/qoder/mcp.json",
						exists: true,
						hasVreko: false,
						format: "qoder",
					},
				],
				needsSetup: [],
			});

			const status = controller.checkConfigurationStatus();

			expect(status.daemonRunning).toBe(false);
			expect(status.configured).toBe(true);
			expect(status.configuredClients).toEqual(["Cursor"]);
		});
	});

	describe("State Getters", () => {
		it("should expose mode helpers", () => {
			expect(controller.isLocalCLIMode()).toBe(false);
			expect(controller.isRemoteAPIMode()).toBe(false);
		});

		it("should expose health state", () => {
			const health = controller.getHealthState();
			// Initial state should be unknown or healthy depending on HealthMonitor defaults
			expect(typeof health).toBe("string");
		});

		it("should provide comprehensive status", () => {
			const status = controller.getStatus();
			expect(status).toHaveProperty("mode");
			expect(status).toHaveProperty("connectionState");
			expect(status).toHaveProperty("healthState");
			expect(status).toHaveProperty("isReady");
			expect(status.isReady).toBe(false);
		});
	});

	describe("Mode Change Events", () => {
		it("should emit mode change event when mode changes on start", async () => {
			const onModeChangeSpy = vi.fn();
			controller.onModeChange(onModeChangeSpy);

			// Set up LOCAL_CLI mode
			vi.mocked(existsSync).mockReturnValue(true);
			mockDaemonBridge.isConnected.mockReturnValue(true);

			await controller.start();

			expect(onModeChangeSpy).toHaveBeenCalledWith(
				expect.objectContaining({
					previousMode: MCPMode.UNCONFIGURED,
					newMode: MCPMode.LOCAL_CLI,
				}),
			);
		});
	});

	describe("Lifecycle", () => {
		it("should stop cleanly", async () => {
			await controller.stop();
			expect(controller.getConnectionState()).toBe("disconnected");
		});

		it("should dispose without error", () => {
			expect(() => controller.dispose()).not.toThrow();
		});
	});
});
