// Simple validation script to check if our storage files compile correctly

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { rimraf } from "rimraf";
import { SqliteSnapshotStorage } from "./src/storage/SqliteSnapshotStorage.js";

async function validateStorage() {
	console.log("Validating SqliteSnapshotStorage...");

	const testDir = path.join(__dirname, ".test-validation");

	try {
		// Create test directory
		await fs.mkdir(testDir, { recursive: true });

		// Create storage instance
		const storage = new SqliteSnapshotStorage(testDir);

		// Test that the class is properly constructed
		console.log("✓ SqliteSnapshotStorage instantiated successfully");

		// Check that all methods exist
		const methods = [
			"initialize",
			"createSnapshot",
			"getSnapshot",
			"listSnapshots",
			"listSnapshotsPaginated",
			"enforceRetentionPolicy",
			"close",
		];

		for (const method of methods) {
			if (typeof (storage as Record<string, unknown>)[method] === "function") {
				console.log(`✓ Method ${method} exists`);
			} else {
				console.error(`✗ Method ${method} is missing`);
				return false;
			}
		}

		console.log("✓ All required methods present");

		// Clean up
		await storage.close().catch(() => {});
		await rimraf(testDir);

		console.log("✓ Validation completed successfully");
		return true;
	} catch (error) {
		console.error("✗ Validation failed:", error);
		// Clean up on error
		await rimraf(testDir).catch(() => {});
		return false;
	}
}

// Run validation
validateStorage().then((success) => {
	process.exit(success ? 0 : 1);
});
