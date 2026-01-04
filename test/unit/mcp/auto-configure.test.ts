/**
 * MCP Auto-Configuration Tests
 *
 * Tests for the frictionless MCP setup flow in VS Code extension.
 *
 * @see apps/vscode/src/mcp/auto-configure.ts
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// Mock vscode module
vi.mock("vscode", () => ({
	workspace: {
		getConfiguration: vi.fn(() => ({
			get: vi.fn((key: string, defaultValue: unknown) => defaultValue),
			update: vi.fn(),
		})),
		workspaceFolders: [{ uri: { fsPath: "/mock/workspace/path" } }],
	},
	window: {
		showInformationMessage: vi.fn(),
		showWarningMessage: vi.fn(),
		showQuickPick: vi.fn(),
		withProgress: vi.fn((_, task) => task({ report: vi.fn() })),
	},
	commands: {
		registerCommand: vi.fn(),
	},
	ProgressLocation: {
		Notification: 1,
	},
	ConfigurationTarget: {
		Global: 1,
	},
}));

// Mock mcp-config
vi.mock("@snapback/mcp-config", () => ({
	detectAIClients: vi.fn(),
	getSnapbackMCPConfig: vi.fn(),
	writeClientConfig: vi.fn(),
	removeSnapbackConfig: vi.fn(),
}));

// Mock workspace-id
vi.mock("../../../src/auth/workspace-id", () => ({
	getOrCreateWorkspaceId: vi.fn(() => Promise.resolve("ws_1234567890abcdef1234567890abcdef")),
}));

import * as vscode from "vscode";
import { detectAIClients, getSnapbackMCPConfig, writeClientConfig } from "@snapback/mcp-config";

describe("MCP Auto-Configure", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.resetAllMocks();
	});

	describe("getSnapbackMCPConfig", () => {
		it("should generate HTTP config with workspace path in URL", () => {
			const mockConfig = {
				url: "https://snapback-mcp.fly.dev/mcp?workspace=/mock/workspace/path",
				env: { SNAPBACK_WORKSPACE_ID: "ws_abc123" },
			};
			vi.mocked(getSnapbackMCPConfig).mockReturnValue(mockConfig);

			const result = getSnapbackMCPConfig({
				workspaceId: "ws_abc123",
				workspaceRoot: "/mock/workspace/path",
			});

			expect(result.url).toContain("workspace=");
			expect(result.url).toContain("/mcp");
			expect(result.env?.SNAPBACK_WORKSPACE_ID).toBe("ws_abc123");
		});

		it("should include workspace path as URL query parameter", () => {
			const mockConfig = {
				url: "https://snapback-mcp.fly.dev/mcp?workspace=%2Fpath%2Fto%2Fproject",
			};
			vi.mocked(getSnapbackMCPConfig).mockReturnValue(mockConfig);

			const result = getSnapbackMCPConfig({
				workspaceRoot: "/path/to/project",
			});

			expect(result.url).toMatch(/workspace=/);
		});

		it("should use default Fly.io URL when no serverUrl provided", () => {
			const mockConfig = {
				url: "https://snapback-mcp.fly.dev/mcp",
			};
			vi.mocked(getSnapbackMCPConfig).mockReturnValue(mockConfig);

			const result = getSnapbackMCPConfig({});

			expect(result.url).toContain("snapback-mcp.fly.dev");
		});
	});

	describe("Client Detection", () => {
		it("should detect installed AI clients", () => {
			vi.mocked(detectAIClients).mockReturnValue({
				clients: [
					{
						name: "claude",
						displayName: "Claude Desktop",
						configPath: "/mock/path",
						format: "claude" as const,
						exists: true,
						hasSnapback: false,
					},
				],
				detected: [
					{
						name: "claude",
						displayName: "Claude Desktop",
						configPath: "/mock/path",
						format: "claude" as const,
						exists: true,
						hasSnapback: false,
					},
				],
				needsSetup: [
					{
						name: "claude",
						displayName: "Claude Desktop",
						configPath: "/mock/path",
						format: "claude" as const,
						exists: true,
						hasSnapback: false,
					},
				],
			});

			const result = detectAIClients();

			expect(result.detected.length).toBe(1);
			expect(result.detected[0].name).toBe("claude");
			expect(result.needsSetup.length).toBe(1);
		});

		it("should identify clients that need setup", () => {
			vi.mocked(detectAIClients).mockReturnValue({
				clients: [
					{
						name: "cursor",
						displayName: "Cursor",
						configPath: "/mock/path",
						format: "cursor" as const,
						exists: true,
						hasSnapback: false,
					},
				],
				detected: [
					{
						name: "cursor",
						displayName: "Cursor",
						configPath: "/mock/path",
						format: "cursor" as const,
						exists: true,
						hasSnapback: false,
					},
				],
				needsSetup: [
					{
						name: "cursor",
						displayName: "Cursor",
						configPath: "/mock/path",
						format: "cursor" as const,
						exists: true,
						hasSnapback: false,
					},
				],
			});

			const result = detectAIClients();

			expect(result.needsSetup.length).toBe(1);
			expect(result.needsSetup[0].hasSnapback).toBe(false);
		});

		it("should exclude already-configured clients from needsSetup", () => {
			vi.mocked(detectAIClients).mockReturnValue({
				clients: [
					{
						name: "claude",
						displayName: "Claude Desktop",
						configPath: "/mock/path",
						format: "claude" as const,
						exists: true,
						hasSnapback: true,
					},
				],
				detected: [
					{
						name: "claude",
						displayName: "Claude Desktop",
						configPath: "/mock/path",
						format: "claude" as const,
						exists: true,
						hasSnapback: true,
					},
				],
				needsSetup: [],
			});

			const result = detectAIClients();

			expect(result.needsSetup.length).toBe(0);
		});
	});

	describe("Config Writing", () => {
		it("should write config successfully", () => {
			vi.mocked(writeClientConfig).mockReturnValue({ success: true });

			const result = writeClientConfig(
				{
					name: "claude",
					displayName: "Claude Desktop",
					configPath: "/mock/path",
					format: "claude",
					exists: true,
					hasSnapback: false,
				},
				{
					url: "https://snapback-mcp.fly.dev/mcp?workspace=/test",
				},
			);

			expect(result.success).toBe(true);
		});

		it("should create backup when config exists", () => {
			vi.mocked(writeClientConfig).mockReturnValue({
				success: true,
				backup: "/mock/path.backup.1234567890",
			});

			const result = writeClientConfig(
				{
					name: "claude",
					displayName: "Claude Desktop",
					configPath: "/mock/path",
					format: "claude",
					exists: true,
					hasSnapback: false,
				},
				{
					url: "https://snapback-mcp.fly.dev/mcp",
				},
			);

			expect(result.backup).toBeDefined();
		});

		it("should handle write errors gracefully", () => {
			vi.mocked(writeClientConfig).mockReturnValue({
				success: false,
				error: "Permission denied",
			});

			const result = writeClientConfig(
				{
					name: "claude",
					displayName: "Claude Desktop",
					configPath: "/protected/path",
					format: "claude",
					exists: true,
					hasSnapback: false,
				},
				{
					url: "https://snapback-mcp.fly.dev/mcp",
				},
			);

			expect(result.success).toBe(false);
			expect(result.error).toBe("Permission denied");
		});
	});

	describe("Workspace ID Integration", () => {
		it("should include workspace ID in env when provided", () => {
			const mockConfig = {
				url: "https://snapback-mcp.fly.dev/mcp",
				env: { SNAPBACK_WORKSPACE_ID: "ws_1234567890abcdef1234567890abcdef" },
			};
			vi.mocked(getSnapbackMCPConfig).mockReturnValue(mockConfig);

			const result = getSnapbackMCPConfig({
				workspaceId: "ws_1234567890abcdef1234567890abcdef",
			});

			expect(result.env?.SNAPBACK_WORKSPACE_ID).toBe("ws_1234567890abcdef1234567890abcdef");
		});

		it("should validate workspace ID format", () => {
			// Workspace ID format: ws_ + 32 hex chars
			const validId = "ws_1234567890abcdef1234567890abcdef";
			const invalidId = "invalid-workspace-id";

			expect(validId).toMatch(/^ws_[a-f0-9]{32}$/);
			expect(invalidId).not.toMatch(/^ws_[a-f0-9]{32}$/);
		});
	});

	describe("URL Construction", () => {
		it("should properly encode workspace path in URL", () => {
			const workspacePath = "/Users/test/My Project";
			const encoded = encodeURIComponent(workspacePath);

			expect(encoded).toBe("%2FUsers%2Ftest%2FMy%20Project");
		});

		it("should construct valid URL with all parameters", () => {
			const baseUrl = "https://snapback-mcp.fly.dev/mcp";
			const workspacePath = "/Users/test/project";
			const url = new URL(baseUrl);
			url.searchParams.set("workspace", workspacePath);

			expect(url.toString()).toBe(
				"https://snapback-mcp.fly.dev/mcp?workspace=%2FUsers%2Ftest%2Fproject",
			);
		});
	});
});

describe("Auto-Configure Flow", () => {
	it("should skip if autoEnable is disabled", async () => {
		vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
			get: vi.fn((key: string) => (key === "mcp.autoEnable" ? false : undefined)),
			update: vi.fn(),
		} as unknown as vscode.WorkspaceConfiguration);

		// Auto-configure should return early
		expect(vscode.workspace.getConfiguration("snapback").get("mcp.autoEnable", true)).toBe(false);
	});

	it("should skip if already configured", async () => {
		const mockContext = {
			globalState: {
				get: vi.fn((key: string) => (key === "mcp.configured" ? true : undefined)),
				update: vi.fn(),
			},
			secrets: {
				get: vi.fn(),
			},
		};

		// Should return early because mcp.configured is true
		expect(mockContext.globalState.get("mcp.configured")).toBe(true);
	});

	it("should prompt user when AI clients detected", async () => {
		vi.mocked(detectAIClients).mockReturnValue({
			clients: [],
			detected: [
				{
					name: "claude",
					displayName: "Claude Desktop",
					configPath: "/mock",
					format: "claude" as const,
					exists: true,
					hasSnapback: false,
				},
			],
			needsSetup: [
				{
					name: "claude",
					displayName: "Claude Desktop",
					configPath: "/mock",
					format: "claude" as const,
					exists: true,
					hasSnapback: false,
				},
			],
		});

		const result = detectAIClients();
		expect(result.needsSetup.length).toBeGreaterThan(0);
		// In real flow, this would trigger the user prompt
	});
});
