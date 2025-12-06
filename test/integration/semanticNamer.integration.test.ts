import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationManager } from "../../src/notificationManager";
import { OperationCoordinator } from "../../src/operationCoordinator";
import { SemanticSnapshotNamer } from "../../src/semanticSnapshotNamer";
import { WorkspaceMemoryManager } from "../../src/workspaceMemory";

// Create a mock storage instance
const mockStorage = {
	create: vi.fn().mockImplementation((data) => {
		// Use the semantic name if provided, otherwise generate ID
		const id = data.meta?.name || `snap_${Date.now().toString(36)}`;
		return Promise.resolve({
			id,
			timestamp: Date.now(),
			meta: data.meta,
			files: data.fileContents || {
				"src/App.tsx": "test content",
			},
		});
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
};

// Mock the storage dependency
vi.mock("@snapback/storage", () => ({
	FileSystemStorage: vi.fn().mockImplementation(() => mockStorage),
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
			readFile: vi
				.fn()
				.mockImplementation(() =>
					Promise.resolve(Buffer.from("current content")),
				),
			writeFile: vi.fn().mockResolvedValue(undefined),
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

describe("Semantic Namer Integration", () => {
	let coordinator: OperationCoordinator;
	let workspaceMemory: WorkspaceMemoryManager;
	let notificationManager: NotificationManager;

	beforeEach(() => {
		notificationManager = new NotificationManager();
		// @ts-expect-error - Mocking the storage dependency
		workspaceMemory = new WorkspaceMemoryManager(mockStorage);
		coordinator = new OperationCoordinator(
			workspaceMemory,
			notificationManager,
			mockStorage as any,
		);

		// Manually set the mock storage on the coordinator instance
		// @ts-expect-error - Accessing private property for testing
		coordinator.storage = mockStorage;

		// Clear all mocks before each test
		vi.clearAllMocks();
	});

	afterEach(() => {
		// Clean up any resources after each test
		vi.restoreAllMocks();
	});

	it("should generate semantic names for snapshots", async () => {
		// Mock Git integration methods
		// @ts-expect-error - Accessing private property for testing
		const gitIntegration = coordinator.gitIntegration;
		vi.spyOn(gitIntegration, "getDiff").mockResolvedValue("");
		vi.spyOn(gitIntegration, "getCommitContext").mockResolvedValue({
			branch: "main",
			commitHash: "abc123",
			commitMessage: "Update dependencies",
			author: "Test User",
			changes: {
				added: [],
				modified: ["package.json"],
				deleted: [],
			},
		});

		// Mock the snapshot creation
		const snapshotId = await coordinator.coordinateSnapshotCreation();

		// Verify that the snapshot ID is a semantic name
		expect(snapshotId).toBeDefined();
		expect(snapshotId).toContain("-"); // Semantic names contain hyphens
		expect(snapshotId).not.toContain("snap_"); // Should not be the auto-generated ID
	});

	it("should use provided semantic name for snapshots", async () => {
		// Mock Git integration methods
		// @ts-expect-error - Accessing private property for testing
		const gitIntegration = coordinator.gitIntegration;
		vi.spyOn(gitIntegration, "getCommitContext").mockResolvedValue({
			branch: "main",
			commitHash: "abc123",
			commitMessage: "Update dependencies",
			author: "Test User",
			changes: {
				added: [],
				modified: ["package.json"],
				deleted: [],
			},
		});

		const semanticName = "updated-dependencies";
		const snapshotId =
			await coordinator.coordinateSnapshotCreationWithSemanticName(
				semanticName,
			);

		// Verify that the snapshot ID matches the provided semantic name
		expect(snapshotId).toBe(semanticName);
	});

	it("should integrate semantic naming with automatic snapshot triggers", async () => {
		// Mock Git integration with a dependency update diff
		const mockDiff = `diff --git a/package.json b/package.json
index 1234567..8901234 100644
--- a/package.json
+++ b/package.json
@@ -10,7 +10,7 @@
   "dependencies": {
     "react": "^18.2.0",
-    "react-query": "^3.39.2",
+    "react-query": "^4.0.0",
     "lodash": "^4.17.21"
   }`;

		const mockCommitContext = {
			branch: "main",
			commitHash: "abc123",
			commitMessage: "Update dependencies",
			author: "Test User",
			changes: {
				added: [],
				modified: ["package.json"],
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

		// Create semantic namer and generate name
		const semanticNamer = new SemanticSnapshotNamer();
		const semanticName = semanticNamer.generateName(mockDiff, ["package.json"]);

		// Execute snapshot creation with semantic name
		const snapshotId =
			await coordinator.coordinateSnapshotCreationWithSemanticName(
				semanticName,
			);

		// Verify that the snapshot ID matches the semantic name
		expect(snapshotId).toBe(semanticName);
		// The semantic namer should detect 3 packages changed (react, react-query, lodash)
		expect(snapshotId).toBe("updated-3-packages");
	});
});
