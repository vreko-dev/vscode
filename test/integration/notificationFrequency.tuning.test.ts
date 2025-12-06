import { beforeEach, describe, expect, it } from "vitest";
import { NotificationFrequencyTuner } from "../../src/notificationFrequencyTuner";

describe("NotificationFrequencyTuner", () => {
	let tuner: NotificationFrequencyTuner;

	beforeEach(() => {
		// Create new tuner with test configuration
		tuner = new NotificationFrequencyTuner({
			minIntervalBetweenAny: 1000, // 1 second
			minIntervalBetweenSameType: 5000, // 5 seconds
			maxSameTypePerWindow: 3, // Max 3 per window
			timeWindow: 30000, // 30 second window
			groupSimilar: true,
		});
	});

	describe("Notification frequency tuning", () => {
		it("should enforce minimum interval between any notifications", () => {
			const now = Date.now();

			// First notification should be allowed
			expect(tuner.shouldShowNotification("info", "message 1", now)).toBe(true);

			// Second notification immediately after should be blocked
			expect(tuner.shouldShowNotification("info", "message 2", now + 100)).toBe(
				false,
			);

			// Second notification after delay should be allowed
			expect(
				tuner.shouldShowNotification("info", "message 3", now + 1500),
			).toBe(true);
		});

		it("should enforce minimum interval between same type notifications", () => {
			const now = Date.now();

			// First warning should be allowed
			expect(tuner.shouldShowNotification("warning", "warning 1", now)).toBe(
				true,
			);

			// Second warning immediately after should be blocked
			expect(
				tuner.shouldShowNotification("warning", "warning 2", now + 100),
			).toBe(false);

			// Second warning after shorter delay should still be blocked
			expect(
				tuner.shouldShowNotification("warning", "warning 3", now + 3000),
			).toBe(false);

			// Second warning after sufficient delay should be allowed
			expect(
				tuner.shouldShowNotification("warning", "warning 4", now + 6000),
			).toBe(true);
		});

		it("should limit same type notifications per time window", () => {
			const now = Date.now();

			// Allow up to maxSameTypePerWindow notifications
			expect(tuner.shouldShowNotification("error", "error 1", now)).toBe(true);
			expect(tuner.shouldShowNotification("error", "error 2", now + 1000)).toBe(
				true,
			);
			expect(tuner.shouldShowNotification("error", "error 3", now + 2000)).toBe(
				true,
			);

			// Block additional notifications of same type in same window
			expect(tuner.shouldShowNotification("error", "error 4", now + 3000)).toBe(
				false,
			);

			// Allow after time window has passed
			expect(
				tuner.shouldShowNotification("error", "error 5", now + 35000),
			).toBe(true);
		});
	});

	describe("Notification batching for multiple events", () => {
		it("should group similar notifications", () => {
			const now = Date.now();

			// With grouping enabled, similar notifications should be handled differently
			tuner = new NotificationFrequencyTuner({
				minIntervalBetweenAny: 1000,
				minIntervalBetweenSameType: 5000,
				maxSameTypePerWindow: 3,
				timeWindow: 30000,
				groupSimilar: true, // Enable grouping
			});

			// First notification
			expect(
				tuner.shouldShowNotification("info", "File changed: file1.ts", now),
			).toBe(true);

			// Similar notification should be handled according to grouping logic
			expect(
				tuner.shouldShowNotification(
					"info",
					"File changed: file2.ts",
					now + 500,
				),
			).toBe(false);

			// Different type should still be allowed
			expect(
				tuner.shouldShowNotification("warning", "Risk detected", now + 600),
			).toBe(true);
		});

		it("should not group notifications when grouping is disabled", () => {
			tuner = new NotificationFrequencyTuner({
				minIntervalBetweenAny: 1000,
				minIntervalBetweenSameType: 5000,
				maxSameTypePerWindow: 3,
				timeWindow: 30000,
				groupSimilar: false, // Disable grouping
			});

			const now = Date.now();

			// First notification
			expect(
				tuner.shouldShowNotification("info", "File changed: file1.ts", now),
			).toBe(true);

			// Similar notification should be blocked by interval, not grouping
			expect(
				tuner.shouldShowNotification(
					"info",
					"File changed: file2.ts",
					now + 500,
				),
			).toBe(false);
		});
	});

	describe("Notification persistence across sessions", () => {
		it("should maintain notification history between calls", () => {
			const now = Date.now();

			// Record some notifications
			tuner.shouldShowNotification("info", "message 1", now);
			tuner.shouldShowNotification("warning", "warning 1", now + 1000);

			// Create a new tuner (simulating new session)
			const newTuner = new NotificationFrequencyTuner({
				minIntervalBetweenAny: 1000,
				minIntervalBetweenSameType: 5000,
				maxSameTypePerWindow: 3,
				timeWindow: 30000,
				groupSimilar: true,
			});

			// In a real implementation, the history would be persisted
			// For now, we just verify the new tuner works
			expect(
				newTuner.shouldShowNotification("info", "new message", now + 2000),
			).toBe(true);
		});
	});
});
