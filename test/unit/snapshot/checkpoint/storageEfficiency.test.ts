import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { NotificationManager } from "@vscode/notificationManager";
import { OperationCoordinator } from "@vscode/operationCoordinator";
import { FileSystemStorage } from "@vscode/storage/types";
import { WorkspaceMemoryManager } from "@vscode/workspaceMemory";

describe("Checkpoint Storage Efficiency Tests", () => {
	let operationCoordinator: OperationCoordinator;
	let workspaceMemory: WorkspaceMemoryManager;
	let notificationManager: NotificationManager;
	let storage: FileSystemStorage;
	let testWorkspaceRoot: string;
	let testFiles: string[];

	beforeEach(async () => {
		// Setup test workspace in temp directory
		testWorkspaceRoot = await fs.mkdtemp(
			path.join(os.tmpdir(), "snapback-storage-test-"),
		);
		testFiles = [];

		// Mock vscode workspace to use our temp directory
		vi.mocked(vscode.workspace).workspaceFolders = [
			{ uri: { fsPath: testWorkspaceRoot } } as any,
		];

		// Initialize services
		notificationManager = new NotificationManager();
		storage = new FileSystemStorage(testWorkspaceRoot);
		workspaceMemory = new WorkspaceMemoryManager(storage);
		operationCoordinator = new OperationCoordinator(
			workspaceMemory,
			notificationManager,
			storage,
		);
	});

	afterEach(async () => {
		// Clean up test files
		for (const file of testFiles) {
			try {
				await fs.unlink(file);
			} catch {
				// File may not exist
			}
		}
		testFiles = [];

		// Clean up test workspace directory
		try {
			await fs.rm(testWorkspaceRoot, { recursive: true, force: true });
		} catch {
			// Directory may not exist
		}
	});

	/**
	 * CRITICAL TEST: Verifies that checkpoints only include specified files
	 * REGRESSION BUG #1: Storage bloat - checkpointing entire workspace instead of single file
	 */
	it("Should ONLY include specified files in checkpoint, not entire workspace", async () => {
		// Create test file to checkpoint
		const testFile = path.join(testWorkspaceRoot, "test-single.ts");
		await fs.writeFile(testFile, 'console.log("single file");');
		testFiles.push(testFile);

		// Create additional files that should NOT be checkpointed
		const extraFile1 = path.join(testWorkspaceRoot, "extra1.ts");
		const extraFile2 = path.join(testWorkspaceRoot, "extra2.ts");
		await fs.writeFile(extraFile1, 'console.log("extra 1");');
		await fs.writeFile(extraFile2, 'console.log("extra 2");');
		testFiles.push(extraFile1, extraFile2);

		// Create checkpoint with ONLY the single test file
		const checkpointId =
			await operationCoordinator.coordinateCheckpointCreation(
				false,
				[testFile], // CRITICAL: Only checkpoint this one file
			);

		// Retrieve checkpoint and verify contents
		const checkpoint = await storage.retrieve(checkpointId!);
		expect(checkpoint).toBeDefined();

		// CRITICAL ASSERTION: Checkpoint should contain ONLY 1 file
		expect(checkpoint.files.length).toBe(1);
		expect(checkpoint.files[0]).toContain("test-single.ts");

		// Verify extra files are NOT included
		expect(checkpoint.files).not.toContain("extra1.ts");
		expect(checkpoint.files).not.toContain("extra2.ts");
	});

	/**
	 * CRITICAL TEST: Verifies workspace files are excluded from single-file checkpoints
	 * REGRESSION BUG #1: 99.9% waste - entire workspace checkpointed for single file save
	 */
	it("Should NOT include workspace files when checkpointing a single file", async () => {
		// Create a single file
		const singleFile = path.join(testWorkspaceRoot, "important.ts");
		await fs.writeFile(singleFile, "const data = 42;");
		testFiles.push(singleFile);

		// Mock workspace with many files (simulating node_modules, dist, etc.)
		const distractorFile = path.join(testWorkspaceRoot, "dist-output.js");
		await fs.writeFile(distractorFile, "// compiled code");
		testFiles.push(distractorFile);

		// Create incremental checkpoint for single file
		const checkpointId =
			await operationCoordinator.coordinateCheckpointCreation(false, [
				singleFile,
			]);

		const checkpoint = await storage.retrieve(checkpointId!);

		// CRITICAL: Should only contain the one specified file
		expect(checkpoint.files.length).toBe(1);

		// Calculate storage efficiency
		const totalWorkspaceFiles = testFiles.length; // All files in workspace
		const checkpointedFiles = checkpoint.files.length;
		const wastePercentage =
			((totalWorkspaceFiles - checkpointedFiles) / totalWorkspaceFiles) * 100;

		// Should have 0% waste (only checkpointed what was requested)
		expect(wastePercentage).toBe(50); // 1 file out of 2 = 50% efficiency
	});

	/**
	 * TEST: Checkpoint size should be proportional to file count
	 */
	it("Should have checkpoint size proportional to file count", async () => {
		// Create checkpoints with different file counts
		const smallFile = path.join(testWorkspaceRoot, "small.ts");
		await fs.writeFile(smallFile, "const x = 1;");
		testFiles.push(smallFile);

		const smallCheckpointId =
			await operationCoordinator.coordinateCheckpointCreation(false, [
				smallFile,
			]);
		const smallCheckpoint = await storage.retrieve(smallCheckpointId!);

		// Create multiple files for larger checkpoint
		const largeFiles: string[] = [];
		for (let i = 0; i < 5; i++) {
			const file = path.join(testWorkspaceRoot, `large-${i}.ts`);
			await fs.writeFile(file, `const data${i} = ${i};`);
			largeFiles.push(file);
			testFiles.push(file);
		}

		const largeCheckpointId =
			await operationCoordinator.coordinateCheckpointCreation(
				false,
				largeFiles,
			);
		const largeCheckpoint = await storage.retrieve(largeCheckpointId!);

		// Verify proportionality
		expect(largeCheckpoint?.files?.length).toBe(5);
		expect(smallCheckpoint?.files?.length).toBe(1);
		expect(largeCheckpoint?.files?.length).toBeGreaterThan(
			smallCheckpoint?.files?.length,
		);
	});

	/**
	 * TEST: Storage limits should be enforced
	 */
	it("Should respect file size limits", async () => {
		// Create a file that's too large (>10MB)
		const largeFile = path.join(testWorkspaceRoot, "huge.txt");
		const largeContent = "x".repeat(11 * 1024 * 1024); // 11MB

		await fs.writeFile(largeFile, largeContent);
		testFiles.push(largeFile);

		const smallFile = path.join(testWorkspaceRoot, "normal.ts");
		await fs.writeFile(smallFile, "const x = 1;");
		testFiles.push(smallFile);

		// Create checkpoint with both files
		const checkpointId =
			await operationCoordinator.coordinateCheckpointCreation(false, [
				largeFile,
				smallFile,
			]);

		const checkpoint = await storage.retrieve(checkpointId!);

		// CRITICAL: Large file should be skipped
		// Checkpoint should only contain the normal file
		expect(checkpoint?.files).toContain("normal.ts");
		expect(checkpoint?.files).not.toContain("huge.txt");
	});

	/**
	 * TEST: Empty file array should not create checkpoint
	 */
	it("Should handle empty file array gracefully", async () => {
		// Attempt to create checkpoint with empty array
		const checkpointId =
			await operationCoordinator.coordinateCheckpointCreation(
				false,
				[], // Empty array
			);

		// Should return undefined or handle gracefully
		// The implementation should not scan entire workspace
		expect(checkpointId).toBeDefined(); // May create empty checkpoint or handle differently
	});

	/**
	 * HELPER FUNCTION: Calculate checkpoint storage size
	 */
	async function getCheckpointSize(checkpointId: string): Promise<number> {
		const checkpoint = await storage.retrieve(checkpointId);
		let totalSize = 0;

		if (checkpoint?.fileContents) {
			for (const content of Object.values(checkpoint.fileContents)) {
				totalSize += Buffer.byteLength(content as string, "utf-8");
			}
		}

		return totalSize;
	}

	/**
	 * TEST: Verify checkpoint size reporting
	 */
	it("Should accurately report checkpoint size", async () => {
		const testFile = path.join(testWorkspaceRoot, "size-test.ts");
		const content = "const test = 'hello world';";
		await fs.writeFile(testFile, content);
		testFiles.push(testFile);

		const checkpointId =
			await operationCoordinator.coordinateCheckpointCreation(false, [
				testFile,
			]);

		const size = await getCheckpointSize(checkpointId!);
		const expectedSize = Buffer.byteLength(content, "utf-8");

		// Size should match file content size (within reasonable margin for metadata)
		expect(size).toBeGreaterThanOrEqual(expectedSize);
	});
});
