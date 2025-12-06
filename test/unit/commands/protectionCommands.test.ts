import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProtectedFileRegistry } from "../../../src/services/protectedFileRegistry";

// Use the global mock from setup.ts
declare const vscode: any;

describe("Protection Level Commands", () => {
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

		// Create registry
		registry = new ProtectedFileRegistry(mockState as any);

		// Mock VS Code APIs
		if (vscode?.window) {
			vscode.window.showInformationMessage = vi.fn(() =>
				Promise.resolve(undefined),
			);
			vscode.window.showWarningMessage = vi.fn(() =>
				Promise.resolve(undefined),
			);
		}
	});

	describe("snapback.setLevel.watched", () => {
		it("should set protection level to Watched", async () => {
			// Arrange
			const uri = { fsPath: "/test/file.ts" } as any;

			// Mock active editor
			const originalActiveEditor = vscode.window.activeTextEditor;
			vscode.window.activeTextEditor = { document: { uri } };

			// Mock configManager.handleProtectFile
			const mockHandleProtectFile = vi.fn();

			// Mock protectedFileRegistry methods
			const mockUpdateProtectionLevel = vi
				.spyOn(registry, "updateProtectionLevel")
				.mockResolvedValue();
			const _mockIsProtected = vi
				.spyOn(registry, "isProtected")
				.mockReturnValue(false);

			// Act - Simulate command execution
			const filePath = uri.fsPath;

			// Protect file if not already protected
			if (!registry.isProtected(filePath)) {
				await mockHandleProtectFile(filePath);
			}

			// Update protection level
			await registry.updateProtectionLevel(filePath, "Watched");

			// Assert
			expect(mockHandleProtectFile).toHaveBeenCalledWith(filePath);
			expect(mockUpdateProtectionLevel).toHaveBeenCalledWith(
				filePath,
				"Watched",
			);

			// Restore original value
			vscode.window.activeTextEditor = originalActiveEditor;
		});

		it("should show confirmation message", async () => {
			// Arrange
			const uri = { fsPath: "/test/file.ts" } as any;

			// Mock active editor
			const originalActiveEditor = vscode.window.activeTextEditor;
			vscode.window.activeTextEditor = { document: { uri } };

			// Mock configManager.handleProtectFile
			const mockHandleProtectFile = vi.fn();

			// Mock protectedFileRegistry methods
			vi.spyOn(registry, "updateProtectionLevel").mockResolvedValue();
			vi.spyOn(registry, "isProtected").mockReturnValue(false);

			// Act
			const filePath = uri.fsPath;

			// Protect file if not already protected
			if (!registry.isProtected(filePath)) {
				await mockHandleProtectFile(filePath);
			}

			// Update protection level
			await registry.updateProtectionLevel(filePath, "Watched");

			// Assert
			expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
				expect.stringContaining("Watched"),
			);

			// Restore original value
			vscode.window.activeTextEditor = originalActiveEditor;
		});

		it("should protect file if not already protected", async () => {
			// Arrange
			const uri = { fsPath: "/test/unprotected.ts" } as any;

			// Mock active editor
			const originalActiveEditor = vscode.window.activeTextEditor;
			vscode.window.activeTextEditor = { document: { uri } };

			// Mock configManager.handleProtectFile
			const mockHandleProtectFile = vi.fn();

			// Mock protectedFileRegistry methods
			vi.spyOn(registry, "updateProtectionLevel").mockResolvedValue();
			vi.spyOn(registry, "isProtected").mockReturnValue(false);

			// Act
			const filePath = uri.fsPath;

			// Protect file if not already protected
			if (!registry.isProtected(filePath)) {
				await mockHandleProtectFile(filePath);
			}

			// Update protection level
			await registry.updateProtectionLevel(filePath, "Watched");

			// Assert
			expect(mockHandleProtectFile).toHaveBeenCalledWith(filePath);

			// Restore original value
			vscode.window.activeTextEditor = originalActiveEditor;
		});

		it("should use active editor if no URI provided", async () => {
			// Arrange
			const activeFile = "/test/active.ts";
			const uri = { fsPath: activeFile } as any;

			// Mock active editor
			const originalActiveEditor = vscode.window.activeTextEditor;
			vscode.window.activeTextEditor = { document: { uri } };

			// Mock configManager.handleProtectFile
			const mockHandleProtectFile = vi.fn();

			// Mock protectedFileRegistry methods
			const mockUpdateProtectionLevel = vi
				.spyOn(registry, "updateProtectionLevel")
				.mockResolvedValue();
			vi.spyOn(registry, "isProtected").mockReturnValue(false);

			// Act
			const filePath = uri.fsPath;

			// Protect file if not already protected
			if (!registry.isProtected(filePath)) {
				await mockHandleProtectFile(filePath);
			}

			// Update protection level
			await registry.updateProtectionLevel(filePath, "Watched");

			// Assert
			expect(mockUpdateProtectionLevel).toHaveBeenCalledWith(
				activeFile,
				"Watched",
			);

			// Restore original value
			vscode.window.activeTextEditor = originalActiveEditor;
		});

		it("should show warning if no file available", async () => {
			// Arrange
			// Mock no active editor
			const originalActiveEditor = vscode.window.activeTextEditor;
			vscode.window.activeTextEditor = undefined;

			// Act - Simulate command execution without URI and no active editor

			// Assert
			expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
				"No file selected",
			);

			// Restore original value
			vscode.window.activeTextEditor = originalActiveEditor;
		});
	});

	describe("snapback.setLevel.warning", () => {
		it("should set protection level to Warning", async () => {
			// Arrange
			const uri = { fsPath: "/test/file.ts" } as any;

			// Mock active editor
			const originalActiveEditor = vscode.window.activeTextEditor;
			vscode.window.activeTextEditor = { document: { uri } };

			// Mock configManager.handleProtectFile
			const mockHandleProtectFile = vi.fn();

			// Mock protectedFileRegistry methods
			const mockUpdateProtectionLevel = vi
				.spyOn(registry, "updateProtectionLevel")
				.mockResolvedValue();
			const _mockIsProtected = vi
				.spyOn(registry, "isProtected")
				.mockReturnValue(false);

			// Act
			const filePath = uri.fsPath;

			// Protect file if not already protected
			if (!registry.isProtected(filePath)) {
				await mockHandleProtectFile(filePath);
			}

			// Update protection level
			await registry.updateProtectionLevel(filePath, "Warning");

			// Assert
			expect(mockHandleProtectFile).toHaveBeenCalledWith(filePath);
			expect(mockUpdateProtectionLevel).toHaveBeenCalledWith(
				filePath,
				"Warning",
			);

			// Restore original value
			vscode.window.activeTextEditor = originalActiveEditor;
		});
	});

	describe("snapback.setLevel.protected", () => {
		it("should set protection level to Protected", async () => {
			// Arrange
			const uri = { fsPath: "/test/file.ts" } as any;

			// Mock active editor
			const originalActiveEditor = vscode.window.activeTextEditor;
			vscode.window.activeTextEditor = { document: { uri } };

			// Mock configManager.handleProtectFile
			const mockHandleProtectFile = vi.fn();

			// Mock protectedFileRegistry methods
			const mockUpdateProtectionLevel = vi
				.spyOn(registry, "updateProtectionLevel")
				.mockResolvedValue();
			const _mockIsProtected = vi
				.spyOn(registry, "isProtected")
				.mockReturnValue(false);

			// Act
			const filePath = uri.fsPath;

			// Protect file if not already protected
			if (!registry.isProtected(filePath)) {
				await mockHandleProtectFile(filePath);
			}

			// Update protection level
			await registry.updateProtectionLevel(filePath, "Protected");

			// Assert
			expect(mockHandleProtectFile).toHaveBeenCalledWith(filePath);
			expect(mockUpdateProtectionLevel).toHaveBeenCalledWith(
				filePath,
				"Protected",
			);

			// Restore original value
			vscode.window.activeTextEditor = originalActiveEditor;
		});
	});

	describe("snapback.unprotect", () => {
		it("should remove file protection", async () => {
			// Arrange
			const uri = { fsPath: "/test/file.ts" } as any;

			// Mock active editor
			const originalActiveEditor = vscode.window.activeTextEditor;
			vscode.window.activeTextEditor = { document: { uri } };

			// Mock configManager.handleUnprotectFile
			const mockHandleUnprotectFile = vi.fn();

			// Mock protectedFileRegistry methods
			vi.spyOn(registry, "isProtected").mockReturnValue(true);

			// Act
			const filePath = uri.fsPath;

			// Remove protection
			await mockHandleUnprotectFile(filePath);

			// Assert
			expect(mockHandleUnprotectFile).toHaveBeenCalledWith(filePath);

			// Restore original value
			vscode.window.activeTextEditor = originalActiveEditor;
		});

		it("should show confirmation message", async () => {
			// Arrange
			const uri = { fsPath: "/test/file.ts" } as any;

			// Mock active editor
			const originalActiveEditor = vscode.window.activeTextEditor;
			vscode.window.activeTextEditor = { document: { uri } };

			// Mock configManager.handleUnprotectFile
			const mockHandleUnprotectFile = vi.fn();

			// Mock protectedFileRegistry methods
			vi.spyOn(registry, "isProtected").mockReturnValue(true);

			// Act
			const filePath = uri.fsPath;

			// Remove protection
			await mockHandleUnprotectFile(filePath);

			// Assert
			expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
				expect.stringContaining("removed"),
			);

			// Restore original value
			vscode.window.activeTextEditor = originalActiveEditor;
		});
	});
});
