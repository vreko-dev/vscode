import { beforeEach, describe, expect, it, vi } from "vitest";
import { ContextManager } from "../../src/contextManager";
import { ProtectedFileRegistry } from "../../src/services/protectedFileRegistry";
import type { ProtectionLevel } from "../../src/views/types";

// Use the global mock from setup.ts
declare const vscode: any;

describe("ContextManager", () => {
	let contextManager: ContextManager;
	let registry: ProtectedFileRegistry;
	let mockStorage: Map<string, any>;

	beforeEach(() => {
		// Reset mocks
		vi.clearAllMocks();

		// Create mock storage
		mockStorage = new Map();
		const mockState = {
			get: vi.fn().mockImplementation((key, defaultValue) => {
				return mockStorage.get(key) ?? defaultValue;
			}),
			update: vi.fn().mockImplementation((key, value) => {
				mockStorage.set(key, value);
				return Promise.resolve();
			}),
		};

		// Create registry and context manager
		registry = new ProtectedFileRegistry(mockState as any);
		contextManager = new ContextManager(registry);

		// Mock the executeCommand function
		if (vscode?.commands) {
			vscode.commands.executeCommand = vi.fn().mockResolvedValue(undefined);
		}
	});

	it("should update context for unprotected file", async () => {
		const testFile = "/test/workspace/test.ts";

		// File is not protected
		const isProtected = registry.isProtected(testFile);
		expect(isProtected).toBe(false);

		// Update context for file
		await contextManager.updateContextForFile(testFile);

		// Should set context variables
		expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
			"setContext",
			"snapback.isProtected",
			false,
		);
		expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
			"setContext",
			"snapback.currentLevel",
			undefined,
		);
		expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
			"setContext",
			"snapback.canProtect",
			true,
		);
	});

	it("should update context for protected file", async () => {
		const testFile = "/test/workspace/test.ts";

		// Add file with specific protection level
		await registry.add(testFile, { protectionLevel: "Protected" });

		// File should now be protected
		const isProtected = registry.isProtected(testFile);
		expect(isProtected).toBe(true);

		// Should get correct protection level
		const level = registry.getProtectionLevel(testFile);
		expect(level).toBe("Protected");

		// Update context for file
		await contextManager.updateContextForFile(testFile);

		// Should set context variables
		expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
			"setContext",
			"snapback.isProtected",
			true,
		);
		expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
			"setContext",
			"snapback.currentLevel",
			"Protected",
		);
		expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
			"setContext",
			"snapback.canProtect",
			true,
		);
	});

	it("should handle all protection levels", async () => {
		const testFiles = [
			{
				path: "/test/workspace/watched.ts",
				level: "Watched" as ProtectionLevel,
			},
			{
				path: "/test/workspace/warning.ts",
				level: "Warning" as ProtectionLevel,
			},
			{
				path: "/test/workspace/protected.ts",
				level: "Protected" as ProtectionLevel,
			},
		];

		// Add all files with their respective levels
		for (const { path, level } of testFiles) {
			await registry.add(path, { protectionLevel: level });
		}

		// Verify context is updated correctly for each level
		for (const { path, level } of testFiles) {
			(vscode.commands.executeCommand as any).mockClear();

			await contextManager.updateContextForFile(path);

			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"setContext",
				"snapback.isProtected",
				true,
			);
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"setContext",
				"snapback.currentLevel",
				level,
			);
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"setContext",
				"snapback.canProtect",
				true,
			);
		}
	});

	it("should clear context when no active editor", async () => {
		// Mock no active editor
		const originalActiveEditor = vscode.window.activeTextEditor;
		vscode.window.activeTextEditor = undefined;

		await contextManager.updateContextForActiveFile();

		// Should clear context variables
		expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
			"setContext",
			"snapback.isProtected",
			false,
		);
		expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
			"setContext",
			"snapback.currentLevel",
			undefined,
		);
		expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
			"setContext",
			"snapback.canProtect",
			false,
		);

		// Restore original value
		vscode.window.activeTextEditor = originalActiveEditor;
	});
});
