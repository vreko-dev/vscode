import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationManager } from "../../src/notificationManager";

// Mock VS Code API
vi.mock("vscode", () => ({
	window: {
		showInformationMessage: vi.fn(),
		showWarningMessage: vi.fn(),
		showErrorMessage: vi.fn(),
	},
}));

describe("Dismiss Similar Notifications Integration", () => {
	let notificationManager: NotificationManager;

	beforeEach(() => {
		notificationManager = new NotificationManager();
		// Clear all dismissal rules before each test
		const rules = notificationManager.getActiveDismissalRules();
		rules.forEach((rule) => {
			// @ts-expect-error - accessing private method for testing
			notificationManager.removeDismissalRule(rule.id);
		});
	});

	it("should create dismissal rule when dismiss similar notifications command is executed", async () => {
		// Create a notification
		const testNotification = {
			id: "test-1",
			type: "info" as const,
			message: "Test notification message",
			timestamp: Date.now(),
		};

		// Show the notification
		await notificationManager.showNotification(testNotification);

		// Verify the notification was added to history
		const recentNotifications = notificationManager.getRecentNotifications(1);
		expect(recentNotifications.length).toBe(1);
		expect(recentNotifications[0].message).toBe("Test notification message");

		// Create a dismissal rule for similar notifications
		const _rule = notificationManager.createDismissalRule(
			"Test notification message",
			"contains",
		);

		// Verify the rule was created
		const activeRules = notificationManager.getActiveDismissalRules();
		expect(activeRules.length).toBe(1);
		expect(activeRules[0].pattern).toBe("Test notification message");
		expect(activeRules[0].matchType).toBe("contains");
	});

	it("should dismiss notifications that match dismissal rules", async () => {
		// Create a dismissal rule
		notificationManager.createDismissalRule("Security alert", "contains");

		// Create a notification that matches the dismissal rule
		const securityNotification = {
			id: "security-1",
			type: "warning" as const,
			message: "Security alert detected in auth.ts",
			timestamp: Date.now(),
		};

		// Try to show the notification
		await notificationManager.showNotification(securityNotification);

		// Verify the notification was not added to history (dismissed)
		const recentNotifications = notificationManager.getRecentNotifications(10);
		expect(recentNotifications.length).toBe(0);
	});

	it("should not dismiss notifications that do not match dismissal rules", async () => {
		// Create a dismissal rule
		notificationManager.createDismissalRule("Security alert", "contains");

		// Create a notification that does not match the dismissal rule
		const infoNotification = {
			id: "info-1",
			type: "info" as const,
			message: "Checkpoint created successfully",
			timestamp: Date.now(),
		};

		// Show the notification
		await notificationManager.showNotification(infoNotification);

		// Verify the notification was added to history (not dismissed)
		const recentNotifications = notificationManager.getRecentNotifications(10);
		expect(recentNotifications.length).toBe(1);
		expect(recentNotifications[0].message).toBe(
			"Checkpoint created successfully",
		);
	});

	it("should add smart dismissal action to notifications", () => {
		// Create a notification
		const testNotification = {
			id: "test-1",
			type: "info" as const,
			message: "Test notification",
			timestamp: Date.now(),
			actions: [{ title: "View Details", command: "snapback.viewDetails" }],
		};

		// @ts-expect-error - accessing private method for testing
		const modifiedNotification =
			notificationManager.smartDismissalManager.addSmartDismissalAction(
				testNotification,
			);

		// Verify the notification has the additional dismissal action
		expect(modifiedNotification.actions).toBeDefined();
		expect(modifiedNotification.actions?.length).toBe(2);
		expect(modifiedNotification.actions?.[0].title).toBe("View Details");
		expect(modifiedNotification.actions?.[1].title).toBe("Don't show again");
		expect(modifiedNotification.actions?.[1].command).toBe(
			"snapback.dismissSimilarNotifications",
		);
	});
});
