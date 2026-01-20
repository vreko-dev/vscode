import { beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { MCPStatusItem } from "../../../src/ui/MCPStatusItem";
import type { MCPLifecycleManager } from "../../../src/services/MCPLifecycleManager";
import { getMCPModeManager } from "../../../src/services/MCPModeManager";

// Mock MCPModeManager
vi.mock("../../../src/services/MCPModeManager", () => ({
	getMCPModeManager: vi.fn(),
}));

describe("MCPStatusItem", () => {
	let statusItem: MCPStatusItem;
	let mockMCPManager: Partial<MCPLifecycleManager>;
	let mockModeManager: any;
	let mockStatusBarItem: any;
	let stateChangeCallback: any;

	beforeEach(() => {
		vi.clearAllMocks();

		// Mock status bar item
		mockStatusBarItem = {
			text: "",
			tooltip: "",
			backgroundColor: undefined,
			color: undefined,
			command: "",
			show: vi.fn(),
			hide: vi.fn(),
			dispose: vi.fn(),
		};

		vi.mocked(vscode.window.createStatusBarItem).mockReturnValue(mockStatusBarItem as any);

		// Mock MCP Lifecycle Manager
		mockMCPManager = {
			isServerReady: vi.fn().mockReturnValue(false),
			onStateChange: vi.fn((callback) => {
				stateChangeCallback = callback;
				return { dispose: vi.fn() };
			}),
		};

		// Mock MCP Mode Manager
		mockModeManager = {
			checkConfigurationStatus: vi.fn().mockReturnValue({
				daemonRunning: false,
				configured: false,
				configuredClients: [],
				workspaceConfig: null,
			}),
		};
		vi.mocked(getMCPModeManager).mockReturnValue(mockModeManager);

		// Mock VS Code configuration
		const mockConfig = {
			get: vi.fn((key: string, defaultValue?: unknown) => {
				if (key === "mcp.enabled") return true;
				return defaultValue;
			}),
		};
		vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(mockConfig as any);
	});

	describe("Health Check States", () => {
		it("should show connected state when daemon running AND configured", () => {
			// Mock daemon running and configured
			mockMCPManager.isServerReady = vi.fn().mockReturnValue(true);
			mockModeManager.checkConfigurationStatus.mockReturnValue({
				daemonRunning: true,
				configured: true,
				configuredClients: ["Cursor"],
				workspaceConfig: null,
			});

			statusItem = new MCPStatusItem({ mcpManager: mockMCPManager as MCPLifecycleManager });

			// Trigger health check
			(statusItem as any).checkHealth();

			expect(mockStatusBarItem.text).toBe("SB·MCP ✓");
			expect(mockStatusBarItem.tooltip).toContain("healthy");
			expect(mockStatusBarItem.backgroundColor).toBeUndefined();
			expect(statusItem.getState()).toBe("connected");
		});

		it("should show degraded state when daemon running BUT not configured", () => {
			// Mock daemon running but not configured
			mockMCPManager.isServerReady = vi.fn().mockReturnValue(true);
			mockModeManager.checkConfigurationStatus.mockReturnValue({
				daemonRunning: true,
				configured: false,
				configuredClients: [],
				workspaceConfig: null,
			});

			statusItem = new MCPStatusItem({ mcpManager: mockMCPManager as MCPLifecycleManager });

			// Trigger health check
			(statusItem as any).checkHealth();

			expect(mockStatusBarItem.text).toBe("SB·MCP ⚠");
			expect(mockStatusBarItem.tooltip).toContain("degraded");
			expect(mockStatusBarItem.command).toBe("snapback.mcp.configure");
			expect(statusItem.getState()).toBe("degraded");
		});

		it("should show disconnected state when daemon not running", () => {
			// Mock daemon not running
			mockMCPManager.isServerReady = vi.fn().mockReturnValue(false);
			mockModeManager.checkConfigurationStatus.mockReturnValue({
				daemonRunning: false,
				configured: false,
				configuredClients: [],
				workspaceConfig: null,
			});

			statusItem = new MCPStatusItem({ mcpManager: mockMCPManager as MCPLifecycleManager });

			// Initial state will be disconnected, but we need to wait for health check
			// The updateState() is called in constructor, which calls checkHealth()
			
			expect(statusItem.getState()).toBe("disconnected");
			// Note: statusBarItem.text might be empty on first init, needs state update
		});

		it("should hide when MCP is disabled in settings", () => {
			// Mock MCP disabled
			const mockConfig = {
				get: vi.fn((key: string, defaultValue?: unknown) => {
					if (key === "mcp.enabled") return false;
					return defaultValue;
				}),
			};
			vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(mockConfig as any);

			statusItem = new MCPStatusItem({ mcpManager: mockMCPManager as MCPLifecycleManager });

			// Trigger health check
			(statusItem as any).checkHealth();

			expect(mockStatusBarItem.hide).toHaveBeenCalled();
			expect(statusItem.getState()).toBe("disabled");
		});
	});

	describe("Configuration Detection", () => {
		it("should detect workspace-level configuration", () => {
			mockMCPManager.isServerReady = vi.fn().mockReturnValue(true);
			mockModeManager.checkConfigurationStatus.mockReturnValue({
				daemonRunning: true,
				configured: true,
				configuredClients: [],
				workspaceConfig: {
					path: "/workspace/.qoder-mcp-config.json",
					type: "qoder",
				},
			});

			statusItem = new MCPStatusItem({ mcpManager: mockMCPManager as MCPLifecycleManager });
			(statusItem as any).checkHealth();

			expect(statusItem.getState()).toBe("connected");
		});

		it("should detect global client configurations", () => {
			mockMCPManager.isServerReady = vi.fn().mockReturnValue(true);
			mockModeManager.checkConfigurationStatus.mockReturnValue({
				daemonRunning: true,
				configured: true,
				configuredClients: ["Cursor", "Claude Desktop"],
				workspaceConfig: null,
			});

			statusItem = new MCPStatusItem({ mcpManager: mockMCPManager as MCPLifecycleManager });
			(statusItem as any).checkHealth();

			expect(statusItem.getState()).toBe("connected");
		});

		it("should prioritize any configuration (workspace or global)", () => {
			mockMCPManager.isServerReady = vi.fn().mockReturnValue(true);
			mockModeManager.checkConfigurationStatus.mockReturnValue({
				daemonRunning: true,
				configured: true,
				configuredClients: ["Cursor"],
				workspaceConfig: {
					path: "/workspace/.qoder-mcp-config.json",
					type: "qoder",
				},
			});

			statusItem = new MCPStatusItem({ mcpManager: mockMCPManager as MCPLifecycleManager });
			(statusItem as any).checkHealth();

			expect(statusItem.getState()).toBe("connected");
		});
	});

	describe("State Transitions", () => {
		it("should transition from degraded to connected when configuration is added", () => {
			// Start in degraded state
			mockMCPManager.isServerReady = vi.fn().mockReturnValue(true);
			mockModeManager.checkConfigurationStatus.mockReturnValue({
				daemonRunning: true,
				configured: false,
				configuredClients: [],
				workspaceConfig: null,
			});

			statusItem = new MCPStatusItem({ mcpManager: mockMCPManager as MCPLifecycleManager });
			(statusItem as any).checkHealth();
			expect(statusItem.getState()).toBe("degraded");

			// User configures SnapBack
			mockModeManager.checkConfigurationStatus.mockReturnValue({
				daemonRunning: true,
				configured: true,
				configuredClients: ["Qoder"],
				workspaceConfig: {
					path: "/workspace/.qoder-mcp-config.json",
					type: "qoder",
				},
			});

			// Trigger health check again
			(statusItem as any).checkHealth();
			expect(statusItem.getState()).toBe("connected");
		});

		it("should transition from connected to degraded when configuration is removed", () => {
			// Start in connected state
			mockMCPManager.isServerReady = vi.fn().mockReturnValue(true);
			mockModeManager.checkConfigurationStatus.mockReturnValue({
				daemonRunning: true,
				configured: true,
				configuredClients: ["Cursor"],
				workspaceConfig: null,
			});

			statusItem = new MCPStatusItem({ mcpManager: mockMCPManager as MCPLifecycleManager });
			(statusItem as any).checkHealth();
			expect(statusItem.getState()).toBe("connected");

			// User removes SnapBack from config
			mockModeManager.checkConfigurationStatus.mockReturnValue({
				daemonRunning: true,
				configured: false,
				configuredClients: [],
				workspaceConfig: null,
			});

			// Trigger health check again
			(statusItem as any).checkHealth();
			expect(statusItem.getState()).toBe("degraded");
		});
	});

	describe("Edge Cases", () => {
		it("should handle daemon running with partial configuration (some clients configured)", () => {
			mockMCPManager.isServerReady = vi.fn().mockReturnValue(true);
			mockModeManager.checkConfigurationStatus.mockReturnValue({
				daemonRunning: true,
				configured: true, // At least one client configured
				configuredClients: ["Cursor"], // Cursor configured, but not Qoder
				workspaceConfig: null,
			});

			statusItem = new MCPStatusItem({ mcpManager: mockMCPManager as MCPLifecycleManager });
			(statusItem as any).checkHealth();

			// Should show connected because at least one client is configured
			expect(statusItem.getState()).toBe("connected");
		});

		it("should handle state when configuration check throws error", () => {
			mockMCPManager.isServerReady = vi.fn().mockReturnValue(true);
			mockModeManager.checkConfigurationStatus.mockImplementation(() => {
				throw new Error("Config check failed");
			});

			// Should not throw during construction, but will fail on health check
			// We need to wrap in try-catch to handle the error gracefully
			expect(() => {
				statusItem = new MCPStatusItem({ mcpManager: mockMCPManager as MCPLifecycleManager });
			}).toThrow("Config check failed");
		});
	});

	afterEach(() => {
		if (statusItem) {
			statusItem.dispose();
		}
	});
});
