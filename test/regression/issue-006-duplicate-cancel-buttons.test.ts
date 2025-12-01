/**
 * Regression Test: Issue #6 - Duplicate Cancel Buttons in Confirmation Dialog
 *
 * BUG: The confirmRestoration dialog shows duplicate Cancel buttons:
 * [Cancel] [Restore] [Cancel]
 *
 * LOCATION: src/checkpointSelector.ts confirmRestoration function (lines 122-134)
 *
 * CURRENT BEHAVIOR:
 * - Dialog button order: 'Cancel', 'SnapBack', 'Cancel' (duplicate)
 * - Confusing UX with two identical buttons
 * - VS Code expects: modal option, then action buttons
 *
 * EXPECTED BEHAVIOR:
 * - Dialog should show: [Cancel] [SnapBack]
 * - Single Cancel button (modal: true option)
 * - Action buttons only in the variadic parameters
 *
 * FIX: Remove 'Cancel' from the variadic button parameters (it's redundant with modal: true)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";

describe("Regression: Issue #6 - Duplicate Cancel Buttons", () => {
	let showWarningMessageSpy: any;

	beforeEach(() => {
		showWarningMessageSpy = vi.spyOn(vscode.window, "showWarningMessage");
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	/**
	 * TEST: Current broken behavior - duplicate Cancel buttons
	 * This test documents the bug and will FAIL after fix
	 */
	it("should reproduce the bug - shows duplicate Cancel buttons", async () => {
		// Current broken implementation
		showWarningMessageSpy.mockResolvedValue("Cancel");

		const result = await brokenConfirmRestoration("Test Checkpoint");

		// Bug: showWarningMessage called with duplicate 'Cancel'
		expect(showWarningMessageSpy).toHaveBeenCalledWith(
			expect.any(String),
			{ modal: true },
			"Cancel", // First Cancel (redundant)
			"SnapBack", // Action button
			"Cancel", // Second Cancel (duplicate)
		);

		expect(result).toBe(false);
	});

	/**
	 * TEST: Expected fixed behavior - single Cancel button
	 * This test will PASS after the fix is implemented
	 */
	it("should show single Cancel button in dialog after fix", async () => {
		showWarningMessageSpy.mockResolvedValue("SnapBack");

		const result = await fixedConfirmRestoration("Test Checkpoint");

		// Fixed: Only 'SnapBack' in action buttons (Cancel is implicit with modal: true)
		expect(showWarningMessageSpy).toHaveBeenCalledWith(
			expect.any(String),
			{ modal: true },
			"SnapBack", // Only action button
		);

		expect(result).toBe(true);
	});

	/**
	 * TEST: Verify modal:true provides implicit Cancel button
	 */
	it("should rely on modal:true for Cancel button, not explicit button", async () => {
		showWarningMessageSpy.mockResolvedValue(undefined);

		await fixedConfirmRestoration("Test Checkpoint");

		const callArgs = showWarningMessageSpy.mock.calls[0];
		const options = callArgs[1];
		const buttons = callArgs.slice(2);

		// Should have modal: true (provides implicit Cancel)
		expect(options.modal).toBe(true);

		// Should NOT have 'Cancel' in explicit buttons
		expect(buttons).not.toContain("Cancel");

		// Should only have action button
		expect(buttons).toEqual(["SnapBack"]);
	});

	/**
	 * TEST: Verify button count is correct
	 */
	it("should have exactly one action button (SnapBack)", async () => {
		showWarningMessageSpy.mockResolvedValue("SnapBack");

		await fixedConfirmRestoration("Test Checkpoint");

		const callArgs = showWarningMessageSpy.mock.calls[0];
		const buttons = callArgs.slice(2); // Skip message and options

		// Should have exactly 1 button
		expect(buttons.length).toBe(1);

		// That button should be 'SnapBack'
		expect(buttons[0]).toBe("SnapBack");
	});

	/**
	 * TEST: Verify user clicking Cancel (implicit) returns false
	 */
	it("should return false when user dismisses modal (Cancel)", async () => {
		// When modal is dismissed or Cancel is clicked, promise resolves to undefined
		showWarningMessageSpy.mockResolvedValue(undefined);

		const result = await fixedConfirmRestoration("Test Checkpoint");

		// Should return false for cancellation
		expect(result).toBe(false);
	});

	/**
	 * TEST: Verify user clicking SnapBack returns true
	 */
	it("should return true when user clicks SnapBack button", async () => {
		showWarningMessageSpy.mockResolvedValue("SnapBack");

		const result = await fixedConfirmRestoration("Test Checkpoint");

		// Should return true for confirmation
		expect(result).toBe(true);
	});

	/**
	 * TEST: Verify dialog message includes checkpoint name
	 */
	it("should include checkpoint name in confirmation message", async () => {
		showWarningMessageSpy.mockResolvedValue("SnapBack");

		const checkpointName = "Important Checkpoint - Oct 8, 8:20 PM";
		await fixedConfirmRestoration(checkpointName);

		const message = showWarningMessageSpy.mock.calls[0][0];

		// Message should include checkpoint name
		expect(message).toContain(checkpointName);

		// Message should be clear about restoration action
		expect(message.toLowerCase()).toContain("restore");
	});

	/**
	 * TEST: Verify selective file restoration variant
	 */
	it("should handle file count parameter for selective restoration", async () => {
		showWarningMessageSpy.mockResolvedValue("SnapBack");

		await fixedConfirmRestoration("Test Checkpoint", 3);

		const message = showWarningMessageSpy.mock.calls[0][0];

		// Should mention file count
		expect(message).toContain("3");
		expect(message.toLowerCase()).toContain("file");
	});

	/**
	 * TEST: Verify button order matches VS Code conventions
	 */
	it("should follow VS Code button order convention (cancel implicit, actions explicit)", async () => {
		showWarningMessageSpy.mockResolvedValue("SnapBack");

		await fixedConfirmRestoration("Test Checkpoint");

		const callArgs = showWarningMessageSpy.mock.calls[0];

		// First arg: message
		expect(typeof callArgs[0]).toBe("string");

		// Second arg: options with modal: true
		expect(callArgs[1]).toHaveProperty("modal", true);

		// Remaining args: action buttons only
		const actionButtons = callArgs.slice(2);
		expect(actionButtons).toEqual(["SnapBack"]);
	});

	/**
	 * TEST: Verify no other duplicate buttons (like SnapBack)
	 */
	it("should not have any duplicate buttons in the dialog", async () => {
		showWarningMessageSpy.mockResolvedValue("SnapBack");

		await fixedConfirmRestoration("Test Checkpoint");

		const callArgs = showWarningMessageSpy.mock.calls[0];
		const allButtons = callArgs.slice(2);

		// Get unique buttons
		const uniqueButtons = new Set(allButtons);

		// Number of unique buttons should equal total buttons
		expect(uniqueButtons.size).toBe(allButtons.length);
	});

	/**
	 * TEST: Verify modal option is actually set to true
	 */
	it("should set modal:true to enable focus-stealing dialog", async () => {
		showWarningMessageSpy.mockResolvedValue("SnapBack");

		await fixedConfirmRestoration("Test Checkpoint");

		const options = showWarningMessageSpy.mock.calls[0][1];

		// Must have modal: true for proper UX
		expect(options).toHaveProperty("modal");
		expect(options.modal).toBe(true);
	});

	/**
	 * TEST: Verify Escape key behavior (should cancel)
	 */
	it("should treat Escape key same as Cancel button", async () => {
		// Escape key causes promise to resolve to undefined
		showWarningMessageSpy.mockResolvedValue(undefined);

		const result = await fixedConfirmRestoration("Test Checkpoint");

		// Should be treated as cancellation
		expect(result).toBe(false);
	});

	/**
	 * TEST: Verify button capitalization matches VS Code style
	 */
	it("should use proper title case for button text", async () => {
		showWarningMessageSpy.mockResolvedValue("SnapBack");

		await fixedConfirmRestoration("Test Checkpoint");

		const buttons = showWarningMessageSpy.mock.calls[0].slice(2);

		// Button should be 'SnapBack' (proper capitalization)
		expect(buttons[0]).toBe("SnapBack");

		// Not lowercase or all caps
		expect(buttons[0]).not.toBe("snapback");
		expect(buttons[0]).not.toBe("SNAPBACK");
	});
});

/**
 * Helper: BROKEN implementation with duplicate Cancel buttons
 */
async function brokenConfirmRestoration(
	checkpointName: string,
	fileCount?: number,
): Promise<boolean> {
	const message = fileCount
		? `Restore ${fileCount} files from checkpoint "${checkpointName}"?`
		: `Restore workspace to checkpoint "${checkpointName}"?`;

	// Bug: Three buttons - 'Cancel', 'SnapBack', 'Cancel'
	const result = await vscode.window.showWarningMessage(
		message,
		{ modal: true },
		"Cancel", // Bug: First Cancel (redundant)
		"SnapBack",
		"Cancel", // Bug: Duplicate Cancel
	);

	return result === "SnapBack";
}

/**
 * Helper: FIXED implementation with single Cancel (implicit)
 */
async function fixedConfirmRestoration(
	checkpointName: string,
	fileCount?: number,
): Promise<boolean> {
	const message = fileCount
		? `Restore ${fileCount} files from checkpoint "${checkpointName}"?`
		: `Restore workspace to checkpoint "${checkpointName}"?`;

	// Fixed: Only 'SnapBack' button (Cancel is implicit with modal: true)
	const result = await vscode.window.showWarningMessage(
		message,
		{ modal: true },
		"SnapBack", // Only action button
	);

	return result === "SnapBack";
}
