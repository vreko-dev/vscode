import * as fs from "node:fs/promises";
import * as path from "node:path";
import { rimraf } from "rimraf";
import { afterEach, beforeEach, expect, it } from "vitest";
import { SqliteStorageAdapter } from "../../../src/storage/SqliteStorageAdapter.js";
import { describeSqlite } from "../../helpers/sqliteTestUtils.js";

describeSqlite("Storage Integration Test", () => {
	let adapter: SqliteStorageAdapter;
	const testDir = path.join(__dirname, ".test-snapback-integration");

	beforeEach(async () => {
		await fs.mkdir(testDir, { recursive: true });
		adapter = new SqliteStorageAdapter(testDir);
	});

	afterEach(async () => {
		await rimraf(testDir);
	});

	it("should create checkpoint and verify storage efficiency", async () => {
		// Create first checkpoint with full content
		const files1 = {
			"src/file1.ts": "const a = 1;\nconst b = 2;\n",
			"src/file2.ts": "export function test() { return true; }\n",
		};

		const cp1 = await adapter.create({
			trigger: "checkpoint_1",
			content: "First checkpoint",
			files: Object.keys(files1),
			fileContents: files1,
		});

		// Create second checkpoint with mostly unchanged content
		const files2 = {
			"src/file1.ts": "const a = 1;\nconst b = 3;\n", // Only line 2 changed
			"src/file2.ts": "export function test() { return true; }\n", // Unchanged
		};

		const cp2 = await adapter.create({
			trigger: "checkpoint_2",
			content: "Second checkpoint",
			files: Object.keys(files2),
			fileContents: files2,
		});

		// Verify we can retrieve both checkpoints
		const retrieved1 = await adapter.retrieve(cp1.id);
		const retrieved2 = await adapter.retrieve(cp2.id);

		expect(retrieved1).toBeDefined();
		expect(retrieved2).toBeDefined();
		expect(retrieved1?.fileContents?.["src/file1.ts"]).toBe(
			"const a = 1;\nconst b = 2;\n",
		);
		expect(retrieved2?.fileContents?.["src/file1.ts"]).toBe(
			"const a = 1;\nconst b = 3;\n",
		);

		// List all checkpoints
		const list = await adapter.list();
		expect(list).toHaveLength(2);

		// Verify checkpoint IDs are in correct format
		expect(cp1.id).toMatch(/^cp_[a-z0-9_]+$/);
		expect(cp2.id).toMatch(/^cp_[a-z0-9_]+$/);
	});
});
