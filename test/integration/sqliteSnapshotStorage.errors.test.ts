import * as fs from "node:fs/promises";
import * as path from "node:path";
import { rimraf } from "rimraf";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SqliteSnapshotStorage } from "../../src/storage/SqliteSnapshotStorage";
import {
	DatabaseConnectionError,
	DatabaseError,
	SnapshotNotFoundError,
} from "../../src/storage/StorageErrors";
import { describeSqlite } from "../helpers/sqliteTestUtils";

describeSqlite("SqliteSnapshotStorage Error Paths", () => {
	let storage: SqliteSnapshotStorage;
	const testDir = path.join(__dirname, ".test-snapback-errors");

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

	describe("Initialization Errors", () => {
		it("should throw DatabaseConnectionError when database cannot be initialized", async () => {
			// Mock the database constructor to throw an error
			const originalRequire = (global as any).require;
			(global as any).require = vi.fn().mockImplementation((module) => {
				if (module === "better-sqlite3") {
					throw new Error("Cannot load better-sqlite3");
				}
				return originalRequire(module);
			});

			const errorStorage = new SqliteSnapshotStorage(testDir);

			await expect(errorStorage.initialize()).rejects.toThrow(
				DatabaseConnectionError,
			);
			await expect(errorStorage.initialize()).rejects.toThrow(
				"better-sqlite3 native module is not available",
			);

			// Restore original require
			(global as any).require = originalRequire;
		});

		it("should handle corrupt database by recreating it", async () => {
			// Create a corrupt database file
			const dbPath = path.join(testDir, "snapback.db");
			await fs.writeFile(dbPath, "corrupted data");

			// Should recreate database and work normally
			await expect(storage.initialize()).resolves.not.toThrow();

			// Should work normally after recreation
			const files = new Map([["test.txt", "content"]]);
			const result = await storage.createSnapshot("test", files);
			expect(result.id).toBeDefined();
			expect(result.name).toBe("test");
		});
	});

	describe("Database Operation Errors", () => {
		beforeEach(async () => {
			await storage.initialize();
		});

		it("should throw SnapshotNotFoundError when snapshot doesn't exist", async () => {
			await expect(storage.getSnapshot("nonexistent-id")).rejects.toThrow(
				SnapshotNotFoundError,
			);
		});

		it("should throw DatabaseConnectionError when database is not initialized", async () => {
			const uninitializedStorage = new SqliteSnapshotStorage(testDir);

			await expect(uninitializedStorage.listSnapshots()).rejects.toThrow(
				DatabaseConnectionError,
			);
			await expect(
				uninitializedStorage.listSnapshotsPaginated(),
			).rejects.toThrow(DatabaseConnectionError);
		});

		it("should throw DatabaseError for invalid snapshot data", async () => {
			// Create a snapshot first
			const files = new Map([["test.txt", "content"]]);
			const snapshot = await storage.createSnapshot("test", files);

			// Manually corrupt the database to cause invalid data
			const db = (storage as any).db;
			db.prepare("UPDATE snapshots SET timestamp = 'invalid' WHERE id = ?").run(
				snapshot.id,
			);

			await expect(storage.getSnapshot(snapshot.id)).rejects.toThrow(
				DatabaseError,
			);
			await expect(storage.getSnapshot(snapshot.id)).rejects.toThrow(
				"Invalid snapshot timestamp",
			);
		});
	});

	describe("File Lock Errors", () => {
		it("should handle lock acquisition timeout gracefully", async () => {
			await storage.initialize();

			// Create a lock file that won't be released
			const lockPath = path.join(testDir, "snapback.db.lock");
			await fs.writeFile(lockPath, `12345\n${Date.now() - 40000}`); // Stale lock

			const files = new Map([["test.txt", "content"]]);

			// Should eventually timeout and throw an error
			await expect(storage.createSnapshot("test", files)).rejects.toThrow(
				DatabaseConnectionError,
			);
			await expect(storage.createSnapshot("test", files)).rejects.toThrow(
				"Failed to acquire database lock",
			);
		});
	});

	describe("Migration Errors", () => {
		it("should handle migration from non-existent old format gracefully", async () => {
			await storage.initialize();

			// Try to migrate from a non-existent directory
			const nonExistentDir = path.join(testDir, "non-existent");
			await expect(
				storage.migrateFromOldFormat(nonExistentDir),
			).resolves.not.toThrow();
		});

		it("should handle corrupt JSON files during migration", async () => {
			await storage.initialize();

			// Create corrupt JSON file
			const oldDir = path.join(testDir, "old-format");
			await fs.mkdir(oldDir, { recursive: true });
			await fs.writeFile(path.join(oldDir, "cp_corrupt.json"), "invalid json");

			await expect(storage.migrateFromOldFormat(oldDir)).resolves.not.toThrow();
		});
	});

	describe("Retention Policy Errors", () => {
		beforeEach(async () => {
			await storage.initialize();
		});

		it("should handle invalid retention policy parameters", async () => {
			// Test with invalid parameters
			await expect(
				storage.enforceRetentionPolicy({
					maxSnapshots: -1,
					maxAgeMs: -1,
				}),
			).resolves.toBeGreaterThanOrEqual(0);

			// Test with non-numeric parameters
			await expect(
				storage.enforceRetentionPolicy({
					maxSnapshots: "invalid" as any,
					maxAgeMs: "invalid" as any,
				}),
			).resolves.toBeGreaterThanOrEqual(0);
		});
	});

	describe("Logging Verification", () => {
		beforeEach(async () => {
			await storage.initialize();
		});

		it("should log errors before throwing DatabaseConnectionError", async () => {
			const consoleErrorSpy = vi
				.spyOn(console, "error")
				.mockImplementation(() => {});

			const uninitializedStorage = new SqliteSnapshotStorage(testDir);
			await expect(uninitializedStorage.listSnapshots()).rejects.toThrow(
				DatabaseConnectionError,
			);

			expect(consoleErrorSpy).toHaveBeenCalledWith(
				"Database not initialized in listSnapshots",
				expect.anything(),
			);

			consoleErrorSpy.mockRestore();
		});

		it("should log errors before throwing DatabaseError", async () => {
			const consoleErrorSpy = vi
				.spyOn(console, "error")
				.mockImplementation(() => {});

			// Force an initialization error
			const errorStorage = new SqliteSnapshotStorage(
				"/invalid/path/that/does/not/exist",
			);
			await expect(errorStorage.initialize()).rejects.toThrow(DatabaseError);

			expect(consoleErrorSpy).toHaveBeenCalledWith(
				"Failed to initialize database",
				expect.anything(),
			);

			consoleErrorSpy.mockRestore();
		});
	});
});
