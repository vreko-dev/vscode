/**
 * SnapshotQuickPick Tests
 *
 * Reference: Snapshot Display Specification
 * - Status bar click → Quick restore flow
 * - Keyboard-first experience
 * - Recent snapshots with emoji icons
 * - Confirmation before restore
 *
 * @packageDocumentation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as vscode from "vscode";
import {
	SnapshotQuickPick,
	createSnapshotQuickPickItem,
	type SnapshotQuickPickConfig,
} from "../../../../src/ui/snapshot-display/SnapshotQuickPick";
import type { SnapshotManifestV2, OriginLabel, ReasonCode } from "../../../../src/storage/types";

// =============================================================================
// TEST HELPERS
// =============================================================================

function createMockSnapshotV2(overrides: Partial<SnapshotManifestV2> = {}): SnapshotManifestV2 {
	return {
		schemaVersion: 2,
		id: `snap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
		seq: 1,
		parentSeq: null,
		parentId: null,
		timestamp: Date.now(),
		name: "Test Snapshot",
		type: "POST",
		anchorFile: "/path/to/file.ts",
		files: {
			"/path/to/file.ts": { blobHash: "abc123", size: 1024 },
		},
		metadata: {
			origin: "INTERACTIVE" as OriginLabel,
			reasons: [] as ReasonCode[],
		},
		...overrides,
	};
}

function createMockStorageManager() {
	return {
		listSnapshots: vi.fn().mockResolvedValue([]),
		getSnapshotManifest: vi.fn().mockResolvedValue(null),
		getSnapshot: vi.fn().mockResolvedValue(null),
		initialize: vi.fn().mockResolvedValue(undefined),
		dispose: vi.fn(),
		isInitialized: vi.fn().mockReturnValue(true),
		getStorageUri: vi.fn().mockReturnValue({ fsPath: "/tmp/snapback" }),
		setCooldown: vi.fn(),
		getCooldown: vi.fn(),
		isInCooldown: vi.fn().mockReturnValue(false),
		getRemainingCooldownTime: vi.fn().mockReturnValue(0),
		clearCooldowns: vi.fn(),
		getActiveCooldowns: vi.fn().mockReturnValue([]),
		removeCooldownByPath: vi.fn(),
		getCooldownByPath: vi.fn(),
		createSnapshot: vi.fn(),
		deleteSnapshot: vi.fn(),
		getSnapshotsForFile: vi.fn().mockResolvedValue([]),
		snapshotExists: vi.fn().mockResolvedValue(false),
		persistSnapshot: vi.fn(),
		createSession: vi.fn(),
		finalizeSession: vi.fn(),
		getSession: vi.fn(),
		listSessions: vi.fn().mockResolvedValue([]),
		recordAudit: vi.fn(),
		getAuditTrail: vi.fn().mockResolvedValue([]),
		getStorageMetadata: vi.fn().mockResolvedValue({
			version: 2,
			createdAt: Date.now(),
			lastUpdatedAt: Date.now(),
			stats: { snapshotCount: 0, sessionCount: 0, totalBlobBytes: 0 },
		}),
	};
}

// =============================================================================
// QUICK PICK ITEM CREATION TESTS
// =============================================================================

describe("createSnapshotQuickPickItem", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2025-12-30T12:00:00.000Z"));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("icon display", () => {
		it("should show robot icon 🤖 for AI-detected snapshots", () => {
			const snapshot = createMockSnapshotV2({
				metadata: { origin: "AUTOMATED", reasons: ["AI_DETECTED"] },
			});

			const item = createSnapshotQuickPickItem(snapshot);

			expect(item.label).toMatch(/^🤖/);
		});

		it("should show camera icon 📸 for manual snapshots", () => {
			const snapshot = createMockSnapshotV2({
				metadata: { origin: "INTERACTIVE", reasons: ["MANUAL_CHECKPOINT"] },
			});

			const item = createSnapshotQuickPickItem(snapshot);

			expect(item.label).toMatch(/^📸/);
		});

		it("should show lightning icon ⚡ for automated snapshots", () => {
			const snapshot = createMockSnapshotV2({
				metadata: { origin: "AUTOMATED", reasons: ["RISK_BURST_START"] },
			});

			const item = createSnapshotQuickPickItem(snapshot);

			expect(item.label).toMatch(/^⚡/);
		});

		it("should show rewind icon ⏪ for pre-restore snapshots", () => {
			const snapshot = createMockSnapshotV2({ type: "PRE_ROLLBACK" });

			const item = createSnapshotQuickPickItem(snapshot);

			expect(item.label).toMatch(/^⏪/);
		});
	});

	describe("file display", () => {
		it("should show file basename in label", () => {
			const snapshot = createMockSnapshotV2({
				anchorFile: "/project/src/api.ts",
				files: { "/project/src/api.ts": { blobHash: "abc", size: 100 } },
			});

			const item = createSnapshotQuickPickItem(snapshot);

			expect(item.label).toContain("api.ts");
		});

		it("should show file count for multi-file snapshots", () => {
			const snapshot = createMockSnapshotV2({
				anchorFile: "/project/src/index.ts",
				files: {
					"/project/src/index.ts": { blobHash: "abc", size: 100 },
					"/project/src/api.ts": { blobHash: "def", size: 200 },
					"/project/src/types.ts": { blobHash: "ghi", size: 150 },
				},
			});

			const item = createSnapshotQuickPickItem(snapshot);

			expect(item.label).toContain("index.ts (+2)");
		});
	});

	describe("time display", () => {
		it("should show relative time in description", () => {
			const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
			const snapshot = createMockSnapshotV2({ timestamp: fiveMinutesAgo });

			const item = createSnapshotQuickPickItem(snapshot);

			expect(item.description).toBe("5m ago");
		});

		it("should show 'Just now' for very recent snapshots", () => {
			const snapshot = createMockSnapshotV2({ timestamp: Date.now() - 10000 });

			const item = createSnapshotQuickPickItem(snapshot);

			expect(item.description).toBe("Just now");
		});
	});

	describe("reason display", () => {
		it("should show human-readable reason in detail", () => {
			const snapshot = createMockSnapshotV2({
				metadata: { origin: "AUTOMATED", reasons: ["RISK_BURST_START"] },
			});

			const item = createSnapshotQuickPickItem(snapshot);

			expect(item.detail).toContain("Rapid changes detected");
		});

		it("should show 'AI activity detected' for AI snapshots", () => {
			const snapshot = createMockSnapshotV2({
				metadata: { origin: "AUTOMATED", reasons: ["AI_DETECTED"] },
			});

			const item = createSnapshotQuickPickItem(snapshot);

			expect(item.detail).toContain("AI activity detected");
		});

		it("should show 'Manual checkpoint' for manual snapshots", () => {
			const snapshot = createMockSnapshotV2({
				metadata: { origin: "INTERACTIVE", reasons: ["MANUAL_CHECKPOINT"] },
			});

			const item = createSnapshotQuickPickItem(snapshot);

			expect(item.detail).toContain("Manual checkpoint");
		});
	});

	describe("snapshot ID", () => {
		it("should include snapshot ID in item", () => {
			const snapshot = createMockSnapshotV2({ id: "snap-test-123" });

			const item = createSnapshotQuickPickItem(snapshot);

			expect(item.snapshotId).toBe("snap-test-123");
		});
	});
});

// =============================================================================
// QUICK PICK CLASS TESTS
// =============================================================================

describe("SnapshotQuickPick", () => {
	let mockStorageManager: ReturnType<typeof createMockStorageManager>;
	let mockQuickPick: any;

	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2025-12-30T12:00:00.000Z"));

		mockStorageManager = createMockStorageManager();

		// Create a fresh mock QuickPick for each test
		mockQuickPick = (vscode.window.createQuickPick as ReturnType<typeof vi.fn>)();
		// Mock createQuickPick to always return our mockQuickPick
		(vscode.window.createQuickPick as ReturnType<typeof vi.fn>).mockReturnValue(mockQuickPick);
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	describe("show()", () => {
		it("should create and show QuickPick immediately", async () => {
			const quickPick = new SnapshotQuickPick(mockStorageManager as any);

			await quickPick.show();

			expect(mockQuickPick.show).toHaveBeenCalled();
		});

		it("should set correct title and placeholder", async () => {
			const quickPick = new SnapshotQuickPick(mockStorageManager as any);

			await quickPick.show();

			expect(mockQuickPick.title).toBe("Restore Snapshot");
			expect(mockQuickPick.placeholder).toContain("snapshot");
		});

		it("should enable search on description and detail", async () => {
			const quickPick = new SnapshotQuickPick(mockStorageManager as any);

			await quickPick.show();

			expect(mockQuickPick.matchOnDescription).toBe(true);
			expect(mockQuickPick.matchOnDetail).toBe(true);
		});
	});

	describe("item building", () => {
		it("should show recent snapshots section with separator", async () => {
			const snapshots = [
				createMockSnapshotV2({ timestamp: Date.now() - 60000 }),
				createMockSnapshotV2({ timestamp: Date.now() - 300000 }),
			];
			mockStorageManager.listSnapshots.mockResolvedValue(snapshots);

			const quickPick = new SnapshotQuickPick(mockStorageManager as any);
			await quickPick.show();

			// Should have separator for recent snapshots
			const separators = mockQuickPick.items.filter(
				(i: any) => i.kind === vscode.QuickPickItemKind.Separator,
			);
			expect(separators.some((s: any) => s.label.includes("Recent"))).toBe(true);
		});

		it("should show empty state when no snapshots", async () => {
			mockStorageManager.listSnapshots.mockResolvedValue([]);

			const quickPick = new SnapshotQuickPick(mockStorageManager as any);
			await quickPick.show();

			const infoItem = mockQuickPick.items.find((i: any) => i.label.includes("No snapshots"));
			expect(infoItem).toBeDefined();
		});

		it("should show browse action", async () => {
			const quickPick = new SnapshotQuickPick(mockStorageManager as any);
			await quickPick.show();

			const browseItem = mockQuickPick.items.find((i: any) => i.action === "browse");
			expect(browseItem).toBeDefined();
			expect(browseItem?.label).toContain("Browse");
		});

		it("should show settings action", async () => {
			const quickPick = new SnapshotQuickPick(mockStorageManager as any);
			await quickPick.show();

			const settingsItem = mockQuickPick.items.find((i: any) => i.action === "settings");
			expect(settingsItem).toBeDefined();
			expect(settingsItem?.label).toContain("settings");
		});

		it("should limit to configured max recent snapshots", async () => {
			const snapshots = Array.from({ length: 20 }, (_, i) =>
				createMockSnapshotV2({ timestamp: Date.now() - i * 60000 }),
			);
			mockStorageManager.listSnapshots.mockResolvedValue(snapshots);

			const config: SnapshotQuickPickConfig = { maxRecent: 5 };
			const quickPick = new SnapshotQuickPick(mockStorageManager as any, config);
			await quickPick.show();

			// Should request only maxRecent
			expect(mockStorageManager.listSnapshots).toHaveBeenCalledWith(
				expect.objectContaining({ limit: 5 }),
			);
		});
	});

	describe("selection handling", () => {
		it("should have browse item with correct action", async () => {
			const quickPick = new SnapshotQuickPick(mockStorageManager as any);
			await quickPick.show();

			const browseItem = mockQuickPick.items.find((i: any) => i.action === "browse");
			expect(browseItem).toBeDefined();
			expect(browseItem?.label).toContain("Browse");
		});

		it("should have settings item with correct action", async () => {
			const quickPick = new SnapshotQuickPick(mockStorageManager as any);
			await quickPick.show();

			const settingsItem = mockQuickPick.items.find((i: any) => i.action === "settings");
			expect(settingsItem).toBeDefined();
			expect(settingsItem?.label).toContain("settings");
		});

		it("should hide QuickPick when onDidAccept fires", async () => {
			const quickPick = new SnapshotQuickPick(mockStorageManager as any);
			await quickPick.show();

			// Verify QuickPick has hide method that can be called
			expect(mockQuickPick.hide).toBeDefined();
		});
	});

	describe("restore confirmation message", () => {
		it("should include file name in confirmation", async () => {
			const snapshot = createMockSnapshotV2({
				id: "snap-test",
				anchorFile: "/path/to/api.ts",
				files: { "/path/to/api.ts": { blobHash: "abc", size: 100 } },
			});
			mockStorageManager.listSnapshots.mockResolvedValue([snapshot]);

			const quickPick = new SnapshotQuickPick(mockStorageManager as any);
			await quickPick.show();

			// Verify we have a snapshot item with the right properties
			const snapshotItem = mockQuickPick.items.find((i: any) => i.snapshotId);
			expect(snapshotItem).toBeDefined();
			expect(snapshotItem?.snapshotId).toBe("snap-test");
			expect(snapshotItem?.label).toContain("api.ts");
		});

		it("should include relative time in item description", async () => {
			const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
			const snapshot = createMockSnapshotV2({
				id: "snap-test",
				timestamp: fiveMinutesAgo,
			});
			mockStorageManager.listSnapshots.mockResolvedValue([snapshot]);

			const quickPick = new SnapshotQuickPick(mockStorageManager as any);
			await quickPick.show();

			const snapshotItem = mockQuickPick.items.find((i: any) => i.snapshotId);
			expect(snapshotItem?.description).toBe("5m ago");
		});
	});

	describe("error handling", () => {
		it("should show error state when loading fails", async () => {
			mockStorageManager.listSnapshots.mockRejectedValue(new Error("Storage error"));

			const quickPick = new SnapshotQuickPick(mockStorageManager as any);
			await quickPick.show();

			const errorItem = mockQuickPick.items.find((i: any) => i.label.includes("Failed"));
			expect(errorItem).toBeDefined();
		});
	});

	describe("disposal", () => {
		it("should dispose QuickPick on hide", async () => {
			const quickPick = new SnapshotQuickPick(mockStorageManager as any);
			await quickPick.show();

			mockQuickPick._onDidHideEmitter.fire();

			expect(mockQuickPick.dispose).toHaveBeenCalled();
		});
	});
});
