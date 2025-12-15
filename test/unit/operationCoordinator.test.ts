import { beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { NotificationManager } from "../../src/notificationManager";
import { OperationCoordinator } from "../../src/operationCoordinator";
import { WorkspaceMemoryManager } from "../../src/workspaceMemory";

// vscode mock provided by setup.ts

describe("OperationCoordinator", () => {
	let coordinator: OperationCoordinator;
	let workspaceMemory: WorkspaceMemoryManager;
	let notificationManager: NotificationManager;
	let mockStorage: any;

	beforeEach(() => {
		notificationManager = new NotificationManager();
		// @ts-expect-error - Mocking the storage dependency passed to WorkspaceMemoryManager
		workspaceMemory = new WorkspaceMemoryManager({} as any);
		mockStorage = {
			list: vi.fn().mockResolvedValue([
				{
					id: "checkpoint-1",
					meta: { trigger: "Manual checkpoint" },
					timestamp: Date.now(),
					fileContents: {},
				},
				{
					id: "checkpoint-2",
					meta: { trigger: "Auto checkpoint" },
					timestamp: Date.now(),
					fileContents: {},
				},
			]),
			retrieve: vi.fn().mockResolvedValue({
				id: "test-checkpoint-id",
				timestamp: Date.now(),
				fileContents: { "src/test.ts": "test content" },
				meta: { trigger: "Manual checkpoint" },
			}),
			restore: vi.fn().mockResolvedValue({ success: true, conflicts: [] }),
		};
		coordinator = new OperationCoordinator(
			workspaceMemory,
			notificationManager,
			mockStorage as any,
		);

		// Clear all mocks before each test
		vi.clearAllMocks();
	});

	it("should create instance", () => {
		expect(coordinator).toBeDefined();
	});

	it("should list checkpoints", async () => {
		const checkpoints = await coordinator.listCheckpoints();

		expect(checkpoints).toBeDefined();
		expect(Array.isArray(checkpoints)).toBe(true);
		expect(checkpoints.length).toBeGreaterThan(0);

		// Check that each checkpoint has the required properties
		checkpoints.forEach((cp) => {
			expect(cp).toHaveProperty("id");
			expect(cp).toHaveProperty("name");
			expect(cp).toHaveProperty("timestamp");
		});
	});

	it("should restore to checkpoint successfully", async () => {
		// @ts-expect-error - Mocking VS Code workspace.fs
		vscode.workspace.fs.readFile = vi
			.fn()
			.mockResolvedValueOnce(Buffer.from("test content")) // For conflict detection
			.mockResolvedValueOnce(Buffer.from("test content")); // For verification
		// @ts-expect-error - Mocking VS Code workspace.fs
		vscode.workspace.fs.writeFile = vi.fn().mockResolvedValue(undefined);

		const result = await coordinator.restoreToCheckpoint("test-checkpoint-id");

		expect(result).toBe(true);
		expect(mockStorage.restore).toHaveBeenCalledTimes(2);
		expect(mockStorage.restore).toHaveBeenCalledWith(
			"test-checkpoint-id",
			"/test/workspace",
			expect.objectContaining({ dryRun: true }),
		);
	});

	it("should handle restoration errors gracefully", async () => {
		mockStorage.retrieve.mockResolvedValue(null);

		const result = await coordinator.restoreToCheckpoint(
			"invalid-checkpoint-id",
		);

		expect(result).toBe(false);
		expect(mockStorage.restore).not.toHaveBeenCalled();
	});
});
