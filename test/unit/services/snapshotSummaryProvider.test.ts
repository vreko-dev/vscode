import type { Snapshot, SnapshotStorage } from "@snapback/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { StorageSnapshotSummaryProvider } from "../../../src/services/snapshotSummaryProvider";

// Mock VS Code API
vi.mock("vscode", () => {
	return {
		default: {},
		workspace: {
			workspaceFolders: [
				{
					uri: {
						fsPath: "/test/workspace",
					},
				},
			],
		},
	};
});

// Mock the storage implementation
const mockStorage: SnapshotStorage = {
	create: vi.fn(),
	retrieve: vi.fn(),
	list: vi.fn(),
	restore: vi.fn(),
};

describe("StorageSnapshotSummaryProvider", () => {
	let provider: StorageSnapshotSummaryProvider;

	beforeEach(() => {
		vi.clearAllMocks();
		// @ts-expect-error - we're mocking the storage
		provider = new StorageSnapshotSummaryProvider(mockStorage);
	});

	describe("listRecent", () => {
		it("should return empty array when no checkpoints exist", async () => {
			mockStorage.list = vi.fn().mockResolvedValue([]);

			const result = await provider.listRecent(10);
			expect(result).toEqual([]);
		});

		it("should return recent checkpoints sorted by timestamp", async () => {
			const checkpoints: Snapshot[] = [
				{
					id: "cp_123",
					timestamp: 1000,
					meta: {
						name: "First Snapshot",
						description: "First description",
						files: ["/file1.txt", "/file2.txt"],
					},
				},
				{
					id: "cp_456",
					timestamp: 2000,
					meta: {
						name: "Second Snapshot",
						description: "Second description",
						files: ["/file3.txt"],
					},
				},
				{
					id: "cp_789",
					timestamp: 1500,
					meta: {
						name: "Third Snapshot",
						description: "Third description",
						files: [],
					},
				},
			];

			mockStorage.list = vi.fn().mockResolvedValue(checkpoints);

			const result = await provider.listRecent(10);

			expect(result).toHaveLength(3);
			// Should be sorted by timestamp (newest first)
			expect(result[0].id).toBe("cp_456");
			expect(result[1].id).toBe("cp_789");
			expect(result[2].id).toBe("cp_123");

			// Check summary structure
			expect(result[0]).toEqual({
				id: "cp_456",
				label: "Second Snapshot",
				createdAt: 2000,
				description: "Second description",
				filesChanged: 1,
				branch: undefined,
			});
		});

		it("should limit the number of returned checkpoints", async () => {
			const checkpoints: Snapshot[] = Array.from({ length: 10 }, (_, i) => ({
				id: `cp_${i}`,
				timestamp: i * 1000,
				meta: {
					name: `Snapshot ${i}`,
					description: `Description ${i}`,
					files: [`/file${i}.txt`],
				},
			}));

			mockStorage.list = vi.fn().mockResolvedValue(checkpoints);

			const result = await provider.listRecent(5);

			expect(result).toHaveLength(5);
			// Should return the 5 most recent
			expect(result[0].id).toBe("cp_9");
			expect(result[4].id).toBe("cp_5");
		});

		it("should generate label from timestamp when name is missing", async () => {
			const checkpoints: Snapshot[] = [
				{
					id: "cp_123",
					timestamp: new Date("2023-01-01T12:00:00Z").getTime(),
					meta: {
						description: "Test description",
						// name is missing
					},
				},
			];

			mockStorage.list = vi.fn().mockResolvedValue(checkpoints);

			const result = await provider.listRecent(10);

			expect(result[0].label).toContain("Snapshot");
			expect(result[0].label).toContain("1/1/2023");
		});

		it("should handle checkpoints with missing metadata", async () => {
			const checkpoints: Snapshot[] = [
				{
					id: "cp_123",
					timestamp: 1000,
					// meta is missing
				},
			];

			mockStorage.list = vi.fn().mockResolvedValue(checkpoints);

			const result = await provider.listRecent(10);

			expect(result[0].label).toContain("Snapshot");
			expect(result[0].description).toBeUndefined();
			expect(result[0].filesChanged).toBeUndefined();
		});
	});

	describe("total", () => {
		it("should return zero when no checkpoints exist", async () => {
			mockStorage.list = vi.fn().mockResolvedValue([]);

			const result = await provider.total();
			expect(result).toBe(0);
		});

		it("should return correct count when checkpoints exist", async () => {
			const checkpoints: Snapshot[] = Array.from({ length: 7 }, (_, i) => ({
				id: `cp_${i}`,
				timestamp: i * 1000,
			}));

			mockStorage.list = vi.fn().mockResolvedValue(checkpoints);

			const result = await provider.total();
			expect(result).toBe(7);
		});

		it("should handle storage errors gracefully", async () => {
			mockStorage.list = vi.fn().mockRejectedValue(new Error("Storage error"));

			const result = await provider.total();
			expect(result).toBe(0);
		});
	});

	describe("forFile", () => {
		it("should return empty array when no checkpoints exist", async () => {
			mockStorage.list = vi.fn().mockResolvedValue([]);

			const result = await provider.forFile("/test/workspace/file.txt");
			expect(result).toEqual([]);
		});

		it("should return checkpoints for a specific file", async () => {
			const checkpoints: Snapshot[] = [
				{
					id: "cp_123",
					timestamp: 1000,
					meta: {
						name: "Snapshot with file",
						files: ["/file.txt"],
					},
				},
				{
					id: "cp_456",
					timestamp: 2000,
					meta: {
						name: "Snapshot without files list",
						// files is missing
					},
				},
				{
					id: "cp_789",
					timestamp: 1500,
					meta: {
						name: "Snapshot with different file",
						files: ["/other.txt"],
					},
				},
			];

			mockStorage.list = vi.fn().mockResolvedValue(checkpoints);

			const result = await provider.forFile("/test/workspace/file.txt");

			// Should return checkpoints that either:
			// 1. Don't have a files list (match all files)
			// 2. Have the specific file in their files list
			expect(result).toHaveLength(2);
			expect(result[0].id).toBe("cp_456"); // No files list - matches all
			expect(result[1].id).toBe("cp_123"); // Has the file
		});

		it("should handle file path normalization", async () => {
			const checkpoints: Snapshot[] = [
				{
					id: "cp_123",
					timestamp: 1000,
					meta: {
						name: "Test Snapshot",
						files: ["file.txt"], // Relative path
					},
				},
			];

			mockStorage.list = vi.fn().mockResolvedValue(checkpoints);

			// Test with absolute path
			const result = await provider.forFile("/test/workspace/file.txt");

			expect(result).toHaveLength(1);
			expect(result[0].id).toBe("cp_123");
		});

		it("should handle checkpoints with empty files array", async () => {
			const checkpoints: Snapshot[] = [
				{
					id: "cp_123",
					timestamp: 1000,
					meta: {
						name: "Test Snapshot",
						files: [], // Empty files array
					},
				},
			];

			mockStorage.list = vi.fn().mockResolvedValue(checkpoints);

			const result = await provider.forFile("/test/workspace/file.txt");

			// Empty files array should match (like no files list)
			expect(result).toHaveLength(1);
		});
	});

	describe("error handling", () => {
		it("should handle storage errors in listRecent gracefully", async () => {
			mockStorage.list = vi.fn().mockRejectedValue(new Error("Storage error"));

			const result = await provider.listRecent(10);
			expect(result).toEqual([]);
		});

		it("should handle storage errors in forFile gracefully", async () => {
			mockStorage.list = vi.fn().mockRejectedValue(new Error("Storage error"));

			const result = await provider.forFile("/test/workspace/file.txt");
			expect(result).toEqual([]);
		});
	});

	describe("edge cases", () => {
		it("should handle checkpoints with invalid metadata", async () => {
			const checkpoints: Snapshot[] = [
				{
					id: "cp_123",
					timestamp: 1000,
					meta: {
						name: 123, // Invalid type
						description: null, // Invalid type
						files: "not-an-array", // Invalid type
					},
				},
			];

			mockStorage.list = vi.fn().mockResolvedValue(checkpoints);

			const result = await provider.listRecent(10);

			// Should handle invalid metadata gracefully
			expect(result[0].label).toContain("Snapshot");
			expect(result[0].description).toBeUndefined();
			expect(result[0].filesChanged).toBeUndefined();
		});

		it("should handle workspace without folders", async () => {
			// Mock workspace without folders
			// @ts-expect-error
			vscode.workspace.workspaceFolders = undefined;

			const checkpoints: Snapshot[] = [
				{
					id: "cp_123",
					timestamp: 1000,
					meta: {
						name: "Test Snapshot",
						files: ["/absolute/path/file.txt"],
					},
				},
			];

			mockStorage.list = vi.fn().mockResolvedValue(checkpoints);

			const result = await provider.forFile("/absolute/path/file.txt");

			expect(result).toHaveLength(1);
		});

		it("should handle very large number of checkpoints", async () => {
			const checkpoints: Snapshot[] = Array.from({ length: 1000 }, (_, i) => ({
				id: `cp_${i}`,
				timestamp: i,
				meta: {
					name: `Snapshot ${i}`,
					files: [`/file${i % 10}.txt`],
				},
			}));

			mockStorage.list = vi.fn().mockResolvedValue(checkpoints);

			const result = await provider.listRecent(10);

			expect(result).toHaveLength(10);
			// Should return the 10 most recent
			expect(result[0].id).toBe("cp_999");
		});
	});
});
