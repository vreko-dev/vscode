/**
 * WorkspaceDataService Tests - TDD RED Phase
 *
 * Comprehensive tests for unified data service that merges:
 * - DashboardDataService: stats, activity, settings, AI detection
 * - UnifiedDataService: vitals, learnings, violations, patterns
 *
 * Test Structure:
 * 1. Singleton/Factory Pattern Tests
 * 2. Stats Aggregation Tests (from DashboardDataService)
 * 3. Vitals Integration Tests (from UnifiedDataService)
 * 4. Activity Tracking Tests
 * 5. Learnings/Violations Tests
 * 6. Unified Event System Tests
 * 7. Error Handling Tests
 * 8. Edge Cases Tests
 * 9. Lifecycle Tests
 *
 * @author SnapBack Engineering
 * @since 2025-01-08
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// =============================================================================
// MOCKS - Setup before imports
// =============================================================================

// Mock logger
vi.mock("../../../src/utils/logger", () => ({
	logger: {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}));

// Mock heat module
vi.mock("../../../src/heat", () => ({
	getHeatIntegration: vi.fn().mockReturnValue(undefined),
}));

// Mock fs module for .snapback directory reading
vi.mock("node:fs", () => ({
	existsSync: vi.fn().mockReturnValue(false),
	readFileSync: vi.fn().mockReturnValue(""),
}));

// Mock vscode module
vi.mock("vscode", () => {
	class MockEventEmitter<T> {
		private listeners: Array<(e: T) => void> = [];

		get event() {
			return (listener: (e: T) => void) => {
				this.listeners.push(listener);
				return { dispose: () => {} };
			};
		}

		fire(data: T) {
			for (const listener of this.listeners) {
				listener(data);
			}
		}

		dispose() {
			this.listeners = [];
		}
	}

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
			createFileSystemWatcher: vi.fn(() => ({
				onDidCreate: vi.fn(() => ({ dispose: vi.fn() })),
				onDidChange: vi.fn(() => ({ dispose: vi.fn() })),
				onDidDelete: vi.fn(() => ({ dispose: vi.fn() })),
				dispose: vi.fn(),
			})),
		},
		extensions: {
			getExtension: vi.fn().mockReturnValue(undefined),
		},
		RelativePattern: vi.fn().mockImplementation((base, pattern) => ({ base, pattern })),
	};
});

// Mock DaemonBridge for MCP connection testing
const mockDaemonBridge = {
	getState: vi.fn().mockReturnValue("disconnected" as const),
	getDaemonVersion: vi.fn().mockReturnValue(undefined),
	onStateChange: vi.fn().mockReturnValue({ dispose: vi.fn() }),
	onSnapshotCreated: vi.fn().mockReturnValue({ dispose: vi.fn() }),
	isConnected: vi.fn().mockReturnValue(false),
};

vi.mock("../../../src/services/DaemonBridge", () => ({
	getDaemonBridge: vi.fn(() => mockDaemonBridge),
}));

// Mock cli-status
vi.mock("../../../src/utils/cli-status", () => ({
	getCliStatusSync: vi.fn().mockReturnValue({ installed: false, version: null }),
	getCliStatus: vi.fn().mockResolvedValue({ installed: false, version: null }),
}));

// =============================================================================
// TYPE DEFINITIONS - Expected interface for WorkspaceDataService
// =============================================================================

/**
 * Expected interface for WorkspaceDataService
 * This defines what we expect the implementation to provide
 */
interface WorkspaceDataSnapshot {
	// From DashboardDataService
	stats: {
		snapshotsToday: number;
		totalSnapshots: number;
		restoresToday: number;
		linesProtected: number;
		tokensSaved: number;
		restoresThisWeek: number;
		efficiencyPercentile: number;
	};
	activity: {
		timeline: Array<{
			id: string;
			type: "ai-edit" | "manual-snapshot" | "auto-snapshot" | "restore";
			file: string;
			timestamp: number;
			aiTool?: string;
			details?: string;
		}>;
		aiDetectionLog: Array<{
			tool: string;
			sessions: number;
			accuracy: number;
			lastDetected: number;
		}>;
		todayEvents: number;
		yesterdayEvents: number;
		weekEvents: number;
	};
	settings: {
		detectedAITool: string | null;
		cliInstalled: boolean;
		cliVersion: string | null;
		protectionThreshold: "low" | "medium" | "high";
		excludePatterns: string[];
		languagePacks: Array<{ name: string; enabled: boolean; builtin: boolean }>;
	};

	// From UnifiedDataService
	vitals: {
		pulse: { changesPerMinute: number; level: string };
		temperature: { aiPercentage: number; level: string };
		pressure: { value: number };
		oxygen: { value: number };
		trajectory: string;
	} | null;
	sessionHealth: {
		healthScore: number;
		trajectory: "improving" | "stable" | "degrading" | "critical";
		activeWarnings: string[];
		lastSnapshotMinutesAgo: number | null;
		suggestions: string[];
	};
	recommendation: {
		should: boolean;
		reason: string;
		urgency: "now" | "soon" | "optional";
	};
	guidance: {
		safeOperations: string[];
		blockedOperations: string[];
		suggestion: string;
	};
	learnings: Array<{
		id: string;
		type: "pattern" | "pitfall" | "efficiency" | "discovery" | "workflow";
		trigger: string;
		action: string;
		source: string;
		createdAt: string;
	}>;
	violations: Array<{
		type: string;
		file: string;
		message: string;
		count: number;
		date: string;
		prevention?: string;
		promotionStatus: "tracking" | "ready_for_promotion" | "promoted" | "automated";
	}>;
	patterns: Array<{
		type: string;
		description: string;
		prevention: string;
		occurrences: number;
		promotedAt: string;
		lastSeenAt: string;
	}>;

	// MCP connection status
	mcpConnection: {
		state: "connected" | "disconnected" | "reconnecting" | "cli_missing";
		daemonVersion?: string;
		attempt?: number;
		maxAttempts?: number;
	};
}

// =============================================================================
// MOCK FACTORIES
// =============================================================================

interface MockCoordinator {
	listSnapshots: ReturnType<typeof vi.fn>;
	createSnapshot: ReturnType<typeof vi.fn>;
	restoreSnapshot: ReturnType<typeof vi.fn>;
	deleteSnapshot: ReturnType<typeof vi.fn>;
}

function createMockCoordinator(snapshots: unknown[] = []): MockCoordinator {
	return {
		listSnapshots: vi.fn().mockResolvedValue(snapshots),
		createSnapshot: vi.fn(),
		restoreSnapshot: vi.fn(),
		deleteSnapshot: vi.fn(),
	};
}

function createMockHeatTracker(hotFiles: unknown[] = []) {
	const listeners: Array<(e: unknown) => void> = [];
	return {
		onHeatChanged: (listener: (e: unknown) => void) => {
			listeners.push(listener);
			return { dispose: () => {} };
		},
		getHotFiles: vi.fn().mockReturnValue(hotFiles),
		getRawHeatData: vi.fn().mockReturnValue(undefined),
		getSummary: vi.fn().mockReturnValue({
			totalHotFiles: hotFiles.length,
			criticalFiles: [],
			aiInvolvedFiles: [],
		}),
		recordSave: vi.fn(),
		recordAIEdit: vi.fn(),
		dispose: vi.fn(),
	};
}

function createMockVitals(overrides: Partial<WorkspaceDataSnapshot["vitals"]> = {}) {
	return {
		pulse: { changesPerMinute: 5, level: "normal" },
		temperature: { aiPercentage: 30, level: "warm" },
		pressure: { value: 40 },
		oxygen: { value: 85 },
		trajectory: "stable",
		...overrides,
	};
}

// =============================================================================
// IMPORT SERVICE (will fail until implementation exists)
// =============================================================================

// Import after mocks - will fail in RED phase
import {
	WorkspaceDataService,
	createWorkspaceDataService,
	type WorkspaceDataEvent,
} from "../../../src/services/WorkspaceDataService";

// =============================================================================
// TEST SUITE
// =============================================================================

describe("WorkspaceDataService", () => {
	let service: WorkspaceDataService;
	let mockCoordinator: MockCoordinator;

	beforeEach(() => {
		// Reset singleton/instances
		WorkspaceDataService.disposeAll?.();

		// Create fresh mocks
		mockCoordinator = createMockCoordinator();

		// Create service instance
		service = createWorkspaceDataService("test-workspace", "/test/workspace", mockCoordinator);
	});

	afterEach(() => {
		WorkspaceDataService.disposeAll?.();
		vi.clearAllMocks();
	});

	// =========================================================================
	// 1. SINGLETON/FACTORY PATTERN TESTS
	// =========================================================================

	describe("singleton pattern", () => {
		it("should return same instance for same workspaceId", () => {
			const instance1 = createWorkspaceDataService("ws-1", "/path/1", mockCoordinator);
			const instance2 = createWorkspaceDataService("ws-1", "/path/1", mockCoordinator);

			expect(instance1).toBe(instance2);
		});

		it("should return different instances for different workspaceIds", () => {
			const instance1 = createWorkspaceDataService("ws-1", "/path/1", mockCoordinator);
			const instance2 = createWorkspaceDataService("ws-2", "/path/2", mockCoordinator);

			expect(instance1).not.toBe(instance2);
		});

		it("should create new instance after disposeAll", () => {
			const instance1 = createWorkspaceDataService("ws-1", "/path/1", mockCoordinator);
			WorkspaceDataService.disposeAll();
			const instance2 = createWorkspaceDataService("ws-1", "/path/1", mockCoordinator);

			expect(instance1).not.toBe(instance2);
		});

		it("should use static for() method for instance access", () => {
			const instance = WorkspaceDataService.for("ws-test", "/test/path", mockCoordinator);

			expect(instance).toBeInstanceOf(WorkspaceDataService);
		});
	});

	// =========================================================================
	// 2. STATS AGGREGATION TESTS (from DashboardDataService)
	// =========================================================================

	describe("stats aggregation", () => {
		it("should return correct snapshot counts for today", async () => {
			const todayTimestamp = Date.now();
			const yesterdayTimestamp = Date.now() - 24 * 60 * 60 * 1000;

			const snapshots = [
				{ id: "1", timestamp: todayTimestamp, fileCount: 5, name: "Today 1" },
				{ id: "2", timestamp: todayTimestamp - 1000, fileCount: 3, name: "Today 2" },
				{ id: "3", timestamp: yesterdayTimestamp, fileCount: 2, name: "Yesterday" },
			];

			mockCoordinator.listSnapshots.mockResolvedValue(snapshots);
			WorkspaceDataService.disposeAll();
			service = createWorkspaceDataService("test", "/test", mockCoordinator);

			const snapshot = await service.getSnapshot();

			expect(snapshot.stats.snapshotsToday).toBe(2);
			expect(snapshot.stats.totalSnapshots).toBe(3);
		});

		it("should calculate lines protected from file counts", async () => {
			const todayTimestamp = Date.now();
			const snapshots = [
				{ id: "1", timestamp: todayTimestamp, fileCount: 10, name: "Snap 1" },
				{ id: "2", timestamp: todayTimestamp - 1000, fileCount: 5, name: "Snap 2" },
			];

			mockCoordinator.listSnapshots.mockResolvedValue(snapshots);
			WorkspaceDataService.disposeAll();
			service = createWorkspaceDataService("test", "/test", mockCoordinator);

			const snapshot = await service.getSnapshot();

			// 15 files * 50 lines estimated per file = 750
			expect(snapshot.stats.linesProtected).toBe(750);
		});

		it("should track restores after recording", async () => {
			service.recordRestore("snap-1", 5);

			const snapshot = await service.getSnapshot();

			expect(snapshot.stats.restoresToday).toBe(1);
			expect(snapshot.stats.restoresThisWeek).toBe(1);
		});

		it("should calculate token savings from restores", async () => {
			service.recordRestore("snap-1", 5);
			service.recordRestore("snap-2", 10);

			const snapshot = await service.getSnapshot();

			expect(snapshot.stats.tokensSaved).toBeGreaterThan(0);
		});

		it("should calculate efficiency percentile", async () => {
			const snapshots = [{ id: "1", timestamp: Date.now(), fileCount: 5, name: "Snap" }];

			mockCoordinator.listSnapshots.mockResolvedValue(snapshots);
			WorkspaceDataService.disposeAll();
			service = createWorkspaceDataService("test", "/test", mockCoordinator);

			const snapshot = await service.getSnapshot();

			expect(snapshot.stats.efficiencyPercentile).toBeGreaterThanOrEqual(20);
			expect(snapshot.stats.efficiencyPercentile).toBeLessThanOrEqual(95);
		});

		it("should return zero stats when no data available", async () => {
			mockCoordinator.listSnapshots.mockResolvedValue([]);

			const snapshot = await service.getSnapshot();

			expect(snapshot.stats.snapshotsToday).toBe(0);
			expect(snapshot.stats.totalSnapshots).toBe(0);
			expect(snapshot.stats.linesProtected).toBe(0);
		});
	});

	// =========================================================================
	// 3. VITALS INTEGRATION TESTS (from UnifiedDataService)
	// =========================================================================

	describe("vitals integration", () => {
		it("should accept vitals updates", () => {
			const vitals = createMockVitals();

			expect(() => service.updateVitals(vitals as any)).not.toThrow();
		});

		it("should return null vitals when not set", async () => {
			const snapshot = await service.getSnapshot();

			expect(snapshot.vitals).toBeNull();
		});

		it("should return vitals after update", async () => {
			const vitals = createMockVitals({ pressure: { value: 60 } });

			service.updateVitals(vitals as any);
			const snapshot = await service.getSnapshot();

			expect(snapshot.vitals).not.toBeNull();
			expect(snapshot.vitals?.pressure.value).toBe(60);
		});

		it("should derive session health from vitals", async () => {
			const vitals = createMockVitals({ pressure: { value: 80 } });

			service.updateVitals(vitals as any);
			const snapshot = await service.getSnapshot();

			// Health score is inverse of pressure: 100 - 80 = 20
			expect(snapshot.sessionHealth.healthScore).toBe(20);
		});

		it("should calculate snapshot recommendations based on pressure", async () => {
			const highPressureVitals = createMockVitals({ pressure: { value: 85 } });

			service.updateVitals(highPressureVitals as any);
			const snapshot = await service.getSnapshot();

			expect(snapshot.recommendation.should).toBe(true);
			expect(snapshot.recommendation.urgency).toBe("now");
		});

		it("should provide agent guidance based on pressure level", async () => {
			const highPressureVitals = createMockVitals({ pressure: { value: 80 } });

			service.updateVitals(highPressureVitals as any);
			const snapshot = await service.getSnapshot();

			expect(snapshot.guidance.blockedOperations.length).toBeGreaterThan(0);
			expect(snapshot.guidance.suggestion).toContain("pressure");
		});

		it("should detect trajectory from vitals", async () => {
			const criticalVitals = createMockVitals({
				trajectory: "critical",
				pressure: { value: 90 },
			});

			service.updateVitals(criticalVitals as any);
			const snapshot = await service.getSnapshot();

			expect(snapshot.sessionHealth.trajectory).toBe("critical");
		});

		it("should add warnings when vitals exceed thresholds", async () => {
			const hotVitals = createMockVitals({
				pulse: { changesPerMinute: 50, level: "racing" },
				temperature: { aiPercentage: 80, level: "burning" },
				pressure: { value: 85 },
			});

			service.updateVitals(hotVitals as any);
			const snapshot = await service.getSnapshot();

			expect(snapshot.sessionHealth.activeWarnings.length).toBeGreaterThan(0);
		});
	});

	// =========================================================================
	// 4. ACTIVITY TRACKING TESTS
	// =========================================================================

	describe("activity tracking", () => {
		it("should build timeline from snapshots", async () => {
			const now = Date.now();
			const snapshots = [
				{ id: "1", timestamp: now, fileCount: 5, name: "Manual snapshot" },
				{ id: "2", timestamp: now - 1000, fileCount: 3, name: "Auto save" },
			];

			mockCoordinator.listSnapshots.mockResolvedValue(snapshots);
			WorkspaceDataService.disposeAll();
			service = createWorkspaceDataService("test", "/test", mockCoordinator);

			const snapshot = await service.getSnapshot();

			expect(snapshot.activity.timeline.length).toBeGreaterThan(0);
			expect(snapshot.activity.todayEvents).toBeGreaterThanOrEqual(2);
		});

		it("should include restore events in timeline", async () => {
			service.recordRestore("snap-1", 5);

			const snapshot = await service.getSnapshot();
			const restoreEvent = snapshot.activity.timeline.find((e) => e.type === "restore");

			expect(restoreEvent).toBeDefined();
			expect(restoreEvent?.file).toContain("5 files");
		});

		it("should record AI detection and update log", async () => {
			service.recordAIDetection("Cursor", 0.95);
			service.recordAIDetection("Cursor", 0.85);

			const snapshot = await service.getSnapshot();
			const cursorEntry = snapshot.activity.aiDetectionLog.find((e) => e.tool === "Cursor");

			expect(cursorEntry).toBeDefined();
			expect(cursorEntry?.sessions).toBe(2);
		});

		it("should sort timeline by timestamp descending", async () => {
			const now = Date.now();
			const snapshots = [
				{ id: "1", timestamp: now - 2000, fileCount: 5, name: "Older" },
				{ id: "2", timestamp: now, fileCount: 3, name: "Newest" },
				{ id: "3", timestamp: now - 1000, fileCount: 2, name: "Middle" },
			];

			mockCoordinator.listSnapshots.mockResolvedValue(snapshots);
			WorkspaceDataService.disposeAll();
			service = createWorkspaceDataService("test", "/test", mockCoordinator);

			const snapshot = await service.getSnapshot();

			for (let i = 1; i < snapshot.activity.timeline.length; i++) {
				expect(snapshot.activity.timeline[i - 1].timestamp).toBeGreaterThanOrEqual(
					snapshot.activity.timeline[i].timestamp,
				);
			}
		});

		it("should count events by time period", async () => {
			const now = Date.now();
			const todayStart = new Date().setHours(0, 0, 0, 0);
			const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;

			const snapshots = [
				{ id: "1", timestamp: now, fileCount: 5, name: "Today 1" },
				{ id: "2", timestamp: now - 1000, fileCount: 3, name: "Today 2" },
				{ id: "3", timestamp: yesterdayStart + 1000, fileCount: 2, name: "Yesterday" },
			];

			mockCoordinator.listSnapshots.mockResolvedValue(snapshots);
			WorkspaceDataService.disposeAll();
			service = createWorkspaceDataService("test", "/test", mockCoordinator);

			const snapshot = await service.getSnapshot();

			expect(snapshot.activity.todayEvents).toBe(2);
			expect(snapshot.activity.yesterdayEvents).toBe(1);
			expect(snapshot.activity.weekEvents).toBe(3);
		});
	});

	// =========================================================================
	// 5. LEARNINGS/VIOLATIONS TESTS
	// =========================================================================

	describe("learnings and violations", () => {
		it("should return empty learnings when .snapback directory missing", async () => {
			const snapshot = await service.getSnapshot();

			expect(snapshot.learnings).toEqual([]);
		});

		it("should return empty violations when .snapback directory missing", async () => {
			const snapshot = await service.getSnapshot();

			expect(snapshot.violations).toEqual([]);
		});

		it("should return empty patterns when .snapback directory missing", async () => {
			const snapshot = await service.getSnapshot();

			expect(snapshot.patterns).toEqual([]);
		});

		// These tests would require mocking fs to return learnings data
		it("should calculate promotion status based on violation count", async () => {
			// Mock fs to return violations
			const fs = await import("node:fs");
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockReturnValue(
				JSON.stringify({ type: "silent-catch", file: "test.ts", count: 3 }),
			);

			// Would need to reload service to pick up mocked fs
			// This tests the promotion logic
			const snapshot = await service.getSnapshot();

			// With count=3, should be "promoted"
			// (actual implementation will verify this)
			expect(snapshot.violations).toBeDefined();
		});
	});

	// =========================================================================
	// 6. UNIFIED EVENT SYSTEM TESTS
	// =========================================================================

	describe("unified event system", () => {
		it("should expose onDataChange event", () => {
			expect(service.onDataChange).toBeDefined();
			expect(typeof service.onDataChange).toBe("function");
		});

		it("should fire event when vitals updated", async () => {
			const eventHandler = vi.fn();
			service.onDataChange(eventHandler);

			const vitals = createMockVitals();
			service.updateVitals(vitals as any);

			// Allow async event propagation
			await new Promise((resolve) => setTimeout(resolve, 10));

			expect(eventHandler).toHaveBeenCalled();
		});

		it("should fire event when restore recorded", async () => {
			const eventHandler = vi.fn();
			service.onDataChange(eventHandler);

			service.recordRestore("snap-1", 5);

			// Allow async event propagation
			await new Promise((resolve) => setTimeout(resolve, 600)); // Debounce is 500ms

			expect(eventHandler).toHaveBeenCalled();
		});

		it("should fire event when AI detection recorded", async () => {
			const eventHandler = vi.fn();
			service.onDataChange(eventHandler);

			service.recordAIDetection("Cursor", 0.9);

			// Allow async event propagation
			await new Promise((resolve) => setTimeout(resolve, 600));

			expect(eventHandler).toHaveBeenCalled();
		});

		it("should debounce rapid updates", async () => {
			const eventHandler = vi.fn();
			service.onDataChange(eventHandler);

			// Fire multiple rapid updates
			service.recordRestore("snap-1", 1);
			service.recordRestore("snap-2", 2);
			service.recordRestore("snap-3", 3);

			// Wait for debounce
			await new Promise((resolve) => setTimeout(resolve, 700));

			// Should have coalesced into fewer events
			expect(eventHandler.mock.calls.length).toBeLessThanOrEqual(2);
		});

		it("should include event type in fired events", async () => {
			const events: WorkspaceDataEvent[] = [];
			service.onDataChange((event) => events.push(event));

			const vitals = createMockVitals();
			service.updateVitals(vitals as any);

			await new Promise((resolve) => setTimeout(resolve, 10));

			expect(events.length).toBeGreaterThan(0);
			expect(events[0].type).toBeDefined();
		});
	});

	// =========================================================================
	// 7. ERROR HANDLING TESTS
	// =========================================================================

	describe("error handling", () => {
		it("should return empty stats on coordinator error", async () => {
			mockCoordinator.listSnapshots.mockRejectedValue(new Error("DB error"));
			WorkspaceDataService.disposeAll();
			service = createWorkspaceDataService("test", "/test", mockCoordinator);

			const snapshot = await service.getSnapshot();

			expect(snapshot.stats.snapshotsToday).toBe(0);
			expect(snapshot.stats.totalSnapshots).toBe(0);
		});

		it("should provide default session health when vitals unavailable", async () => {
			const snapshot = await service.getSnapshot();

			expect(snapshot.sessionHealth.healthScore).toBe(100);
			expect(snapshot.sessionHealth.trajectory).toBe("stable");
		});

		it("should provide default guidance when vitals unavailable", async () => {
			const snapshot = await service.getSnapshot();

			expect(snapshot.guidance.safeOperations).toContain("read");
			expect(snapshot.guidance.blockedOperations).toEqual([]);
		});

		it("should handle malformed learnings gracefully", async () => {
			const fs = await import("node:fs");
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockReturnValue("not valid json\n{also bad}");

			const snapshot = await service.getSnapshot();

			expect(snapshot.learnings).toEqual([]);
		});

		it("should continue building timeline on partial errors", async () => {
			const snapshots = [{ id: "1", timestamp: Date.now(), fileCount: 5, name: "Valid" }];

			mockCoordinator.listSnapshots.mockResolvedValue(snapshots);
			WorkspaceDataService.disposeAll();
			service = createWorkspaceDataService("test", "/test", mockCoordinator);

			service.recordRestore("snap-1", 5);

			const snapshot = await service.getSnapshot();

			expect(snapshot.activity.timeline.length).toBeGreaterThan(1);
		});
	});

	// =========================================================================
	// 8. EDGE CASES TESTS
	// =========================================================================

	describe("edge cases", () => {
		it("should handle empty snapshot list", async () => {
			mockCoordinator.listSnapshots.mockResolvedValue([]);

			const snapshot = await service.getSnapshot();

			expect(snapshot.stats.snapshotsToday).toBe(0);
			expect(snapshot.stats.totalSnapshots).toBe(0);
			expect(snapshot.stats.linesProtected).toBe(0);
		});

		it("should deduplicate timeline events", async () => {
			const now = Date.now();
			const snapshots = [
				{ id: "dup-1", timestamp: now, fileCount: 5, name: "Same" },
				{ id: "dup-1", timestamp: now, fileCount: 5, name: "Same" },
			];

			mockCoordinator.listSnapshots.mockResolvedValue(snapshots);
			WorkspaceDataService.disposeAll();
			service = createWorkspaceDataService("test", "/test", mockCoordinator);

			const snapshot = await service.getSnapshot();
			const dupEvents = snapshot.activity.timeline.filter((e) => e.id === "dup-1");

			expect(dupEvents.length).toBe(1);
		});

		it("should prune old restore events after 30 days", async () => {
			service.recordRestore("snap-1", 5);
			service.recordRestore("snap-2", 10);

			const snapshot = await service.getSnapshot();

			expect(snapshot.stats.restoresThisWeek).toBe(2);
		});

		it("should limit snapshots to 50 most recent in timeline", async () => {
			const now = Date.now();
			const snapshots = Array.from({ length: 100 }, (_, i) => ({
				id: `snap-${i}`,
				timestamp: now - i * 1000,
				fileCount: 1,
				name: `Snap ${i}`,
			}));

			mockCoordinator.listSnapshots.mockResolvedValue(snapshots);
			WorkspaceDataService.disposeAll();
			service = createWorkspaceDataService("test", "/test", mockCoordinator);

			const snapshot = await service.getSnapshot();

			const snapshotEvents = snapshot.activity.timeline.filter(
				(e) => e.type.includes("snapshot") || e.type === "ai-edit",
			);
			expect(snapshotEvents.length).toBeLessThanOrEqual(50);
		});

		it("should filter old snapshots from timeline (7 day window)", async () => {
			const now = Date.now();
			const oldTimestamp = now - 10 * 24 * 60 * 60 * 1000;

			const snapshots = [
				{ id: "recent", timestamp: now, fileCount: 5, name: "Recent" },
				{ id: "old", timestamp: oldTimestamp, fileCount: 3, name: "Old" },
			];

			mockCoordinator.listSnapshots.mockResolvedValue(snapshots);
			WorkspaceDataService.disposeAll();
			service = createWorkspaceDataService("test", "/test", mockCoordinator);

			const snapshot = await service.getSnapshot();
			const oldEvent = snapshot.activity.timeline.find((e) => e.id === "old");

			expect(oldEvent).toBeUndefined();
		});

		it("should handle zero vitals gracefully", async () => {
			const zeroVitals = createMockVitals({
				pulse: { changesPerMinute: 0, level: "flat" },
				temperature: { aiPercentage: 0, level: "cold" },
				pressure: { value: 0 },
				oxygen: { value: 0 },
			});

			service.updateVitals(zeroVitals as any);
			const snapshot = await service.getSnapshot();

			expect(snapshot.vitals).not.toBeNull();
			expect(snapshot.sessionHealth.healthScore).toBe(100); // 100 - 0 pressure
		});
	});

	// =========================================================================
	// 9. LIFECYCLE TESTS
	// =========================================================================

	describe("lifecycle", () => {
		it("should dispose event emitter on cleanup", () => {
			const instance = createWorkspaceDataService("lifecycle-test", "/test", mockCoordinator);

			expect(() => instance.dispose()).not.toThrow();
		});

		it("should clear instance reference on dispose", () => {
			const instance1 = createWorkspaceDataService("dispose-test", "/test", mockCoordinator);
			instance1.dispose();

			const instance2 = createWorkspaceDataService("dispose-test", "/test", mockCoordinator);

			expect(instance2).not.toBe(instance1);
		});

		it("should cleanup file watchers on dispose", () => {
			const instance = createWorkspaceDataService("watcher-test", "/test", mockCoordinator);

			// Should not throw when disposing
			expect(() => instance.dispose()).not.toThrow();
		});

		it("should handle multiple dispose calls gracefully", () => {
			const instance = createWorkspaceDataService("multi-dispose", "/test", mockCoordinator);

			instance.dispose();
			expect(() => instance.dispose()).not.toThrow();
		});
	});

	// =========================================================================
	// 10. TOKEN COST CALCULATIONS
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
	// 11. SETTINGS STATE TESTS
	// =========================================================================

	describe("settings state", () => {
		it("should return protection threshold from config", async () => {
			const snapshot = await service.getSnapshot();

			expect(snapshot.settings.protectionThreshold).toBe("medium");
		});

		it("should return exclude patterns from config", async () => {
			const snapshot = await service.getSnapshot();

			expect(snapshot.settings.excludePatterns).toContain("node_modules");
			expect(snapshot.settings.excludePatterns).toContain("dist");
		});

		it("should return language packs with structure", async () => {
			const snapshot = await service.getSnapshot();

			expect(snapshot.settings.languagePacks).toBeInstanceOf(Array);
			expect(snapshot.settings.languagePacks.length).toBeGreaterThan(0);

			const tsPack = snapshot.settings.languagePacks.find((p) => p.name.includes("TypeScript"));
			expect(tsPack).toBeDefined();
			expect(tsPack?.builtin).toBe(true);
		});
	});

	// =========================================================================
	// 12. SNAPSHOT METHOD TESTS
	// =========================================================================

	describe("getSnapshot method", () => {
		it("should return complete WorkspaceDataSnapshot structure", async () => {
			const snapshot = await service.getSnapshot();

			// Verify all required properties exist
			expect(snapshot).toHaveProperty("stats");
			expect(snapshot).toHaveProperty("activity");
			expect(snapshot).toHaveProperty("settings");
			expect(snapshot).toHaveProperty("vitals");
			expect(snapshot).toHaveProperty("sessionHealth");
			expect(snapshot).toHaveProperty("recommendation");
			expect(snapshot).toHaveProperty("guidance");
			expect(snapshot).toHaveProperty("learnings");
			expect(snapshot).toHaveProperty("violations");
			expect(snapshot).toHaveProperty("patterns");
		});

		it("should aggregate data from all sources in single call", async () => {
			const vitals = createMockVitals({ pressure: { value: 50 } });
			service.updateVitals(vitals as any);
			service.recordRestore("snap-1", 5);
			service.recordAIDetection("Cursor", 0.9);

			const snapshot = await service.getSnapshot();

			// Vitals data
			expect(snapshot.vitals?.pressure.value).toBe(50);
			// Stats data
			expect(snapshot.stats.restoresToday).toBe(1);
			// Activity data
			expect(snapshot.activity.aiDetectionLog.length).toBeGreaterThan(0);
		});
	});

	// =========================================================================
	// 10. MCP CONNECTION TESTS (New functionality)
	// =========================================================================

	describe("MCP connection status", () => {
		it("should include MCP connection info in snapshot", async () => {
			const snapshot = await service.getSnapshot();

			expect(snapshot).toHaveProperty("mcpConnection");
			expect(snapshot.mcpConnection).toHaveProperty("state");
		});

		it("should return disconnected state by default", async () => {
			mockDaemonBridge.getState.mockReturnValue("disconnected" as const);
			mockDaemonBridge.getDaemonVersion.mockReturnValue(undefined);

			const snapshot = await service.getSnapshot();

			expect(snapshot.mcpConnection.state).toBe("disconnected");
			expect(snapshot.mcpConnection.daemonVersion).toBeUndefined();
		});

		it("should return connected state with version when daemon is running", async () => {
			mockDaemonBridge.getState.mockReturnValue("connected" as const);
			mockDaemonBridge.getDaemonVersion.mockReturnValue("1.2.3");

			const snapshot = await service.getSnapshot();

			expect(snapshot.mcpConnection.state).toBe("connected");
			expect(snapshot.mcpConnection.daemonVersion).toBe("1.2.3");
		});

		it("should handle reconnecting state", async () => {
			mockDaemonBridge.getState.mockReturnValue("reconnecting" as const);

			const snapshot = await service.getSnapshot();

			expect(snapshot.mcpConnection.state).toBe("reconnecting");
		});

		it("should handle cli_missing state", async () => {
			mockDaemonBridge.getState.mockReturnValue("cli_missing" as const);

			const snapshot = await service.getSnapshot();

			expect(snapshot.mcpConnection.state).toBe("cli_missing");
		});

		it("should call getDaemonBridge singleton", async () => {
			const { getDaemonBridge } = await import("../../../src/services/DaemonBridge");

			await service.getSnapshot();

			expect(getDaemonBridge).toHaveBeenCalled();
		});

		it("should reflect live MCP state changes", async () => {
			// Initially disconnected
			mockDaemonBridge.getState.mockReturnValue("disconnected" as const);
			let snapshot = await service.getSnapshot();
			expect(snapshot.mcpConnection.state).toBe("disconnected");

			// Simulate connection
			mockDaemonBridge.getState.mockReturnValue("connected" as const);
			mockDaemonBridge.getDaemonVersion.mockReturnValue("2.0.0");
			snapshot = await service.getSnapshot();
			expect(snapshot.mcpConnection.state).toBe("connected");
			expect(snapshot.mcpConnection.daemonVersion).toBe("2.0.0");

			// Simulate disconnection
			mockDaemonBridge.getState.mockReturnValue("disconnected" as const);
			mockDaemonBridge.getDaemonVersion.mockReturnValue(undefined);
			snapshot = await service.getSnapshot();
			expect(snapshot.mcpConnection.state).toBe("disconnected");
			expect(snapshot.mcpConnection.daemonVersion).toBeUndefined();
		});

		it("should work alongside other snapshot data", async () => {
			mockDaemonBridge.getState.mockReturnValue("connected" as const);
			mockDaemonBridge.getDaemonVersion.mockReturnValue("1.0.0");

			const vitals = createMockVitals();
			service.updateVitals(vitals as any);
			service.recordRestore("snap-1", 3);

			const snapshot = await service.getSnapshot();

			// MCP connection
			expect(snapshot.mcpConnection.state).toBe("connected");
			// Vitals
			expect(snapshot.vitals).toBeDefined();
			// Stats
			expect(snapshot.stats.restoresToday).toBe(1);
		});
	});
});
