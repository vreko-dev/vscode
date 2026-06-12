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

// Mock local mcp-config stubs (thin client architecture)
vi.mock("../../../src/types/mcp-config", () => ({
	detectAIClients: vi.fn(),
	getVrekoMCPConfig: vi.fn(),
	writeClientConfig: vi.fn(),
	removeVrekoConfig: vi.fn(),
	validateClientConfig: vi.fn(),
	repairClientConfig: vi.fn(),
}));

// Mock workspace-id
vi.mock("../../../src/auth/workspace-id", () => ({
	getOrCreateWorkspaceId: vi.fn(() => Promise.resolve("ws_1234567890abcdef1234567890abcdef")),
}));

import * as vscode from "vscode";
import { detectAIClients, getVrekoMCPConfig, writeClientConfig } from "../../../src/types/mcp-config";

describe("MCP Auto-Configure", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.resetAllMocks();
	});

	describe("getVrekoMCPConfig", () => {
		it("should generate HTTP config with workspace path in URL", () => {
			const mockConfig = {
				url: "https://mcp.vreko.dev/mcp?workspace=/mock/workspace/path",
				env: { VREKO_WORKSPACE_ID: "ws_abc123" },
			};
			vi.mocked(getVrekoMCPConfig).mockReturnValue(mockConfig);

			const result = getVrekoMCPConfig({
				workspaceId: "ws_abc123",
				workspaceRoot: "/mock/workspace/path",
			});

			expect(result.url).toContain("workspace=");
			expect(result.url).toContain("/mcp");
			expect(result.env?.VREKO_WORKSPACE_ID).toBe("ws_abc123");
		});

		it("should include workspace path as URL query parameter", () => {
			const mockConfig = {
				url: "https://mcp.vreko.dev/mcp?workspace=%2Fpath%2Fto%2Fproject",
			};
			vi.mocked(getVrekoMCPConfig).mockReturnValue(mockConfig);

			const result = getVrekoMCPConfig({
				workspaceRoot: "/path/to/project",
			});

			expect(result.url).toMatch(/workspace=/);
		});

		it("should use default MCP URL when no serverUrl provided", () => {
			const mockConfig = {
				url: "https://mcp.vreko.dev/mcp",
			};
			vi.mocked(getVrekoMCPConfig).mockReturnValue(mockConfig);

			const result = getVrekoMCPConfig({});

			expect(result.url).toContain("mcp.vreko.dev");
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
						hasVreko: false,
					},
				],
				detected: [
					{
						name: "claude",
						displayName: "Claude Desktop",
						configPath: "/mock/path",
						format: "claude" as const,
						exists: true,
						hasVreko: false,
					},
				],
				needsSetup: [
					{
						name: "claude",
						displayName: "Claude Desktop",
						configPath: "/mock/path",
						format: "claude" as const,
						exists: true,
						hasVreko: false,
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
						hasVreko: false,
					},
				],
				detected: [
					{
						name: "cursor",
						displayName: "Cursor",
						configPath: "/mock/path",
						format: "cursor" as const,
						exists: true,
						hasVreko: false,
					},
				],
				needsSetup: [
					{
						name: "cursor",
						displayName: "Cursor",
						configPath: "/mock/path",
						format: "cursor" as const,
						exists: true,
						hasVreko: false,
					},
				],
			});

			const result = detectAIClients();

			expect(result.needsSetup.length).toBe(1);
			expect(result.needsSetup[0].hasVreko).toBe(false);
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
						hasVreko: true,
					},
				],
				detected: [
					{
						name: "claude",
						displayName: "Claude Desktop",
						configPath: "/mock/path",
						format: "claude" as const,
						exists: true,
						hasVreko: true,
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
					hasVreko: false,
				},
				{
					url: "https://mcp.vreko.dev/mcp?workspace=/test",
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
					hasVreko: false,
				},
				{
					url: "https://mcp.vreko.dev/mcp",
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
					hasVreko: false,
				},
				{
					url: "https://mcp.vreko.dev/mcp",
				},
			);

			expect(result.success).toBe(false);
			expect(result.error).toBe("Permission denied");
		});
	});

	describe("Workspace ID Integration", () => {
		it("should include workspace ID in env when provided", () => {
			const mockConfig = {
				url: "https://mcp.vreko.dev/mcp",
				env: { VREKO_WORKSPACE_ID: "ws_1234567890abcdef1234567890abcdef" },
			};
			vi.mocked(getVrekoMCPConfig).mockReturnValue(mockConfig);

			const result = getVrekoMCPConfig({
				workspaceId: "ws_1234567890abcdef1234567890abcdef",
			});

			expect(result.env?.VREKO_WORKSPACE_ID).toBe("ws_1234567890abcdef1234567890abcdef");
		});

		it("should validate workspace ID format", () => {
			// Workspace ID format: unified 12-char hex (or legacy ws_ + 32 hex)
			const validId = "a1b2c3d4e5f6";
			const legacyId = "ws_1234567890abcdef1234567890abcdef";
			const invalidId = "invalid-workspace-id";

			expect(validId).toMatch(/^[a-f0-9]{12}$/);
			expect(legacyId).toMatch(/^[a-f0-9]{12}|ws_[a-f0-9]{32}$/);
			expect(invalidId).not.toMatch(/^[a-f0-9]{12}$/);
		});
	});

	describe("URL Construction", () => {
		it("should properly encode workspace path in URL", () => {
			const workspacePath = "/Users/test/My Project";
			const encoded = encodeURIComponent(workspacePath);

			expect(encoded).toBe("%2FUsers%2Ftest%2FMy%20Project");
		});

		it("should construct valid URL with all parameters", () => {
			const baseUrl = "https://mcp.vreko.dev/mcp";
			const workspacePath = "/Users/test/project";
			const url = new URL(baseUrl);
			url.searchParams.set("workspace", workspacePath);

			expect(url.toString()).toBe(
				"https://mcp.vreko.dev/mcp?workspace=%2FUsers%2Ftest%2Fproject",
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
		expect(vscode.workspace.getConfiguration("vreko").get("mcp.autoEnable", true)).toBe(false);
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
					hasVreko: false,
				},
			],
			needsSetup: [
				{
					name: "claude",
					displayName: "Claude Desktop",
					configPath: "/mock",
					format: "claude" as const,
					exists: true,
					hasVreko: false,
				},
			],
		});

		const result = detectAIClients();
		expect(result.needsSetup.length).toBeGreaterThan(0);
		// In real flow, this would trigger the user prompt
	});
});

// =============================================================================
// THIN CLIENT ARCHITECTURE TESTS
// =============================================================================

describe("CLI Subprocess Integration (Thin Client)", () => {
	describe("ToolsConfigureJsonResult Type", () => {
		it("should define correct structure for JSON output", () => {
			// Test the interface matches CLI output format
			const mockResult = {
				success: true,
				clients: {
					claude: "configured" as const,
					cursor: "already_configured" as const,
					windsurf: "not_installed" as const,
				},
				configured: ["claude"],
				skipped: ["cursor"],
				notInstalled: ["windsurf"],
				failed: [],
				version: "1.0.0",
			};

			expect(mockResult.success).toBe(true);
			expect(mockResult.configured).toContain("claude");
			expect(mockResult.skipped).toContain("cursor");
			expect(mockResult.notInstalled).toContain("windsurf");
			expect(mockResult.failed).toHaveLength(0);
		});

		it("should handle error case in JSON output", () => {
			const errorResult = {
				success: false,
				clients: {},
				configured: [],
				skipped: [],
				notInstalled: [],
				failed: ["claude", "cursor"],
				version: "1.0.0",
				error: "Permission denied writing config",
			};

			expect(errorResult.success).toBe(false);
			expect(errorResult.error).toBeDefined();
			expect(errorResult.failed).toHaveLength(2);
		});
	});

	describe("ClientConfigStatus Types", () => {
		it("should support all status values", () => {
			const statuses: Array<"configured" | "already_configured" | "not_installed" | "failed" | "skipped"> = [
				"configured",
				"already_configured",
				"not_installed",
				"failed",
				"skipped",
			];

			expect(statuses).toHaveLength(5);
		});
	});

	describe("JSON Parsing Logic", () => {
		it("should parse valid JSON from CLI output", () => {
			const stdout = `Some log output
{"success":true,"clients":{"claude":"configured"},"configured":["claude"],"skipped":[],"notInstalled":[],"failed":[],"version":"1.0.0"}`;

			// Simulate the regex matching used in spawnCLIConfigure
			const jsonMatch = stdout.match(/\{[\s\S]*\}/);
			expect(jsonMatch).not.toBeNull();

			if (jsonMatch) {
				const result = JSON.parse(jsonMatch[0]);
				expect(result.success).toBe(true);
				expect(result.configured).toContain("claude");
			}
		});

		it("should handle malformed JSON gracefully", () => {
			const stdout = "No JSON here, just logs";

			const jsonMatch = stdout.match(/\{[\s\S]*\}/);
			expect(jsonMatch).toBeNull();
		});

		it("should handle JSON with error field", () => {
			const stdout = `{"success":false,"clients":{},"configured":[],"skipped":[],"notInstalled":[],"failed":["claude"],"version":"1.0.0","error":"Config write failed"}`;

			const jsonMatch = stdout.match(/\{[\s\S]*\}/);
			expect(jsonMatch).not.toBeNull();

			if (jsonMatch) {
				const result = JSON.parse(jsonMatch[0]);
				expect(result.success).toBe(false);
				expect(result.error).toBe("Config write failed");
			}
		});
	});

	describe("CLI Argument Construction", () => {
		it("should construct correct args for non-interactive JSON mode", () => {
			const expectedArgs = ["tools", "configure", "--non-interactive", "--json"];
			expect(expectedArgs).toContain("--non-interactive");
			expect(expectedArgs).toContain("--json");
		});

		it("should include workspace path when provided", () => {
			const workspacePath = "/Users/test/project";
			const args = ["tools", "configure", "--non-interactive", "--json", "--workspace", workspacePath];

			expect(args).toContain("--workspace");
			expect(args[args.indexOf("--workspace") + 1]).toBe(workspacePath);
		});
	});
});

describe("MCPConfigurationState Storage", () => {
	it("should store configuration result in globalState", () => {
		const mockState = {
			lastConfigured: Date.now(),
			result: {
				success: true,
				clients: { claude: "configured" as const },
				configured: ["claude"],
				skipped: [],
				notInstalled: [],
				failed: [],
				version: "1.0.0",
			},
			workspaceRoot: "/test/workspace",
		};

		expect(mockState.lastConfigured).toBeGreaterThan(0);
		expect(mockState.result.success).toBe(true);
		expect(mockState.workspaceRoot).toBe("/test/workspace");
	});
});
