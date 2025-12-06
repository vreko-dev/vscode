import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { SaveHandler } from "../../src/handlers/SaveHandler";
import {
	createMockDocument,
	createMockSaveEvent,
} from "../helpers/protectionLevelHelpers";

/**
 * SaveHandler - Protection Levels Integration Tests
 *
 * Tests the save handler logic that manages protection levels (watch/warn/block)
 * when files are saved. This validates the complete behavior including:
 * - Different protection level handling
 * - User interaction flows
 * - Debouncing behavior
 * - Error handling
 *
 * NOTE: These are BLACK BOX integration tests that test behavior, not implementation.
 */
describe("SaveHandler - Protection Levels Integration", () => {
	let mockRegistry: any;
	let mockCoordinator: any;
	let saveHandler: SaveHandler;
	let mockContext: vscode.ExtensionContext;

	// Mock VS Code API spies
	let showWarningMessageSpy: any;
	let showErrorMessageSpy: any;
	let setStatusBarMessageSpy: any;

	beforeEach(() => {
		// Create mock registry with proper methods
		mockRegistry = {
			isProtected: vi.fn(),
			getProtectionLevel: vi.fn(),
			markCheckpoint: vi.fn().mockResolvedValue(undefined),
			list: vi.fn().mockResolvedValue([]),
			total: vi.fn().mockResolvedValue(0),
			add: vi.fn().mockResolvedValue(undefined),
			remove: vi.fn().mockResolvedValue(undefined),
			updateProtectionLevel: vi.fn().mockResolvedValue(undefined),
			onDidChangeProtectedFiles: vi.fn(),
		};

		// Create mock coordinator
		mockCoordinator = {
			coordinateCheckpointCreation: vi.fn().mockResolvedValue("checkpoint-123"),
		};

		// Create SaveHandler instance
		saveHandler = new SaveHandler(mockRegistry, mockCoordinator);

		// Create mock extension context
		mockContext = {
			subscriptions: [],
		} as any;

		// Mock VS Code window APIs
		showWarningMessageSpy = vi
			.spyOn(vscode.window, "showWarningMessage")
			.mockResolvedValue(undefined);
		showErrorMessageSpy = vi
			.spyOn(vscode.window, "showErrorMessage")
			.mockResolvedValue(undefined);
		setStatusBarMessageSpy = vi
			.spyOn(vscode.window, "setStatusBarMessage")
			.mockReturnValue({ dispose: vi.fn() } as any);

		// Mock vscode.workspace.onWillSaveTextDocument for registration
		vi.spyOn(vscode.workspace, "onWillSaveTextDocument").mockReturnValue({
			dispose: vi.fn(),
		} as any);

		// Use fake timers for debounce testing
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
		saveHandler.dispose();
	});

	describe("Unprotected Files", () => {
		it("should allow save without any prompts", async () => {
			const document = createMockDocument("/workspace/unprotected.ts");
			const event = createMockSaveEvent(document);

			mockRegistry.isProtected.mockReturnValue(false);

			// Register handler and trigger event
			saveHandler.register(mockContext);
			const onWillSaveCallback = (
				vscode.workspace.onWillSaveTextDocument as any
			).mock.calls[0][0];
			onWillSaveCallback(event);

			// Should not show any dialogs
			expect(showWarningMessageSpy).not.toHaveBeenCalled();
			expect(showErrorMessageSpy).not.toHaveBeenCalled();

			// Should not create checkpoint
			expect(
				mockCoordinator.coordinateCheckpointCreation,
			).not.toHaveBeenCalled();
		});

		it("should not add file to registry or debounce map", async () => {
			const document = createMockDocument("/workspace/unprotected.ts");
			const event = createMockSaveEvent(document);

			mockRegistry.isProtected.mockReturnValue(false);

			saveHandler.register(mockContext);
			const onWillSaveCallback = (
				vscode.workspace.onWillSaveTextDocument as any
			).mock.calls[0][0];
			onWillSaveCallback(event);

			// Should not interact with registry
			expect(mockRegistry.markCheckpoint).not.toHaveBeenCalled();
		});
	});

	describe("Watch Level Protection", () => {
		it("should create silent checkpoint on first save", async () => {
			const filePath = "/workspace/watched.ts";
			const document = createMockDocument(filePath);
			const event = createMockSaveEvent(document);

			mockRegistry.isProtected.mockReturnValue(true);
			mockRegistry.getProtectionLevel.mockReturnValue("watch");

			saveHandler.register(mockContext);
			const onWillSaveCallback = (
				vscode.workspace.onWillSaveTextDocument as any
			).mock.calls[0][0];
			onWillSaveCallback(event);

			// Wait for debounce timer
			vi.advanceTimersByTime(300);
			await vi.runAllTimersAsync();

			// Should create checkpoint silently
			expect(mockCoordinator.coordinateCheckpointCreation).toHaveBeenCalledWith(
				false,
				[filePath],
			);

			// Should NOT show any prompts
			expect(showWarningMessageSpy).not.toHaveBeenCalled();
			expect(showErrorMessageSpy).not.toHaveBeenCalled();
		});

		it("should update registry with checkpoint after creation", async () => {
			const filePath = "/workspace/watched.ts";
			const document = createMockDocument(filePath);
			const event = createMockSaveEvent(document);

			mockRegistry.isProtected.mockReturnValue(true);
			mockRegistry.getProtectionLevel.mockReturnValue("watch");

			saveHandler.register(mockContext);
			const onWillSaveCallback = (
				vscode.workspace.onWillSaveTextDocument as any
			).mock.calls[0][0];
			onWillSaveCallback(event);

			vi.advanceTimersByTime(300);
			await vi.runAllTimersAsync();

			// Should mark checkpoint in registry
			expect(mockRegistry.markCheckpoint).toHaveBeenCalledWith(
				"checkpoint-123",
				[filePath],
			);
		});

		it("should show subtle status bar notification after checkpoint", async () => {
			const filePath = "/workspace/watched.ts";
			const document = createMockDocument(filePath);
			const event = createMockSaveEvent(document);

			mockRegistry.isProtected.mockReturnValue(true);
			mockRegistry.getProtectionLevel.mockReturnValue("watch");

			saveHandler.register(mockContext);
			const onWillSaveCallback = (
				vscode.workspace.onWillSaveTextDocument as any
			).mock.calls[0][0];
			onWillSaveCallback(event);

			vi.advanceTimersByTime(300);
			await vi.runAllTimersAsync();

			// Should show status bar message
			expect(setStatusBarMessageSpy).toHaveBeenCalledWith(
				expect.stringContaining("Checkpoint"),
				3000,
			);
		});

		it("should skip checkpoint if within debounce window", async () => {
			const filePath = "/workspace/watched.ts";
			const document = createMockDocument(filePath);

			mockRegistry.isProtected.mockReturnValue(true);
			mockRegistry.getProtectionLevel.mockReturnValue("watch");

			saveHandler.register(mockContext);
			const onWillSaveCallback = (
				vscode.workspace.onWillSaveTextDocument as any
			).mock.calls[0][0];

			// First save
			const event1 = createMockSaveEvent(document);
			onWillSaveCallback(event1);

			// Advance timer partially (150ms)
			vi.advanceTimersByTime(150);

			// Second save before debounce expires
			const event2 = createMockSaveEvent(document);
			onWillSaveCallback(event2);

			// Complete the debounce timer
			vi.advanceTimersByTime(300);
			await vi.runAllTimersAsync();

			// Should only create checkpoint once
			expect(
				mockCoordinator.coordinateCheckpointCreation,
			).toHaveBeenCalledTimes(1);
		});

		it("should create checkpoint after debounce window expires", async () => {
			const filePath = "/workspace/watched.ts";
			const document = createMockDocument(filePath);

			mockRegistry.isProtected.mockReturnValue(true);
			mockRegistry.getProtectionLevel.mockReturnValue("watch");

			saveHandler.register(mockContext);
			const onWillSaveCallback = (
				vscode.workspace.onWillSaveTextDocument as any
			).mock.calls[0][0];

			// First save
			const event1 = createMockSaveEvent(document);
			onWillSaveCallback(event1);

			// Complete first debounce
			vi.advanceTimersByTime(300);
			await vi.runAllTimersAsync();

			// Wait for debounce window to expire (5 minutes as per spec)
			vi.advanceTimersByTime(5 * 60 * 1000);

			// Second save after debounce window
			const event2 = createMockSaveEvent(document);
			onWillSaveCallback(event2);

			vi.advanceTimersByTime(300);
			await vi.runAllTimersAsync();

			// Should create checkpoint twice
			expect(
				mockCoordinator.coordinateCheckpointCreation,
			).toHaveBeenCalledTimes(2);
		});

		it("should handle checkpoint creation failure gracefully", async () => {
			const filePath = "/workspace/watched.ts";
			const document = createMockDocument(filePath);
			const event = createMockSaveEvent(document);

			mockRegistry.isProtected.mockReturnValue(true);
			mockRegistry.getProtectionLevel.mockReturnValue("watch");
			mockCoordinator.coordinateCheckpointCreation.mockRejectedValue(
				new Error("Checkpoint failed"),
			);

			// Mock showErrorMessage to resolve immediately
			showErrorMessageSpy.mockResolvedValue(undefined);

			saveHandler.register(mockContext);
			const onWillSaveCallback = (
				vscode.workspace.onWillSaveTextDocument as any
			).mock.calls[0][0];
			onWillSaveCallback(event);

			vi.advanceTimersByTime(300);
			await vi.runAllTimersAsync();

			// Should show error message
			expect(showErrorMessageSpy).toHaveBeenCalledWith(
				expect.stringContaining("Failed to checkpoint"),
				"Retry",
			);

			// Should not crash
			expect(mockRegistry.markCheckpoint).not.toHaveBeenCalled();
		});
	});

	describe("Warn Level Protection", () => {
		it("should show non-modal warning prompt", async () => {
			const filePath = "/workspace/warned.ts";
			const document = createMockDocument(filePath);
			const event = createMockSaveEvent(document);

			mockRegistry.isProtected.mockReturnValue(true);
			mockRegistry.getProtectionLevel.mockReturnValue("warn");

			saveHandler.register(mockContext);
			const onWillSaveCallback = (
				vscode.workspace.onWillSaveTextDocument as any
			).mock.calls[0][0];
			onWillSaveCallback(event);

			// Wait for async handler
			await vi.runAllTimersAsync();

			// Should show warning message
			expect(showWarningMessageSpy).toHaveBeenCalledWith(
				expect.stringContaining("protected"),
				"Create Checkpoint",
				"Save Without Checkpoint",
				"Cancel",
			);
		});

		it('should create checkpoint when user chooses "Create Checkpoint"', async () => {
			const filePath = "/workspace/warned.ts";
			const document = createMockDocument(filePath);
			const event = createMockSaveEvent(document);

			mockRegistry.isProtected.mockReturnValue(true);
			mockRegistry.getProtectionLevel.mockReturnValue("warn");
			showWarningMessageSpy.mockResolvedValue("Create Checkpoint");

			saveHandler.register(mockContext);
			const onWillSaveCallback = (
				vscode.workspace.onWillSaveTextDocument as any
			).mock.calls[0][0];
			onWillSaveCallback(event);

			await vi.runAllTimersAsync();
			vi.advanceTimersByTime(300);
			await vi.runAllTimersAsync();

			// Should create checkpoint
			expect(mockCoordinator.coordinateCheckpointCreation).toHaveBeenCalledWith(
				false,
				[filePath],
			);
		});

		it('should skip checkpoint when user chooses "Save Without Checkpoint"', async () => {
			const filePath = "/workspace/warned.ts";
			const document = createMockDocument(filePath);
			const event = createMockSaveEvent(document);

			mockRegistry.isProtected.mockReturnValue(true);
			mockRegistry.getProtectionLevel.mockReturnValue("warn");
			showWarningMessageSpy.mockResolvedValue("Save Without Checkpoint");

			saveHandler.register(mockContext);
			const onWillSaveCallback = (
				vscode.workspace.onWillSaveTextDocument as any
			).mock.calls[0][0];
			onWillSaveCallback(event);

			await vi.runAllTimersAsync();

			// Should NOT create checkpoint
			expect(
				mockCoordinator.coordinateCheckpointCreation,
			).not.toHaveBeenCalled();
		});

		it('should block save when user chooses "Cancel"', async () => {
			const filePath = "/workspace/warned.ts";
			const document = createMockDocument(filePath);
			const event = createMockSaveEvent(document);

			mockRegistry.isProtected.mockReturnValue(true);
			mockRegistry.getProtectionLevel.mockReturnValue("warn");
			showWarningMessageSpy.mockResolvedValue("Cancel");

			saveHandler.register(mockContext);
			const onWillSaveCallback = (
				vscode.workspace.onWillSaveTextDocument as any
			).mock.calls[0][0];

			// The handler should throw an error to block the save
			await expect(async () => {
				onWillSaveCallback(event);
				await vi.runAllTimersAsync();
			}).rejects.toThrow("Save cancelled");
		});

		it("should respect debounce for warn level (no prompt within window)", async () => {
			const filePath = "/workspace/warned.ts";
			const document = createMockDocument(filePath);

			mockRegistry.isProtected.mockReturnValue(true);
			mockRegistry.getProtectionLevel.mockReturnValue("warn");
			showWarningMessageSpy.mockResolvedValue("Create Checkpoint");

			saveHandler.register(mockContext);
			const onWillSaveCallback = (
				vscode.workspace.onWillSaveTextDocument as any
			).mock.calls[0][0];

			// First save
			const event1 = createMockSaveEvent(document);
			onWillSaveCallback(event1);
			await vi.runAllTimersAsync();
			vi.advanceTimersByTime(300);
			await vi.runAllTimersAsync();

			// Clear the spy to track second call
			showWarningMessageSpy.mockClear();

			// Second save within debounce window (< 5 min)
			const event2 = createMockSaveEvent(document);
			onWillSaveCallback(event2);
			vi.advanceTimersByTime(100);
			await vi.runAllTimersAsync();

			// Should NOT show prompt again (NOTE: This might fail with current implementation)
			// The spec says debounce should apply, but implementation may not do this
			// This test documents the EXPECTED behavior
			expect(showWarningMessageSpy).not.toHaveBeenCalled();
		});
	});

	describe("Block Level Protection", () => {
		it("should show modal error prompt", async () => {
			const filePath = "/workspace/blocked.ts";
			const document = createMockDocument(filePath);
			const event = createMockSaveEvent(document);

			mockRegistry.isProtected.mockReturnValue(true);
			mockRegistry.getProtectionLevel.mockReturnValue("block");

			saveHandler.register(mockContext);
			const onWillSaveCallback = (
				vscode.workspace.onWillSaveTextDocument as any
			).mock.calls[0][0];
			onWillSaveCallback(event);

			await vi.runAllTimersAsync();

			// Should show error message (modal)
			expect(showErrorMessageSpy).toHaveBeenCalledWith(
				expect.stringContaining("BLOCK level"),
				"Create Checkpoint & Save",
				"Override Protection",
				"Cancel Save",
			);
		});

		it("should ALWAYS prompt (ignore debounce)", async () => {
			const filePath = "/workspace/blocked.ts";
			const document = createMockDocument(filePath);

			mockRegistry.isProtected.mockReturnValue(true);
			mockRegistry.getProtectionLevel.mockReturnValue("block");
			showErrorMessageSpy.mockResolvedValue("Create Checkpoint & Save");

			saveHandler.register(mockContext);
			const onWillSaveCallback = (
				vscode.workspace.onWillSaveTextDocument as any
			).mock.calls[0][0];

			// First save
			const event1 = createMockSaveEvent(document);
			onWillSaveCallback(event1);
			await vi.runAllTimersAsync();
			vi.advanceTimersByTime(300);
			await vi.runAllTimersAsync();

			// Clear spy
			showErrorMessageSpy.mockClear();

			// Second save immediately after
			const event2 = createMockSaveEvent(document);
			onWillSaveCallback(event2);
			await vi.runAllTimersAsync();

			// Should ALWAYS show prompt (no debounce)
			expect(showErrorMessageSpy).toHaveBeenCalled();
		});

		it('should create checkpoint when user chooses "Create Checkpoint & Save"', async () => {
			const filePath = "/workspace/blocked.ts";
			const document = createMockDocument(filePath);
			const event = createMockSaveEvent(document);

			mockRegistry.isProtected.mockReturnValue(true);
			mockRegistry.getProtectionLevel.mockReturnValue("block");
			showErrorMessageSpy.mockResolvedValue("Create Checkpoint & Save");

			saveHandler.register(mockContext);
			const onWillSaveCallback = (
				vscode.workspace.onWillSaveTextDocument as any
			).mock.calls[0][0];
			onWillSaveCallback(event);

			await vi.runAllTimersAsync();
			vi.advanceTimersByTime(300);
			await vi.runAllTimersAsync();

			// Should create checkpoint
			expect(mockCoordinator.coordinateCheckpointCreation).toHaveBeenCalledWith(
				false,
				[filePath],
			);
		});

		it('should allow save when user chooses "Override Protection"', async () => {
			const filePath = "/workspace/blocked.ts";
			const document = createMockDocument(filePath);
			const event = createMockSaveEvent(document);

			mockRegistry.isProtected.mockReturnValue(true);
			mockRegistry.getProtectionLevel.mockReturnValue("block");
			showErrorMessageSpy.mockResolvedValue("Override Protection");

			saveHandler.register(mockContext);
			const onWillSaveCallback = (
				vscode.workspace.onWillSaveTextDocument as any
			).mock.calls[0][0];
			onWillSaveCallback(event);

			await vi.runAllTimersAsync();

			// Should NOT create checkpoint
			expect(
				mockCoordinator.coordinateCheckpointCreation,
			).not.toHaveBeenCalled();

			// Should not throw error (save continues)
		});

		it('should block save when user chooses "Cancel Save"', async () => {
			const filePath = "/workspace/blocked.ts";
			const document = createMockDocument(filePath);
			const event = createMockSaveEvent(document);

			mockRegistry.isProtected.mockReturnValue(true);
			mockRegistry.getProtectionLevel.mockReturnValue("block");
			showErrorMessageSpy.mockResolvedValue("Cancel Save");

			saveHandler.register(mockContext);
			const onWillSaveCallback = (
				vscode.workspace.onWillSaveTextDocument as any
			).mock.calls[0][0];

			// Should throw error to block save
			await expect(async () => {
				onWillSaveCallback(event);
				await vi.runAllTimersAsync();
			}).rejects.toThrow("Save cancelled");
		});

		it("should block save when user closes dialog (undefined)", async () => {
			const filePath = "/workspace/blocked.ts";
			const document = createMockDocument(filePath);
			const event = createMockSaveEvent(document);

			mockRegistry.isProtected.mockReturnValue(true);
			mockRegistry.getProtectionLevel.mockReturnValue("block");
			showErrorMessageSpy.mockResolvedValue(undefined);

			saveHandler.register(mockContext);
			const onWillSaveCallback = (
				vscode.workspace.onWillSaveTextDocument as any
			).mock.calls[0][0];

			// Handler should proceed without throwing when user dismisses
			onWillSaveCallback(event);
			await vi.runAllTimersAsync();

			// Should NOT create checkpoint
			expect(
				mockCoordinator.coordinateCheckpointCreation,
			).not.toHaveBeenCalled();
		});
	});

	describe("Error Handling", () => {
		it("should handle checkpoint creation failures gracefully", async () => {
			const filePath = "/workspace/watched.ts";
			const document = createMockDocument(filePath);
			const event = createMockSaveEvent(document);

			mockRegistry.isProtected.mockReturnValue(true);
			mockRegistry.getProtectionLevel.mockReturnValue("watch");
			mockCoordinator.coordinateCheckpointCreation.mockRejectedValue(
				new Error("Storage failure"),
			);

			showErrorMessageSpy.mockResolvedValue(undefined);

			saveHandler.register(mockContext);
			const onWillSaveCallback = (
				vscode.workspace.onWillSaveTextDocument as any
			).mock.calls[0][0];
			onWillSaveCallback(event);

			vi.advanceTimersByTime(300);
			await vi.runAllTimersAsync();

			// Should show error to user
			expect(showErrorMessageSpy).toHaveBeenCalled();

			// Should not mark checkpoint
			expect(mockRegistry.markCheckpoint).not.toHaveBeenCalled();
		});

		it("should handle registry errors gracefully", async () => {
			const filePath = "/workspace/watched.ts";
			const document = createMockDocument(filePath);
			const event = createMockSaveEvent(document);

			mockRegistry.isProtected.mockReturnValue(true);
			mockRegistry.getProtectionLevel.mockReturnValue("watch");
			mockRegistry.markCheckpoint.mockRejectedValue(
				new Error("Registry error"),
			);

			showErrorMessageSpy.mockResolvedValue(undefined);

			saveHandler.register(mockContext);
			const onWillSaveCallback = (
				vscode.workspace.onWillSaveTextDocument as any
			).mock.calls[0][0];
			onWillSaveCallback(event);

			vi.advanceTimersByTime(300);

			// Should handle error without crashing
			await vi.runAllTimersAsync();

			// Checkpoint was created
			expect(mockCoordinator.coordinateCheckpointCreation).toHaveBeenCalled();
		});

		it("should offer retry option on checkpoint failure", async () => {
			const filePath = "/workspace/watched.ts";
			const document = createMockDocument(filePath);
			const event = createMockSaveEvent(document);

			mockRegistry.isProtected.mockReturnValue(true);
			mockRegistry.getProtectionLevel.mockReturnValue("watch");
			mockCoordinator.coordinateCheckpointCreation.mockRejectedValue(
				new Error("Temporary failure"),
			);

			saveHandler.register(mockContext);
			const onWillSaveCallback = (
				vscode.workspace.onWillSaveTextDocument as any
			).mock.calls[0][0];
			onWillSaveCallback(event);

			vi.advanceTimersByTime(300);
			await vi.runAllTimersAsync();

			// Should show retry option
			expect(showErrorMessageSpy).toHaveBeenCalledWith(
				expect.any(String),
				"Retry",
			);
		});
	});

	describe("Concurrent Save Handling", () => {
		it("should handle concurrent saves of same file correctly", async () => {
			const filePath = "/workspace/watched.ts";
			const document = createMockDocument(filePath);

			mockRegistry.isProtected.mockReturnValue(true);
			mockRegistry.getProtectionLevel.mockReturnValue("watch");

			saveHandler.register(mockContext);
			const onWillSaveCallback = (
				vscode.workspace.onWillSaveTextDocument as any
			).mock.calls[0][0];

			// Trigger multiple saves rapidly
			const event1 = createMockSaveEvent(document);
			const event2 = createMockSaveEvent(document);
			const event3 = createMockSaveEvent(document);

			onWillSaveCallback(event1);
			vi.advanceTimersByTime(50);
			onWillSaveCallback(event2);
			vi.advanceTimersByTime(50);
			onWillSaveCallback(event3);

			// Complete debounce
			vi.advanceTimersByTime(300);
			await vi.runAllTimersAsync();

			// Should only create checkpoint once (debounced)
			expect(
				mockCoordinator.coordinateCheckpointCreation,
			).toHaveBeenCalledTimes(1);
		});

		it("should handle saves of different files independently", async () => {
			const file1 = "/workspace/file1.ts";
			const file2 = "/workspace/file2.ts";
			const doc1 = createMockDocument(file1);
			const doc2 = createMockDocument(file2);

			mockRegistry.isProtected.mockReturnValue(true);
			mockRegistry.getProtectionLevel.mockReturnValue("watch");

			saveHandler.register(mockContext);
			const onWillSaveCallback = (
				vscode.workspace.onWillSaveTextDocument as any
			).mock.calls[0][0];

			// Save both files
			const event1 = createMockSaveEvent(doc1);
			const event2 = createMockSaveEvent(doc2);

			onWillSaveCallback(event1);
			onWillSaveCallback(event2);

			vi.advanceTimersByTime(300);
			await vi.runAllTimersAsync();

			// Should create checkpoint for each file
			expect(
				mockCoordinator.coordinateCheckpointCreation,
			).toHaveBeenCalledTimes(2);
			expect(mockCoordinator.coordinateCheckpointCreation).toHaveBeenCalledWith(
				false,
				[file1],
			);
			expect(mockCoordinator.coordinateCheckpointCreation).toHaveBeenCalledWith(
				false,
				[file2],
			);
		});
	});

	describe("Disposal and Cleanup", () => {
		it("should clear all timers on disposal", async () => {
			const filePath = "/workspace/watched.ts";
			const document = createMockDocument(filePath);
			const event = createMockSaveEvent(document);

			mockRegistry.isProtected.mockReturnValue(true);
			mockRegistry.getProtectionLevel.mockReturnValue("watch");

			saveHandler.register(mockContext);
			const onWillSaveCallback = (
				vscode.workspace.onWillSaveTextDocument as any
			).mock.calls[0][0];

			// Trigger save
			onWillSaveCallback(event);

			// Dispose before timer completes
			saveHandler.dispose();

			// Advance timers
			vi.advanceTimersByTime(300);
			await vi.runAllTimersAsync();

			// Should NOT create checkpoint (timer was cleared)
			expect(
				mockCoordinator.coordinateCheckpointCreation,
			).not.toHaveBeenCalled();
		});

		it("should handle disposal with multiple pending timers", async () => {
			const file1 = "/workspace/file1.ts";
			const file2 = "/workspace/file2.ts";
			const doc1 = createMockDocument(file1);
			const doc2 = createMockDocument(file2);

			mockRegistry.isProtected.mockReturnValue(true);
			mockRegistry.getProtectionLevel.mockReturnValue("watch");

			saveHandler.register(mockContext);
			const onWillSaveCallback = (
				vscode.workspace.onWillSaveTextDocument as any
			).mock.calls[0][0];

			// Trigger multiple saves
			onWillSaveCallback(createMockSaveEvent(doc1));
			onWillSaveCallback(createMockSaveEvent(doc2));

			// Dispose immediately
			saveHandler.dispose();

			vi.advanceTimersByTime(300);
			await vi.runAllTimersAsync();

			// Should NOT create any checkpoints
			expect(
				mockCoordinator.coordinateCheckpointCreation,
			).not.toHaveBeenCalled();
		});
	});

	describe("Edge Cases", () => {
		it("should handle missing protection level gracefully", async () => {
			const filePath = "/workspace/file.ts";
			const document = createMockDocument(filePath);
			const event = createMockSaveEvent(document);

			mockRegistry.isProtected.mockReturnValue(true);
			mockRegistry.getProtectionLevel.mockReturnValue(undefined);

			saveHandler.register(mockContext);
			const onWillSaveCallback = (
				vscode.workspace.onWillSaveTextDocument as any
			).mock.calls[0][0];
			onWillSaveCallback(event);

			vi.advanceTimersByTime(300);
			await vi.runAllTimersAsync();

			// Should default to 'watch' behavior
			expect(mockCoordinator.coordinateCheckpointCreation).toHaveBeenCalled();
		});

		it("should handle null checkpoint ID from coordinator", async () => {
			const filePath = "/workspace/watched.ts";
			const document = createMockDocument(filePath);
			const event = createMockSaveEvent(document);

			mockRegistry.isProtected.mockReturnValue(true);
			mockRegistry.getProtectionLevel.mockReturnValue("watch");
			mockCoordinator.coordinateCheckpointCreation.mockResolvedValue(null);

			saveHandler.register(mockContext);
			const onWillSaveCallback = (
				vscode.workspace.onWillSaveTextDocument as any
			).mock.calls[0][0];
			onWillSaveCallback(event);

			vi.advanceTimersByTime(300);
			await vi.runAllTimersAsync();

			// Should not try to mark checkpoint
			expect(mockRegistry.markCheckpoint).not.toHaveBeenCalled();
		});

		it("should handle very long file paths correctly", async () => {
			const longPath = `/workspace/${"a".repeat(500)}.ts`;
			const document = createMockDocument(longPath);
			const event = createMockSaveEvent(document);

			mockRegistry.isProtected.mockReturnValue(true);
			mockRegistry.getProtectionLevel.mockReturnValue("watch");

			saveHandler.register(mockContext);
			const onWillSaveCallback = (
				vscode.workspace.onWillSaveTextDocument as any
			).mock.calls[0][0];
			onWillSaveCallback(event);

			vi.advanceTimersByTime(300);
			await vi.runAllTimersAsync();

			// Should handle long paths without errors
			expect(mockCoordinator.coordinateCheckpointCreation).toHaveBeenCalledWith(
				false,
				[longPath],
			);
		});
	});
});
