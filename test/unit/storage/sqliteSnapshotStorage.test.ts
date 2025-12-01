import * as fs from "node:fs/promises";
import * as path from "node:path";
import { rimraf } from "rimraf";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SqliteSnapshotStorage } from "../../src/storage/SqliteSnapshotStorage.js";

describe("SqliteSnapshotStorage", () => {
	let storage: SqliteSnapshotStorage;
	const testDir = path.join(__dirname, ".test-snapback-unit");

	beforeEach(async () => {
		await fs.mkdir(testDir, { recursive: true });
		storage = new SqliteSnapshotStorage(testDir);
	});

	afterEach(async () => {
		try {
			await storage.close();
		} catch (_error) {
			// Ignore close errors in tests
		}
		await rimraf(testDir);
	});

	it("should be instantiable", () => {
		expect(storage).toBeDefined();
		expect(storage).toBeInstanceOf(SqliteSnapshotStorage);
	});

	it("should have all required methods", () => {
		expect(typeof storage.initialize).toBe("function");
		expect(typeof storage.createSnapshot).toBe("function");
		expect(typeof storage.getSnapshot).toBe("function");
		expect(typeof storage.listSnapshots).toBe("function");
		expect(typeof storage.listSnapshotsPaginated).toBe("function");
		expect(typeof storage.enforceRetentionPolicy).toBe("function");
		expect(typeof storage.close).toBe("function");
	});

	it("should initialize without errors", async () => {
		await expect(storage.initialize()).resolves.not.toThrow();
	});
});
