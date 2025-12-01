import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationManager } from "../../src/notificationManager.js";
import {
	type DismissalRule,
	SmartDismissalManager,
} from "../../src/smartDismissalManager";

// Mock VS Code API
vi.mock("vscode", () => ({
	window: {
		showInformationMessage: vi.fn(),
		showWarningMessage: vi.fn(),
		showErrorMessage: vi.fn(),
	},
}));

describe("Dismiss Similar Notifications End-to-End", () => {
	let notificationManager: NotificationManager;
	let dismissalManager: SmartDismissalManager;

	beforeEach(() => {
		notificationManager = new NotificationManager();
		dismissalManager = new SmartDismissalManager();
		// Clear all dismissal rules before each test
		const rules = dismissalManager.getActiveDismissalRules();
		rules.forEach((rule: DismissalRule) => {
			dismissalManager.removeDismissalRule(rule.id);
		});
	});

	it("should demonstrate full dismiss similar notifications workflow", async () => {
		// Step 1: Show a notification that we want to dismiss similar ones of
		const securityNotification = {
			id: "security-1",
			type: "warning" as const,
			message: "Security alert detected in auth.ts",
			timestamp: Date.now(),
		};

		await notificationManager.showNotification(securityNotification);

		// Verify the notification was shown and added to history
		let recentNotifications = notificationManager.getRecentNotifications(1);
		expect(recentNotifications.length).toBe(1);
		expect(recentNotifications[0].message).toBe(
			"Security alert detected in auth.ts",
		);

		// Step 2: Create a dismissal rule for similar notifications
		dismissalManager.createDismissalRule("Security alert", "contains");

		// Verify the rule was created
		const activeRules = dismissalManager.getActiveDismissalRules();
		expect(activeRules.length).toBe(1);
		expect(activeRules[0].pattern).toBe("Security alert");
		expect(activeRules[0].matchType).toBe("contains");

		// Step 3: Try to show another similar notification (integrate dismissal check)
		const similarNotification = {
			id: "security-2",
			type: "warning" as const,
			message: "Security alert detected in config.ts",
			timestamp: Date.now() + 1000,
		};

		// Check if notification should be dismissed before showing
		const shouldDismiss =
			dismissalManager.shouldDismissNotification(similarNotification);
		expect(shouldDismiss).toBe(true);

		// Only show if not dismissed
		if (!shouldDismiss) {
			await notificationManager.showNotification(similarNotification);
		}

		// Verify the similar notification was dismissed (not added to history)
		recentNotifications = notificationManager.getRecentNotifications(10);
		expect(recentNotifications.length).toBe(1); // Still only the first notification
		expect(recentNotifications[0].message).toBe(
			"Security alert detected in auth.ts",
		);

		// Step 4: Try to show a different notification
		const differentNotification = {
			id: "info-1",
			type: "info" as const,
			message: "Checkpoint created successfully",
			timestamp: Date.now() + 2000,
		};

		// Check dismissal - should not be dismissed
		const shouldDismissDifferent = dismissalManager.shouldDismissNotification(
			differentNotification,
		);
		expect(shouldDismissDifferent).toBe(false);

		await notificationManager.showNotification(differentNotification);

		// Verify the different notification was shown and added to history
		recentNotifications = notificationManager.getRecentNotifications(10);
		expect(recentNotifications.length).toBe(2); // Now we have two notifications
		expect(recentNotifications[0].message).toBe(
			"Checkpoint created successfully",
		);
		expect(recentNotifications[1].message).toBe(
			"Security alert detected in auth.ts",
		);
	});

	it("should handle dismissal rule expiration", async () => {
		// Create a dismissal rule that expires quickly
		dismissalManager.createDismissalRule("Test notification", "exact", 100); // 100ms duration

		// Try to show a matching notification immediately
		const testNotification = {
			id: "test-1",
			type: "info" as const,
			message: "Test notification",
			timestamp: Date.now(),
		};

		// Check if notification should be dismissed
		let shouldDismiss =
			dismissalManager.shouldDismissNotification(testNotification);
		expect(shouldDismiss).toBe(true);

		// Only show if not dismissed
		if (!shouldDismiss) {
			await notificationManager.showNotification(testNotification);
		}

		// Verify the notification was dismissed
		let recentNotifications = notificationManager.getRecentNotifications(10);
		expect(recentNotifications.length).toBe(0);

		// Wait for the rule to expire
		await new Promise((resolve) => setTimeout(resolve, 150));

		// Try to show the same notification again
		const testNotification2 = {
			id: "test-2",
			type: "info" as const,
			message: "Test notification",
			timestamp: Date.now() + 200,
		};

		// Check dismissal after expiration - should not be dismissed
		shouldDismiss =
			dismissalManager.shouldDismissNotification(testNotification2);
		expect(shouldDismiss).toBe(false);

		await notificationManager.showNotification(testNotification2);

		// Verify the notification was shown this time (rule expired)
		recentNotifications = notificationManager.getRecentNotifications(10);
		expect(recentNotifications.length).toBe(1);
		expect(recentNotifications[0].message).toBe("Test notification");
	});
});
