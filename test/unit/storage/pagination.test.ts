import * as fs from "node:fs/promises";
import * as path from "node:path";
import { rimraf } from "rimraf";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SqliteCheckpointStorage } from "../../../src/storage/SqliteCheckpointStorage.js";
import { describeSqlite } from "../../helpers/sqliteTestUtils.js";

describeSqlite("SqliteCheckpointStorage Pagination", () => {
	let storage: SqliteCheckpointStorage;
	const testDir = path.join(__dirname, ".test-snapback-pagination");

	beforeEach(async () => {
		await fs.mkdir(testDir, { recursive: true });
		storage = new SqliteCheckpointStorage(testDir);
		await storage.initialize();
	});

	afterEach(async () => {
		await storage.close();
		await rimraf(testDir);
	});

	describe("listCheckpointsPaginated", () => {
		it("should return all checkpoints when they fit in one page", async () => {
			// Create a few checkpoints
			const files = new Map([["file.txt", "content"]]);
			const _cp1 = await storage.createCheckpoint("checkpoint1", files);
			const _cp2 = await storage.createCheckpoint("checkpoint2", files);
			const _cp3 = await storage.createCheckpoint("checkpoint3", files);

			const result = await storage.listCheckpointsPaginated(1, 10);

			expect(result.checkpoints).toHaveLength(3);
			expect(result.pagination).toEqual({
				page: 1,
				pageSize: 10,
				total: 3,
				totalPages: 1,
			});

			// Check that checkpoints are returned in correct order
			expect(result.checkpoints[0].name).toBe("checkpoint1");
			expect(result.checkpoints[1].name).toBe("checkpoint2");
			expect(result.checkpoints[2].name).toBe("checkpoint3");
		});

		it("should paginate checkpoints correctly", async () => {
			// Create many checkpoints
			const files = new Map([["file.txt", "content"]]);
			const checkpoints = [];
			for (let i = 0; i < 15; i++) {
				const cp = await storage.createCheckpoint(`checkpoint${i}`, files);
				checkpoints.push(cp);
			}

			// Get first page
			const page1 = await storage.listCheckpointsPaginated(1, 5);
			expect(page1.checkpoints).toHaveLength(5);
			expect(page1.pagination).toEqual({
				page: 1,
				pageSize: 5,
				total: 15,
				totalPages: 3,
			});

			// Get second page
			const page2 = await storage.listCheckpointsPaginated(2, 5);
			expect(page2.checkpoints).toHaveLength(5);
			expect(page2.pagination).toEqual({
				page: 2,
				pageSize: 5,
				total: 15,
				totalPages: 3,
			});

			// Get third page
			const page3 = await storage.listCheckpointsPaginated(3, 5);
			expect(page3.checkpoints).toHaveLength(5);
			expect(page3.pagination).toEqual({
				page: 3,
				pageSize: 5,
				total: 15,
				totalPages: 3,
			});
		});

		it("should handle page beyond total pages", async () => {
			// Create a few checkpoints
			const files = new Map([["file.txt", "content"]]);
			await storage.createCheckpoint("checkpoint1", files);
			await storage.createCheckpoint("checkpoint2", files);

			// Request page beyond total pages
			const result = await storage.listCheckpointsPaginated(5, 5);

			// Should return last page
			expect(result.checkpoints).toHaveLength(2);
			expect(result.pagination.page).toBe(1); // Only one page exists
			expect(result.pagination.totalPages).toBe(1);
		});

		it("should handle invalid page parameters", async () => {
			// Create a few checkpoints
			const files = new Map([["file.txt", "content"]]);
			await storage.createCheckpoint("checkpoint1", files);
			await storage.createCheckpoint("checkpoint2", files);

			// Test with negative page
			const result1 = await storage.listCheckpointsPaginated(-1, 5);
			expect(result1.pagination.page).toBe(1);

			// Test with zero page size
			const result2 = await storage.listCheckpointsPaginated(1, 0);
			expect(result2.pagination.pageSize).toBe(50);

			// Test with very large page size
			const result3 = await storage.listCheckpointsPaginated(1, 2000);
			expect(result3.pagination.pageSize).toBe(1000); // Capped at 1000
		});

		it("should sort checkpoints by timestamp", async () => {
			// Create checkpoints with known order
			const files = new Map([["file.txt", "content"]]);
			const _cp1 = await storage.createCheckpoint("first", files);
			const _cp2 = await storage.createCheckpoint("second", files);
			const _cp3 = await storage.createCheckpoint("third", files);

			// Test ascending order
			const ascResult = await storage.listCheckpointsPaginated(
				1,
				10,
				"timestamp",
				"ASC",
			);
			expect(ascResult.checkpoints[0].name).toBe("first");
			expect(ascResult.checkpoints[1].name).toBe("second");
			expect(ascResult.checkpoints[2].name).toBe("third");

			// Test descending order
			const descResult = await storage.listCheckpointsPaginated(
				1,
				10,
				"timestamp",
				"DESC",
			);
			expect(descResult.checkpoints[0].name).toBe("third");
			expect(descResult.checkpoints[1].name).toBe("second");
			expect(descResult.checkpoints[2].name).toBe("first");
		});

		it("should sort checkpoints by name", async () => {
			// Create checkpoints with specific names
			const files = new Map([["file.txt", "content"]]);
			await storage.createCheckpoint("zebra", files);
			await storage.createCheckpoint("alpha", files);
			await storage.createCheckpoint("beta", files);

			// Test ascending order
			const ascResult = await storage.listCheckpointsPaginated(
				1,
				10,
				"name",
				"ASC",
			);
			expect(ascResult.checkpoints[0].name).toBe("alpha");
			expect(ascResult.checkpoints[1].name).toBe("beta");
			expect(ascResult.checkpoints[2].name).toBe("zebra");

			// Test descending order
			const descResult = await storage.listCheckpointsPaginated(
				1,
				10,
				"name",
				"DESC",
			);
			expect(descResult.checkpoints[0].name).toBe("zebra");
			expect(descResult.checkpoints[1].name).toBe("beta");
			expect(descResult.checkpoints[2].name).toBe("alpha");
		});

		it("should handle empty database", async () => {
			const result = await storage.listCheckpointsPaginated(1, 10);

			expect(result.checkpoints).toHaveLength(0);
			expect(result.pagination).toEqual({
				page: 1,
				pageSize: 10,
				total: 0,
				totalPages: 0,
			});
		});
	});
});
