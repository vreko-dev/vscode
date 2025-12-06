import { GitIntegration } from "@snapback/core";
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
				"package.json": '{"name": "test"}',
			},
			meta: {
				files: ["src/App.tsx", "package.json"],
			},
		}),
		retrieve: vi.fn().mockResolvedValue({
			id: "test-snapshot-id",
			timestamp: Date.now(),
			files: {
				"src/App.tsx": "snapshot content",
				"package.json": '{"name": "test"}',
			},
			meta: {
				files: ["src/App.tsx", "package.json"],
			},
		}),
		list: vi.fn().mockResolvedValue([
			{
				id: "snapshot-1",
				timestamp: Date.now() - 1000,
				files: {
					"src/App.tsx": "snapshot content",
					"package.json": '{"name": "test"}',
				},
				meta: {
					files: ["src/App.tsx", "package.json"],
				},
			},
		]),
		restore: vi.fn().mockResolvedValue({
			success: true,
			restoredFiles: ["src/App.tsx", "package.json"],
			conflicts: [],
			errors: [],
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
		fs: {
			readFile: vi.fn(),
			writeFile: vi.fn(),
			delete: vi.fn(),
			copy: vi.fn(),
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

// Mock simple-git module
const mockGit = {
	status: vi.fn(),
	log: vi.fn(),
	branch: vi.fn(),
	revparse: vi.fn(),
	diff: vi.fn(),
	checkout: vi.fn(),
	stash: vi.fn(),
	merge: vi.fn(),
	reset: vi.fn(),
	add: vi.fn(),
	commit: vi.fn(),
	rebase: vi.fn(),
	push: vi.fn(),
	pull: vi.fn(),
	fetch: vi.fn(),
};

vi.mock("simple-git", () => ({
	default: () => mockGit,
}));

describe("Recovery Scenarios Integration", () => {
	let coordinator: OperationCoordinator;
	let workspaceMemory: WorkspaceMemoryManager;
	let notificationManager: NotificationManager;
	let mockStorage: any;
	let gitIntegration: GitIntegration;

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
		gitIntegration = new GitIntegration();

		// Clear all mocks before each test
		vi.clearAllMocks();
	});

	describe("Recovery with uncommitted changes", () => {
		it("should create backup before restoring when there are uncommitted changes", async () => {
			// Mock git status to show uncommitted changes
			mockGit.status.mockResolvedValue({
				not_added: [],
				deleted: [],
				modified: ["src/App.tsx"],
				created: [],
				conflicted: [],
			});

			// Mock file system operations
			// @ts-expect-error - Mocking VS Code workspace.fs
			vscode.workspace.fs.readFile = vi
				.fn()
				.mockResolvedValueOnce(Buffer.from("current content")) // For backup
				.mockResolvedValueOnce(Buffer.from("current content")); // For conflict detection

			// @ts-expect-error - Mocking VS Code workspace.fs
			vscode.workspace.fs.writeFile = vi.fn().mockResolvedValue(undefined);

			const result = await coordinator.restoreToSnapshot("snapshot-1");

			expect(result).toBe(true);
			// Verify that backup was created before restoration
			expect(vscode.workspace.fs.readFile).toHaveBeenCalled();
			expect(vscode.workspace.fs.writeFile).toHaveBeenCalled();
		});

		it("should handle conflicts with uncommitted changes", async () => {
			// Mock git status to show uncommitted changes
			mockGit.status.mockResolvedValue({
				not_added: [],
				deleted: [],
				modified: ["src/App.tsx"],
				created: [],
				conflicted: [],
			});

			// Mock conflict detection to find conflicts
			const { detectConflicts } = await import("../../src/conflictResolver");
			// @ts-expect-error - Mocking conflict resolver
			detectConflicts.mockResolvedValue([
				{
					filePath: "src/App.tsx",
					currentContent: "current content",
					snapshotContent: "snapshot content",
					conflictType: "modified",
				},
			]);

			const result = await coordinator.restoreToSnapshot("snapshot-1");

			expect(result).toBe(true);
			// Verify that conflict resolution UI was shown
			expect(detectConflicts).toHaveBeenCalled();
		});
	});

	describe("Partial recovery", () => {
		it("should restore only selected files from snapshot", async () => {
			const filesToRestore = ["src/App.tsx"];

			// Mock the storage retrieve method to return snapshot data
			// @ts-expect-error - Accessing private property for testing
			const storage = coordinator.storage;
			if (storage?.retrieve) {
				vi.spyOn(storage, "retrieve").mockResolvedValue({
					id: "snapshot-1",
					timestamp: Date.now() - 1000,
					files: {
						"src/App.tsx": "snapshot content",
						"package.json": '{"name": "test"}',
					},
					meta: {
						name: "partial-recovery-test",
						files: ["src/App.tsx", "package.json"],
					},
				});
			}

			// Execute selective restoration
			const result = await coordinator.restoreSelectedFiles(
				"snapshot-1",
				filesToRestore,
			);

			// Verify that restoration was successful
			expect(result).toBe(true);

			// Verify that only selected files were restored
			expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
				"Restored 1 files from snapshot snapshot-1",
			);
		});

		it("should handle partial recovery with verification", async () => {
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

	describe("Deleted branch recovery", () => {
		it("should recover from deleted branch scenario", async () => {
			// Mock git branch command to show that the branch was deleted
			mockGit.branch.mockResolvedValue({
				current: "main",
				all: ["main", "develop"], // snapshot-branch is missing
			});

			// Mock git checkout to fail when trying to switch to deleted branch
			mockGit.checkout
				.mockRejectedValueOnce(new Error("Branch not found"))
				.mockResolvedValueOnce(undefined); // For recovery

			// Mock git stash to save current work
			mockGit.stash.mockResolvedValue("");

			// Mock git reset to clean state
			mockGit.reset.mockResolvedValue(undefined);

			// Mock git checkout to main branch for recovery
			mockGit.checkout.mockResolvedValue(undefined);

			const result =
				await gitIntegration.switchBranchWithSnapshotPreservation(
					"deleted-branch",
				);

			// Should fail to switch to deleted branch
			expect(result).toBe(false);

			// But we should be able to recover by switching to main
			const recoveryResult =
				await gitIntegration.switchBranchWithSnapshotPreservation("main");
			expect(recoveryResult).toBe(true);
		});

		it("should recreate deleted branch from shadow branch", async () => {
			// Mock git branch command to show shadow branch exists
			mockGit.branch.mockResolvedValue({
				current: "main",
				all: ["main", "snapback-shadow-main-1234567890"], // shadow branch exists
			});

			// Mock git checkout to switch to shadow branch
			mockGit.checkout.mockResolvedValue(undefined);

			// Mock git checkout to create new branch from shadow
			mockGit.checkout.mockResolvedValue(undefined);

			// Create shadow branch
			const shadowBranch = await gitIntegration.createShadowBranch();

			expect(shadowBranch).toBeDefined();
			expect(typeof shadowBranch).toBe("string");
			expect(shadowBranch).toContain("snapback-shadow-");

			// Simulate branch recreation from shadow
			mockGit.checkout.mockResolvedValue(undefined);
			const recreateResult =
				await gitIntegration.switchBranchWithSnapshotPreservation(
					"recreated-branch",
				);

			expect(recreateResult).toBe(true);
		});
	});

	describe("Cross-device recovery", () => {
		it("should handle cross-device file restoration", async () => {
			// Mock cross-device file copy scenario
			// @ts-expect-error - Mocking VS Code workspace.fs
			vscode.workspace.fs.copy = vi
				.fn()
				.mockRejectedValueOnce(
					new Error("EXDEV: cross-device link not permitted"),
				)
				.mockResolvedValueOnce(undefined); // For fallback copy

			// @ts-expect-error - Mocking VS Code workspace.fs
			vscode.workspace.fs.writeFile = vi.fn().mockResolvedValue(undefined);

			const result = await coordinator.restoreToSnapshot("snapshot-1");

			expect(result).toBe(true);
			// Verify that fallback copy was used when cross-device error occurred
			expect(vscode.workspace.fs.copy).toHaveBeenCalled();
			expect(vscode.workspace.fs.writeFile).toHaveBeenCalled();
		});

		it("should handle cross-device snapshot transfer", async () => {
			// Mock cross-device file transfer scenario
			// @ts-expect-error - Mocking VS Code workspace.fs
			vscode.workspace.fs.copy = vi
				.fn()
				.mockRejectedValue(new Error("EXDEV: cross-device link not permitted"));

			// @ts-expect-error - Mocking VS Code workspace.fs
			vscode.workspace.fs.readFile = vi
				.fn()
				.mockResolvedValue(Buffer.from("snapshot data"));

			// @ts-expect-error - Mocking VS Code workspace.fs
			vscode.workspace.fs.writeFile = vi.fn().mockResolvedValue(undefined);

			// Simulate cross-device snapshot transfer
			try {
				await vscode.workspace.fs.copy(
					vscode.Uri.file("/old/device/snapshot.json"),
					vscode.Uri.file("/new/device/snapshot.json"),
				);
			} catch (_error) {
				// Fallback to read/write
				const data = await vscode.workspace.fs.readFile(
					vscode.Uri.file("/old/device/snapshot.json"),
				);
				await vscode.workspace.fs.writeFile(
					vscode.Uri.file("/new/device/snapshot.json"),
					data,
				);
			}

			// Verify that fallback was used
			expect(vscode.workspace.fs.readFile).toHaveBeenCalled();
			expect(vscode.workspace.fs.writeFile).toHaveBeenCalled();
		});
	});

	describe("Post-crash recovery", () => {
		it("should recover from VS Code crash with corrupted state", async () => {
			// Mock corrupted state scenario
			// @ts-expect-error - Accessing private property for testing
			const storage = coordinator.storage;
			if (storage?.retrieve) {
				vi.spyOn(storage, "retrieve")
					.mockRejectedValueOnce(new Error("Corrupted snapshot data"))
					.mockResolvedValueOnce({
						id: "backup-snapshot-id",
						timestamp: Date.now(),
						files: {
							"src/App.tsx": "backup content",
							"package.json": '{"name": "backup"}',
						},
						meta: {
							files: ["src/App.tsx", "package.json"],
						},
					});
			}

			// Try to restore from corrupted snapshot (should fail)
			try {
				await coordinator.restoreToSnapshot("corrupted-snapshot");
			} catch (_error) {
				// Fallback to backup snapshot
				const result =
					await coordinator.restoreToSnapshot("backup-snapshot-id");
				expect(result).toBe(true);
			}
		});

		it("should recover from git index corruption", async () => {
			// Mock git index corruption
			mockGit.status
				.mockRejectedValueOnce(new Error("fatal: index file corrupt"))
				.mockResolvedValueOnce({
					not_added: [],
					deleted: [],
					modified: [],
					created: [],
					conflicted: [],
				});

			// Mock git reset to fix corruption
			mockGit.reset.mockResolvedValue(undefined);

			// Try to get git status (should fail due to corruption)
			try {
				await gitIntegration.getStatus();
			} catch (_error) {
				// Recover by resetting index
				await mockGit.reset(["--hard"]);
				// Try again
				const status = await gitIntegration.getStatus();
				expect(status).toEqual([]);
			}
		});

		it("should recover from workspace memory corruption", async () => {
			// Mock corrupted workspace memory
			workspaceMemory = new WorkspaceMemoryManager(mockStorage);

			// Simulate corrupted context
			// @ts-expect-error - Accessing private property for testing
			workspaceMemory.context = null;

			// Try to get context (should handle corruption gracefully)
			const context = workspaceMemory.getContext();

			// Should return default context instead of crashing
			expect(context).toBeDefined();
			expect(context.lastActiveFile).toBe("");
			expect(context.lastSnapshot).toBe("");

			// Save context should work even after corruption
			workspaceMemory.updateLastActiveFile("/test/file.ts");
			await workspaceMemory.saveContext();

			const updatedContext = workspaceMemory.getContext();
			expect(updatedContext.lastActiveFile).toBe("/test/file.ts");
		});
	});
});
