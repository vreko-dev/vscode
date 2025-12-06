import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationManager } from "../../src/notificationManager";
import { OperationCoordinator } from "../../src/operationCoordinator";
import {
	confirmRestoration,
	type SnapshotItem,
	showSnapshotSelection,
} from "../../src/snapshotSelector";
import { FileSystemStorage } from "../../src/storage/types";
import { WorkspaceMemoryManager } from "../../src/workspaceMemory";

// Create a mock VS Code module
const mockVscode = {
	window: {
		showQuickPick: vi.fn(),
		showWarningMessage: vi.fn(),
		showErrorMessage: vi.fn(),
		withProgress: vi.fn().mockImplementation((_options, task) => task()),
	},
	ProgressLocation: {
		Window: 1,
	},
};

// Mock the storage dependency
vi.mock("@snapback/storage", () => ({
	FileSystemStorage: vi.fn().mockImplementation(() => ({
		create: vi.fn().mockResolvedValue({
			id: "test-snapshot-id",
			timestamp: Date.now(),
		}),
	})),
}));

describe("SnapshotSelector", () => {
	let coordinator: OperationCoordinator;
	let workspaceMemory: WorkspaceMemoryManager;
	let notificationManager: NotificationManager;

	beforeEach(() => {
		notificationManager = new NotificationManager();
		// @ts-expect-error - Mocking the storage dependency
		workspaceMemory = new WorkspaceMemoryManager(null);
		// @ts-expect-error - Mocking the storage dependency
		const storage = new FileSystemStorage();
		coordinator = new OperationCoordinator(
			workspaceMemory,
			notificationManager,
			storage,
		);

		// Clear all mocks before each test
		vi.clearAllMocks();
	});

	it("should show snapshot selection UI", async () => {
		// Mock the listSnapshots method to return test data
		const mockSnapshots = [
			{
				id: "snapshot-1",
				name: "updated-react",
				timestamp: Date.now() - 3600000,
			},
			{
				id: "snapshot-2",
				name: "config-update",
				timestamp: Date.now() - 7200000,
			},
		];

		coordinator.listSnapshots = vi.fn().mockResolvedValue(mockSnapshots);

		// Mock VS Code quick pick to return a selected snapshot
		const mockSelectedSnapshot: SnapshotItem = {
			label: "updated-react",
			description: "60 minutes ago",
			detail: "Snapshot ID: snapshot-1",
			id: "snapshot-1",
			timestamp: Date.now() - 3600000,
		};

		// @ts-expect-error - Mocking VS Code window for testing
		mockVscode.window.showQuickPick = vi
			.fn()
			.mockResolvedValue(mockSelectedSnapshot);

		// Temporarily replace the vscode import with our mock
		vi.doMock("vscode", () => mockVscode);

		// Execute snapshot selection
		const selectedSnapshot = await showSnapshotSelection(coordinator);

		// Verify that listSnapshots was called
		expect(coordinator.listSnapshots).toHaveBeenCalled();

		// Verify that quick pick was called with correct options
		expect(mockVscode.window.showQuickPick).toHaveBeenCalled();

		// Verify that a snapshot was selected
		expect(selectedSnapshot).toBeDefined();
		expect(selectedSnapshot?.id).toBe("snapshot-1");
		expect(selectedSnapshot?.label).toBe("updated-react");
	});

	it("should handle snapshot selection cancellation", async () => {
		// Mock the listSnapshots method to return test data
		const mockSnapshots = [
			{
				id: "snapshot-1",
				name: "updated-react",
				timestamp: Date.now() - 3600000,
			},
		];

		coordinator.listSnapshots = vi.fn().mockResolvedValue(mockSnapshots);

		// Mock VS Code quick pick to return undefined (user cancelled)
		// @ts-expect-error - Mocking VS Code window for testing
		mockVscode.window.showQuickPick = vi.fn().mockResolvedValue(undefined);

		// Temporarily replace the vscode import with our mock
		vi.doMock("vscode", () => mockVscode);

		// Execute snapshot selection
		const selectedSnapshot = await showSnapshotSelection(coordinator);

		// Verify that no snapshot was selected
		expect(selectedSnapshot).toBeUndefined();
	});

	it("should handle snapshot loading errors", async () => {
		// Mock the listSnapshots method to throw an error
		coordinator.listSnapshots = vi
			.fn()
			.mockRejectedValue(new Error("Failed to load snapshots"));

		// Temporarily replace the vscode import with our mock
		vi.doMock("vscode", () => mockVscode);

		// Execute snapshot selection
		const selectedSnapshot = await showSnapshotSelection(coordinator);

		// Verify that no snapshot was selected
		expect(selectedSnapshot).toBeUndefined();

		// Verify that error message was shown
		expect(mockVscode.window.showErrorMessage).toHaveBeenCalledWith(
			expect.stringContaining("Failed to load snapshots"),
		);
	});

	it("should confirm restoration", async () => {
		// Mock VS Code warning message to return 'Restore'
		// @ts-expect-error - Mocking VS Code window for testing
		mockVscode.window.showWarningMessage = vi.fn().mockResolvedValue("Restore");

		// Temporarily replace the vscode import with our mock
		vi.doMock("vscode", () => mockVscode);

		// Execute confirmation
		const confirmed = await confirmRestoration("test-snapshot");

		// Verify that confirmation was true
		expect(confirmed).toBe(true);

		// Verify that warning message was shown with correct options
		expect(mockVscode.window.showWarningMessage).toHaveBeenCalledWith(
			'Restore workspace to snapshot "test-snapshot"?',
			{ modal: true },
			"Cancel",
			"Restore",
		);
	});

	it("should handle restoration cancellation", async () => {
		// Mock VS Code warning message to return 'Cancel'
		// @ts-expect-error - Mocking VS Code window for testing
		mockVscode.window.showWarningMessage = vi.fn().mockResolvedValue("Cancel");

		// Temporarily replace the vscode import with our mock
		vi.doMock("vscode", () => mockVscode);

		// Execute confirmation
		const confirmed = await confirmRestoration("test-snapshot");

		// Verify that confirmation was false
		expect(confirmed).toBe(false);
	});
});
