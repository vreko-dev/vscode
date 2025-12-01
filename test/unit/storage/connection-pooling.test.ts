import * as fs from "node:fs/promises";
import * as path from "node:path";
import { rimraf } from "rimraf";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SqliteCheckpointStorage } from "../../../src/storage/SqliteCheckpointStorage.js";
import { describeSqlite } from "../../helpers/sqliteTestUtils.js";

describeSqlite("SqliteCheckpointStorage Connection Pooling", () => {
	let storage: SqliteCheckpointStorage;
	const testDir = path.join(__dirname, ".test-snapback-pooling");

	beforeEach(async () => {
		await fs.mkdir(testDir, { recursive: true });
		storage = new SqliteCheckpointStorage(testDir);
		await storage.initialize();
	});

	afterEach(async () => {
		await storage.close();
		await rimraf(testDir);
	});

	describe("Connection Pooling Configuration", () => {
		it("should configure connection pooling parameters", async () => {
			// Test that we can configure pooling parameters
			await expect(
				storage.configureConnectionPooling(10),
			).resolves.not.toThrow();

			// Test with invalid values
			await expect(
				storage.configureConnectionPooling(0),
			).resolves.not.toThrow();
			await expect(
				storage.configureConnectionPooling(-1),
			).resolves.not.toThrow();
		});
	});

	describe("High-Frequency Operations", () => {
		it("should handle concurrent checkpoint operations", async () => {
			const files = new Map([["file.txt", "content"]]);

			// Create multiple checkpoints concurrently
			const promises = [];
			for (let i = 0; i < 5; i++) {
				promises.push(storage.createCheckpoint(`checkpoint${i}`, files));
			}

			const results = await Promise.all(promises);

			// Verify all checkpoints were created
			expect(results).toHaveLength(5);

			// Verify we can list all checkpoints
			const checkpoints = await storage.listCheckpoints();
			expect(checkpoints).toHaveLength(5);
		});

		it("should handle mixed read/write operations", async () => {
			const files = new Map([["file.txt", "content"]]);

			// Create initial checkpoint
			const _initial = await storage.createCheckpoint("initial", files);

			// Concurrently create more checkpoints and list them
			const createPromises = [];
			for (let i = 0; i < 3; i++) {
				createPromises.push(storage.createCheckpoint(`checkpoint${i}`, files));
			}

			const listPromise = storage.listCheckpoints();

			const [created, listed] = await Promise.all([
				Promise.all(createPromises),
				listPromise,
			]);

			// Verify results
			expect(created).toHaveLength(3);
			expect(listed.length).toBeGreaterThanOrEqual(1); // At least the initial checkpoint
		});
	});

	describe("Connection Management", () => {
		it("should properly manage database connections", async () => {
			// Test that basic operations work
			const files = new Map([["file.txt", "content"]]);
			await storage.createCheckpoint("test", files);

			const checkpoints = await storage.listCheckpoints();
			expect(checkpoints).toHaveLength(1);

			// Test that we can get checkpoint data
			const checkpoint = await storage.getCheckpoint(checkpoints[0].id);
			expect(checkpoint.files.get("file.txt")).toBe("content");
		});

		it("should handle connection errors gracefully", async () => {
			// Close the database to simulate connection issues
			await storage.close();

			// Operations should fail appropriately
			const files = new Map([["file.txt", "content"]]);
			await expect(storage.createCheckpoint("test", files)).rejects.toThrow();

			await expect(storage.listCheckpoints()).rejects.toThrow();
		});
	});
});
