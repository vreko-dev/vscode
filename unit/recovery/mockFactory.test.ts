/**
 * TDD RED Phase: Mock Factory Tests
 * Tests for recovery service mock factories - these tests will FAIL until factories are implemented
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
	IRecoveryService,
	ISessionStatsProvider,
	RecoverySnapshot,
	SessionStats,
	SnapshotFilter,
} from "../../../src/services/recovery/interfaces";

// Import factories that DON'T EXIST YET - this is TDD RED phase
import {
	createMockRecoveryService,
	createMockSessionStatsProvider,
} from "../../helpers/recoveryMocks";
import {
	mockRecoverySnapshots,
	mockSessionStats,
} from "../../fixtures/recovery";

describe("Recovery Mock Factories (TDD RED)", () => {
	describe("createMockRecoveryService", () => {
		it("should create a mock recovery service with default behavior", () => {
			const mockService = createMockRecoveryService();

			expect(mockService).toBeDefined();
			expect(mockService.getRecent).toBeDefined();
			expect(mockService.getAll).toBeDefined();
			expect(mockService.restore).toBeDefined();
			expect(mockService.onSnapshotCreated).toBeDefined();
		});

		it("should allow overriding getRecent implementation", async () => {
			const customSnapshots: RecoverySnapshot[] = [
				{
					id: "custom-1",
					timestamp: Date.now(),
					name: "Custom checkpoint",
					anchorFile: "test.ts",
					files: [{ path: "test.ts", size: 100 }],
					totalSize: 100,
					trigger: "manual",
				},
			];

			const mockService = createMockRecoveryService({
				getRecent: vi.fn().mockResolvedValue(customSnapshots),
			});

			const result = await mockService.getRecent(5);
			expect(result).toEqual(customSnapshots);
			expect(mockService.getRecent).toHaveBeenCalledWith(5);
		});

		it("should allow overriding getAll implementation", async () => {
			const filter: SnapshotFilter = { trigger: "manual" };
			const mockService = createMockRecoveryService({
				getAll: vi.fn().mockResolvedValue([]),
			});

			await mockService.getAll(filter);
			expect(mockService.getAll).toHaveBeenCalledWith(filter);
		});

		it("should allow overriding restore implementation", async () => {
			const mockService = createMockRecoveryService({
				restore: vi.fn().mockResolvedValue(undefined),
			});

			await mockService.restore("snap-123", "src/test.ts");
			expect(mockService.restore).toHaveBeenCalledWith("snap-123", "src/test.ts");
		});

		it("should provide a mock onSnapshotCreated event", () => {
			const mockService = createMockRecoveryService();

			expect(mockService.onSnapshotCreated).toBeDefined();
			expect(typeof mockService.onSnapshotCreated).toBe("function");

			// Test event subscription
			const listener = vi.fn();
			const disposable = mockService.onSnapshotCreated(listener);
			expect(disposable).toBeDefined();
			expect(disposable.dispose).toBeDefined();
		});

		it("should fire onSnapshotCreated event when using fireSnapshotCreated utility", () => {
			const mockService = createMockRecoveryService();
			const listener = vi.fn();

			mockService.onSnapshotCreated(listener);

			// Utility method to trigger event (provided by factory)
			const testSnapshot: RecoverySnapshot = {
				id: "event-test",
				timestamp: Date.now(),
				name: "Event test",
				anchorFile: "test.ts",
				files: [],
				totalSize: 0,
				trigger: "auto",
			};

			// The factory should expose a way to trigger the event for testing
			if ("_fireSnapshotCreated" in mockService) {
				(mockService as any)._fireSnapshotCreated(testSnapshot);
				expect(listener).toHaveBeenCalledWith(testSnapshot);
			}
		});
	});

	describe("createMockSessionStatsProvider", () => {
		it("should create a mock session stats provider with default behavior", () => {
			const mockProvider = createMockSessionStatsProvider();

			expect(mockProvider).toBeDefined();
			expect(mockProvider.getStats).toBeDefined();
			expect(mockProvider.onStatsChanged).toBeDefined();
		});

		it("should allow overriding getStats implementation", async () => {
			const customStats: SessionStats = {
				duration: 30000,
				snapshotCount: 5,
				filesModified: 10,
				linesChanged: 250,
				tokensEstimated: 5000,
			};

			const mockProvider = createMockSessionStatsProvider({
				getStats: vi.fn().mockResolvedValue(customStats),
			});

			const result = await mockProvider.getStats();
			expect(result).toEqual(customStats);
		});

		it("should provide a mock onStatsChanged event", () => {
			const mockProvider = createMockSessionStatsProvider();

			expect(mockProvider.onStatsChanged).toBeDefined();
			expect(typeof mockProvider.onStatsChanged).toBe("function");

			// Test event subscription
			const listener = vi.fn();
			const disposable = mockProvider.onStatsChanged(listener);
			expect(disposable).toBeDefined();
			expect(disposable.dispose).toBeDefined();
		});

		it("should fire onStatsChanged event when using fireStatsChanged utility", () => {
			const mockProvider = createMockSessionStatsProvider();
			const listener = vi.fn();

			mockProvider.onStatsChanged(listener);

			const testStats: SessionStats = {
				duration: 60000,
				snapshotCount: 3,
				filesModified: 7,
				linesChanged: 150,
				tokensEstimated: 3000,
			};

			// The factory should expose a way to trigger the event for testing
			if ("_fireStatsChanged" in mockProvider) {
				(mockProvider as any)._fireStatsChanged(testStats);
				expect(listener).toHaveBeenCalledWith(testStats);
			}
		});
	});

	describe("Recovery Fixtures", () => {
		it("should provide mockRecoverySnapshots fixture", () => {
			expect(mockRecoverySnapshots).toBeDefined();
			expect(Array.isArray(mockRecoverySnapshots)).toBe(true);
			expect(mockRecoverySnapshots.length).toBeGreaterThan(0);

			// Validate structure of first snapshot
			const snapshot = mockRecoverySnapshots[0];
			expect(snapshot).toHaveProperty("id");
			expect(snapshot).toHaveProperty("timestamp");
			expect(snapshot).toHaveProperty("name");
			expect(snapshot).toHaveProperty("anchorFile");
			expect(snapshot).toHaveProperty("files");
			expect(snapshot).toHaveProperty("totalSize");
			expect(snapshot).toHaveProperty("trigger");
			expect(typeof snapshot.timestamp).toBe("number");
			expect(Array.isArray(snapshot.files)).toBe(true);
		});

		it("should provide snapshots with different trigger types", () => {
			const triggers = mockRecoverySnapshots.map((s) => s.trigger);
			const uniqueTriggers = new Set(triggers);

			// Should have multiple trigger types for realistic testing
			expect(uniqueTriggers.size).toBeGreaterThan(1);
			expect(triggers).toContain("manual");
		});

		it("should provide mockSessionStats fixture", () => {
			expect(mockSessionStats).toBeDefined();
			expect(mockSessionStats).toHaveProperty("duration");
			expect(mockSessionStats).toHaveProperty("snapshotCount");
			expect(mockSessionStats).toHaveProperty("filesModified");
			expect(mockSessionStats).toHaveProperty("linesChanged");
			expect(mockSessionStats).toHaveProperty("tokensEstimated");

			// Validate types
			expect(typeof mockSessionStats.duration).toBe("number");
			expect(typeof mockSessionStats.snapshotCount).toBe("number");
			expect(typeof mockSessionStats.filesModified).toBe("number");
			expect(typeof mockSessionStats.linesChanged).toBe("number");
			expect(typeof mockSessionStats.tokensEstimated).toBe("number");

			// Validate reasonable values
			expect(mockSessionStats.duration).toBeGreaterThan(0);
			expect(mockSessionStats.snapshotCount).toBeGreaterThanOrEqual(0);
		});
	});

	describe("Mock Integration Tests", () => {
		it("should integrate mocks with fixtures seamlessly", async () => {
			const mockService = createMockRecoveryService({
				getRecent: vi.fn().mockResolvedValue(mockRecoverySnapshots.slice(0, 5)),
			});

			const snapshots = await mockService.getRecent(5);
			expect(snapshots.length).toBeLessThanOrEqual(5);
			expect(snapshots[0]).toMatchObject({
				id: expect.any(String),
				timestamp: expect.any(Number),
				name: expect.any(String),
			});
		});

		it("should support typical recovery workflow testing", async () => {
			const mockService = createMockRecoveryService({
				getRecent: vi.fn().mockResolvedValue(mockRecoverySnapshots.slice(0, 3)),
				restore: vi.fn().mockResolvedValue(undefined),
			});

			// 1. Get recent snapshots
			const snapshots = await mockService.getRecent(10);
			expect(snapshots.length).toBe(3);

			// 2. Restore from first snapshot
			const firstSnapshot = snapshots[0];
			await mockService.restore(firstSnapshot.id, firstSnapshot.anchorFile);

			// 3. Verify restore was called correctly
			expect(mockService.restore).toHaveBeenCalledWith(
				firstSnapshot.id,
				firstSnapshot.anchorFile,
			);
		});

		it("should support session stats workflow testing", async () => {
			const mockProvider = createMockSessionStatsProvider({
				getStats: vi.fn().mockResolvedValue(mockSessionStats),
			});

			const stats = await mockProvider.getStats();

			expect(stats.duration).toBe(mockSessionStats.duration);
			expect(stats.snapshotCount).toBe(mockSessionStats.snapshotCount);
			expect(mockProvider.getStats).toHaveBeenCalledTimes(1);
		});
	});
});
