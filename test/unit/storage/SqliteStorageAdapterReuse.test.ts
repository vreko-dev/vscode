import * as fs from "node:fs/promises";
import * as path from "node:path";
import { rimraf } from "rimraf";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SqliteStorageAdapter } from "../../../src/storage/SqliteStorageAdapter.js";
import { describeSqlite } from "../../helpers/sqliteTestUtils.js";

describeSqlite("SqliteStorageAdapter Reuse Issue", () => {
	let adapter: SqliteStorageAdapter;
	const testDir = path.join(__dirname, ".test-sqlite-reuse");

	beforeEach(async () => {
		await fs.mkdir(testDir, { recursive: true });
		adapter = new SqliteStorageAdapter(testDir);
	});

	afterEach(async () => {
		try {
			await adapter.close();
		} catch (_e) {
			// Ignore errors
		}
		await rimraf(testDir);
	});

	describe("Reuse After Close Issue", () => {
		it("should allow adapter to be reused after close", async () => {
			// Initialize and use the adapter
			await adapter.initialize();

			// Create a checkpoint to ensure the database is actually initialized
			const _checkpoint1 = await adapter.create({
				trigger: "test1",
				risk: 0,
				content: "test content 1",
				files: ["test1.txt"],
				fileContents: { "test1.txt": "test content 1" },
			});

			// Close the adapter
			await adapter.close();

			// Verify the initialized flag is reset
			expect(adapter.initialized).toBe(false);

			// Now reuse the adapter - it should work because initialized flag is reset
			const checkpoint2 = await adapter.create({
				trigger: "test2",
				risk: 0,
				content: "test content 2",
				files: ["test2.txt"],
				fileContents: { "test2.txt": "test content 2" },
			});

			expect(checkpoint2).toBeDefined();
			expect(checkpoint2.id).toBeTruthy();
		});

		it("should allow list method to work after close and reuse", async () => {
			// Initialize and use the adapter
			await adapter.initialize();

			// Create a checkpoint
			await adapter.create({
				trigger: "test",
				risk: 0,
				content: "test content",
				files: ["test.txt"],
				fileContents: { "test.txt": "test content" },
			});

			// Close the adapter
			await adapter.close();

			// Reuse the adapter
			const checkpoints = await adapter.list();

			// Should work and return the checkpoint we created
			expect(checkpoints).toBeDefined();
		});
	});
});
