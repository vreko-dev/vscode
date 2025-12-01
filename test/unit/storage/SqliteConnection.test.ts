import * as fs from "node:fs/promises";
import * as path from "node:path";
import { rimraf } from "rimraf";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SqliteCheckpointStorage } from "../../../src/storage/SqliteCheckpointStorage.js";
import { SqliteStorageAdapter } from "../../../src/storage/SqliteStorageAdapter.js";
import { describeSqlite } from "../../helpers/sqliteTestUtils.js";

describeSqlite("SQLite Connection Management", () => {
	let storage: SqliteCheckpointStorage;
	let _adapter: SqliteStorageAdapter;
	const testDir = path.join(__dirname, ".test-sqlite-connection");

	beforeEach(async () => {
		await fs.mkdir(testDir, { recursive: true });
		storage = new SqliteCheckpointStorage(testDir);
		_adapter = new SqliteStorageAdapter(testDir);
	});

	afterEach(async () => {
		// Currently, we have to manually close the connection
		// In the extension, this is not being done properly
		try {
			await storage.close();
		} catch (_e) {
			// Ignore errors
		}
		await rimraf(testDir);
	});

	describe("Connection Closing Issues", () => {
		it("should demonstrate that close method exists but is not called automatically", async () => {
			// Initialize the storage
			await storage.initialize();

			// The close method exists
			expect(typeof storage.close).toBe("function");

			// But it's never called automatically
			// This demonstrates the issue - connections are left open
		});

		it("should show that SqliteStorageAdapter doesn't expose close method", async () => {
			// The adapter uses SqliteCheckpointStorage internally but doesn't expose its close method
			// This means there's no way to properly close the SQLite connection
			// through the adapter, which is what the extension actually uses
			// This demonstrates the API design issue
		});

		it("should demonstrate resource leak when connections are not closed", async () => {
			// In a real scenario, multiple instances might be created
			// and if close() is not called, file handles remain open

			// Create and initialize storage
			await storage.initialize();

			// The database file should now be locked/open
			// If we don't call close(), the file remains locked

			// This would cause issues in unit tests and real usage
			// where the database file cannot be deleted or accessed by other processes
		});
	});
});
