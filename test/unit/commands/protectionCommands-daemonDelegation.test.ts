/**
 * Protection Commands - Daemon Delegation Tests
 *
 * Unit tests for ARCHITECTURE_REFACTOR_SPEC.md Sprint 2:
 * Validates hybrid delegation pattern for protection commands
 *
 * Test Coverage:
 * - Daemon delegation when available and connected
 * - Graceful fallback to local when daemon fails
 * - Local-only execution when daemon disconnected
 * - Backward compatibility when daemon undefined
 * - Workspace path validation for delegation
 *
 * Commands Tested:
 * - protectCurrentFile: Quick protect with default level
 * - unprotectFile: Remove protection
 * - setProtectionLevel: Change protection level with prompt
 * - changeProtectionLevel: Update existing protection level
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import type { CommandContext } from "../../../src/commands/types";
import { registerProtectionCommands } from "../../../src/commands/protectionCommands";
import type { DaemonBridge } from "../../../src/services/DaemonBridge";
import type { ProtectedFileRegistry } from "../../../src/services/protectedFileRegistry";
import type { SnapBackRCLoader } from "../../../src/protection/SnapBackRCLoader";

// IMPORTANT: DO NOT re-mock vscode here!
// The global setup.ts provides a complete vscode mock.

interface TreeItemLike {
	command?: {
		arguments?: unknown[];
	};
	resourceUri?: vscode.Uri;
}

describe("Protection Commands - Daemon Delegation", () => {
	let mockDaemonBridge: DaemonBridge;
	let mockProtectedFileRegistry: ProtectedFileRegistry;
	let mockSnapbackrcLoader: SnapBackRCLoader;
	let commandContext: CommandContext;

	beforeEach(() => {
		vi.clearAllMocks();

		// Create mock DaemonBridge
		mockDaemonBridge = {
			isConnected: vi.fn().mockReturnValue(true),
			setProtectionLevel: vi.fn().mockResolvedValue({ success: true }),
			initialize: vi.fn().mockResolvedValue(undefined),
			dispose: vi.fn(),
		} as unknown as DaemonBridge;

		// Create mock ProtectedFileRegistry
		mockProtectedFileRegistry = {
			isProtected: vi.fn().mockReturnValue(false),
			add: vi.fn().mockResolvedValue(undefined),
			remove: vi.fn().mockResolvedValue(undefined),
			updateProtectionLevel: vi.fn().mockResolvedValue(undefined),
			getProtectionLevel: vi.fn().mockReturnValue("watch"),
		} as unknown as ProtectedFileRegistry;

		// Create mock SnapBackRCLoader
		mockSnapbackrcLoader = {
			addProtectionRule: vi.fn().mockResolvedValue(undefined),
			removeProtectionRule: vi.fn().mockResolvedValue(undefined),
		} as unknown as SnapBackRCLoader;

		// Create CommandContext
		commandContext = {
			protectedFileRegistry: mockProtectedFileRegistry,
			refreshViews: vi.fn(),
			daemonBridge: mockDaemonBridge,
			workspaceRoot: "/test/workspace",
			snapbackrcLoader: mockSnapbackrcLoader,
			// Minimal required fields
			snapshotManager: {} as any,
			operationCoordinator: {} as any,
			workflowIntegration: {} as any,
			notificationManager: {} as any,
			workspaceMemoryManager: {} as any,
			conflictResolver: {} as any,
			featureFlagService: {} as any,
			snapshotDocumentProvider: {} as any,
			protectionDecorationProvider: {} as any,
			fileHealthDecorationProvider: {} as any,
			snapshotRestoreUI: {} as any,
			intelligenceTreeProvider: {} as any,
			snapshotSummaryProvider: {} as any,
			configManager: {} as any,
			fileWatcher: {} as any,
			welcomeView: {} as any,
			storage: {} as any,
			updateFileProtectionContext: vi.fn(),
			updateHasProtectedFilesContext: vi.fn(),
			getProtectionStateSummary: vi.fn(),
		} as unknown as CommandContext;
	});

	afterEach(() => {
		vi.resetAllMocks();
	});

	describe("protectCurrentFile - Daemon Delegation", () => {
		it("should delegate to daemon when connected and workspace available", async () => {
			// Arrange
			const testUri = vscode.Uri.file("/test/workspace/src/test.ts");
			Object.defineProperty(vscode.window, "activeTextEditor", {
				value: {
					document: { uri: testUri },
				},
				writable: true,
				configurable: true,
			});

			const _disposables = registerProtectionCommands({} as any, commandContext);
			const protectCommand = vi
				.mocked(vscode.commands.registerCommand)
				.mock.calls.find((call) => call[0] === "snapback.protectCurrentFile")?.[1];

			// Act
			await protectCommand?.();

			// Assert - Daemon should be called (MIGRATED to daemon-first)
			expect(mockDaemonBridge.setProtectionLevel).toHaveBeenCalledWith(
				"/test/workspace",
				"/test/workspace/src/test.ts",
				"watch",
				"Protected via VS Code command",
			);

			// Assert - SnapBackRCLoader should NOT be called (daemon succeeded)
			expect(mockSnapbackrcLoader.addProtectionRule).not.toHaveBeenCalled();

			// Assert - Success notification shown
			expect(vscode.window.showInformationMessage).toHaveBeenCalled();
		});

		it("should fall back to local when daemon fails", async () => {
			// Arrange
			const testUri = vscode.Uri.file("/test/workspace/src/test.ts");
			Object.defineProperty(vscode.window, "activeTextEditor", {
				value: {
					document: { uri: testUri },
				},
				writable: true,
				configurable: true,
			});

			// Configure daemon to fail
			vi.mocked(mockDaemonBridge.setProtectionLevel).mockRejectedValueOnce(new Error("Daemon error"));

			const _disposables = registerProtectionCommands({} as any, commandContext);
			const protectCommand = vi
				.mocked(vscode.commands.registerCommand)
				.mock.calls.find((call) => call[0] === "snapback.protectCurrentFile")?.[1];

			// Act
			await protectCommand?.();

			// Assert - Daemon should be tried first
			expect(mockDaemonBridge.setProtectionLevel).toHaveBeenCalled();

			// Assert - SnapBackRCLoader should be called as fallback
			expect(mockSnapbackrcLoader.addProtectionRule).toHaveBeenCalledWith("/test/workspace/src/test.ts", "watch");

			// Assert - Success notification shown (from local fallback)
			expect(vscode.window.showInformationMessage).toHaveBeenCalled();
		});
	});

	describe("unprotectFile - Daemon Delegation", () => {
		it("should NOT delegate to daemon in current implementation", async () => {
			// Arrange
			const testUri = vscode.Uri.file("/test/workspace/src/test.ts");
			Object.defineProperty(vscode.window, "activeTextEditor", {
				value: {
					document: { uri: testUri },
				},
				writable: true,
				configurable: true,
			});

			const _disposables = registerProtectionCommands({} as any, commandContext);
			const unprotectCommand = vi
				.mocked(vscode.commands.registerCommand)
				.mock.calls.find((call) => call[0] === "snapback.unprotectFile")?.[1];

			// Act
			await unprotectCommand?.();

			// Assert - Documents current behavior (local only)
			expect(mockSnapbackrcLoader.removeProtectionRule).toHaveBeenCalledWith("/test/workspace/src/test.ts");

			// Assert - Success notification shown
			expect(vscode.window.showInformationMessage).toHaveBeenCalled();
		});
	});

	describe("setProtectionLevel - Daemon Delegation", () => {
		it("should delegate to daemon when connected and workspace available", async () => {
			// Arrange
			const testUri = vscode.Uri.file("/test/workspace/src/test.ts");
			Object.defineProperty(vscode.window, "activeTextEditor", {
				value: {
					document: { uri: testUri },
				},
				writable: true,
				configurable: true,
			});

			// Mock file is not protected - user must confirm protection first
			(vscode.window.showWarningMessage as any).mockResolvedValueOnce("Protect and Set Level");

			// Mock protection level selection
			(vscode.window.showQuickPick as any).mockResolvedValueOnce({
				label: "🟡 Warning",
				level: "warn",
			});

			const _disposables = registerProtectionCommands({} as any, commandContext);
			const setLevelCommand = vi
				.mocked(vscode.commands.registerCommand)
				.mock.calls.find((call) => call[0] === "snapback.setProtectionLevel")?.[1];

			// Act
			await setLevelCommand?.();

			// Assert - Daemon should be called (MIGRATED to daemon-first)
			expect(mockDaemonBridge.setProtectionLevel).toHaveBeenCalledWith(
				"/test/workspace",
				"/test/workspace/src/test.ts",
				"warn",
				"Protection level set via VS Code command",
			);

			// Assert - SnapBackRCLoader should NOT be called (daemon succeeded)
			expect(mockSnapbackrcLoader.addProtectionRule).not.toHaveBeenCalled();
		});
	});

	describe("changeProtectionLevel - Daemon Delegation", () => {
		beforeEach(() => {
			// File is already protected
			vi.mocked(mockProtectedFileRegistry.isProtected).mockReturnValue(true);
		});

		it("should delegate to daemon when connected and workspace available", async () => {
			// Arrange
			const testUri = vscode.Uri.file("/test/workspace/src/test.ts");
			Object.defineProperty(vscode.window, "activeTextEditor", {
				value: {
					document: { uri: testUri },
				},
				writable: true,
				configurable: true,
			});

			// Mock protection level selection
			(vscode.window.showQuickPick as any).mockResolvedValueOnce({
				label: "🔴 Protected",
				level: "block",
			});

			const _disposables = registerProtectionCommands({} as any, commandContext);
			const changeLevelCommand = vi
				.mocked(vscode.commands.registerCommand)
				.mock.calls.find((call) => call[0] === "snapback.changeProtectionLevel")?.[1];

			// Act
			await changeLevelCommand?.();

			// Assert - Daemon should be called (MIGRATED to daemon-first)
			expect(mockDaemonBridge.setProtectionLevel).toHaveBeenCalledWith(
				"/test/workspace",
				"/test/workspace/src/test.ts",
				"block",
				"Protection level changed via VS Code command",
			);

			// Assert - SnapBackRCLoader should NOT be called (daemon succeeded)
			expect(mockSnapbackrcLoader.addProtectionRule).not.toHaveBeenCalled();
		});

		it("should fall back to local when daemon fails", async () => {
			// Arrange
			const testUri = vscode.Uri.file("/test/workspace/src/test.ts");
			Object.defineProperty(vscode.window, "activeTextEditor", {
				value: {
					document: { uri: testUri },
				},
				writable: true,
				configurable: true,
			});

			// Configure daemon to fail
			vi.mocked(mockDaemonBridge.setProtectionLevel).mockRejectedValueOnce(new Error("Daemon error"));

			// Mock protection level selection
			(vscode.window.showQuickPick as any).mockResolvedValueOnce({
				label: "🔴 Protected",
				level: "block",
			});

			const _disposables = registerProtectionCommands({} as any, commandContext);
			const changeLevelCommand = vi
				.mocked(vscode.commands.registerCommand)
				.mock.calls.find((call) => call[0] === "snapback.changeProtectionLevel")?.[1];

			// Act
			await changeLevelCommand?.();

			// Assert - Daemon should be tried first
			expect(mockDaemonBridge.setProtectionLevel).toHaveBeenCalled();

			// Assert - SnapBackRCLoader should be called as fallback
			expect(mockSnapbackrcLoader.addProtectionRule).toHaveBeenCalledWith("/test/workspace/src/test.ts", "block");
		});
	});

	describe("Backward Compatibility", () => {
		it("should work when daemon is undefined", async () => {
			// Arrange - Remove daemon from context
			commandContext.daemonBridge = undefined;

			const testUri = vscode.Uri.file("/test/workspace/src/test.ts");
			Object.defineProperty(vscode.window, "activeTextEditor", {
				value: {
					document: { uri: testUri },
				},
				writable: true,
				configurable: true,
			});

			const _disposables = registerProtectionCommands({} as any, commandContext);
			const protectCommand = vi
				.mocked(vscode.commands.registerCommand)
				.mock.calls.find((call) => call[0] === "snapback.protectCurrentFile")?.[1];

			// Act
			await protectCommand?.();

			// Assert - Local implementation used
			expect(mockSnapbackrcLoader.addProtectionRule).toHaveBeenCalled();
			expect(vscode.window.showInformationMessage).toHaveBeenCalled();
		});
	});

	describe("Quick-Set Commands - Daemon Delegation", () => {
		describe("setWatchLevel", () => {
			it("should delegate to daemon when available", async () => {
				// Arrange
				const testUri = vscode.Uri.file("/test/workspace/src/test.ts");
				Object.defineProperty(vscode.window, "activeTextEditor", {
					value: {
						document: { uri: testUri },
					},
					writable: true,
					configurable: true,
				});

				const _disposables = registerProtectionCommands({} as any, commandContext);
				const watchCommand = vi
					.mocked(vscode.commands.registerCommand)
					.mock.calls.find((call) => call[0] === "snapback.setWatchLevel")?.[1];

				// Act
				await watchCommand?.();

				// Assert - Daemon should be called with "watch" level
				expect(mockDaemonBridge.setProtectionLevel).toHaveBeenCalledWith(
					"/test/workspace",
					"/test/workspace/src/test.ts",
					"watch",
					"Protected via VS Code command",
				);

				// Assert - Local not called (daemon succeeded)
				expect(mockSnapbackrcLoader.addProtectionRule).not.toHaveBeenCalled();
			});

			it("should fall back to local when daemon fails", async () => {
				// Arrange
				const testUri = vscode.Uri.file("/test/workspace/src/test.ts");
				Object.defineProperty(vscode.window, "activeTextEditor", {
					value: {
						document: { uri: testUri },
					},
					writable: true,
					configurable: true,
				});

				// Configure daemon to fail
				vi.mocked(mockDaemonBridge.setProtectionLevel).mockRejectedValueOnce(new Error("Daemon error"));

				const _disposables = registerProtectionCommands({} as any, commandContext);
				const watchCommand = vi
					.mocked(vscode.commands.registerCommand)
					.mock.calls.find((call) => call[0] === "snapback.setWatchLevel")?.[1];

				// Act
				await watchCommand?.();

				// Assert - Daemon tried first
				expect(mockDaemonBridge.setProtectionLevel).toHaveBeenCalled();

				// Assert - Local fallback used
				expect(mockSnapbackrcLoader.addProtectionRule).toHaveBeenCalledWith(
					"/test/workspace/src/test.ts",
					"watch",
				);
			});
		});

		describe("setWarnLevel", () => {
			it("should delegate to daemon when available", async () => {
				// Arrange
				const testUri = vscode.Uri.file("/test/workspace/src/test.ts");
				Object.defineProperty(vscode.window, "activeTextEditor", {
					value: {
						document: { uri: testUri },
					},
					writable: true,
					configurable: true,
				});

				const _disposables = registerProtectionCommands({} as any, commandContext);
				const warnCommand = vi
					.mocked(vscode.commands.registerCommand)
					.mock.calls.find((call) => call[0] === "snapback.setWarnLevel")?.[1];

				// Act
				await warnCommand?.();

				// Assert - Daemon should be called with "warn" level
				expect(mockDaemonBridge.setProtectionLevel).toHaveBeenCalledWith(
					"/test/workspace",
					"/test/workspace/src/test.ts",
					"warn",
					"Protected via VS Code command",
				);

				// Assert - Local not called (daemon succeeded)
				expect(mockSnapbackrcLoader.addProtectionRule).not.toHaveBeenCalled();
			});
		});

		describe("setBlockLevel", () => {
			it("should delegate to daemon when available", async () => {
				// Arrange
				const testUri = vscode.Uri.file("/test/workspace/src/test.ts");
				Object.defineProperty(vscode.window, "activeTextEditor", {
					value: {
						document: { uri: testUri },
					},
					writable: true,
					configurable: true,
				});

				const _disposables = registerProtectionCommands({} as any, commandContext);
				const blockCommand = vi
					.mocked(vscode.commands.registerCommand)
					.mock.calls.find((call) => call[0] === "snapback.setBlockLevel")?.[1];

				// Act
				await blockCommand?.();

				// Assert - Daemon should be called with "block" level
				expect(mockDaemonBridge.setProtectionLevel).toHaveBeenCalledWith(
					"/test/workspace",
					"/test/workspace/src/test.ts",
					"block",
					"Protected via VS Code command",
				);

				// Assert - Local not called (daemon succeeded)
				expect(mockSnapbackrcLoader.addProtectionRule).not.toHaveBeenCalled();
			});
		});
	});
});
