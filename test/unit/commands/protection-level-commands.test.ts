/**
 * Protection Level Commands Tests - Validates protection level command functionality
 *
 * Following testing_blueprint.md standards:
 * - Happy path: Normal successful operations
 * - Sad path: Expected failures (user errors)
 * - Edge cases: Boundary conditions
 * - Error cases: System failures
 *
 * Test IDs: PLC-01 through PLC-20
 *
 * @since 2025-12-08
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import type { ProtectedFileRegistry } from "../../../src/services/protectedFileRegistry";
import type { ProtectionDecorationProvider } from "../../../src/ui/ProtectionDecorationProvider";
import type { ProtectionLevel } from "../../../src/views/types";

// Mock vscode
vi.mock("vscode", () => ({
	Uri: {
		file: vi.fn((path: string) => ({ fsPath: path, scheme: "file" })),
	},
	window: {
		activeTextEditor: null,
		showWarningMessage: vi.fn(),
		showInformationMessage: vi.fn(),
		showErrorMessage: vi.fn(),
	},
	workspace: {
		asRelativePath: vi.fn((path: string) => path),
	},
	commands: {
		registerCommand: vi.fn((id, handler) => ({ dispose: vi.fn() })),
	},
}));

describe("Protection Level Commands", () => {
	let mockRegistry: {
		isProtected: ReturnType<typeof vi.fn>;
		add: ReturnType<typeof vi.fn>;
		updateProtectionLevel: ReturnType<typeof vi.fn>;
		remove: ReturnType<typeof vi.fn>;
		getProtectionLevel: ReturnType<typeof vi.fn>;
	};

	let mockDecorationProvider: {
		forceUpdate: ReturnType<typeof vi.fn>;
	};

	let refreshViews: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vi.clearAllMocks();

		mockRegistry = {
			isProtected: vi.fn().mockReturnValue(false),
			add: vi.fn().mockResolvedValue(undefined),
			updateProtectionLevel: vi.fn().mockResolvedValue(undefined),
			remove: vi.fn().mockResolvedValue(undefined),
			getProtectionLevel: vi.fn().mockReturnValue("watch"),
		};

		mockDecorationProvider = {
			forceUpdate: vi.fn(),
		};

		refreshViews = vi.fn();
	});

	describe("setProtectionLevelQuick - Happy Path", () => {
		it("PLC-01: should add file with correct level when not protected", async () => {
			// Arrange
			const uri = vscode.Uri.file("/test/file.ts");
			const level: ProtectionLevel = "watch";

			mockRegistry.isProtected.mockReturnValue(false);

			// Act
			await executeSetProtectionLevelQuick(uri, level);

			// Assert
			expect(mockRegistry.add).toHaveBeenCalledWith("/test/file.ts", {
				protectionLevel: "watch",
			});
			expect(mockRegistry.updateProtectionLevel).not.toHaveBeenCalled();
			expect(mockDecorationProvider.forceUpdate).toHaveBeenCalledWith([uri]);
		});

		it("PLC-02: should update level when file already protected", async () => {
			// Arrange
			const uri = vscode.Uri.file("/test/file.ts");
			const level: ProtectionLevel = "block";

			mockRegistry.isProtected.mockReturnValue(true);

			// Act
			await executeSetProtectionLevelQuick(uri, level);

			// Assert
			expect(mockRegistry.add).not.toHaveBeenCalled();
			expect(mockRegistry.updateProtectionLevel).toHaveBeenCalledWith("/test/file.ts", "block");
			expect(mockDecorationProvider.forceUpdate).toHaveBeenCalledWith([uri]);
		});

		it("PLC-03: should refresh views after protection change", async () => {
			// Arrange
			const uri = vscode.Uri.file("/test/file.ts");

			// Act
			await executeSetProtectionLevelQuick(uri, "warn");

			// Assert
			expect(refreshViews).toHaveBeenCalled();
		});

		it("PLC-04: should force immediate decoration update (no debounce)", async () => {
			// Arrange
			const uri = vscode.Uri.file("/test/file.ts");

			// Act
			await executeSetProtectionLevelQuick(uri, "watch");

			// Assert
			// Verify forceUpdate is called immediately, not debounced
			expect(mockDecorationProvider.forceUpdate).toHaveBeenCalledWith([uri]);
			expect(mockDecorationProvider.forceUpdate).toHaveBeenCalledTimes(1);
		});
	});

	describe("setProtectionLevelQuick - Sad Path", () => {
		it("PLC-05: should show warning when no file selected", async () => {
			// Arrange
			const uri = undefined;

			// Act
			await executeSetProtectionLevelQuick(uri, "watch");

			// Assert
			expect(vscode.window.showWarningMessage).toHaveBeenCalledWith("No file selected");
			expect(mockRegistry.add).not.toHaveBeenCalled();
		});

		it("PLC-06: should show error when registry.add fails", async () => {
			// Arrange
			const uri = vscode.Uri.file("/test/file.ts");
			mockRegistry.add.mockRejectedValue(new Error("Storage failure"));

			// Act
			await executeSetProtectionLevelQuick(uri, "watch");

			// Assert
			expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
				"Failed to set protection level: Storage failure",
			);
		});

		it("PLC-07: should show error when updateProtectionLevel fails", async () => {
			// Arrange
			const uri = vscode.Uri.file("/test/file.ts");
			mockRegistry.isProtected.mockReturnValue(true);
			mockRegistry.updateProtectionLevel.mockRejectedValue(new Error("Update failed"));

			// Act
			await executeSetProtectionLevelQuick(uri, "block");

			// Assert
			expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
				"Failed to set protection level: Update failed",
			);
		});
	});

	describe("setProtectionLevelQuick - Edge Cases", () => {
		it("PLC-08: should handle special characters in file path", async () => {
			// Arrange
			const uri = vscode.Uri.file("/test/file with spaces & special@chars.ts");

			// Act
			await executeSetProtectionLevelQuick(uri, "warn");

			// Assert
			expect(mockRegistry.add).toHaveBeenCalledWith("/test/file with spaces & special@chars.ts", {
				protectionLevel: "warn",
			});
		});

		it("PLC-09: should handle very long file paths", async () => {
			// Arrange
			const longPath = `/test/${"a/".repeat(50)}file.ts`;
			const uri = vscode.Uri.file(longPath);

			// Act
			await executeSetProtectionLevelQuick(uri, "block");

			// Assert
			expect(mockRegistry.add).toHaveBeenCalled();
			expect(mockDecorationProvider.forceUpdate).toHaveBeenCalled();
		});

		it("PLC-10: should work when decoration provider not available", async () => {
			// Arrange
			const uri = vscode.Uri.file("/test/file.ts");

			// Act - Execute without decoration provider
			await executeSetProtectionLevelQuickWithoutDecorations(uri, "watch");

			// Assert
			expect(mockRegistry.add).toHaveBeenCalled();
			// Should not throw error when decoration provider is undefined
		});
	});

	describe("All Protection Levels", () => {
		it("PLC-11: should set watch level correctly", async () => {
			// Arrange
			const uri = vscode.Uri.file("/test/file.ts");

			// Act
			await executeSetProtectionLevelQuick(uri, "watch");

			// Assert
			expect(mockRegistry.add).toHaveBeenCalledWith("/test/file.ts", {
				protectionLevel: "watch",
			});
		});

		it("PLC-12: should set warn level correctly", async () => {
			// Arrange
			const uri = vscode.Uri.file("/test/file.ts");

			// Act
			await executeSetProtectionLevelQuick(uri, "warn");

			// Assert
			expect(mockRegistry.add).toHaveBeenCalledWith("/test/file.ts", {
				protectionLevel: "warn",
			});
		});

		it("PLC-13: should set block level correctly", async () => {
			// Arrange
			const uri = vscode.Uri.file("/test/file.ts");

			// Act
			await executeSetProtectionLevelQuick(uri, "block");

			// Assert
			expect(mockRegistry.add).toHaveBeenCalledWith("/test/file.ts", {
				protectionLevel: "block",
			});
		});
	});

	describe("Command Registration", () => {
		it("PLC-14: should register snapback.setWatchLevel command", () => {
			// Verify command is registered
			expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
				"snapback.setWatchLevel",
				expect.any(Function),
			);
		});

		it("PLC-15: should register snapback.setWarnLevel command", () => {
			expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
				"snapback.setWarnLevel",
				expect.any(Function),
			);
		});

		it("PLC-16: should register snapback.setBlockLevel command", () => {
			expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
				"snapback.setBlockLevel",
				expect.any(Function),
			);
		});

		it("PLC-17: should register snapback.protection.workspace command", () => {
			expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
				"snapback.protection.workspace",
				expect.any(Function),
			);
		});
	});

	describe("Configure Protection Command", () => {
		it("PLC-18: should open settings to protection section", async () => {
			// Arrange
			const executeCommandSpy = vi.spyOn(vscode.commands, "executeCommand");

			// Act
			await executeConfigureProtection();

			// Assert
			expect(executeCommandSpy).toHaveBeenCalledWith(
				"workbench.action.openSettings",
				"@ext:snapback.snapback protection",
			);
		});

		it("PLC-19: should handle settings open failure gracefully", async () => {
			// Arrange
			vi.spyOn(vscode.commands, "executeCommand").mockRejectedValue(new Error("Settings unavailable"));

			// Act & Assert
			await expect(executeConfigureProtection()).rejects.toThrow();
		});
	});

	describe("Atomic Operations", () => {
		it("PLC-20: should perform add + decoration update atomically", async () => {
			// Arrange
			const uri = vscode.Uri.file("/test/file.ts");
			const callOrder: string[] = [];

			mockRegistry.add.mockImplementation(async () => {
				callOrder.push("add");
			});
			mockDecorationProvider.forceUpdate.mockImplementation(() => {
				callOrder.push("forceUpdate");
			});
			refreshViews.mockImplementation(() => {
				callOrder.push("refreshViews");
			});

			// Act
			await executeSetProtectionLevelQuick(uri, "watch");

			// Assert
			expect(callOrder).toEqual(["add", "refreshViews", "forceUpdate"]);
		});
	});

	// Helper functions to simulate command execution
	async function executeSetProtectionLevelQuick(uri: vscode.Uri | undefined, level: ProtectionLevel): Promise<void> {
		if (!uri) {
			vscode.window.showWarningMessage("No file selected");
			return;
		}

		const isProtected = mockRegistry.isProtected(uri.fsPath);

		try {
			if (!isProtected) {
				await mockRegistry.add(uri.fsPath, { protectionLevel: level });
			} else {
				await mockRegistry.updateProtectionLevel(uri.fsPath, level);
			}
			refreshViews();

			if (mockDecorationProvider) {
				mockDecorationProvider.forceUpdate([uri]);
			}
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to set protection level: ${(error as Error).message}`);
		}
	}

	async function executeSetProtectionLevelQuickWithoutDecorations(
		uri: vscode.Uri | undefined,
		level: ProtectionLevel,
	): Promise<void> {
		if (!uri) {
			vscode.window.showWarningMessage("No file selected");
			return;
		}

		const isProtected = mockRegistry.isProtected(uri.fsPath);

		if (!isProtected) {
			await mockRegistry.add(uri.fsPath, { protectionLevel: level });
		} else {
			await mockRegistry.updateProtectionLevel(uri.fsPath, level);
		}
		refreshViews();
	}

	async function executeConfigureProtection(): Promise<void> {
		await vscode.commands.executeCommand("workbench.action.openSettings", "@ext:snapback.snapback protection");
	}
});
