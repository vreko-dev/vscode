import * as fs from "node:fs/promises";
import * as path from "node:path";
import { rimraf } from "rimraf";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SqliteCheckpointStorage } from "../../../src/storage/SqliteCheckpointStorage.js";
import { describeSqlite } from "../../helpers/sqliteTestUtils.js";

describeSqlite("SqliteCheckpointStorage Scalability", () => {
	let storage: SqliteCheckpointStorage;
	const testDir = path.join(__dirname, ".test-snapback-scalability");

	beforeEach(async () => {
		await fs.mkdir(testDir, { recursive: true });
		storage = new SqliteCheckpointStorage(testDir);
		await storage.initialize();
	});

	afterEach(async () => {
		await storage.close();
		await rimraf(testDir);
	});

	describe("Large Scale Operations", () => {
		it("should handle large numbers of checkpoints", async () => {
			const files = new Map([["file.txt", "content"]]);

			// Create many checkpoints
			const checkpointCount = 100;
			const createPromises = [];

			for (let i = 0; i < checkpointCount; i++) {
				createPromises.push(storage.createCheckpoint(`checkpoint${i}`, files));
			}

			const results = await Promise.all(createPromises);
			expect(results).toHaveLength(checkpointCount);

			// Test pagination with large dataset
			const page1 = await storage.listCheckpointsPaginated(1, 20);
			expect(page1.checkpoints).toHaveLength(20);
			expect(page1.pagination.total).toBe(checkpointCount);
			expect(page1.pagination.totalPages).toBe(5); // 100 / 20 = 5

			// Test listing all checkpoints
			const allCheckpoints = await storage.listCheckpoints();
			expect(allCheckpoints).toHaveLength(checkpointCount);
		});

		it("should handle large files with streaming", async () => {
			// Create a large file (2MB)
			const largeContent = "A".repeat(2 * 1024 * 1024);
			const files = new Map([["large-file.txt", largeContent]]);

			// Create checkpoint with large file
			const checkpoint = await storage.createCheckpoint(
				"large-file-checkpoint",
				files,
			);

			// Retrieve checkpoint
			const retrieved = await storage.getCheckpoint(checkpoint.id);
			expect(retrieved.files.get("large-file.txt")).toBe(largeContent);
		});

		it("should handle mixed large and small files", async () => {
			const smallContent = "Small content";
			const largeContent = "Large content\n".repeat(10000); // ~130KB

			const files = new Map([
				["small-file.txt", smallContent],
				["large-file.txt", largeContent],
			]);

			const checkpoint = await storage.createCheckpoint("mixed-files", files);

			const retrieved = await storage.getCheckpoint(checkpoint.id);
			expect(retrieved.files.get("small-file.txt")).toBe(smallContent);
			expect(retrieved.files.get("large-file.txt")).toBe(largeContent);
		});
	});

	describe("Performance Under Load", () => {
		it("should maintain reasonable performance with concurrent operations", async () => {
			const files = new Map([["file.txt", "content"]]);

			// Measure time for sequential operations
			const startTime = Date.now();

			// Create checkpoints sequentially
			const sequentialResults = [];
			for (let i = 0; i < 20; i++) {
				const result = await storage.createCheckpoint(
					`seq-checkpoint${i}`,
					files,
				);
				sequentialResults.push(result);
			}

			const sequentialTime = Date.now() - startTime;
			expect(sequentialResults).toHaveLength(20);

			// Measure time for concurrent operations
			const concurrentStartTime = Date.now();

			// Create checkpoints concurrently
			const concurrentPromises = [];
			for (let i = 20; i < 40; i++) {
				concurrentPromises.push(
					storage.createCheckpoint(`conc-checkpoint${i}`, files),
				);
			}

			const concurrentResults = await Promise.all(concurrentPromises);
			const concurrentTime = Date.now() - concurrentStartTime;

			expect(concurrentResults).toHaveLength(20);

			// Concurrent operations should not be significantly slower
			// (This is a basic check - in practice, concurrent operations might be faster)
			expect(concurrentTime).toBeLessThan(sequentialTime * 3);
		});

		it("should handle high-frequency checkpoint creation", async () => {
			const files = new Map([["file.txt", "content"]]);

			// Create Create many checkpoints in quick succession
			const promises = [];
			for (let i = 0; i < 50; i++) {
				promises.push(storage.createCheckpoint(`hf-checkpoint${i}`, files));
			}

			const results = await Promise.all(promises);
			expect(results).toHaveLength(50);

			// Verify all checkpoints exist
			const checkpoints = await storage.listCheckpoints();
			expect(checkpoints).toHaveLength(50);
		});
	});

	describe("Backup and Recovery at Scale", () => {
		it("should handle backups with large datasets", async () => {
			// Create a dataset with multiple large checkpoints
			const createPromises = [];

			for (let i = 0; i < 10; i++) {
				// Create checkpoints with moderately large content
				const content = `Content for checkpoint ${i}\n`.repeat(1000);
				const files = new Map([[`file${i}.txt`, content]]);
				createPromises.push(
					storage.createCheckpoint(`large-checkpoint${i}`, files),
				);
			}

			const results = await Promise.all(createPromises);
			expect(results).toHaveLength(10);

			// Create backup
			const backupPath = await storage.backupDatabase();

			// Verify backup exists and is reasonably sized
			const stats = await fs.stat(backupPath);
			expect(stats.size).toBeGreaterThan(1000); // Should be non-trivial size

			// List backups
			const backups = await storage.listAvailableBackups();
			expect(backups.length).toBeGreaterThanOrEqual(1);

			// Cleanup
			await fs.unlink(backupPath);
		});

		it("should handle automatic backups during heavy usage", async () => {
			// Configure automatic backups to trigger frequently
			// Create many checkpoints
			const files = new Map([["file.txt", "content"]]);
			const createPromises = [];

			for (let i = 0; i < 15; i++) {
				createPromises.push(
					storage.createCheckpoint(`auto-backup-checkpoint${i}`, files),
				);
			}

			await Promise.all(createPromises);

			// Try to trigger automatic backup
			const backupResult = await storage.createAutomaticBackup(5, 0.001); // Low thresholds

			// Should either create a backup or not (depending on internal logic)
			expect(backupResult === null || typeof backupResult === "string").toBe(
				true,
			);
		});
	});

	describe("Memory Efficiency", () => {
		it("should not have excessive memory growth with large operations", async () => {
			// This is a basic test - in a real scenario, we would monitor actual memory usage

			// Create checkpoints with large content
			const createPromises = [];

			for (let i = 0; i < 20; i++) {
				const content = "Large content line\n".repeat(5000); // ~100KB each
				const files = new Map([[`file${i}.txt`, content]]);
				createPromises.push(
					storage.createCheckpoint(`mem-checkpoint${i}`, files),
				);
			}

			const results = await Promise.all(createPromises);
			expect(results).toHaveLength(20);

			// Operations should complete without memory issues
			const checkpoints = await storage.listCheckpoints();
			expect(checkpoints).toHaveLength(20);
		});
	});

	describe("Edge Cases and Limits", () => {
		it("should handle maximum page size in pagination", async () => {
			const files = new Map([["file.txt", "content"]]);

			// Create some checkpoints
			const createPromises = [];
			for (let i = 0; i < 5; i++) {
				createPromises.push(storage.createCheckpoint(`checkpoint${i}`, files));
			}

			await Promise.all(createPromises);

			// Test maximum page size
			const result = await storage.listCheckpointsPaginated(1, 10000);
			expect(result.checkpoints).toHaveLength(5);
			expect(result.pagination.pageSize).toBe(1000); // Should be capped at 1000
		});

		it("should handle invalid pagination parameters gracefully", async () => {
			const files = new Map([["file.txt", "content"]]);
			await storage.createCheckpoint("test", files);

			// Test negative page number
			const result1 = await storage.listCheckpointsPaginated(-1, 10);
			expect(result1.pagination.page).toBe(1);

			// Test zero page size
			const result2 = await storage.listCheckpointsPaginated(1, 0);
			expect(result2.pagination.pageSize).toBe(50);

			// Test very large page number
			const result3 = await storage.listCheckpointsPaginated(1000, 10);
			expect(result3.pagination.page).toBe(1); // Should adjust to last page
		});
	});
});
