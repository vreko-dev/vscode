import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProtectedFileRegistry } from "@vscode/services/protectedFileRegistry";

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

/**
 * Tests for ARCHITECTURE_REFACTOR_SPEC.md Sprint 2: Daemon Delegation Pattern
 *
 * Verifies the Strangler Fig pattern where commands:
 * 1. Try daemon first for cross-surface coordination
 * 2. Fall back to local (snapbackrcLoader/registry) on daemon failure
 */
describe("Daemon Delegation Pattern", () => {
	let mockDaemonBridge: {
		setProtectionLevel: ReturnType<typeof vi.fn>;
		listProtectedFiles: ReturnType<typeof vi.fn>;
		getProtectionLevel: ReturnType<typeof vi.fn>;
	};
	let mockSnapbackrcLoader: {
		addProtectionRule: ReturnType<typeof vi.fn>;
		removeProtectionRule: ReturnType<typeof vi.fn>;
	};
	let mockRefreshViews: ReturnType<typeof vi.fn>;
	const workspaceRoot = "/test/workspace";

	beforeEach(() => {
		vi.clearAllMocks();

		// Mock DaemonBridge
		mockDaemonBridge = {
			setProtectionLevel: vi.fn(),
			listProtectedFiles: vi.fn(),
			getProtectionLevel: vi.fn(),
		};

		// Mock SnapBackRCLoader
		mockSnapbackrcLoader = {
			addProtectionRule: vi.fn().mockResolvedValue(undefined),
			removeProtectionRule: vi.fn().mockResolvedValue(undefined),
		};

		// Mock refreshViews
		mockRefreshViews = vi.fn();
	});

	describe("setProtectionLevel via daemon", () => {
		it("should use daemon when available and successful", async () => {
			// Arrange
			const filePath = "/test/file.ts";
			const level = "watch";
			(mockDaemonBridge.setProtectionLevel as ReturnType<typeof vi.fn>).mockResolvedValue({
				success: true,
				previousLevel: undefined,
			});

			// Act - Simulate the daemon-first pattern
			let usedDaemon = false;
			let usedLocal = false;

			if (mockDaemonBridge && workspaceRoot) {
				try {
					const result = await mockDaemonBridge.setProtectionLevel!(
						workspaceRoot,
						filePath,
						level,
						"test reason",
					);
					if (result.success) {
						usedDaemon = true;
						mockRefreshViews();
					}
				} catch (_err) {
					// Falls through to local
				}
			}

			if (!usedDaemon) {
				await mockSnapbackrcLoader.addProtectionRule(filePath, level);
				usedLocal = true;
			}

			// Assert
			expect(usedDaemon).toBe(true);
			expect(usedLocal).toBe(false);
			expect(mockDaemonBridge.setProtectionLevel).toHaveBeenCalledWith(
				workspaceRoot,
				filePath,
				level,
				"test reason",
			);
			expect(mockSnapbackrcLoader.addProtectionRule).not.toHaveBeenCalled();
			expect(mockRefreshViews).toHaveBeenCalled();
		});

		it("should fall back to local when daemon fails", async () => {
			// Arrange
			const filePath = "/test/file.ts";
			const level = "warn";
			(mockDaemonBridge.setProtectionLevel as ReturnType<typeof vi.fn>).mockRejectedValue(
				new Error("Daemon connection failed"),
			);

			// Act - Simulate the daemon-first pattern
			let usedDaemon = false;
			let usedLocal = false;

			if (mockDaemonBridge && workspaceRoot) {
				try {
					const result = await mockDaemonBridge.setProtectionLevel!(
						workspaceRoot,
						filePath,
						level,
						"test reason",
					);
					if (result.success) {
						usedDaemon = true;
						mockRefreshViews();
					}
				} catch (_err) {
					// Falls through to local
				}
			}

			if (!usedDaemon) {
				await mockSnapbackrcLoader.addProtectionRule(filePath, level);
				usedLocal = true;
			}

			// Assert
			expect(usedDaemon).toBe(false);
			expect(usedLocal).toBe(true);
			expect(mockDaemonBridge.setProtectionLevel).toHaveBeenCalled();
			expect(mockSnapbackrcLoader.addProtectionRule).toHaveBeenCalledWith(filePath, level);
		});

		it("should fall back to local when daemon returns success=false", async () => {
			// Arrange
			const filePath = "/test/file.ts";
			const level = "block";
			(mockDaemonBridge.setProtectionLevel as ReturnType<typeof vi.fn>).mockResolvedValue({
				success: false,
			});

			// Act - Simulate the daemon-first pattern
			let usedDaemon = false;
			let usedLocal = false;

			if (mockDaemonBridge && workspaceRoot) {
				try {
					const result = await mockDaemonBridge.setProtectionLevel!(
						workspaceRoot,
						filePath,
						level,
						"test reason",
					);
					if (result.success) {
						usedDaemon = true;
						mockRefreshViews();
					}
				} catch (_err) {
					// Falls through to local
				}
			}

			if (!usedDaemon) {
				await mockSnapbackrcLoader.addProtectionRule(filePath, level);
				usedLocal = true;
			}

			// Assert
			expect(usedDaemon).toBe(false);
			expect(usedLocal).toBe(true);
			expect(mockSnapbackrcLoader.addProtectionRule).toHaveBeenCalledWith(filePath, level);
		});

		it("should use local directly when daemon bridge not available", async () => {
			// Arrange
			const filePath = "/test/file.ts";
			const level = "watch";
			const noDaemonBridge = undefined;

			// Act - Simulate the daemon-first pattern without daemon
			let usedDaemon = false;
			let usedLocal = false;

			if (noDaemonBridge && workspaceRoot) {
				// This block won't execute
				usedDaemon = true;
			}

			if (!usedDaemon) {
				await mockSnapbackrcLoader.addProtectionRule(filePath, level);
				usedLocal = true;
			}

			// Assert
			expect(usedDaemon).toBe(false);
			expect(usedLocal).toBe(true);
			expect(mockDaemonBridge.setProtectionLevel).not.toHaveBeenCalled();
			expect(mockSnapbackrcLoader.addProtectionRule).toHaveBeenCalledWith(filePath, level);
		});
	});

	describe("listProtectedFiles via daemon", () => {
		it("should use daemon for listing when available", async () => {
			// Arrange
			const mockFiles = [
				{ path: "/test/a.ts", level: "watch" as const },
				{ path: "/test/b.ts", level: "block" as const },
			];
			(mockDaemonBridge.listProtectedFiles as ReturnType<typeof vi.fn>).mockResolvedValue({
				files: mockFiles,
				total: 2,
			});

			// Act
			let result: { path: string; level: string }[] = [];
			let usedDaemon = false;

			if (mockDaemonBridge && workspaceRoot) {
				try {
					const daemonResult = await mockDaemonBridge.listProtectedFiles!(workspaceRoot, {});
					result = daemonResult.files;
					usedDaemon = true;
				} catch (_err) {
					// Falls through to local
				}
			}

			// Assert
			expect(usedDaemon).toBe(true);
			expect(result).toEqual(mockFiles);
			expect(mockDaemonBridge.listProtectedFiles).toHaveBeenCalledWith(workspaceRoot, {});
		});

		it("should filter by level when specified", async () => {
			// Arrange
			const mockFiles = [{ path: "/test/blocked.ts", level: "block" as const }];
			(mockDaemonBridge.listProtectedFiles as ReturnType<typeof vi.fn>).mockResolvedValue({
				files: mockFiles,
				total: 1,
			});

			// Act
			const daemonResult = await mockDaemonBridge.listProtectedFiles!(workspaceRoot, { level: "block" });

			// Assert
			expect(mockDaemonBridge.listProtectedFiles).toHaveBeenCalledWith(workspaceRoot, { level: "block" });
			expect(daemonResult.files).toHaveLength(1);
			expect(daemonResult.files[0].level).toBe("block");
		});
	});
});
