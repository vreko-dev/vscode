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
			{
				id: "snapshot-2",
				timestamp: Date.now() - 2000,
				files: { "src/Config.ts": "config content" },
				meta: {
					files: ["src/Config.ts"],
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

describe("Conflict Resolution Integration", () => {
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

	it("should detect and resolve conflicts during full restoration", async () => {
		// Mock file system to simulate a conflict
		// @ts-expect-error - Mocking VS Code workspace.fs
		vscode.workspace.fs.readFile = vi
			.fn()
			.mockResolvedValueOnce(Buffer.from("current content")) // For conflict detection
			.mockResolvedValueOnce(Buffer.from("snapshot content")); // For verification

		// Mock user conflict resolution choice
		// @ts-expect-error - Mocking VS Code window
		vscode.window.showQuickPick = vi
			.fn()
			.mockResolvedValue({ label: "Use Snapshot Version" });

		// @ts-expect-error - Mocking VS Code workspace.fs
		vscode.workspace.fs.writeFile = vi.fn().mockResolvedValue(undefined);

		const result = await coordinator.restoreToSnapshot("snapshot-1");

		expect(result).toBe(true);
		// @ts-expect-error - Mocking VS Code window
		expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
			"Found 1 conflicts during restoration. Resolving...",
		);
		// @ts-expect-error - Mocking VS Code workspace.fs
		expect(vscode.workspace.fs.writeFile).toHaveBeenCalledWith(
			{ fsPath: "src/App.tsx" },
			Buffer.from("snapshot content"),
		);
	});

	it("should detect and resolve conflicts during selective restoration", async () => {
		const filesToRestore = ["src/App.tsx"];

		// Mock file system to simulate a conflict
		// @ts-expect-error - Mocking VS Code workspace.fs
		vscode.workspace.fs.readFile = vi
			.fn()
			.mockResolvedValueOnce(Buffer.from("current content")) // For conflict detection
			.mockResolvedValueOnce(Buffer.from("snapshot content")); // For verification

		// Mock user conflict resolution choice
		// @ts-expect-error - Mocking VS Code window
		vscode.window.showQuickPick = vi
			.fn()
			.mockResolvedValue({ label: "Keep Current Version" });

		const result = await coordinator.restoreSelectedFiles(
			"snapshot-1",
			filesToRestore,
		);

		expect(result).toBe(true);
		// @ts-expect-error - Mocking VS Code window
		expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
			"Found 1 conflicts during restoration. Resolving...",
		);
	});

	it("should handle restoration without conflicts", async () => {
		// Mock file system to simulate no conflicts (same content)
		// @ts-expect-error - Mocking VS Code workspace.fs
		vscode.workspace.fs.readFile = vi
			.fn()
			.mockResolvedValueOnce(Buffer.from("snapshot content")) // For conflict detection
			.mockResolvedValueOnce(Buffer.from("snapshot content")); // For verification

		// @ts-expect-error - Mocking VS Code workspace.fs
		vscode.workspace.fs.writeFile = vi.fn().mockResolvedValue(undefined);

		const result = await coordinator.restoreToSnapshot("snapshot-1");

		expect(result).toBe(true);
		// @ts-expect-error - Mocking VS Code window
		expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
		// @ts-expect-error - Mocking VS Code workspace.fs
		expect(vscode.workspace.fs.writeFile).toHaveBeenCalledWith(
			{ fsPath: "src/App.tsx" },
			Buffer.from("snapshot content"),
		);
	});

	it("should handle cancellation of conflict resolution", async () => {
		// Mock file system to simulate a conflict
		// @ts-expect-error - Mocking VS Code workspace.fs
		vscode.workspace.fs.readFile = vi
			.fn()
			.mockResolvedValueOnce(Buffer.from("current content")) // For conflict detection
			.mockResolvedValueOnce(Buffer.from("snapshot content")); // For verification

		// Mock user cancellation of conflict resolution
		// @ts-expect-error - Mocking VS Code window
		vscode.window.showQuickPick = vi.fn().mockResolvedValue(undefined);

		const result = await coordinator.restoreToSnapshot("snapshot-1");

		expect(result).toBe(false); // Should return false when conflict resolution is cancelled
	});
});
