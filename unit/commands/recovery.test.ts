/**
 * TDD RED Phase: Recovery Commands Tests
 *
 * These tests define the expected behavior for Phase 1 recovery commands.
 * Tests are written FIRST (RED) - implementation will follow (GREEN).
 *
 * Commands under test:
 * - vreko.showRecentChanges
 * - vreko.showQuickActions
 * - vreko.openRecoveryTimeline
 * - vreko.recovery.compare
 * - vreko.restoreFromSnapshot
 * - vreko.restoreAllRecent
 *
 * @see Extension_UI_Refactor_Plan_6ac9a36c.md Phase 1.3
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";

import {
	createMockRecoveryService,
	createMockRecoveryTreeProvider,
	createMockSessionStatsProvider,
} from "../../helpers/recoveryMocks";
import { mockRecoverySnapshots, mockSessionStats } from "../../fixtures/recovery";
import type { CommandContext } from "../../../src/commands/types";

// The recovery commands module is implemented - import will work
// Tests verify the actual implementation

describe("Recovery Commands", () => {
	let mockContext: vscode.ExtensionContext;
	let mockCommandContext: Partial<CommandContext>;
	let mockRecoveryService: ReturnType<typeof createMockRecoveryService>;
	let mockStatsProvider: ReturnType<typeof createMockSessionStatsProvider>;
	let mockRecoveryTreeProvider: ReturnType<typeof createMockRecoveryTreeProvider>;
	let registeredCommands: Map<string, (...args: unknown[]) => unknown>;

	beforeEach(() => {
		vi.clearAllMocks();

		// Track registered commands
		registeredCommands = new Map();

		vi.mocked(vscode.commands.registerCommand).mockImplementation(
			(command: string, callback: (...args: unknown[]) => unknown) => {
				registeredCommands.set(command, callback);
				return { dispose: vi.fn() };
			},
		);

		// Create mock services
		mockRecoveryService = createMockRecoveryService({
			getRecent: vi.fn().mockResolvedValue(mockRecoverySnapshots.slice(0, 5)),
			getAll: vi.fn().mockResolvedValue(mockRecoverySnapshots),
		});

		mockStatsProvider = createMockSessionStatsProvider({
			getStats: vi.fn().mockResolvedValue(mockSessionStats),
		});

		mockRecoveryTreeProvider = createMockRecoveryTreeProvider();

		// Create mock extension context
		mockContext = {
			subscriptions: [],
			extensionPath: "/mock/path",
			extensionUri: vscode.Uri.parse("file:///mock/path"),
			globalState: {
				get: vi.fn(),
				update: vi.fn().mockResolvedValue(undefined),
				keys: vi.fn().mockReturnValue([]),
				setKeysForSync: vi.fn(),
			},
			workspaceState: {
				get: vi.fn(),
				update: vi.fn().mockResolvedValue(undefined),
				keys: vi.fn().mockReturnValue([]),
			},
			secrets: {
				get: vi.fn(),
				store: vi.fn(),
				delete: vi.fn(),
				onDidChange: vi.fn(),
			},
		} as unknown as vscode.ExtensionContext;

		// Create mock command context
		mockCommandContext = {
			recoveryService: mockRecoveryService,
			sessionStatsProvider: mockStatsProvider,
			recoveryTreeProvider: mockRecoveryTreeProvider,
			workspaceRoot: "/test/workspace",
		};
	});

	describe("Command Registration", () => {
		it("should register all 7 recovery commands", async () => {
			// Import the module (will fail until implemented)
			const { registerRecoveryCommands } = await import(
				"../../../src/commands/recoveryCommands"
			);
	
			const disposables = registerRecoveryCommands(
				mockContext,
				mockCommandContext as CommandContext,
			);
	
			// Verify 7 commands are registered (including undoLastRestore)
			expect(disposables).toHaveLength(7);
	
			// Verify each command is registered
			const expectedCommands = [
				"vreko.showRecentChanges",
				"vreko.showQuickActions",
				"vreko.openRecoveryTimeline",
				"vreko.recovery.compare",
				"vreko.restoreFromSnapshot",
				"vreko.undoLastRestore",
				"vreko.restoreAllRecent",
			];

			for (const command of expectedCommands) {
				expect(registeredCommands.has(command)).toBe(true);
			}
		});

		it("should return disposables for cleanup", async () => {
			const { registerRecoveryCommands } = await import(
				"../../../src/commands/recoveryCommands"
			);

			const disposables = registerRecoveryCommands(
				mockContext,
				mockCommandContext as CommandContext,
			);

			// All should have dispose method
			for (const disposable of disposables) {
				expect(typeof disposable.dispose).toBe("function");
			}
		});
	});

	describe("vreko.showRecentChanges", () => {
		it("should open recovery timeline with recent scope", async () => {
			const { registerRecoveryCommands } = await import(
				"../../../src/commands/recoveryCommands"
			);

			registerRecoveryCommands(mockContext, mockCommandContext as CommandContext);

			const handler = registeredCommands.get("vreko.showRecentChanges");
			expect(handler).toBeDefined();

			await handler!();

			// Should delegate to openRecoveryTimeline with recent scope
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"vreko.openRecoveryTimeline",
				expect.objectContaining({
					scope: "recent",
					timeWindow: 15 * 60 * 1000, // 15 minutes
				}),
			);
		});
	});

	describe("vreko.showQuickActions", () => {
		it("should show QuickPick panel with session stats and recent snapshots", async () => {
			const { registerRecoveryCommands } = await import(
				"../../../src/commands/recoveryCommands"
			);

			registerRecoveryCommands(mockContext, mockCommandContext as CommandContext);

			const handler = registeredCommands.get("vreko.showQuickActions");
			expect(handler).toBeDefined();

			// Mock QuickPick - createQuickPick is already mocked globally
			const mockQuickPick = {
				items: [],
				title: "",
				placeholder: "",
				show: vi.fn(),
				hide: vi.fn(),
				dispose: vi.fn(),
				onDidAccept: vi.fn(() => ({ dispose: vi.fn() })),
				onDidHide: vi.fn(() => ({ dispose: vi.fn() })),
				matchOnDescription: false,
				matchOnDetail: false,
				busy: false,
			};
			(vscode.window.createQuickPick as any).mockReturnValue(
				mockQuickPick as unknown as vscode.QuickPick<vscode.QuickPickItem>,
			);

			await handler!();

			// Should create QuickPick
			expect(vscode.window.createQuickPick).toHaveBeenCalled();

			// Should fetch session stats
			expect(mockStatsProvider.getStats).toHaveBeenCalled();

			// Should fetch recent snapshots
			expect(mockRecoveryService.getRecent).toHaveBeenCalledWith(5);

			// Should show the picker
			expect(mockQuickPick.show).toHaveBeenCalled();
		});

		it("should include session stats header in QuickPick items", async () => {
			const { registerRecoveryCommands } = await import(
				"../../../src/commands/recoveryCommands"
			);

			registerRecoveryCommands(mockContext, mockCommandContext as CommandContext);

			const handler = registeredCommands.get("vreko.showQuickActions");

			let capturedItems: vscode.QuickPickItem[] = [];
			const mockQuickPick = {
				_items: [] as vscode.QuickPickItem[],
				title: "",
				placeholder: "",
				show: vi.fn(),
				hide: vi.fn(),
				dispose: vi.fn(),
				onDidAccept: vi.fn(() => ({ dispose: vi.fn() })),
				onDidHide: vi.fn(() => ({ dispose: vi.fn() })),
				matchOnDescription: false,
				matchOnDetail: false,
				busy: false,
				set items(value: vscode.QuickPickItem[]) {
					capturedItems = value;
					this._items = value;
				},
				get items() {
					return this._items;
				},
			};
			(vscode.window.createQuickPick as any).mockReturnValue(
				mockQuickPick as unknown as vscode.QuickPick<vscode.QuickPickItem>,
			);

			await handler!();

			// First item should be session stats header (separator)
			const statsHeader = capturedItems.find(
				(item) =>
					item.kind === vscode.QuickPickItemKind.Separator &&
					item.label.includes("Session"),
			);
			expect(statsHeader).toBeDefined();
		});

		it("should include recovery actions (Undo, Timeline, Dashboard)", async () => {
			const { registerRecoveryCommands } = await import(
				"../../../src/commands/recoveryCommands"
			);

			registerRecoveryCommands(mockContext, mockCommandContext as CommandContext);

			const handler = registeredCommands.get("vreko.showQuickActions");

			let capturedItems: vscode.QuickPickItem[] = [];
			const mockQuickPick = {
				_items: [] as vscode.QuickPickItem[],
				title: "",
				placeholder: "",
				show: vi.fn(),
				hide: vi.fn(),
				dispose: vi.fn(),
				onDidAccept: vi.fn(() => ({ dispose: vi.fn() })),
				onDidHide: vi.fn(() => ({ dispose: vi.fn() })),
				set items(value: vscode.QuickPickItem[]) {
					capturedItems = value;
					this._items = value;
				},
				get items() {
					return this._items;
				},
			};
			(vscode.window.createQuickPick as any).mockReturnValue(
				mockQuickPick as unknown as vscode.QuickPick<vscode.QuickPickItem>,
			);

			await handler!();

			// Should have Undo Recent action
			const undoAction = capturedItems.find((item) =>
				item.label.includes("Undo Recent"),
			);
			expect(undoAction).toBeDefined();

			// Should have Timeline action
			const timelineAction = capturedItems.find((item) =>
				item.label.includes("Timeline"),
			);
			expect(timelineAction).toBeDefined();

			// Should have Dashboard action
			const dashboardAction = capturedItems.find((item) =>
				item.label.includes("Dashboard"),
			);
			expect(dashboardAction).toBeDefined();
		});
	});

	describe("vreko.openRecoveryTimeline", () => {
		it("should focus recovery tree view", async () => {
			const { registerRecoveryCommands } = await import(
				"../../../src/commands/recoveryCommands"
			);

			registerRecoveryCommands(mockContext, mockCommandContext as CommandContext);

			const handler = registeredCommands.get("vreko.openRecoveryTimeline");
			expect(handler).toBeDefined();

			await handler!();

			// Should focus the recovery tree view
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"vreko-recovery.focus",
			);
		});

		it("should apply filter when options provided", async () => {
			const { registerRecoveryCommands } = await import(
				"../../../src/commands/recoveryCommands"
			);

			registerRecoveryCommands(mockContext, mockCommandContext as CommandContext);

			const handler = registeredCommands.get("vreko.openRecoveryTimeline");

			const options = {
				scope: "recent" as const,
				timeWindow: 15 * 60 * 1000,
				filePath: "/test/file.ts",
			};

			await handler!(options);

			// Should focus the recovery tree view
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"vreko-recovery.focus",
			);

			// Should update tree provider filter (Phase 1.4 wiring complete)
			expect(mockRecoveryTreeProvider.setFilter).toHaveBeenCalledWith(options);
		});
	});

	describe("vreko.recovery.compare", () => {
		it("should open diff view with snapshot URI", async () => {
			const { registerRecoveryCommands } = await import(
				"../../../src/commands/recoveryCommands"
			);

			registerRecoveryCommands(mockContext, mockCommandContext as CommandContext);

			const handler = registeredCommands.get("vreko.recovery.compare");
			expect(handler).toBeDefined();

			const args = {
				filePath: "/test/workspace/src/test.ts",
				snapshotId: "snap-123",
			};

			await handler!(args);

			// Verify diff command was called with proper URIs
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"vscode.diff",
				expect.anything(), // snapshot URI
				expect.anything(), // current file URI
				expect.stringContaining("Snapshot"), // diff title
			);

			// Verify the diff title format
			const diffCall = vi.mocked(vscode.commands.executeCommand).mock.calls.find(
				(call) => call[0] === "vscode.diff",
			);
			expect(diffCall).toBeDefined();
			expect(diffCall![3]).toBe("test.ts (Snapshot ↔ Current)");
		});

		it("should use vreko:// URI scheme (not vreko-snapshot:)", async () => {
			const { registerRecoveryCommands } = await import(
				"../../../src/commands/recoveryCommands"
			);

			// Spy on Uri.parse to capture the URI string argument
			const parseSpy = vi.spyOn(vscode.Uri, "parse");

			registerRecoveryCommands(mockContext, mockCommandContext as CommandContext);

			const handler = registeredCommands.get("vreko.recovery.compare");

			const args = {
				filePath: "/test/workspace/src/test.ts",
				snapshotId: "snap-123",
			};

			await handler!(args);

			// Verify Uri.parse was called with vreko:// scheme
			expect(parseSpy).toHaveBeenCalledWith(
				expect.stringContaining("vreko://snap-123/"),
			);

			// Find the vreko URI parse call
			const parseCall = parseSpy.mock.calls.find(
				(call) => typeof call[0] === "string" && call[0].startsWith("vreko://"),
			);
			expect(parseCall).toBeDefined();
			expect(parseCall![0]).not.toContain("vreko-snapshot:");
			expect(parseCall![0]).toContain("vreko://");
		});
	});

	describe("vreko.restoreFromSnapshot", () => {
		it("should show confirmation dialog before restoring", async () => {
			const { registerRecoveryCommands } = await import(
				"../../../src/commands/recoveryCommands"
			);

			registerRecoveryCommands(mockContext, mockCommandContext as CommandContext);

			const handler = registeredCommands.get("vreko.restoreFromSnapshot");
			expect(handler).toBeDefined();

			vi.mocked(vscode.window.showWarningMessage).mockResolvedValue(
				"Restore" as unknown as vscode.MessageItem,
			);

			const args = {
				filePath: "/test/workspace/src/test.ts",
				snapshotId: "snap-123",
			};

			await handler!(args);

			// Should show warning message with Restore and Compare options
			expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
				expect.stringContaining("Restore"),
				expect.objectContaining({ modal: false }),
				"Restore",
				"Compare First",
			);
		});

		it("should call recoveryService.restore when confirmed", async () => {
			const { registerRecoveryCommands } = await import(
				"../../../src/commands/recoveryCommands"
			);

			registerRecoveryCommands(mockContext, mockCommandContext as CommandContext);

			const handler = registeredCommands.get("vreko.restoreFromSnapshot");

			vi.mocked(vscode.window.showWarningMessage).mockResolvedValue(
				"Restore" as unknown as vscode.MessageItem,
			);

			const args = {
				filePath: "/test/workspace/src/test.ts",
				snapshotId: "snap-123",
			};

			await handler!(args);

			// Should call recovery service
			expect(mockRecoveryService.restore).toHaveBeenCalledWith(
				"snap-123",
				"/test/workspace/src/test.ts",
			);
		});

		it("should show success notification with Undo option", async () => {
			const { registerRecoveryCommands } = await import(
				"../../../src/commands/recoveryCommands"
			);

			registerRecoveryCommands(mockContext, mockCommandContext as CommandContext);

			const handler = registeredCommands.get("vreko.restoreFromSnapshot");

			vi.mocked(vscode.window.showWarningMessage).mockResolvedValue(
				"Restore" as unknown as vscode.MessageItem,
			);

			const args = {
				filePath: "/test/workspace/src/test.ts",
				snapshotId: "snap-123",
			};

			await handler!(args);

			// Should show success message with Undo option
			expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
				expect.stringContaining("Restored"),
				"Undo",
			);
		});

		it("should open diff when Compare First is selected", async () => {
			const { registerRecoveryCommands } = await import(
				"../../../src/commands/recoveryCommands"
			);

			registerRecoveryCommands(mockContext, mockCommandContext as CommandContext);

			const handler = registeredCommands.get("vreko.restoreFromSnapshot");

			vi.mocked(vscode.window.showWarningMessage).mockResolvedValue(
				"Compare First" as unknown as vscode.MessageItem,
			);

			const args = {
				filePath: "/test/workspace/src/test.ts",
				snapshotId: "snap-123",
			};

			await handler!(args);

			// Should NOT call restore
			expect(mockRecoveryService.restore).not.toHaveBeenCalled();

			// Should delegate to recovery.compare
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"vreko.recovery.compare",
				args,
			);
		});
	});

	describe("vreko.restoreAllRecent", () => {
		it("should show modal confirmation for batch restore", async () => {
			const { registerRecoveryCommands } = await import(
				"../../../src/commands/recoveryCommands"
			);

			registerRecoveryCommands(mockContext, mockCommandContext as CommandContext);

			const handler = registeredCommands.get("vreko.restoreAllRecent");
			expect(handler).toBeDefined();

			vi.mocked(vscode.window.showWarningMessage).mockResolvedValue(undefined);

			await handler!();

			// Should show MODAL warning for batch operation
			expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
				expect.stringContaining("files"),
				expect.objectContaining({ modal: true }),
				"Restore All",
				"Review First",
			);
		});

		it("should restore unique files when confirmed", async () => {
			const { registerRecoveryCommands } = await import(
				"../../../src/commands/recoveryCommands"
			);

			registerRecoveryCommands(mockContext, mockCommandContext as CommandContext);

			const handler = registeredCommands.get("vreko.restoreAllRecent");

			vi.mocked(vscode.window.showWarningMessage).mockResolvedValue(
				"Restore All" as unknown as vscode.MessageItem,
			);

			await handler!();

			// Should fetch recent snapshots
			expect(mockRecoveryService.getRecent).toHaveBeenCalledWith(10);

			// Should call restoreBatch with snapshots
			// NOTE: restoreBatch is called with unique files
			expect(mockRecoveryService.restoreBatch).toHaveBeenCalled();
		});

		it("should open review when Review First is selected", async () => {
			const { registerRecoveryCommands } = await import(
				"../../../src/commands/recoveryCommands"
			);

			registerRecoveryCommands(mockContext, mockCommandContext as CommandContext);

			const handler = registeredCommands.get("vreko.restoreAllRecent");

			vi.mocked(vscode.window.showWarningMessage).mockResolvedValue(
				"Review First" as unknown as vscode.MessageItem,
			);

			await handler!();

			// Should NOT call restore
			expect(mockRecoveryService.restoreBatch).not.toHaveBeenCalled();

			// Should open recent changes view
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"vreko.showRecentChanges",
			);
		});

		it("should show success notification with file count", async () => {
			const { registerRecoveryCommands } = await import(
				"../../../src/commands/recoveryCommands"
			);

			registerRecoveryCommands(mockContext, mockCommandContext as CommandContext);

			const handler = registeredCommands.get("vreko.restoreAllRecent");

			vi.mocked(vscode.window.showWarningMessage).mockResolvedValue(
				"Restore All" as unknown as vscode.MessageItem,
			);

			await handler!();

			// Should show success with file count
			expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
				expect.stringMatching(/Restored \d+ files?/),
			);
		});
	});

	describe("Error Handling", () => {
		it("should handle recoveryService errors gracefully", async () => {
			const { registerRecoveryCommands } = await import(
				"../../../src/commands/recoveryCommands"
			);

			// Make restore fail
			mockRecoveryService.restore = vi
				.fn()
				.mockRejectedValue(new Error("Restore failed"));

			registerRecoveryCommands(mockContext, mockCommandContext as CommandContext);

			const handler = registeredCommands.get("vreko.restoreFromSnapshot");

			vi.mocked(vscode.window.showWarningMessage).mockResolvedValue(
				"Restore" as unknown as vscode.MessageItem,
			);

			const args = {
				filePath: "/test/workspace/src/test.ts",
				snapshotId: "snap-123",
			};

			// Should not throw
			await expect(handler!(args)).resolves.not.toThrow();

			// Should show error message
			expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
				expect.stringContaining("Failed to restore"),
			);
		});

		it("should handle missing snapshot gracefully", async () => {
			const { registerRecoveryCommands } = await import(
				"../../../src/commands/recoveryCommands"
			);

			// Return empty snapshots
			mockRecoveryService.getRecent = vi.fn().mockResolvedValue([]);

			registerRecoveryCommands(mockContext, mockCommandContext as CommandContext);

			const handler = registeredCommands.get("vreko.restoreAllRecent");

			vi.mocked(vscode.window.showWarningMessage).mockResolvedValue(
				"Restore All" as unknown as vscode.MessageItem,
			);

			await handler!();

			// Should show info message when no snapshots
			expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
				expect.stringContaining("No recent snapshots"),
			);

			// Should NOT call restoreBatch
			expect(mockRecoveryService.restoreBatch).not.toHaveBeenCalled();
		});
	});

	describe("Telemetry", () => {
		it("should track recovery_started event with entry_point", async () => {
			// NOTE: Telemetry tracking will be implemented with CoreEventTracker
			// This test documents expected behavior for Phase 1.1 REFACTOR
			const { registerRecoveryCommands } = await import(
				"../../../src/commands/recoveryCommands"
			);

			registerRecoveryCommands(mockContext, mockCommandContext as CommandContext);

			// Track events from different entry points
			// Actual telemetry implementation in REFACTOR phase
		});
	});
});
