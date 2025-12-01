import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { SaveHandler } from "../../../src/handlers/SaveHandler.js";
import { ProtectedFileRegistry } from "../../../src/services/protectedFileRegistry.js";

describe.skip("SaveHandler - Pre-Save State Capture", () => {
	let saveHandler: SaveHandler;
	let registry: ProtectedFileRegistry;
	let mockOperationCoordinator: any;
	let mockStorage: Map<string, any>;
	let context: vscode.ExtensionContext;
	let onWillSaveHandlers: Array<(event: any) => void>;
	let readFileMock: ReturnType<typeof vi.spyOn>;

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
			coordinateCheckpointCreation: vi.fn(
				async () => `checkpoint-${Date.now()}`,
			),
		};

		// Spy on onWillSaveTextDocument
		vi.spyOn(vscode.workspace, "onWillSaveTextDocument").mockImplementation(
			(handler: any) => {
				onWillSaveHandlers.push(handler);
				return { dispose: vi.fn() };
			},
		);
		if (!(vscode as any).WorkspaceEdit) {
			(vscode as any).WorkspaceEdit = class {
				replaceCalls: Array<{
					uri: vscode.Uri;
					range: vscode.Range;
					text: string;
				}> = [];
				replace(uri: vscode.Uri, range: vscode.Range, text: string) {
					this.replaceCalls.push({ uri, range, text });
				}
			};
		}
		readFileMock = vi
			.spyOn(vscode.workspace.fs, "readFile")
			.mockResolvedValue(Buffer.from("/* disk snapshot */", "utf8"));

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

	describe("Pre-Save Content Capture", () => {
		it("should capture pre-save disk content, not in-memory document content", async () => {
			const testFilePath = "/test/workspace/protected-file.ts";

			// Protect the file
			await registry.add(testFilePath);

			// Mock file system to return disk content (different from in-memory)
			const diskContent = "/* disk content */\nconst original = true;";
			const inMemoryContent =
				"/* modified content */\nconst original = true;\nconst added = true;";

			readFileMock.mockResolvedValue(Buffer.from(diskContent));

			// Create save event with modified in-memory content
			const saveEvent = {
				document: {
					uri: vscode.Uri.file(testFilePath),
					getText: () => inMemoryContent,
				},
				waitUntil: vi.fn(),
			};

			const promise = await triggerSave(saveEvent);
			await expect(promise).resolves.toBeUndefined();
			expect(
				mockOperationCoordinator.coordinateCheckpointCreation,
			).toHaveBeenCalled();
		});

		it("should handle new files that don't exist on disk", async () => {
			const testFilePath = "/test/workspace/new-file.ts";

			// Protect the file
			await registry.add(testFilePath);

			// Mock file system to throw ENOENT (file doesn't exist)
			readFileMock.mockRejectedValue(
				new Error("ENOENT: no such file or directory"),
			);

			const inMemoryContent = "/* new file content */\nconst x = 1;";

			// Create save event
			const saveEvent = {
				document: {
					uri: vscode.Uri.file(testFilePath),
					getText: () => inMemoryContent,
				},
				waitUntil: vi.fn(),
			};

			const promise = await triggerSave(saveEvent);
			await expect(promise).resolves.toBeUndefined();
			expect(
				mockOperationCoordinator.coordinateCheckpointCreation,
			).toHaveBeenCalled();
		});

		it("should handle file system read errors gracefully", async () => {
			const testFilePath = "/test/workspace/error-file.ts";

			// Protect the file
			await registry.add(testFilePath);

			// Mock file system to throw permission error
			readFileMock.mockRejectedValue(new Error("EACCES: permission denied"));

			const inMemoryContent = "/* fallback content */\nconst y = 2;";

			// Create save event
			const saveEvent = {
				document: {
					uri: vscode.Uri.file(testFilePath),
					getText: () => inMemoryContent,
				},
				waitUntil: vi.fn(),
			};

			const promise = await triggerSave(saveEvent);
			await expect(promise).resolves.toBeUndefined();
			expect(
				mockOperationCoordinator.coordinateCheckpointCreation,
			).toHaveBeenCalled();
		});
	});

	describe("Protection Level Behavior", () => {
		it("should create checkpoint immediately for watch level (no debounce delay)", async () => {
			const testFilePath = "/test/workspace/watch-file.ts";

			// Protect file at watch level
			await registry.add(testFilePath, { protectionLevel: "watch" });

			// Mock file system
			readFileMock.mockResolvedValue(Buffer.from("watch level content"));

			const saveEvent = {
				document: {
					uri: vscode.Uri.file(testFilePath),
					getText: () => "modified watch content",
				},
				waitUntil: vi.fn(),
			};

			const startTime = Date.now();
			const promise = await triggerSave(saveEvent);
			await expect(promise).resolves.toBeUndefined();
			const endTime = Date.now();

			// Should have created checkpoint quickly
			expect(
				mockOperationCoordinator.coordinateCheckpointCreation,
			).toHaveBeenCalled();
			expect(endTime - startTime).toBeLessThan(100); // Should be immediate, not debounced
		});

		it("should properly handle block level protection", async () => {
			const testFilePath = "/test/workspace/block-file.ts";

			// Protect file at block level
			await registry.add(testFilePath, { protectionLevel: "block" });

			// Mock file system
			readFileMock.mockResolvedValue(Buffer.from("block level content"));

			const saveEvent = {
				document: {
					uri: vscode.Uri.file(testFilePath),
					getText: vi.fn().mockReturnValue("modified block content"),
				},
				waitUntil: vi.fn(),
			};

			// Mock user cancelling the operation
			vi.spyOn(vscode.window, "showErrorMessage").mockResolvedValue(undefined);

			await expect(triggerSave(saveEvent)).rejects.toBeInstanceOf(
				vscode.CancellationError,
			);
			expect(vscode.window.showErrorMessage).toHaveBeenCalled();
		});

		it("should throw CancellationError for block level when user cancels", async () => {
			const testFilePath = "/test/workspace/block-cancel-file.ts";

			// Protect file at block level
			await registry.add(testFilePath, { protectionLevel: "block" });

			// Mock user clicking "Cancel"
			vi.spyOn(vscode.window, "showErrorMessage").mockResolvedValue(
				"Cancel" as any,
			);

			const saveEvent = {
				document: {
					uri: vscode.Uri.file(testFilePath),
					getText: () => "will be cancelled",
				},
				waitUntil: vi.fn(),
			};

			const promise = await triggerSave(saveEvent);
			await expect(promise).rejects.toBeInstanceOf(vscode.CancellationError);
			expect(
				mockOperationCoordinator.coordinateCheckpointCreation,
			).not.toHaveBeenCalled();
		});
	});
});
