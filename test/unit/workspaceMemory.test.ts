import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileSystemStorage } from "../../src/storage/types.js";
import { WorkspaceMemoryManager } from "../../src/workspaceMemory.js";

// Mock storage by extending FileSystemStorage
class MockFileSystemStorage extends FileSystemStorage {
	constructor() {
		super("/test");
	}

	create = vi.fn();
	retrieve = vi.fn();
	list = vi.fn();
	restore = vi.fn();
}

const mockStorage = new MockFileSystemStorage();

describe("WorkspaceMemoryManager", () => {
	let workspaceMemory: WorkspaceMemoryManager;

	beforeEach(() => {
		workspaceMemory = new WorkspaceMemoryManager(mockStorage);
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("constructor", () => {
		it("should create workspace memory manager with default context", () => {
			const manager = new WorkspaceMemoryManager(mockStorage);
			const context = manager.getContext();

			expect(context).toEqual({
				lastActiveFile: null,
				recentFiles: [],
				activeBranch: null,
				lastCheckpoint: null,
				protectionStatus: "protected",
				recentActions: [],
			});
		});
	});

	describe("updateLastActiveFile", () => {
		it("should update last active file", () => {
			workspaceMemory.updateLastActiveFile("/test/file.ts");

			const context = workspaceMemory.getContext();
			expect(context.lastActiveFile).toBe("/test/file.ts");
		});

		it("should add file to recent files", () => {
			workspaceMemory.updateLastActiveFile("/test/file1.ts");
			workspaceMemory.updateLastActiveFile("/test/file2.ts");

			const context = workspaceMemory.getContext();
			expect(context.recentFiles).toEqual(["/test/file2.ts", "/test/file1.ts"]);
		});

		it("should limit recent files to 10 items", () => {
			// Add 15 files
			for (let i = 0; i < 15; i++) {
				workspaceMemory.updateLastActiveFile(`/test/file${i}.ts`);
			}

			const context = workspaceMemory.getContext();
			expect(context.recentFiles).toHaveLength(10);
			expect(context.recentFiles[0]).toBe("/test/file14.ts"); // Most recent first
		});

		it("should move existing file to front of recent files", () => {
			workspaceMemory.updateLastActiveFile("/test/file1.ts");
			workspaceMemory.updateLastActiveFile("/test/file2.ts");
			workspaceMemory.updateLastActiveFile("/test/file1.ts"); // Reopen file1

			const context = workspaceMemory.getContext();
			expect(context.recentFiles).toEqual(["/test/file1.ts", "/test/file2.ts"]);
		});

		it("should add file opened action to recent actions", () => {
			const before = Date.now();
			workspaceMemory.updateLastActiveFile("/test/file.ts");
			const after = Date.now();

			const context = workspaceMemory.getContext();
			expect(context.recentActions).toHaveLength(1);
			expect(context.recentActions[0].action).toBe("file_opened");
			expect(context.recentActions[0].timestamp).toBeGreaterThanOrEqual(before);
			expect(context.recentActions[0].timestamp).toBeLessThanOrEqual(after);
		});
	});

	describe("updateActiveBranch", () => {
		it("should update active branch", () => {
			workspaceMemory.updateActiveBranch("main");

			const context = workspaceMemory.getContext();
			expect(context.activeBranch).toBe("main");
		});

		it("should add branch changed action to recent actions", () => {
			workspaceMemory.updateActiveBranch("feature-branch");

			const context = workspaceMemory.getContext();
			expect(context.recentActions).toHaveLength(1);
			expect(context.recentActions[0].action).toBe("branch_changed");
		});
	});

	describe("updateLastSnapshot", () => {
		it("should update last snapshot", () => {
			workspaceMemory.updateLastSnapshot("cp-123");

			const context = workspaceMemory.getContext();
			expect(context.lastSnapshot).toBe("cp-123");
		});

		it("should add checkpoint created action to recent actions", () => {
			workspaceMemory.updateLastSnapshot("cp-456");

			const context = workspaceMemory.getContext();
			expect(context.recentActions).toHaveLength(1);
			expect(context.recentActions[0].action).toBe("checkpoint_created");
		});
	});

	describe("updateProtectionStatus", () => {
		it("should update protection status to protected", () => {
			workspaceMemory.updateProtectionStatus("protected");

			const context = workspaceMemory.getContext();
			expect(context.protectionStatus).toBe("protected");
		});

		it("should update protection status to atRisk", () => {
			workspaceMemory.updateProtectionStatus("atRisk");

			const context = workspaceMemory.getContext();
			expect(context.protectionStatus).toBe("atRisk");
		});

		it("should update protection status to unprotected", () => {
			workspaceMemory.updateProtectionStatus("unprotected");

			const context = workspaceMemory.getContext();
			expect(context.protectionStatus).toBe("unprotected");
		});

		it("should update protection status to analyzing", () => {
			workspaceMemory.updateProtectionStatus("analyzing");

			const context = workspaceMemory.getContext();
			expect(context.protectionStatus).toBe("analyzing");
		});

		it("should add status changed action to recent actions", () => {
			workspaceMemory.updateProtectionStatus("atRisk");

			const context = workspaceMemory.getContext();
			expect(context.recentActions).toHaveLength(1);
			expect(context.recentActions[0].action).toBe("status_changed");
		});
	});

	describe("addAction", () => {
		it("should add action to recent actions", () => {
			// @ts-expect-error - accessing private method for testing
			workspaceMemory.addAction("test_action");

			const context = workspaceMemory.getContext();
			expect(context.recentActions).toHaveLength(1);
			expect(context.recentActions[0].action).toBe("test_action");
		});

		it("should limit recent actions to 50 items", () => {
			// Add 55 actions
			for (let i = 0; i < 55; i++) {
				// @ts-expect-error - accessing private method for testing
				workspaceMemory.addAction(`action${i}`);
			}

			const context = workspaceMemory.getContext();
			expect(context.recentActions).toHaveLength(50);
			expect(context.recentActions[0].action).toBe("action54"); // Most recent first
		});

		it("should timestamp actions correctly", () => {
			const before = Date.now();
			// @ts-expect-error - accessing private method for testing
			workspaceMemory.addAction("timed_action");
			const after = Date.now();

			const context = workspaceMemory.getContext();
			expect(context.recentActions[0].timestamp).toBeGreaterThanOrEqual(before);
			expect(context.recentActions[0].timestamp).toBeLessThanOrEqual(after);
		});
	});

	describe("getContext", () => {
		it("should return current workspace context", () => {
			workspaceMemory.updateLastActiveFile("/test/file.ts");
			workspaceMemory.updateActiveBranch("main");
			workspaceMemory.updateLastSnapshot("cp-789");
			workspaceMemory.updateProtectionStatus("protected");

			const context = workspaceMemory.getContext();

			expect(context).toEqual({
				lastActiveFile: "/test/file.ts",
				recentFiles: ["/test/file.ts"],
				activeBranch: "main",
				lastCheckpoint: "cp-789",
				protectionStatus: "protected",
				recentActions: [
					{ action: "status_changed", timestamp: expect.any(Number) },
					{
						action: "checkpoint_created",
						timestamp: expect.any(Number),
					},
					{ action: "branch_changed", timestamp: expect.any(Number) },
					{ action: "file_opened", timestamp: expect.any(Number) },
				],
			});
		});

		it("should return a copy of the context", () => {
			const context1 = workspaceMemory.getContext();
			workspaceMemory.updateLastActiveFile("/test/file.ts");
			const context2 = workspaceMemory.getContext();

			expect(context1.lastActiveFile).toBeNull();
			expect(context2.lastActiveFile).toBe("/test/file.ts");
		});
	});

	describe("getLastSnapshotId", () => {
		it("should return null when no snapshot exists", () => {
			const checkpointId = workspaceMemory.getLastSnapshotId();
			expect(checkpointId).toBeNull();
		});

		it("should return snapshot ID when snapshot exists", () => {
			workspaceMemory.updateLastSnapshot("cp-123");
			const checkpointId = workspaceMemory.getLastSnapshotId();
			expect(checkpointId).toBe("cp-123");
		});
	});

	describe("saveContext", () => {
		it("should save context to storage", async () => {
			const consoleSpy = vi.spyOn(console, "log");

			await workspaceMemory.saveContext();

			expect(consoleSpy).toHaveBeenCalledWith(
				"Saving workspace context:",
				expect.any(Object),
			);
		});
	});

	describe("loadContext", () => {
		it("should load context from storage", async () => {
			const consoleSpy = vi.spyOn(console, "log");

			await workspaceMemory.loadContext();

			expect(consoleSpy).toHaveBeenCalledWith("Loading workspace context");
		});
	});

	describe("edge cases", () => {
		it("should handle files with special characters", () => {
			workspaceMemory.updateLastActiveFile(
				"/test/file with spaces & special@chars.ts",
			);

			const context = workspaceMemory.getContext();
			expect(context.lastActiveFile).toBe(
				"/test/file with spaces & special@chars.ts",
			);
		});

		it("should handle unicode file paths", () => {
			workspaceMemory.updateLastActiveFile("/test/файл.ts");

			const context = workspaceMemory.getContext();
			expect(context.lastActiveFile).toBe("/test/файл.ts");
		});

		it("should handle very long file paths", () => {
			const longPath = `/test/${"a".repeat(1000)}/file.ts`;
			workspaceMemory.updateLastActiveFile(longPath);

			const context = workspaceMemory.getContext();
			expect(context.lastActiveFile).toBe(longPath);
		});

		it("should handle empty branch names", () => {
			workspaceMemory.updateActiveBranch("");

			const context = workspaceMemory.getContext();
			expect(context.activeBranch).toBe("");
		});

		it("should handle empty checkpoint IDs", () => {
			workspaceMemory.updateLastSnapshot("");

			const context = workspaceMemory.getContext();
			expect(context.lastSnapshot).toBe("");
		});

		it("should handle concurrent updates", () => {
			// Update multiple properties rapidly
			workspaceMemory.updateLastActiveFile("/test/file1.ts");
			workspaceMemory.updateActiveBranch("main");
			workspaceMemory.updateLastSnapshot("cp-1");
			workspaceMemory.updateProtectionStatus("protected");

			const context = workspaceMemory.getContext();
			expect(context.lastActiveFile).toBe("/test/file1.ts");
			expect(context.activeBranch).toBe("main");
			expect(context.lastSnapshot).toBe("cp-1");
			expect(context.protectionStatus).toBe("protected");
			expect(context.recentActions).toHaveLength(4);
		});
	});
});
