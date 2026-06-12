/**
 * NudgeManager Tests
 *
 * Tests for user nudge/notification system with educational messaging.
 * Verifies throttling, race condition protection, and VS Code integration.
 *
 * TEST PATHS:
 * 1. Happy: Nudge shows correctly with educational content
 * 2. Sad: Throttled nudges don't show (session/24h)
 * 3. Edge: Race conditions, concurrent calls, disabled nudges
 * 4. Educational: Verify whyItMatters context is included
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as vscode from "vscode";
import { NudgeManager, type NudgeTrigger, type NudgeResponse } from "../../../src/nurturing/NudgeManager";

// Mock logger to prevent console noise
vi.mock("../../../src/utils/logger", () => ({
	logger: {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}));

describe("NudgeManager", () => {
	let nudgeManager: NudgeManager;
	let mockContext: vscode.ExtensionContext;
	let globalStateMap: Map<string, unknown>;

	beforeEach(() => {
		// Reset state
		globalStateMap = new Map();

		// Create mock extension context
		mockContext = {
			globalState: {
				get: vi.fn((key: string) => globalStateMap.get(key)),
				update: vi.fn((key: string, value: unknown) => {
					globalStateMap.set(key, value);
					return Promise.resolve();
				}),
				keys: () => Array.from(globalStateMap.keys()),
				setKeysForSync: vi.fn(),
			},
			subscriptions: [],
		} as unknown as vscode.ExtensionContext;

		nudgeManager = new NudgeManager(mockContext);

		// Reset VS Code mocks
		vi.mocked(vscode.window.showInformationMessage).mockReset();
		vi.mocked(vscode.commands.executeCommand).mockReset();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	// =========================================================================
	// HAPPY PATH: Nudge shows correctly
	// =========================================================================

	describe("happy path - nudge display", () => {
		it("should show nudge with correct title and message", async () => {
			vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(undefined);

			await nudgeManager.showNudge("session_health_warning");

			expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
				expect.stringContaining("Session Health Warning"),
				expect.any(Object),
				expect.any(String),
				expect.any(String),
				expect.any(String),
			);
		});

		it("should include educational content in the notification", async () => {
			vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(undefined);

			await nudgeManager.showNudge("session_health_warning");

			// Check that the detail includes educational context
			expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
				expect.any(String),
				expect.objectContaining({
					detail: expect.stringContaining("Session health degrades"),
				}),
				expect.any(String),
				expect.any(String),
				expect.any(String),
			);
		});

		it("should execute command when action button clicked", async () => {
			(vscode.window.showInformationMessage as any).mockResolvedValue("Create Snapshot");
			vi.mocked(vscode.commands.executeCommand).mockResolvedValue(undefined);

			await nudgeManager.showNudge("session_health_warning");

			expect(vscode.commands.executeCommand).toHaveBeenCalledWith("vreko.createSnapshot");
		});

		it("should return correct response for user action", async () => {
			(vscode.window.showInformationMessage as any).mockResolvedValue("Create Snapshot");
			vi.mocked(vscode.commands.executeCommand).mockResolvedValue(undefined);

			const response = await nudgeManager.showNudge("session_health_warning");

			expect(response).toBe("create_snapshot");
		});

		it("should return 'dismissed' when user closes notification", async () => {
			vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(undefined);

			const response = await nudgeManager.showNudge("session_health_warning");

			expect(response).toBe("dismissed");
		});
	});

	// =========================================================================
	// THROTTLING: Session and 24-hour limits
	// =========================================================================

	describe("throttling - maybeNudge", () => {
		it("should show nudge on first call", async () => {
			vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(undefined);

			await nudgeManager.maybeNudge("feature_discovered");

			expect(vscode.window.showInformationMessage).toHaveBeenCalled();
			expect(nudgeManager.wasShownThisSession()).toBe(true);
		});

		it("should not show nudge twice in same session", async () => {
			vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(undefined);

			await nudgeManager.maybeNudge("feature_discovered");
			await nudgeManager.maybeNudge("feature_discovered");

			// Should only be called once
			expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(1);
		});

		it("should not show nudge within 24-hour throttle period", async () => {
			// Set last nudge time to 12 hours ago
			const twelveHoursAgo = Date.now() - 12 * 60 * 60 * 1000;
			globalStateMap.set("vreko.lastAuthNudge", twelveHoursAgo);

			await nudgeManager.maybeNudge("feature_discovered");

			expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
		});

		it("should show nudge after 24-hour throttle expires", async () => {
			// Set last nudge time to 25 hours ago
			const twentyFiveHoursAgo = Date.now() - 25 * 60 * 60 * 1000;
			globalStateMap.set("vreko.lastAuthNudge", twentyFiveHoursAgo);
			vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(undefined);

			await nudgeManager.maybeNudge("feature_discovered");

			expect(vscode.window.showInformationMessage).toHaveBeenCalled();
		});

		it("should persist last nudge time to globalState", async () => {
			vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(undefined);

			await nudgeManager.maybeNudge("feature_discovered");

			expect(mockContext.globalState.update).toHaveBeenCalledWith(
				"vreko.lastAuthNudge",
				expect.any(Number),
			);
		});
	});

	// =========================================================================
	// RACE CONDITION PROTECTION
	// =========================================================================

	describe("race condition protection", () => {
		it("should prevent concurrent nudge calls", async () => {
			// Make showInformationMessage slow to simulate real-world timing
			vi.mocked(vscode.window.showInformationMessage).mockImplementation(
				() => new Promise((resolve) => setTimeout(() => resolve(undefined), 100)),
			);

			// Fire multiple concurrent calls
			const results = await Promise.all([
				nudgeManager.maybeNudge("feature_discovered"),
				nudgeManager.maybeNudge("session_health_warning"),
				nudgeManager.maybeNudge("snapshot_recommended"),
			]);

			// Should only show one notification
			expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(1);
		});

		it("should release lock even if nudge fails", async () => {
			vi.mocked(vscode.window.showInformationMessage).mockRejectedValue(new Error("Network error"));

			await nudgeManager.maybeNudge("feature_discovered");

			// Clear error from first call
			vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(undefined);

			// Reset session flag for test (simulating new session)
			// @ts-expect-error - accessing private property for test
			nudgeManager.nudgeShownThisSession = false;

			// Should be able to nudge again after error
			await nudgeManager.maybeNudge("feature_discovered");

			// Second call should work because lock was released
			expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(2);
		});
	});

	// =========================================================================
	// NUDGE DISABLE/ENABLE
	// =========================================================================

	describe("nudge preferences", () => {
		it("should persist 'never' preference", async () => {
			(vscode.window.showInformationMessage as any).mockResolvedValue("Don't Ask Again");

			await nudgeManager.showNudge("snapshot_recommended");

			expect(mockContext.globalState.update).toHaveBeenCalledWith(
				"vreko.nudge.snapshot_recommended.disabled",
				true,
			);
		});

		it("should check if nudge is disabled", async () => {
			globalStateMap.set("vreko.nudge.snapshot_recommended.disabled", true);

			const isDisabled = nudgeManager.isNudgeDisabled("snapshot_recommended");

			expect(isDisabled).toBe(true);
		});

		it("should re-enable nudge when requested", async () => {
			globalStateMap.set("vreko.nudge.snapshot_recommended.disabled", true);

			await nudgeManager.enableNudge("snapshot_recommended");

			expect(mockContext.globalState.update).toHaveBeenCalledWith(
				"vreko.nudge.snapshot_recommended.disabled",
				false,
			);
		});
	});

	// =========================================================================
	// EDUCATIONAL MESSAGING CONTENT
	// =========================================================================

	describe("educational messaging", () => {
		it("should include whyItMatters in session_health_warning nudge", async () => {
			vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(undefined);

			await nudgeManager.showNudge("session_health_warning");

			// The showNudge builds fullMessage with educational content
			// The detail should contain the educational message
			expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
				expect.any(String),
				expect.objectContaining({
					detail: expect.stringContaining("Session health degrades"),
				}),
				expect.any(String),
				expect.any(String),
				expect.any(String),
			);
		});

		it("should include whyItMatters in snapshot_recommended nudge", async () => {
			vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(undefined);

			await nudgeManager.showNudge("snapshot_recommended");

			expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
				expect.stringContaining("Snapshot Recommended"),
				expect.objectContaining({
					detail: expect.stringContaining("Regular snapshots"),
				}),
				expect.any(String),
				expect.any(String),
				expect.any(String),
			);
		});

		it("should provide 'Why?' action for educational context", async () => {
			(vscode.window.showInformationMessage as any).mockResolvedValue("Why?");

			const response = await nudgeManager.showNudge("session_health_warning");

			expect(response).toBe("learn_more");
		});
	});

	// =========================================================================
	// ALL NUDGE TYPES (including commit coaching)
	// =========================================================================

	describe("all nudge types", () => {
		const nudgeTypes: NudgeTrigger[] = [
			"auth_failed",
			"feature_discovered",
			"milestone_reached",
			"session_health_warning",
			"snapshot_recommended",
			"commit_suggested",
			"commit_recommended",
		];

		it.each(nudgeTypes)("should handle %s trigger correctly", async (trigger) => {
			vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(undefined);

			const response = await nudgeManager.showNudge(trigger);

			expect(vscode.window.showInformationMessage).toHaveBeenCalled();
			expect(response).toBe("dismissed");
		});
	});

	// =========================================================================
	// ERROR STATES
	// =========================================================================

	describe("error states", () => {
		it("should return 'dismissed' for unknown trigger", async () => {
			vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(undefined);

			// @ts-expect-error - Testing unknown trigger behavior
			const response = await nudgeManager.showNudge("unknown_trigger");

			// Should not call showInformationMessage for unknown trigger
			expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
			expect(response).toBe("dismissed");
		});

		it("should handle VS Code API failure gracefully in maybeNudge", async () => {
			vi.mocked(vscode.window.showInformationMessage).mockRejectedValue(
				new Error("VS Code API unavailable"),
			);

			// Should not throw - nudges are best-effort
			await expect(nudgeManager.maybeNudge("feature_discovered")).resolves.not.toThrow();

			// Session flag should NOT be set on failure
			expect(nudgeManager.wasShownThisSession()).toBe(false);
		});

		it("should log warning when command execution fails", async () => {
			const { logger } = await import("../../../src/utils/logger");
			(vscode.window.showInformationMessage as any).mockResolvedValue("Create Snapshot");
			vi.mocked(vscode.commands.executeCommand).mockRejectedValue(
				new Error("Command not found"),
			);

			const response = await nudgeManager.showNudge("session_health_warning");

			// Should still return the response even if command fails
			expect(response).toBe("create_snapshot");
			expect(logger.warn).toHaveBeenCalledWith(
				"Nudge action command failed",
				expect.objectContaining({ command: "vreko.createSnapshot" }),
			);
		});

		it("should handle globalState.update failure gracefully", async () => {
			vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(undefined);
			vi.mocked(mockContext.globalState.update).mockRejectedValueOnce(
				new Error("Storage quota exceeded"),
			);

			// Should not throw even if globalState update fails
			await expect(nudgeManager.maybeNudge("feature_discovered")).resolves.not.toThrow();
		});

		it("should return 'dismissed' for unknown action selection", async () => {
			// User selects something that doesn't match any action label
			(vscode.window.showInformationMessage as any).mockResolvedValue("Unknown Action");

			const response = await nudgeManager.showNudge("session_health_warning");

			expect(response).toBe("dismissed");
		});
	});

	// =========================================================================
	// BOUNDARY TESTING
	// =========================================================================

	describe("boundary testing", () => {
		it("should throttle at exactly 24 hours minus 1ms", async () => {
			const now = Date.now();
			const justUnder24Hours = now - (24 * 60 * 60 * 1000 - 1);
			globalStateMap.set("vreko.lastAuthNudge", justUnder24Hours);

			await nudgeManager.maybeNudge("feature_discovered");

			// Should be throttled (just under 24 hours)
			expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
		});

		it("should allow at exactly 24 hours plus 1ms", async () => {
			const now = Date.now();
			const justOver24Hours = now - (24 * 60 * 60 * 1000 + 1);
			globalStateMap.set("vreko.lastAuthNudge", justOver24Hours);
			vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(undefined);

			await nudgeManager.maybeNudge("feature_discovered");

			// Should be allowed (just over 24 hours)
			expect(vscode.window.showInformationMessage).toHaveBeenCalled();
		});

		it("should handle first-time user with no prior state", async () => {
			// globalStateMap is empty - simulating first-time user
			vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(undefined);

			await nudgeManager.maybeNudge("feature_discovered");

			// Should show nudge for first-time user
			expect(vscode.window.showInformationMessage).toHaveBeenCalled();
			expect(nudgeManager.wasShownThisSession()).toBe(true);
		});

		it("should handle corrupted timestamp in globalState", async () => {
			// Simulate corrupted data
			globalStateMap.set("vreko.lastAuthNudge", "not-a-number");
			vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(undefined);

			// NaN arithmetic should result in throttle check passing
			await nudgeManager.maybeNudge("feature_discovered");

			// Should handle gracefully (NaN comparison returns false, allowing nudge)
			expect(vscode.window.showInformationMessage).toHaveBeenCalled();
		});
	});

	// =========================================================================
	// DISABLED NUDGE EDGE CASES
	// =========================================================================

	describe("disabled nudge edge cases", () => {
		it("should return false for non-existent disabled state", () => {
			// No disabled state set
			const isDisabled = nudgeManager.isNudgeDisabled("auth_failed");

			expect(isDisabled).toBe(false);
		});

		it("should handle multiple enableNudge calls idempotently", async () => {
			globalStateMap.set("vreko.nudge.snapshot_recommended.disabled", true);

			await nudgeManager.enableNudge("snapshot_recommended");
			await nudgeManager.enableNudge("snapshot_recommended");
			await nudgeManager.enableNudge("snapshot_recommended");

			// All calls should succeed without error
			expect(nudgeManager.isNudgeDisabled("snapshot_recommended")).toBe(false);
		});

		it("should track disabled state per trigger type", async () => {
			// Disable one type
			globalStateMap.set("vreko.nudge.snapshot_recommended.disabled", true);

			// Other types should not be affected
			expect(nudgeManager.isNudgeDisabled("snapshot_recommended")).toBe(true);
			expect(nudgeManager.isNudgeDisabled("session_health_warning")).toBe(false);
			expect(nudgeManager.isNudgeDisabled("commit_suggested")).toBe(false);
		});
	});

	// =========================================================================
	// COMMIT COACHING SPECIFIC
	// =========================================================================

	describe("commit coaching triggers", () => {
		it("should execute git commit command for commit_suggested", async () => {
			(vscode.window.showInformationMessage as any).mockResolvedValue("Commit Now");
			vi.mocked(vscode.commands.executeCommand).mockResolvedValue(undefined);

			const response = await nudgeManager.showNudge("commit_suggested");

			expect(response).toBe("commit_now");
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"workbench.action.git.commit",
			);
		});

		it("should offer snapshot option for commit_recommended", async () => {
			(vscode.window.showInformationMessage as any).mockResolvedValue("Create Snapshot First");
			vi.mocked(vscode.commands.executeCommand).mockResolvedValue(undefined);

			const response = await nudgeManager.showNudge("commit_recommended");

			expect(response).toBe("create_snapshot");
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"vreko.createSnapshot",
			);
		});

		it("should include research-backed educational content", async () => {
			vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(undefined);

			await nudgeManager.showNudge("commit_suggested");

			// Verify educational content about PR size research
			expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
				expect.stringContaining("Commit"),
				expect.objectContaining({
					detail: expect.stringContaining("Research shows"),
				}),
				expect.any(String),
				expect.any(String),
				expect.any(String),
			);
		});
	});

	// =========================================================================
	// UTILITY METHODS
	// =========================================================================

	describe("utility methods", () => {
		it("getLastNudgeTime should return null when never nudged", () => {
			expect(nudgeManager.getLastNudgeTime()).toBeNull();
		});

		it("getLastNudgeTime should return timestamp when nudged", async () => {
			const timestamp = Date.now() - 60000;
			globalStateMap.set("vreko.lastAuthNudge", timestamp);

			expect(nudgeManager.getLastNudgeTime()).toBe(timestamp);
		});

		it("wasShownThisSession should return false initially", () => {
			expect(nudgeManager.wasShownThisSession()).toBe(false);
		});

		it("wasShownThisSession should return true after showing", async () => {
			vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(undefined);

			await nudgeManager.maybeNudge("feature_discovered");

			expect(nudgeManager.wasShownThisSession()).toBe(true);
		});
	});
});
