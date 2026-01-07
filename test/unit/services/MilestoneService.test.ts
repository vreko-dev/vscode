import { describe, expect, it, vi, beforeEach } from "vitest";
import { MilestoneService } from "@vscode/services/MilestoneService";

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

describe("MilestoneService", () => {
	let service: MilestoneService;

    // Mock Context
    const mockContext = {
        globalState: mockGlobalState
    };

	beforeEach(() => {
		vi.resetAllMocks();
		service = new MilestoneService(
			mockContext as any,
			mockTelemetryProxy as any,
			mockNotificationManager as any,
		);
	});

	describe("trackFirstSnapshot - 🧢 SnapBack Branding", () => {
		it("should show branded celebration message on first snapshot", async () => {
			// GIVEN: No previous first snapshot
			mockGlobalState.get.mockImplementation((key: string) => {
				if (key === "snapback.events.first_snapshot_created") return false;
				if (key === "snapback.milestones.snapshotCount") return 0;
				return undefined;
			});

			// WHEN: First snapshot created
			await service.trackFirstSnapshot();

			// THEN: Should show 🧢 branded notification
			expect(mockNotificationManager.showNotification).toHaveBeenCalledWith(
				expect.objectContaining({
					icon: "🧢",
					message: "🧢 SnapBack: Your first save is protected!",
				})
			);
		});

		it("should trigger Pioneer engagement at 10 snapshots", async () => {
			// GIVEN: 9 snapshots already (one away from Pioneer threshold)
			mockGlobalState.get.mockImplementation((key: string) => {
				if (key === "snapback.events.first_snapshot_created") return true;
				if (key === "snapback.milestones.snapshotCount") return 9;
				return undefined;
			});

			// WHEN: 10th snapshot
			await service.trackFirstSnapshot();

			// THEN: Should trigger Pioneer engagement notification
			expect(mockTelemetryProxy.trackEvent).toHaveBeenCalledWith(
				"pioneer_engagement.threshold_reached",
				expect.objectContaining({ threshold: 10 })
			);
			expect(mockNotificationManager.showNotification).toHaveBeenCalledWith(
				expect.objectContaining({
					icon: "🧢",
					message: "🧢 SnapBack: Protected 10 times!",
					actions: expect.arrayContaining([
						expect.objectContaining({ title: "Join Pioneer Program" })
					]),
				})
			);
		});
	});

	describe("incrementProtectedFiles", () => {
		it("should trigger milestone when threshold is reached", async () => {
			// GIVEN: 99 files protected (1 away from 100)
			mockGlobalState.get.mockReturnValue(99);

			// WHEN: Protecting one more
			await service.incrementProtectedFiles(1);

			// THEN: Should trigger milestone
			expect(mockTelemetryProxy.trackEvent).toHaveBeenCalledWith(
				"value:milestone_reached",
				expect.objectContaining({
					milestone_type: "files_protected",
					value: 100,
				})
			);
			// AND: Show notification
			expect(mockNotificationManager.showNotification).toHaveBeenCalledWith(
                expect.objectContaining({
                    icon: "🎉",
                    message: "100 Files Protected!"
                })
            );
		});

		it("should NOT trigger milestone for intermediate values", async () => {
			// GIVEN: 50 files protected
			mockGlobalState.get.mockReturnValue(50);

			// WHEN: Protecting one more
			await service.incrementProtectedFiles(1);

			// THEN: No event
			expect(mockTelemetryProxy.trackEvent).not.toHaveBeenCalled();
            expect(mockNotificationManager.showNotification).not.toHaveBeenCalled();
		});
	});

	describe("incrementRecoveries", () => {
		it("should trigger milestone on first recovery", async () => {
			// GIVEN: 0 recoveries
			mockGlobalState.get.mockReturnValue(0);

			// WHEN: Recovering
			await service.incrementRecoveries();

			// THEN: Milestone reached
			expect(mockTelemetryProxy.trackEvent).toHaveBeenCalledWith(
				"value:milestone_reached",
				expect.objectContaining({
					milestone_type: "recoveries",
                    value: 1
				})
			);
		});
	});
});
