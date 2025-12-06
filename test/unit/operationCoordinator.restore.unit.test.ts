import * as assert from "node:assert";
import type { SnapshotRestoreResult } from "@snapback/contracts";
import { vi } from "vitest";
import { OperationCoordinator } from "../../src/operationCoordinator";

describe("OperationCoordinator - Restore Functionality", () => {
	let coordinator: OperationCoordinator;
	let storage: any;
	let workspaceMemory: any;
	let notificationManager: any;
	let conflictResolver: any;

	beforeEach(() => {
		// Create mock instances with vitest
		storage = {
			retrieve: vi.fn(),
			restore: vi.fn(),
			create: vi.fn(),
			list: vi.fn(),
		};

		workspaceMemory = {
			getContext: vi.fn(),
			updateLastCheckpoint: vi.fn(),
			updateLastActiveFile: vi.fn(),
			updateActiveBranch: vi.fn(),
			updateProtectionStatus: vi.fn(),
			saveContext: vi.fn(),
			loadContext: vi.fn(),
		};

		notificationManager = {
			showNotification: vi.fn(),
			showEnhancedRiskDetected: vi.fn(),
			showEnhancedCheckpointCreated: vi.fn(),
			showEnhancedAiActivity: vi.fn(),
			showEnhancedSecurityAlert: vi.fn(),
			showEnhancedLargeChange: vi.fn(),
			showEnhancedFailureRecovery: vi.fn(),
			showEnhancedSystemStatus: vi.fn(),
			showCheckpointCreated: vi.fn(),
			showRiskDetected: vi.fn(),
			getRecentNotifications: vi.fn(),
			clearNotifications: vi.fn(),
			dismissNotification: vi.fn(),
			createDismissalRule: vi.fn(),
		};

		conflictResolver = {
			resolveConflicts: vi.fn(),
		};

		// Mock VS Code workspace
		// @ts-expect-error
		global.vscode = {
			workspace: {
				workspaceFolders: [{ uri: { fsPath: "/test/workspace" } }],
			},
			window: {
				showErrorMessage: vi.fn(),
			},
		};

		coordinator = new OperationCoordinator(
			workspaceMemory as any,
			notificationManager as any,
			storage as any,
			conflictResolver as any,
		);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		// @ts-expect-error
		delete global.vscode;
	});

	describe("restoreToSnapshot()", () => {
		it("should successfully restore a checkpoint without conflicts", async () => {
			// Arrange
			const checkpointId = "checkpoint-123";
			const mockCheckpoint = {
				id: checkpointId,
				timestamp: Date.now(),
				meta: {},
			};

			const mockSnapshotRestoreResult: SnapshotRestoreResult = {
				success: true,
				restoredFiles: ["file1.ts", "file2.ts"],
				errors: [],
			};

			storage.retrieve.mockResolvedValue(mockCheckpoint);
			storage.restore.mockResolvedValue(mockSnapshotRestoreResult);

			// Act
			const result = await coordinator.restoreToSnapshot(checkpointId);

			// Assert
			assert.strictEqual(result, true);
			assert.strictEqual(storage.retrieve.mock.calls.length, 1);
			assert.strictEqual(storage.restore.mock.calls.length, 2); // One dry run, one actual restore
			assert.strictEqual(storage.restore.mock.calls[0][0], checkpointId);
		});

		it("should return false when checkpoint not found", async () => {
			// Arrange
			storage.retrieve.mockResolvedValue(null);

			// Act
			const result = await coordinator.restoreToSnapshot("nonexistent");

			// Assert
			assert.strictEqual(result, false);
			assert.strictEqual(storage.restore.mock.calls.length, 0);
		});

		it("should handle conflicts and prompt for resolution", async () => {
			// Arrange
			const checkpointId = "checkpoint-456";
			const mockCheckpoint = {
				id: checkpointId,
				timestamp: Date.now(),
				meta: {},
			};

			// First call (dry run) returns conflicts
			const mockDryRunResult: SnapshotRestoreResult = {
				success: true,
				restoredFiles: [],
				errors: [],
			};

			// Second call (actual restore) returns success
			const mockSnapshotRestoreResult: SnapshotRestoreResult = {
				success: true,
				restoredFiles: ["file1.ts"],
				errors: [],
			};

			storage.retrieve.mockResolvedValue(mockCheckpoint);
			storage.restore.mockResolvedValueOnce(mockDryRunResult);
			storage.restore.mockResolvedValueOnce(mockSnapshotRestoreResult);

			// Mock conflict resolver to resolve conflicts
			conflictResolver.resolveConflicts.mockResolvedValue([
				{
					file: "conflicted.ts",
					resolution: "use_checkpoint",
				},
			]);

			// Act
			const result = await coordinator.restoreToSnapshot(checkpointId);

			// Assert
			assert.strictEqual(result, true);
			// Should have attempted conflict resolution
		});

		it("should create backup before restore when backupCurrent is true", async () => {
			// Arrange
			const checkpointId = "checkpoint-789";
			const mockCheckpoint = {
				id: checkpointId,
				timestamp: Date.now(),
				meta: {},
			};

			const mockSnapshotRestoreResult: SnapshotRestoreResult = {
				success: true,
				restoredFiles: ["file1.ts"],
				errors: [],
			};

			storage.retrieve.mockResolvedValue(mockCheckpoint);
			storage.restore.mockResolvedValue(mockSnapshotRestoreResult);

			// Act
			await coordinator.restoreToSnapshot(checkpointId, {
				backupCurrent: true,
			});

			// Assert
			assert.strictEqual(storage.restore.mock.calls.length, 2); // One dry run, one actual restore
			const restoreCall = storage.restore.mock.calls[1][2];
			assert.strictEqual(restoreCall?.backupCurrent, true);
		});

		it("should perform dry run when requested", async () => {
			// Arrange
			const checkpointId = "checkpoint-dry";
			const mockCheckpoint = {
				id: checkpointId,
				timestamp: Date.now(),
				meta: {},
			};

			const mockSnapshotRestoreResult: SnapshotRestoreResult = {
				success: true,
				restoredFiles: [],
				errors: [],
			};

			storage.retrieve.mockResolvedValue(mockCheckpoint);
			storage.restore.mockResolvedValue(mockSnapshotRestoreResult);

			// Act
			const result = await coordinator.restoreToSnapshot(checkpointId, {
				dryRun: true,
			});

			// Assert
			assert.strictEqual(result, true);
			assert.strictEqual(storage.restore.mock.calls.length, 1); // Only one call when dryRun is explicitly requested
			const restoreCall = storage.restore.mock.calls[0][2];
			assert.strictEqual(restoreCall?.dryRun, true);
		});

		it("should handle restore errors gracefully", async () => {
			// Arrange
			const checkpointId = "checkpoint-error";
			storage.retrieve.mockResolvedValue({
				id: checkpointId,
				timestamp: Date.now(),
				meta: {},
			});
			storage.restore.mockRejectedValue(new Error("Disk full"));

			// Act
			const result = await coordinator.restoreToSnapshot(checkpointId);

			// Assert
			assert.strictEqual(result, false);
		});

		it("should track operation lifecycle", async () => {
			// Arrange
			const checkpointId = "checkpoint-track";
			const mockCheckpoint = {
				id: checkpointId,
				timestamp: Date.now(),
				meta: {},
			};

			const mockSnapshotRestoreResult: SnapshotRestoreResult = {
				success: true,
				restoredFiles: ["file1.ts"],
				errors: [],
			};

			storage.retrieve.mockResolvedValue(mockCheckpoint);
			storage.restore.mockResolvedValue(mockSnapshotRestoreResult);

			// Spy on operation tracking
			const startSpy = vi.spyOn(coordinator, "startOperation");
			const updateStatusSpy = vi.spyOn(coordinator, "updateOperationStatus");

			// Act
			await coordinator.restoreToSnapshot(checkpointId);

			// Assert
			assert.strictEqual(startSpy.mock.calls.length, 1);
			// Check that updateOperationStatus was called with 'completed'
			assert.strictEqual(
				updateStatusSpy.mock.calls.some(
					(call) => typeof call[0] === "string" && call[1] === "completed",
				),
				true,
			);
		});

		it("should restore only specified files when provided", async () => {
			// Arrange
			const checkpointId = "checkpoint-selective";
			const mockCheckpoint = {
				id: checkpointId,
				timestamp: Date.now(),
				meta: {},
			};

			const mockSnapshotRestoreResult: SnapshotRestoreResult = {
				success: true,
				restoredFiles: ["src/specific.ts"],
				errors: [],
			};

			storage.retrieve.mockResolvedValue(mockCheckpoint);
			storage.restore.mockResolvedValue(mockSnapshotRestoreResult);

			// Act
			await coordinator.restoreToSnapshot(checkpointId, {
				files: ["src/specific.ts"],
			});

			// Assert
			assert.strictEqual(storage.restore.mock.calls.length, 2); // One dry run, one actual restore
			const restoreCall = storage.restore.mock.calls[1][2];
			assert.deepStrictEqual(restoreCall?.files, ["src/specific.ts"]);
		});
	});
});
