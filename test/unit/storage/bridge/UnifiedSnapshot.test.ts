/**
 * UnifiedSnapshot Tests
 *
 * Tests for the unified snapshot interface that normalizes both
 * extension (V2 SQLite) and MCP (JSON file) storage formats.
 */

import { describe, it, expect } from "vitest";
import {
	type UnifiedSnapshot,
	fromExtensionManifest,
	fromMCPManifest,
} from "../../../../src/storage/bridge/UnifiedSnapshot";
import type { SnapshotManifestV2 } from "../../../../src/storage/types";
import type { MCPSnapshotManifest } from "../../../../src/storage/bridge/MCPStorageReader";

describe("UnifiedSnapshot", () => {
	describe("fromExtensionManifest", () => {
		it("should convert V2 manifest to unified format", () => {
			const v2Manifest: SnapshotManifestV2 = {
				schemaVersion: 2,
				id: "snap-1704067200000-abc",
				seq: 1,
				parentSeq: null,
				parentId: null,
				type: "POST",
				timestamp: 1704067200000,
				name: "After refactoring auth",
				anchorFile: "src/auth.ts",
				files: {
					"src/auth.ts": { blobHash: "abc123", size: 1500 },
					"src/api.ts": { blobHash: "def456", size: 2000 },
				},
				metadata: {
					riskScore: 0.7,
					sessionId: "session-xyz",
					origin: "AUTOMATED",
					reasons: ["AI_DETECTED"],
				},
			};

			const unified = fromExtensionManifest(v2Manifest);

			expect(unified.id).toBe("snap-1704067200000-abc");
			expect(unified.source).toBe("extension");
			expect(unified.timestamp).toBe(1704067200000);
			expect(unified.name).toBe("After refactoring auth");
			expect(unified.files).toHaveLength(2);
			expect(unified.files[0]).toEqual({
				path: "src/auth.ts",
				contentId: "abc123",
				size: 1500,
			});
			expect(unified.totalSize).toBe(3500);
			expect(unified.metadata?.riskScore).toBe(0.7);
			expect(unified.trigger).toBe("auto"); // POST maps to auto
		});

		it("should handle missing optional fields", () => {
			const minimalManifest: SnapshotManifestV2 = {
				schemaVersion: 2,
				id: "snap-minimal",
				seq: 1,
				parentSeq: null,
				parentId: null,
				type: "POST",
				timestamp: 1704067200000,
				name: "Minimal",
				anchorFile: "file.ts",
				files: {},
			};

			const unified = fromExtensionManifest(minimalManifest);

			expect(unified.metadata).toBeUndefined();
			expect(unified.files).toHaveLength(0);
			expect(unified.totalSize).toBe(0);
		});

		it("should map PRE type to manual trigger", () => {
			const preManifest: SnapshotManifestV2 = {
				schemaVersion: 2,
				id: "snap-pre",
				seq: 2,
				parentSeq: 1,
				parentId: "snap-1",
				type: "PRE",
				timestamp: 1704067200000,
				name: "Before change",
				anchorFile: "file.ts",
				files: {},
			};

			const unified = fromExtensionManifest(preManifest);

			expect(unified.trigger).toBe("manual");
		});

		it("should map PRE_ROLLBACK type to pre-rollback trigger", () => {
			const rollbackManifest: SnapshotManifestV2 = {
				schemaVersion: 2,
				id: "snap-rollback",
				seq: 3,
				parentSeq: 2,
				parentId: "snap-2",
				type: "PRE_ROLLBACK",
				timestamp: 1704067200000,
				name: "Before restore",
				anchorFile: "file.ts",
				files: {},
			};

			const unified = fromExtensionManifest(rollbackManifest);

			expect(unified.trigger).toBe("pre-rollback");
		});

		it("should extract aiTool from metadata", () => {
			const aiManifest: SnapshotManifestV2 = {
				schemaVersion: 2,
				id: "snap-ai",
				seq: 1,
				parentSeq: null,
				parentId: null,
				type: "POST",
				timestamp: 1704067200000,
				name: "AI change",
				anchorFile: "file.ts",
				files: {},
				metadata: {
					aiDetection: {
						detected: true,
						tool: "Claude",
						confidence: 0.95,
					},
				},
			};

			const unified = fromExtensionManifest(aiManifest);

			expect(unified.metadata?.aiTool).toBe("Claude");
		});
	});

	describe("fromMCPManifest", () => {
		it("should convert engine manifest to unified format", () => {
			const engineManifest: MCPSnapshotManifest = {
				id: "mcp-snap-9876",
				createdAt: 1704067200000,
				files: [
					{ path: "src/index.ts", blobId: "blob-111", size: 500 },
					{ path: "src/utils.ts", blobId: "blob-222", size: 300 },
				],
				totalSize: 800,
				description: "Before risky change",
				trigger: "manual",
			};

			const unified = fromMCPManifest(engineManifest);

			expect(unified.id).toBe("mcp-snap-9876");
			expect(unified.source).toBe("mcp");
			expect(unified.timestamp).toBe(1704067200000);
			expect(unified.name).toBe("Before risky change");
			expect(unified.files).toHaveLength(2);
			expect(unified.files[0]).toEqual({
				path: "src/index.ts",
				contentId: "blob-111",
				size: 500,
			});
			expect(unified.totalSize).toBe(800);
			expect(unified.trigger).toBe("manual");
		});

		it("should use default name when description missing", () => {
			const manifest: MCPSnapshotManifest = {
				id: "mcp-snap-no-desc",
				createdAt: 1704067200000,
				files: [],
				totalSize: 0,
			};

			const unified = fromMCPManifest(manifest);

			expect(unified.name).toBe("Snapshot mcp-snap-no-desc");
		});

		it("should handle ai-detection trigger", () => {
			const manifest: MCPSnapshotManifest = {
				id: "mcp-ai-snap",
				createdAt: 1704067200000,
				files: [],
				totalSize: 0,
				trigger: "ai-detection",
			};

			const unified = fromMCPManifest(manifest);

			expect(unified.trigger).toBe("ai-detection");
		});

		it("should handle files with only required fields", () => {
			const manifest: MCPSnapshotManifest = {
				id: "mcp-basic",
				createdAt: 1704067200000,
				files: [
					{ path: "src/file.ts", blobId: "hash123", size: 100 },
				],
				totalSize: 100,
			};

			const unified = fromMCPManifest(manifest);

			expect(unified.files).toHaveLength(1);
			expect(unified.files[0].path).toBe("src/file.ts");
			expect(unified.files[0].contentId).toBe("hash123");
		});
	});
});
