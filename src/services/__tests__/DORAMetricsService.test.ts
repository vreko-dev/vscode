/**
 * DORAMetricsService Tests
 *
 * Comprehensive test coverage for DORA metrics integration including:
 * - Success scenarios
 * - Failure scenarios
 * - Edge cases
 * - Performance tier validation
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DORAMetricsService, getDORAMetricsService } from "../DORAMetricsService";

// Mock the logger
vi.mock("../../utils/logger", () => ({
	logger: {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}));

describe("DORAMetricsService", () => {
	const workspaceId = "test-workspace";

	beforeEach(() => {
		DORAMetricsService.clearAll();
	});

	afterEach(() => {
		DORAMetricsService.clearAll();
	});

	describe("singleton pattern", () => {
		it("should return same instance for same workspace", () => {
			const instance1 = DORAMetricsService.for(workspaceId);
			const instance2 = DORAMetricsService.for(workspaceId);

			expect(instance1).toBe(instance2);
		});

		it("should return different instances for different workspaces", () => {
			const instance1 = DORAMetricsService.for("workspace-1");
			const instance2 = DORAMetricsService.for("workspace-2");

			expect(instance1).not.toBe(instance2);
		});

		it("should clear all instances", () => {
			const instance1 = DORAMetricsService.for(workspaceId);
			DORAMetricsService.clearAll();
			const instance2 = DORAMetricsService.for(workspaceId);

			expect(instance1).not.toBe(instance2);
		});
	});

	describe("snapshot tracking", () => {
		it("should record manual snapshot", () => {
			const service = DORAMetricsService.for(workspaceId);

			service.recordSnapshotCreated("snap-1", "manual", 30000);

			const metrics = service.getMetrics();
			expect(metrics.totalSnapshots).toBe(1);
		});

		it("should record auto snapshot", () => {
			const service = DORAMetricsService.for(workspaceId);

			service.recordSnapshotCreated("snap-1", "auto", 15000);

			const metrics = service.getMetrics();
			expect(metrics.totalSnapshots).toBe(1);
		});

		it("should record AI-detected snapshot", () => {
			const service = DORAMetricsService.for(workspaceId);

			service.recordSnapshotCreated("snap-1", "ai-detected", 5000);

			const metrics = service.getMetrics();
			expect(metrics.totalSnapshots).toBe(1);
		});

		it("should record recovery-triggered snapshot", () => {
			const service = DORAMetricsService.for(workspaceId);

			service.recordSnapshotCreated("snap-1", "recovery", 1000, true);

			const metrics = service.getMetrics();
			expect(metrics.totalSnapshots).toBe(1);
			expect(metrics.reworkRate).toBeGreaterThan(0);
		});

		it("should track multiple snapshots", () => {
			const service = DORAMetricsService.for(workspaceId);

			service.recordSnapshotCreated("snap-1", "manual", 30000);
			service.recordSnapshotCreated("snap-2", "auto", 20000);
			service.recordSnapshotCreated("snap-3", "ai-detected", 10000);

			const metrics = service.getMetrics();
			expect(metrics.totalSnapshots).toBe(3);
		});

		it("should calculate lead time for protection", () => {
			const service = DORAMetricsService.for(workspaceId);

			service.recordSnapshotCreated("snap-1", "auto", 30000); // 30s
			service.recordSnapshotCreated("snap-2", "auto", 60000); // 60s

			const metrics = service.getMetrics();
			// Average of 30s and 60s = 45s = 45000ms
			expect(metrics.leadTimeForProtection).toBe(45000);
		});
	});

	describe("recovery tracking - success scenarios", () => {
		it("should record successful recovery with correct MTTR", async () => {
			const service = DORAMetricsService.for(workspaceId);

			// Start recovery
			service.recordRecoveryStart("snap-1", 5);

			// Wait a bit to simulate recovery time
			await new Promise((resolve) => setTimeout(resolve, 50));

			// Complete recovery
			service.recordRecoveryComplete("snap-1", true, 5);

			const metrics = service.getMetrics();
			expect(metrics.totalRecoveries).toBe(1);
			expect(metrics.recoverySuccessRate).toBe(100);
			expect(metrics.meanTimeToRecovery).toBeGreaterThan(0);
		});

		it("should track multiple successful recoveries", () => {
			const service = DORAMetricsService.for(workspaceId);

			service.recordRecoveryStart("snap-1", 3);
			service.recordRecoveryComplete("snap-1", true, 3);

			service.recordRecoveryStart("snap-2", 5);
			service.recordRecoveryComplete("snap-2", true, 5);

			const metrics = service.getMetrics();
			expect(metrics.totalRecoveries).toBe(2);
			expect(metrics.recoverySuccessRate).toBe(100);
		});

		it("should return recovery time for specific snapshot", () => {
			const service = DORAMetricsService.for(workspaceId);

			service.recordRecoveryStart("snap-1", 3);
			service.recordRecoveryComplete("snap-1", true, 3);

			const recoveryTime = service.getRecoveryTime("snap-1");
			expect(recoveryTime).not.toBeNull();
			expect(recoveryTime).toBeGreaterThanOrEqual(0);
		});
	});

	describe("recovery tracking - failure scenarios", () => {
		it("should record failed recovery", () => {
			const service = DORAMetricsService.for(workspaceId);

			service.recordRecoveryStart("snap-1", 5);
			service.recordRecoveryComplete("snap-1", false, 0, "File not found");

			const metrics = service.getMetrics();
			expect(metrics.totalRecoveries).toBe(1);
			expect(metrics.recoverySuccessRate).toBe(0);
		});

		it("should record recovery failed without start", () => {
			const service = DORAMetricsService.for(workspaceId);

			service.recordRecoveryFailed("snap-1", "Snapshot corrupted");

			const metrics = service.getMetrics();
			expect(metrics.totalRecoveries).toBe(1);
			expect(metrics.recoverySuccessRate).toBe(0);
		});

		it("should handle recovery complete without start gracefully", () => {
			const service = DORAMetricsService.for(workspaceId);

			// Complete without start - should not throw
			expect(() => {
				service.recordRecoveryComplete("snap-1", true, 3);
			}).not.toThrow();

			const metrics = service.getMetrics();
			expect(metrics.totalRecoveries).toBe(1);
		});

		it("should calculate correct success rate with mixed results", () => {
			const service = DORAMetricsService.for(workspaceId);

			// 2 successful
			service.recordRecoveryStart("snap-1", 3);
			service.recordRecoveryComplete("snap-1", true, 3);

			service.recordRecoveryStart("snap-2", 5);
			service.recordRecoveryComplete("snap-2", true, 5);

			// 1 failed
			service.recordRecoveryStart("snap-3", 2);
			service.recordRecoveryComplete("snap-3", false, 0, "Error");

			const metrics = service.getMetrics();
			expect(metrics.totalRecoveries).toBe(3);
			// 2/3 = 66.7%
			expect(metrics.recoverySuccessRate).toBeCloseTo(66.7, 0);
		});
	});

	describe("edge cases", () => {
		it("should handle empty metrics", () => {
			const service = DORAMetricsService.for(workspaceId);

			const metrics = service.getMetrics();
			expect(metrics.totalSnapshots).toBe(0);
			expect(metrics.totalRecoveries).toBe(0);
			expect(metrics.meanTimeToRecovery).toBe(0);
			expect(metrics.snapshotFrequency).toBe(0);
		});

		it("should handle zero lead time", () => {
			const service = DORAMetricsService.for(workspaceId);

			service.recordSnapshotCreated("snap-1", "auto", 0);

			const metrics = service.getMetrics();
			expect(metrics.leadTimeForProtection).toBe(0);
		});

		it("should handle concurrent recoveries", () => {
			const service = DORAMetricsService.for(workspaceId);

			// Start two recoveries at once
			service.recordRecoveryStart("snap-1", 3);
			service.recordRecoveryStart("snap-2", 5);

			// Complete in different order
			service.recordRecoveryComplete("snap-2", true, 5);
			service.recordRecoveryComplete("snap-1", true, 3);

			const metrics = service.getMetrics();
			expect(metrics.totalRecoveries).toBe(2);
			expect(metrics.recoverySuccessRate).toBe(100);
		});

		it("should reset metrics correctly", () => {
			const service = DORAMetricsService.for(workspaceId);

			service.recordSnapshotCreated("snap-1", "auto", 30000);
			service.recordRecoveryStart("snap-1", 3);
			service.recordRecoveryComplete("snap-1", true, 3);

			// Verify data exists
			expect(service.getMetrics().totalSnapshots).toBe(1);

			// Reset
			service.reset();

			// Verify data cleared
			const metrics = service.getMetrics();
			expect(metrics.totalSnapshots).toBe(0);
			expect(metrics.totalRecoveries).toBe(0);
		});
	});

	describe("performance tiers", () => {
		it("should start with low tier when no data", () => {
			const service = DORAMetricsService.for(workspaceId);

			const metrics = service.getMetrics();
			// With no data, tier should be "low"
			expect(metrics.performanceTier).toBe("low");
		});

		it("should check if performance meets target", () => {
			const service = DORAMetricsService.for(workspaceId);

			// With no data (low tier)
			expect(service.meetsPerformanceTarget("low")).toBe(true);
			expect(service.meetsPerformanceTarget("medium")).toBe(false);
			expect(service.meetsPerformanceTarget("high")).toBe(false);
			expect(service.meetsPerformanceTarget("elite")).toBe(false);
		});
	});

	describe("trends", () => {
		it("should return stable trends with insufficient data", () => {
			const service = DORAMetricsService.for(workspaceId);

			const trends = service.getTrends();
			expect(trends.recoveryTrend).toBe("stable");
			expect(trends.frequencyTrend).toBe("stable");
		});
	});

	describe("factory function", () => {
		it("should return service instance via factory", () => {
			const service = getDORAMetricsService(workspaceId);

			expect(service).toBeInstanceOf(DORAMetricsService);
		});

		it("should return same instance as direct access", () => {
			const viaFactory = getDORAMetricsService(workspaceId);
			const viaDirect = DORAMetricsService.for(workspaceId);

			expect(viaFactory).toBe(viaDirect);
		});
	});
});
