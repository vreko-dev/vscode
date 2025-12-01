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
import { NotificationManager } from "../../src/notificationManager.js";
import { OperationCoordinator } from "../../src/operationCoordinator.js";
import { FileSystemStorage } from "../../src/storage/types.js";
import { WorkspaceMemoryManager } from "../../src/workspaceMemory.js";

describe("Efficient Checkpoint Creation", () => {
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

	it("should skip node_modules during traversal", async () => {
		// Mock file system structure
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
				name: "package",
				isDirectory: () => true,
				isFile: () => false,
				isSymbolicLink: () => false,
			},
		];

		const mockPackageEntries = [
			{
				name: "index.js",
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
			if (dirPath === "/test/workspace/node_modules/package")
				return mockPackageEntries;
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

		// Create checkpoint
		const checkpointId = await coordinator.coordinateCheckpointCreation();

		// Verify checkpoint was created
		expect(checkpointId).toBeDefined();

		// Verify that node_modules files were not read
		expect(readFile).not.toHaveBeenCalledWith(
			"/test/workspace/node_modules/package/index.js",
			"utf-8",
		);

		// Verify that src files were read
		expect(readFile).toHaveBeenCalledWith(
			"/test/workspace/src/index.ts",
			"utf-8",
		);
		expect(readFile).toHaveBeenCalledWith(
			"/test/workspace/package.json",
			"utf-8",
		);
	});

	it("should throw when file limit exceeded", async () => {
		// Mock file system structure with many files
		const mockEntries = [
			{
				name: "files",
				isDirectory: () => true,
				isFile: () => false,
				isSymbolicLink: () => false,
			},
		];

		const mockFileEntries: Array<{
			name: string;
			isDirectory: () => boolean;
			isFile: () => boolean;
			isSymbolicLink: () => boolean;
		}> = [];
		for (let i = 0; i < 11000; i++) {
			mockFileEntries.push({
				name: `file${i}.txt`,
				isDirectory: () => false,
				isFile: () => true,
				isSymbolicLink: () => false,
			});
		}

		// @ts-expect-error - Mocking readdir
		readdir.mockImplementation(async (dirPath) => {
			if (dirPath === "/test/workspace") return mockEntries;
			if (dirPath === "/test/workspace/files") return mockFileEntries;
			return [];
		});

		// @ts-expect-error - Mocking stat
		stat.mockImplementation(async (_filePath) => {
			return {
				size: 100,
				isFile: () => true,
				isDirectory: () => false,
			};
		});

		// Attempt to create checkpoint
		await expect(coordinator.coordinateCheckpointCreation()).rejects.toThrow(
			"File limit exceeded",
		);
	});

	it("should skip files larger than 10MB", async () => {
		// Mock file system structure
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
					size: 15 * 1024 * 1024, // 15MB
					isFile: () => true,
					isDirectory: () => false,
				};
			}
			return {
				size: 100, // 100 bytes
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

		// Create checkpoint
		const checkpointId = await coordinator.coordinateCheckpointCreation();

		// Verify checkpoint was created
		expect(checkpointId).toBeDefined();

		// Verify that small file was read
		expect(readFile).toHaveBeenCalledWith("/test/workspace/small.txt", "utf-8");

		// Verify that large file was not included in checkpoint
		const checkpoint = await storage.retrieve(checkpointId!);
		const relativePath = path.relative(
			"/test/workspace",
			"/test/workspace/small.txt",
		);
		expect(checkpoint?.meta?.files).toContain(relativePath);

		// Large file should not be in the checkpoint
		const largeRelativePath = path.relative(
			"/test/workspace",
			"/test/workspace/large.txt",
		);
		expect(checkpoint?.meta?.files).not.toContain(largeRelativePath);
	});

	it("should not follow symlinks", async () => {
		// Mock file system structure with symlink
		const mockEntries = [
			{
				name: "file.txt",
				isDirectory: () => false,
				isFile: () => true,
				isSymbolicLink: () => false,
			},
			{
				name: "link",
				isDirectory: () => false,
				isFile: () => false,
				isSymbolicLink: () => true,
			},
		];

		// @ts-expect-error - Mocking readdir
		readdir.mockImplementation(async (dirPath) => {
			if (dirPath === "/test/workspace") return mockEntries;
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

		// Create checkpoint
		const checkpointId = await coordinator.coordinateCheckpointCreation();

		// Verify checkpoint was created
		expect(checkpointId).toBeDefined();

		// Verify that regular file was read
		expect(readFile).toHaveBeenCalledWith("/test/workspace/file.txt", "utf-8");

		// Verify that symlink was not followed
		expect(readFile).not.toHaveBeenCalledWith("/test/workspace/link", "utf-8");
	});

	it("should load ignore patterns from .gitignore and .snapbackignore", async () => {
		// Mock file system structure
		const mockEntries = [
			{
				name: "src",
				isDirectory: () => true,
				isFile: () => false,
				isSymbolicLink: () => false,
			},
			{
				name: "dist",
				isDirectory: () => true,
				isFile: () => false,
				isSymbolicLink: () => false,
			},
			{
				name: "custom-ignore",
				isDirectory: () => true,
				isFile: () => false,
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

		const mockDistEntries = [
			{
				name: "bundle.js",
				isDirectory: () => false,
				isFile: () => true,
				isSymbolicLink: () => false,
			},
		];

		const mockCustomEntries = [
			{
				name: "ignored.txt",
				isDirectory: () => false,
				isFile: () => true,
				isSymbolicLink: () => false,
			},
		];

		// @ts-expect-error - Mocking readdir
		readdir.mockImplementation(async (dirPath) => {
			if (dirPath === "/test/workspace") return mockEntries;
			if (dirPath === "/test/workspace/src") return mockSrcEntries;
			if (dirPath === "/test/workspace/dist") return mockDistEntries;
			if (dirPath === "/test/workspace/custom-ignore") return mockCustomEntries;
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
		readFile.mockImplementation(async (filePath) => {
			if (filePath === "/test/workspace/.gitignore") {
				return Buffer.from("dist/\n");
			}
			if (filePath === "/test/workspace/.snapbackignore") {
				return Buffer.from("custom-ignore/\n");
			}
			return Buffer.from("test content");
		});

		// Create checkpoint
		const checkpointId = await coordinator.coordinateCheckpointCreation();

		// Verify checkpoint was created
		expect(checkpointId).toBeDefined();

		// Verify that src file was read
		expect(readFile).toHaveBeenCalledWith(
			"/test/workspace/src/index.ts",
			"utf-8",
		);

		// Verify that dist file was not read (ignored by .gitignore)
		expect(readFile).not.toHaveBeenCalledWith(
			"/test/workspace/dist/bundle.js",
			"utf-8",
		);

		// Verify that custom ignored file was not read (ignored by .snapbackignore)
		expect(readFile).not.toHaveBeenCalledWith(
			"/test/workspace/custom-ignore/ignored.txt",
			"utf-8",
		);
	});
});
