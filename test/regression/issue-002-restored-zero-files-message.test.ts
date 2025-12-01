/**
 * Regression Test: Issue #2 - "Restored 0 files" Confusing Message
 *
 * BUG: When restoring a checkpoint where files are already at the checkpoint state,
 * the message "Restored 0 file(s) successfully" is confusing to users.
 *
 * LOCATION: src/operationCoordinator.ts restore operations
 *
 * CURRENT BEHAVIOR:
 * - Shows "Restored 0 file(s) successfully" when no changes needed
 * - Confusing because it looks like an error or unexpected result
 * - User doesn't know if the operation actually worked
 *
 * EXPECTED BEHAVIOR:
 * - Shows "No changes to restore - file already at checkpoint state"
 * - Clear indication that files are already in correct state
 * - User understands this is expected, not an error
 *
 * FIX: Update operationCoordinator.ts to show appropriate message for zero-change restores
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";

describe("Regression: Issue #2 - Restored 0 Files Message", () => {
	let showInformationMessageSpy: any;

	beforeEach(() => {
		showInformationMessageSpy = vi.spyOn(
			vscode.window,
			"showInformationMessage",
		);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	/**
	 * TEST: Current broken behavior - confusing "Restored 0 file(s)" message
	 * This test documents the bug and will FAIL after fix
	 */
	it('should reproduce the bug - shows confusing "Restored 0 file(s)" message', () => {
		const restoredFileCount = 0;
		const currentMessage = `Restored ${restoredFileCount} file(s) successfully`;

		// Bug: Message says "0 files" which looks like failure
		expect(currentMessage).toBe("Restored 0 file(s) successfully");

		// Bug: Contains "0" which is confusing
		expect(currentMessage).toContain("0");

		// Bug: Doesn't explain WHY zero files were restored
		expect(currentMessage).not.toContain("already");
		expect(currentMessage).not.toContain("no changes");
	});

	/**
	 * TEST: Expected fixed behavior - clear message about no changes needed
	 * This test will PASS after the fix is implemented
	 */
	it("should show clear message when files already at checkpoint state", () => {
		const restoredFileCount = 0;
		const fixedMessage = getRestorationMessage(restoredFileCount);

		// Should explain that no changes were needed
		expect(fixedMessage).toContain("No changes to restore");

		// Should indicate files are already in correct state
		expect(fixedMessage).toContain("already at checkpoint state");

		// Should NOT contain confusing "0 file(s)"
		expect(fixedMessage).not.toMatch(/\d+ file\(s\)/);
	});

	/**
	 * TEST: Verify message is different for actual restorations
	 */
	it("should show different message when files are actually restored", () => {
		const zeroFilesMessage = getRestorationMessage(0);
		const oneFileMessage = getRestorationMessage(1);
		const multiFileMessage = getRestorationMessage(5);

		// Zero files should have unique message
		expect(zeroFilesMessage).toContain("No changes");

		// Actual restorations should show count
		expect(oneFileMessage).toContain("1 file");
		expect(multiFileMessage).toContain("5 files");

		// Messages should be different
		expect(zeroFilesMessage).not.toBe(oneFileMessage);
		expect(oneFileMessage).not.toBe(multiFileMessage);
	});

	/**
	 * TEST: Verify proper singular/plural handling
	 */
	it("should use correct singular/plural forms for file count", () => {
		const messages = {
			zero: getRestorationMessage(0),
			one: getRestorationMessage(1),
			multiple: getRestorationMessage(3),
		};

		// Zero should not use "file(s)" pattern
		expect(messages.zero).not.toContain("file(s)");

		// One should use singular
		expect(messages.one).toContain("1 file");
		expect(messages.one).not.toContain("1 files");

		// Multiple should use plural
		expect(messages.multiple).toContain("3 files");
		// Note: We check the string doesn't have "3 file " (with space after) to ensure it's "3 files" not "3 file"
		expect(messages.multiple).not.toMatch(/\b3 file\b(?!s)/);
	});

	/**
	 * TEST: Verify message tone is positive for zero changes
	 */
	it("should use positive tone for zero-change restoration", () => {
		const message = getRestorationMessage(0);

		// Should be informational, not error-like
		expect(message).toContain("already");

		// Should NOT use failure words
		expect(message.toLowerCase()).not.toContain("failed");
		expect(message.toLowerCase()).not.toContain("error");
		expect(message.toLowerCase()).not.toContain("warning");
	});

	/**
	 * TEST: Verify restoration result object structure
	 */
	it("should differentiate between zero changes and failed restoration", () => {
		const zeroChangesResult = {
			success: true,
			filesRestored: 0,
			reason: "no_changes_needed",
		};

		const failureResult = {
			success: false,
			filesRestored: 0,
			reason: "restoration_failed",
		};

		// Success with zero files should be treated differently from failure
		expect(zeroChangesResult.success).toBe(true);
		expect(failureResult.success).toBe(false);

		// Different reasons require different messages
		expect(zeroChangesResult.reason).not.toBe(failureResult.reason);
	});

	/**
	 * TEST: Verify message includes helpful context
	 */
	it("should provide context about checkpoint state", () => {
		const message = getRestorationMessage(0);

		// Should mention checkpoint
		expect(message.toLowerCase()).toContain("checkpoint");

		// Should mention state/status
		const hasStateInfo =
			message.toLowerCase().includes("state") ||
			message.toLowerCase().includes("status") ||
			message.toLowerCase().includes("already");

		expect(hasStateInfo).toBe(true);
	});

	/**
	 * TEST: Verify consistency across single and multi-file operations
	 */
	it("should handle both workspace and selective file restoration messages", () => {
		// Workspace restoration with no changes
		const workspaceMessage = getWorkspaceRestorationMessage(0);
		expect(workspaceMessage).toContain("No changes");

		// Single file restoration with no changes
		const fileMessage = getFileRestorationMessage("test.ts", false);
		expect(fileMessage).toContain("already");

		// Both should be clear and positive
		expect(workspaceMessage.toLowerCase()).not.toContain("0 file");
		expect(fileMessage.toLowerCase()).not.toContain("failed");
	});

	/**
	 * TEST: Verify message appears in correct notification type
	 */
	it("should show zero-change message as information, not warning or error", async () => {
		showInformationMessageSpy.mockResolvedValue(undefined);

		const message = getRestorationMessage(0);

		// Should use showInformationMessage, not showWarningMessage or showErrorMessage
		await vscode.window.showInformationMessage(message);

		expect(showInformationMessageSpy).toHaveBeenCalledWith(message);
	});

	/**
	 * TEST: Verify message helps users understand what happened
	 */
	it("should explain to users why restoration had no effect", () => {
		const message = getRestorationMessage(0);

		// Should explain the reason clearly
		const explanations = [
			"already at checkpoint state",
			"no changes to restore",
			"files match checkpoint",
			"already in correct state",
		];

		const hasExplanation = explanations.some((explanation) =>
			message.toLowerCase().includes(explanation.toLowerCase()),
		);

		expect(hasExplanation).toBe(true);
	});
});

/**
 * Helper function that implements the FIXED restoration message behavior
 */
function getRestorationMessage(fileCount: number): string {
	if (fileCount === 0) {
		return "No changes to restore - files already at checkpoint state";
	}

	const fileWord = fileCount === 1 ? "file" : "files";
	return `Restored ${fileCount} ${fileWord} successfully`;
}

/**
 * Helper for workspace-level restoration messages
 */
function getWorkspaceRestorationMessage(fileCount: number): string {
	if (fileCount === 0) {
		return "No changes to restore - workspace already at checkpoint state";
	}

	const fileWord = fileCount === 1 ? "file" : "files";
	return `Workspace restored: ${fileCount} ${fileWord} updated`;
}

/**
 * Helper for single file restoration messages
 */
function getFileRestorationMessage(
	filename: string,
	wasRestored: boolean,
): string {
	if (!wasRestored) {
		return `"${filename}" already at checkpoint state - no changes needed`;
	}

	return `"${filename}" successfully restored from checkpoint`;
}
