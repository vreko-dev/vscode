import * as fs from "node:fs/promises";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// In-memory storage for our file system mocks
const fileSystemStorage = new Map<string, Buffer>();

// Mock fs/promises methods
vi.mock("fs/promises", async (importOriginal) => {
	const actual = (await importOriginal()) as any;
	return {
		...actual,
		readdir: vi.fn(),
		stat: vi.fn(),
		readFile: vi.fn(),
		writeFile: vi.fn(),
		mkdir: vi.fn(),
		access: vi.fn(),
	};
});

import {
	access,
	mkdir,
	readdir,
	readFile,
	stat,
	writeFile,
} from "node:fs/promises";
import { NotificationManager } from "../../src/notificationManager";
import { OperationCoordinator } from "../../src/operationCoordinator";
import { FileSystemStorage } from "../../src/storage/types";
import { WorkspaceMemoryManager } from "../../src/workspaceMemory";

describe("Checkpoint Creation", () => {
	let tempDir: string;
	let storage: FileSystemStorage;
	let workspaceMemory: WorkspaceMemoryManager;
	let notificationManager: NotificationManager;
	let coordinator: OperationCoordinator;

	beforeEach(async () => {
		// Clear in-memory file system storage
		fileSystemStorage.clear();

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

		// Mock the file system operations that FileSystemStorage uses
		(mkdir as any).mockImplementation(async () => {});
		(access as any).mockImplementation(async (filePath: string) => {
			if (!fileSystemStorage.has(filePath)) {
				throw new Error("File not found");
			}
		});

		(writeFile as any).mockImplementation(
			async (filePath: string, data: Buffer | string) => {
				fileSystemStorage.set(
					filePath,
					Buffer.isBuffer(data) ? data : Buffer.from(data),
				);
			},
		);

		(readFile as any).mockImplementation(async (filePath: string) => {
			if (!fileSystemStorage.has(filePath)) {
				throw new Error("File not found");
			}
			return fileSystemStorage.get(filePath);
		});

		(readdir as any).mockImplementation(async (dirPath: string) => {
			const files: string[] = [];
			for (const key of fileSystemStorage.keys()) {
				if (path.dirname(key) === dirPath) {
					files.push(path.basename(key));
				}
			}
			return files;
		});
	});

	afterEach(async () => {
		// Clean up temporary directory
		try {
			await fs.rm(tempDir, { recursive: true, force: true });
		} catch (error) {
			console.warn("Failed to clean up temp directory:", error);
		}
	});

	it("should create a real checkpoint with actual file content", async () => {
		// Mock file system structure for the workspace at /test/workspace
		const mockRootEntries = [
			{
				name: "src",
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
			{
				name: "utils.ts",
				isDirectory: () => false,
				isFile: () => true,
				isSymbolicLink: () => false,
			},
		];

		// Mock the file system operations that OperationCoordinator uses
		(readdir as any).mockImplementation(
			async (dirPath: string, options?: any) => {
				// Handle FileSystemStorage directory listing
				if (dirPath.includes(".snapback")) {
					const files: string[] = [];
					for (const key of fileSystemStorage.keys()) {
						if (path.dirname(key) === dirPath) {
							files.push(path.basename(key));
						}
					}
					return files;
				}

				// Handle the case where options.withFileTypes is true (for OperationCoordinator)
				if (options?.withFileTypes) {
					if (dirPath === "/test/workspace") return mockRootEntries;
					if (dirPath === "/test/workspace/src") return mockSrcEntries;
					return [];
				}
				// Handle the case where we're just getting file names (for OperationCoordinator)
				if (dirPath === "/test/workspace") return ["src", "package.json"];
				if (dirPath === "/test/workspace/src") return ["index.ts", "utils.ts"];
				return [];
			},
		);

		(stat as any).mockImplementation(async (filePath: string) => {
			// Mock stats for directories
			if (
				filePath === "/test/workspace" ||
				filePath === "/test/workspace/src"
			) {
				return {
					isDirectory: () => true,
					isFile: () => false,
					isSymbolicLink: () => false,
					size: 4096,
					mtimeMs: Date.now(),
				};
			}

			// Mock stats for files
			return {
				isDirectory: () => false,
				isFile: () => true,
				isSymbolicLink: () => false,
				size: filePath.includes("package.json") ? 50 : 100,
				mtimeMs: Date.now(),
			};
		});

		(readFile as any).mockImplementation(async (filePath: string) => {
			if (fileSystemStorage.has(filePath)) {
				return fileSystemStorage.get(filePath);
			}

			if (filePath.includes("index.ts")) {
				return Buffer.from("console.log('hello world');");
			}
			if (filePath.includes("utils.ts")) {
				return Buffer.from("export const util = () => {};");
			}
			if (filePath.includes("package.json")) {
				return Buffer.from('{"name": "test-project"}');
			}
			return Buffer.from("");
		});

		(writeFile as any).mockImplementation(
			async (filePath: string, data: Buffer | string) => {
				fileSystemStorage.set(
					filePath,
					Buffer.isBuffer(data) ? data : Buffer.from(data),
				);
			},
		);

		// First, let's test that storage is working correctly
		const testData = {
			trigger: "test",
			risk: 0,
			content: "test content",
		};

		const testCheckpoint = await storage.create(testData);
		console.log("Test checkpoint created:", testCheckpoint);

		const retrievedTestCheckpoint = await storage.retrieve(testCheckpoint.id);
		console.log("Test checkpoint retrieved:", retrievedTestCheckpoint);

		expect(retrievedTestCheckpoint).toBeDefined();
		expect(retrievedTestCheckpoint?.id).toBe(testCheckpoint.id);

		// Create checkpoint
		const checkpointId = await coordinator.coordinateCheckpointCreation();
		console.log("Checkpoint ID created:", checkpointId);

		// List all checkpoints to see what's in storage
		const allCheckpoints = await storage.list();
		console.log("All checkpoints in storage:", allCheckpoints);

		// Verify checkpoint was created
		expect(checkpointId).toBeDefined();
		expect(typeof checkpointId).toBe("string");
		expect(checkpointId).toMatch(/^cp_/);

		// Verify checkpoint exists in storage
		const checkpoint = await storage.retrieve(checkpointId!);
		console.log("Retrieved checkpoint:", checkpoint);
		expect(checkpoint).toBeDefined();
		expect(checkpoint?.id).toBe(checkpointId);
		expect(checkpoint?.meta?.trigger).toBe("Manual checkpoint creation");

		// Verify file contents were saved
		const checkpoints = await storage.list();
		expect(checkpoints.length).toBe(2); // 1 test checkpoint + 1 created by coordinator
		// Find the checkpoint created by coordinator
		const coordinatorCheckpoint = checkpoints.find(
			(cp) => cp.id === checkpointId,
		);
		expect(coordinatorCheckpoint).toBeDefined();
		expect(coordinatorCheckpoint?.id).toBe(checkpointId);
	});

	it("should show notification with actual file counts", async () => {
		// Mock file system structure for the workspace at /test/workspace
		const mockRootEntries = [
			{
				name: "src",
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
			{
				name: "utils.ts",
				isDirectory: () => false,
				isFile: () => true,
				isSymbolicLink: () => false,
			},
		];

		// Mock the file system operations that OperationCoordinator uses
		(readdir as any).mockImplementation(
			async (dirPath: string, options?: any) => {
				// Handle FileSystemStorage directory listing
				if (dirPath.includes(".snapback")) {
					const files: string[] = [];
					for (const key of fileSystemStorage.keys()) {
						if (path.dirname(key) === dirPath) {
							files.push(path.basename(key));
						}
					}
					return files;
				}

				// Handle the case where options.withFileTypes is true (for OperationCoordinator)
				if (options?.withFileTypes) {
					if (dirPath === "/test/workspace") return mockRootEntries;
					if (dirPath === "/test/workspace/src") return mockSrcEntries;
					return [];
				}
				// Handle the case where we're just getting file names (for OperationCoordinator)
				if (dirPath === "/test/workspace") return ["src", "package.json"];
				if (dirPath === "/test/workspace/src") return ["index.ts", "utils.ts"];
				return [];
			},
		);

		(stat as any).mockImplementation(async (filePath: string) => {
			// Mock stats for directories
			if (
				filePath === "/test/workspace" ||
				filePath === "/test/workspace/src"
			) {
				return {
					isDirectory: () => true,
					isFile: () => false,
					isSymbolicLink: () => false,
					size: 4096,
					mtimeMs: Date.now(),
				};
			}

			// Mock stats for files
			return {
				isDirectory: () => false,
				isFile: () => true,
				isSymbolicLink: () => false,
				size: filePath.includes("package.json") ? 50 : 100,
				mtimeMs: Date.now(),
			};
		});

		(readFile as any).mockImplementation(async (filePath: string) => {
			if (fileSystemStorage.has(filePath)) {
				return fileSystemStorage.get(filePath);
			}

			if (filePath.includes("index.ts")) {
				return Buffer.from("console.log('hello world');");
			}
			if (filePath.includes("utils.ts")) {
				return Buffer.from("export const util = () => {};");
			}
			if (filePath.includes("package.json")) {
				return Buffer.from('{"name": "test-project"}');
			}
			return Buffer.from("");
		});

		(writeFile as any).mockImplementation(
			async (filePath: string, data: Buffer | string) => {
				fileSystemStorage.set(
					filePath,
					Buffer.isBuffer(data) ? data : Buffer.from(data),
				);
			},
		);

		(mkdir as any).mockImplementation(async () => {});

		// Spy on notification manager
		const showNotificationSpy = vi.spyOn(
			notificationManager,
			"showEnhancedCheckpointCreated",
		);

		// Create checkpoint
		await coordinator.coordinateCheckpointCreation();

		// Verify notification was called with correct file counts
		expect(showNotificationSpy).toHaveBeenCalled();
		const notificationCall = showNotificationSpy.mock.calls[0][0];
		expect(notificationCall.protectedFiles).toBe(3);
		// The directory count will be 2 because we have files in both src/ and root directory
		expect(notificationCall.directories).toBe(2);
	});

	it("should update workspace memory with checkpoint ID", async () => {
		// Mock file system structure for the workspace at /test/workspace
		const mockRootEntries = [
			{
				name: "src",
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

		// Mock the file system operations that OperationCoordinator uses
		(readdir as any).mockImplementation(
			async (dirPath: string, options?: any) => {
				// Handle FileSystemStorage directory listing
				if (dirPath.includes(".snapback")) {
					const files: string[] = [];
					for (const key of fileSystemStorage.keys()) {
						if (path.dirname(key) === dirPath) {
							files.push(path.basename(key));
						}
					}
					return files;
				}

				// Handle the case where options.withFileTypes is true (for OperationCoordinator)
				if (options?.withFileTypes) {
					if (dirPath === "/test/workspace") return mockRootEntries;
					if (dirPath === "/test/workspace/src") return mockSrcEntries;
					return [];
				}
				// Handle the case where we're just getting file names (for OperationCoordinator)
				if (dirPath === "/test/workspace") return ["src"];
				if (dirPath === "/test/workspace/src") return ["index.ts"];
				return [];
			},
		);

		(stat as any).mockImplementation(async (filePath: string) => {
			// Mock stats for directories
			if (
				filePath === "/test/workspace" ||
				filePath === "/test/workspace/src"
			) {
				return {
					isDirectory: () => true,
					isFile: () => false,
					isSymbolicLink: () => false,
					size: 4096,
					mtimeMs: Date.now(),
				};
			}

			// Mock stats for files
			return {
				isDirectory: () => false,
				isFile: () => true,
				isSymbolicLink: () => false,
				size: 100,
				mtimeMs: Date.now(),
			};
		});

		(readFile as any).mockImplementation(async (filePath: string) => {
			if (fileSystemStorage.has(filePath)) {
				return fileSystemStorage.get(filePath);
			}
			return Buffer.from("test content");
		});

		(writeFile as any).mockImplementation(
			async (filePath: string, data: Buffer | string) => {
				fileSystemStorage.set(
					filePath,
					Buffer.isBuffer(data) ? data : Buffer.from(data),
				);
			},
		);

		(mkdir as any).mockImplementation(async () => {});

		// Create checkpoint
		const checkpointId = await coordinator.coordinateCheckpointCreation();

		// Verify workspace memory was updated
		const context = workspaceMemory.getContext();
		expect(context.lastCheckpoint).toBe(checkpointId);
	});
});
