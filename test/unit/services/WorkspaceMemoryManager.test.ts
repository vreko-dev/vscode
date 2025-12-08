import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FileSystemStorage } from "@vscode/storage/types";
import { WorkspaceMemoryManager } from "@vscode/workspaceMemory";

describe("WorkspaceMemoryManager", () => {
	let mockStorage: FileSystemStorage;
	let manager: WorkspaceMemoryManager;

	beforeEach(() => {
		mockStorage = createMockStorage();
		manager = new WorkspaceMemoryManager(mockStorage);
	});

	describe("updateLastActiveFile", () => {
		it("should update last active file", () => {
			manager.updateLastActiveFile("/project/src/index.ts");

			const context = manager.getContext();
			expect(context.lastActiveFile).toBe("/project/src/index.ts");
		});

		it("should add file to recent files list", () => {
			manager.updateLastActiveFile("/project/src/index.ts");
			manager.updateLastActiveFile("/project/src/utils.ts");

			const context = manager.getContext();
			expect(context.recentFiles).toEqual([
				"/project/src/utils.ts",
				"/project/src/index.ts",
			]);
		});

		it("should deduplicate recent files", () => {
			manager.updateLastActiveFile("/project/src/index.ts");
			manager.updateLastActiveFile("/project/src/utils.ts");
			manager.updateLastActiveFile("/project/src/index.ts"); // Duplicate

			const context = manager.getContext();
			expect(context.recentFiles).toEqual([
				"/project/src/index.ts",
				"/project/src/utils.ts",
			]);
		});

		it("should limit recent files to 10", () => {
			for (let i = 0; i < 15; i++) {
				manager.updateLastActiveFile(`/project/file${i}.ts`);
			}

			const context = manager.getContext();
			expect(context.recentFiles).toHaveLength(10);
			expect(context.recentFiles[0]).toBe("/project/file14.ts"); // Most recent
		});
	});

	describe("updateActiveBranch", () => {
		it("should update active branch", () => {
			manager.updateActiveBranch("feature/multi-root");

			const context = manager.getContext();
			expect(context.activeBranch).toBe("feature/multi-root");
		});
	});

	describe("updateLastSnapshot", () => {
		it("should update last snapshot ID", () => {
			manager.updateLastSnapshot("snapshot-123");

			expect(manager.getLastSnapshotId()).toBe("snapshot-123");
		});
	});

	describe("updateProtectionStatus", () => {
		it("should update protection status", () => {
			manager.updateProtectionStatus("atRisk");

			const context = manager.getContext();
			expect(context.protectionStatus).toBe("atRisk");
		});

		it("should support all protection statuses", () => {
			const statuses: Array<
				"protected" | "atRisk" | "unprotected" | "analyzing"
			> = ["protected", "atRisk", "unprotected", "analyzing"];

			for (const status of statuses) {
				manager.updateProtectionStatus(status);
				expect(manager.getContext().protectionStatus).toBe(status);
			}
		});
	});

	describe("getContext", () => {
		it("should return a copy of context (not reference)", () => {
			const context1 = manager.getContext();
			const context2 = manager.getContext();

			expect(context1).not.toBe(context2); // Different objects
			expect(context1).toEqual(context2); // But same values
		});
	});

	describe("recent actions tracking", () => {
		it("should track actions when updating state", () => {
			manager.updateLastActiveFile("/file.ts");
			manager.updateActiveBranch("main");
			manager.updateLastSnapshot("snap-1");

			const context = manager.getContext();
			expect(context.recentActions).toHaveLength(3);
			expect(context.recentActions[0].action).toBe("snapshot_created"); // Most recent
			expect(context.recentActions[1].action).toBe("branch_changed");
			expect(context.recentActions[2].action).toBe("file_opened");
		});

		it("should limit recent actions to 50", () => {
			for (let i = 0; i < 60; i++) {
				manager.updateLastActiveFile(`/file${i}.ts`);
			}

			const context = manager.getContext();
			expect(context.recentActions).toHaveLength(50);
		});

		it("should include timestamps in actions", () => {
			const before = Date.now();
			manager.updateLastActiveFile("/file.ts");
			const after = Date.now();

			const context = manager.getContext();
			const timestamp = context.recentActions[0].timestamp;

			expect(timestamp).toBeGreaterThanOrEqual(before);
			expect(timestamp).toBeLessThanOrEqual(after);
		});
	});

	describe("persistence", () => {
		it("should have saveContext method", async () => {
			await expect(manager.saveContext()).resolves.not.toThrow();
		});

		it("should have loadContext method", async () => {
			await expect(manager.loadContext()).resolves.not.toThrow();
		});
	});
});

function createMockStorage(): FileSystemStorage {
	return {
		workspaceRoot: "/test/workspace",
		get: vi.fn().mockResolvedValue(null),
		set: vi.fn().mockResolvedValue(undefined),
		delete: vi.fn().mockResolvedValue(undefined),
		list: vi.fn().mockResolvedValue([]),
		exists: vi.fn().mockResolvedValue(false),
		clear: vi.fn().mockResolvedValue(undefined),
	} as any;
}
