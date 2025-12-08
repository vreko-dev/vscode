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
