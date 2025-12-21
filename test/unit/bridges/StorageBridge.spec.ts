/**
 * StorageBridge Tests - V1/V2 Routing and Schema Translation
 *
 * Test Coverage:
 * - V1 mode routes correctly
 * - V2 mode routes correctly
 * - V1 snapshots readable in V2 mode
 * - Schema translation (V2 → V1)
 * - Feature flag toggle works
 * - Cooldowns always use V1
 * - Sessions always use V1
 * - Audit always use V1
 */

import { Storage as V2Storage, type SnapshotManifest as V2Manifest } from "@snapback/engine";
import type { SnapBackEventBus } from "@snapback/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import type { StorageManager } from "../../../src/storage/StorageManager";
import type {
	AuditEntry,
	CooldownEntry,
	SnapshotFilters,
	SnapshotManifest,
	SnapshotWithContent,
} from "../../../src/storage/types";
import { StorageBridge } from "../../../src/bridges/StorageBridge";

describe("StorageBridge", () => {
	let mockContext: vscode.ExtensionContext;
	let mockV1Storage: StorageManager;
	let mockEventBus: SnapBackEventBus;

	beforeEach(() => {
		// Mock VS Code context
		mockContext = {
			globalStorageUri: vscode.Uri.file("/test/storage"),
		} as unknown as vscode.ExtensionContext;

		// Mock V1 storage
		mockV1Storage = {
			initialize: vi.fn().mockResolvedValue(undefined),
			dispose: vi.fn(),
			isInitialized: vi.fn().mockReturnValue(true),
			getStorageUri: vi.fn().mockReturnValue(vscode.Uri.file("/test/storage")),

			// Cooldowns
			setCooldown: vi.fn(),
			getCooldown: vi.fn().mockReturnValue(null),
			isInCooldown: vi.fn().mockReturnValue(false),
			getRemainingCooldownTime: vi.fn().mockReturnValue(0),
			clearCooldowns: vi.fn(),
			getActiveCooldowns: vi.fn().mockReturnValue([]),
			removeCooldownByPath: vi.fn().mockReturnValue(false),
			getCooldownByPath: vi.fn().mockReturnValue(null),

			// Snapshots
			createSnapshot: vi.fn().mockResolvedValue({
				id: "snap_v1_123",
				name: "V1 Snapshot",
				timestamp: Date.now(),
				anchorFile: "test.ts",
				files: { "test.ts": { path: "test.ts", hash: "abc123" } },
				trigger: "manual",
				version: 1,
				metadata: {},
			}),
			getSnapshot: vi.fn().mockResolvedValue(null),
			getSnapshotManifest: vi.fn().mockResolvedValue(null),
			listSnapshots: vi.fn().mockResolvedValue([]),
			deleteSnapshot: vi.fn().mockResolvedValue(undefined),
			getSnapshotsForFile: vi.fn().mockResolvedValue([]),
			snapshotExists: vi.fn().mockResolvedValue(false),
			persistSnapshot: vi.fn().mockResolvedValue(null),

			// Sessions
			createSession: vi.fn().mockResolvedValue("session_123"),
			finalizeSession: vi.fn().mockResolvedValue({
				id: "session_123",
				startedAt: Date.now(),
				endedAt: Date.now(),
				reason: "user_paused",
				files: [],
			}),
			getSession: vi.fn().mockResolvedValue(null),
			listSessions: vi.fn().mockResolvedValue([]),
			getActiveSessionId: vi.fn().mockReturnValue(null),
			hasActiveSession: vi.fn().mockReturnValue(false),
			cancelSession: vi.fn(),

			// Audit
			recordAudit: vi.fn().mockResolvedValue(undefined),
			getAuditTrail: vi.fn().mockResolvedValue([]),
			getAllAuditEntries: vi.fn().mockResolvedValue([]),
			getAuditEntriesByAction: vi.fn().mockResolvedValue([]),

			// Metadata
			getStorageMetadata: vi.fn().mockResolvedValue({
				version: 1,
				createdAt: Date.now(),
				lastUpdatedAt: Date.now(),
				stats: {
					snapshotCount: 0,
					sessionCount: 0,
					totalBlobBytes: 0,
				},
			}),
			refreshStats: vi.fn().mockResolvedValue({
				version: 1,
				createdAt: Date.now(),
				lastUpdatedAt: Date.now(),
				stats: {
					snapshotCount: 0,
					sessionCount: 0,
					totalBlobBytes: 0,
				},
			}),
			getQuickStats: vi.fn().mockResolvedValue({
				snapshots: 0,
				sessions: 0,
				blobs: 0,
				totalBytes: 0,
			}),

			// Internal access
			getPRWSnapshotStore: vi.fn().mockReturnValue({}),
			getConfigStore: vi.fn().mockReturnValue({}),
			createPreRollbackCheckpoint: vi.fn().mockResolvedValue({}),
		} as unknown as StorageManager;

		mockEventBus = {} as SnapBackEventBus;
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	// ============================================
	// Initialization Tests
	// ============================================

	it("initializes V1 storage when useV2Engine is false", async () => {
		const bridge = new StorageBridge({
			context: mockContext,
			eventBus: mockEventBus,
			v1Storage: mockV1Storage,
			useV2Engine: false,
		});

		await bridge.initialize();

		expect(mockV1Storage.initialize).toHaveBeenCalledOnce();
	});

	it("initializes V2 storage when useV2Engine is true", async () => {
		const bridge = new StorageBridge({
			context: mockContext,
			eventBus: mockEventBus,
			v1Storage: mockV1Storage,
			useV2Engine: true,
		});

		await bridge.initialize();

		// V2 storage initializes in constructor, V1 should not be called
		expect(mockV1Storage.initialize).not.toHaveBeenCalled();
	});

	it("disposes V1 storage when useV2Engine is false", () => {
		const bridge = new StorageBridge({
			context: mockContext,
			v1Storage: mockV1Storage,
			useV2Engine: false,
		});

		bridge.dispose();

		expect(mockV1Storage.dispose).toHaveBeenCalledOnce();
	});

	// ============================================
	// Cooldown Tests (Always V1)
	// ============================================

	it("always routes cooldowns to V1 regardless of flag", () => {
		const bridgeV1 = new StorageBridge({
			context: mockContext,
			v1Storage: mockV1Storage,
			useV2Engine: false,
		});

		const bridgeV2 = new StorageBridge({
			context: mockContext,
			v1Storage: mockV1Storage,
			useV2Engine: true,
		});

		const cooldown: CooldownEntry = {
			filePath: "test.ts",
			protectionLevel: "block",
			triggeredAt: Date.now(),
			expiresAt: Date.now() + 5000,
			actionTaken: "save_blocked",
		};

		// V1 mode
		bridgeV1.setCooldown(cooldown);
		expect(mockV1Storage.setCooldown).toHaveBeenCalledWith(cooldown);

		vi.clearAllMocks();

		// V2 mode (still uses V1 for cooldowns)
		bridgeV2.setCooldown(cooldown);
		expect(mockV1Storage.setCooldown).toHaveBeenCalledWith(cooldown);
	});

	it("delegates all cooldown methods to V1", () => {
		const bridge = new StorageBridge({
			context: mockContext,
			v1Storage: mockV1Storage,
			useV2Engine: true, // Even in V2 mode
		});

		// Test all cooldown methods
		bridge.getCooldown("test.ts", "block");
		expect(mockV1Storage.getCooldown).toHaveBeenCalledWith("test.ts", "block");

		bridge.isInCooldown("test.ts", "block");
		expect(mockV1Storage.isInCooldown).toHaveBeenCalledWith("test.ts", "block");

		bridge.getRemainingCooldownTime("test.ts", "block");
		expect(mockV1Storage.getRemainingCooldownTime).toHaveBeenCalledWith("test.ts", "block");

		bridge.clearCooldowns();
		expect(mockV1Storage.clearCooldowns).toHaveBeenCalledOnce();

		bridge.getActiveCooldowns();
		expect(mockV1Storage.getActiveCooldowns).toHaveBeenCalledOnce();

		bridge.removeCooldownByPath("test.ts");
		expect(mockV1Storage.removeCooldownByPath).toHaveBeenCalledWith("test.ts");

		bridge.getCooldownByPath("test.ts");
		expect(mockV1Storage.getCooldownByPath).toHaveBeenCalledWith("test.ts");
	});

	// ============================================
	// Snapshot Tests - V1 Mode
	// ============================================

	it("routes createSnapshot to V1 when useV2Engine is false", async () => {
		const bridge = new StorageBridge({
			context: mockContext,
			v1Storage: mockV1Storage,
			useV2Engine: false,
		});

		const files = new Map([["test.ts", "console.log('test');"]]);
		const options = {
			name: "Test Snapshot",
			trigger: "manual" as const,
			anchorFile: "test.ts",
		};

		await bridge.createSnapshot(files, options);

		expect(mockV1Storage.createSnapshot).toHaveBeenCalledWith(files, options);
	});

	it("routes listSnapshots to V1 when useV2Engine is false", async () => {
		const bridge = new StorageBridge({
			context: mockContext,
			v1Storage: mockV1Storage,
			useV2Engine: false,
		});

		const filters: SnapshotFilters = { limit: 10 };
		await bridge.listSnapshots(filters);

		expect(mockV1Storage.listSnapshots).toHaveBeenCalledWith(filters);
	});

	it("routes deleteSnapshot to V1 when useV2Engine is false", async () => {
		const bridge = new StorageBridge({
			context: mockContext,
			v1Storage: mockV1Storage,
			useV2Engine: false,
		});

		await bridge.deleteSnapshot("snap_123");

		expect(mockV1Storage.deleteSnapshot).toHaveBeenCalledWith("snap_123");
	});

	// ============================================
	// Snapshot Tests - V2 Mode
	// ============================================

	it("creates V2 snapshot and converts to V1 format when useV2Engine is true", async () => {
		const bridge = new StorageBridge({
			context: mockContext,
			v1Storage: mockV1Storage,
			useV2Engine: true,
		});

		// Create a fresh mock V2 storage instance with proper methods
		const mockV2Storage = {
			createSnapshot: vi.fn().mockResolvedValue({
				id: "snap_v2_456",
				createdAt: Date.now(),
				files: [
					{
						path: "test.ts",
						blobId: "def456",
						size: 100,
					},
				],
				totalSize: 100,
				description: "V2 Snapshot",
				trigger: "manual",
			}),
			restore: vi.fn().mockResolvedValue([]),
			getSnapshot: vi.fn().mockReturnValue(null),
			listSnapshots: vi.fn().mockReturnValue([]),
			deleteSnapshot: vi.fn().mockReturnValue(false),
		};

		// Inject mock V2 storage
		(bridge as any).v2Storage = mockV2Storage;

		const files = new Map([["test.ts", "console.log('v2 test');"]]);
		const options = {
			name: "V2 Snapshot",
			trigger: "manual" as const,
			anchorFile: "test.ts",
		};

		const result = await bridge.createSnapshot(files, options);

		// Verify V2 storage was called
		expect(mockV2Storage.createSnapshot).toHaveBeenCalledWith(
			[{ path: "test.ts", content: "console.log('v2 test');" }],
			{ description: "V2 Snapshot", trigger: "manual" },
		);

		// Verify V1 format returned (uses blob/size per V1 SnapshotFileRef type)
		expect(result.id).toBe("snap_v2_456");
		expect(result.files).toBeDefined();
		expect(result.files["test.ts"]).toEqual({
			blob: "def456",
			size: 100,
		});
	});

	it("merges V1 and V2 snapshots in listSnapshots when useV2Engine is true", async () => {
		const bridge = new StorageBridge({
			context: mockContext,
			v1Storage: mockV1Storage,
			useV2Engine: true,
		});

		// Mock V1 snapshots
		const v1Snapshots: SnapshotManifest[] = [
			{
				id: "snap_v1_1",
				name: "V1 Snap 1",
				timestamp: Date.now() - 1000,
				anchorFile: "file1.ts",
				files: { "file1.ts": { blob: "hash1", size: 50 } },
				trigger: "manual",
				metadata: {},
			},
		];

		mockV1Storage.listSnapshots = vi.fn().mockResolvedValue(v1Snapshots);

		// Create a fresh mock V2 storage instance
		const mockV2Storage = {
			createSnapshot: vi.fn(),
			restore: vi.fn(),
			getSnapshot: vi.fn().mockReturnValue(null),
			listSnapshots: vi.fn().mockReturnValue([
				{
					id: "snap_v2_2",
					createdAt: Date.now(),
					files: [{ path: "file2.ts", blobId: "hash2", size: 100 }],
					totalSize: 100,
					description: "V2 Snap 2",
				},
			]),
			deleteSnapshot: vi.fn(),
		};

		// Inject mock V2 storage
		(bridge as any).v2Storage = mockV2Storage;

		const result = await bridge.listSnapshots();

		// Should have both V1 and V2 snapshots
		expect(result).toHaveLength(2);
		expect(result.find((s) => s.id === "snap_v1_1")).toBeDefined();
		expect(result.find((s) => s.id === "snap_v2_2")).toBeDefined();
	});

	it("deduplicates snapshots by ID when merging V1 and V2", async () => {
		const bridge = new StorageBridge({
			context: mockContext,
			v1Storage: mockV1Storage,
			useV2Engine: true,
		});

		// Same ID in both V1 and V2
		const duplicateId = "snap_123";

		mockV1Storage.listSnapshots = vi.fn().mockResolvedValue([
			{
				id: duplicateId,
				name: "V1 Version",
				timestamp: Date.now(),
				anchorFile: "test.ts",
				files: {},
				trigger: "manual",
				metadata: {},
			},
		]);

		// Create a fresh mock V2 storage instance
		const mockV2Storage = {
			createSnapshot: vi.fn(),
			restore: vi.fn(),
			getSnapshot: vi.fn().mockReturnValue(null),
			listSnapshots: vi.fn().mockReturnValue([
				{
					id: duplicateId,
					createdAt: Date.now(),
					files: [],
					totalSize: 0,
				},
			]),
			deleteSnapshot: vi.fn(),
		};

		// Inject mock V2 storage
		(bridge as any).v2Storage = mockV2Storage;

		const result = await bridge.listSnapshots();

		// Should only have 1 snapshot (deduplicated)
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe(duplicateId);
	});

	// ============================================
	// V1 Backward Compatibility in V2 Mode
	// ============================================

	it("reads V1 snapshots when V2 storage doesn't find them", async () => {
		const bridge = new StorageBridge({
			context: mockContext,
			v1Storage: mockV1Storage,
			useV2Engine: true,
		});

		const v1Snapshot: SnapshotWithContent = {
			id: "snap_v1_old",
			name: "Old V1 Snapshot",
			timestamp: Date.now(),
			anchorFile: "old.ts",
			files: { "old.ts": { blob: "oldhash", size: 50 } },
			trigger: "manual",
			metadata: {},
			contents: { "old.ts": "console.log('old');" },
		};

		mockV1Storage.getSnapshot = vi.fn().mockResolvedValue(v1Snapshot);

		// Create a fresh mock V2 storage instance
		const mockV2Storage = {
			createSnapshot: vi.fn(),
			restore: vi.fn(),
			getSnapshot: vi.fn().mockReturnValue(null), // Not found in V2
			listSnapshots: vi.fn().mockReturnValue([]),
			deleteSnapshot: vi.fn(),
		};

		// Inject mock V2 storage
		(bridge as any).v2Storage = mockV2Storage;

		const result = await bridge.getSnapshot("snap_v1_old");

		// Should fallback to V1 and return the snapshot
		expect(result).toEqual(v1Snapshot);
		expect(mockV1Storage.getSnapshot).toHaveBeenCalledWith("snap_v1_old");
	});

	// ============================================
	// Session Tests (Always V1)
	// ============================================

	it("always routes sessions to V1 regardless of flag", async () => {
		const bridgeV2 = new StorageBridge({
			context: mockContext,
			v1Storage: mockV1Storage,
			useV2Engine: true,
		});

		await bridgeV2.createSession(Date.now());
		expect(mockV1Storage.createSession).toHaveBeenCalled();

		await bridgeV2.getSession("session_123");
		expect(mockV1Storage.getSession).toHaveBeenCalledWith("session_123");

		await bridgeV2.listSessions();
		expect(mockV1Storage.listSessions).toHaveBeenCalled();
	});

	// ============================================
	// Audit Tests (Always V1)
	// ============================================

	it("always routes audit to V1 regardless of flag", async () => {
		const bridgeV2 = new StorageBridge({
			context: mockContext,
			v1Storage: mockV1Storage,
			useV2Engine: true,
		});

		const auditEntry: Omit<AuditEntry, "id" | "timestamp"> = {
			action: "snapshot_created",
			filePath: "test.ts",
			protectionLevel: "watch",
			details: {},
		};

		await bridgeV2.recordAudit(auditEntry);
		expect(mockV1Storage.recordAudit).toHaveBeenCalledWith(auditEntry);

		await bridgeV2.getAuditTrail("test.ts");
		expect(mockV1Storage.getAuditTrail).toHaveBeenCalledWith("test.ts", undefined);
	});

	// ============================================
	// Metadata Tests (Always V1)
	// ============================================

	it("always routes metadata to V1 regardless of flag", async () => {
		const bridgeV2 = new StorageBridge({
			context: mockContext,
			v1Storage: mockV1Storage,
			useV2Engine: true,
		});

		await bridgeV2.getStorageMetadata();
		expect(mockV1Storage.getStorageMetadata).toHaveBeenCalled();

		await bridgeV2.refreshStats();
		expect(mockV1Storage.refreshStats).toHaveBeenCalled();

		await bridgeV2.getQuickStats();
		expect(mockV1Storage.getQuickStats).toHaveBeenCalled();
	});

	// ============================================
	// Schema Translation Tests
	// ============================================

	it("correctly translates V2 manifest to V1 format", async () => {
		const bridge = new StorageBridge({
			context: mockContext,
			v1Storage: mockV1Storage,
			useV2Engine: true,
		});

		const v2Manifest: V2Manifest = {
			id: "snap_v2_translate",
			createdAt: 1234567890,
			files: [
				{ path: "src/auth.ts", blobId: "hash1", size: 100 },
				{ path: "src/user.ts", blobId: "hash2", size: 200 },
			],
			totalSize: 300,
			description: "Translation Test",
			trigger: "manual",
		};

		// Access private method via type assertion
		const v1Manifest = (bridge as any).convertV2ToV1(v2Manifest, "manual");

		expect(v1Manifest.id).toBe("snap_v2_translate");
		expect(v1Manifest.timestamp).toBe(1234567890);
		expect(v1Manifest.name).toBe("Translation Test");
		expect(v1Manifest.trigger).toBe("manual");
		// V1 SnapshotFileRef uses blob/size, not path/hash
		expect(v1Manifest.files["src/auth.ts"]).toEqual({
			blob: "hash1",
			size: 100,
		});
		expect(v1Manifest.files["src/user.ts"]).toEqual({
			blob: "hash2",
			size: 200,
		});
	});

	it("maps V1 trigger types to V2 trigger types", async () => {
		const bridge = new StorageBridge({
			context: mockContext,
			v1Storage: mockV1Storage,
			useV2Engine: true,
		});

		// Access private method via type assertion
		expect((bridge as any).mapTriggerToV2("manual")).toBe("manual");
		expect((bridge as any).mapTriggerToV2("ai-detected")).toBe("ai-detection");
		expect((bridge as any).mapTriggerToV2("auto")).toBe("auto");
		expect((bridge as any).mapTriggerToV2("pre-save")).toBe("auto");
		expect((bridge as any).mapTriggerToV2("risk-burst")).toBe("auto");
	});
});
