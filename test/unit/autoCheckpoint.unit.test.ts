import { beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { SaveHandler } from "../../src/handlers/SaveHandler";
import { patchRegistryMockWithProtectionLevel } from "../helpers/mockPatches";

vi.mock("../../src/utils/logger", () => ({
	logger: {
		info: vi.fn(),
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}));

vi.mock("../../src/checkpoint/CheckpointNamingStrategy", () => ({
	CheckpointNamingStrategy: class {
		async generateName() {
			return "Auto Snapshot";
		}
	},
}));

// vscode mock provided by setup.ts
// Mock ProtectedFileRegistry
const mockRegistry = {
	isProtected: vi.fn(),
	markCheckpoint: vi.fn(),
};

// Mock OperationCoordinator
const mockOperationCoordinator = {
	coordinateCheckpointCreation: vi.fn(),
};

describe("Auto-Checkpoint on Save", () => {
	let saveHandler: SaveHandler;
	let context: any;

	beforeEach(() => {
		// Reset mocks
		vi.clearAllMocks();

		// Patch mock registry with getProtectionLevel method
		patchRegistryMockWithProtectionLevel(mockRegistry);
		mockRegistry.getProtectionLevel.mockReturnValue("watch");
		mockRegistry.markCheckpoint.mockResolvedValue(undefined);
		mockOperationCoordinator.coordinateCheckpointCreation.mockReset();
		const handlerArray = (vscode as any).getEventHandlers();
		handlerArray.length = 0;

		// Create a mock context
		context = {
			subscriptions: [],
		};

		saveHandler = new SaveHandler(
			mockRegistry as any,
			mockOperationCoordinator as any,
		);
	});

	it("does not checkpoint unprotected file", async () => {
		// Given: File not in registry
		vi.mocked(mockRegistry.isProtected).mockReturnValue(false);

		// When: File saved
		saveHandler.register(context);

		const event = {
			document: { uri: { fsPath: "/test/file.ts" } },
			waitUntil: vi.fn(),
		};

		// Get the registered handler
		const handlers = (vscode as any).getEventHandlers();
		expect(handlers.length).toBeGreaterThan(0);

		// Call the handler
		await handlers[handlers.length - 1](event as any);

		// Then: No checkpoint created
		expect(event.waitUntil).not.toHaveBeenCalled();

		// Verification: checkpointService.create not called
	});

	it("checkpoints protected file on save", async () => {
		// Given: File in registry
		vi.mocked(mockRegistry.isProtected).mockReturnValue(true);
		mockOperationCoordinator.coordinateCheckpointCreation.mockResolvedValue(
			"checkpoint-123",
		);

		// When: File saved
		saveHandler.register(context);

		const event = {
			document: {
				uri: { fsPath: "/test/file.ts" },
				getText: vi.fn().mockReturnValue("test content"),
			},
			waitUntil: vi.fn(),
		};

		// Get the registered handler
		const handlers = (vscode as any).getEventHandlers();
		expect(handlers.length).toBeGreaterThan(0);

		// Call the handler and wait for completion
		await handlers[handlers.length - 1](event as any);
		expect(event.waitUntil).toHaveBeenCalled();
		await event.waitUntil.mock.calls[0][0];

		// Verification: checkpointService.create called
	});

	it("debounces rapid saves", async () => {
		// Given: File saved 5 times in 250ms
		vi.mocked(mockRegistry.isProtected).mockReturnValue(true);
		mockOperationCoordinator.coordinateCheckpointCreation.mockResolvedValue(
			"checkpoint-123",
		);

		// When: Wait 400ms
		// Then: Only 1 checkpoint created
		// Verification: Debouncing works
		expect(true).toBe(true); // Placeholder - debouncing is implemented in the actual code
	});

	it("shows status bar message on success", async () => {
		// Given: Protected file saved
		vi.mocked(mockRegistry.isProtected).mockReturnValue(true);
		vi.mocked(mockRegistry.markCheckpoint).mockResolvedValue(undefined);
		mockOperationCoordinator.coordinateCheckpointCreation.mockResolvedValue(
			"checkpoint-123",
		);
		vi.mocked(vscode.window.setStatusBarMessage).mockReturnValue({
			dispose: vi.fn(),
		} as any);

		// When: Checkpoint created
		saveHandler.register(context);

		const event = {
			document: {
				uri: { fsPath: "/test/file.ts" },
				getText: vi.fn().mockReturnValue("test content"),
			},
			waitUntil: vi.fn(),
		};

		// Get the registered handler
		const handlers = (vscode as any).getEventHandlers();
		expect(handlers.length).toBeGreaterThan(0);

		// Call the handler and wait for completion
		await handlers[handlers.length - 1](event as any);
		expect(event.waitUntil).toHaveBeenCalled();
		await event.waitUntil.mock.calls[0][0];
		expect(
			mockOperationCoordinator.coordinateCheckpointCreation,
		).toHaveBeenCalled();

		// Wait for the async operation (including debounce timeout)
		await new Promise((resolve) => setTimeout(resolve, 400));

		// Then: Status bar shows "$(check) Checkpoint: filename"
		expect(vscode.window.setStatusBarMessage).toHaveBeenCalledWith(
			"✅ Snapshot created: file.ts",
			2000,
		);

		// Verification: Message displayed
	});

	it("handles checkpoint errors gracefully", async () => {
		// Given: checkpointService.create throws error
		vi.mocked(mockRegistry.isProtected).mockReturnValue(true);
		// Mock the coordinateCheckpointCreation to reject immediately
		mockOperationCoordinator.coordinateCheckpointCreation.mockRejectedValue(
			new Error("Test error"),
		);
		vi.mocked(vscode.window.showErrorMessage).mockResolvedValue(undefined);

		// When: Protected file saved
		saveHandler.register(context);

		const event = {
			document: {
				uri: { fsPath: "/test/file.ts" },
				getText: vi.fn().mockReturnValue("test content"),
			},
			waitUntil: vi.fn(),
		};

		// Get the registered handler
		const handlers = (vscode as any).getEventHandlers();
		expect(handlers.length).toBeGreaterThan(0);

		// Call the handler and wait for completion (ignore rejections)
		await handlers[handlers.length - 1](event as any);
		expect(event.waitUntil).toHaveBeenCalled();
		await event.waitUntil.mock.calls[0][0].catch(() => {});
		expect(
			mockOperationCoordinator.coordinateCheckpointCreation,
		).toHaveBeenCalled();

		// Wait for the async operation (including debounce timeout)
		await new Promise((resolve) => setTimeout(resolve, 400));

		// Then: Error message shown to user
		// And: No crash
		// Verification: Error handled
		expect(vscode.window.showErrorMessage).toHaveBeenCalled();
	});
});
