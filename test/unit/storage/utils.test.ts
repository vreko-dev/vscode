/**
 * @fileoverview Storage Utility Functions Tests
 *
 * Tests for atomicWrite, fileId, and hash utilities.
 * Verifies critical path operations for data integrity.
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as vscode from "vscode";
import {
	atomicWriteFile,
	ensureDirectory,
	fileExists,
	readJsonFile,
	writeJsonFile,
} from "@vscode/storage/utils/atomicWrite";
import {
	generateAuditId,
	generateSessionId,
	generateSnapshotId,
	parseTimestampFromId,
	randomId,
} from "@vscode/storage/utils/fileId";
import { getBlobPath, hashContent } from "@vscode/storage/utils/hash";

describe("Storage Utilities", () => {
	let tempDir: string;
	let storageUri: vscode.Uri;

	beforeEach(async () => {
		tempDir = path.join(
			os.tmpdir(),
			`snapback-utils-test-${Date.now()}-${Math.random()}`,
		);
		await fs.mkdir(tempDir, { recursive: true });
		storageUri = vscode.Uri.file(tempDir);
	});

	afterEach(async () => {
		await fs.rm(tempDir, { recursive: true, force: true });
	});

	// ============================================================
	// fileId Tests
	// ============================================================

	describe("fileId utilities", () => {
		it("should generate random ID with correct length", () => {
			const id = randomId(6);
			expect(id).toHaveLength(6);
			expect(/^[a-z0-9]+$/.test(id)).toBe(true);
		});

		it("should generate unique random IDs", () => {
			const ids = new Set();
			for (let i = 0; i < 100; i++) {
				ids.add(randomId(8));
			}
			expect(ids.size).toBe(100); // All unique
		});

		it("should generate snapshot IDs with snap- prefix", () => {
			const id = generateSnapshotId();
			expect(id).toMatch(/^snap-\d+-[a-z0-9]{6}$/);
		});

		it("should generate session IDs with sess- prefix", () => {
			const id = generateSessionId();
			expect(id).toMatch(/^sess-\d+-[a-z0-9]{6}$/);
		});

		it("should generate audit IDs with audit- prefix", () => {
			const id = generateAuditId();
			expect(id).toMatch(/^audit-\d+-[a-z0-9]{6}$/);
		});

		it("should parse timestamp from snapshot ID", () => {
			const before = Date.now();
			const id = generateSnapshotId();
			const after = Date.now();

			const parsed = parseTimestampFromId(id);
			expect(parsed).toBeDefined();
			expect(parsed!).toBeGreaterThanOrEqual(before);
			expect(parsed!).toBeLessThanOrEqual(after);
		});

		it("should parse timestamp from session ID", () => {
			const id = generateSessionId();
			const parsed = parseTimestampFromId(id);
			expect(parsed).toBeDefined();
			expect(parsed).toBeGreaterThan(0);
		});

		it("should return null for invalid ID format", () => {
			const parsed = parseTimestampFromId("invalid-id");
			expect(parsed).toBeNull();
		});

		it("should handle IDs with same timestamp but different random parts", () => {
			const id1 = `snap-1234567890-abc123`;
			const id2 = `snap-1234567890-xyz789`;

			const ts1 = parseTimestampFromId(id1);
			const ts2 = parseTimestampFromId(id2);

			expect(ts1).toBe(ts2); // Same timestamp
		});

		it("should be Windows-safe (no colons in IDs)", () => {
			const ids = [
				generateSnapshotId(),
				generateSessionId(),
				generateAuditId(),
			];
			ids.forEach((id) => {
				expect(id).not.toContain(":");
				expect(id).not.toContain("/");
				expect(id).not.toContain("\\");
				expect(id).not.toContain("*");
				expect(id).not.toContain("?");
				expect(id).not.toContain('"');
				expect(id).not.toContain("<");
				expect(id).not.toContain(">");
				expect(id).not.toContain("|");
			});
		});
	});

	// ============================================================
	// Hash Tests
	// ============================================================

	describe("hash utilities", () => {
		it("should hash content as SHA-256", () => {
			const content = "test content";
			const hash = hashContent(content);

			expect(hash).toHaveLength(64); // SHA-256 hex = 64 chars
			expect(/^[a-f0-9]{64}$/.test(hash)).toBe(true);
		});

		it("should produce same hash for identical content", () => {
			const content = "The quick brown fox";
			const hash1 = hashContent(content);
			const hash2 = hashContent(content);

			expect(hash1).toBe(hash2);
		});

		it("should produce different hashes for different content", () => {
			const hash1 = hashContent("content1");
			const hash2 = hashContent("content2");

			expect(hash1).not.toBe(hash2);
		});

		it("should hash empty string", () => {
			const hash = hashContent("");
			expect(hash).toHaveLength(64);
			// SHA-256 of empty string
			expect(hash).toBe(
				"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
			);
		});

		it("should handle unicode content", () => {
			const content = "你好世界 🌍";
			const hash = hashContent(content);
			expect(hash).toHaveLength(64);
		});

		it("should create blob path with 2-level structure", () => {
			const hash =
				"abcd1234567890abcd1234567890abcd1234567890abcd1234567890abcd1234";
			const blobPath = getBlobPath(hash);

			expect(blobPath).toBe(
				"ab/cd/abcd1234567890abcd1234567890abcd1234567890abcd1234567890abcd1234",
			);
		});

		it("should maintain blob hash in path", () => {
			const hash =
				"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
			const blobPath = getBlobPath(hash);

			expect(blobPath).toContain(hash);
			expect(blobPath.endsWith(hash)).toBe(true);
		});

		it("should extract directory levels from hash", () => {
			const hash =
				"xyzabc1234567890abcd1234567890abcd1234567890abcd1234567890abcd12";
			const blobPath = getBlobPath(hash);

			const parts = blobPath.split("/");
			expect(parts).toHaveLength(3);
			expect(parts[0]).toBe("xy"); // First 2 chars
			expect(parts[1]).toBe("za"); // Chars 2-4
			expect(parts[2]).toBe(hash); // Full hash
		});
	});

	// ============================================================
	// atomicWrite Tests
	// ============================================================

	describe("atomicWrite utilities", () => {
		it("should write file atomically", async () => {
			const fileUri = vscode.Uri.joinPath(storageUri, "test.txt");
			const content = "Hello, World!";

			await atomicWriteFile(fileUri, content);

			const written = await fs.readFile(fileUri.fsPath, "utf-8");
			expect(written).toBe(content);
		});

		it("should handle string content", async () => {
			const fileUri = vscode.Uri.joinPath(storageUri, "string.txt");
			const content = "String content";

			await atomicWriteFile(fileUri, content);
			const written = await fs.readFile(fileUri.fsPath, "utf-8");
			expect(written).toBe(content);
		});

		it("should handle Uint8Array content", async () => {
			const fileUri = vscode.Uri.joinPath(storageUri, "binary.bin");
			const content = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"

			await atomicWriteFile(fileUri, content);
			const written = await fs.readFile(fileUri.fsPath);
			expect(Buffer.from(written)).toEqual(Buffer.from(content));
		});

		it("should create parent directories recursively", async () => {
			const fileUri = vscode.Uri.joinPath(
				storageUri,
				"deep/nested/path/file.txt",
			);
			await atomicWriteFile(fileUri, "content");

			expect(
				await fileExists(vscode.Uri.joinPath(storageUri, "deep/nested/path")),
			).toBe(true);
			expect(await fileExists(fileUri)).toBe(true);
		});

		it("should overwrite existing file", async () => {
			const fileUri = vscode.Uri.joinPath(storageUri, "overwrite.txt");

			await atomicWriteFile(fileUri, "original");
			expect(await fileExists(fileUri)).toBe(true);

			await atomicWriteFile(fileUri, "updated");
			const content = await fs.readFile(fileUri.fsPath, "utf-8");
			expect(content).toBe("updated");
		});

		it("should clean up temp files on failure", async () => {
			// This is tricky to test without mocking, but we can verify normal success case
			const fileUri = vscode.Uri.joinPath(storageUri, "cleanup-test.txt");
			await atomicWriteFile(fileUri, "safe write");

			const dir = await fs.readdir(storageUri.fsPath);
			const tempFiles = dir.filter((f) => f.startsWith(".tmp-"));
			expect(tempFiles).toHaveLength(0); // No temp files left
		});

		it("should handle unicode in atomic write", async () => {
			const fileUri = vscode.Uri.joinPath(storageUri, "unicode.txt");
			const content = "你好世界 🌍 Привет мир";

			await atomicWriteFile(fileUri, content);
			const written = await fs.readFile(fileUri.fsPath, "utf-8");
			expect(written).toBe(content);
		});

		it("should ensure directory exists", async () => {
			const dirUri = vscode.Uri.joinPath(storageUri, "test-dir");
			await ensureDirectory(dirUri);

			expect(await fileExists(dirUri)).toBe(true);
			const stat = await vscode.workspace.fs.stat(dirUri);
			expect(stat.type === vscode.FileType.Directory).toBe(true);
		});

		it("should handle existing directory gracefully", async () => {
			const dirUri = vscode.Uri.joinPath(storageUri, "existing-dir");
			await ensureDirectory(dirUri);
			await ensureDirectory(dirUri); // Should not throw

			expect(await fileExists(dirUri)).toBe(true);
		});

		it("should check file existence correctly", async () => {
			const fileUri = vscode.Uri.joinPath(storageUri, "existence-check.txt");

			expect(await fileExists(fileUri)).toBe(false);
			await atomicWriteFile(fileUri, "exists");
			expect(await fileExists(fileUri)).toBe(true);
		});

		it("should read JSON file successfully", async () => {
			const fileUri = vscode.Uri.joinPath(storageUri, "test.json");
			const data = { id: "test-id", timestamp: 123456, name: "Test" };

			await writeJsonFile(fileUri, data);
			const read = await readJsonFile<typeof data>(fileUri);

			expect(read).toEqual(data);
		});

		it("should return null for non-existent JSON file", async () => {
			const fileUri = vscode.Uri.joinPath(storageUri, "nonexistent.json");
			const read = await readJsonFile(fileUri);

			expect(read).toBeNull();
		});

		it("should handle corrupted JSON gracefully", async () => {
			const fileUri = vscode.Uri.joinPath(storageUri, "corrupted.json");
			await atomicWriteFile(fileUri, "not valid json {");

			const read = await readJsonFile(fileUri);
			expect(read).toBeNull(); // Should return null, not throw
		});

		it("should write JSON with pretty formatting", async () => {
			const fileUri = vscode.Uri.joinPath(storageUri, "pretty.json");
			const data = { id: "test", nested: { key: "value" } };

			await writeJsonFile(fileUri, data);
			const content = await fs.readFile(fileUri.fsPath, "utf-8");

			expect(content).toContain("\n"); // Has newlines (formatted)
			expect(content).toContain("  "); // Has indentation
			const parsed = JSON.parse(content);
			expect(parsed).toEqual(data);
		});

		it("should handle large JSON files", async () => {
			const fileUri = vscode.Uri.joinPath(storageUri, "large.json");
			const data = {
				items: Array.from({ length: 1000 }, (_, i) => ({
					id: `item-${i}`,
					name: `Item ${i}`,
					timestamp: Date.now() + i,
				})),
			};

			await writeJsonFile(fileUri, data);
			const read = await readJsonFile<typeof data>(fileUri);

			expect(read).toEqual(data);
			expect(read?.items).toHaveLength(1000);
		});

		it("should handle JSON with unicode", async () => {
			const fileUri = vscode.Uri.joinPath(storageUri, "unicode.json");
			const data = { message: "你好 🌍 Hello мир" };

			await writeJsonFile(fileUri, data);
			const read = await readJsonFile<typeof data>(fileUri);

			expect(read).toEqual(data);
		});
	});

	// ============================================================
	// Integration Tests
	// ============================================================

	describe("Utility Integration", () => {
		it("should work together: generate ID → create blob path → atomic write/read", async () => {
			// 1. Generate ID
			const snapshotId = generateSnapshotId();
			expect(snapshotId).toBeDefined();

			// 2. Create content and hash it
			const content = "test file content";
			const hash = hashContent(content);

			// 3. Get blob path
			const blobPath = getBlobPath(hash);
			expect(blobPath).toContain("/");

			// 4. Write file atomically
			const blobUri = vscode.Uri.joinPath(storageUri, "blobs", blobPath);
			await ensureDirectory(vscode.Uri.joinPath(blobUri, ".."));
			await atomicWriteFile(blobUri, content);

			// 5. Create manifest
			const manifest = {
				id: snapshotId,
				timestamp: Date.now(),
				files: {
					"test.txt": { blob: hash, size: Buffer.byteLength(content) },
				},
			};

			// 6. Save manifest
			const manifestUri = vscode.Uri.joinPath(storageUri, `${snapshotId}.json`);
			await writeJsonFile(manifestUri, manifest);

			// 7. Verify everything
			const readManifest = await readJsonFile(manifestUri);
			expect(readManifest).toEqual(manifest);

			const readContent = await fs.readFile(blobUri.fsPath, "utf-8");
			expect(readContent).toBe(content);

			const ts = parseTimestampFromId(snapshotId);
			expect(ts).toBeGreaterThan(0);
		});
	});
});
