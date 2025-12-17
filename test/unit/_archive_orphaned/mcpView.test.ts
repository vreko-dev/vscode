import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { MCPStatusBar, MCPToolsView } from "../../src/mcpView";

// IMPORTANT: DO NOT re-mock vscode here!
// The global setup.ts provides a complete vscode mock.
// Use vi.mocked() to override specific methods if needed.

// Mock status bar item factory
let mockStatusBarItem: any;

// Mock MCP Client Manager
const mockMCPClientManager = {
	listAllTools: vi.fn(),
};

describe("MCPView", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockStatusBarItem = null;
	});

	afterEach(() => {
		vi.resetAllMocks();
	});

	describe("MCPToolsView", () => {
		it("should create tree view items for connected servers", async () => {
			// Mock the MCP client manager to return some servers
			mockMCPClientManager.listAllTools.mockReturnValue([
				{
					server: "context7",
					tools: [
						{
							name: "search_docs",
							description: "Search documentation",
						},
						{ name: "analyze_code", description: "Analyze code" },
					],
				},
				{
					server: "github",
					tools: [
						{
							name: "search_issues",
							description: "Search GitHub issues",
						},
					],
				},
			]);

			const mcpToolsView = new MCPToolsView(mockMCPClientManager as any);

			// Get root level items (servers)
			const rootItems = await mcpToolsView.getChildren();

			expect(rootItems).toHaveLength(2);
			expect(rootItems[0].label).toBe("context7");
			expect(rootItems[0].type).toBe("server");
			expect(rootItems[1].label).toBe("github");
			expect(rootItems[1].type).toBe("server");
		});

		it("should create tree view items for tools when expanding a server", async () => {
			// Mock the MCP client manager
			mockMCPClientManager.listAllTools.mockReturnValue([]);

			const mcpToolsView = new MCPToolsView(mockMCPClientManager as any);

			// Create a mock server item
			const serverItem = {
				label: "context7",
				type: "server" as const,
				serverTools: {
					server: "context7",
					tools: [
						{
							name: "search_docs",
							description: "Search documentation",
						},
						{ name: "analyze_code", description: "Analyze code" },
					],
				},
				collapsibleState: 1, // Collapsed
			};

			// Get tools for this server
			const toolItems = await mcpToolsView.getChildren(serverItem as any);

			expect(toolItems).toHaveLength(2);
			expect(toolItems[0].label).toBe("search_docs");
			expect(toolItems[0].type).toBe("tool");
			expect(toolItems[1].label).toBe("analyze_code");
			expect(toolItems[1].type).toBe("tool");
		});

		it("should return empty array for tool items when getting children", async () => {
			// Mock the MCP client manager
			mockMCPClientManager.listAllTools.mockReturnValue([]);

			const mcpToolsView = new MCPToolsView(mockMCPClientManager as any);

			// Create a mock tool item
			const toolItem = {
				label: "search_docs",
				type: "tool" as const,
				collapsibleState: 0, // None
			};

			// Get children of a tool item (should be empty)
			const children = await mcpToolsView.getChildren(toolItem as any);

			expect(children).toHaveLength(0);
		});
	});

	describe("MCPStatusBar", () => {
		it("should create status bar item with correct initial state", () => {
			const _statusBar = new MCPStatusBar();

			expect(vscode.window.createStatusBarItem).toHaveBeenCalledWith(
				vscode.StatusBarAlignment.Right,
				100,
			);
			expect(mockStatusBarItem.command).toBe("snapback.showMCPStatus");
		});

		it("should update status bar for connected state", () => {
			const statusBar = new MCPStatusBar();

			statusBar.updateStatusBar("connected", 2);

			expect(mockStatusBarItem.text).toBe("$(plug) MCP: Connected");
			expect(mockStatusBarItem.tooltip).toBe(
				"MCP: Connected (2 active operations)",
			);
			expect(mockStatusBarItem.color).toBe("statusBar.foreground");
			expect(mockStatusBarItem.show).toHaveBeenCalled();
		});

		it("should update status bar for disconnected state", () => {
			const statusBar = new MCPStatusBar();

			statusBar.updateStatusBar("disconnected", 0);

			expect(mockStatusBarItem.text).toBe("$(plug) MCP: Disconnected");
			expect(mockStatusBarItem.tooltip).toBe("MCP: Disconnected");
			expect(mockStatusBarItem.color).toBe("statusBarItem.warningForeground");
			expect(mockStatusBarItem.show).toHaveBeenCalled();
		});

		it("should update status bar for error state", () => {
			const statusBar = new MCPStatusBar();

			statusBar.updateStatusBar("error", 0);

			expect(mockStatusBarItem.text).toBe("$(plug) MCP: Error");
			expect(mockStatusBarItem.tooltip).toBe("MCP: Error - Click for details");
			expect(mockStatusBarItem.color).toBe("statusBarItem.errorForeground");
			expect(mockStatusBarItem.show).toHaveBeenCalled();
		});

		it("should dispose status bar item", () => {
			const statusBar = new MCPStatusBar();

			statusBar.dispose();

			expect(mockStatusBarItem.dispose).toHaveBeenCalled();
		});
	});
});
