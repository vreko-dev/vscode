import { beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync } from "node:fs";
import * as vscode from "vscode";
import { MCPMode, MCPModeManager } from "../../../src/services/MCPModeManager";

// Mock Node.js modules
vi.mock("node:fs");
vi.mock("node:os", () => ({
	homedir: () => "/mock/home",
	platform: () => "darwin",
}));

// Mock @snapback/mcp-config
vi.mock("@snapback/mcp-config", () => ({
	detectAIClients: vi.fn(),
	detectWorkspaceConfig: vi.fn(),
}));

describe("MCPModeManager", () => {
	let manager: MCPModeManager;

	beforeEach(() => {
		vi.clearAllMocks();

		// Reset singleton
		(MCPModeManager as any).instance = null;
		manager = MCPModeManager.getInstance();

		// Mock VS Code configuration
		const mockConfig = {
			get: vi.fn((key: string, defaultValue?: unknown) => {
				if (key === "apiKey") return "";
				if (key === "cliPath") return "";
				return defaultValue;
			}),
		};
		vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(mockConfig as any);
		
		// Mock workspace folders
		Object.defineProperty(vscode.workspace, "workspaceFolders", {
			value: [{ uri: { fsPath: "/mock/workspace" } }],
			writable: true,
		});
	});

	describe("detectMode", () => {
		it("should detect LOCAL_CLI mode when daemon socket exists", async () => {
			// Mock daemon socket exists
			vi.mocked(existsSync).mockReturnValue(true);

			const mode = await manager.detectMode();

			expect(mode).toBe(MCPMode.LOCAL_CLI);
		});

		it("should detect LOCAL_CLI mode when CLI is configured in AI client", async () => {
			const { detectAIClients } = await import("@snapback/mcp-config");
			vi.mocked(existsSync).mockReturnValue(false); // Daemon not running
			vi.mocked(detectAIClients).mockReturnValue({
				clients: [],
				detected: [
					{
						name: "cursor",
						displayName: "Cursor",
						configPath: "/mock/.cursor/mcp.json",
						exists: true,
						hasSnapback: true,
						format: "cursor",
					},
				],
				needsSetup: [],
			});

			const mode = await manager.detectMode();

			expect(mode).toBe(MCPMode.LOCAL_CLI);
		});

		it("should detect REMOTE_API mode when API key exists but no CLI", async () => {
			const { detectAIClients } = await import("@snapback/mcp-config");
			const mockConfig = {
				get: vi.fn((key: string, defaultValue?: unknown) => {
					if (key === "apiKey") return "test-api-key";
					if (key === "cliPath") return "";
					return defaultValue;
				}),
			};
			vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(mockConfig as any);
			vi.mocked(existsSync).mockReturnValue(false);
			vi.mocked(detectAIClients).mockReturnValue({
				clients: [],
				detected: [],
				needsSetup: [],
			});

			const mode = await manager.detectMode();

			expect(mode).toBe(MCPMode.REMOTE_API);
		});

		it("should detect UNCONFIGURED mode when nothing is configured", async () => {
			const { detectAIClients } = await import("@snapback/mcp-config");
			vi.mocked(existsSync).mockReturnValue(false);
			vi.mocked(detectAIClients).mockReturnValue({
				clients: [],
				detected: [],
				needsSetup: [],
			});

			const mode = await manager.detectMode();

			expect(mode).toBe(MCPMode.UNCONFIGURED);
		});
	});

	describe("checkConfigurationStatus", () => {
		it("should return daemon running but not configured when daemon exists but no config", async () => {
			const { detectAIClients, detectWorkspaceConfig } = await import("@snapback/mcp-config");
			vi.mocked(existsSync).mockReturnValue(true); // Daemon running
			vi.mocked(detectWorkspaceConfig).mockReturnValue(null);
			vi.mocked(detectAIClients).mockReturnValue({
				clients: [],
				detected: [],
				needsSetup: [],
			});

			const status = manager.checkConfigurationStatus();

			expect(status.daemonRunning).toBe(true);
			expect(status.configured).toBe(false);
			expect(status.configuredClients).toEqual([]);
			expect(status.workspaceConfig).toBeNull();
		});

		it("should return configured when workspace config exists", async () => {
			const { detectAIClients, detectWorkspaceConfig } = await import("@snapback/mcp-config");
			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(detectWorkspaceConfig).mockReturnValue({
				path: "/mock/workspace/.qoder-mcp-config.json",
				type: "qoder",
			});
			vi.mocked(detectAIClients).mockReturnValue({
				clients: [],
				detected: [],
				needsSetup: [],
			});

			const status = manager.checkConfigurationStatus();

			expect(status.daemonRunning).toBe(true);
			expect(status.configured).toBe(true);
			expect(status.workspaceConfig).toEqual({
				path: "/mock/workspace/.qoder-mcp-config.json",
				type: "qoder",
			});
		});

		it("should return configured when AI client has snapback configured", async () => {
			const { detectAIClients, detectWorkspaceConfig } = await import("@snapback/mcp-config");
			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(detectWorkspaceConfig).mockReturnValue(null);
			vi.mocked(detectAIClients).mockReturnValue({
				clients: [],
				detected: [
					{
						name: "cursor",
						displayName: "Cursor",
						configPath: "/mock/.cursor/mcp.json",
						exists: true,
						hasSnapback: true,
						format: "cursor",
					},
					{
						name: "claude",
						displayName: "Claude Desktop",
						configPath: "/mock/claude/config.json",
						exists: true,
						hasSnapback: true,
						format: "claude",
					},
				],
				needsSetup: [],
			});

			const status = manager.checkConfigurationStatus();

			expect(status.daemonRunning).toBe(true);
			expect(status.configured).toBe(true);
			expect(status.configuredClients).toEqual(["Cursor", "Claude Desktop"]);
		});

		it("should handle multiple configured clients correctly", async () => {
			const { detectAIClients, detectWorkspaceConfig } = await import("@snapback/mcp-config");
			vi.mocked(existsSync).mockReturnValue(false); // Daemon not running
			vi.mocked(detectWorkspaceConfig).mockReturnValue(null);
			vi.mocked(detectAIClients).mockReturnValue({
				clients: [],
				detected: [
					{
						name: "cursor",
						displayName: "Cursor",
						configPath: "/mock/.cursor/mcp.json",
						exists: true,
						hasSnapback: true,
						format: "cursor",
					},
					{
						name: "qoder",
						displayName: "Qoder",
						configPath: "/mock/qoder/mcp.json",
						exists: true,
						hasSnapback: false, // Not configured
						format: "qoder",
					},
				],
				needsSetup: [],
			});

			const status = manager.checkConfigurationStatus();

			expect(status.daemonRunning).toBe(false);
			expect(status.configured).toBe(true); // Configured in Cursor
			expect(status.configuredClients).toEqual(["Cursor"]); // Only Cursor
		});
	});

	describe("mode changes", () => {
		it("should emit mode change event when mode actually changes", async () => {
			const { detectAIClients } = await import("@snapback/mcp-config");
			const onModeChangeSpy = vi.fn();
			
			// Start in UNCONFIGURED mode (default)
			vi.mocked(existsSync).mockReturnValue(false);
			vi.mocked(detectAIClients).mockReturnValue({
				clients: [],
				detected: [],
				needsSetup: [],
			});

			await manager.detectMode(); // Will be UNCONFIGURED
			
			// Now register listener
			manager.onModeChange(onModeChangeSpy);

			// Change to LOCAL_CLI mode
			vi.mocked(existsSync).mockReturnValue(true);
			await manager.detectMode(); // Will change to LOCAL_CLI

			expect(onModeChangeSpy).toHaveBeenCalledWith(
				expect.objectContaining({
					previousMode: MCPMode.UNCONFIGURED,
					newMode: MCPMode.LOCAL_CLI,
				}),
			);
		});
	});
});
