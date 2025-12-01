import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("SqliteStorageAdapter Fallback", () => {
	afterEach(() => {
		vi.resetModules();
		vi.unmock("../../../src/storage/SqliteCheckpointStorage");
	});

	it("falls back to file system storage when better-sqlite3 is unavailable", async () => {
		vi.doMock("../../../src/storage/SqliteCheckpointStorage", () => ({
			SqliteCheckpointStorage: vi.fn(),
			isBetterSqlite3Available: vi.fn().mockReturnValue(false),
			getBetterSqlite3LoadError: vi
				.fn()
				.mockReturnValue(new Error("better-sqlite3 missing")),
		}));

		const { SqliteStorageAdapter } = await import(
			"../../../src/storage/SqliteStorageAdapter"
		);

		const tempDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "snapback-fallback-"),
		);

		try {
			const adapter = new SqliteStorageAdapter(tempDir);

			const checkpoint = await adapter.create({
				trigger: "test",
				risk: 0,
				content: "fallback storage",
				files: ["example.txt"],
				fileContents: {
					"example.txt": "hello world",
				},
			});

			expect(checkpoint.id).toBeTruthy();

			const retrieved = await adapter.retrieve(checkpoint.id);
			expect(retrieved?.fileContents?.["example.txt"]).toBe("hello world");

			await adapter.close();
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});
});
