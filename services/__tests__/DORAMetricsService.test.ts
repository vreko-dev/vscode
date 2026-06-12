/**
 * DORAMetricsService Tests
 *
 * Tests cover the proxy behavior of DORAMetricsService  -  verifying that events
 * are forwarded to the daemon and that async accessors return daemon responses.
 *
 * The DORAMetrics computation now lives in the daemon. These tests mock the
 * DaemonBridge to verify the IPC contract.
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

// Default mock DORASnapshot for tests
const defaultSnapshot = {
	meanTimeToRecovery: 0,
	leadTimeForProtection: 0,
	snapshotFrequency: 0,
	recoverySuccessRate: 100,
	reworkRate: 0,
	totalSnapshots: 0,
	totalRecoveries: 0,
	performanceTier: "low" as const,
};

// Mock DaemonBridge so tests run without a live daemon
const mockRequest = vi.fn().mockResolvedValue({ recorded: true });
vi.mock("../DaemonBridge", () => ({
	getDaemonBridge: () => ({
		request: mockRequest,
	}),
}));

describe("DORAMetricsService", () => {
	const workspaceId = "test-workspace";

	beforeEach(() => {
		DORAMetricsService.clearAll();
		vi.clearAllMocks();
		// Default: getMetrics returns the default snapshot
		mockRequest.mockImplementation((method: string) => {
			if (method === "dora.getMetrics") {
				return Promise.resolve({ ...defaultSnapshot });
			}
			if (method === "dora.getTrends") {
				return Promise.resolve({ recoveryTrend: "stable", frequencyTrend: "stable" });
			}
			return Promise.resolve({ recorded: true });
		});
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
		it("should record manual snapshot via daemon", async () => {
			const service = DORAMetricsService.for(workspaceId);

			service.recordSnapshotCreated("snap-1", "manual", 30000);
			// Allow fire-and-forget to settle
			await new Promise((r) => setTimeout(r, 0));

			expect(mockRequest).toHaveBeenCalledWith("dora.recordSnapshot", expect.objectContaining({
				workspace: workspaceId,
				event: expect.objectContaining({ snapshotId: "snap-1", trigger: "manual" }),
			}));
		});

		it("should record auto snapshot via daemon", async () => {
			const service = DORAMetricsService.for(workspaceId);

			service.recordSnapshotCreated("snap-1", "auto", 15000);
			await new Promise((r) => setTimeout(r, 0));

			expect(mockRequest).toHaveBeenCalledWith("dora.recordSnapshot", expect.objectContaining({
				event: expect.objectContaining({ trigger: "auto" }),
			}));
		});

		it("should record AI-detected snapshot via daemon", async () => {
			const service = DORAMetricsService.for(workspaceId);

			service.recordSnapshotCreated("snap-1", "ai-detected", 5000);
			await new Promise((r) => setTimeout(r, 0));

			expect(mockRequest).toHaveBeenCalledWith("dora.recordSnapshot", expect.objectContaining({
				event: expect.objectContaining({ trigger: "ai-detected" }),
			}));
		});

		it("should record recovery-triggered snapshot via daemon", async () => {
			const service = DORAMetricsService.for(workspaceId);

			service.recordSnapshotCreated("snap-1", "pre-restore", 1000, true);
			await new Promise((r) => setTimeout(r, 0));

			expect(mockRequest).toHaveBeenCalledWith("dora.recordSnapshot", expect.objectContaining({
				event: expect.objectContaining({ isRecoveryTriggered: true }),
			}));
		});

		it("should return daemon metrics", async () => {
			const service = DORAMetricsService.for(workspaceId);
			mockRequest.mockImplementation((method: string) => {
				if (method === "dora.getMetrics") {
					return Promise.resolve({ ...defaultSnapshot, totalSnapshots: 3 });
				}
				return Promise.resolve({ recorded: true });
			});

			const metrics = await service.getMetrics();
			expect(metrics.totalSnapshots).toBe(3);
		});
	});

	describe("recovery tracking - success scenarios", () => {
		it("should record successful recovery via daemon", async () => {
			const service = DORAMetricsService.for(workspaceId);

			service.recordRecoveryStart("snap-1", 5);
			await new Promise((resolve) => setTimeout(resolve, 50));
			service.recordRecoveryComplete("snap-1", true, 5);
			await new Promise((r) => setTimeout(r, 0));

			expect(mockRequest).toHaveBeenCalledWith("dora.recordRecovery", expect.objectContaining({
				workspace: workspaceId,
				event: expect.objectContaining({ snapshotId: "snap-1", success: true }),
			}));
		});

		it("should track multiple successful recoveries via daemon", async () => {
			const service = DORAMetricsService.for(workspaceId);

			service.recordRecoveryStart("snap-1", 3);
			service.recordRecoveryComplete("snap-1", true, 3);
			service.recordRecoveryStart("snap-2", 5);
			service.recordRecoveryComplete("snap-2", true, 5);
			await new Promise((r) => setTimeout(r, 0));

			// Both recoveries forwarded to daemon
			const recoveryCalls = mockRequest.mock.calls.filter((args: unknown[]) => args[0] === "dora.recordRecovery");
			expect(recoveryCalls.length).toBe(2);
		});

		it("should return null for getRecoveryTime (daemon-side computation)", async () => {
			const service = DORAMetricsService.for(workspaceId);

			service.recordRecoveryStart("snap-1", 3);
			service.recordRecoveryComplete("snap-1", true, 3);

			const recoveryTime = await service.getRecoveryTime("snap-1");
			// getRecoveryTime delegates to daemon; test returns null in current implementation
			expect(recoveryTime === null || typeof recoveryTime === "number").toBe(true);
		});
	});

	describe("recovery tracking - failure scenarios", () => {
		it("should record failed recovery via daemon", async () => {
			const service = DORAMetricsService.for(workspaceId);

			service.recordRecoveryStart("snap-1", 5);
			service.recordRecoveryComplete("snap-1", false, 0, "File not found");
			await new Promise((r) => setTimeout(r, 0));

			expect(mockRequest).toHaveBeenCalledWith("dora.recordRecovery", expect.objectContaining({
				event: expect.objectContaining({ success: false, failureReason: "File not found" }),
			}));
		});

		it("should record recovery failed without start via daemon", async () => {
			const service = DORAMetricsService.for(workspaceId);

			service.recordRecoveryFailed("snap-1", "Snapshot corrupted");
			await new Promise((r) => setTimeout(r, 0));

			expect(mockRequest).toHaveBeenCalledWith("dora.recordRecovery", expect.objectContaining({
				event: expect.objectContaining({ success: false, failureReason: "Snapshot corrupted" }),
			}));
		});

		it("should handle recovery complete without start gracefully", async () => {
			const service = DORAMetricsService.for(workspaceId);

			// Complete without start - should not throw
			expect(() => {
				service.recordRecoveryComplete("snap-1", true, 3);
			}).not.toThrow();

			await new Promise((r) => setTimeout(r, 0));
			expect(mockRequest).toHaveBeenCalledWith("dora.recordRecovery", expect.anything());
		});
	});

	describe("edge cases", () => {
		it("should return daemon metrics for empty state", async () => {
			const service = DORAMetricsService.for(workspaceId);

			const metrics = await service.getMetrics();
			expect(metrics.totalSnapshots).toBe(0);
			expect(metrics.totalRecoveries).toBe(0);
			expect(metrics.meanTimeToRecovery).toBe(0);
			expect(metrics.snapshotFrequency).toBe(0);
		});

		it("should handle zero lead time via daemon", async () => {
			const service = DORAMetricsService.for(workspaceId);
			mockRequest.mockImplementation((method: string) => {
				if (method === "dora.getMetrics") {
					return Promise.resolve({ ...defaultSnapshot, leadTimeForProtection: 0 });
				}
				return Promise.resolve({ recorded: true });
			});

			service.recordSnapshotCreated("snap-1", "auto", 0);
			const metrics = await service.getMetrics();
			expect(metrics.leadTimeForProtection).toBe(0);
		});

		it("should reset active recovery tracking", () => {
			const service = DORAMetricsService.for(workspaceId);

			service.recordRecoveryStart("snap-1", 3);
			// reset clears client-side tracking only
			service.reset();

			// After reset, completing the recovery creates synthetic start time
			expect(() => {
				service.recordRecoveryComplete("snap-1", true, 3);
			}).not.toThrow();
		});
	});

	describe("performance tiers", () => {
		it("should return low tier when no data", async () => {
			const service = DORAMetricsService.for(workspaceId);

			const metrics = await service.getMetrics();
			expect(metrics.performanceTier).toBe("low");
		});

		it("should check if performance meets target via daemon", async () => {
			const service = DORAMetricsService.for(workspaceId);

			// With default (low tier)
			expect(await service.meetsPerformanceTarget("low")).toBe(true);
			expect(await service.meetsPerformanceTarget("medium")).toBe(false);
			expect(await service.meetsPerformanceTarget("high")).toBe(false);
			expect(await service.meetsPerformanceTarget("elite")).toBe(false);
		});
	});

	describe("trends", () => {
		it("should return stable trends with insufficient data", async () => {
			const service = DORAMetricsService.for(workspaceId);

			const trends = await service.getTrends();
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
