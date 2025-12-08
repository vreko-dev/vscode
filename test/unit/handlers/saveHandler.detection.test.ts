import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { SaveHandler } from "@vscode/handlers/SaveHandler";
import { ProtectedFileRegistry } from "@vscode/services/protectedFileRegistry";

describe("SaveHandler Detection Integration Tests", () => {
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

		// Mock operation coordinator
		mockOperationCoordinator = {
			coordinateSnapshotCreation: vi.fn(async () => {
				return `snapshot-${Date.now()}`;
			}),
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
			Buffer.from("/* disk content */", "utf8"),
		);

		// Create context
		context = { subscriptions: [] } as any;

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

	/**
	 * Test that the SaveHandler correctly detects secrets in code
	 */
	it("Should detect secrets and show warning for critical issues", async () => {
		const testFilePath = "/test/workspace/secret-file.ts";

		// Protect the file
		await registry.add(testFilePath);

		// Mock user interaction - click "Save Anyway"
		const showWarningMessageSpy = vi
			.spyOn(vscode.window, "showWarningMessage")
			.mockResolvedValue({ title: "Save Anyway" } as vscode.MessageItem);

		const saveEvent = {
			document: {
				uri: vscode.Uri.file(testFilePath),
				getText: () => "const apiKey = 'sk-1234567890abcdef1234567890abcdef';",
			},
			waitUntil: vi.fn(),
		};

		const promise = await triggerSave(saveEvent);

		// Should show warning message for critical security issues
		expect(showWarningMessageSpy).toHaveBeenCalled();

		// Should still allow save to proceed
		await expect(promise).resolves.toBeUndefined();
	});

	/**
	 * Test that the SaveHandler blocks save when user chooses to cancel
	 */
	it("Should block save when user cancels due to security issues", async () => {
		const testFilePath = "/test/workspace/secret-file.ts";

		// Protect the file
		await registry.add(testFilePath);

		// Mock user interaction - click "Cancel Save"
		const showWarningMessageSpy = vi
			.spyOn(vscode.window, "showWarningMessage")
			.mockResolvedValue({ title: "Cancel Save" } as vscode.MessageItem);

		const saveEvent = {
			document: {
				uri: vscode.Uri.file(testFilePath),
				getText: () => "const password = 'supersecretpassword123';",
			},
			waitUntil: vi.fn(),
		};

		const promise = await triggerSave(saveEvent);

		// Should show warning message for critical security issues
		expect(showWarningMessageSpy).toHaveBeenCalled();

		// Should reject with CancellationError
		await expect(promise).rejects.toBeInstanceOf(vscode.CancellationError);
	});

	/**
	 * Test that the SaveHandler shows status bar message for medium severity issues
	 */
	it("Should show status bar message for medium severity issues", async () => {
		const testFilePath = "/test/workspace/mock-file.ts";

		// Protect the file
		await registry.add(testFilePath);

		// Mock status bar message
		const setStatusBarMessageSpy = vi
			.spyOn(vscode.window, "setStatusBarMessage")
			.mockReturnValue({ dispose: vi.fn() } as vscode.Disposable);

		const saveEvent = {
			document: {
				uri: vscode.Uri.file(testFilePath),
				getText: () =>
					"const mock = { data: 'test' }; // Mock data for testing",
			},
			waitUntil: vi.fn(),
		};

		const promise = await triggerSave(saveEvent);

		// Should show status bar message for medium security issues
		expect(setStatusBarMessageSpy).toHaveBeenCalledWith(
			expect.stringContaining("Medium security issues detected"),
			5000,
		);

		// Should still allow save to proceed
		await expect(promise).resolves.toBeUndefined();
	});

	/**
	 * Test that the SaveHandler handles high severity issues appropriately
	 */
	it("Should handle high severity issues with review option", async () => {
		const testFilePath = "/test/workspace/phantom-file.ts";

		// Protect the file
		await registry.add(testFilePath);

		// Mock user interaction - click "Review Issues"
		const showWarningMessageSpy = vi
			.spyOn(vscode.window, "showWarningMessage")
			.mockResolvedValue({ title: "Review Issues" } as vscode.MessageItem);

		const showInformationMessageSpy = vi
			.spyOn(vscode.window, "showInformationMessage")
			.mockResolvedValue(undefined);

		const saveEvent = {
			document: {
				uri: vscode.Uri.file(testFilePath),
				getText: () => "import { someModule } from 'non-existent-package';",
			},
			waitUntil: vi.fn(),
		};

		const promise = await triggerSave(saveEvent);

		// Should show warning message for high security issues
		expect(showWarningMessageSpy).toHaveBeenCalled();

		// Should show information message with details
		expect(showInformationMessageSpy).toHaveBeenCalled();

		// Should still allow save to proceed
		await expect(promise).resolves.toBeUndefined();
	});
});
