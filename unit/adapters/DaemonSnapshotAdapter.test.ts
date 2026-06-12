/**
 * DaemonSnapshotAdapter Unit Tests
 *
 * WU-3.2: Tests for thin-client IStorage adapter that delegates to daemon.
 *
 * Test Coverage:
 * - Connection state handling (connected vs disconnected)
 * - IStorage interface compliance
 * - Snapshot retrieval (get, getAll)
 * - Snapshot mutation (delete, update)
 * - Write blocking (save throws)
 * - Type conversion (daemon → RichSnapshot)
 *
 * @module test/unit/adapters/DaemonSnapshotAdapter
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DaemonSnapshotAdapter } from "../../../src/adapters/DaemonSnapshotAdapter";
import type { DaemonBridge } from "../../../src/services/DaemonBridge";

describe("DaemonSnapshotAdapter", () => {
	const workspacePath = "/test/workspace";
	let mockDaemonBridge: DaemonBridge;
	let adapter: DaemonSnapshotAdapter;

	beforeEach(() => {
		vi.clearAllMocks();

		mockDaemonBridge = {
			isConnected: vi.fn().mockReturnValue(true),
			createSnapshot: vi.fn().mockResolvedValue({
				snapshotId: "snap-new",
				createdAt: new Date().toISOString(),
			}),
			listSnapshots: vi.fn().mockResolvedValue([]),
			deleteSnapshot: vi.fn().mockResolvedValue(undefined),
			protectSnapshot: vi.fn().mockResolvedValue(undefined),
			unprotectSnapshot: vi.fn().mockResolvedValue(undefined),
			renameSnapshot: vi.fn().mockResolvedValue(undefined),
			request: vi.fn().mockResolvedValue(undefined),
		} as unknown as DaemonBridge;

		adapter = new DaemonSnapshotAdapter(mockDaemonBridge, workspacePath);
	});

	afterEach(() => {
		vi.resetAllMocks();
	});

	describe("Connection State Handling", () => {
		it("should return empty array when daemon disconnected (getAll)", async () => {
			vi.mocked(mockDaemonBridge.isConnected).mockReturnValue(false);

			const result = await adapter.getAll();

			expect(result).toEqual([]);
			expect(mockDaemonBridge.listSnapshots).not.toHaveBeenCalled();
		});

		it("should return undefined when daemon disconnected (get)", async () => {
			vi.mocked(mockDaemonBridge.isConnected).mockReturnValue(false);

			const result = await adapter.get("snap-123");

			expect(result).toBeUndefined();
			expect(mockDaemonBridge.request).not.toHaveBeenCalled();
		});

		it("should throw when daemon disconnected (delete)", async () => {
			vi.mocked(mockDaemonBridge.isConnected).mockReturnValue(false);

			await expect(adapter.delete("snap-123")).rejects.toThrow("Not connected to daemon");
		});

		it("should throw when daemon disconnected (update)", async () => {
			vi.mocked(mockDaemonBridge.isConnected).mockReturnValue(false);

			await expect(adapter.update("snap-123", { isProtected: true })).rejects.toThrow("Not connected to daemon");
		});
	});

	describe("save()", () => {
		it("should throw because save is blocked by design", async () => {
			const mockSnapshot = {
				id: "snap-123",
				name: "Test Snapshot",
				timestamp: Date.now(),
				createdAt: Date.now(),
				version: "1.0",
				files: [],
				fileCount: 0,
				totalSize: 0,
				isProtected: false,
				origin: "manual" as const,
			};

			await expect(adapter.save(mockSnapshot)).rejects.toThrow(
				"Direct save not supported via DaemonSnapshotAdapter",
			);
		});
	});

	describe("create()", () => {
		it("should delegate snapshot creation to daemon bridge", async () => {
			const files = [
				{ path: "src/index.ts", content: "console.log('test');", action: "modify" as const },
			];

			const result = await adapter.create(files, { description: "Test snapshot" });

			expect(mockDaemonBridge.createSnapshot).toHaveBeenCalledWith(
				workspacePath,
				["src/index.ts"],
				{ reason: "Test snapshot", trigger: "manual" },
			);
			expect(result.id).toBe("snap-new");
		});

		it("should throw when daemon disconnected", async () => {
			vi.mocked(mockDaemonBridge.isConnected).mockReturnValue(false);

			const files = [{ path: "src/test.ts", content: "code", action: "add" as const }];

			await expect(adapter.create(files)).rejects.toThrow("Not connected to daemon");
		});

		it("should throw when files array is empty", async () => {
			await expect(adapter.create([])).rejects.toThrow("Cannot create snapshot with empty file list");
		});

		it("should map origin to correct trigger type", async () => {
			const files = [{ path: "src/test.ts", content: "code", action: "add" as const }];

			await adapter.create(files, { origin: "ai-detected" });

			expect(mockDaemonBridge.createSnapshot).toHaveBeenCalledWith(
				workspacePath,
				["src/test.ts"],
				expect.objectContaining({ trigger: "ai_assist" }),
			);
		});
	});

	describe("getAll()", () => {
		it("should fetch and convert snapshots from daemon", async () => {
			const daemonSnapshots = [
				{
					snapshotId: "snap-1",
					createdAt: "2024-01-15T10:00:00Z",
					files: ["src/index.ts", "src/app.ts"],
					name: "Manual Snapshot",
					isProtected: true,
					trigger: "manual",
				},
				{
					snapshotId: "snap-2",
					createdAt: "2024-01-14T09:00:00Z",
					files: ["src/utils.ts"],
					trigger: "auto",
				},
			];

			vi.mocked(mockDaemonBridge.listSnapshots).mockResolvedValue(daemonSnapshots);

			const result = await adapter.getAll();

			expect(mockDaemonBridge.listSnapshots).toHaveBeenCalledWith(workspacePath);
			expect(result).toHaveLength(2);

			// First snapshot (snap-1) should be first (sorted by timestamp descending)
			expect(result[0].id).toBe("snap-1");
			expect(result[0].name).toBe("Manual Snapshot");
			expect(result[0].isProtected).toBe(true);
			expect(result[0].origin).toBe("manual");
			expect(result[0].fileCount).toBe(2);

			// Second snapshot (snap-2)
			expect(result[1].id).toBe("snap-2");
			expect(result[1].origin).toBe("auto");
			expect(result[1].isProtected).toBe(false);
		});

		it("should handle daemon error gracefully", async () => {
			vi.mocked(mockDaemonBridge.listSnapshots).mockRejectedValue(new Error("Daemon unavailable"));

			const result = await adapter.getAll();

			expect(result).toEqual([]);
		});

		it("should sort snapshots by timestamp descending", async () => {
			const daemonSnapshots = [
				{ snapshotId: "snap-old", createdAt: "2024-01-01T00:00:00Z", files: [] },
				{ snapshotId: "snap-new", createdAt: "2024-01-15T00:00:00Z", files: [] },
				{ snapshotId: "snap-mid", createdAt: "2024-01-08T00:00:00Z", files: [] },
			];

			vi.mocked(mockDaemonBridge.listSnapshots).mockResolvedValue(daemonSnapshots);

			const result = await adapter.getAll();

			expect(result[0].id).toBe("snap-new");
			expect(result[1].id).toBe("snap-mid");
			expect(result[2].id).toBe("snap-old");
		});
	});

	describe("get()", () => {
		it("should fetch single snapshot via direct request", async () => {
			const daemonSnapshot = {
				snapshotId: "snap-123",
				createdAt: "2024-01-15T10:00:00Z",
				files: [
					{ path: "src/index.ts", content: "console.log('test');", hash: "abc123", size: 25 },
				],
				name: "Test Snapshot",
				isProtected: false,
				trigger: "manual",
			};

			vi.mocked(mockDaemonBridge.request).mockResolvedValue({ snapshot: daemonSnapshot });

			const result = await adapter.get("snap-123");

			expect(mockDaemonBridge.request).toHaveBeenCalledWith("snapshot.get", {
				workspace: workspacePath,
				snapshotId: "snap-123",
			});
			expect(result).toBeDefined();
			expect(result?.id).toBe("snap-123");
			expect(result?.name).toBe("Test Snapshot");
			expect(result?.files[0].content).toBe("console.log('test');");
		});

		it("should fallback to getAll + filter when snapshot.get not implemented", async () => {
			vi.mocked(mockDaemonBridge.request).mockRejectedValue(new Error("Method not found"));
			vi.mocked(mockDaemonBridge.listSnapshots).mockResolvedValue([
				{ snapshotId: "snap-123", createdAt: "2024-01-15T10:00:00Z", files: ["test.ts"] },
				{ snapshotId: "snap-456", createdAt: "2024-01-14T10:00:00Z", files: ["other.ts"] },
			]);

			const result = await adapter.get("snap-123");

			expect(result?.id).toBe("snap-123");
		});

		it("should return undefined when snapshot not found", async () => {
			vi.mocked(mockDaemonBridge.request).mockResolvedValue({ snapshot: undefined });

			const result = await adapter.get("non-existent");

			expect(result).toBeUndefined();
		});
	});

	describe("delete()", () => {
		it("should delegate delete to daemon bridge", async () => {
			await adapter.delete("snap-123");

			expect(mockDaemonBridge.deleteSnapshot).toHaveBeenCalledWith(workspacePath, "snap-123");
		});
	});

	describe("update()", () => {
		it("should call protectSnapshot when isProtected is true", async () => {
			await adapter.update("snap-123", { isProtected: true });

			expect(mockDaemonBridge.protectSnapshot).toHaveBeenCalledWith(workspacePath, "snap-123");
			expect(mockDaemonBridge.unprotectSnapshot).not.toHaveBeenCalled();
		});

		it("should call unprotectSnapshot when isProtected is false", async () => {
			await adapter.update("snap-123", { isProtected: false });

			expect(mockDaemonBridge.unprotectSnapshot).toHaveBeenCalledWith(workspacePath, "snap-123");
			expect(mockDaemonBridge.protectSnapshot).not.toHaveBeenCalled();
		});

		it("should call renameSnapshot when name is provided", async () => {
			await adapter.update("snap-123", { name: "New Name" });

			expect(mockDaemonBridge.renameSnapshot).toHaveBeenCalledWith(workspacePath, "snap-123", "New Name");
		});

		it("should handle combined updates", async () => {
			await adapter.update("snap-123", { isProtected: true, name: "Protected Snapshot" });

			expect(mockDaemonBridge.protectSnapshot).toHaveBeenCalledWith(workspacePath, "snap-123");
			expect(mockDaemonBridge.renameSnapshot).toHaveBeenCalledWith(workspacePath, "snap-123", "Protected Snapshot");
		});

		it("should ignore icon/iconColor updates (client-side only)", async () => {
			// This should not throw - these are silently ignored
			await adapter.update("snap-123", { icon: "star", iconColor: "gold" } as any);

			// No daemon calls for these properties
			expect(mockDaemonBridge.protectSnapshot).not.toHaveBeenCalled();
			expect(mockDaemonBridge.renameSnapshot).not.toHaveBeenCalled();
		});
	});

	describe("Trigger to Origin Mapping", () => {
		const triggerMappings: Array<{ trigger: string; expectedOrigin: string }> = [
			{ trigger: "manual", expectedOrigin: "manual" },
			{ trigger: "auto", expectedOrigin: "auto" },
			{ trigger: "pre-save", expectedOrigin: "pre-save" },
			{ trigger: "ai-detection", expectedOrigin: "ai-detected" },
			{ trigger: "ai_assist", expectedOrigin: "ai-detected" },
			{ trigger: "scheduled", expectedOrigin: "scheduled" },
			{ trigger: "pre-restore", expectedOrigin: "pre-restore" },
			{ trigger: "recovery", expectedOrigin: "recovery" },
			{ trigger: "mcp", expectedOrigin: "manual" }, // default fallback
			{ trigger: "session_end", expectedOrigin: "manual" }, // default fallback
			{ trigger: "unknown", expectedOrigin: "manual" }, // default fallback
		];

		it.each(triggerMappings)("should map trigger '$trigger' to origin '$expectedOrigin'", async ({ trigger, expectedOrigin }) => {
			vi.mocked(mockDaemonBridge.listSnapshots).mockResolvedValue([
				{ snapshotId: "snap-1", createdAt: "2024-01-15T10:00:00Z", files: [], trigger },
			]);

			const result = await adapter.getAll();

			expect(result[0].origin).toBe(expectedOrigin);
		});
	});

	describe("IStorage Interface Compliance", () => {
		it("should implement all required IStorage methods", () => {
			// Verify the adapter implements the interface contract
			expect(typeof adapter.create).toBe("function");
			expect(typeof adapter.save).toBe("function");
			expect(typeof adapter.get).toBe("function");
			expect(typeof adapter.getAll).toBe("function");
			expect(typeof adapter.delete).toBe("function");
			expect(typeof adapter.update).toBe("function");
		});
	});
});
