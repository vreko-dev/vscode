import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationManager } from "../../src/notificationManager";
import { OperationCoordinator } from "../../src/operationCoordinator";
import { WorkspaceMemoryManager } from "../../src/workspaceMemory";

// vscode mock provided by setup.ts
,
	},
	workspace: {
		workspaceFolders: [{ uri: { fsPath: "/test/workspace" } }],
	},
}));

describe("OperationCoordinator - List Checkpoints", () => {
	let coordinator: OperationCoordinator;
	let workspaceMemory: WorkspaceMemoryManager;
	let notificationManager: NotificationManager;
	let mockStorage: any;

	beforeEach(() => {
		notificationManager = new NotificationManager();
		mockStorage = {
			list: vi.fn(),
			retrieve: vi.fn(),
		};
		// @ts-expect-error - Mocking the storage dependency
		workspaceMemory = new WorkspaceMemoryManager(null);
		coordinator = new OperationCoordinator(
			workspaceMemory,
			notificationManager,
			mockStorage,
		);

		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("listCheckpoints", () => {
		it("should return checkpoints with fileContents", async () => {
			const mockCheckpoints = [
				{
					id: "cp-1",
					timestamp: 1000,
					meta: {
						trigger: "Manual checkpoint",
						content: "Manual checkpoint content",
					},
					files: ["src/file1.ts", "src/file2.ts"],
					fileContents: {
						"src/file1.ts": "content1",
						"src/file2.ts": "content2",
					},
				},
				{
					id: "cp-2",
					timestamp: 2000,
					meta: {
						trigger: "Auto-save checkpoint",
						content: "Auto-save content",
					},
					files: ["src/file3.ts"],
					fileContents: {
						"src/file3.ts": "content3",
					},
				},
			];

			mockStorage.list.mockResolvedValue(mockCheckpoints);

			const result = await coordinator.listCheckpoints();

			expect(result).toHaveLength(2);
			expect(result[0]).toEqual({
				id: "cp-1",
				name: "Manual checkpoint",
				timestamp: 1000,
				fileContents: {
					"src/file1.ts": "content1",
					"src/file2.ts": "content2",
				},
			});
			expect(result[1]).toEqual({
				id: "cp-2",
				name: "Auto-save checkpoint",
				timestamp: 2000,
				fileContents: {
					"src/file3.ts": "content3",
				},
			});
		});

		it("should handle checkpoints without meta data", async () => {
			const mockCheckpoints = [
				{
					id: "cp-1",
					timestamp: 1000,
					// No meta property
					files: ["src/file.ts"],
					fileContents: {
						"src/file.ts": "content",
					},
				},
			];

			mockStorage.list.mockResolvedValue(mockCheckpoints);

			const result = await coordinator.listCheckpoints();

			expect(result).toHaveLength(1);
			expect(result[0].name).toContain("Checkpoint"); // Should use default name
			expect(result[0].fileContents).toEqual({
				"src/file.ts": "content",
			});
		});

		it("should handle empty checkpoint list", async () => {
			mockStorage.list.mockResolvedValue([]);

			const result = await coordinator.listCheckpoints();

			expect(result).toEqual([]);
		});

		it("should handle storage errors gracefully", async () => {
			mockStorage.list.mockRejectedValue(
				new Error("Database connection failed"),
			);

			const result = await coordinator.listCheckpoints();

			expect(result).toEqual([]);
			// Should not throw, just return empty array
		});

		it("should use content from meta when trigger is not available", async () => {
			const mockCheckpoints = [
				{
					id: "cp-1",
					timestamp: 1000,
					meta: {
						content: "Incremental auto-save checkpoint",
						// No trigger property
					},
					files: ["src/file.ts"],
					fileContents: {
						"src/file.ts": "content",
					},
				},
			];

			mockStorage.list.mockResolvedValue(mockCheckpoints);

			const result = await coordinator.listCheckpoints();

			expect(result[0].name).toBe("Incremental auto-save checkpoint");
		});

		it("should use default name when no name information is available", async () => {
			const mockCheckpoints = [
				{
					id: "cp-1",
					timestamp: Date.now(),
					meta: {},
					files: ["src/file.ts"],
					fileContents: {
						"src/file.ts": "content",
					},
				},
			];

			mockStorage.list.mockResolvedValue(mockCheckpoints);

			const result = await coordinator.listCheckpoints();

			expect(result[0].name).toContain("Checkpoint");
			expect(result[0].name).toContain(":");
		});

		it("should return empty fileContents when not available", async () => {
			const mockCheckpoints = [
				{
					id: "cp-1",
					timestamp: 1000,
					meta: {
						trigger: "Test checkpoint",
					},
					files: ["src/file.ts"],
					// No fileContents property
				},
			];

			mockStorage.list.mockResolvedValue(mockCheckpoints);

			const result = await coordinator.listCheckpoints();

			expect(result[0].fileContents).toEqual({});
		});
	});
});
