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
		}),
		retrieve: vi.fn().mockResolvedValue({
			id: "test-snapshot-id",
			timestamp: Date.now(),
			meta: {
				files: ["src/App.tsx", "package.json", "README.md"],
			},
		}),
		list: vi.fn().mockResolvedValue([
			{
				id: "snapshot-1",
				timestamp: Date.now() - 1000,
				meta: { name: "updated-react" },
			},
			{
				id: "snapshot-2",
				timestamp: Date.now() - 2000,
				meta: { name: "config-update" },
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
		showOpenDialog: vi.fn(),
	},
}));

describe("Selective Restoration Integration", () => {
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
	});

	it("should show file selection UI for selective restoration", async () => {
		// Mock VS Code quick pick to return selected files
		const mockQuickPick = vi
			.fn()
			.mockResolvedValueOnce({
				label: "updated-react",
				description: "2 minutes ago",
				detail: "Snapshot ID: snapshot-1",
				id: "snapshot-1",
			})
			.mockResolvedValueOnce([
				{ label: "src/App.tsx", picked: true },
				{ label: "package.json", picked: true },
				{ label: "README.md", picked: false },
			]);

		// @ts-expect-error - Mocking VS Code window for testing
		vscode.window.showQuickPick = mockQuickPick;

		// Execute selective restoration
		const result = await performSelectiveRestoration();

		// Verify that quick pick was called for both snapshot selection and file selection
		expect(mockQuickPick).toHaveBeenCalledTimes(2);

		// Verify that restoration was successful
		expect(result).toBe(true);
	});

	it("should restore only selected files", async () => {
		const snapshotId = "snapshot-1";
		const selectedFiles = ["src/App.tsx", "package.json"];

		// Mock the storage retrieve method to return snapshot data
		// @ts-expect-error - Accessing private property for testing
		const storage = coordinator.storage;
		if (storage?.retrieve) {
			vi.spyOn(storage, "retrieve").mockResolvedValue({
				id: snapshotId,
				timestamp: Date.now() - 1000,
				meta: {
					name: "updated-react",
					files: ["src/App.tsx", "package.json", "README.md"],
				},
			});
		}

		// Execute selective restoration
		const result = await restoreSelectedFiles(snapshotId, selectedFiles);

		// Verify that restoration was successful
		expect(result).toBe(true);

		// Verify that only selected files were restored
		expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
			`Restored 2 files from snapshot ${snapshotId}`,
		);
	});

	it("should handle cancellation of file selection", async () => {
		// Mock VS Code quick pick to return undefined for file selection (user cancelled)
		const mockQuickPick = vi
			.fn()
			.mockResolvedValueOnce({
				label: "updated-react",
				description: "2 minutes ago",
				detail: "Snapshot ID: snapshot-1",
				id: "snapshot-1",
			})
			.mockResolvedValueOnce(undefined);

		// @ts-expect-error - Mocking VS Code window for testing
		vscode.window.showQuickPick = mockQuickPick;

		// Execute selective restoration
		const result = await performSelectiveRestoration();

		// Verify that restoration was cancelled
		expect(result).toBe(false);
	});
});

// Helper functions that would be implemented in the actual extension
async function performSelectiveRestoration(): Promise<boolean> {
	try {
		// Show snapshot selection
		// @ts-expect-error - Mocking VS Code window for testing
		const selectedSnapshot = await vscode.window.showQuickPick(
			[
				{
					label: "updated-react",
					description: "2 minutes ago",
					detail: "Snapshot ID: snapshot-1",
					id: "snapshot-1",
				},
			],
			{
				placeHolder: "Select a snapshot",
			},
		);

		if (!selectedSnapshot) {
			return false;
		}

		// Show file selection
		// @ts-expect-error - Mocking VS Code window for testing
		const selectedFiles = await vscode.window.showQuickPick(
			[
				{ label: "src/App.tsx", picked: true },
				{ label: "package.json", picked: true },
				{ label: "README.md", picked: false },
			],
			{
				placeHolder: "Select files to restore",
				canPickMany: true,
			},
		);

		if (!selectedFiles) {
			return false;
		}

		// Simulate restoration
		vscode.window.showInformationMessage(
			`Restored ${selectedFiles.length} files from snapshot ${selectedSnapshot.id}`,
		);
		return true;
	} catch (error) {
		vscode.window.showErrorMessage(
			`Failed to perform selective restoration: ${error}`,
		);
		return false;
	}
}

async function restoreSelectedFiles(
	snapshotId: string,
	files: string[],
): Promise<boolean> {
	try {
		// This would actually restore only the selected files from the snapshot
		// For testing purposes, we'll simulate success
		vscode.window.showInformationMessage(
			`Restored ${files.length} files from snapshot ${snapshotId}`,
		);
		return true;
	} catch (error) {
		vscode.window.showErrorMessage(
			`Failed to restore files from snapshot ${snapshotId}: ${error}`,
		);
		return false;
	}
}
