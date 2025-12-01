import * as fs from "node:fs/promises";
import * as path from "node:path";
import { rimraf } from "rimraf";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SqliteCheckpointStorage } from "../../../src/storage/SqliteCheckpointStorage.js";
import { describeSqlite } from "../../helpers/sqliteTestUtils.js";

describeSqlite("SqliteCheckpointStorage Streaming", () => {
	let storage: SqliteCheckpointStorage;
	const testDir = path.join(__dirname, ".test-snapback-streaming");

	beforeEach(async () => {
		await fs.mkdir(testDir, { recursive: true });
		storage = new SqliteCheckpointStorage(testDir);
		await storage.initialize();
	});

	afterEach(async () => {
		await storage.close();
		await rimraf(testDir);
	});

	describe("Streaming Detection", () => {
		it("should not use streaming for small files", async () => {
			// Create small content (less than 1MB)
			const content = "Small content file";

			// Access private method through reflection for testing
			const shouldUseStreaming = (storage as any).shouldUseStreaming(
				Buffer.byteLength(content, "utf-8"),
			);

			expect(shouldUseStreaming).toBe(false);
		});

		it("should use streaming for large files", async () => {
			// Create large content (more than 1MB)
			const content = "A".repeat(2 * 1024 * 1024); // 2MB

			// Access private method through reflection for testing
			const shouldUseStreaming = (storage as any).shouldUseStreaming(
				Buffer.byteLength(content, "utf-8"),
			);

			expect(shouldUseStreaming).toBe(true);
		});
	});

	describe("Streaming Compression Integration", () => {
		it("should handle small files with regular compression", async () => {
			const files = new Map([["small-file.txt", "This is a small file"]]);
			const checkpoint = await storage.createCheckpoint("test", files);

			const retrieved = await storage.getCheckpoint(checkpoint.id);
			expect(retrieved.files.get("small-file.txt")).toBe(
				"This is a small file",
			);
		});

		it("should handle large files with streaming compression", async () => {
			// Create a moderately large file (still under test limits)
			const largeContent = "Large content file\n".repeat(1000);
			const files = new Map([["large-file.txt", largeContent]]);
			const checkpoint = await storage.createCheckpoint("test", files);

			const retrieved = await storage.getCheckpoint(checkpoint.id);
			expect(retrieved.files.get("large-file.txt")).toBe(largeContent);
		});

		it("should handle mixed small and large files", async () => {
			const smallContent = "Small content";
			const largeContent = "Large content file\n".repeat(500);

			const files = new Map([
				["small-file.txt", smallContent],
				["large-file.txt", largeContent],
			]);

			const checkpoint = await storage.createCheckpoint("test", files);

			const retrieved = await storage.getCheckpoint(checkpoint.id);
			expect(retrieved.files.get("small-file.txt")).toBe(smallContent);
			expect(retrieved.files.get("large-file.txt")).toBe(largeContent);
		});
	});

	describe("Streaming with Diffs", () => {
		it("should handle diffs for large files", async () => {
			// Create initial checkpoint with large content
			const initialContent = `Line 1\nLine 2\n${"Content line\n".repeat(
				1000,
			)}Line 3\n`;
			const initialFiles = new Map([["large-file.txt", initialContent]]);
			const initialCheckpoint = await storage.createCheckpoint(
				"initial",
				initialFiles,
			);

			// Create modified checkpoint with small changes to large content
			const modifiedContent =
				"Line 1 modified\nLine 2\n" +
				"Content line\n".repeat(1000) +
				"Line 3\nLine 4 added\n";
			const modifiedFiles = new Map([["large-file.txt", modifiedContent]]);
			const modifiedCheckpoint = await storage.createCheckpoint(
				"modified",
				modifiedFiles,
				undefined,
				initialCheckpoint.id,
			);

			// Retrieve and verify content
			const retrieved = await storage.getCheckpoint(modifiedCheckpoint.id);
			expect(retrieved.files.get("large-file.txt")).toBe(modifiedContent);
		});

		it("should use full content storage when diff is larger than content", async () => {
			// Create initial checkpoint
			const initialFiles = new Map([["file.txt", "Original small content"]]);
			const initialCheckpoint = await storage.createCheckpoint(
				"initial",
				initialFiles,
			);

			// Create modified checkpoint with completely different large content
			const modifiedContent = "X".repeat(2 * 1024 * 1024); // 2MB - much larger than diff would be
			const modifiedFiles = new Map([["file.txt", modifiedContent]]);
			const modifiedCheckpoint = await storage.createCheckpoint(
				"modified",
				modifiedFiles,
				undefined,
				initialCheckpoint.id,
			);

			// Retrieve and verify content
			const retrieved = await storage.getCheckpoint(modifiedCheckpoint.id);
			expect(retrieved.files.get("file.txt")).toBe(modifiedContent);
		});
	});

	describe("Performance", () => {
		it("should handle large file operations without memory issues", async () => {
			// Create multiple large files
			const files = new Map([
				["large-file-1.txt", "A".repeat(500000)], // 500KB
				["large-file-2.txt", "B".repeat(500000)], // 500KB
				["large-file-3.txt", "C".repeat(500000)], // 500KB
			]);

			const checkpoint = await storage.createCheckpoint("large-files", files);

			// Verify all files were stored correctly
			const retrieved = await storage.getCheckpoint(checkpoint.id);
			expect(retrieved.files.get("large-file-1.txt")).toBe("A".repeat(500000));
			expect(retrieved.files.get("large-file-2.txt")).toBe("B".repeat(500000));
			expect(retrieved.files.get("large-file-3.txt")).toBe("C".repeat(500000));
		});
	});
});
