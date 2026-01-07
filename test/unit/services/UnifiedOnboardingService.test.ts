/**
 * UnifiedOnboardingService Unit Tests
 *
 * Comprehensive test coverage for:
 * - State transitions
 * - Celebrations
 * - Migration
 * - Persistence
 * - Metrics tracking
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { UnifiedOnboardingService } from "../../../src/services/UnifiedOnboardingService";
import type { UnifiedOnboardingState } from "../../../src/services/onboarding/types";

// Mock dependencies
const mockGlobalState = {
	get: vi.fn(),
	update: vi.fn(),
};

const mockTelemetryProxy = {
	trackEvent: vi.fn(),
};

const mockNotificationManager = {
	showNotification: vi.fn(),
};

describe("UnifiedOnboardingService", () => {
	let service: UnifiedOnboardingService;

	beforeEach(() => {
		vi.resetAllMocks();
		service = new UnifiedOnboardingService(
			mockGlobalState as any,
			mockTelemetryProxy as any,
			mockNotificationManager as any,
		);
	});

	describe("initialization", () => {
		it("should create default state for new installation", async () => {
			// GIVEN: No existing state
			mockGlobalState.get.mockReturnValue(undefined);

			// WHEN: Initialize
			await service.initialize();

			// THEN: Should create default state
			expect(service.getCurrentState()).toBe("protecting");
			expect(service.getMetrics()).toEqual({
				snapshotsCreated: 0,
				filesProtected: 0,
				recoveries: 0,
			});
		});

		it("should load existing state if present", async () => {
			// GIVEN: Existing state
			const existingState: UnifiedOnboardingState = {
				state: "value_demonstrated",
				stateEnteredAt: Date.now(),
				metrics: {
					snapshotsCreated: 5,
					filesProtected: 10,
					recoveries: 2,
				},
				timestamps: {
					installedAt: Date.now(),
					firstSnapshotAt: Date.now(),
					firstRecoveryAt: null,
					engagedAt: null,
					convertedAt: null,
				},
				flags: {
					mcpConfigured: false,
					aiDetected: false,
					pioneerJoined: false,
					welcomeShown: false,
					hasAuthenticated: false,
				},
			};
			mockGlobalState.get.mockReturnValue(existingState);

			// WHEN: Initialize
			await service.initialize();

			// THEN: Should load existing state
			expect(service.getCurrentState()).toBe("value_demonstrated");
			expect(service.getMetrics().snapshotsCreated).toBe(5);
		});

		it("should migrate from legacy OnboardingProgression", async () => {
			// GIVEN: Legacy state exists
			mockGlobalState.get.mockImplementation((key: string) => {
				if (key === "snapback.onboarding.unified") return undefined;
				if (key === "snapback:onboarding-state") {
					return {
						currentPhase: 3,
						snapshotsCreated: 5,
						hasRestored: false,
						hasProtectedFiles: true,
						hasUsedBulkProtection: false,
						extensionActivatedAt: Date.now(),
						firstProtectedAt: Date.now(),
					};
				}
				if (key === "snapback.milestones.snapshotCount") return 5;
				if (key === "snapback.events.first_snapshot_created") return true;
				return 0;
			});

			// WHEN: Initialize
			await service.initialize();

			// THEN: Should migrate to value_demonstrated state
			expect(service.getCurrentState()).toBe("value_demonstrated");
			expect(service.getMetrics().snapshotsCreated).toBe(5);
		});

		it("should migrate to engaged state if 10+ snapshots exist", async () => {
			// GIVEN: 10+ snapshots in legacy state
			mockGlobalState.get.mockImplementation((key: string) => {
				if (key === "snapback.onboarding.unified") return undefined;
				if (key === "snapback.milestones.snapshotCount") return 12;
				if (key === "snapback.events.first_snapshot_created") return true;
				return 0;
			});

			// WHEN: Initialize
			await service.initialize();

			// THEN: Should migrate to engaged state
			expect(service.getCurrentState()).toBe("engaged");
			expect(service.getMetrics().snapshotsCreated).toBe(12);
		});
	});

	describe("state transitions", () => {
		beforeEach(async () => {
			mockGlobalState.get.mockReturnValue(undefined);
			await service.initialize();
		});

		it("should transition to value_demonstrated on first snapshot", async () => {
			// GIVEN: User is in protecting state
			expect(service.getCurrentState()).toBe("protecting");

			// WHEN: First snapshot created
			await service.trackSnapshotCreated();

			// THEN: Should transition to value_demonstrated
			expect(service.getCurrentState()).toBe("value_demonstrated");
			expect(service.getMetrics().snapshotsCreated).toBe(1);

			// AND: Should show celebration
			expect(mockNotificationManager.showNotification).toHaveBeenCalledWith(
				expect.objectContaining({
					icon: "🧢",
					message: "🧢 SnapBack: Your first save is protected!",
				}),
			);

			// AND: Should track telemetry
			expect(mockTelemetryProxy.trackEvent).toHaveBeenCalledWith(
				"celebration.first_snapshot",
				expect.objectContaining({
					state: "value_demonstrated",
				}),
			);
		});

		it("should transition to engaged at 10 snapshots", async () => {
			// GIVEN: User has 9 snapshots
			for (let i = 0; i < 9; i++) {
				await service.trackSnapshotCreated();
			}
			expect(service.getCurrentState()).toBe("value_demonstrated");

			// WHEN: 10th snapshot created
			vi.clearAllMocks();
			await service.trackSnapshotCreated();

			// THEN: Should transition to engaged
			expect(service.getCurrentState()).toBe("engaged");
			expect(service.getMetrics().snapshotsCreated).toBe(10);

			// AND: Should show Pioneer engagement notification
			expect(mockNotificationManager.showNotification).toHaveBeenCalledWith(
				expect.objectContaining({
					icon: "🧢",
					message: "🧢 SnapBack: Protected 10 times!",
					actions: expect.arrayContaining([
						expect.objectContaining({
							title: "Join Pioneer Program",
							command: "snapback.pioneer.login",
						}),
					]),
				}),
			);
		});

		it("should not regress state", async () => {
			// GIVEN: User is in engaged state
			for (let i = 0; i < 10; i++) {
				await service.trackSnapshotCreated();
			}
			expect(service.getCurrentState()).toBe("engaged");

			// WHEN: More snapshots created
			await service.trackSnapshotCreated();
			await service.trackSnapshotCreated();

			// THEN: Should remain in engaged state
			expect(service.getCurrentState()).toBe("engaged");
			expect(service.getMetrics().snapshotsCreated).toBe(12);
		});

		it("should transition to converted on subscription", async () => {
			// GIVEN: User is in engaged state
			for (let i = 0; i < 10; i++) {
				await service.trackSnapshotCreated();
			}

			// WHEN: User subscribes
			await service.trackSubscriptionStarted();

			// THEN: Should transition to converted
			expect(service.getCurrentState()).toBe("converted");
		});

		it("should track state transition telemetry", async () => {
			// GIVEN: User in protecting state
			// WHEN: Transition to value_demonstrated
			await service.trackSnapshotCreated();

			// THEN: Should track state change event
			expect(mockTelemetryProxy.trackEvent).toHaveBeenCalledWith(
				"onboarding.state_changed",
				expect.objectContaining({
					from_state: "protecting",
					to_state: "value_demonstrated",
					trigger: "event",
				}),
			);
		});
	});

	describe("metrics tracking", () => {
		beforeEach(async () => {
			mockGlobalState.get.mockReturnValue(undefined);
			await service.initialize();
		});

		it("should track snapshots created", async () => {
			await service.trackSnapshotCreated();
			await service.trackSnapshotCreated();

			expect(service.getMetrics().snapshotsCreated).toBe(2);
		});

		it("should track files protected", async () => {
			await service.trackFileProtection(5);
			await service.trackFileProtection(3);

			expect(service.getMetrics().filesProtected).toBe(8);
		});

		it("should track recoveries", async () => {
			await service.trackRecovery();
			await service.trackRecovery();

			expect(service.getMetrics().recoveries).toBe(2);
		});

		it("should update timestamps for first events", async () => {
			// First snapshot
			await service.trackSnapshotCreated();
			const state1 = service.getFullState();
			expect(state1.timestamps.firstSnapshotAt).toBeTruthy();

			// First recovery
			await service.trackRecovery();
			const state2 = service.getFullState();
			expect(state2.timestamps.firstRecoveryAt).toBeTruthy();
		});

		it("should track engaged timestamp when reaching 10 snapshots", async () => {
			for (let i = 0; i < 10; i++) {
				await service.trackSnapshotCreated();
			}

			const state = service.getFullState();
			expect(state.timestamps.engagedAt).toBeTruthy();
		});
	});

	describe("feature flags", () => {
		beforeEach(async () => {
			mockGlobalState.get.mockReturnValue(undefined);
			await service.initialize();
		});

		it("should set AI detected flag", async () => {
			await service.trackAIDetection("Cursor");

			const state = service.getFullState();
			expect(state.flags.aiDetected).toBe(true);
		});

		it("should set MCP configured flag", async () => {
			await service.trackMCPConfigured(["client1", "client2"]);

			const state = service.getFullState();
			expect(state.flags.mcpConfigured).toBe(true);
		});

		it("should set Pioneer joined flag", async () => {
			await service.trackPioneerJoined();

			const state = service.getFullState();
			expect(state.flags.pioneerJoined).toBe(true);
		});
	});

	describe("persistence", () => {
		it("should save state after each event", async () => {
			mockGlobalState.get.mockReturnValue(undefined);
			await service.initialize();

			vi.clearAllMocks();
			await service.trackSnapshotCreated();

			expect(mockGlobalState.update).toHaveBeenCalledWith(
				"snapback.onboarding.unified",
				expect.objectContaining({
					state: "value_demonstrated",
					metrics: expect.objectContaining({
						snapshotsCreated: 1,
					}),
				}),
			);
		});

		it("should handle save errors gracefully", async () => {
			mockGlobalState.get.mockReturnValue(undefined);
			mockGlobalState.update.mockRejectedValue(new Error("Storage error"));

			await service.initialize();

			// Should not throw
			await expect(service.trackSnapshotCreated()).resolves.not.toThrow();
		});
	});

	describe("utility methods", () => {
		beforeEach(async () => {
			mockGlobalState.get.mockReturnValue(undefined);
			await service.initialize();
		});

		it("should calculate progress percentage", async () => {
			expect(service.getProgressPercentage()).toBe(40); // protecting = 2/5

			await service.trackSnapshotCreated();
			expect(service.getProgressPercentage()).toBe(60); // value_demonstrated = 3/5

			for (let i = 1; i < 10; i++) {
				await service.trackSnapshotCreated();
			}
			expect(service.getProgressPercentage()).toBe(80); // engaged = 4/5
		});

		it("should check milestone completion", async () => {
			expect(service.hasReachedMilestone("first_snapshot")).toBe(false);

			await service.trackSnapshotCreated();
			expect(service.hasReachedMilestone("first_snapshot")).toBe(true);
			expect(service.hasReachedMilestone("engaged")).toBe(false);

			for (let i = 1; i < 10; i++) {
				await service.trackSnapshotCreated();
			}
			expect(service.hasReachedMilestone("engaged")).toBe(true);
		});

		it("should provide backward compatible getStats", () => {
			// For MilestoneService compatibility
			const stats = service.getStats();
			expect(stats).toEqual({
				filesProtected: 0,
				recoveries: 0,
				snapshotsCreated: 0,
			});
		});
	});

	describe("celebration logic", () => {
		beforeEach(async () => {
			mockGlobalState.get.mockReturnValue(undefined);
			await service.initialize();
		});

		it("should use 🧢 branding on all celebrations", async () => {
			await service.trackSnapshotCreated();

			expect(mockNotificationManager.showNotification).toHaveBeenCalledWith(
				expect.objectContaining({
					icon: "🧢",
					message: expect.stringContaining("🧢 SnapBack"),
				}),
			);
		});

		it("should not show duplicate celebrations", async () => {
			// First snapshot - should celebrate
			await service.trackSnapshotCreated();
			expect(mockNotificationManager.showNotification).toHaveBeenCalledTimes(1);

			// More snapshots in same state - no celebration
			vi.clearAllMocks();
			await service.trackSnapshotCreated();
			await service.trackSnapshotCreated();
			expect(mockNotificationManager.showNotification).not.toHaveBeenCalled();
		});
	});
});
