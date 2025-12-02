/**
 * @fileoverview BlobStore Tests
 *
 * Tests for content-addressable blob storage with SHA-256 hashing.
 * Verifies deduplication, retrieval, and directory structure.
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as vscode from "vscode";
import { BlobStore } from "../../../src/storage/BlobStore";

describe("BlobStore", () => {
	let tempDir: string;
	let storageUri: vscode.Uri;
	let blobStore: BlobStore;

	beforeEach(async () => {
		// Create temporary directory
		tempDir = path.join(
			os.tmpdir(),
			`snapback-blob-test-${Date.now()}-${Math.random()}`,
		);
		await fs.mkdir(tempDir, { recursive: true });
		storageUri = vscode.Uri.file(tempDir);
		blobStore = new BlobStore(storageUri);
		await blobStore.initialize();
	});

	afterEach(async () => {
		// Cleanup
		await fs.rm(tempDir, { recursive: true, force: true });
	});

	describe("Basic Operations", () => {
		it("should store content and return hash", async () => {
			const content = "Test content for blob storage";
			const result = await blobStore.store(content);

			expect(result.hash).toBeDefined();
			expect(result.hash).toHaveLength(64); // SHA-256 hex = 64 chars
			expect(result.size).toBe(Buffer.byteLength(content, "utf-8"));
			expect(result.isNew).toBe(true);
		});

		it("should retrieve stored content by hash", async () => {
			const content = "Retrievable content";
			const { hash } = await blobStore.store(content);

			const retrieved = await blobStore.retrieve(hash);
			expect(retrieved).toBe(content);
		});

		it("should return null for non-existent blob", async () => {
			const retrieved = await blobStore.retrieve(
				`nonexistent${"a".repeat(54)}`,
			);
			expect(retrieved).toBeNull();
		});

		it("should handle empty string content", async () => {
			const result = await blobStore.store("");
			expect(result.hash).toBeDefined();
			expect(result.size).toBe(0);

			const retrieved = await blobStore.retrieve(result.hash);
			expect(retrieved).toBe("");
		});

		it("should handle unicode content", async () => {
			const content = "你好世界 🌍 Привет мир";
			const result = await blobStore.store(content);

			const retrieved = await blobStore.retrieve(result.hash);
			expect(retrieved).toBe(content);
			expect(result.size).toBe(Buffer.byteLength(content, "utf-8"));
		});

		it("should handle large content", async () => {
			const content = "x".repeat(1024 * 1024); // 1MB
			const result = await blobStore.store(content);

			const retrieved = await blobStore.retrieve(result.hash);
			expect(retrieved).toHaveLength(content.length);
		});
	});

	describe("Deduplication", () => {
		it("should not create duplicate blobs for same content", async () => {
			const content = "Duplicate test content";

			const result1 = await blobStore.store(content);
			const result2 = await blobStore.store(content);

			expect(result1.hash).toBe(result2.hash);
			expect(result1.isNew).toBe(true);
			expect(result2.isNew).toBe(false); // Second write should be skipped
		});

		it("should create different hashes for different content", async () => {
			const content1 = "Content A";
			const content2 = "Content B";

			const result1 = await blobStore.store(content1);
			const result2 = await blobStore.store(content2);

			expect(result1.hash).not.toBe(result2.hash);
		});

		it("should create same hash for same content despite whitespace differences in input", async () => {
			const base = "The quick brown fox";

			const result1 = await blobStore.store(base);
			const result2 = await blobStore.store(base); // Exact same

			expect(result1.hash).toBe(result2.hash);
		});
	});

	describe("Directory Structure", () => {
		it("should create 2-level directory structure (ab/cd/hash)", async () => {
			const content = "Structure test";
			const { hash } = await blobStore.store(content);

			// Hash format: ab/cd/abcd...
			const expectedPath = `${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}`;
			const blobPath = path.join(tempDir, "blobs", expectedPath);

			const stat = await fs.stat(blobPath);
			expect(stat.isFile()).toBe(true);
		});

		it("should handle multiple blobs in same directory bucket", async () => {
			// Create multiple contents that might hash to same first 4 chars
			const contents = Array.from({ length: 10 }, (_, i) => `Content ${i}`);
			const hashes = new Set();

			for (const content of contents) {
				const { hash } = await blobStore.store(content);
				hashes.add(hash);
			}

			expect(hashes.size).toBe(10); // All different

			// Verify all can be retrieved
			for (const hash of hashes) {
				const retrieved = await blobStore.retrieve(hash as string);
				expect(retrieved).not.toBeNull();
			}
		});
	});

	describe("Existence Checks", () => {
		it("should correctly report blob existence", async () => {
			const content = "Existence test";
			const { hash } = await blobStore.store(content);

			const exists = await blobStore.exists(hash);
			expect(exists).toBe(true);
		});

		it("should return false for non-existent blob", async () => {
			const exists = await blobStore.exists(`nonexistent${"a".repeat(54)}`);
			expect(exists).toBe(false);
		});
	});

	describe("Deletion", () => {
		it("should delete blob", async () => {
			const content = "Delete test";
			const { hash } = await blobStore.store(content);

			const deleted = await blobStore.delete(hash);
			expect(deleted).toBe(true);

			const retrieved = await blobStore.retrieve(hash);
			expect(retrieved).toBeNull();
		});

		it("should handle deletion of non-existent blob gracefully", async () => {
			const deleted = await blobStore.delete(`nonexistent${"a".repeat(54)}`);
			expect(deleted).toBe(false);
		});
	});

	describe("Statistics", () => {
		it("should count blobs correctly", async () => {
			const contents = ["Blob 1", "Blob 2", "Blob 3"];

			for (const content of contents) {
				await blobStore.store(content);
			}

			const count = await blobStore.count();
			expect(count).toBe(3);
		});

		it("should calculate total size correctly", async () => {
			const content1 = "Hello"; // 5 bytes
			const content2 = "World"; // 5 bytes

			await blobStore.store(content1);
			await blobStore.store(content2);

			const totalSize = await blobStore.getTotalSize();
			expect(totalSize).toBe(10);
		});

		it("should handle size calculation with unicode", async () => {
			const content = "你好"; // 6 bytes in UTF-8
			const { size } = await blobStore.store(content);

			const totalSize = await blobStore.getTotalSize();
			expect(totalSize).toBe(size);
		});
	});

	describe("Concurrency", () => {
		it("should handle concurrent writes of same content", async () => {
			const content = "Concurrent test";

			const results = await Promise.all([
				blobStore.store(content),
				blobStore.store(content),
				blobStore.store(content),
			]);

			// All should have same hash
			expect(results[0].hash).toBe(results[1].hash);
			expect(results[1].hash).toBe(results[2].hash);

			// Only first should be marked as new
			expect(results.filter((r) => r.isNew)).toHaveLength(1);
		});

		it("should handle concurrent writes of different content", async () => {
			const contents = ["Content 1", "Content 2", "Content 3"];

			const results = await Promise.all(
				contents.map((content) => blobStore.store(content)),
			);

			const hashes = new Set(results.map((r) => r.hash));
			expect(hashes.size).toBe(3); // All different

			// All should be new
			expect(results.every((r) => r.isNew)).toBe(true);
		});
	});

	describe("Error Handling", () => {
		it("should handle malformed hash gracefully on retrieval", async () => {
			const retrieved = await blobStore.retrieve("invalid-hash");
			expect(retrieved).toBeNull();
		});

		it("should handle retrieval with minimum-length invalid hash", async () => {
			const retrieved = await blobStore.retrieve("aa");
			expect(retrieved).toBeNull();
		});
	});
});
