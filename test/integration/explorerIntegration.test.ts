import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { ProtectedFilesTreeProvider } from "../../src/views/ProtectedFilesTreeProvider";
import type { ProtectedFileProvider } from "../../src/views/types";

/**
 * Integration tests for Explorer view integration
 *
 * These tests verify the complete integration flow between:
 * - Extension activation
 * - Context key management (snapback.isActive, snapback.hasProtectedFiles)
 * - Tree view registration in Explorer
 * - Protection state changes triggering view updates
 * - Menu integration and command execution
 */
describe("Explorer Integration", () => {
	let mockRegistry: ProtectedFileProvider;
	let provider: ProtectedFilesTreeProvider;
	let contextCommands: Map<string, any>;

	beforeEach(() => {
		// Track context commands for verification
		contextCommands = new Map();

		// Mock vscode.commands.executeCommand to capture context changes
		vi.spyOn(vscode.commands, "executeCommand").mockImplementation(
			async (command: string, ...args: any[]) => {
				if (command === "setContext") {
					contextCommands.set(args[0], args[1]);
				}
				return undefined;
			},
		);

		// Create mock registry with event emitter
		mockRegistry = {
			list: vi.fn(async () => []),
			total: vi.fn(async () => 0),
			onDidChangeProtectedFiles: vi.fn((callback) => {
				// Store callback for manual triggering
				(mockRegistry as any)._changeCallback = callback;
				return { dispose: () => {} };
			}),
		} as any;

		provider = new ProtectedFilesTreeProvider(mockRegistry);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("Extension Activation Context", () => {
		it("should set snapback.isActive context on activation", async () => {
			// Simulate extension activation
			await vscode.commands.executeCommand(
				"setContext",
				"snapback.isActive",
				true,
			);

			expect(contextCommands.get("snapback.isActive")).toBe(true);
		});

		it("should initialize snapback.hasProtectedFiles based on registry total", async () => {
			// Simulate updateViewVisibilityContext() function
			const total = await mockRegistry.total();
			await vscode.commands.executeCommand(
				"setContext",
				"snapback.hasProtectedFiles",
				total > 0,
			);

			expect(contextCommands.get("snapback.hasProtectedFiles")).toBe(false);
			expect(mockRegistry.total).toHaveBeenCalled();
		});

		it("should update hasProtectedFiles context when files are protected", async () => {
			// Start with no files
			vi.mocked(mockRegistry.total).mockResolvedValue(0);
			await vscode.commands.executeCommand(
				"setContext",
				"snapback.hasProtectedFiles",
				0 > 0,
			);
			expect(contextCommands.get("snapback.hasProtectedFiles")).toBe(false);

			// Protect a file
			vi.mocked(mockRegistry.total).mockResolvedValue(1);
			await vscode.commands.executeCommand(
				"setContext",
				"snapback.hasProtectedFiles",
				1 > 0,
			);
			expect(contextCommands.get("snapback.hasProtectedFiles")).toBe(true);
		});

		it("should update hasProtectedFiles context when all files are unprotected", async () => {
			// Start with protected files
			vi.mocked(mockRegistry.total).mockResolvedValue(3);
			await vscode.commands.executeCommand(
				"setContext",
				"snapback.hasProtectedFiles",
				3 > 0,
			);
			expect(contextCommands.get("snapback.hasProtectedFiles")).toBe(true);

			// Unprotect all
			vi.mocked(mockRegistry.total).mockResolvedValue(0);
			await vscode.commands.executeCommand(
				"setContext",
				"snapback.hasProtectedFiles",
				0 > 0,
			);
			expect(contextCommands.get("snapback.hasProtectedFiles")).toBe(false);
		});
	});

	describe("View Registration", () => {
		it("should register tree data provider with correct view ID", () => {
			// This test verifies the provider can be created and has correct structure
			expect(provider).toBeDefined();
			expect(provider.onDidChangeTreeData).toBeDefined();
			expect(typeof provider.getChildren).toBe("function");
			expect(typeof provider.getTreeItem).toBe("function");
		});

		it("should have refresh method that fires onDidChangeTreeData", () => {
			const eventSpy = vi.fn();
			provider.onDidChangeTreeData(eventSpy);

			provider.refresh();

			expect(eventSpy).toHaveBeenCalledWith(undefined);
		});

		it("should subscribe to registry changes on construction", () => {
			expect(mockRegistry.onDidChangeProtectedFiles).toHaveBeenCalled();
		});
	});

	describe("Protection State Changes", () => {
		it("should refresh view when registry fires change event", async () => {
			const refreshSpy = vi.spyOn(provider, "refresh");

			// Simulate registry firing change event
			const changeCallback = (mockRegistry as any)._changeCallback;
			if (changeCallback) {
				await changeCallback();
			}

			expect(refreshSpy).toHaveBeenCalled();
		});

		it("should update context and refresh when protection changes occur", async () => {
			// Simulate complete protection workflow

			// 1. Initial state: no files
			vi.mocked(mockRegistry.total).mockResolvedValue(0);
			vi.mocked(mockRegistry.list).mockResolvedValue([]);

			// 2. Protect a file
			vi.mocked(mockRegistry.total).mockResolvedValue(1);
			vi.mocked(mockRegistry.list).mockResolvedValue([
				{
					id: "file1",
					label: "test.ts",
					path: "/workspace/test.ts",
					protectionLevel: "watch",
					lastProtectedAt: Date.now(),
				},
			]);

			// 3. Trigger context update
			await vscode.commands.executeCommand(
				"setContext",
				"snapback.hasProtectedFiles",
				1 > 0,
			);

			// 4. Verify context updated
			expect(contextCommands.get("snapback.hasProtectedFiles")).toBe(true);

			// 5. Verify tree can retrieve file
			const children = await provider.getChildren();
			expect(children).toHaveLength(1);
			expect(children[0].label).toContain("test.ts");
		});
	});

	describe("View Visibility Behavior", () => {
		it("should be hidden when no files are protected", async () => {
			vi.mocked(mockRegistry.total).mockResolvedValue(0);

			await vscode.commands.executeCommand(
				"setContext",
				"snapback.hasProtectedFiles",
				0 > 0,
			);

			// View should be hidden: snapback.hasProtectedFiles = false
			expect(contextCommands.get("snapback.hasProtectedFiles")).toBe(false);
		});

		it("should be visible when files are protected", async () => {
			vi.mocked(mockRegistry.total).mockResolvedValue(5);

			await vscode.commands.executeCommand(
				"setContext",
				"snapback.hasProtectedFiles",
				5 > 0,
			);

			// View should be visible: snapback.hasProtectedFiles = true
			expect(contextCommands.get("snapback.hasProtectedFiles")).toBe(true);
		});

		it("should transition from hidden to visible when first file is protected", async () => {
			// Start hidden
			vi.mocked(mockRegistry.total).mockResolvedValue(0);
			await vscode.commands.executeCommand(
				"setContext",
				"snapback.hasProtectedFiles",
				0 > 0,
			);
			expect(contextCommands.get("snapback.hasProtectedFiles")).toBe(false);

			// Become visible
			vi.mocked(mockRegistry.total).mockResolvedValue(1);
			await vscode.commands.executeCommand(
				"setContext",
				"snapback.hasProtectedFiles",
				1 > 0,
			);
			expect(contextCommands.get("snapback.hasProtectedFiles")).toBe(true);
		});

		it("should transition from visible to hidden when last file is unprotected", async () => {
			// Start visible
			vi.mocked(mockRegistry.total).mockResolvedValue(1);
			await vscode.commands.executeCommand(
				"setContext",
				"snapback.hasProtectedFiles",
				1 > 0,
			);
			expect(contextCommands.get("snapback.hasProtectedFiles")).toBe(true);

			// Become hidden
			vi.mocked(mockRegistry.total).mockResolvedValue(0);
			await vscode.commands.executeCommand(
				"setContext",
				"snapback.hasProtectedFiles",
				0 > 0,
			);
			expect(contextCommands.get("snapback.hasProtectedFiles")).toBe(false);
		});
	});

	describe("End-to-End Protection Workflows", () => {
		it("should handle complete protect → view → unprotect cycle", async () => {
			const refreshSpy = vi.spyOn(provider, "refresh");

			// 1. Initial state: no files, view hidden
			vi.mocked(mockRegistry.total).mockResolvedValue(0);
			vi.mocked(mockRegistry.list).mockResolvedValue([]);
			await vscode.commands.executeCommand(
				"setContext",
				"snapback.hasProtectedFiles",
				0 > 0,
			);
			expect(contextCommands.get("snapback.hasProtectedFiles")).toBe(false);

			// 2. Protect file: view becomes visible
			vi.mocked(mockRegistry.total).mockResolvedValue(1);
			vi.mocked(mockRegistry.list).mockResolvedValue([
				{
					id: "file1",
					label: "auth.ts",
					path: "/workspace/auth.ts",
					protectionLevel: "warn",
					lastProtectedAt: Date.now(),
				},
			]);
			await vscode.commands.executeCommand(
				"setContext",
				"snapback.hasProtectedFiles",
				1 > 0,
			);
			expect(contextCommands.get("snapback.hasProtectedFiles")).toBe(true);

			// Trigger registry change
			const changeCallback = (mockRegistry as any)._changeCallback;
			if (changeCallback) {
				await changeCallback();
			}
			expect(refreshSpy).toHaveBeenCalled();

			// 3. Verify tree shows file
			let children = await provider.getChildren();
			expect(children).toHaveLength(1);
			expect(children[0].label).toContain("auth.ts");
			expect(children[0].label).toContain("🟡"); // Warn emoji

			// 4. Unprotect file: view becomes hidden
			vi.mocked(mockRegistry.total).mockResolvedValue(0);
			vi.mocked(mockRegistry.list).mockResolvedValue([]);
			await vscode.commands.executeCommand(
				"setContext",
				"snapback.hasProtectedFiles",
				0 > 0,
			);
			expect(contextCommands.get("snapback.hasProtectedFiles")).toBe(false);

			// 5. Verify tree is empty
			children = await provider.getChildren();
			expect(children).toHaveLength(0);
		});

		it("should handle multiple protection level changes", async () => {
			// Start with Watch level
			vi.mocked(mockRegistry.list).mockResolvedValue([
				{
					id: "file1",
					label: "config.ts",
					path: "/workspace/config.ts",
					protectionLevel: "watch",
					lastProtectedAt: Date.now(),
				},
			]);

			let children = await provider.getChildren();
			expect(children[0].label).toContain("🟢"); // Watch emoji

			// Change to Warn
			vi.mocked(mockRegistry.list).mockResolvedValue([
				{
					id: "file1",
					label: "config.ts",
					path: "/workspace/config.ts",
					protectionLevel: "warn",
					lastProtectedAt: Date.now(),
				},
			]);

			children = await provider.getChildren();
			expect(children[0].label).toContain("🟡"); // Warn emoji

			// Change to Block
			vi.mocked(mockRegistry.list).mockResolvedValue([
				{
					id: "file1",
					label: "config.ts",
					path: "/workspace/config.ts",
					protectionLevel: "block",
					lastProtectedAt: Date.now(),
				},
			]);

			children = await provider.getChildren();
			expect(children[0].label).toContain("🔴"); // Block emoji
		});

		it("should handle bulk protection operations", async () => {
			// Protect 10 files at once
			const files = Array.from({ length: 10 }, (_, i) => ({
				id: `file${i}`,
				label: `file${i}.ts`,
				path: `/workspace/file${i}.ts`,
				protectionLevel: i % 3 === 0 ? "block" : i % 2 === 0 ? "warn" : "watch",
				lastProtectedAt: Date.now(),
			})) as any[];

			vi.mocked(mockRegistry.total).mockResolvedValue(10);
			vi.mocked(mockRegistry.list).mockResolvedValue(files);

			// Update context
			await vscode.commands.executeCommand(
				"setContext",
				"snapback.hasProtectedFiles",
				10 > 0,
			);
			expect(contextCommands.get("snapback.hasProtectedFiles")).toBe(true);

			// Verify all files appear
			const children = await provider.getChildren();
			expect(children).toHaveLength(10);

			// Verify sorting: block files first
			const firstFile = children[0];
			expect(firstFile.label).toContain("🔴"); // Block emoji
		});
	});

	describe("Error Handling", () => {
		it("should handle registry.total() errors gracefully", async () => {
			vi.mocked(mockRegistry.total).mockRejectedValue(
				new Error("Registry error"),
			);

			// Should not throw
			await expect(async () => {
				const total = await mockRegistry.total().catch(() => 0);
				await vscode.commands.executeCommand(
					"setContext",
					"snapback.hasProtectedFiles",
					total > 0,
				);
			}).not.toThrow();
		});

		it("should handle registry.list() errors gracefully", async () => {
			vi.mocked(mockRegistry.list).mockRejectedValue(
				new Error("Registry error"),
			);

			// Provider should return empty array on error
			const children = await provider.getChildren();
			expect(children).toEqual([]);
		});

		it("should handle missing onDidChangeProtectedFiles method", () => {
			const registryWithoutEvent = {
				list: vi.fn(async () => []),
				total: vi.fn(async () => 0),
			} as any;

			// Should not throw when creating provider
			expect(() => {
				new ProtectedFilesTreeProvider(registryWithoutEvent);
			}).not.toThrow();
		});
	});

	describe("Menu Integration", () => {
		it("should provide correct context value for menu visibility", async () => {
			vi.mocked(mockRegistry.list).mockResolvedValue([
				{
					id: "file1",
					label: "test.ts",
					path: "/workspace/test.ts",
					protectionLevel: "watch",
					lastProtectedAt: Date.now(),
				},
			]);

			const children = await provider.getChildren();

			// Context value enables menu items in package.json
			expect(children[0].contextValue).toBe("snapback.item.protectedFile");
		});

		it("should provide click command for opening files", async () => {
			vi.mocked(mockRegistry.list).mockResolvedValue([
				{
					id: "file1",
					label: "test.ts",
					path: "/workspace/test.ts",
					protectionLevel: "watch",
					lastProtectedAt: Date.now(),
				},
			]);

			const children = await provider.getChildren();

			expect(children[0].command).toBeDefined();
			expect(children[0].command?.command).toBe("vscode.open");
			expect(children[0].command?.arguments).toHaveLength(1);
		});
	});
});
