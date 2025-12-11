import * as vscode from "vscode";
import { describe, it, beforeEach, expect, vi } from "vitest";
import { OperationCoordinator } from "./operationCoordinator";
import { WorkspaceMemoryManager } from "./workspaceMemory";
import { NotificationManager } from "./notificationManager";
import { StorageManager } from "./storage/StorageManager";
import { TelemetryProxy } from "./services/telemetry-proxy";
import { ConflictResolver } from "./conflictResolver";
import { MilestoneService } from "./services/MilestoneService";

// Mocks
vi.mock("vscode");
vi.mock("./workspaceMemory");
vi.mock("./notificationManager");
vi.mock("./storage/StorageManager");
vi.mock("./services/telemetry-proxy");
vi.mock("./conflictResolver");
vi.mock("./services/MilestoneService");

describe("OperationCoordinator", () => {
	let coordinator: OperationCoordinator;
	let mockWorkspaceMemory: WorkspaceMemoryManager;
	let mockNotificationManager: NotificationManager;
	let mockStorage: StorageManager;
	let mockTelemetryProxy: TelemetryProxy;
	let mockConflictResolver: ConflictResolver;
	let mockMilestoneService: MilestoneService;

	beforeEach(() => {
		mockWorkspaceMemory = new WorkspaceMemoryManager({} as any) as any;
		mockNotificationManager = new NotificationManager() as any;
		mockStorage = new StorageManager({ globalStorageUri: { fsPath: "/tmp" } } as any) as any;
		mockTelemetryProxy = new TelemetryProxy({} as any) as any;
		mockConflictResolver = new ConflictResolver();
		mockMilestoneService = new MilestoneService({} as any, mockTelemetryProxy, mockNotificationManager);

		coordinator = new OperationCoordinator(
			mockWorkspaceMemory,
			mockNotificationManager,
			mockStorage,
			mockTelemetryProxy,
			mockConflictResolver,
			mockMilestoneService,
			{} as any // Mock SessionCoordinator
		);

		// Mock vscode.workspace.workspaceFolders
		(vscode.workspace as any).workspaceFolders = [{ uri: { fsPath: "/test/root" } }];
		// Mock fs.writeFile
		(vscode.workspace.fs.writeFile as any) = vi.fn().mockResolvedValue(undefined);
		// Mock setStatusBarMessage
		(vscode.window.setStatusBarMessage as any) = vi.fn();
	});

	describe("restoreToSnapshot", () => {
		it("should track DISASTER_AVERTED event on full restore", async () => {
			const snapshotId = "snap-123";
			const snapshot = {
				id: snapshotId,
				contents: {
					"file1.ts": "content1",
					"file2.ts": "content2",
				},
			};

			(mockStorage.getSnapshot as any).mockResolvedValue(snapshot);

			await coordinator.restoreToSnapshot(snapshotId);

			expect(mockTelemetryProxy.trackEvent).toHaveBeenCalledWith(
				"value:disaster_averted",
				expect.objectContaining({
					files_restored: 2,
					recovery_type: "full_snapshot",
					severity: "high",
				})
			);
		});

		it("should track DISASTER_AVERTED event on partial restore", async () => {
			const snapshotId = "snap-123";
			const snapshot = {
				id: snapshotId,
				contents: {
					"file1.ts": "content1",
					"file2.ts": "content2",
				},
			};

			(mockStorage.getSnapshot as any).mockResolvedValue(snapshot);

			await coordinator.restoreToSnapshot(snapshotId, { files: ["file1.ts"] });

			expect(mockTelemetryProxy.trackEvent).toHaveBeenCalledWith(
				"value:disaster_averted",
				expect.objectContaining({
					files_restored: 1,
					recovery_type: "single_file",
					severity: "medium",
				})
			);
		});

		it("should not track event if dry run", async () => {
			const snapshotId = "snap-123";
			const snapshot = {
				id: snapshotId,
				contents: { "file1.ts": "content1" },
			};
            // Mock file read for dry run comparison
            (global as any).readFile = vi.fn().mockResolvedValue("different content");

			(mockStorage.getSnapshot as any).mockResolvedValue(snapshot);

			await coordinator.restoreToSnapshot(snapshotId, { dryRun: true });

			expect(mockTelemetryProxy.trackEvent).not.toHaveBeenCalled();
		});

		it("should handle restore failure gracefully", async () => {
			const snapshotId = "snap-123";
			(mockStorage.getSnapshot as any).mockRejectedValue(new Error("Storage error"));

			const result = await coordinator.restoreToSnapshot(snapshotId);

			expect(result).toBe(false);
			expect(mockTelemetryProxy.trackEvent).not.toHaveBeenCalled();
		});
	});
});
