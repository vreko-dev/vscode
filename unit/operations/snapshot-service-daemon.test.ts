/**
 * SnapshotService Daemon Delegation Tests
 *
 * WU-3.2: Tests for thin-client snapshot operations via daemon delegation.
 *
 * Test Coverage:
 * - listSnapshots() daemon-first with fallback
 * - isDaemonAvailable() connection checking
 * - Error handling and graceful degradation
 * - Type conversion from daemon response
 *
 * @module test/unit/operations/snapshot-service-daemon
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock vscode before importing the service
vi.mock("vscode", () => ({
	workspace: {
		workspaceFolders: [{ uri: { fsPath: "/test/workspace" } }],
		getConfiguration: vi.fn().mockReturnValue({
			get: vi.fn().mockReturnValue(undefined),
		}),
	},
	window: {
		showInformationMessage: vi.fn(),
	},
	Uri: {
		file: (path: string) => ({ fsPath: path }),
	},
}));

import type { DaemonBridge } from "../../../src/services/DaemonBridge";
import type { IStorageManager } from "../../../src/storage/types";
import type { NotificationManager } from "../../../src/notificationManager";
import type { WorkspaceMemoryManager } from "../../../src/workspaceMemory";
import type { SessionCoordinator } from "../../../src/snapshot/SessionCoordinator";
import { SnapshotService } from "../../../src/operations/snapshot-service";

describe("SnapshotService - Daemon Delegation", () => {
	const workspacePath = "/test/workspace";
	let mockStorage: IStorageManager;
	let mockWorkspaceMemory: WorkspaceMemoryManager;
	let mockNotificationManager: NotificationManager;
	let mockSessionCoordinator: SessionCoordinator;
	let mockDaemonBridge: DaemonBridge;

	beforeEach(() => {
		vi.clearAllMocks();

		// Create mock storage manager
		mockStorage = {
			listSnapshots: vi.fn().mockResolvedValue([
				{
					id: "local-snap-1",
					name: "Local Snapshot",
					timestamp: Date.now(),
					files: { "src/test.ts": "content" },
					anchorFile: "src/test.ts",
				},
			]),
			getSnapshot: vi.fn().mockResolvedValue(null),
			createSnapshot: vi.fn().mockResolvedValue({ id: "new-snap", timestamp: Date.now() }),
		} as unknown as IStorageManager;

		// Create mock workspace memory
		mockWorkspaceMemory = {
			updateLastSnapshot: vi.fn(),
			saveContext: vi.fn().mockResolvedValue(undefined),
		} as unknown as WorkspaceMemoryManager;

		// Create mock notification manager
		mockNotificationManager = {
			showEnhancedSnapshotCreated: vi.fn().mockResolvedValue(undefined),
		} as unknown as NotificationManager;

		// Create mock session coordinator
		mockSessionCoordinator = {
			addCandidate: vi.fn(),
		} as unknown as SessionCoordinator;

		// Create mock daemon bridge
		mockDaemonBridge = {
			isConnected: vi.fn().mockReturnValue(true),
			listSnapshots: vi.fn().mockResolvedValue([
				{
					snapshotId: "daemon-snap-1",
					createdAt: "2024-01-15T10:00:00Z",
					files: ["src/index.ts", "src/app.ts"],
					name: "Daemon Snapshot",
				},
				{
					snapshotId: "daemon-snap-2",
					createdAt: "2024-01-14T09:00:00Z",
					files: ["src/utils.ts"],
				},
			]),
			createSnapshot: vi.fn().mockResolvedValue({
				snapshotId: "daemon-new-snap",
				createdAt: new Date().toISOString(),
			}),
		} as unknown as DaemonBridge;
	});

	afterEach(() => {
		vi.resetAllMocks();
	});

	describe("listSnapshots()", () => {
		describe("when daemon is connected", () => {
			it("should use daemon-first and return converted snapshots", async () => {
				const service = new SnapshotService(
					mockStorage,
					mockWorkspaceMemory,
					mockNotificationManager,
					mockSessionCoordinator,
					undefined, // eventBus
					mockDaemonBridge,
				);

				const result = await service.listSnapshots();

				// Should call daemon, not local storage
				expect(mockDaemonBridge.listSnapshots).toHaveBeenCalledWith(workspacePath);
				expect(mockStorage.listSnapshots).not.toHaveBeenCalled();

				// Should return converted snapshots
				expect(result).toHaveLength(2);
				expect(result[0].id).toBe("daemon-snap-1");
				expect(result[0].name).toContain("Snapshot");
				expect(result[0].fileCount).toBe(2);
				expect(result[0].anchorFile).toBe("src/index.ts");

				expect(result[1].id).toBe("daemon-snap-2");
				expect(result[1].fileCount).toBe(1);
			});

			it("should correctly convert daemon timestamps", async () => {
				const service = new SnapshotService(
					mockStorage,
					mockWorkspaceMemory,
					mockNotificationManager,
					mockSessionCoordinator,
					undefined,
					mockDaemonBridge,
				);

				const result = await service.listSnapshots();

				// Timestamp should be a number (milliseconds since epoch)
				expect(typeof result[0].timestamp).toBe("number");
				expect(result[0].timestamp).toBe(new Date("2024-01-15T10:00:00Z").getTime());
			});
		});

		describe("when daemon fails", () => {
			it("should fallback to local storage on daemon error", async () => {
				vi.mocked(mockDaemonBridge.listSnapshots).mockRejectedValue(new Error("Daemon unavailable"));

				const service = new SnapshotService(
					mockStorage,
					mockWorkspaceMemory,
					mockNotificationManager,
					mockSessionCoordinator,
					undefined,
					mockDaemonBridge,
				);

				const result = await service.listSnapshots();

				// Should have tried daemon first
				expect(mockDaemonBridge.listSnapshots).toHaveBeenCalled();

				// Should fallback to local storage
				expect(mockStorage.listSnapshots).toHaveBeenCalled();

				// Should return local snapshots
				expect(result).toHaveLength(1);
				expect(result[0].id).toBe("local-snap-1");
			});
		});

		describe("when daemon is disconnected", () => {
			it("should skip daemon and use local storage directly", async () => {
				vi.mocked(mockDaemonBridge.isConnected).mockReturnValue(false);

				const service = new SnapshotService(
					mockStorage,
					mockWorkspaceMemory,
					mockNotificationManager,
					mockSessionCoordinator,
					undefined,
					mockDaemonBridge,
				);

				const result = await service.listSnapshots();

				// Should NOT call daemon (disconnected)
				expect(mockDaemonBridge.listSnapshots).not.toHaveBeenCalled();

				// Should use local storage
				expect(mockStorage.listSnapshots).toHaveBeenCalled();

				// Should return local snapshots
				expect(result).toHaveLength(1);
				expect(result[0].id).toBe("local-snap-1");
			});
		});

		describe("when daemonBridge is undefined", () => {
			it("should use local storage (backward compatibility)", async () => {
				const service = new SnapshotService(
					mockStorage,
					mockWorkspaceMemory,
					mockNotificationManager,
					mockSessionCoordinator,
					undefined,
					undefined, // No daemon bridge
				);

				const result = await service.listSnapshots();

				// Should use local storage
				expect(mockStorage.listSnapshots).toHaveBeenCalled();

				// Should return local snapshots
				expect(result).toHaveLength(1);
				expect(result[0].id).toBe("local-snap-1");
			});
		});
	});

	describe("isDaemonAvailable() (internal)", () => {
		it("should return true when daemon bridge is connected", async () => {
			vi.mocked(mockDaemonBridge.isConnected).mockReturnValue(true);

			const service = new SnapshotService(
				mockStorage,
				mockWorkspaceMemory,
				mockNotificationManager,
				mockSessionCoordinator,
				undefined,
				mockDaemonBridge,
			);

			// Call listSnapshots to trigger daemon check
			await service.listSnapshots();

			// Verify it checked daemon connection
			expect(mockDaemonBridge.isConnected).toHaveBeenCalled();
			// And used daemon for listing
			expect(mockDaemonBridge.listSnapshots).toHaveBeenCalled();
		});

		it("should return false when daemon bridge is disconnected", async () => {
			vi.mocked(mockDaemonBridge.isConnected).mockReturnValue(false);

			const service = new SnapshotService(
				mockStorage,
				mockWorkspaceMemory,
				mockNotificationManager,
				mockSessionCoordinator,
				undefined,
				mockDaemonBridge,
			);

			await service.listSnapshots();

			expect(mockDaemonBridge.isConnected).toHaveBeenCalled();
			// Should NOT have used daemon (disconnected)
			expect(mockDaemonBridge.listSnapshots).not.toHaveBeenCalled();
			// Should have fallen back to local
			expect(mockStorage.listSnapshots).toHaveBeenCalled();
		});

		it("should return false when daemon bridge is undefined", async () => {
			const service = new SnapshotService(
				mockStorage,
				mockWorkspaceMemory,
				mockNotificationManager,
				mockSessionCoordinator,
				undefined,
				undefined, // No daemon
			);

			await service.listSnapshots();

			// Should use local storage directly
			expect(mockStorage.listSnapshots).toHaveBeenCalled();
		});
	});

	describe("getSnapshotWithContent()", () => {
		it("should use local storage (daemon content retrieval not yet implemented)", async () => {
			const mockSnapshot = {
				id: "snap-123",
				name: "Test Snapshot",
				timestamp: Date.now(),
				files: { "src/test.ts": "content" },
				contents: { "src/test.ts": "file content" },
			};

			vi.mocked(mockStorage.getSnapshot as any).mockResolvedValue(mockSnapshot);

			const service = new SnapshotService(
				mockStorage,
				mockWorkspaceMemory,
				mockNotificationManager,
				mockSessionCoordinator,
				undefined,
				mockDaemonBridge,
			);

			const result = await service.getSnapshotWithContent("snap-123");

			// Should use local storage (daemon doesn't expose content retrieval yet)
			expect(mockStorage.getSnapshot).toHaveBeenCalledWith("snap-123");
			expect(result?.id).toBe("snap-123");
			expect(result?.fileContents).toEqual({ "src/test.ts": "file content" });
		});

		it("should return null when snapshot not found", async () => {
			vi.mocked(mockStorage.getSnapshot as any).mockResolvedValue(null);

			const service = new SnapshotService(
				mockStorage,
				mockWorkspaceMemory,
				mockNotificationManager,
				mockSessionCoordinator,
				undefined,
				mockDaemonBridge,
			);

			const result = await service.getSnapshotWithContent("non-existent");

			expect(result).toBeNull();
		});
	});

	describe("Thin-Client Architecture Integration", () => {
		it("should maintain backward compatibility when daemon unavailable", async () => {
			// Simulate daemon becoming unavailable mid-session
			vi.mocked(mockDaemonBridge.isConnected).mockReturnValue(true);

			const service = new SnapshotService(
				mockStorage,
				mockWorkspaceMemory,
				mockNotificationManager,
				mockSessionCoordinator,
				undefined,
				mockDaemonBridge,
			);

			// First call: daemon connected
			let result = await service.listSnapshots();
			expect(result[0].id).toBe("daemon-snap-1");

			// Daemon disconnects
			vi.mocked(mockDaemonBridge.isConnected).mockReturnValue(false);

			// Second call: should fallback to local
			result = await service.listSnapshots();
			expect(result[0].id).toBe("local-snap-1");
		});

		it("should handle rapid connection state changes", async () => {
			const service = new SnapshotService(
				mockStorage,
				mockWorkspaceMemory,
				mockNotificationManager,
				mockSessionCoordinator,
				undefined,
				mockDaemonBridge,
			);

			// Toggle connection state multiple times
			vi.mocked(mockDaemonBridge.isConnected).mockReturnValue(true);
			await service.listSnapshots();
			expect(mockDaemonBridge.listSnapshots).toHaveBeenCalledTimes(1);

			vi.mocked(mockDaemonBridge.isConnected).mockReturnValue(false);
			await service.listSnapshots();
			expect(mockStorage.listSnapshots).toHaveBeenCalledTimes(1);

			vi.mocked(mockDaemonBridge.isConnected).mockReturnValue(true);
			await service.listSnapshots();
			expect(mockDaemonBridge.listSnapshots).toHaveBeenCalledTimes(2);
		});
	});
});
