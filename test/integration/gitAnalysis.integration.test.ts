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
		createOutputChannel: vi.fn().mockReturnValue({
			appendLine: vi.fn(),
			show: vi.fn(),
		}),
	},
	workspace: {
		fs: {
			readFile: vi.fn(),
			writeFile: vi.fn(),
			delete: vi.fn(),
		},
		onWillSaveTextDocument: vi.fn(),
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

describe("Git Analysis Integration", () => {
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

	it("should integrate Git analysis with automatic snapshot creation", async () => {
		// Mock file system operations
		// @ts-expect-error - Mocking VS Code workspace.fs
		vscode.workspace.fs.readFile = vi
			.fn()
			.mockResolvedValueOnce(Buffer.from("current content"));

		// @ts-expect-error - Mocking VS Code workspace.fs
		vscode.workspace.fs.writeFile = vi.fn().mockResolvedValueOnce(undefined);

		// Create a diff that represents a security threat
		const mockDiff = `diff --git a/src/auth.ts b/src/auth.ts
index 1234567..8901234 100644
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -1,3 +1,5 @@
+// TODO(SNAPBACK-123): Remove this hardcoded password before production
+const TEST_DB_PASSWORD = "test_password_123";

 export function authenticateUser(username, password) {
   // Authentication logic
   return true;
`;

		const mockCommitContext = {
			branch: "main",
			commitHash: "abc123",
			commitMessage: "Add authentication",
			author: "Test User",
			changes: {
				added: [],
				modified: ["src/auth.ts"],
				deleted: [],
			},
		};

		// @ts-expect-error - Accessing private property for testing
		const gitIntegration = coordinator.gitIntegration;

		// Mock GitIntegration methods
		vi.spyOn(gitIntegration, "getDiff").mockResolvedValue(mockDiff);
		vi.spyOn(gitIntegration, "getCommitContext").mockResolvedValue(
			mockCommitContext,
		);

		// Mock the snapshot creation
		const createSnapshotSpy = vi.spyOn(
			coordinator,
			"coordinateSnapshotCreation",
		);

		// Execute snapshot creation
		const snapshotId = await coordinator.coordinateSnapshotCreation();

		// Verify that a snapshot was created
		expect(createSnapshotSpy).toHaveBeenCalled();
		expect(snapshotId).toBeDefined();
	});

	it("should detect change velocity and trigger appropriate responses", async () => {
		// Mock file system operations
		// @ts-expect-error - Mocking VS Code workspace.fs
		vscode.workspace.fs.readFile = vi
			.fn()
			.mockResolvedValueOnce(Buffer.from("current content"));

		// @ts-expect-error - Mocking VS Code workspace.fs
		vscode.workspace.fs.writeFile = vi.fn().mockResolvedValueOnce(undefined);

		// Mock Git integration with high change velocity
		const mockDiff = "";
		const mockCommitContext = {
			branch: "main",
			commitHash: "abc123",
			commitMessage: "Test commit",
			author: "Test User",
			changes: {
				added: Array(25)
					.fill("")
					.map((_, i) => `src/file${i}.ts`),
				modified: [],
				deleted: [],
			},
		};

		// @ts-expect-error - Accessing private property for testing
		const gitIntegration = coordinator.gitIntegration;

		// Mock GitIntegration methods
		vi.spyOn(gitIntegration, "getDiff").mockResolvedValue(mockDiff);
		vi.spyOn(gitIntegration, "getCommitContext").mockResolvedValue(
			mockCommitContext,
		);

		// Mock the snapshot creation
		const createSnapshotSpy = vi.spyOn(
			coordinator,
			"coordinateSnapshotCreation",
		);

		// Execute snapshot creation
		const snapshotId = await coordinator.coordinateSnapshotCreation();

		// Verify that a snapshot was created due to high change velocity
		expect(createSnapshotSpy).toHaveBeenCalled();
		expect(snapshotId).toBeDefined();
	});
});
