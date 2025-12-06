import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { SaveHandler } from "../../../src/handlers/SaveHandler";
import { ProtectedFileRegistry } from "../../../src/services/protectedFileRegistry";

// Mock all SaveHandler dependencies at module level (hoisted)
vi.mock("../../../src/handlers/AnalysisCoordinator.js", () => ({
	AnalysisCoordinator: vi.fn().mockImplementation(() => ({
		analyzeAndPublish: vi.fn(async () => undefined),
		dispose: vi.fn(),
		lastAnalysisResult: null,
	})),
}));

vi.mock("../../../src/handlers/ProtectionLevelHandler.js", () => ({
	ProtectionLevelHandler: vi.fn().mockImplementation(() => ({
		handleProtectionLevel: vi.fn(async () => ({
			shouldSnapshot: false,
			reason: "test",
			snapshotId: undefined,
		})),
	})),
}));

vi.mock("../../../src/services/CooldownService.js", () => ({
	CooldownService: vi.fn().mockImplementation(() => ({
		setCooldownIndicator: vi.fn(),
		clearAll: vi.fn(),
	})),
}));

vi.mock("../../../src/services/AuditLogger.js", () => ({
	AuditLogger: vi.fn().mockImplementation(() => ({})),
}));

vi.mock("../../../src/ui/AIWarningManager.js", () => ({
	AIWarningManager: vi.fn().mockImplementation(() => ({
		showWarning: vi.fn(async () => ({ success: false, error: new Error("test") })),
	})),
	shouldWarn: vi.fn(() => false),
}));

vi.mock("../../../src/ai/AIRiskService.js", () => ({
	NoopAIRiskService: vi.fn().mockImplementation(() => ({})),
}));

describe("SaveHandler Behavior Tests", () => {
	let saveHandler: SaveHandler;
	let registry: ProtectedFileRegistry;
	let mockOperationCoordinator: any;
	let mockStorage: Map<string, any>;
	let context: vscode.ExtensionContext;
	let onWillSaveHandlers: Array<(event: any) => void>;

	beforeEach(() => {
		onWillSaveHandlers = [];

		// Create proper storage mock
		mockStorage = new Map();
		const mockState = {
			get: (key: string, defaultValue?: any) => {
				return mockStorage.get(key) ?? defaultValue;
			},
			update: async (key: string, value: any) => {
				mockStorage.set(key, value);
			},
		};

		registry = new ProtectedFileRegistry(mockState as any);

		// Mock operation coordinator with spy
		mockOperationCoordinator = {
			coordinateCheckpointCreation: vi.fn(
				async (_showNotification: boolean, files?: string[]) => {
					// CRITICAL: Verify files parameter is passed correctly
					if (!files || files.length === 0) {
						throw new Error(
							"coordinateCheckpointCreation called with empty files array!",
						);
					}
					return `checkpoint-${Date.now()}`;
				},
			),
		};

		// Spy on onWillSaveTextDocument
		vi.spyOn(vscode.workspace, "onWillSaveTextDocument").mockImplementation(
			(handler: any) => {
				onWillSaveHandlers.push(handler);
				return { dispose: vi.fn() };
			},
		);
		vi.spyOn(vscode.workspace, "applyEdit").mockResolvedValue(true);
		vi.spyOn(vscode.workspace.fs, "readFile").mockResolvedValue(
			Buffer.from("/* disk snapshot */", "utf8"),
		);

		// Create context with globalState
		context = {
			subscriptions: [],
			globalState: {
				get: vi.fn((key: string, defaultValue?: any) => defaultValue),
				update: vi.fn(async () => undefined),
				setKeysForSync: vi.fn(),
			},
		} as any;

		// Initialize save handler
		saveHandler = new SaveHandler(registry, mockOperationCoordinator);
		saveHandler.register(context);
	});

	afterEach(async () => {
		saveHandler.dispose();
		await registry.clearAll();
		vi.restoreAllMocks();
	});

	const triggerSave = async (saveEvent: any) => {
		for (const handler of onWillSaveHandlers) {
			handler(saveEvent);
		}
		expect(saveEvent.waitUntil).toHaveBeenCalled();
		return saveEvent.waitUntil.mock.calls[0][0];
	};

	// Helper to create properly mocked save events
	const createSaveEvent = (filePath: string, content: string = "const test = 1;") => ({
		document: {
			uri: vscode.Uri.file(filePath),
			fileName: filePath,
			getText: vi.fn().mockReturnValue(content),
		},
		waitUntil: vi.fn(),
	});

	/**
	 * CRITICAL TEST: Verifies correct file path is passed to coordinateCheckpointCreation
	 * REGRESSION BUG #1: Entire workspace checkpointed instead of single saved file
	 */
	it("Should pass correct file path to coordinateCheckpointCreation", async () => {
		const testFilePath = "/test/workspace/important-file.ts";

		// Protect the file
		await registry.add(testFilePath);

		// Create save event using helper
		const saveEvent = createSaveEvent(testFilePath);

		const promise = await triggerSave(saveEvent);
		await promise;

		// CRITICAL ASSERTIONS
		expect(
			mockOperationCoordinator.coordinateCheckpointCreation,
		).toHaveBeenCalled();

		// Verify the correct arguments were passed
		const callArgs =
			mockOperationCoordinator.coordinateCheckpointCreation.mock.calls[0];
		const showNotification = callArgs[0];
		const filesArray = callArgs[1];

		// Should NOT show notification for auto-checkpoints
		expect(showNotification).toBe(false);

		// CRITICAL: Files array should contain ONLY the saved file
		expect(filesArray).toBeDefined();
		expect(Array.isArray(filesArray)).toBe(true);
		expect(filesArray.length).toBe(1);
		expect(filesArray[0]).toBe("important-file.ts"); // Should be relative path
	});

	/**
	 * CRITICAL TEST: Files array must never be empty or undefined
	 * REGRESSION BUG #1: Empty/undefined files array causes full workspace scan
	 */
	it("Should never pass empty or undefined files array", async () => {
		const testFilePath = "/test/workspace/protected.ts";
		await registry.add(testFilePath);

		const saveEvent = createSaveEvent(testFilePath, "const protected = true;");

		const promise = await triggerSave(saveEvent);
		await promise;

		// Verify files array is never empty or undefined
		const callArgs =
			mockOperationCoordinator.coordinateCheckpointCreation.mock.calls[0];
		const filesArray = callArgs[1];

		expect(filesArray).toBeDefined();
		expect(filesArray).not.toBeUndefined();
		expect(filesArray).not.toBeNull();
		expect(Array.isArray(filesArray)).toBe(true);
		expect(filesArray.length).toBeGreaterThan(0);
	});

	/**
	 * CRITICAL TEST: Block Cancel MUST Actually Prevent Save
	 * REGRESSION BUG #2: Cancel button didn't actually block the save
	 *
	 * This test verifies that when a user clicks "Cancel" on a block-level
	 * protected file, the save operation is ACTUALLY cancelled by throwing
	 * a CancellationError.
	 */
	describe("Block Level Protection", () => {
		it("Should throw CancellationError when user cancels block-level save", async () => {
			const testFilePath = "/test/workspace/critical.ts";

			// Protect file at BLOCK level
			await registry.add(testFilePath, { protectionLevel: "block" });

			// Mock user clicking "Cancel" button
			const showErrorMessageSpy = vi
				.spyOn(vscode.window, "showErrorMessage")
				.mockResolvedValue(undefined); // undefined = cancelled/no choice

			const saveEvent = createSaveEvent(testFilePath, "const critical = true;");

			// Trigger save handler
			for (const handler of onWillSaveHandlers) {
				handler(saveEvent);
			}

			// Verify error message was shown
			expect(showErrorMessageSpy).toHaveBeenCalled();

			// CRITICAL ASSERTION: Verify waitUntil was called with a promise
			expect(saveEvent.waitUntil).toHaveBeenCalled();

			// Get the promise passed to waitUntil
			const promise = saveEvent.waitUntil.mock.calls[0][0];

			// CRITICAL: The promise should be rejected with CancellationError
			await expect(promise).rejects.toBeInstanceOf(vscode.CancellationError);

			// Verify checkpoint was NOT created
			expect(
				mockOperationCoordinator.coordinateCheckpointCreation,
			).not.toHaveBeenCalled();

			showErrorMessageSpy.mockRestore();
		});

		it("Should create checkpoint when user confirms block-level save", async () => {
			const testFilePath = "/test/workspace/critical.ts";

			// Protect file at BLOCK level
			await registry.add(testFilePath, { protectionLevel: "block" });

			// Mock user clicking "Create Snapshot & Save" button
			const showErrorMessageSpy = vi
				.spyOn(vscode.window, "showErrorMessage")
				.mockResolvedValue("Create Snapshot & Save" as any);

			const saveEvent = {
				document: {
					uri: vscode.Uri.file(testFilePath),
					getText: () => "const critical = true;",
				},
				waitUntil: vi.fn(),
			};

			// Trigger save handler
			for (const handler of onWillSaveHandlers) {
				handler(saveEvent);
			}

			expect(saveEvent.waitUntil).toHaveBeenCalled();
			const promise = saveEvent.waitUntil.mock.calls[0][0];
			await expect(promise).resolves.toBeUndefined();

			// Verify checkpoint WAS created
			expect(
				mockOperationCoordinator.coordinateCheckpointCreation,
			).toHaveBeenCalled();

			showErrorMessageSpy.mockRestore();
		});

		it("Should also throw CancellationError for explicit 'Cancel' button click", async () => {
			const testFilePath = "/test/workspace/important.ts";

			await registry.add(testFilePath, { protectionLevel: "block" });

			// Mock user explicitly clicking "Cancel" button
			const showErrorMessageSpy = vi
				.spyOn(vscode.window, "showErrorMessage")
				.mockResolvedValue("Cancel" as any);

			const saveEvent = {
				document: {
					uri: vscode.Uri.file(testFilePath),
					getText: vi.fn().mockReturnValue("const important = true;"),
				},
				waitUntil: vi.fn(),
			};

			const promise = await triggerSave(saveEvent);
			// CRITICAL: Should throw CancellationError
			await expect(promise).rejects.toBeInstanceOf(vscode.CancellationError);

			showErrorMessageSpy.mockRestore();
		});
	});

	/**
	 * CRITICAL TEST: Warn Level Cancel Behavior
	 */
	describe("Warn Level Protection", () => {
		it("Should throw CancellationError when user cancels warn-level save", async () => {
			const testFilePath = "/test/workspace/important.ts";

			await registry.add(testFilePath, { protectionLevel: "warn" });

			// Mock user clicking "Cancel"
			const showWarningMessageSpy = vi
				.spyOn(vscode.window, "showWarningMessage")
				.mockResolvedValue("Cancel" as any);

			const saveEvent = {
				document: {
					uri: vscode.Uri.file(testFilePath),
					getText: vi.fn().mockReturnValue("const data = true;"),
				},
				waitUntil: vi.fn(),
			};

			const promise = await triggerSave(saveEvent);

			// Should throw CancellationError
			await expect(promise).rejects.toBeInstanceOf(vscode.CancellationError);

			showWarningMessageSpy.mockRestore();
		});

		it("Should allow save when user clicks 'Skip Checkpoint'", async () => {
			const testFilePath = "/test/workspace/file.ts";

			await registry.add(testFilePath, { protectionLevel: "warn" });

			// Mock user clicking "Skip Snapshot"
			const showWarningMessageSpy = vi
				.spyOn(vscode.window, "showWarningMessage")
				.mockResolvedValue("Skip Snapshot" as any);

			const saveEvent = {
				document: {
					uri: vscode.Uri.file(testFilePath),
					getText: vi.fn().mockReturnValue("const skip = true;"),
				},
				waitUntil: vi.fn(),
			};

			for (const handler of onWillSaveHandlers) {
				handler(saveEvent);
			}

			expect(saveEvent.waitUntil).toHaveBeenCalled();
			const promise = saveEvent.waitUntil.mock.calls[0][0];

			// Should NOT throw - save is allowed
			await expect(promise).resolves.toBeUndefined();

			// Checkpoint should NOT be created
			expect(
				mockOperationCoordinator.coordinateCheckpointCreation,
			).not.toHaveBeenCalled();

			showWarningMessageSpy.mockRestore();
		});
	});

	/**
	 * TEST: Verify debouncing of rapid saves
	 */
	it("Should debounce rapid saves within 300ms window", async () => {
		const testFilePath = "/test/workspace/rapid-save.ts";
		await registry.add(testFilePath);

		const saveEvent = {
			document: {
				uri: vscode.Uri.file(testFilePath),
				getText: vi.fn().mockReturnValue("const rapid = true;"),
			},
			waitUntil: vi.fn(),
		};

		// Trigger 5 rapid saves within 250ms
		for (let i = 0; i < 5; i++) {
			for (const handler of onWillSaveHandlers) {
				handler(saveEvent);
			}
			await new Promise((resolve) => setTimeout(resolve, 50));
		}

		// Wait for debounce window + execution
		await new Promise((resolve) => setTimeout(resolve, 500));

		// Should only create 1 checkpoint (debounced)
		expect(
			mockOperationCoordinator.coordinateCheckpointCreation,
		).toHaveBeenCalledTimes(1);
	});

	/**
	 * CRITICAL TEST: Unprotected files should NOT trigger checkpoints
	 * REGRESSION BUG #4: Checkpoint created on protect instead of save
	 */
	it("Should NOT checkpoint unprotected files", async () => {
		const unprotectedFile = "/test/workspace/unprotected.ts";

		// DO NOT protect the file
		// Verify it's not protected
		expect(registry.isProtected(unprotectedFile)).toBe(false);

		const saveEvent = {
			document: {
				uri: vscode.Uri.file(unprotectedFile),
				getText: vi.fn().mockReturnValue("const unprotected = true;"),
			},
			waitUntil: vi.fn(),
		};

		// Trigger save
		for (const handler of onWillSaveHandlers) {
			handler(saveEvent);
		}

		await new Promise((resolve) => setTimeout(resolve, 500));

		// CRITICAL: Should NOT have created checkpoint
		expect(
			mockOperationCoordinator.coordinateCheckpointCreation,
		).not.toHaveBeenCalled();
	});

	/**
	 * TEST: Verify waitUntil is called synchronously
	 */
	it("Should call waitUntil synchronously in onWillSave handler", async () => {
		const testFilePath = "/test/workspace/sync-test.ts";
		await registry.add(testFilePath);

		const saveEvent = {
			document: {
				uri: vscode.Uri.file(testFilePath),
				getText: vi.fn().mockReturnValue("const sync = true;"),
			},
			waitUntil: vi.fn(),
		};

		// Trigger save handler
		for (const handler of onWillSaveHandlers) {
			handler(saveEvent);
		}

		// waitUntil should be called IMMEDIATELY (synchronously)
		expect(saveEvent.waitUntil).toHaveBeenCalled();
	});

	/**
	 * TEST: Multiple files can be saved independently
	 */
	it("Should handle saves of multiple protected files", async () => {
		const file1 = "/test/workspace/file1.ts";
		const file2 = "/test/workspace/file2.ts";

		await registry.add(file1);
		await registry.add(file2);

		// Save file1
		const saveEvent1 = {
			document: {
				uri: vscode.Uri.file(file1),
				getText: () => "const file1 = true;",
			},
			waitUntil: vi.fn(),
		};

		for (const handler of onWillSaveHandlers) {
			handler(saveEvent1);
		}

		await new Promise((resolve) => setTimeout(resolve, 500));

		// Reset mock
		vi.clearAllMocks();

		// Save file2
		const saveEvent2 = {
			document: {
				uri: vscode.Uri.file(file2),
				getText: () => "const file2 = true;",
			},
			waitUntil: vi.fn(),
		};

		for (const handler of onWillSaveHandlers) {
			handler(saveEvent2);
		}

		await new Promise((resolve) => setTimeout(resolve, 500));

		// Both should have triggered checkpoints
		expect(
			mockOperationCoordinator.coordinateCheckpointCreation,
		).toHaveBeenCalledTimes(1);

		// Verify correct file paths
		const call1Args =
			mockOperationCoordinator.coordinateCheckpointCreation.mock.calls[0];
		expect(call1Args[1][0]).toBe("file2.ts"); // Should be relative path
	});

	/**
	 * TEST: Error handling during checkpoint creation
	 */
	it("Should handle checkpoint creation errors gracefully", async () => {
		const testFilePath = "/test/workspace/error-test.ts";
		await registry.add(testFilePath);

		// Make coordinator throw error
		mockOperationCoordinator.coordinateCheckpointCreation.mockRejectedValueOnce(
			new Error("Storage failure"),
		);

		const saveEvent = {
			document: {
				uri: vscode.Uri.file(testFilePath),
				getText: () => "const error = true;",
			},
			waitUntil: vi.fn(),
		};

		// Trigger save
		for (const handler of onWillSaveHandlers) {
			handler(saveEvent);
		}

		await new Promise((resolve) => setTimeout(resolve, 500));

		// Should have attempted checkpoint creation
		expect(
			mockOperationCoordinator.coordinateCheckpointCreation,
		).toHaveBeenCalled();

		// Error should be handled (not crash the extension)
		// This is verified by the test completing without throwing
	});

	/**
	 * TEST: Immediate snapshot creation does not rely on timers
	 *
	 * Legacy behaviour used debounced timers; the current implementation creates
	 * the snapshot synchronously so disposing the handler after the trigger
	 * should not prevent the snapshot from being scheduled.
	 */
	it("Should still create snapshot even if handler is disposed after trigger", async () => {
		const testFilePath = "/test/workspace/dispose-test.ts";
		await registry.add(testFilePath);

		const saveEvent = {
			document: {
				uri: vscode.Uri.file(testFilePath),
				getText: () => "const dispose = true;",
			},
			waitUntil: vi.fn(),
		};

		// Trigger save but don't wait for debounce
		for (const handler of onWillSaveHandlers) {
			handler(saveEvent);
		}

		// Immediately dispose
		saveHandler.dispose();

		// Wait for what would have been the debounce period
		await new Promise((resolve) => setTimeout(resolve, 500));

		// The synchronous implementation should already have scheduled creation
		expect(
			mockOperationCoordinator.coordinateCheckpointCreation,
		).toHaveBeenCalled();
	});

	/**
	 * TEST: Notification Auto-Dismiss Behavior
	 * BUG FIX #4: Verify status bar messages are used instead of showInformationMessage
	 */
	describe("Notification Auto-Dismiss", () => {
		it("Should use setStatusBarMessage for snapshot created notification", async () => {
			const testFilePath = "/test/workspace/notify-test.ts";
			await registry.add(testFilePath);

			const setStatusBarMessageSpy = vi.spyOn(
				vscode.window,
				"setStatusBarMessage",
			);

			const saveEvent = {
				document: {
					uri: vscode.Uri.file(testFilePath),
					getText: () => "const notify = true;",
				},
				waitUntil: vi.fn(),
			};

			for (const handler of onWillSaveHandlers) {
				handler(saveEvent);
			}

			await new Promise((resolve) => setTimeout(resolve, 500));

			// CRITICAL: Should use setStatusBarMessage with 2-second timeout
			expect(setStatusBarMessageSpy).toHaveBeenCalled();

			setStatusBarMessageSpy.mockRestore();
		});

		it("Should use setStatusBarMessage for cancel notification", async () => {
			const testFilePath = "/test/workspace/cancel-test.ts";
			await registry.add(testFilePath, { protectionLevel: "block" });

			const setStatusBarMessageSpy = vi.spyOn(
				vscode.window,
				"setStatusBarMessage",
			);
			const showErrorMessageSpy = vi
				.spyOn(vscode.window, "showErrorMessage")
				.mockResolvedValue("Cancel" as any);

			const saveEvent = {
				document: {
					uri: vscode.Uri.file(testFilePath),
					getText: () => "const cancel = true;",
				},
				waitUntil: vi.fn(),
			};

			for (const handler of onWillSaveHandlers) {
				handler(saveEvent);
			}

			await new Promise((resolve) => setTimeout(resolve, 500));

			// Should use setStatusBarMessage with 2-second timeout
			expect(setStatusBarMessageSpy).toHaveBeenCalled();

			setStatusBarMessageSpy.mockRestore();
			showErrorMessageSpy.mockRestore();
		});
	});
});
