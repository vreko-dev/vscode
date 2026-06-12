/**
 * SnapshotBridge Tests
 *
 * Tests for the bridge that merges snapshots from both storage sources.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { SnapshotBridge } from "../../../../src/storage/bridge/SnapshotBridge";
import type { UnifiedSnapshot } from "../../../../src/storage/bridge/UnifiedSnapshot";

describe("SnapshotBridge", () => {
	let bridge: SnapshotBridge;
	let mockExtensionStorage: {
		listSnapshots: ReturnType<typeof vi.fn>;
	};
	let mockMCPReader: {
		list: ReturnType<typeof vi.fn>;
		exists: ReturnType<typeof vi.fn>;
		getBlobContent: ReturnType<typeof vi.fn>;
		getManifest: ReturnType<typeof vi.fn>;
	};

	beforeEach(() => {
		mockExtensionStorage = {
			listSnapshots: vi.fn(),
		};

		mockMCPReader = {
			list: vi.fn(),
			exists: vi.fn(),
			getBlobContent: vi.fn(),
			getManifest: vi.fn(),
		};

		bridge = new SnapshotBridge(
			mockExtensionStorage as any,
			mockMCPReader as any,
		);
	});

	describe("listAll", () => {
		it("should merge snapshots from both sources", async () => {
			const extensionSnapshots: UnifiedSnapshot[] = [
				{
					id: "ext-1",
					timestamp: 1000,
					name: "Ext 1",
					source: "extension",
					files: [],
					totalSize: 0,
				},
			];

			const mcpSnapshots: UnifiedSnapshot[] = [
				{
					id: "mcp-1",
					timestamp: 2000,
					name: "MCP 1",
					source: "mcp",
					files: [],
					totalSize: 0,
				},
			];

			mockExtensionStorage.listSnapshots.mockResolvedValue(extensionSnapshots);
			mockMCPReader.list.mockResolvedValue(mcpSnapshots);

			const all = await bridge.listAll();

			expect(all).toHaveLength(2);
		});

		it("should sort by timestamp descending (newest first)", async () => {
			const extensionSnapshots: UnifiedSnapshot[] = [
				{
					id: "ext-old",
					timestamp: 1000,
					name: "Old",
					source: "extension",
					files: [],
					totalSize: 0,
				},
			];

			const mcpSnapshots: UnifiedSnapshot[] = [
				{
					id: "mcp-new",
					timestamp: 3000,
					name: "New",
					source: "mcp",
					files: [],
					totalSize: 0,
				},
				{
					id: "mcp-mid",
					timestamp: 2000,
					name: "Mid",
					source: "mcp",
					files: [],
					totalSize: 0,
				},
			];

			mockExtensionStorage.listSnapshots.mockResolvedValue(extensionSnapshots);
			mockMCPReader.list.mockResolvedValue(mcpSnapshots);

			const all = await bridge.listAll();

			expect(all[0].id).toBe("mcp-new");
			expect(all[1].id).toBe("mcp-mid");
			expect(all[2].id).toBe("ext-old");
		});

		it("should dedupe by ID (prefer extension source)", async () => {
			const extensionSnapshots: UnifiedSnapshot[] = [
				{
					id: "dupe-id",
					timestamp: 1000,
					name: "From Extension",
					source: "extension",
					files: [],
					totalSize: 100,
				},
			];

			const mcpSnapshots: UnifiedSnapshot[] = [
				{
					id: "dupe-id",
					timestamp: 1000,
					name: "From MCP",
					source: "mcp",
					files: [],
					totalSize: 100,
				},
			];

			mockExtensionStorage.listSnapshots.mockResolvedValue(extensionSnapshots);
			mockMCPReader.list.mockResolvedValue(mcpSnapshots);

			const all = await bridge.listAll();

			expect(all).toHaveLength(1);
			expect(all[0].source).toBe("extension"); // Prefer extension
		});

		it("should handle extension storage failure gracefully", async () => {
			mockExtensionStorage.listSnapshots.mockRejectedValue(
				new Error("DB error"),
			);
			mockMCPReader.list.mockResolvedValue([
				{
					id: "mcp-1",
					timestamp: 1000,
					name: "MCP",
					source: "mcp",
					files: [],
					totalSize: 0,
				},
			]);

			const all = await bridge.listAll();

			expect(all).toHaveLength(1);
			expect(all[0].id).toBe("mcp-1");
		});

		it("should handle MCP reader failure gracefully", async () => {
			mockExtensionStorage.listSnapshots.mockResolvedValue([
				{
					id: "ext-1",
					timestamp: 1000,
					name: "Ext",
					source: "extension",
					files: [],
					totalSize: 0,
				},
			]);
			mockMCPReader.list.mockRejectedValue(new Error("FS error"));

			const all = await bridge.listAll();

			expect(all).toHaveLength(1);
			expect(all[0].id).toBe("ext-1");
		});

		it("should handle both sources failing gracefully", async () => {
			mockExtensionStorage.listSnapshots.mockRejectedValue(
				new Error("DB error"),
			);
			mockMCPReader.list.mockRejectedValue(new Error("FS error"));

			const all = await bridge.listAll();

			expect(all).toEqual([]);
		});
	});

	describe("getById", () => {
		it("should find snapshot by ID from either source", async () => {
			mockExtensionStorage.listSnapshots.mockResolvedValue([]);
			mockMCPReader.list.mockResolvedValue([
				{
					id: "mcp-target",
					timestamp: 1000,
					name: "Target",
					source: "mcp",
					files: [],
					totalSize: 0,
				},
			]);

			const snapshot = await bridge.getById("mcp-target");

			expect(snapshot).not.toBeNull();
			expect(snapshot?.id).toBe("mcp-target");
		});

		it("should return null for non-existent ID", async () => {
			mockExtensionStorage.listSnapshots.mockResolvedValue([]);
			mockMCPReader.list.mockResolvedValue([]);

			const snapshot = await bridge.getById("does-not-exist");

			expect(snapshot).toBeNull();
		});

		it("should find extension snapshot by ID", async () => {
			mockExtensionStorage.listSnapshots.mockResolvedValue([
				{
					id: "ext-target",
					timestamp: 1000,
					name: "Target",
					source: "extension",
					files: [],
					totalSize: 0,
				},
			]);
			mockMCPReader.list.mockResolvedValue([]);

			const snapshot = await bridge.getById("ext-target");

			expect(snapshot).not.toBeNull();
			expect(snapshot?.source).toBe("extension");
		});
	});

	describe("getTodayCount", () => {
		it("should count snapshots from today only", async () => {
			const now = Date.now();
			const today = now - 1000 * 60 * 60; // 1 hour ago
			const yesterday = now - 1000 * 60 * 60 * 25; // 25 hours ago

			mockExtensionStorage.listSnapshots.mockResolvedValue([
				{
					id: "today-1",
					timestamp: today,
					name: "Today",
					source: "extension",
					files: [],
					totalSize: 0,
				},
			]);
			mockMCPReader.list.mockResolvedValue([
				{
					id: "today-2",
					timestamp: today,
					name: "Today MCP",
					source: "mcp",
					files: [],
					totalSize: 0,
				},
				{
					id: "yesterday",
					timestamp: yesterday,
					name: "Yesterday",
					source: "mcp",
					files: [],
					totalSize: 0,
				},
			]);

			const count = await bridge.getTodayCount();

			expect(count).toBe(2);
		});

		it("should return 0 when no snapshots today", async () => {
			const yesterday = Date.now() - 1000 * 60 * 60 * 25;

			mockExtensionStorage.listSnapshots.mockResolvedValue([
				{
					id: "old",
					timestamp: yesterday,
					name: "Old",
					source: "extension",
					files: [],
					totalSize: 0,
				},
			]);
			mockMCPReader.list.mockResolvedValue([]);

			const count = await bridge.getTodayCount();

			expect(count).toBe(0);
		});
	});

	describe("listByTimeRange", () => {
		it("should filter snapshots by time range", async () => {
			const now = Date.now();
			const inRange = now - 1000 * 60 * 60; // 1 hour ago
			const outOfRange = now - 1000 * 60 * 60 * 24 * 7; // 7 days ago

			mockExtensionStorage.listSnapshots.mockResolvedValue([
				{
					id: "in-range",
					timestamp: inRange,
					name: "In Range",
					source: "extension",
					files: [],
					totalSize: 0,
				},
				{
					id: "out-of-range",
					timestamp: outOfRange,
					name: "Out of Range",
					source: "extension",
					files: [],
					totalSize: 0,
				},
			]);
			mockMCPReader.list.mockResolvedValue([]);

			const startMs = now - 1000 * 60 * 60 * 24; // 24 hours ago
			const endMs = now;

			const snapshots = await bridge.listByTimeRange(startMs, endMs);

			expect(snapshots).toHaveLength(1);
			expect(snapshots[0].id).toBe("in-range");
		});
	});

	describe("getSourceCounts", () => {
		it("should return counts by source", async () => {
			mockExtensionStorage.listSnapshots.mockResolvedValue([
				{
					id: "ext-1",
					timestamp: 1000,
					name: "Ext 1",
					source: "extension",
					files: [],
					totalSize: 0,
				},
				{
					id: "ext-2",
					timestamp: 2000,
					name: "Ext 2",
					source: "extension",
					files: [],
					totalSize: 0,
				},
			]);
			mockMCPReader.list.mockResolvedValue([
				{
					id: "mcp-1",
					timestamp: 3000,
					name: "MCP 1",
					source: "mcp",
					files: [],
					totalSize: 0,
				},
			]);

			const counts = await bridge.getSourceCounts();

			expect(counts.extension).toBe(2);
			expect(counts.mcp).toBe(1);
			expect(counts.total).toBe(3);
		});
	});
});
