import * as path from "node:path";
import { rimraf } from "rimraf";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SqliteStorageAdapter } from "../../../src/storage/SqliteStorageAdapter.js";
import { describeSqlite } from "../../helpers/sqliteTestUtils.js";

// Mock fs/promises methods
vi.mock("fs/promises", async (importOriginal) => {
	const actual = (await importOriginal()) as any;
	return {
		...actual,
		readFile: vi.fn(),
		writeFile: vi.fn(),
		mkdir: vi.fn(),
		stat: vi.fn(),
	};
});

import * as fs from "node:fs/promises";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";

describeSqlite("SqliteStorageAdapter", () => {
	let adapter: SqliteStorageAdapter;
	const testDir = path.join(__dirname, ".test-snapback-storage");

	beforeEach(async () => {
		// Reset mocks
		vi.clearAllMocks();

		// Make sure the test directory and .snapback subdirectory exist using the real fs
		// We need to create the directory before mocking fs operations
		const realFs = (await vi.importActual("fs/promises")) as any;
		await realFs.mkdir(testDir, { recursive: true });
		await realFs.mkdir(path.join(testDir, ".snapback"), {
			recursive: true,
		});

		adapter = new SqliteStorageAdapter(testDir);
		await adapter.initialize();
	});

	afterEach(async () => {
		await adapter.close();
		await rimraf(testDir);
	});

	describe("create", () => {
		it("should create checkpoint with fileContents", async () => {
			const data = {
				trigger: "test_checkpoint",
				risk: 0,
				content: "Test checkpoint content",
				files: ["src/index.ts", "src/utils.ts"],
				fileContents: {
					"src/index.ts": 'console.log("hello");',
					"src/utils.ts": 'export const VERSION = "1.0.0";',
				},
			};

			const checkpoint = await adapter.create(data);

			expect(checkpoint.id).toMatch(/^cp_[a-z0-9_]+$/);
			expect(checkpoint.meta?.trigger).toBe("test_checkpoint");
			expect(checkpoint.files).toEqual(["src/index.ts", "src/utils.ts"]);
			expect(checkpoint.fileContents).toEqual({
				"src/index.ts": 'console.log("hello");',
				"src/utils.ts": 'export const VERSION = "1.0.0";',
			});
		});

		it("should handle empty fileContents", async () => {
			const data = {
				trigger: "empty_checkpoint",
				risk: 0,
				content: "Empty checkpoint content",
				files: [],
				fileContents: {},
			};

			const checkpoint = await adapter.create(data);

			expect(checkpoint.fileContents).toEqual({});
		});
	});

	describe("retrieve", () => {
		it("should retrieve checkpoint with fileContents", async () => {
			const createData = {
				trigger: "test_checkpoint",
				risk: 0,
				content: "Test content",
				files: ["src/test.ts"],
				fileContents: {
					"src/test.ts": "test file content",
				},
			};

			const created = await adapter.create(createData);
			const retrieved = await adapter.retrieve(created.id);

			expect(retrieved).toBeDefined();
			expect(retrieved?.id).toBe(created.id);
			expect(retrieved?.fileContents).toEqual({
				"src/test.ts": "test file content",
			});
		});

		it("should merge custom metadata fields into meta payload", async () => {
			const adapter = new SqliteStorageAdapter(testDir);
			const checkpointTimestamp = Date.now();

			vi.spyOn(adapter, "initialize").mockResolvedValue();
			(adapter as any).sqliteStorage = {
				getCheckpoint: vi.fn().mockResolvedValue({
					id: "checkpoint-meta",
					name: "manual_trigger",
					timestamp: checkpointTimestamp,
					files: new Map([["src/demo.ts", "console.log('demo');"]]),
					metadata: JSON.stringify({
						trigger: "manual_override",
						customFlag: "preserve-me",
						risk: 3,
					}),
				}),
				close: vi.fn().mockResolvedValue(undefined),
			};

			const result = await adapter.retrieve("checkpoint-meta");

			expect(result).toBeDefined();
			expect(result?.meta).toMatchObject({
				trigger: "manual_trigger",
				customFlag: "preserve-me",
				risk: 3,
				// The adapter should prefer stored metadata trigger but still include name as trigger
			});
			expect(result?.files).toEqual(["src/demo.ts"]);
			expect(result?.fileContents).toEqual({
				"src/demo.ts": "console.log('demo');",
			});

			await adapter.close();
		});

		it("should return null for non-existent checkpoint", async () => {
			const result = await adapter.retrieve("non-existent-id");

			expect(result).toBeNull();
		});

		it("should handle checkpoint with no files", async () => {
			const createData = {
				trigger: "empty_checkpoint",
				risk: 0,
				content: "Empty content",
				files: [],
				fileContents: {},
			};

			const created = await adapter.create(createData);
			const retrieved = await adapter.retrieve(created.id);

			expect(retrieved?.fileContents).toEqual({});
		});
	});

	describe("list", () => {
		it("should list all checkpoints with fileContents", async () => {
			// Create multiple checkpoints
			const checkpoint1 = await adapter.create({
				trigger: "checkpoint_1",
				content: "First checkpoint",
				files: ["file1.ts"],
				fileContents: { "file1.ts": "content1" },
			});

			const checkpoint2 = await adapter.create({
				trigger: "checkpoint_2",
				content: "Second checkpoint",
				files: ["file2.ts"],
				fileContents: { "file2.ts": "content2" },
			});

			const list = await adapter.list();

			expect(list).toHaveLength(2);

			// Find the checkpoints in the list
			const cp1 = list.find((cp) => cp.id === checkpoint1.id);
			const cp2 = list.find((cp) => cp.id === checkpoint2.id);

			expect(cp1).toBeDefined();
			expect(cp1?.fileContents).toEqual({ "file1.ts": "content1" });

			expect(cp2).toBeDefined();
			expect(cp2?.fileContents).toEqual({ "file2.ts": "content2" });
		});

		it("should return empty array when no checkpoints exist", async () => {
			const list = await adapter.list();

			expect(list).toEqual([]);
		});

		it("should handle listing errors gracefully", async () => {
			// Mock the sqliteStorage to throw an error
			const mockError = new Error("Database error");
			vi.spyOn(
				(adapter as any).sqliteStorage,
				"listCheckpoints",
			).mockRejectedValue(mockError);

			const list = await adapter.list();

			expect(list).toEqual([]);
		});
	});

	describe("restore", () => {
		it("should restore files from checkpoint", async () => {
			const testDirPath = path.join(testDir, "restore-test");
			await fs.mkdir(testDirPath, { recursive: true });

			// Create a checkpoint
			const checkpoint = await adapter.create({
				trigger: "restore_test",
				content: "Restore test content",
				files: ["test-file.ts"],
				fileContents: { "test-file.ts": "original content" },
			});

			// Mock fs operations using the same pattern as other tests
			(readFile as any).mockResolvedValue(Buffer.from("original content"));
			(writeFile as any).mockResolvedValue(undefined);
			(mkdir as any).mockResolvedValue(undefined);

			const result = await adapter.restore(checkpoint.id, testDirPath);

			expect(result.success).toBe(true);
			expect(result.restoredFiles).toEqual(["test-file.ts"]);
			expect(writeFile).toHaveBeenCalledWith(
				path.join(testDirPath, "test-file.ts"),
				"original content",
				"utf-8",
			);
		});

		it("should detect conflicts during restore", async () => {
			const testDirPath = path.join(testDir, "conflict-test");
			await fs.mkdir(testDirPath, { recursive: true });

			// Create a checkpoint
			const checkpoint = await adapter.create({
				trigger: "conflict_test",
				content: "Conflict test content",
				files: ["conflict-file.ts"],
				fileContents: { "conflict-file.ts": "checkpoint content" },
			});

			// Mock fs operations to return different content (conflict)
			(readFile as any).mockImplementation(
				(filePath: string, encoding: string) => {
					if (filePath.includes("conflict-file.ts")) {
						// Return string when encoding is specified, Buffer otherwise
						if (encoding === "utf-8") {
							return Promise.resolve("modified content");
						}
						return Promise.resolve(Buffer.from("modified content"));
					}
					// For other files, we'd normally call the real function, but for testing we'll just reject
					return Promise.reject(new Error("File not found"));
				},
			);
			(stat as any).mockResolvedValue({ mtimeMs: Date.now() } as any);

			const result = await adapter.restore(checkpoint.id, testDirPath);

			expect(result.success).toBe(true);
			expect(result.conflicts).toHaveLength(1);
			expect(result.conflicts[0].type).toBe("modified");
			expect(result.conflicts[0].checkpointContent).toBe("checkpoint content");
			expect(result.conflicts[0].currentContent).toBe("modified content");
		});

		it("should handle restore errors gracefully", async () => {
			const result = await adapter.restore("non-existent-id", "/invalid/path");

			expect(result.success).toBe(false);
			expect(result.restoredFiles).toEqual([]);
			expect(result.conflicts).toEqual([]);
		});
	});

	describe("close", () => {
		it("should close database connection", async () => {
			// Spy on sqliteStorage close method
			const closeSpy = vi.spyOn((adapter as any).sqliteStorage, "close");

			await adapter.close();

			expect(closeSpy).toHaveBeenCalled();
		});

		it("should handle close errors gracefully", async () => {
			// Mock sqliteStorage close to throw an error
			vi.spyOn((adapter as any).sqliteStorage, "close").mockRejectedValue(
				new Error("Close error"),
			);

			// Should not throw
			await expect(adapter.close()).resolves.not.toThrow();
		});
	});
});
