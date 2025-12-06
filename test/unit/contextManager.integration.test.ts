import { beforeEach, describe, expect, it, vi } from "vitest";
import { ContextManager } from "../../src/contextManager";
import { ProtectedFileRegistry } from "../../src/services/protectedFileRegistry";

// Use the global mock from setup.ts
declare const vscode: any;

describe("ContextManager Integration", () => {
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

	describe("Context Variable Updates", () => {
		it("should set snapback.isProtected to false for unprotected file", async () => {
			const unprotectedFile = "/test/file.ts";

			// Act
			await contextManager.updateContextForFile(unprotectedFile);

			// Should set context variables
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"setContext",
				"snapback.isProtected",
				false,
			);
		});

		it("should set snapback.isProtected to true for protected file", async () => {
			const protectedFile = "/test/file.ts";
			await registry.add(protectedFile, { protectionLevel: "Watched" });

			// Act
			await contextManager.updateContextForFile(protectedFile);

			// Should set context variables
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"setContext",
				"snapback.isProtected",
				true,
			);
		});

		it("should set snapback.currentLevel to protection level", async () => {
			const protectedFile = "/test/file.ts";
			await registry.add(protectedFile, { protectionLevel: "Warning" });

			// Act
			await contextManager.updateContextForFile(protectedFile);

			// Should set context variables
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"setContext",
				"snapback.currentLevel",
				"Warning",
			);
		});

		it("should set snapback.canProtect to true for saved files", async () => {
			const savedFile = "/test/file.ts";

			// Act
			await contextManager.updateContextForFile(savedFile);

			// Should set context variables
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"setContext",
				"snapback.canProtect",
				true,
			);
		});

		it("should set snapback.canProtect to false for untitled files", async () => {
			const untitledFile = "untitled:Untitled-1";

			// Act
			await contextManager.updateContextForFile(untitledFile);

			// Should set context variables
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"setContext",
				"snapback.canProtect",
				false,
			);
		});
	});

	describe("Active Editor Tracking", () => {
		it("should update context when active editor changes", async () => {
			// Mock active editor
			const originalActiveEditor = vscode.window.activeTextEditor;
			vscode.window.activeTextEditor = {
				document: { uri: { fsPath: "/test/file.ts" } },
			};

			// Act
			await contextManager.updateContextForActiveFile();

			// Should set context variables
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"setContext",
				expect.any(String),
				expect.anything(),
			);

			// Restore original value
			vscode.window.activeTextEditor = originalActiveEditor;
		});
	});

	describe("Protection State Changes", () => {
		it("should update context when file protection changes", async () => {
			const file = "/test/file.ts";

			// Act
			await registry.add(file, { protectionLevel: "Watched" });
			await contextManager.updateContextForFile(file);

			// Should set context variables
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"setContext",
				"snapback.isProtected",
				true,
			);
		});
	});
});
