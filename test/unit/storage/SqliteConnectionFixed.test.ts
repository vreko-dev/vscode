import * as fs from "node:fs/promises";
import * as path from "node:path";
import { rimraf } from "rimraf";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SqliteCheckpointStorage } from "../../../src/storage/SqliteCheckpointStorage.js";
import { SqliteStorageAdapter } from "../../../src/storage/SqliteStorageAdapter.js";
import { describeSqlite } from "../../helpers/sqliteTestUtils.js";

describeSqlite("SQLite Connection Management Fixed", () => {
	let storage: SqliteCheckpointStorage;
	let adapter: SqliteStorageAdapter;
	const testDir = path.join(__dirname, ".test-sqlite-connection-fixed");

	beforeEach(async () => {
		await fs.mkdir(testDir, { recursive: true });
		storage = new SqliteCheckpointStorage(testDir);
		adapter = new SqliteStorageAdapter(testDir);
	});

	afterEach(async () => {
		try {
			await storage.close();
		} catch (_e) {
			// Ignore errors
		}
		await rimraf(testDir);
	});

	describe("Connection Closing Fix", () => {
		it("should expose close method in SqliteStorageAdapter", async () => {
			// The adapter should now expose a close method
			expect(typeof adapter.close).toBe("function");

			// Initialize the adapter
			await adapter.initialize();

			// The close method should properly close the internal SQLite connection
			await expect(adapter.close()).resolves.toBeUndefined();
		});

		it("should properly close SQLite connections", async () => {
			// Initialize storage
			await storage.initialize();

			// The close method should work correctly
			await expect(storage.close()).resolves.toBeUndefined();

			// Calling close multiple times should be safe
			await expect(storage.close()).resolves.toBeUndefined();
		});

		it("should handle close method being called on already closed connections", async () => {
			// Initialize and close storage
			await storage.initialize();
			await storage.close();

			// Calling close again should not throw an error
			await expect(storage.close()).resolves.toBeUndefined();
		});
	});
});
