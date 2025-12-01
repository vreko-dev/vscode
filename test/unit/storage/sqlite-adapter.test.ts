import * as fs from "node:fs/promises";
import * as path from "node:path";
import { rimraf } from "rimraf";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SqliteStorageAdapter } from "../../../src/storage/SqliteStorageAdapter.js";
import { describeSqlite } from "../../helpers/sqliteTestUtils.js";

describeSqlite("SqliteStorageAdapter", () => {
	let adapter: SqliteStorageAdapter;
	const testDir = path.join(__dirname, ".test-snapback-adapter");

	beforeEach(async () => {
		await fs.mkdir(testDir, { recursive: true });
		adapter = new SqliteStorageAdapter(testDir);
	});

	afterEach(async () => {
		await rimraf(testDir);
	});

	describe("Core Functionality", () => {
		it("should create and retrieve checkpoints correctly", async () => {
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

			const retrieved = await adapter.retrieve(checkpoint.id);
			expect(retrieved).toBeDefined();
			expect(retrieved?.id).toBe(checkpoint.id);
			expect(retrieved?.fileContents?.["src/index.ts"]).toBe(
				'console.log("hello");',
			);
		});

		it("should list checkpoints", async () => {
			// Create a few checkpoints
			await adapter.create({
				trigger: "checkpoint_1",
				content: "First checkpoint",
				files: ["file1.ts"],
				fileContents: { "file1.ts": "content1" },
			});

			await adapter.create({
				trigger: "checkpoint_2",
				content: "Second checkpoint",
				files: ["file2.ts"],
				fileContents: { "file2.ts": "content2" },
			});

			const list = await adapter.list();
			expect(list).toHaveLength(2);
			expect(list[0].meta?.trigger).toContain("checkpoint");
		});
	});
});
