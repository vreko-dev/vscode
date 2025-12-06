import { beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { NotificationManager } from "../../src/notificationManager";
import { OperationCoordinator } from "../../src/operationCoordinator";
import { WorkspaceMemoryManager } from "../../src/workspaceMemory";
import { createMockStorage } from "../helpers/mockStorage";

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

describe("Backup Verification Integration", () => {
	let coordinator: OperationCoordinator;
	let workspaceMemory: WorkspaceMemoryManager;
	let notificationManager: NotificationManager;
	let mockStorage: Partial<FileSystemStorage>;

	beforeEach(() => {
		notificationManager = new NotificationManager();
		mockStorage = createMockStorage();
		// @ts-expect-error - Mocking the storage dependency
		workspaceMemory = new WorkspaceMemoryManager(mockStorage);
		coordinator = new OperationCoordinator(
			workspaceMemory,
			notificationManager,
			mockStorage as unknown as FileSystemStorage,
		);

		// Clear all mocks before each test
		vi.clearAllMocks();
	});

	it("should verify successful restoration", async () => {
		// Mock file system to simulate successful restoration
		// @ts-expect-error - Mocking VS Code workspace.fs
		vscode.workspace.fs.readFile = vi
			.fn()
			.mockResolvedValue(Buffer.from("snapshot content")); // Current file content after restoration

		// @ts-expect-error - Mocking VS Code workspace.fs
		vscode.workspace.fs.writeFile = vi.fn().mockResolvedValue(undefined);

		const result = await coordinator.restoreToSnapshot("snapshot-1");

		expect(result).toBe(true);
		// @ts-expect-error - Mocking VS Code window
		expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
	});

	it("should handle verification failure", async () => {
		// Mock file system to simulate failed restoration (content mismatch)
		// @ts-expect-error - Mocking VS Code workspace.fs
		vscode.workspace.fs.readFile = vi
			.fn()
			.mockResolvedValueOnce(Buffer.from("snapshot content")) // For conflict detection
			.mockResolvedValueOnce(Buffer.from("different content")); // For verification (mismatch)

		// @ts-expect-error - Mocking VS Code workspace.fs
		vscode.workspace.fs.writeFile = vi.fn().mockResolvedValue(undefined);

		const result = await coordinator.restoreToSnapshot("snapshot-1");

		expect(result).toBe(false);
		// @ts-expect-error - Mocking VS Code window
		expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
			"Restoration verification failed. Some files may not have been restored correctly.",
		);
	});

	it("should verify selective restoration", async () => {
		const filesToRestore = ["src/App.tsx"];

		// Mock file system to simulate successful selective restoration
		// @ts-expect-error - Mocking VS Code workspace.fs
		vscode.workspace.fs.readFile = vi
			.fn()
			.mockResolvedValue(Buffer.from("snapshot content")); // Current file content after restoration

		// @ts-expect-error - Mocking VS Code workspace.fs
		vscode.workspace.fs.writeFile = vi.fn().mockResolvedValue(undefined);

		const result = await coordinator.restoreSelectedFiles(
			"snapshot-1",
			filesToRestore,
		);

		expect(result).toBe(true);
		// @ts-expect-error - Mocking VS Code window
		expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
	});
});
