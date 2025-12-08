import type { Checkpoint as StorageCheckpoint } from "@snapback/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CheckpointStorageAdapter } from "@vscode/checkpoint/CheckpointStorageAdapter";

// Mock the storage implementation
const mockStorage: CheckpointStorage = {
	create: vi.fn(),
	retrieve: vi.fn(),
	list: vi.fn(),
	restore: vi.fn(),
};

describe("CheckpointStorageAdapter", () => {
	let adapter: CheckpointStorageAdapter;

	beforeEach(() => {
		vi.clearAllMocks();
		// @ts-expect-error - we're mocking the storage
		adapter = new CheckpointStorageAdapter(mockStorage);
	});

	describe("get", () => {
		it("should return undefined when checkpoint does not exist", async () => {
			mockStorage.retrieve = vi.fn().mockResolvedValue(undefined);

			const result = await adapter.get("nonexistent");
			expect(result).toBeUndefined();
		});

		it("should return enriched checkpoint when checkpoint exists", async () => {
			const rawCheckpoint: StorageCheckpoint = {
				id: "cp_123",
				timestamp: Date.now(),
				files: ["/path/to/file1.txt", "/path/to/file2.txt"],
				meta: {
					name: "Test Checkpoint",
					isProtected: true,
				},
			};

			mockStorage.retrieve = vi.fn().mockResolvedValue(rawCheckpoint);

			const result = await adapter.get("cp_123");

			expect(result).toEqual({
				id: "cp_123",
				name: "Test Checkpoint",
				timestamp: rawCheckpoint.timestamp,
				files: ["/path/to/file1.txt", "/path/to/file2.txt"],
				fileStates: [
					{ path: "/path/to/file1.txt", content: "", hash: "" },
					{ path: "/path/to/file2.txt", content: "", hash: "" },
				],
				isProtected: true,
				icon: "$(lock)",
				iconColor: "terminal.ansiYellow",
			});
		});

		it("should generate name from ID when meta.name is missing", async () => {
			const rawCheckpoint: StorageCheckpoint = {
				id: "cp_123",
				timestamp: Date.now(),
				files: [],
				meta: {},
			};

			mockStorage.retrieve = vi.fn().mockResolvedValue(rawCheckpoint);

			const result = await adapter.get("cp_123");

			expect(result?.name).toBe("Checkpoint 123");
		});

		it("should default to false when isProtected is missing", async () => {
			const rawCheckpoint: StorageCheckpoint = {
				id: "cp_123",
				timestamp: Date.now(),
				files: [],
				meta: {},
			};

			mockStorage.retrieve = vi.fn().mockResolvedValue(rawCheckpoint);

			const result = await adapter.get("cp_123");

			expect(result?.isProtected).toBe(false);
			expect(result?.icon).toBe("$(archive)");
			expect(result?.iconColor).toBe("terminal.ansiBlue");
		});
	});

	describe("getAll", () => {
		it("should return empty array when no checkpoints exist", async () => {
			mockStorage.list = vi.fn().mockResolvedValue([]);

			const result = await adapter.getAll();
			expect(result).toEqual([]);
		});

		it("should return all enriched checkpoints", async () => {
			const rawCheckpoints: StorageCheckpoint[] = [
				{
					id: "cp_123",
					timestamp: Date.now(),
					files: ["/file1.txt"],
					meta: { name: "Checkpoint 1", isProtected: true },
				},
				{
					id: "cp_456",
					timestamp: Date.now() + 1000,
					files: ["/file2.txt"],
					meta: { name: "Checkpoint 2", isProtected: false },
				},
			];

			mockStorage.list = vi.fn().mockResolvedValue(rawCheckpoints);

			const result = await adapter.getAll();

			expect(result).toHaveLength(2);
			expect(result[0]).toEqual({
				id: "cp_123",
				name: "Checkpoint 1",
				timestamp: rawCheckpoints[0].timestamp,
				files: ["/file1.txt"],
				fileStates: [{ path: "/file1.txt", content: "", hash: "" }],
				isProtected: true,
				icon: "$(lock)",
				iconColor: "terminal.ansiYellow",
			});

			expect(result[1]).toEqual({
				id: "cp_456",
				name: "Checkpoint 2",
				timestamp: rawCheckpoints[1].timestamp,
				files: ["/file2.txt"],
				fileStates: [{ path: "/file2.txt", content: "", hash: "" }],
				isProtected: false,
				icon: "$(archive)",
				iconColor: "terminal.ansiBlue",
			});
		});
	});

	describe("save", () => {
		it("should throw error as direct save is not supported", async () => {
			const checkpoint = {
				id: "cp_123",
				name: "Test",
				timestamp: Date.now(),
				files: [],
				isProtected: false,
				icon: "$(archive)",
				iconColor: "terminal.ansiBlue",
			};

			await expect(adapter.save(checkpoint)).rejects.toThrow(
				"Direct save not supported - use create() instead",
			);
		});
	});

	describe("delete", () => {
		it("should throw error as delete is not implemented", async () => {
			await expect(adapter.delete("cp_123")).rejects.toThrow(
				"Delete not implemented in storage layer",
			);
		});
	});

	describe("update", () => {
		it("should throw error when trying to update (due to save not being supported)", async () => {
			const rawCheckpoint: StorageCheckpoint = {
				id: "cp_123",
				timestamp: Date.now(),
				files: [],
				meta: { name: "Original Name" },
			};

			mockStorage.retrieve = vi.fn().mockResolvedValue(rawCheckpoint);

			await expect(
				adapter.update("cp_123", { name: "Updated Name" }),
			).rejects.toThrow("Direct save not supported - use create() instead");
		});

		it("should not call save when checkpoint does not exist", async () => {
			mockStorage.retrieve = vi.fn().mockResolvedValue(undefined);

			await expect(
				adapter.update("nonexistent", { name: "Updated Name" }),
			).rejects.toThrow("Direct save not supported - use create() instead");
		});
	});

	describe("enrichCheckpointMetadata", () => {
		it("should handle empty files array", async () => {
			const rawCheckpoint: StorageCheckpoint = {
				id: "cp_123",
				timestamp: Date.now(),
				files: [],
				meta: { name: "Empty Checkpoint" },
			};

			mockStorage.retrieve = vi.fn().mockResolvedValue(rawCheckpoint);

			const result = await adapter.get("cp_123");

			expect(result?.files).toEqual([]);
		});

		it("should handle missing meta object", async () => {
			const rawCheckpoint: StorageCheckpoint = {
				id: "cp_123",
				timestamp: Date.now(),
				files: ["/test.txt"],
			};

			mockStorage.retrieve = vi.fn().mockResolvedValue(rawCheckpoint);

			const result = await adapter.get("cp_123");

			expect(result?.name).toBe("Checkpoint 123");
			expect(result?.isProtected).toBe(false);
			expect(result?.files).toEqual(["/test.txt"]);
			expect(result?.fileStates).toEqual([
				{ path: "/test.txt", content: "", hash: "" },
			]);
		});

		it("should handle edge case with special characters in ID", async () => {
			const rawCheckpoint: StorageCheckpoint = {
				id: "cp_special-chars_123",
				timestamp: Date.now(),
				files: [],
				meta: {},
			};

			mockStorage.retrieve = vi.fn().mockResolvedValue(rawCheckpoint);

			const result = await adapter.get("cp_special-chars_123");

			expect(result?.name).toBe("Checkpoint special-chars_123");
		});
	});
});
