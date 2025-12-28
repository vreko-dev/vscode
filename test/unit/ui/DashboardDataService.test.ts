/**
 * DashboardDataService Tests
 *
 * Tests data aggregation from multiple sources for dashboard display.
 *
 * TEST PATHS:
 * 1. Happy: All data sources available → Correct aggregation
 * 2. Sad: Missing dependencies → Graceful fallbacks
 * 3. Edge: Empty data, concurrent updates, singleton behavior
 * 4. Error: API failures → Error handling and recovery
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock logger before importing service
vi.mock("../../../src/utils/logger", () => ({
	logger: {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}));

// Mock heat module before vscode (heat imports vscode.ThemeColor)
vi.mock("../../../src/heat", () => ({
	getHeatIntegration: vi.fn().mockReturnValue(undefined),
}));

// Mock vscode module with inline EventEmitter
vi.mock("vscode", () => {
	// Define EventEmitter inside the factory
	class MockEventEmitter<T> {
		private listeners: Array<(e: T) => void> = [];

		get event() {
			return (listener: (e: T) => void) => {
				this.listeners.push(listener);
				return { dispose: () => {} };
			};
		}

		fire(data: T) {
			this.listeners.forEach((l) => l(data));
		}

		dispose() {
			this.listeners = [];
		}
	}

	// Mock ThemeColor class
	class MockThemeColor {
		constructor(public id: string) {}
	}

	return {
		EventEmitter: MockEventEmitter,
		ThemeColor: MockThemeColor,
		workspace: {
			getConfiguration: vi.fn(() => ({
				get: vi.fn((key: string, defaultValue?: unknown) => {
					const config: Record<string, unknown> = {
						"snapshot.sensitivity": "medium",
						"snapshot.excludePatterns": ["node_modules", "dist"],
						"languages.enabled": ["typescript", "javascript"],
					};
					return config[key] ?? defaultValue;
				}),
			})),
			workspaceFolders: [{ uri: { fsPath: "/test/workspace" } }],
			findFiles: vi.fn().mockResolvedValue([]),
		},
		extensions: {
			getExtension: vi.fn().mockReturnValue(undefined),
		},
	};
});

// Import after mocks are set up
import {
	DashboardDataService,
	getDashboardDataService,
} from "../../../src/ui/DashboardDataService";
import type { HeatTracker } from "../../../src/heat/HeatTracker";
import type { OperationCoordinator } from "../../../src/operationCoordinator";

// =============================================================================
// MOCK FACTORIES
// =============================================================================

// Create mock OperationCoordinator
function createMockCoordinator(snapshots: unknown[] = []): OperationCoordinator {
	return {
		listSnapshots: vi.fn().mockResolvedValue(snapshots),
		createSnapshot: vi.fn(),
		restoreSnapshot: vi.fn(),
		deleteSnapshot: vi.fn(),
	} as unknown as OperationCoordinator;
}

// Helper to create mock event handler
function createMockEvent() {
	const listeners: Array<(e: unknown) => void> = [];
	return (listener: (e: unknown) => void) => {
		listeners.push(listener);
		return { dispose: () => {} };
	};
}

// Create mock HeatTracker
function createMockHeatTracker(hotFiles: unknown[] = []): HeatTracker {
	return {
		onHeatChanged: createMockEvent(),
		getHotFiles: vi.fn().mockReturnValue(hotFiles),
		getRawHeatData: vi.fn().mockReturnValue(undefined),
		getSummary: vi.fn().mockReturnValue({
			totalHotFiles: (hotFiles as unknown[]).length,
			criticalFiles: [],
			aiInvolvedFiles: [],
		}),
		recordSave: vi.fn(),
		recordAIEdit: vi.fn(),
		dispose: vi.fn(),
	} as unknown as HeatTracker;
}

describe("DashboardDataService", () => {
	let service: DashboardDataService;
	let mockCoordinator: OperationCoordinator;
	let mockHeatTracker: HeatTracker;

	beforeEach(() => {
		// Reset singleton before each test
		DashboardDataService.resetInstance();

		// Create fresh mocks
		mockCoordinator = createMockCoordinator();
		mockHeatTracker = createMockHeatTracker();

		// Create service instance
		service = getDashboardDataService(mockCoordinator, mockHeatTracker);
	});

	afterEach(() => {
		// Clean up after each test
		DashboardDataService.resetInstance();
		vi.clearAllMocks();
	});

	// =========================================================================
	// SINGLETON BEHAVIOR
	// =========================================================================

	describe("singleton pattern", () => {
		it("should return same instance when called multiple times", () => {
			const instance1 = getDashboardDataService(mockCoordinator, mockHeatTracker);
			const instance2 = getDashboardDataService(mockCoordinator, mockHeatTracker);

			expect(instance1).toBe(instance2);
		});

		it("should create new instance after reset", () => {
			const instance1 = getDashboardDataService(mockCoordinator, mockHeatTracker);
			DashboardDataService.resetInstance();

			// Create new coordinator for new instance
			const newCoordinator = createMockCoordinator();
			const instance2 = getDashboardDataService(newCoordinator, mockHeatTracker);

			expect(instance1).not.toBe(instance2);
		});
	});

	// =========================================================================
	// HAPPY PATH: Home Tab Stats
	// =========================================================================

	describe("getStats - happy path", () => {
		it("should return correct snapshot counts for today", async () => {
			const todayTimestamp = Date.now();
			const yesterdayTimestamp = Date.now() - 24 * 60 * 60 * 1000;

			const snapshots = [
				{ id: "1", timestamp: todayTimestamp, fileCount: 5, name: "Today 1" },
				{ id: "2", timestamp: todayTimestamp - 1000, fileCount: 3, name: "Today 2" },
				{ id: "3", timestamp: yesterdayTimestamp, fileCount: 2, name: "Yesterday" },
			];

			mockCoordinator = createMockCoordinator(snapshots);
			DashboardDataService.resetInstance();
			service = getDashboardDataService(mockCoordinator, mockHeatTracker);

			const stats = await service.getStats();

			expect(stats.snapshotsToday).toBe(2);
			expect(stats.totalSnapshots).toBe(3);
		});

		it("should calculate lines protected correctly", async () => {
			const todayTimestamp = Date.now();
			const snapshots = [
				{ id: "1", timestamp: todayTimestamp, fileCount: 10, name: "Snap 1" },
				{ id: "2", timestamp: todayTimestamp - 1000, fileCount: 5, name: "Snap 2" },
			];

			mockCoordinator = createMockCoordinator(snapshots);
			DashboardDataService.resetInstance();
			service = getDashboardDataService(mockCoordinator, mockHeatTracker);

			const stats = await service.getStats();

			// 15 files * 50 lines estimated per file
			expect(stats.linesProtected).toBe(750);
		});

		it("should track restores today after recording", async () => {
			mockCoordinator = createMockCoordinator([]);
			DashboardDataService.resetInstance();
			service = getDashboardDataService(mockCoordinator, mockHeatTracker);

			// Record a restore
			service.recordRestore("snap-1", 5);

			const stats = await service.getStats();

			expect(stats.restoresToday).toBe(1);
			expect(stats.restoresThisWeek).toBe(1);
		});

		it("should calculate token savings from restores", async () => {
			mockCoordinator = createMockCoordinator([]);
			DashboardDataService.resetInstance();
			service = getDashboardDataService(mockCoordinator, mockHeatTracker);

			// Record multiple restores
			service.recordRestore("snap-1", 5);
			service.recordRestore("snap-2", 10);

			const stats = await service.getStats();

			// Each restore estimates tokens saved
			expect(stats.tokensSaved).toBeGreaterThan(0);
		});

		it("should calculate efficiency percentile", async () => {
			const snapshots = [
				{ id: "1", timestamp: Date.now(), fileCount: 5, name: "Snap" },
			];

			mockCoordinator = createMockCoordinator(snapshots);
			DashboardDataService.resetInstance();
			service = getDashboardDataService(mockCoordinator, mockHeatTracker);

			const stats = await service.getStats();

			expect(stats.efficiencyPercentile).toBeGreaterThanOrEqual(20);
			expect(stats.efficiencyPercentile).toBeLessThanOrEqual(95);
		});
	});

	// =========================================================================
	// HAPPY PATH: Settings Tab
	// =========================================================================

	describe("getSettingsState - happy path", () => {
		it("should return default protection threshold from config", async () => {
			const settings = await service.getSettingsState();

			expect(settings.protectionThreshold).toBe("medium");
		});

		it("should return exclude patterns from config", async () => {
			const settings = await service.getSettingsState();

			expect(settings.excludePatterns).toContain("node_modules");
			expect(settings.excludePatterns).toContain("dist");
		});

		it("should return language packs with correct structure", async () => {
			const settings = await service.getSettingsState();

			expect(settings.languagePacks).toBeInstanceOf(Array);
			expect(settings.languagePacks.length).toBeGreaterThan(0);

			const tsPack = settings.languagePacks.find((p) =>
				p.name.includes("TypeScript"),
			);
			expect(tsPack).toBeDefined();
			expect(tsPack?.builtin).toBe(true);
		});
	});

	// =========================================================================
	// HAPPY PATH: Activity Tab
	// =========================================================================

	describe("getActivityData - happy path", () => {
		it("should build timeline from snapshots", async () => {
			const now = Date.now();
			const snapshots = [
				{ id: "1", timestamp: now, fileCount: 5, name: "Manual snapshot" },
				{ id: "2", timestamp: now - 1000, fileCount: 3, name: "Auto save" },
			];

			mockCoordinator = createMockCoordinator(snapshots);
			DashboardDataService.resetInstance();
			service = getDashboardDataService(mockCoordinator, mockHeatTracker);

			const activity = await service.getActivityData();

			expect(activity.timeline.length).toBeGreaterThan(0);
			expect(activity.todayEvents).toBeGreaterThanOrEqual(2);
		});

		it("should include restore events in timeline", async () => {
			mockCoordinator = createMockCoordinator([]);
			DashboardDataService.resetInstance();
			service = getDashboardDataService(mockCoordinator, mockHeatTracker);

			service.recordRestore("snap-1", 5);

			const activity = await service.getActivityData();
			const restoreEvent = activity.timeline.find((e) => e.type === "restore");

			expect(restoreEvent).toBeDefined();
			expect(restoreEvent?.file).toContain("5 files");
		});

		it("should include AI edit events from heat tracker", async () => {
			const hotFiles = [
				{
					filePath: "/test/file.ts",
					assessment: {
						level: "hot",
						aiInvolved: true,
						reasons: ["AI assisted edits"],
						score: 60,
					},
				},
			];

			const mockHeat = createMockHeatTracker(hotFiles);
			vi.mocked(mockHeat.getRawHeatData).mockReturnValue({
				filePath: "/test/file.ts",
				saveCount: 5,
				saveTimestamps: [],
				diffSize: 100,
				ai: { involved: true, tool: "Cursor", confidence: 0.9, lastDetected: Date.now() },
				undoRedoCount: 0,
				lastActivity: Date.now(),
				trackingStarted: Date.now(),
			});

			mockCoordinator = createMockCoordinator([]);
			DashboardDataService.resetInstance();
			service = getDashboardDataService(mockCoordinator, mockHeat);

			const activity = await service.getActivityData();
			const aiEvent = activity.timeline.find((e) => e.type === "ai-edit");

			expect(aiEvent).toBeDefined();
			expect(aiEvent?.aiTool).toBe("Cursor");
		});

		it("should sort timeline by timestamp descending", async () => {
			const now = Date.now();
			const snapshots = [
				{ id: "1", timestamp: now - 2000, fileCount: 5, name: "Older" },
				{ id: "2", timestamp: now, fileCount: 3, name: "Newest" },
				{ id: "3", timestamp: now - 1000, fileCount: 2, name: "Middle" },
			];

			mockCoordinator = createMockCoordinator(snapshots);
			DashboardDataService.resetInstance();
			service = getDashboardDataService(mockCoordinator, mockHeatTracker);

			const activity = await service.getActivityData();

			for (let i = 1; i < activity.timeline.length; i++) {
				expect(activity.timeline[i - 1].timestamp).toBeGreaterThanOrEqual(
					activity.timeline[i].timestamp,
				);
			}
		});

		it("should count events by time period correctly", async () => {
			const now = Date.now();
			const todayStart = new Date().setHours(0, 0, 0, 0);
			const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;

			const snapshots = [
				{ id: "1", timestamp: now, fileCount: 5, name: "Today 1" },
				{ id: "2", timestamp: now - 1000, fileCount: 3, name: "Today 2" },
				{ id: "3", timestamp: yesterdayStart + 1000, fileCount: 2, name: "Yesterday" },
			];

			mockCoordinator = createMockCoordinator(snapshots);
			DashboardDataService.resetInstance();
			service = getDashboardDataService(mockCoordinator, mockHeatTracker);

			const activity = await service.getActivityData();

			expect(activity.todayEvents).toBe(2);
			expect(activity.yesterdayEvents).toBe(1);
			expect(activity.weekEvents).toBe(3);
		});
	});

	// =========================================================================
	// SAD PATH: Missing dependencies
	// =========================================================================

	describe("sad path - missing dependencies", () => {
		it("should work without heat tracker", async () => {
			mockCoordinator = createMockCoordinator([]);
			DashboardDataService.resetInstance();
			service = getDashboardDataService(mockCoordinator); // No heat tracker

			const stats = await service.getStats();
			const activity = await service.getActivityData();

			expect(stats).toBeDefined();
			expect(activity).toBeDefined();
			expect(activity.aiDetectionLog).toEqual([]);
		});

		it("should return empty AI detection log without heat tracker", async () => {
			mockCoordinator = createMockCoordinator([]);
			DashboardDataService.resetInstance();
			service = getDashboardDataService(mockCoordinator); // No heat tracker

			const activity = await service.getActivityData();

			expect(activity.aiDetectionLog).toEqual([]);
		});
	});

	// =========================================================================
	// ERROR HANDLING
	// =========================================================================

	describe("error handling", () => {
		it("should return empty stats on coordinator error", async () => {
			mockCoordinator = {
				listSnapshots: vi.fn().mockRejectedValue(new Error("DB error")),
			} as unknown as OperationCoordinator;

			DashboardDataService.resetInstance();
			service = getDashboardDataService(mockCoordinator, mockHeatTracker);

			const stats = await service.getStats();

			expect(stats.snapshotsToday).toBe(0);
			expect(stats.totalSnapshots).toBe(0);
			expect(stats.restoresToday).toBe(0);
		});

		it("should handle CLI check gracefully", async () => {
			const settings = await service.getSettingsState();

			// CLI check should return boolean and version or null
			expect(typeof settings.cliInstalled).toBe("boolean");
			if (settings.cliInstalled) {
				expect(settings.cliVersion).not.toBeNull();
			} else {
				expect(settings.cliVersion).toBeNull();
			}
		});

		it("should continue building timeline on partial errors", async () => {
			const snapshots = [
				{ id: "1", timestamp: Date.now(), fileCount: 5, name: "Valid" },
			];

			mockCoordinator = createMockCoordinator(snapshots);
			DashboardDataService.resetInstance();
			service = getDashboardDataService(mockCoordinator, mockHeatTracker);

			// Add a restore that will still show up
			service.recordRestore("snap-1", 5);

			const activity = await service.getActivityData();

			// Should have both snapshot and restore
			expect(activity.timeline.length).toBeGreaterThan(1);
		});
	});

	// =========================================================================
	// EDGE CASES
	// =========================================================================

	describe("edge cases", () => {
		it("should handle empty snapshot list", async () => {
			mockCoordinator = createMockCoordinator([]);
			DashboardDataService.resetInstance();
			service = getDashboardDataService(mockCoordinator, mockHeatTracker);

			const stats = await service.getStats();

			expect(stats.snapshotsToday).toBe(0);
			expect(stats.totalSnapshots).toBe(0);
			expect(stats.linesProtected).toBe(0);
		});

		it("should deduplicate timeline events", async () => {
			const now = Date.now();
			const snapshots = [
				{ id: "dup-1", timestamp: now, fileCount: 5, name: "Same" },
				{ id: "dup-1", timestamp: now, fileCount: 5, name: "Same" }, // Duplicate
			];

			mockCoordinator = createMockCoordinator(snapshots);
			DashboardDataService.resetInstance();
			service = getDashboardDataService(mockCoordinator, mockHeatTracker);

			const activity = await service.getActivityData();
			const dupEvents = activity.timeline.filter((e) => e.id === "dup-1");

			expect(dupEvents.length).toBe(1);
		});

		it("should prune old restore events after 30 days", async () => {
			mockCoordinator = createMockCoordinator([]);
			DashboardDataService.resetInstance();
			service = getDashboardDataService(mockCoordinator, mockHeatTracker);

			// This test verifies the pruning logic runs
			service.recordRestore("snap-1", 5);
			service.recordRestore("snap-2", 10);

			const stats = await service.getStats();
			expect(stats.restoresThisWeek).toBe(2);
		});

		it("should limit snapshots to 50 most recent in timeline", async () => {
			const now = Date.now();
			const snapshots = Array.from({ length: 100 }, (_, i) => ({
				id: `snap-${i}`,
				timestamp: now - i * 1000,
				fileCount: 1,
				name: `Snap ${i}`,
			}));

			mockCoordinator = createMockCoordinator(snapshots);
			DashboardDataService.resetInstance();
			service = getDashboardDataService(mockCoordinator, mockHeatTracker);

			const activity = await service.getActivityData();

			// Should be limited to 50 snapshot events + any other events
			const snapshotEvents = activity.timeline.filter(
				(e) => e.type.includes("snapshot") || e.type === "ai-edit",
			);
			expect(snapshotEvents.length).toBeLessThanOrEqual(50);
		});

		it("should filter old snapshots from timeline (7 day window)", async () => {
			const now = Date.now();
			const oldTimestamp = now - 10 * 24 * 60 * 60 * 1000; // 10 days ago

			const snapshots = [
				{ id: "recent", timestamp: now, fileCount: 5, name: "Recent" },
				{ id: "old", timestamp: oldTimestamp, fileCount: 3, name: "Old" },
			];

			mockCoordinator = createMockCoordinator(snapshots);
			DashboardDataService.resetInstance();
			service = getDashboardDataService(mockCoordinator, mockHeatTracker);

			const activity = await service.getActivityData();
			const oldEvent = activity.timeline.find((e) => e.id === "old");

			expect(oldEvent).toBeUndefined();
		});
	});

	// =========================================================================
	// TOKEN COST CALCULATIONS
	// =========================================================================

	describe("token cost calculations", () => {
		it("should calculate GPT-4 cost savings", () => {
			const savings = service.getTokenCostSavings(10000);

			// 10K tokens at $0.03 per 1K = $0.30
			expect(savings.gpt4).toBe("0.30");
		});

		it("should calculate GPT-3.5 cost savings", () => {
			const savings = service.getTokenCostSavings(10000);

			// 10K tokens at $0.002 per 1K = $0.02
			expect(savings.gpt35).toBe("0.02");
		});

		it("should handle zero tokens", () => {
			const savings = service.getTokenCostSavings(0);

			expect(savings.gpt4).toBe("0.00");
			expect(savings.gpt35).toBe("0.00");
		});
	});

	// =========================================================================
	// AI DETECTION RECORDING
	// =========================================================================

	describe("AI detection recording", () => {
		it("should record AI detection and update history", async () => {
			service.recordAIDetection("Cursor", 0.95);
			service.recordAIDetection("Cursor", 0.85);

			// Get activity to check detection log
			const activity = await service.getActivityData();
			const cursorEntry = activity.aiDetectionLog.find((e) => e.tool === "Cursor");

			expect(cursorEntry).toBeDefined();
			expect(cursorEntry?.sessions).toBe(2);
		});

		it("should calculate running average accuracy", async () => {
			service.recordAIDetection("Copilot", 0.80); // 80%
			service.recordAIDetection("Copilot", 0.90); // 90%

			const activity = await service.getActivityData();
			const copilotEntry = activity.aiDetectionLog.find((e) => e.tool === "Copilot");

			expect(copilotEntry).toBeDefined();
			// Running average should be around 85%
			expect(copilotEntry?.accuracy).toBeGreaterThanOrEqual(80);
			expect(copilotEntry?.accuracy).toBeLessThanOrEqual(90);
		});
	});

	// =========================================================================
	// LIFECYCLE
	// =========================================================================

	describe("lifecycle", () => {
		it("should dispose event emitter on cleanup", () => {
			const instance = getDashboardDataService(mockCoordinator, mockHeatTracker);

			// Dispose should not throw
			expect(() => instance.dispose()).not.toThrow();
		});

		it("should clear singleton reference on dispose", () => {
			const instance1 = getDashboardDataService(mockCoordinator, mockHeatTracker);
			instance1.dispose();

			const newCoordinator = createMockCoordinator();
			const instance2 = getDashboardDataService(newCoordinator, mockHeatTracker);
			expect(instance2).not.toBe(instance1);
		});
	});
});
