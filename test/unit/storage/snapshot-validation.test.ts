import * as fs from "node:fs/promises";
import * as path from "node:path";
import { rimraf } from "rimraf";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SqliteCheckpointStorage } from "../../../src/storage/SqliteCheckpointStorage.js";
import { CheckpointNotFoundError } from "../../../src/storage/StorageErrors.js";
import { describeSqlite } from "../../helpers/sqliteTestUtils.js";

describeSqlite("SqliteCheckpointStorage Validation", () => {
	let storage: SqliteCheckpointStorage;
	const testDir = path.join(__dirname, ".test-snapback-validation");

	beforeEach(async () => {
		await fs.mkdir(testDir, { recursive: true });
		storage = new SqliteCheckpointStorage(testDir);
		await storage.initialize();
	});

	afterEach(async () => {
		await storage.close();
		await rimraf(testDir);
	});

	describe("validateCheckpointExists", () => {
		it("should throw CheckpointNotFoundError for non-existent checkpoint", async () => {
			await expect(
				storage.validateCheckpointExists("non-existent-id"),
			).rejects.toThrow(CheckpointNotFoundError);

			try {
				await storage.validateCheckpointExists("non-existent-id");
			} catch (error) {
				expect(error).toBeInstanceOf(CheckpointNotFoundError);
				if (error instanceof CheckpointNotFoundError) {
					expect(error.checkpointId).toBe("non-existent-id");
					expect(error.message).toBe("Checkpoint not found: non-existent-id");
				}
			}
		});

		it("should not throw for existing checkpoint", async () => {
			const files = new Map([["file.ts", "content"]]);
			const checkpoint = await storage.createCheckpoint("test", files);

			await expect(
				storage.validateCheckpointExists(checkpoint.id),
			).resolves.not.toThrow();
		});
	});

	describe("validateCheckpointChain", () => {
		it("should throw CheckpointNotFoundError for non-existent checkpoint", async () => {
			await expect(
				storage.validateCheckpointChain("non-existent-id"),
			).rejects.toThrow(CheckpointNotFoundError);

			try {
				await storage.validateCheckpointChain("non-existent-id");
			} catch (error) {
				expect(error).toBeInstanceOf(CheckpointNotFoundError);
				if (error instanceof CheckpointNotFoundError) {
					expect(error.checkpointId).toBe("non-existent-id");
				}
			}
		});

		it("should validate single checkpoint chain", async () => {
			const files = new Map([["file.ts", "content"]]);
			const checkpoint = await storage.createCheckpoint("test", files);

			await expect(
				storage.validateCheckpointChain(checkpoint.id),
			).resolves.not.toThrow();
		});

		it("should validate multi-level checkpoint chain", async () => {
			const files1 = new Map([["file.ts", "content1"]]);
			const cp1 = await storage.createCheckpoint("cp1", files1);

			const files2 = new Map([["file.ts", "content2"]]);
			const cp2 = await storage.createCheckpoint("cp2", files2, cp1.id);

			const files3 = new Map([["file.ts", "content3"]]);
			const cp3 = await storage.createCheckpoint("cp3", files3, cp2.id);

			// Validate each checkpoint in the chain
			await expect(
				storage.validateCheckpointChain(cp1.id),
			).resolves.not.toThrow();
			await expect(
				storage.validateCheckpointChain(cp2.id),
			).resolves.not.toThrow();
			await expect(
				storage.validateCheckpointChain(cp3.id),
			).resolves.not.toThrow();
		});
	});

	describe("validateCheckpointData", () => {
		it("should throw CheckpointNotFoundError for non-existent checkpoint", async () => {
			await expect(
				storage.validateCheckpointData("non-existent-id"),
			).rejects.toThrow(CheckpointNotFoundError);

			try {
				await storage.validateCheckpointData("non-existent-id");
			} catch (error) {
				expect(error).toBeInstanceOf(CheckpointNotFoundError);
				if (error instanceof CheckpointNotFoundError) {
					expect(error.checkpointId).toBe("non-existent-id");
				}
			}
		});

		it("should validate checkpoint with valid data", async () => {
			const files = new Map([["file.ts", "content"]]);
			const checkpoint = await storage.createCheckpoint("test", files);

			await expect(
				storage.validateCheckpointData(checkpoint.id),
			).resolves.not.toThrow();
		});

		it("should validate checkpoint with file changes", async () => {
			const files1 = new Map([
				["file1.ts", "content1"],
				["file2.ts", "content2"],
			]);
			const cp1 = await storage.createCheckpoint("cp1", files1);

			const files2 = new Map([
				["file1.ts", "modified1"],
				["file3.ts", "content3"],
			]);
			const cp2 = await storage.createCheckpoint("cp2", files2, cp1.id);

			await expect(
				storage.validateCheckpointData(cp1.id),
			).resolves.not.toThrow();
			await expect(
				storage.validateCheckpointData(cp2.id),
			).resolves.not.toThrow();
		});
	});

	describe("Integrated Validation", () => {
		it("should validate complete checkpoint lifecycle", async () => {
			// Create checkpoint
			const files = new Map([["src/index.ts", 'console.log("hello");']]);
			const checkpoint = await storage.createCheckpoint("initial", files);

			// Validate exists
			await storage.validateCheckpointExists(checkpoint.id);

			// Validate chain
			await storage.validateCheckpointChain(checkpoint.id);

			// Validate data
			await storage.validateCheckpointData(checkpoint.id);

			// Retrieve and verify
			const retrieved = await storage.getCheckpoint(checkpoint.id);
			expect(retrieved.files.get("src/index.ts")).toBe('console.log("hello");');
		});

		it("should handle validation in checkpoint chain", async () => {
			// Create chain: base -> cp1 -> cp2
			const base = new Map([["file.ts", "line1\nline2\nline3\n"]]);
			const cp1 = await storage.createCheckpoint("base", base);

			const mod1 = new Map([["file.ts", "line1\nMODIFIED\nline3\n"]]);
			const cp2 = await storage.createCheckpoint("modified", mod1, cp1.id);

			// Validate entire chain
			await storage.validateCheckpointChain(cp2.id);
			await storage.validateCheckpointData(cp2.id);

			// Restore and verify
			const restored = await storage.getCheckpoint(cp2.id);
			expect(restored.files.get("file.ts")).toBe("line1\nMODIFIED\nline3\n");
		});
	});
});
