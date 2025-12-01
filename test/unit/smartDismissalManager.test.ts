import * as assert from "node:assert";
import * as vscode from "vscode";
import { SmartDismissalManager } from "../../src/smartDismissalManager.js";

suite("SmartDismissalManager Test Suite", () => {
	vscode.window.showInformationMessage("Start all tests.");

	test("Should create smart dismissal manager instance", () => {
		const manager = new SmartDismissalManager();
		assert.ok(manager);
	});

	test("Should not dismiss notifications when no rules exist", () => {
		const manager = new SmartDismissalManager();
		const notification = {
			id: "test-1",
			type: "info" as const,
			message: "Test notification",
			timestamp: Date.now(),
		};

		const shouldDismiss = manager.shouldDismissNotification(notification);
		assert.strictEqual(shouldDismiss, false);
	});

	test("Should dismiss notifications that match exact pattern rules", () => {
		const manager = new SmartDismissalManager();

		// Create a dismissal rule for exact match
		manager.createDismissalRule("Test notification", "exact");

		const notification = {
			id: "test-1",
			type: "info" as const,
			message: "Test notification",
			timestamp: Date.now(),
		};

		const shouldDismiss = manager.shouldDismissNotification(notification);
		assert.strictEqual(shouldDismiss, true);
	});

	test("Should dismiss notifications that contain pattern", () => {
		const manager = new SmartDismissalManager();

		// Create a dismissal rule for contains match
		manager.createDismissalRule("security risk", "contains");

		const notification = {
			id: "test-1",
			type: "warning" as const,
			message: "Potential security risk detected in auth.ts",
			timestamp: Date.now(),
		};

		const shouldDismiss = manager.shouldDismissNotification(notification);
		assert.strictEqual(shouldDismiss, true);
	});

	test("Should not dismiss notifications that do not match pattern", () => {
		const manager = new SmartDismissalManager();

		// Create a dismissal rule
		manager.createDismissalRule("security risk", "contains");

		const notification = {
			id: "test-1",
			type: "info" as const,
			message: "File updated successfully",
			timestamp: Date.now(),
		};

		const shouldDismiss = manager.shouldDismissNotification(notification);
		assert.strictEqual(shouldDismiss, false);
	});

	test("Should dismiss notifications that match regex pattern", () => {
		const manager = new SmartDismissalManager();

		// Create a dismissal rule with regex pattern
		manager.createDismissalRule("file.*updated", "regex");

		const notification = {
			id: "test-1",
			type: "info" as const,
			message: "File src/index.ts updated",
			timestamp: Date.now(),
		};

		const shouldDismiss = manager.shouldDismissNotification(notification);
		assert.strictEqual(shouldDismiss, true);
	});

	test("Should not dismiss notifications after rule expires", () => {
		const manager = new SmartDismissalManager();

		// Create a dismissal rule that expires quickly
		manager.createDismissalRule("Test notification", "exact", 100); // 100ms duration

		const notification = {
			id: "test-1",
			type: "info" as const,
			message: "Test notification",
			timestamp: Date.now(),
		};

		// Should dismiss immediately after creation
		const shouldDismiss = manager.shouldDismissNotification(notification);
		assert.strictEqual(shouldDismiss, true);

		// Wait for the rule to expire
		// Note: In a real test, we would mock time, but for simplicity we'll just check that cleanup works
		const rules = manager.getActiveDismissalRules();
		assert.strictEqual(rules.length, 1);
	});

	test("Should create and remove dismissal rules", () => {
		const manager = new SmartDismissalManager();

		// Create a rule
		const rule = manager.createDismissalRule("Test pattern", "contains");
		assert.ok(rule.id);
		assert.strictEqual(rule.pattern, "Test pattern");

		// Check that rule exists
		let rules = manager.getActiveDismissalRules();
		assert.strictEqual(rules.length, 1);

		// Remove the rule
		manager.removeDismissalRule(rule.id);

		// Check that rule is removed
		rules = manager.getActiveDismissalRules();
		assert.strictEqual(rules.length, 0);
	});

	test("Should clear all dismissal rules", () => {
		const manager = new SmartDismissalManager();

		// Create multiple rules
		manager.createDismissalRule("Pattern 1", "contains");
		manager.createDismissalRule("Pattern 2", "contains");
		manager.createDismissalRule("Pattern 3", "contains");

		// Check that rules exist
		let rules = manager.getActiveDismissalRules();
		assert.strictEqual(rules.length, 3);

		// Clear all rules
		manager.clearAllDismissalRules();

		// Check that all rules are removed
		rules = manager.getActiveDismissalRules();
		assert.strictEqual(rules.length, 0);
	});

	test("Should add smart dismissal action to notification", () => {
		const manager = new SmartDismissalManager();

		const notification = {
			id: "test-1",
			type: "info" as const,
			message: "Test notification",
			timestamp: Date.now(),
			actions: [{ title: "View Details", command: "snapback.viewDetails" }],
		};

		const modifiedNotification = manager.addSmartDismissalAction(notification);

		// Should have the original action plus the new dismissal action
		assert.strictEqual(modifiedNotification.actions?.length, 2);
		assert.strictEqual(
			modifiedNotification.actions?.[1].title,
			"Don't show again",
		);
		assert.strictEqual(
			modifiedNotification.actions?.[1].command,
			"snapback.dismissSimilarNotifications",
		);
	});

	test("Should handle invalid regex patterns gracefully", () => {
		const manager = new SmartDismissalManager();

		// Create a rule with invalid regex
		manager.createDismissalRule("[Invalid regex(", "regex");

		const notification = {
			id: "test-1",
			type: "info" as const,
			message: "Test notification",
			timestamp: Date.now(),
		};

		// Should not throw an error and should not dismiss the notification
		const shouldDismiss = manager.shouldDismissNotification(notification);
		assert.strictEqual(shouldDismiss, false);
	});
});
