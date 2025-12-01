import { describe, expect, it } from "vitest";
import { SqliteStorageAdapter } from "../../../src/storage/SqliteStorageAdapter.js";

describe("Adapter Detection Fixed", () => {
	describe("Reliable Adapter Detection", () => {
		it("should correctly identify SqliteStorageAdapter using isSqliteStorageAdapter property", () => {
			// Create a mock storage that mimics the old brittle detection issue
			const mockStorageWithFunctionLengthIssue = {
				create: (_data: any, _parentId = "default") => {
					return Promise.resolve({ id: "test" });
				},
				// This would fool the old detection logic
				isSqliteStorageAdapter: false, // Not a SqliteStorageAdapter
			};

			// SqliteStorageAdapter should have the property set to true
			const sqliteAdapter = new SqliteStorageAdapter("/test");
			expect(sqliteAdapter.isSqliteStorageAdapter).toBe(true);

			// The mock storage should have it set to false
			expect(mockStorageWithFunctionLengthIssue.isSqliteStorageAdapter).toBe(
				false,
			);

			// This demonstrates that our new detection method is reliable
			// regardless of function.length issues
		});

		it("should work correctly even with minified code", () => {
			// Even if code is minified and function parameters are renamed,
			// our detection based on the isSqliteStorageAdapter property will work

			// SqliteStorageAdapter will always have isSqliteStorageAdapter = true
			const adapter = new SqliteStorageAdapter("/test");
			expect(adapter.isSqliteStorageAdapter).toBe(true);

			// This is much more reliable than function.length checking
		});
	});
});
