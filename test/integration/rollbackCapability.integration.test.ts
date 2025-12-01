import { beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { NotificationManager } from "../../src/notificationManager.js";
import { OperationCoordinator } from "../../src/operationCoordinator.js";
import { WorkspaceMemoryManager } from "../../src/workspaceMemory.js";
import { createMockStorage } from "../helpers/mockStorage.js";

// Mock the storage dependency
vi.mock("@snapback/storage", () => ({
	FileSystemStorage: vi.fn().mockImplementation(() => ({
		create: vi.fn().mockResolvedValue({
			id: "test-snapshot-id",
			timestamp: Date.now(),
			files: {
				"src/App.tsx": "snapshot content",
			},
			meta: {
				files: ["src/App.tsx"],
			},
		}),
		retrieve: vi.fn().mockResolvedValue({
			id: "test-snapshot-id",
			timestamp: Date.now(),
			files: {
				"src/App.tsx": "snapshot content",
			},
			meta: {
				files: ["src/App.tsx"],
			},
		}),
		list: vi.fn().mockResolvedValue([
			{
				id: "snapshot-1",
				timestamp: Date.now() - 1000,
				files: { "src/App.tsx": "snapshot content" },
				meta: {
					files: ["src/App.tsx"],
				},
			},
		]),
	})),
}));

// Mock VS Code API
vi.mock("vscode", () => ({
	window: {
		showInformationMessage: vi.fn(),
		showWarningMessage: vi.fn(),
		showErrorMessage: vi.fn(),
		showQuickPick: vi.fn(),
		withProgress: vi
			.fn()
			.mockImplementation((_options, task) => task({ report: vi.fn() })),
	},
	workspace: {
		fs: {
			readFile: vi.fn(),
			writeFile: vi.fn(),
			delete: vi.fn(),
		},
	},
	Uri: {
		file: vi.fn().mockImplementation((path) => ({ fsPath: path })),
		parse: vi.fn().mockImplementation((path) => ({ path })),
	},
	commands: {
		executeCommand: vi.fn(),
	},
}));

// Mock conflict resolver functions
vi.mock("../../src/conflictResolver", () => ({
	detectConflicts: vi.fn().mockResolvedValue([]),
	showConflictResolutionUI: vi.fn().mockResolvedValue([]),
	applyConflictResolutions: vi.fn().mockResolvedValue(true),
}));

describe("Rollback Capability Integration", () => {
	let coordinator: OperationCoordinator;
	let workspaceMemory: WorkspaceMemoryManager;
	let notificationManager: NotificationManager;
	let mockStorage: any;

	beforeEach(() => {
		notificationManager = new NotificationManager();
		mockStorage = createMockStorage();
		// @ts-expect-error - Mocking the storage dependency
		workspaceMemory = new WorkspaceMemoryManager(mockStorage);
		coordinator = new OperationCoordinator(
			workspaceMemory,
			notificationManager,
			mockStorage as any,
		);

		// Clear all mocks before each test
		vi.clearAllMocks();
	});

	it("should rollback to previous state on verification failure", async () => {
		// Mock file system to simulate successful backup but failed verification
		// @ts-expect-error - Mocking VS Code workspace.fs
		vscode.workspace.fs.readFile = vi
			.fn()
			.mockResolvedValueOnce(Buffer.from("current content")) // For backup
			.mockResolvedValueOnce(Buffer.from("current content")) // For conflict detection
			.mockResolvedValueOnce(Buffer.from("different content")); // For verification (mismatch)

		// @ts-expect-error - Mocking VS Code workspace.fs
		vscode.workspace.fs.writeFile = vi
			.fn()
			.mockResolvedValueOnce(undefined) // For restoration
			.mockResolvedValueOnce(undefined) // For rollback
			.mockResolvedValueOnce(undefined); // For rollback

		const result = await coordinator.restoreToSnapshot("snapshot-1");

		expect(result).toBe(false);
		// @ts-expect-error - Mocking VS Code window
		expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
			"Restoration verification failed. Rolling back to previous state...",
		);
	});

	it("should rollback to previous state on restoration failure", async () => {
		// Mock file system to simulate backup creation but restoration failure
		// @ts-expect-error - Mocking VS Code workspace.fs
		vscode.workspace.fs.readFile = vi
			.fn()
			.mockResolvedValueOnce(Buffer.from("current content")) // For backup
			.mockResolvedValueOnce(Buffer.from("current content")) // For conflict detection
			.mockResolvedValueOnce(Buffer.from("current content")); // For verification (should pass if we get there)

		// @ts-expect-error - Mocking VS Code workspace.fs
		vscode.workspace.fs.writeFile = vi
			.fn()
			.mockRejectedValueOnce(new Error("Write failed")); // For restoration failure

		const result = await coordinator.restoreToSnapshot("snapshot-1");

		expect(result).toBe(false);
		// @ts-expect-error - Mocking VS Code window
		expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
			"Restoration failed. Rolling back to previous state...",
		);
	});

	it("should handle rollback failure gracefully", async () => {
		// Mock file system to simulate backup creation but both restoration and rollback failures
		// @ts-expect-error - Mocking VS Code workspace.fs
		vscode.workspace.fs.readFile = vi
			.fn()
			.mockResolvedValueOnce(Buffer.from("current content")) // For backup
			.mockResolvedValueOnce(Buffer.from("current content")) // For conflict detection
			.mockResolvedValueOnce(Buffer.from("current content")); // For verification (should pass if we get there)

		// @ts-expect-error - Mocking VS Code workspace.fs
		vscode.workspace.fs.writeFile = vi
			.fn()
			.mockRejectedValueOnce(new Error("Write failed")) // For restoration failure
			.mockRejectedValueOnce(new Error("Write failed")); // For rollback failure

		const result = await coordinator.restoreToSnapshot("snapshot-1");

		expect(result).toBe(false);
		// Check that we showed the restoration failure message
		// @ts-expect-error - Mocking VS Code window
		expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
			"Restoration failed. Rolling back to previous state...",
		);
		// @ts-expect-error - Mocking VS Code window
		expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
			"Rollback failed. Manual recovery may be required.",
		);
	});

	it("should rollback selective restoration on verification failure", async () => {
		const filesToRestore = ["src/App.tsx"];

		// Mock file system to simulate successful backup but failed verification
		// @ts-expect-error - Mocking VS Code workspace.fs
		vscode.workspace.fs.readFile = vi
			.fn()
			.mockResolvedValueOnce(Buffer.from("current content")) // For backup
			.mockResolvedValueOnce(Buffer.from("current content")) // For conflict detection
			.mockResolvedValueOnce(Buffer.from("different content")); // For verification (mismatch)

		// @ts-expect-error - Mocking VS Code workspace.fs
		vscode.workspace.fs.writeFile = vi
			.fn()
			.mockResolvedValueOnce(undefined) // For restoration
			.mockResolvedValueOnce(undefined) // For rollback
			.mockResolvedValueOnce(undefined); // For rollback

		const result = await coordinator.restoreSelectedFiles(
			"snapshot-1",
			filesToRestore,
		);

		expect(result).toBe(false);
		// @ts-expect-error - Mocking VS Code window
		expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
			"Restoration verification failed. Rolling back to previous state...",
		);
	});
});
