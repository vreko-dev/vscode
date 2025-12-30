/**
 * MCPStorageReader Tests
 *
 * Tests for reading snapshots from MCP storage (.snapback/snapshots/)
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { MCPStorageReader } from "../../../../src/storage/bridge/MCPStorageReader";
import * as fs from "node:fs/promises";
import * as path from "node:path";

vi.mock("node:fs/promises");

describe("MCPStorageReader", () => {
	let reader: MCPStorageReader;
	const workspaceRoot = "/test/workspace";

	beforeEach(() => {
		vi.resetAllMocks();
		reader = new MCPStorageReader(workspaceRoot);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("list", () => {
		it("should return empty array when .snapback directory does not exist", async () => {
			vi.mocked(fs.access).mockRejectedValue(new Error("ENOENT"));

			const snapshots = await reader.list();

			expect(snapshots).toEqual([]);
		});

		it("should read and parse all manifest files", async () => {
			vi.mocked(fs.access).mockResolvedValue(undefined);
			vi.mocked(fs.readdir).mockResolvedValue([
				"snap-001.json",
				"snap-002.json",
				"not-a-snapshot.txt", // Should be ignored
			] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

			vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
				const p = filePath.toString();
				if (p.includes("snap-001")) {
					return JSON.stringify({
						id: "snap-001",
						createdAt: 1704067200000,
						files: [{ path: "a.ts", blobId: "b1", size: 100 }],
						totalSize: 100,
					});
				}
				if (p.includes("snap-002")) {
					return JSON.stringify({
						id: "snap-002",
						createdAt: 1704067300000,
						files: [{ path: "b.ts", blobId: "b2", size: 200 }],
						totalSize: 200,
					});
				}
				throw new Error("Unexpected file");
			});

			const snapshots = await reader.list();

			expect(snapshots).toHaveLength(2);
			expect(snapshots[0].id).toBe("snap-001");
			expect(snapshots[1].id).toBe("snap-002");
			expect(snapshots[0].source).toBe("mcp");
		});

		it("should skip invalid JSON files gracefully", async () => {
			// Create a fresh reader instance to avoid mock leakage
			const freshReader = new MCPStorageReader(workspaceRoot);

			vi.mocked(fs.access).mockResolvedValue(undefined);
			vi.mocked(fs.readdir).mockResolvedValue([
				"valid.json",
				"corrupted.json",
			] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

			vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
				const p = filePath.toString();
				if (p.endsWith("valid.json")) {
					return JSON.stringify({
						id: "valid",
						createdAt: 1704067200000,
						files: [],
						totalSize: 0,
					});
				}
				if (p.endsWith("corrupted.json")) {
					// Simulate corrupted file by throwing
					throw new Error("File read error: corrupted");
				}
				throw new Error(`Unexpected file: ${p}`);
			});

			const snapshots = await freshReader.list();

			expect(snapshots).toHaveLength(1);
			expect(snapshots[0].id).toBe("valid");
		});

		it("should skip manifests with missing required fields", async () => {
			vi.mocked(fs.access).mockResolvedValue(undefined);
			vi.mocked(fs.readdir).mockResolvedValue([
				"valid.json",
				"no-id.json",
				"no-createdAt.json",
			] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

			vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
				const p = filePath.toString();
				if (p.includes("valid")) {
					return JSON.stringify({
						id: "valid",
						createdAt: 1704067200000,
						files: [],
						totalSize: 0,
					});
				}
				if (p.includes("no-id")) {
					return JSON.stringify({
						createdAt: 1704067200000,
						files: [],
						totalSize: 0,
					});
				}
				if (p.includes("no-createdAt")) {
					return JSON.stringify({
						id: "no-timestamp",
						files: [],
						totalSize: 0,
					});
				}
				throw new Error("Unexpected file");
			});

			const snapshots = await reader.list();

			expect(snapshots).toHaveLength(1);
			expect(snapshots[0].id).toBe("valid");
		});

		it("should handle empty directory", async () => {
			vi.mocked(fs.access).mockResolvedValue(undefined);
			vi.mocked(fs.readdir).mockResolvedValue(
				[] as unknown as Awaited<ReturnType<typeof fs.readdir>>,
			);

			const snapshots = await reader.list();

			expect(snapshots).toEqual([]);
		});

		it("should handle readdir failure gracefully", async () => {
			vi.mocked(fs.access).mockResolvedValue(undefined);
			vi.mocked(fs.readdir).mockRejectedValue(new Error("Permission denied"));

			const snapshots = await reader.list();

			expect(snapshots).toEqual([]);
		});
	});

	describe("getSnapshotDir", () => {
		it("should return correct path", () => {
			expect(reader.getSnapshotDir()).toBe(
				path.join(workspaceRoot, ".snapback", "snapshots"),
			);
		});
	});

	describe("exists", () => {
		it("should return true when .snapback directory exists", async () => {
			vi.mocked(fs.access).mockResolvedValue(undefined);

			const exists = await reader.exists();

			expect(exists).toBe(true);
		});

		it("should return false when .snapback directory does not exist", async () => {
			vi.mocked(fs.access).mockRejectedValue(new Error("ENOENT"));

			const exists = await reader.exists();

			expect(exists).toBe(false);
		});
	});

	describe("getBlobContent", () => {
		it("should return blob content when file exists", async () => {
			vi.mocked(fs.access).mockResolvedValue(undefined);
			vi.mocked(fs.readFile).mockResolvedValue(
				Buffer.from("file content", "utf8"),
			);

			const content = await reader.getBlobContent("abc123");

			expect(content).toEqual(Buffer.from("file content", "utf8"));
			expect(fs.readFile).toHaveBeenCalledWith(
				path.join(workspaceRoot, ".snapback", "blobs", "ab", "abc123"),
			);
		});

		it("should return null when blob does not exist", async () => {
			vi.mocked(fs.readFile).mockRejectedValue(new Error("ENOENT"));

			const content = await reader.getBlobContent("nonexistent");

			expect(content).toBeNull();
		});
	});

	describe("getManifest", () => {
		it("should return manifest by ID", async () => {
			vi.mocked(fs.readFile).mockResolvedValue(
				JSON.stringify({
					id: "snap-001",
					createdAt: 1704067200000,
					files: [{ path: "a.ts", blobId: "b1", size: 100 }],
					totalSize: 100,
				}),
			);

			const manifest = await reader.getManifest("snap-001");

			expect(manifest).not.toBeNull();
			expect(manifest?.id).toBe("snap-001");
		});

		it("should return null when manifest does not exist", async () => {
			vi.mocked(fs.readFile).mockRejectedValue(new Error("ENOENT"));

			const manifest = await reader.getManifest("nonexistent");

			expect(manifest).toBeNull();
		});
	});
});
