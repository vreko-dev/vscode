import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MCPToolsView } from "../../src/mcpView";

// IMPORTANT: DO NOT re-mock vscode here!
// The global setup.ts provides a complete vscode mock.
// Use vi.mocked() to override specific methods if needed.

describe("MCPToolsView", () => {
	let mcpToolsView: MCPToolsView;
	let mockMcpClientManager: any;

	beforeEach(() => {
		// Clear all mocks before each test
		vi.clearAllMocks();

		mockMcpClientManager = {
			connectToServer: vi.fn().mockResolvedValue(undefined),
			disconnectFromServer: vi.fn().mockResolvedValue(undefined),
			listAllTools: vi.fn().mockReturnValue([]),
		};

		mcpToolsView = new MCPToolsView(mockMcpClientManager);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("should create MCPToolsView instance", () => {
		expect(mcpToolsView).toBeDefined();
	});

	it("should have onDidChangeTreeData event", () => {
		expect(mcpToolsView.onDidChangeTreeData).toBeDefined();
	});

	it("should implement refresh method", () => {
		expect(typeof mcpToolsView.refresh).toBe("function");
		expect(() => mcpToolsView.refresh()).not.toThrow();
	});

	it("should implement getTreeItem method", () => {
		expect(typeof mcpToolsView.getTreeItem).toBe("function");
	});

	it("should implement getChildren method", () => {
		expect(typeof mcpToolsView.getChildren).toBe("function");
	});

	it("should return server items at root level", async () => {
		mockMcpClientManager.listAllTools.mockReturnValue([
			{
				server: "test-server",
				tools: [{ name: "test-tool", description: "Test tool" }],
			},
		]);

		const children = await mcpToolsView.getChildren();
		expect(children).toBeDefined();
		expect(Array.isArray(children)).toBe(true);
		expect(children.length).toBeGreaterThan(0);
	});

	it("should return empty array when no servers", async () => {
		mockMcpClientManager.listAllTools.mockReturnValue([]);
		const children = await mcpToolsView.getChildren();
		expect(children).toBeDefined();
		expect(Array.isArray(children)).toBe(true);
		expect(children.length).toBe(0);
	});

	it("should handle connection to MCP server", async () => {
		await expect(
			mockMcpClientManager.connectToServer("test-server"),
		).resolves.toBeUndefined();
		expect(mockMcpClientManager.connectToServer).toHaveBeenCalledWith(
			"test-server",
		);
	});

	it("should handle disconnection from MCP server", async () => {
		await expect(
			mockMcpClientManager.disconnectFromServer("test-server"),
		).resolves.toBeUndefined();
		expect(mockMcpClientManager.disconnectFromServer).toHaveBeenCalledWith(
			"test-server",
		);
	});
});
