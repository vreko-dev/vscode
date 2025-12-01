import * as fs from "node:fs/promises";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NotificationManager } from "../../src/notificationManager.js";
import { OperationCoordinator } from "../../src/operationCoordinator.js";
import { StorageSnapshotSummaryProvider } from "../../src/services/snapshotSummaryProvider.js";
import { FileSystemStorage } from "../../src/storage/types.js";
import { SnapBackTreeProvider } from "../../src/views/snapBackTreeProvider.js";
import { WorkspaceMemoryManager } from "../../src/workspaceMemory.js";
import { createMockProtectedFileRegistry } from "../helpers/protectionLevelHelpers.js";

describe("Complete Snapshot Workflow", () => {
	let tempDir: string;
	let coordinator: OperationCoordinator;
	let workspaceMemory: WorkspaceMemoryManager;
	let notificationManager: NotificationManager;
	let storage: FileSystemStorage;
	let treeProvider: SnapBackTreeProvider;

	beforeEach(async () => {
		// Create a temporary directory for testing
		tempDir = await fs.mkdtemp(path.join(process.cwd(), "test-temp-"));

		// Initialize components
		notificationManager = new NotificationManager();
		storage = new FileSystemStorage(tempDir);
		workspaceMemory = new WorkspaceMemoryManager(storage);
		coordinator = new OperationCoordinator(
			workspaceMemory,
			notificationManager,
			storage,
		);

		// Create properly mocked protected file registry with all required methods
		const mockRegistry = createMockProtectedFileRegistry();

		treeProvider = new SnapBackTreeProvider(
			new StorageSnapshotSummaryProvider(storage),
			mockRegistry,
		);
	});

	afterEach(async () => {
		// Clean up temporary directory
		try {
			await fs.rm(tempDir, { recursive: true, force: true });
		} catch (error) {
			console.warn("Failed to clean up temp directory:", error);
		}
	});

	it("create → view → modify → restore → verify", async () => {
		// Setup: Create workspace with test file
		const testFile = path.join(tempDir, "test.txt");
		await fs.writeFile(testFile, "original content");

		// Step 1: Create snapshot
		const snapshotId = await coordinator.coordinateSnapshotCreation();
		expect(snapshotId).toBeDefined();
		expect(typeof snapshotId).toBe("string");
		expect(snapshotId).not.toBeUndefined();

		// Step 2: Verify snapshot appears in SnapBack tree view
		const [snapshotSection] = await treeProvider.getChildren();
		const snapshotItems = await treeProvider.getChildren(snapshotSection);
		expect(snapshotItems.length).toBeGreaterThan(0);
		expect(snapshotItems[0]?.id).toBe(snapshotId);

		// Step 3: Modify file
		await fs.writeFile(testFile, "modified content");
		const modifiedContent = await fs.readFile(testFile, "utf-8");
		expect(modifiedContent).toBe("modified content");

		// Step 4: Restore snapshot
		const restoreResult = await coordinator.restoreToSnapshot(snapshotId);
		expect(restoreResult).toBe(true);

		// Step 5: Verify file restored
		const restoredContent = await fs.readFile(testFile, "utf-8");
		expect(restoredContent).toBe("original content");
	});
});
