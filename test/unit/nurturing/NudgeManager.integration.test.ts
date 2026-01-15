/**
 * NudgeManager Integration Tests
 *
 * Tests the wiring between NudgeManager and its consumers:
 * - VitalsUIIntegration: Session health and pressure-based nudges
 * - AutoDecisionIntegration: Commit coaching via CommitRiskBridge
 *
 * These tests verify the interaction lifecycle and signal flow
 * without mocking the NudgeManager itself.
 *
 * @see VitalsUIIntegration.ts - handleSessionHealthUpdate() triggers nudges
 * @see AutoDecisionIntegration.ts - evaluateCommitCoaching() triggers nudges
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExtensionContext } from "vscode";
import * as vscode from "vscode";
import { NudgeManager } from "../../../src/nurturing/NudgeManager";

// Mock logger
vi.mock("../../../src/utils/logger", () => ({
	logger: {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}));

/**
 * Create mock ExtensionContext with proper globalState
 */
function createMockContext(): { context: ExtensionContext; globalStateMap: Map<string, unknown> } {
	const globalStateMap = new Map<string, unknown>();

	const context = {
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
	} as unknown as ExtensionContext;

	return { context, globalStateMap };
}

describe("NudgeManager Integration", () => {
	let nudgeManager: NudgeManager;
	let mockContext: ExtensionContext;
	let globalStateMap: Map<string, unknown>;

	beforeEach(() => {
		const mock = createMockContext();
		mockContext = mock.context;
		globalStateMap = mock.globalStateMap;
		nudgeManager = new NudgeManager(mockContext);

		vi.mocked(vscode.window.showInformationMessage).mockReset();
		vi.mocked(vscode.commands.executeCommand).mockReset();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	// =========================================================================
	// VitalsUIIntegration Scenarios
	// =========================================================================

	describe("VitalsUIIntegration scenarios", () => {
		it("should handle session_health_warning from health degradation", async () => {
			vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(undefined);

			// Simulate what VitalsUIIntegration does on health transition
			await nudgeManager.maybeNudge("session_health_warning");

			expect(vscode.window.showInformationMessage).toHaveBeenCalled();
			expect(nudgeManager.wasShownThisSession()).toBe(true);
		});

		it("should handle snapshot_recommended from pressure threshold", async () => {
			vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(undefined);

			// Simulate what VitalsUIIntegration does when pressure >= 60
			await nudgeManager.maybeNudge("snapshot_recommended");

			expect(vscode.window.showInformationMessage).toHaveBeenCalled();
		});

		it("should respect disabled preference from VitalsUI context", async () => {
			// User previously disabled this nudge type
			globalStateMap.set("snapback.nudge.session_health_warning.disabled", true);

			// VitalsUIIntegration should check before calling
			const isDisabled = nudgeManager.isNudgeDisabled("session_health_warning");

			expect(isDisabled).toBe(true);
			// VitalsUIIntegration would not call maybeNudge if disabled
		});

		it("should only nudge once per session even with multiple health transitions", async () => {
			vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(undefined);

			// Simulate multiple health transitions in a session
			await nudgeManager.maybeNudge("session_health_warning");
			await nudgeManager.maybeNudge("session_health_warning");
			await nudgeManager.maybeNudge("snapshot_recommended");

			// Should only show one nudge
			expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(1);
		});
	});

	// =========================================================================
	// CommitRiskBridge Scenarios
	// =========================================================================

	describe("CommitRiskBridge scenarios", () => {
		it("should handle commit_suggested from moderate risk", async () => {
			vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(undefined);

			// Simulate what AutoDecisionIntegration does at 0.55 threshold
			await nudgeManager.maybeNudge("commit_suggested");

			expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
				expect.stringContaining("Good Time to Commit"),
				expect.any(Object),
				expect.any(String),
				expect.any(String),
				expect.any(String),
			);
		});

		it("should handle commit_recommended from high risk", async () => {
			vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(undefined);

			// Simulate what AutoDecisionIntegration does at 0.80 threshold
			await nudgeManager.maybeNudge("commit_recommended");

			expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
				expect.stringContaining("Commit Recommended"),
				expect.any(Object),
				expect.any(String),
				expect.any(String),
				expect.any(String),
			);
		});

		it("should respect wasShownThisSession before CommitRiskBridge shows nudge", async () => {
			vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(undefined);

			// First nudge from VitalsUI
			await nudgeManager.maybeNudge("session_health_warning");

			// CommitRiskBridge checks session state
			const alreadyShown = nudgeManager.wasShownThisSession();

			expect(alreadyShown).toBe(true);
			// CommitRiskBridge would skip showing commit coaching
		});

		it("should respect disabled preference for commit coaching", async () => {
			// User disabled commit nudges
			globalStateMap.set("snapback.nudge.commit_suggested.disabled", true);

			const isDisabled = nudgeManager.isNudgeDisabled("commit_suggested");

			expect(isDisabled).toBe(true);
		});
	});

	// =========================================================================
	// Cross-System Coordination
	// =========================================================================

	describe("cross-system coordination", () => {
		it("should share session state across different trigger sources", async () => {
			vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(undefined);

			// VitalsUI triggers first
			await nudgeManager.maybeNudge("session_health_warning");

			// CommitRiskBridge tries to trigger later
			await nudgeManager.maybeNudge("commit_suggested");

			// Only one nudge should have been shown
			expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(1);
		});

		it("should respect 24h throttle across sessions", async () => {
			// Simulate previous session nudge
			const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
			globalStateMap.set("snapback.lastAuthNudge", twoHoursAgo);

			// New session starts (fresh NudgeManager)
			const newNudgeManager = new NudgeManager(mockContext);

			await newNudgeManager.maybeNudge("feature_discovered");

			// Should be throttled by 24h period
			expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
		});

		it("should allow nudge after 24h even if shown in previous session", async () => {
			// Simulate nudge from 25 hours ago
			const twentyFiveHoursAgo = Date.now() - 25 * 60 * 60 * 1000;
			globalStateMap.set("snapback.lastAuthNudge", twentyFiveHoursAgo);
			vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(undefined);

			// New session starts
			const newNudgeManager = new NudgeManager(mockContext);

			await newNudgeManager.maybeNudge("feature_discovered");

			// Should be allowed (24h expired)
			expect(vscode.window.showInformationMessage).toHaveBeenCalled();
		});
	});

	// =========================================================================
	// User Response Handling
	// =========================================================================

	describe("user response handling", () => {
		it("should execute snapshot command when user clicks Create Snapshot", async () => {
			(vscode.window.showInformationMessage as any).mockResolvedValue("Create Snapshot");
			vi.mocked(vscode.commands.executeCommand).mockResolvedValue(undefined);

			await nudgeManager.showNudge("session_health_warning");

			expect(vscode.commands.executeCommand).toHaveBeenCalledWith("snapback.createSnapshot");
		});

		it("should execute commit command when user clicks Commit Now", async () => {
			(vscode.window.showInformationMessage as any).mockResolvedValue("Commit Now");
			vi.mocked(vscode.commands.executeCommand).mockResolvedValue(undefined);

			await nudgeManager.showNudge("commit_suggested");

			expect(vscode.commands.executeCommand).toHaveBeenCalledWith("workbench.action.git.commit");
		});

		it("should persist never preference and prevent future nudges", async () => {
			(vscode.window.showInformationMessage as any).mockResolvedValue("Don't Ask Again");

			await nudgeManager.showNudge("snapshot_recommended");

			// Preference persisted
			expect(mockContext.globalState.update).toHaveBeenCalledWith(
				"snapback.nudge.snapshot_recommended.disabled",
				true,
			);

			// Future checks should return disabled
			expect(nudgeManager.isNudgeDisabled("snapshot_recommended")).toBe(true);
		});
	});

	// =========================================================================
	// Error Recovery in Integration Context
	// =========================================================================

	describe("error recovery in integration context", () => {
		it("should not block subsequent triggers if one fails", async () => {
			// First call fails
			vi.mocked(vscode.window.showInformationMessage).mockRejectedValueOnce(
				new Error("VS Code busy"),
			);

			await nudgeManager.maybeNudge("session_health_warning");

			// Reset for second call
			vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(undefined);
			// @ts-expect-error - accessing private for test
			nudgeManager.nudgeShownThisSession = false;

			// Second call should work (lock released)
			await nudgeManager.maybeNudge("commit_suggested");

			expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(2);
		});

		it("should handle rapid successive calls from different systems", async () => {
			vi.mocked(vscode.window.showInformationMessage).mockImplementation(
				() => new Promise((resolve) => setTimeout(() => resolve(undefined), 50)),
			);

			// Simulate rapid calls from VitalsUI and CommitRiskBridge
			const results = await Promise.allSettled([
				nudgeManager.maybeNudge("session_health_warning"),
				nudgeManager.maybeNudge("commit_suggested"),
				nudgeManager.maybeNudge("snapshot_recommended"),
			]);

			// All should settle without error
			expect(results.every((r) => r.status === "fulfilled")).toBe(true);

			// Only one should have shown
			expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(1);
		});
	});
});
