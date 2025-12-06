import { beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { ConflictResolver } from "../../src/conflictResolver";
import { NotificationManager } from "../../src/notificationManager";
import { OperationCoordinator } from "../../src/operationCoordinator";
import { WorkspaceMemoryManager } from "../../src/workspaceMemory";

// Mock the storage dependency
vi.mock("@snapback/storage", () => ({
	FileSystemStorage: vi.fn().mockImplementation(() => ({
		create: vi.fn().mockResolvedValue({
			id: "test-snapshot-id",
			timestamp: Date.now(),
			files: {
				"test.txt": "original content",
			},
			meta: {
				files: ["test.txt"],
			},
		}),
		retrieve: vi.fn().mockResolvedValue({
			id: "test-snapshot-id",
			timestamp: Date.now(),
			files: {
				"test.txt": "original content",
			},
			meta: {
				files: ["test.txt"],
			},
		}),
		list: vi.fn().mockResolvedValue([
			{
				id: "snapshot-1",
				timestamp: Date.now() - 1000,
				files: { "test.txt": "original content" },
				meta: {
					files: ["test.txt"],
				},
			},
		]),
		restore: vi
			.fn()
			.mockImplementation((_snapshotId, _workspaceRoot, options) => {
				if (options?.dryRun) {
					// Simulate conflicts in dry run
					if (options.files?.includes("test.txt")) {
						return Promise.resolve({
							success: true,
							restoredFiles: [],
							conflicts: [
								{
									path: "test.txt",
									snapshotContent: "original content",
									currentContent: "modified content",
									type: "modified",
								},
							],
						});
					}
					return Promise.resolve({
						success: true,
						restoredFiles: [],
						conflicts: [],
					});
				}
				// Actual restore with no conflicts (filtered files)
				return Promise.resolve({
					success: true,
					restoredFiles: options?.files || ["test.txt"],
					conflicts: [],
				});
			}),
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
		workspaceFolders: [{ uri: { fsPath: "/test/workspace" } }],
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

describe("Restore with Conflicts Integration", () => {
	let coordinator: OperationCoordinator;
	let workspaceMemory: WorkspaceMemoryManager;
	let notificationManager: NotificationManager;
	let conflictResolver: ConflictResolver;
	const _workspaceRoot = "/test/workspace";

	beforeEach(() => {
		notificationManager = new NotificationManager();
		const MockStorage = vi.fn().mockImplementation(() => ({
			create: vi.fn().mockResolvedValue({
				id: "test-snapshot-id",
				timestamp: Date.now(),
				files: {
					"src/App.tsx": "test content",
				},
				meta: {
					files: ["src/App.tsx"],
				},
			}),
			retrieve: vi.fn().mockResolvedValue({
				id: "test-snapshot-id",
				timestamp: Date.now(),
				files: {
					"src/App.tsx": "test content",
				},
				meta: {
					files: ["src/App.tsx"],
				},
			}),
			list: vi.fn().mockResolvedValue([
				{
					id: "snapshot-1",
					timestamp: Date.now() - 1000,
					files: { "src/App.tsx": "test content" },
					meta: {
						files: ["src/App.tsx"],
					},
				},
			]),
		}));
		workspaceMemory = new WorkspaceMemoryManager(new MockStorage());
		conflictResolver = new ConflictResolver();
		coordinator = new OperationCoordinator(
			workspaceMemory,
			notificationManager,
			new MockStorage(),
			conflictResolver,
		);

		// Clear all mocks before each test
		vi.clearAllMocks();
	});

	it("should handle conflicts through UI resolution", async () => {
		// Setup: Create snapshot
		const snapshotId =
			(await coordinator.coordinateSnapshotCreation()) as string;

		// Mock conflict resolver to auto-accept snapshot version
		const resolveConflictsSpy = vi
			.spyOn(conflictResolver, "resolveConflicts")
			.mockResolvedValue([{ file: "test.txt", resolution: "use_snapshot" }]);

		// Execute restore
		const success = await coordinator.restoreToSnapshot(snapshotId);

		// Verify
		expect(success).toBe(true);
		expect(resolveConflictsSpy).toHaveBeenCalled();

		// Verify success message was shown
		expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
			expect.stringContaining("Restored 1 file(s) successfully"),
		);
	});

	it("should cancel restore when user cancels conflict resolution", async () => {
		const snapshotId =
			(await coordinator.coordinateSnapshotCreation()) as string;

		// Mock user canceling
		const resolveConflictsSpy = vi
			.spyOn(conflictResolver, "resolveConflicts")
			.mockResolvedValue(null);

		const success = await coordinator.restoreToSnapshot(snapshotId);

		expect(success).toBe(false);
		expect(resolveConflictsSpy).toHaveBeenCalled();

		// Verify no error message was shown
		expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
	});
});
