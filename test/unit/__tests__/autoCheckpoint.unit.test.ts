import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { SaveHandler } from "../../../src/handlers/SaveHandler.js";
import { ProtectedFileRegistry } from "../../../src/services/protectedFileRegistry.js";

describe("Auto-Checkpoint on Save Tests", () => {
	let registry: ProtectedFileRegistry;
	let saveHandler: SaveHandler;
	let mockOperationCoordinator: any;
	let testFileUri: vscode.Uri;
	let context: any;
	let checkpointCreationCount: number;
	let mockStorage: Map<string, any>;
	let onWillSaveHandlers: Array<(event: any) => void>;

	beforeEach(async () => {
		// Reset checkpoint counter
		checkpointCreationCount = 0;
		onWillSaveHandlers = [];

		// Create a proper storage mock that actually stores data
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
			coordinateCheckpointCreation: vi.fn(async () => {
				checkpointCreationCount++;
				return `checkpoint-${Date.now()}`;
			}),
		};

		// Spy on onWillSaveTextDocument to capture handlers
		vi.spyOn(vscode.workspace, "onWillSaveTextDocument").mockImplementation(
			(handler: any) => {
				onWillSaveHandlers.push(handler);
				return { dispose: vi.fn() };
			},
		);

		// Create save handler
		context = { subscriptions: [] };
		saveHandler = new SaveHandler(registry, mockOperationCoordinator);
		saveHandler.register(context);

		// Create test file
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		testFileUri = vscode.Uri.joinPath(
			workspaceFolder.uri,
			"test-checkpoint.ts",
		);

		await vscode.workspace.fs.writeFile(
			testFileUri,
			Buffer.from('console.log("test");'),
		);
	});

	afterEach(async () => {
		try {
			await vscode.workspace.fs.delete(testFileUri);
		} catch {
			// Ignore
		}
		saveHandler.dispose();
		await registry.clearAll();
		vi.clearAllMocks();
	});

	it("Should NOT checkpoint unprotected file on save", async () => {
		// Create a save event
		const saveEvent = {
			document: {
				uri: testFileUri,
				getText: vi.fn().mockReturnValue('console.log("test");'),
			},
			waitUntil: vi.fn(),
		};

		// Trigger the save handler
		for (const handler of onWillSaveHandlers) {
			handler(saveEvent);
		}

		// Wait for debounce
		await new Promise((resolve) => setTimeout(resolve, 400));

		// Verify no checkpoint created
		expect(checkpointCreationCount).toBe(0);
		expect(
			mockOperationCoordinator.coordinateCheckpointCreation,
		).not.toHaveBeenCalled();
	});

	it("Should checkpoint protected file on save", async () => {
		// Protect file
		await registry.add(testFileUri.fsPath);

		// Create a save event
		const saveEvent = {
			document: {
				uri: testFileUri,
				getText: vi.fn().mockReturnValue('console.log("test");'),
			},
			waitUntil: vi.fn(),
		};

		// Trigger the save handler
		for (const handler of onWillSaveHandlers) {
			handler(saveEvent);
		}

		// Wait for async checkpoint creation (debounce + processing)
		await new Promise((resolve) => setTimeout(resolve, 500));

		// Verify checkpoint was created
		expect(checkpointCreationCount).toBeGreaterThan(0);
		expect(
			mockOperationCoordinator.coordinateCheckpointCreation,
		).toHaveBeenCalled();
	});

	it("Should debounce rapid saves", async () => {
		await registry.add(testFileUri.fsPath);

		// Create a save event
		const saveEvent = {
			document: {
				uri: testFileUri,
				getText: vi.fn().mockReturnValue('console.log("test");'),
			},
			waitUntil: vi.fn(),
		};

		// Rapid saves (5 saves within 250ms)
		for (let i = 0; i < 5; i++) {
			for (const handler of onWillSaveHandlers) {
				handler(saveEvent);
			}
			await new Promise((resolve) => setTimeout(resolve, 50)); // 50ms between saves
		}

		// Wait for debounce window (300ms) + some buffer
		await new Promise((resolve) => setTimeout(resolve, 500));

		// Should only create 1 checkpoint (debounced)
		// Multiple saves within 300ms should be coalesced into a single checkpoint
		expect(checkpointCreationCount).toBe(1);
		expect(
			mockOperationCoordinator.coordinateCheckpointCreation,
		).toHaveBeenCalledTimes(1);
	});
});
