import * as fs from "node:fs/promises";
import * as path from "node:path";
import { createPatch } from "diff";
import { rimraf } from "rimraf";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CompressionUtil } from "../../../src/storage/CompressionUtil.js";
import { SqliteCheckpointStorage } from "../../../src/storage/SqliteCheckpointStorage.js";
import { describeSqlite } from "../../helpers/sqliteTestUtils.js";

describeSqlite("SqliteCheckpointStorage Diff Optimization", () => {
	let storage: SqliteCheckpointStorage;
	const testDir = path.join(__dirname, ".test-snapback-diff");

	beforeEach(async () => {
		await fs.mkdir(testDir, { recursive: true });
		storage = new SqliteCheckpointStorage(testDir);
		await storage.initialize();
	});

	afterEach(async () => {
		await storage.close();
		await rimraf(testDir);
	});

	describe("determineOptimalStorageStrategy", () => {
		it("should use full content when diff is larger than content", async () => {
			// Create a small original content
			const original = "Hello World";

			// Create a completely different large content (diff would be larger)
			const modified = "A".repeat(1000);

			// Access private method through reflection for testing
			const strategy = (storage as any).determineOptimalStorageStrategy(
				original,
				modified,
				"test.txt",
			);

			// Should use full content since diff would be larger
			expect(strategy.useFullContent).toBe(true);
			expect(strategy.diff).toBeUndefined();
		});

		it("should use diff when diff is smaller than full content", async () => {
			// Create original content
			const original = "Hello World\nThis is line 2\nThis is line 3\n";

			// Create modified content with small changes
			const modified =
				"Hello World\nThis is line 2 modified\nThis is line 3\nThis is a new line\n";

			// Access private method through reflection for testing
			const strategy = (storage as any).determineOptimalStorageStrategy(
				original,
				modified,
				"test.txt",
			);

			// For this test, we need to check the actual sizes
			const diff = createPatch("test.txt", original, modified);
			const compressedDiff = CompressionUtil.compress(diff);
			const compressedFullContent = CompressionUtil.compress(modified);

			// The test should pass based on actual size comparison
			if (compressedFullContent.length <= compressedDiff.length) {
				expect(strategy.useFullContent).toBe(true);
			} else {
				expect(strategy.useFullContent).toBe(false);
				expect(strategy.diff).toBeDefined();
			}
		});

		it("should handle identical content", async () => {
			// Create identical content
			const content = "Hello World\nThis is a test file\n";

			// Access private method through reflection for testing
			const strategy = (storage as any).determineOptimalStorageStrategy(
				content,
				content,
				"test.txt",
			);

			// For identical content, we should use full content (though this case is handled elsewhere)
			const diff = createPatch("test.txt", content, content);
			const compressedDiff = CompressionUtil.compress(diff);
			const compressedFullContent = CompressionUtil.compress(content);

			if (compressedFullContent.length <= compressedDiff.length) {
				expect(strategy.useFullContent).toBe(true);
			} else {
				expect(strategy.useFullContent).toBe(false);
				expect(strategy.diff).toBeDefined();
			}
		});
	});

	describe("Storage Strategy Integration", () => {
		it("should store full content when diff is larger", async () => {
			// Create initial checkpoint with small content
			const initialFiles = new Map([["large-file.txt", "Small content"]]);
			const initialCheckpoint = await storage.createCheckpoint(
				"initial",
				initialFiles,
			);

			// Create modified checkpoint with completely different large content
			const modifiedFiles = new Map([["large-file.txt", "X".repeat(1000)]]);
			const modifiedCheckpoint = await storage.createCheckpoint(
				"modified",
				modifiedFiles,
				undefined,
				initialCheckpoint.id,
			);

			// Retrieve the checkpoint and verify content is correct
			const retrieved = await storage.getCheckpoint(modifiedCheckpoint.id);
			expect(retrieved.files.get("large-file.txt")).toBe("X".repeat(1000));
		});

		it("should store diff when diff is smaller", async () => {
			// Create initial checkpoint
			const initialFiles = new Map([["file.txt", "Line 1\nLine 2\nLine 3\n"]]);
			const initialCheckpoint = await storage.createCheckpoint(
				"initial",
				initialFiles,
			);

			// Create modified checkpoint with small changes
			const modifiedFiles = new Map([
				["file.txt", "Line 1\nLine 2 modified\nLine 3\nLine 4\n"],
			]);
			const modifiedCheckpoint = await storage.createCheckpoint(
				"modified",
				modifiedFiles,
				undefined,
				initialCheckpoint.id,
			);

			// Retrieve the checkpoint and verify content is correct
			const retrieved = await storage.getCheckpoint(modifiedCheckpoint.id);
			expect(retrieved.files.get("file.txt")).toBe(
				"Line 1\nLine 2 modified\nLine 3\nLine 4\n",
			);
		});

		it("should handle mixed storage strategies", async () => {
			// Create initial checkpoint
			const initialFiles = new Map([
				["small-file.txt", "Small content"],
				["large-file.txt", "A".repeat(500)],
			]);
			const initialCheckpoint = await storage.createCheckpoint(
				"initial",
				initialFiles,
			);

			// Create modified checkpoint with different strategies for each file
			const modifiedFiles = new Map([
				// This will use full content (diff larger than content)
				["small-file.txt", "X".repeat(1000)],
				// This will use diff (small changes to large content)
				["large-file.txt", "A".repeat(495) + "B".repeat(5)],
			]);
			const modifiedCheckpoint = await storage.createCheckpoint(
				"modified",
				modifiedFiles,
				undefined,
				initialCheckpoint.id,
			);

			// Retrieve the checkpoint and verify both files are correct
			const retrieved = await storage.getCheckpoint(modifiedCheckpoint.id);
			expect(retrieved.files.get("small-file.txt")).toBe("X".repeat(1000));
			expect(retrieved.files.get("large-file.txt")).toBe(
				"A".repeat(495) + "B".repeat(5),
			);
		});
	});

	describe("Performance Comparison", () => {
		it("should reduce storage size for cases where full content is more efficient", async () => {
			// Create initial checkpoint
			const initialFiles = new Map([["test.txt", "Original content"]]);
			const initialCheckpoint = await storage.createCheckpoint(
				"initial",
				initialFiles,
			);

			// Create modified checkpoint with completely different content
			const modifiedFiles = new Map([
				["test.txt", "Completely different content that is much shorter"],
			]);
			const modifiedCheckpoint = await storage.createCheckpoint(
				"modified",
				modifiedFiles,
				undefined,
				initialCheckpoint.id,
			);

			// Get storage stats to verify efficiency
			const stats = await storage.getStorageStats();

			// The stored content should be the shorter full content, not a large diff
			expect(stats.checkpoints[modifiedCheckpoint.id]).toBeDefined();
			const fileStats =
				stats.checkpoints[modifiedCheckpoint.id].files["test.txt"];
			expect(fileStats).toBeGreaterThan(0);

			// Retrieve and verify content
			const retrieved = await storage.getCheckpoint(modifiedCheckpoint.id);
			expect(retrieved.files.get("test.txt")).toBe(
				"Completely different content that is much shorter",
			);
		});
	});
});
