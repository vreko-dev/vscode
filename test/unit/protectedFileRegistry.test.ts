/**
 * @fileoverview Protected File Registry Unit Tests
 *
 * Tests for the ProtectedFileRegistry service, focusing on:
 * - Add/remove file operations
 * - Storage persistence (write to disk)
 * - Protection level management
 * - Event firing for UI updates
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProtectedFileRegistry } from "@/services/protectedFileRegistry";
import { waitForEvent } from "../helpers/eventHelpers";

describe("ProtectedFileRegistry", () => {
	let registry: ProtectedFileRegistry;
	let mockStorage: Map<string, any>;
	let mockState: any;

	beforeEach(() => {
		mockStorage = new Map();
		mockState = {
			get: (key: string, defaultValue?: any) => {
				return mockStorage.get(key) ?? defaultValue;
			},
			update: async (key: string, value: any) => {
				mockStorage.set(key, value);
			},
		};

		registry = new ProtectedFileRegistry(mockState);
	});

	afterEach(() => {
		registry?.dispose();
		vi.clearAllMocks();
	});

	describe("Add File", () => {
		it("should add file to registry with default watch level", async () => {
			const filePath = "/test/workspace/file.ts";

			await registry.add(filePath);

			const files = await registry.list();
			expect(files.length).toBe(1);
			expect(files[0].path).toContain("file.ts");
			expect(files[0].protectionLevel).toBe("watch");
		});

		it("should add file with specific protection level", async () => {
			const filePath = "/test/workspace/important.ts";

			await registry.add(filePath, { protectionLevel: "block" });

			const files = await registry.list();
			expect(files.length).toBe(1);
			expect(files[0].protectionLevel).toBe("block");
		});

		it("should write to storage when file is added", async () => {
			const filePath = "/test/workspace/file.ts";

			await registry.add(filePath);

			// Verify storage was updated
			const stored = mockStorage.get("snapback:protected-files");
			expect(stored).toBeDefined();
			expect(Array.isArray(stored)).toBe(true);
			expect(stored.length).toBe(1);
			expect(stored[0].path).toBeDefined();
		});

		it("should fire onProtectionChanged event when file is added", async () => {
			const filePath = "/test/workspace/file.ts";

			const payload = await waitForEvent(registry.onProtectionChanged, () =>
				registry.add(filePath),
			);

			expect(Array.isArray(payload)).toBe(true);
			expect(payload[0]?.fsPath ?? "").toContain("file.ts");
		});
	});

	describe("Remove File (Unprotect)", () => {
		/**
		 * CRITICAL TEST: Verify unprotect actually writes changes back to storage
		 * REGRESSION BUG #3: Unprotect must remove from .snapbackprotected file
		 */
		it("should remove file from storage when unprotected", async () => {
			const filePath = "/test/workspace/protected.ts";

			// Add file first
			await registry.add(filePath, { protectionLevel: "block" });

			// Verify it's in storage
			let stored = mockStorage.get("snapback:protected-files");
			expect(stored).toBeDefined();
			expect(stored.length).toBe(1);

			// Remove file (unprotect)
			await registry.remove(filePath);

			// CRITICAL ASSERTION: Verify removed from storage
			stored = mockStorage.get("snapback:protected-files");
			expect(stored).toBeDefined();
			expect(stored.length).toBe(0);
		});

		it("should fire onProtectionChanged event when file is removed", async () => {
			const filePath = "/test/workspace/file.ts";
			await registry.add(filePath);

			let _eventFired = false;
			registry.onProtectionChanged(() => {
				_eventFired = true;
			});

			const payload = await waitForEvent(registry.onProtectionChanged, () =>
				registry.remove(filePath),
			);

			expect(Array.isArray(payload)).toBe(true);
			expect(payload[0]?.fsPath ?? "").toContain("file.ts");
		});

		it("should handle removing non-existent file gracefully", async () => {
			const filePath = "/test/workspace/nonexistent.ts";

			// Should not throw
			await expect(registry.remove(filePath)).resolves.not.toThrow();

			const files = await registry.list();
			expect(files.length).toBe(0);
		});

		it("should remove correct file when multiple files are protected", async () => {
			const file1 = "/test/workspace/file1.ts";
			const file2 = "/test/workspace/file2.ts";
			const file3 = "/test/workspace/file3.ts";

			// Add multiple files
			await registry.add(file1);
			await registry.add(file2);
			await registry.add(file3);

			let files = await registry.list();
			expect(files.length).toBe(3);

			// Remove middle file
			await registry.remove(file2);

			// Verify only file2 was removed
			files = await registry.list();
			expect(files.length).toBe(2);

			const paths = files.map((f) => f.path);
			expect(paths.some((p) => p.includes("file1.ts"))).toBe(true);
			expect(paths.some((p) => p.includes("file2.ts"))).toBe(false);
			expect(paths.some((p) => p.includes("file3.ts"))).toBe(true);

			// Verify storage reflects the change
			const stored = mockStorage.get("snapback:protected-files");
			expect(stored.length).toBe(2);
		});
	});

	describe("Update Protection Level", () => {
		it("should update protection level for existing file", async () => {
			const filePath = "/test/workspace/file.ts";

			// Add with watch level
			await registry.add(filePath, { protectionLevel: "watch" });

			let files = await registry.list();
			expect(files[0].protectionLevel).toBe("watch");

			// Update to block level
			await registry.updateProtectionLevel(filePath, "block");

			files = await registry.list();
			expect(files[0].protectionLevel).toBe("block");
		});

		it("should write updated level to storage", async () => {
			const filePath = "/test/workspace/file.ts";

			await registry.add(filePath, { protectionLevel: "watch" });
			await registry.updateProtectionLevel(filePath, "warn");

			const stored = mockStorage.get("snapback:protected-files");
			expect(stored[0].protectionLevel).toBe("warn");
		});

		it("should throw error when updating non-existent file", async () => {
			const filePath = "/test/workspace/nonexistent.ts";

			await expect(
				registry.updateProtectionLevel(filePath, "block"),
			).rejects.toThrow("File not protected");
		});
	});

	describe("Query Operations", () => {
		it("isProtected should return true for protected files", async () => {
			const filePath = "/test/workspace/protected.ts";

			expect(registry.isProtected(filePath)).toBe(false);

			await registry.add(filePath);

			expect(registry.isProtected(filePath)).toBe(true);
		});

		it("isProtected should return false after file is removed", async () => {
			const filePath = "/test/workspace/file.ts";

			await registry.add(filePath);
			expect(registry.isProtected(filePath)).toBe(true);

			await registry.remove(filePath);
			expect(registry.isProtected(filePath)).toBe(false);
		});

		it("getProtectionLevel should return correct level", async () => {
			const filePath = "/test/workspace/file.ts";

			expect(registry.getProtectionLevel(filePath)).toBeUndefined();

			await registry.add(filePath, { protectionLevel: "block" });

			expect(registry.getProtectionLevel(filePath)).toBe("block");
		});

		it("total should return count of protected files", async () => {
			expect(await registry.total()).toBe(0);

			await registry.add("/test/file1.ts");
			expect(await registry.total()).toBe(1);

			await registry.add("/test/file2.ts");
			expect(await registry.total()).toBe(2);

			await registry.remove("/test/file1.ts");
			expect(await registry.total()).toBe(1);
		});
	});

	describe("Mark Checkpoint", () => {
		it("should update last checkpoint ID for files", async () => {
			const filePath = "/test/workspace/file.ts";
			const checkpointId = "checkpoint-123";

			await registry.add(filePath);
			await registry.markCheckpoint(checkpointId, [filePath]);

			const files = await registry.list();
			expect(files[0].lastCheckpointId).toBe(checkpointId);
		});

		it("should update lastProtectedAt timestamp", async () => {
			const filePath = "/test/workspace/file.ts";
			const checkpointId = "checkpoint-123";

			await registry.add(filePath);
			const files1 = await registry.list();
			const initialTimestamp = files1[0].lastProtectedAt;

			// Wait a bit
			await new Promise((resolve) => setTimeout(resolve, 10));

			await registry.markCheckpoint(checkpointId, [filePath]);

			const files2 = await registry.list();
			const updatedTimestamp = files2[0].lastProtectedAt;

			expect(updatedTimestamp).toBeGreaterThan(initialTimestamp!);
		});

		it("should handle marking checkpoint for multiple files", async () => {
			const file1 = "/test/file1.ts";
			const file2 = "/test/file2.ts";
			const checkpointId = "checkpoint-456";

			await registry.add(file1);
			await registry.add(file2);

			await registry.markCheckpoint(checkpointId, [file1, file2]);

			const files = await registry.list();
			expect(files[0].lastCheckpointId).toBe(checkpointId);
			expect(files[1].lastCheckpointId).toBe(checkpointId);
		});
	});

	describe("Clear All", () => {
		it("should remove all protected files", async () => {
			await registry.add("/test/file1.ts");
			await registry.add("/test/file2.ts");
			await registry.add("/test/file3.ts");

			expect(await registry.total()).toBe(3);

			await registry.clearAll();

			expect(await registry.total()).toBe(0);
		});

		it("should clear storage when clearing all files", async () => {
			await registry.add("/test/file1.ts");
			await registry.add("/test/file2.ts");

			await registry.clearAll();

			const stored = mockStorage.get("snapback:protected-files");
			expect(stored).toEqual([]);
		});

		it("should reset protected index after clearing all files", async () => {
			const filePath = "/test/file-index.ts";
			await registry.add(filePath);
			expect(registry.isProtected(filePath)).toBe(true);

			await waitForEvent(registry.onProtectionChanged, () =>
				registry.clearAll(),
			);

			expect(registry.isProtected(filePath)).toBe(false);
			expect(await registry.total()).toBe(0);
		});
	});
});
