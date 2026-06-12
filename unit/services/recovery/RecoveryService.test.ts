/**
 * RecoveryService Tests
 *
 * Unit tests for the RecoveryService implementation.
 * Tests snapshot retrieval, filtering, restoration, and event handling.
 *
 * @see apps/vscode/src/services/recovery/RecoveryService.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock vscode
vi.mock("vscode", () => ({
	EventEmitter: class<T> {
		private handlers: Array<(e: T) => void> = [];
		event = (handler: (e: T) => void) => {
			this.handlers.push(handler);
			return { dispose: () => { /* intentionally empty */ } };
		};
		fire(data: T) {
			this.handlers.forEach((h) => h(data));
		}
		dispose() {
			this.handlers = [];
		}
	},
}));

// Mock logger
vi.mock("../../../../src/utils/logger", () => ({
	logger: {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}));

import type { SnapshotManifest, IStorageManager } from "../../../../src/storage/types";
import type { DaemonBridge } from "../../../../src/services/DaemonBridge";
import type { RecoverySnapshot } from "../../../../src/services/recovery/interfaces";
import { RecoveryService } from "../../../../src/services/recovery/RecoveryService";

// =============================================================================
// MOCK FACTORIES
// =============================================================================

/**
 * Create a mock SnapshotManifest for testing
 */
function createMockManifest(overrides: Partial<SnapshotManifest> = {}): SnapshotManifest {
	return {
		id: `snap-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
		version: 1,
		timestamp: Date.now(),
		name: "Test Snapshot",
		anchorFile: "src/test.ts",
		files: {
			"src/test.ts": { hash: "abc123", size: 1024 },
			"src/utils.ts": { hash: "def456", size: 512 },
		},
		trigger: "auto",
		metadata: {
			riskScore: 0.5,
			sessionId: "session-123",
		},
		...overrides,
	};
}

/**
 * Create a mock IStorageManager
 */
function createMockStorageManager(snapshots: SnapshotManifest[] = []): IStorageManager {
	return {
		listSnapshots: vi.fn().mockResolvedValue(snapshots),
		getSnapshot: vi.fn(),
		saveSnapshot: vi.fn(),
		deleteSnapshot: vi.fn(),
		getSnapshotFile: vi.fn(),
		// Add other required methods as needed
	} as unknown as IStorageManager;
}

/**
 * Create a mock DaemonBridge
 */
function createMockDaemonBridge(
	restoreResult: { restored: string[]; skipped: string[] } = { restored: ["test.ts"], skipped: [] },
): DaemonBridge {
	return {
		restoreSnapshot: vi.fn().mockResolvedValue(restoreResult),
		isConnected: vi.fn().mockReturnValue(true),
		// Add other required methods as needed
	} as unknown as DaemonBridge;
}

// =============================================================================
// TESTS
// =============================================================================

describe("services/recovery/RecoveryService", () => {
	let service: RecoveryService;
	let mockStorage: IStorageManager;
	let mockDaemonBridge: DaemonBridge;
	const workspaceRoot = "/test/workspace";

	beforeEach(() => {
		vi.clearAllMocks();
		mockStorage = createMockStorageManager();
		mockDaemonBridge = createMockDaemonBridge();
		service = new RecoveryService(mockStorage, mockDaemonBridge, workspaceRoot);
	});

	afterEach(() => {
		service.dispose();
	});

	// =========================================================================
	// CONSTRUCTOR TESTS
	// =========================================================================

	describe("constructor", () => {
		it("should create instance with all dependencies", () => {
			expect(service).toBeDefined();
			expect(service.onSnapshotCreated).toBeDefined();
		});

		it("should accept undefined daemonBridge for degraded mode", () => {
			const degradedService = new RecoveryService(mockStorage, undefined, workspaceRoot);
			expect(degradedService).toBeDefined();
			degradedService.dispose();
		});
	});

	// =========================================================================
	// getRecent() TESTS
	// =========================================================================

	describe("getRecent()", () => {
		it("should return empty array when no snapshots exist", async () => {
			vi.mocked(mockStorage.listSnapshots).mockResolvedValue([]);

			const result = await service.getRecent(10);

			expect(result).toEqual([]);
			expect(mockStorage.listSnapshots).toHaveBeenCalledWith({ limit: 10 });
		});

		it("should return snapshots sorted by timestamp descending", async () => {
			const oldSnapshot = createMockManifest({ id: "old", timestamp: 1000 });
			const newSnapshot = createMockManifest({ id: "new", timestamp: 2000 });
			vi.mocked(mockStorage.listSnapshots).mockResolvedValue([oldSnapshot, newSnapshot]);

			const result = await service.getRecent(10);

			expect(result).toHaveLength(2);
			expect(result[0].id).toBe("new"); // Most recent first
			expect(result[1].id).toBe("old");
		});

		it("should convert SnapshotManifest to RecoverySnapshot format", async () => {
			const manifest = createMockManifest({
				id: "snap-123",
				timestamp: 1705234567890,
				name: "Test Snapshot",
				anchorFile: "src/index.ts",
				files: {
					"src/index.ts": { hash: "abc", size: 1024 },
					"src/utils.ts": { hash: "def", size: 512 },
				},
				trigger: "manual",
				metadata: {
					riskScore: 0.85,
					sessionId: "session-456",
					aiDetection: { tool: "copilot", confidence: 0.9 },
				},
			});
			vi.mocked(mockStorage.listSnapshots).mockResolvedValue([manifest]);

			const result = await service.getRecent(1);

			expect(result[0]).toEqual({
				id: "snap-123",
				timestamp: 1705234567890,
				name: "Test Snapshot",
				anchorFile: "src/index.ts",
				files: [
					{ path: "src/index.ts", size: 1024 },
					{ path: "src/utils.ts", size: 512 },
				],
				totalSize: 1536,
				trigger: "manual",
				metadata: {
					riskScore: 0.85,
					sessionId: "session-456",
					aiTool: "copilot",
				},
			});
		});

		it("should respect limit parameter", async () => {
			const snapshots = Array.from({ length: 20 }, (_, i) =>
				createMockManifest({ id: `snap-${i}`, timestamp: i * 1000 }),
			);
			vi.mocked(mockStorage.listSnapshots).mockResolvedValue(snapshots);

			await service.getRecent(5);

			expect(mockStorage.listSnapshots).toHaveBeenCalledWith({ limit: 5 });
		});

		it("should return empty array on storage error", async () => {
			vi.mocked(mockStorage.listSnapshots).mockRejectedValue(new Error("Storage error"));

			const result = await service.getRecent(10);

			expect(result).toEqual([]);
		});
	});

	// =========================================================================
	// getAll() TESTS
	// =========================================================================

	describe("getAll()", () => {
		it("should return all snapshots when no filter provided", async () => {
			const snapshots = [createMockManifest({ id: "1" }), createMockManifest({ id: "2" })];
			vi.mocked(mockStorage.listSnapshots).mockResolvedValue(snapshots);

			const result = await service.getAll();

			expect(result).toHaveLength(2);
			expect(mockStorage.listSnapshots).toHaveBeenCalledWith({
				limit: 100,
				after: undefined,
				before: undefined,
			});
		});

		it("should apply time range filters", async () => {
			vi.mocked(mockStorage.listSnapshots).mockResolvedValue([]);

			await service.getAll({
				after: 1000,
				before: 2000,
			});

			expect(mockStorage.listSnapshots).toHaveBeenCalledWith({
				limit: 100,
				after: 1000,
				before: 2000,
			});
		});

		it("should apply limit filter", async () => {
			vi.mocked(mockStorage.listSnapshots).mockResolvedValue([]);

			await service.getAll({ limit: 50 });

			expect(mockStorage.listSnapshots).toHaveBeenCalledWith({
				limit: 50,
				after: undefined,
				before: undefined,
			});
		});

		it("should filter by trigger type - manual", async () => {
			const manualSnapshot = createMockManifest({ id: "manual", trigger: "manual" });
			const autoSnapshot = createMockManifest({ id: "auto", trigger: "auto" });
			vi.mocked(mockStorage.listSnapshots).mockResolvedValue([manualSnapshot, autoSnapshot]);

			const result = await service.getAll({ trigger: "manual" });

			expect(result).toHaveLength(1);
			expect(result[0].id).toBe("manual");
		});

		it("should filter by trigger type - auto (includes pre-save)", async () => {
			const autoSnapshot = createMockManifest({ id: "auto", trigger: "auto" });
			const preSaveSnapshot = createMockManifest({ id: "pre-save", trigger: "pre-save" });
			const manualSnapshot = createMockManifest({ id: "manual", trigger: "manual" });
			vi.mocked(mockStorage.listSnapshots).mockResolvedValue([
				autoSnapshot,
				preSaveSnapshot,
				manualSnapshot,
			]);

			const result = await service.getAll({ trigger: "auto" });

			expect(result).toHaveLength(2);
			expect(result.map((s) => s.id)).toContain("auto");
			expect(result.map((s) => s.id)).toContain("pre-save");
		});

		it("should filter by trigger type - ai-detection", async () => {
			const aiSnapshot = createMockManifest({ id: "ai", trigger: "ai-detected" });
			const autoSnapshot = createMockManifest({ id: "auto", trigger: "auto" });
			vi.mocked(mockStorage.listSnapshots).mockResolvedValue([aiSnapshot, autoSnapshot]);

			const result = await service.getAll({ trigger: "ai-detection" });

			expect(result).toHaveLength(1);
			expect(result[0].id).toBe("ai");
		});

		it("should return empty for pre-rollback filter (V2 only)", async () => {
			const snapshots = [
				createMockManifest({ trigger: "auto" }),
				createMockManifest({ trigger: "manual" }),
			];
			vi.mocked(mockStorage.listSnapshots).mockResolvedValue(snapshots);

			const result = await service.getAll({ trigger: "pre-rollback" });

			// pre-rollback is a V2 checkpoint type not in V1 SnapshotManifest
			expect(result).toHaveLength(0);
		});

		it("should return empty array on storage error", async () => {
			vi.mocked(mockStorage.listSnapshots).mockRejectedValue(new Error("Storage error"));

			const result = await service.getAll();

			expect(result).toEqual([]);
		});
	});

	// =========================================================================
	// restore() TESTS
	// =========================================================================

	describe("restore()", () => {
		it("should call daemonBridge.restoreSnapshot with correct parameters", async () => {
			vi.mocked(mockDaemonBridge.restoreSnapshot).mockResolvedValue({
				restored: ["src/test.ts"],
				skipped: [],
			});

			await service.restore("snap-123", "src/test.ts");

			expect(mockDaemonBridge.restoreSnapshot).toHaveBeenCalledWith(workspaceRoot, "snap-123", {
				files: ["src/test.ts"],
			});
		});

		it("should throw error when daemonBridge is not available", async () => {
			const noDaemonService = new RecoveryService(mockStorage, undefined, workspaceRoot);

			await expect(noDaemonService.restore("snap-123", "src/test.ts")).rejects.toThrow(
				"Daemon bridge not available - cannot restore snapshot",
			);

			noDaemonService.dispose();
		});

		it("should throw error when file is not restored", async () => {
			vi.mocked(mockDaemonBridge.restoreSnapshot).mockResolvedValue({
				restored: [],
				skipped: ["src/test.ts"],
			});

			await expect(service.restore("snap-123", "src/test.ts")).rejects.toThrow(
				"File src/test.ts was not restored (may not exist in snapshot)",
			);
		});

		it("should propagate daemon bridge errors", async () => {
			vi.mocked(mockDaemonBridge.restoreSnapshot).mockRejectedValue(
				new Error("Daemon connection lost"),
			);

			await expect(service.restore("snap-123", "src/test.ts")).rejects.toThrow(
				"Daemon connection lost",
			);
		});
	});

	// =========================================================================
	// restoreBatch() TESTS
	// =========================================================================

	describe("restoreBatch()", () => {
		it("should throw error when daemonBridge is not available", async () => {
			const noDaemonService = new RecoveryService(mockStorage, undefined, workspaceRoot);
			const snapshots: RecoverySnapshot[] = [
				{
					id: "snap-1",
					timestamp: Date.now(),
					name: "Test",
					anchorFile: "test.ts",
					files: [{ path: "test.ts", size: 100 }],
					totalSize: 100,
					trigger: "auto",
				},
			];

			await expect(noDaemonService.restoreBatch(snapshots)).rejects.toThrow(
				"Daemon bridge not available - cannot restore snapshots",
			);

			noDaemonService.dispose();
		});

		it("should group files by snapshot ID for batch restore", async () => {
			const snapshots: RecoverySnapshot[] = [
				{
					id: "snap-1",
					timestamp: Date.now(),
					name: "Snapshot 1",
					anchorFile: "a.ts",
					files: [
						{ path: "a.ts", size: 100 },
						{ path: "b.ts", size: 200 },
					],
					totalSize: 300,
					trigger: "auto",
				},
				{
					id: "snap-2",
					timestamp: Date.now(),
					name: "Snapshot 2",
					anchorFile: "c.ts",
					files: [{ path: "c.ts", size: 150 }],
					totalSize: 150,
					trigger: "manual",
				},
			];

			await service.restoreBatch(snapshots);

			expect(mockDaemonBridge.restoreSnapshot).toHaveBeenCalledTimes(2);
			expect(mockDaemonBridge.restoreSnapshot).toHaveBeenCalledWith(workspaceRoot, "snap-1", {
				files: ["a.ts", "b.ts"],
			});
			expect(mockDaemonBridge.restoreSnapshot).toHaveBeenCalledWith(workspaceRoot, "snap-2", {
				files: ["c.ts"],
			});
		});

		it("should continue with other snapshots if one fails", async () => {
			vi.mocked(mockDaemonBridge.restoreSnapshot)
				.mockRejectedValueOnce(new Error("Failed"))
				.mockResolvedValueOnce({ restored: ["c.ts"], skipped: [] });

			const snapshots: RecoverySnapshot[] = [
				{
					id: "snap-1",
					timestamp: Date.now(),
					name: "Fails",
					anchorFile: "a.ts",
					files: [{ path: "a.ts", size: 100 }],
					totalSize: 100,
					trigger: "auto",
				},
				{
					id: "snap-2",
					timestamp: Date.now(),
					name: "Succeeds",
					anchorFile: "c.ts",
					files: [{ path: "c.ts", size: 150 }],
					totalSize: 150,
					trigger: "manual",
				},
			];

			// Should not throw
			await service.restoreBatch(snapshots);

			expect(mockDaemonBridge.restoreSnapshot).toHaveBeenCalledTimes(2);
		});

		it("should merge files from same snapshot ID", async () => {
			const snapshots: RecoverySnapshot[] = [
				{
					id: "snap-1",
					timestamp: Date.now(),
					name: "First",
					anchorFile: "a.ts",
					files: [{ path: "a.ts", size: 100 }],
					totalSize: 100,
					trigger: "auto",
				},
				{
					id: "snap-1", // Same snapshot ID
					timestamp: Date.now(),
					name: "First again",
					anchorFile: "b.ts",
					files: [{ path: "b.ts", size: 200 }],
					totalSize: 200,
					trigger: "auto",
				},
			];

			await service.restoreBatch(snapshots);

			expect(mockDaemonBridge.restoreSnapshot).toHaveBeenCalledTimes(1);
			expect(mockDaemonBridge.restoreSnapshot).toHaveBeenCalledWith(workspaceRoot, "snap-1", {
				files: ["a.ts", "b.ts"],
			});
		});
	});

	// =========================================================================
	// notifySnapshotCreated() TESTS
	// =========================================================================

	describe("notifySnapshotCreated()", () => {
		it("should fire onSnapshotCreated event with converted snapshot", () => {
			const manifest = createMockManifest({
				id: "snap-new",
				timestamp: Date.now(),
				trigger: "ai-detected",
			});

			let firedSnapshot: RecoverySnapshot | undefined;
			service.onSnapshotCreated((snapshot) => {
				firedSnapshot = snapshot;
			});

			service.notifySnapshotCreated(manifest);

			expect(firedSnapshot).toBeDefined();
			expect(firedSnapshot!.id).toBe("snap-new");
			expect(firedSnapshot!.trigger).toBe("ai-detection"); // Mapped from ai-detected
		});
	});

	// =========================================================================
	// TRIGGER MAPPING TESTS
	// =========================================================================

	describe("trigger type mapping", () => {
		it("should map 'auto' to 'auto'", async () => {
			const manifest = createMockManifest({ trigger: "auto" });
			vi.mocked(mockStorage.listSnapshots).mockResolvedValue([manifest]);

			const result = await service.getRecent(1);

			expect(result[0].trigger).toBe("auto");
		});

		it("should map 'manual' to 'manual'", async () => {
			const manifest = createMockManifest({ trigger: "manual" });
			vi.mocked(mockStorage.listSnapshots).mockResolvedValue([manifest]);

			const result = await service.getRecent(1);

			expect(result[0].trigger).toBe("manual");
		});

		it("should map 'ai-detected' to 'ai-detection'", async () => {
			const manifest = createMockManifest({ trigger: "ai-detected" });
			vi.mocked(mockStorage.listSnapshots).mockResolvedValue([manifest]);

			const result = await service.getRecent(1);

			expect(result[0].trigger).toBe("ai-detection");
		});

		it("should map 'pre-save' to 'auto'", async () => {
			const manifest = createMockManifest({ trigger: "pre-save" });
			vi.mocked(mockStorage.listSnapshots).mockResolvedValue([manifest]);

			const result = await service.getRecent(1);

			expect(result[0].trigger).toBe("auto");
		});
	});

	// =========================================================================
	// METADATA MAPPING TESTS
	// =========================================================================

	describe("metadata mapping", () => {
		it("should map riskScore from metadata", async () => {
			const manifest = createMockManifest({
				metadata: { riskScore: 0.75 },
			});
			vi.mocked(mockStorage.listSnapshots).mockResolvedValue([manifest]);

			const result = await service.getRecent(1);

			expect(result[0].metadata?.riskScore).toBe(0.75);
		});

		it("should map sessionId from metadata", async () => {
			const manifest = createMockManifest({
				metadata: { sessionId: "session-xyz" },
			});
			vi.mocked(mockStorage.listSnapshots).mockResolvedValue([manifest]);

			const result = await service.getRecent(1);

			expect(result[0].metadata?.sessionId).toBe("session-xyz");
		});

		it("should map aiTool from aiDetection metadata", async () => {
			const manifest = createMockManifest({
				metadata: {
					aiDetection: { tool: "cursor", confidence: 0.95 },
				},
			});
			vi.mocked(mockStorage.listSnapshots).mockResolvedValue([manifest]);

			const result = await service.getRecent(1);

			expect(result[0].metadata?.aiTool).toBe("cursor");
		});

		it("should handle missing metadata gracefully", async () => {
			const manifest = createMockManifest({ metadata: undefined });
			vi.mocked(mockStorage.listSnapshots).mockResolvedValue([manifest]);

			const result = await service.getRecent(1);

			expect(result[0].metadata).toEqual({
				riskScore: undefined,
				sessionId: undefined,
				aiTool: undefined,
			});
		});
	});

	// =========================================================================
	// LIFECYCLE TESTS
	// =========================================================================

	describe("lifecycle", () => {
		it("should dispose event emitter cleanly", () => {
			expect(() => service.dispose()).not.toThrow();
		});

		it("should be safe to call dispose multiple times", () => {
			service.dispose();
			expect(() => service.dispose()).not.toThrow();
		});
	});
});
