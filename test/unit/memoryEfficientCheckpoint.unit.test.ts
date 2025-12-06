import * as fs from "node:fs/promises";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock fs/promises methods
vi.mock("fs/promises", async (importOriginal) => {
	const actual = (await importOriginal()) as any;
	return {
		...actual,
		stat: vi.fn(),
		readdir: vi.fn(),
		readFile: vi.fn(),
	};
});

import { readdir, readFile, stat } from "node:fs/promises";
import { NotificationManager } from "../../src/notificationManager";
import { OperationCoordinator } from "../../src/operationCoordinator";
import { FileSystemStorage } from "../../src/storage/types";
import { WorkspaceMemoryManager } from "../../src/workspaceMemory";

describe("Memory Efficient Checkpoint Creation", () => {
	let tempDir: string;
	let storage: FileSystemStorage;
	let workspaceMemory: WorkspaceMemoryManager;
	let notificationManager: NotificationManager;
	let coordinator: OperationCoordinator;

	beforeEach(async () => {
		// Create a temporary directory for testing
		tempDir = await fs.mkdtemp(path.join(process.cwd(), "test-temp-"));
		storage = new FileSystemStorage(tempDir);
		workspaceMemory = new WorkspaceMemoryManager(storage);
		notificationManager = new NotificationManager();
		coordinator = new OperationCoordinator(
			workspaceMemory,
			notificationManager,
			storage,
		);

		// Reset mocks
		vi.clearAllMocks();
	});

	afterEach(async () => {
		// Clean up temporary directory
		try {
			await fs.rm(tempDir, { recursive: true, force: true });
		} catch (error) {
			console.warn("Failed to clean up temp directory:", error);
		}
	});

	it("should process files with smaller batches to prevent memory overflow", async () => {
		// Mock file system structure with many small files
		const mockEntries = [
			{
				name: "file1.txt",
				isDirectory: () => false,
				isFile: () => true,
				isSymbolicLink: () => false,
			},
			{
				name: "file2.txt",
				isDirectory: () => false,
				isFile: () => true,
				isSymbolicLink: () => false,
			},
			{
				name: "file3.txt",
				isDirectory: () => false,
				isFile: () => true,
				isSymbolicLink: () => false,
			},
		];

		// @ts-expect-error - Mocking readdir
		readdir.mockImplementation(async (dirPath) => {
			if (dirPath === "/test/workspace") return mockEntries;
			return [];
		});

		// @ts-expect-error - Mocking stat
		stat.mockImplementation(async (_filePath) => {
			return {
				size: 100, // Small files
				isFile: () => true,
				isDirectory: () => false,
			};
		});

		// @ts-expect-error - Mocking readFile
		readFile.mockImplementation(async (filePath) => {
			// Simulate reading file content
			return Buffer.from(`Content of ${path.basename(filePath)}`);
		});

		// Create checkpoint
		const checkpointId = await coordinator.coordinateCheckpointCreation();

		// Verify checkpoint was created
		expect(checkpointId).toBeDefined();

		// Verify that all files were read
		expect(readFile).toHaveBeenCalledTimes(3);

		// Verify that files were processed
		expect(readFile).toHaveBeenCalledWith("/test/workspace/file1.txt", "utf-8");
		expect(readFile).toHaveBeenCalledWith("/test/workspace/file2.txt", "utf-8");
		expect(readFile).toHaveBeenCalledWith("/test/workspace/file3.txt", "utf-8");
	});

	it("should skip node_modules directory during traversal", async () => {
		// Mock file system structure with node_modules
		const mockEntries = [
			{
				name: "src",
				isDirectory: () => true,
				isFile: () => false,
				isSymbolicLink: () => false,
			},
			{
				name: "node_modules",
				isDirectory: () => true,
				isFile: () => false,
				isSymbolicLink: () => false,
			},
			{
				name: "package.json",
				isDirectory: () => false,
				isFile: () => true,
				isSymbolicLink: () => false,
			},
		];

		const mockSrcEntries = [
			{
				name: "index.ts",
				isDirectory: () => false,
				isFile: () => true,
				isSymbolicLink: () => false,
			},
		];

		const mockNodeModulesEntries = [
			{
				name: "lodash",
				isDirectory: () => true,
				isFile: () => false,
				isSymbolicLink: () => false,
			},
		];

		const mockLodashEntries = [
			{
				name: "index.js",
				isDirectory: () => false,
				isFile: () => true,
				isSymbolicLink: () => false,
			},
			{
				name: "package.json",
				isDirectory: () => false,
				isFile: () => true,
				isSymbolicLink: () => false,
			},
		];

		// @ts-expect-error - Mocking readdir
		readdir.mockImplementation(async (dirPath) => {
			if (dirPath === "/test/workspace") return mockEntries;
			if (dirPath === "/test/workspace/src") return mockSrcEntries;
			if (dirPath === "/test/workspace/node_modules")
				return mockNodeModulesEntries;
			if (dirPath === "/test/workspace/node_modules/lodash")
				return mockLodashEntries;
			return [];
		});

		// @ts-expect-error - Mocking stat
		stat.mockImplementation(async (filePath) => {
			return {
				size: 100,
				isFile: () => !filePath.endsWith("/"),
				isDirectory: () => filePath.endsWith("/"),
			};
		});

		// @ts-expect-error - Mocking readFile
		readFile.mockResolvedValue(Buffer.from("test content"));

		// Spy on console.log to verify skip logging
		const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

		// Create checkpoint
		const checkpointId = await coordinator.coordinateCheckpointCreation();

		// Verify checkpoint was created
		expect(checkpointId).toBeDefined();

		// Verify that src files were read
		expect(readFile).toHaveBeenCalledWith(
			"/test/workspace/src/index.ts",
			"utf-8",
		);
		expect(readFile).toHaveBeenCalledWith(
			"/test/workspace/package.json",
			"utf-8",
		);

		// Verify that node_modules files were NOT read
		expect(readFile).not.toHaveBeenCalledWith(
			"/test/workspace/node_modules/lodash/index.js",
			"utf-8",
		);
		expect(readFile).not.toHaveBeenCalledWith(
			"/test/workspace/node_modules/lodash/package.json",
			"utf-8",
		);

		// Verify logging occurred
		expect(consoleLogSpy).toHaveBeenCalledWith(
			expect.stringContaining("Skipping node_modules directory"),
		);

		consoleLogSpy.mockRestore();
	});

	it("should respect file size limits", async () => {
		// Mock file system structure with large files
		const mockEntries = [
			{
				name: "small.txt",
				isDirectory: () => false,
				isFile: () => true,
				isSymbolicLink: () => false,
			},
			{
				name: "large.txt",
				isDirectory: () => false,
				isFile: () => true,
				isSymbolicLink: () => false,
			},
		];

		// @ts-expect-error - Mocking readdir
		readdir.mockImplementation(async (dirPath) => {
			if (dirPath === "/test/workspace") return mockEntries;
			return [];
		});

		// @ts-expect-error - Mocking stat
		stat.mockImplementation(async (filePath) => {
			if (filePath === "/test/workspace/large.txt") {
				return {
					size: 15 * 1024 * 1024, // 15MB - larger than limit
					isFile: () => true,
					isDirectory: () => false,
				};
			}
			return {
				size: 100, // 100 bytes - small file
				isFile: () => true,
				isDirectory: () => false,
			};
		});

		// @ts-expect-error - Mocking readFile
		readFile.mockImplementation(async (filePath) => {
			if (filePath === "/test/workspace/large.txt") {
				return Buffer.from("large content");
			}
			return Buffer.from("small content");
		});

		// Spy on console.warn to verify large file skipping
		const consoleWarnSpy = vi
			.spyOn(console, "warn")
			.mockImplementation(() => {});

		// Create checkpoint
		const checkpointId = await coordinator.coordinateCheckpointCreation();

		// Verify checkpoint was created
		expect(checkpointId).toBeDefined();

		// Verify that small file was read
		expect(readFile).toHaveBeenCalledWith("/test/workspace/small.txt", "utf-8");

		// Verify that large file was not read
		expect(readFile).not.toHaveBeenCalledWith(
			"/test/workspace/large.txt",
			"utf-8",
		);

		// Verify warning was logged for large file
		expect(consoleWarnSpy).toHaveBeenCalledWith(
			expect.stringContaining("Skipping large file"),
		);

		consoleWarnSpy.mockRestore();
	});
});
