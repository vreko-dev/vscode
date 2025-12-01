import * as fs from "node:fs/promises";
import * as path from "node:path";
import { rimraf } from "rimraf";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SqliteCheckpointStorage } from "../../../src/storage/SqliteCheckpointStorage.js";
import { describeSqlite } from "../../helpers/sqliteTestUtils.js";

describeSqlite("SqliteCheckpointStorage", () => {
	let storage: SqliteCheckpointStorage;
	const testDir = path.join(__dirname, ".test-snapback");

	beforeEach(async () => {
		await fs.mkdir(testDir, { recursive: true });
		storage = new SqliteCheckpointStorage(testDir);
		await storage.initialize();
	});

	afterEach(async () => {
		await storage.close();
		await rimraf(testDir);
	});

	describe("Storage Efficiency", () => {
		it("should store only diffs, not full content after first checkpoint", async () => {
			// First checkpoint - full content
			const files1 = new Map([
				["src/file1.ts", "const a = 1;\nconst b = 2;\n"],
				["src/file2.ts", "export function test() { return true; }\n"],
			]);

			const cp1 = await storage.createCheckpoint("checkpoint_1", files1);

			// Second checkpoint - modified content
			const files2 = new Map([
				["src/file1.ts", "const a = 1;\nconst b = 3;\n"], // Only line 2 changed
				["src/file2.ts", "export function test() { return true; }\n"], // Unchanged
			]);

			const cp2 = await storage.createCheckpoint(
				"checkpoint_2",
				files2,
				undefined,
				cp1.id,
			);

			// Verify storage size
			const stats = await storage.getStorageStats();

			// Diff for file1.ts should be tiny (~50 bytes), not full content
			expect(stats.checkpoints[cp2.id].compressedSize).toBeLessThan(100);
			expect(stats.checkpoints[cp2.id].files["src/file2.ts"]).toBeUndefined(); // No diff stored
		});

		it("should use less than 1MB for 100 typical checkpoints", async () => {
			const baseContent = 'function example() {\n  return "hello";\n}\n'.repeat(
				100,
			);

			let previousId: string | undefined;
			for (let i = 0; i < 100; i++) {
				const modifiedContent = baseContent.replace("hello", `hello${i}`);
				const result = await storage.createCheckpoint(
					`checkpoint_${i}`,
					new Map([["large-file.ts", modifiedContent]]),
					undefined,
					previousId,
				);
				previousId = result.id;
			}

			const dbSize = await storage.getDatabaseSize();
			expect(dbSize).toBeLessThan(1024 * 1024); // Less than 1MB
		});
	});

	describe("Core Functionality", () => {
		it("should create and retrieve checkpoints correctly", async () => {
			const files = new Map([
				["src/index.ts", 'console.log("hello");'],
				["src/utils.ts", 'export const VERSION = "1.0.0";'],
			]);

			const checkpoint = await storage.createCheckpoint(
				"test_checkpoint",
				files,
			);

			expect(checkpoint.id).toMatch(/^cp_[a-z0-9_]+$/);
			expect(checkpoint.name).toBe("test_checkpoint");
			expect(checkpoint.fileCount).toBe(2);

			const retrieved = await storage.getCheckpoint(checkpoint.id);
			expect(retrieved.files).toEqual(files);
		});

		it("should handle file deletions in diffs", async () => {
			const files1 = new Map([
				["file1.ts", "content1"],
				["file2.ts", "content2"],
			]);

			const cp1 = await storage.createCheckpoint("cp1", files1);

			const files2 = new Map([
				["file1.ts", "content1"], // file2.ts deleted
			]);

			const cp2 = await storage.createCheckpoint(
				"cp2",
				files2,
				undefined,
				cp1.id,
			);

			const restored = await storage.getCheckpoint(cp2.id);
			expect(restored.files.has("file2.ts")).toBe(false);
			expect(restored.deletedFiles).toContain("file2.ts");
		});

		it("should restore checkpoints through diff chain", async () => {
			// Create chain: base -> cp1 -> cp2 -> cp3
			const base = new Map([["file.ts", "line1\nline2\nline3\n"]]);
			const cp1 = await storage.createCheckpoint("cp1", base);

			const mod1 = new Map([["file.ts", "line1\nMODIFIED\nline3\n"]]);
			const cp2 = await storage.createCheckpoint(
				"cp2",
				mod1,
				undefined,
				cp1.id,
			);

			const mod2 = new Map([["file.ts", "line1\nMODIFIED\nline3\nline4\n"]]);
			const cp3 = await storage.createCheckpoint(
				"cp3",
				mod2,
				undefined,
				cp2.id,
			);

			// Restore cp3 should apply all diffs in chain
			const restored = await storage.getCheckpoint(cp3.id);
			expect(restored.files.get("file.ts")).toBe(
				"line1\nMODIFIED\nline3\nline4\n",
			);
		});
	});

	describe("Query Capabilities", () => {
		it("should list checkpoints with metadata", async () => {
			for (let i = 0; i < 5; i++) {
				await storage.createCheckpoint(
					`checkpoint_file${i}.ts_2025-01-10T12-00-0${i}`,
					new Map([[`file${i}.ts`, `content${i}`]]),
				);
			}

			const list = await storage.listCheckpoints();
			expect(list).toHaveLength(5);
			expect(list[0].name).toContain("checkpoint_file");
			expect(list[0].timestamp).toBeDefined();
		});

		it("should find checkpoints by file path", async () => {
			await storage.createCheckpoint(
				"cp1",
				new Map([
					["src/index.ts", "content"],
					["src/utils.ts", "utils"],
				]),
			);

			await storage.createCheckpoint(
				"cp2",
				new Map([
					["src/index.ts", "modified"],
					["test/test.ts", "test"],
				]),
			);

			const results = await storage.findCheckpointsByFile("src/index.ts");
			expect(results).toHaveLength(2);
		});
	});

	describe("Migration from Old Format", () => {
		it("should migrate old JSON checkpoints to SQLite", async () => {
			// Setup old format
			const oldDir = path.join(testDir, "checkpoints", "cp_old");
			await fs.mkdir(oldDir, { recursive: true });

			// Old format: full file copies
			await fs.writeFile(path.join(oldDir, "file1.ts"), "old content");
			await fs.writeFile(
				path.join(testDir, "cp_old.json"),
				JSON.stringify({
					id: "cp_old",
					trigger: "old_checkpoint",
					files: ["file1.ts"],
					timestamp: Date.now(),
				}),
			);

			// Migrate
			await storage.migrateFromOldFormat(testDir);

			// Verify migrated
			const migrated = await storage.getCheckpoint("cp_old");
			expect(migrated.files.get("file1.ts")).toBe("old content");

			// Verify old files cleaned up
			expect(await fs.access(oldDir).catch(() => false)).toBe(false);
		});
	});

	describe("Retention Policy", () => {
		it("enforces maximum checkpoint count", async () => {
			for (let i = 0; i < 3; i++) {
				await storage.createCheckpoint(
					`cp_${i}`,
					new Map([[`file${i}.txt`, `content-${i}`]]),
				);
			}

			const removed = await storage.enforceRetentionPolicy({
				maxSnapshots: 2,
			});

			expect(removed).toBe(1);
			const remaining = await storage.listCheckpoints();
			expect(remaining).toHaveLength(2);
		});

		it("removes checkpoints older than configured age", async () => {
			const oldCheckpoint = await storage.createCheckpoint(
				"old_cp",
				new Map([["old.txt", "old"]]),
			);
			await storage.createCheckpoint("new_cp", new Map([["new.txt", "new"]]));

			const db = (storage as any).db as any;
			const oldTimestamp = Date.now() - 60 * 60 * 24 * 31 * 1000; // 31 days ago
			db.prepare("UPDATE checkpoints SET timestamp = ? WHERE id = ?").run(
				oldTimestamp,
				oldCheckpoint.id,
			);

			const removed = await storage.enforceRetentionPolicy({
				maxAgeMs: 1000, // 1 second to ensure removal
			});

			expect(removed).toBeGreaterThan(0);
			const remaining = await storage.listCheckpoints();
			expect(remaining.some((cp) => cp.id === oldCheckpoint.id)).toBe(false);
		});
	});

	describe("Error Handling", () => {
		it("should handle corrupt database gracefully", async () => {
			// Corrupt the db file
			const dbPath = path.join(testDir, "snapback.db");
			await fs.writeFile(dbPath, "corrupted data");

			// Should recreate database
			const newStorage = new SqliteCheckpointStorage(testDir);
			await expect(newStorage.initialize()).resolves.not.toThrow();

			// Should work normally
			await expect(
				newStorage.createCheckpoint("test", new Map([["f.ts", "c"]])),
			).resolves.toBeDefined();
		});
	});
});
