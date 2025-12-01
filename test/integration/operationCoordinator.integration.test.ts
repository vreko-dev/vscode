import { beforeEach, describe, expect, it, vi } from "vitest";
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
	})),
}));

// Mock VS Code API
vi.mock("vscode", () => ({
	window: {
		showInformationMessage: vi.fn(),
		showWarningMessage: vi.fn(),
		showErrorMessage: vi.fn(),
	},
}));

describe("OperationCoordinator Integration", () => {
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

	it("should generate semantic snapshot names during snapshot creation", async () => {
		// Mock GitIntegration to return specific diff and changes
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

		// Execute snapshot creation
		const snapshotName = await coordinator.coordinateSnapshotCreation();

		// Verify that a semantic name was generated (should be "updated-3-packages" based on our implementation)
		expect(snapshotName).toBe("updated-3-packages");

		// Verify that the workspace memory was updated with the semantic name
		expect(workspaceMemory.getContext().lastSnapshot).toBe(
			"updated-3-packages",
		);
	});

	it("should generate different semantic names for different change types", async () => {
		// Mock GitIntegration to return config change diff
		const mockDiff = `diff --git a/tsconfig.json b/tsconfig.json
index 1234567..8901234 100644
--- a/tsconfig.json
+++ b/tsconfig.json
@@ -5,7 +5,7 @@
   "compilerOptions": {
-    "target": "es2020",
+    "target": "es2022",
     "strict": true
   }`;

		const mockCommitContext = {
			branch: "main",
			commitHash: "abc123",
			commitMessage: "Update TypeScript config",
			author: "Test User",
			changes: {
				added: [],
				modified: ["tsconfig.json"],
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

		// Execute snapshot creation
		const snapshotName = await coordinator.coordinateSnapshotCreation();

		// Verify that a semantic name was generated for config change
		expect(snapshotName).toBe("typescript-config-update");
	});
});
