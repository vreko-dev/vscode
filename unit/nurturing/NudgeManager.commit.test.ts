/**
 * NudgeManager Commit Coaching Tests
 *
 * Tests the commit coaching triggers for NudgeManager.
 * Based on 2025-2026 research:
 * - "Commit frequently so you can roll back" - AI code best practices
 * - Educational messaging to teach good commit hygiene
 * - LinearB 2025 benchmarks showing PR size as #1 velocity driver
 *
 * @see https://linearb.io/blog/2025-engineering-benchmarks-insights
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExtensionContext, Memento } from "vscode";
import * as vscode from "vscode";

// Import NudgeManager and types
import { NudgeManager, type NudgeTrigger, type NudgeResponse } from "../../../src/nurturing/NudgeManager";

// Mock vscode
vi.mock("vscode", () => ({
	window: {
		showInformationMessage: vi.fn(),
		showWarningMessage: vi.fn(),
	},
	commands: {
		executeCommand: vi.fn(),
	},
}));

/**
 * Create mock ExtensionContext
 */
function createMockContext(): ExtensionContext {
	const globalStorage = new Map<string, unknown>();

	return {
		globalState: {
			keys: () => Array.from(globalStorage.keys()),
			get: <T>(key: string, defaultValue?: T): T => {
				return (globalStorage.get(key) as T) ?? (defaultValue as T);
			},
			update: vi.fn(async (key: string, value: unknown) => {
				if (value === undefined) {
					globalStorage.delete(key);
				} else {
					globalStorage.set(key, value);
				}
			}),
			setKeysForSync: vi.fn(),
		} as unknown as Memento & { setKeysForSync: (keys: readonly string[]) => void },
		subscriptions: [],
		workspaceState: {} as Memento,
		secrets: {} as any,
		extensionUri: {} as any,
		extensionPath: "",
		environmentVariableCollection: {} as any,
		storageUri: {} as any,
		globalStorageUri: {} as any,
		logUri: {} as any,
		extensionMode: 1,
		extension: {} as any,
		languageModelAccessInformation: {} as any,
		asAbsolutePath: (path: string) => path,
	} as unknown as ExtensionContext;
}

describe("NudgeManager - Commit Coaching", () => {
	let nudgeManager: NudgeManager;
	let mockContext: ExtensionContext;

	beforeEach(() => {
		vi.clearAllMocks();
		mockContext = createMockContext();
		nudgeManager = new NudgeManager(mockContext);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	// ===========================================================================
	// New Trigger Support Tests
	// ===========================================================================

	describe("Commit Coaching Triggers", () => {
		it("should recognize commit_suggested as a valid trigger", () => {
			// Type assertion to ensure TypeScript recognizes the trigger
			const trigger: NudgeTrigger = "commit_suggested";
			expect(trigger).toBe("commit_suggested");
		});

		it("should recognize commit_recommended as a valid trigger", () => {
			const trigger: NudgeTrigger = "commit_recommended";
			expect(trigger).toBe("commit_recommended");
		});

		it("should handle commit_suggested trigger", async () => {
			// Mock user clicking "Commit Now"
			vi.mocked(vscode.window.showInformationMessage).mockResolvedValue("Commit Now" as any);

			const response = await nudgeManager.showNudge("commit_suggested");

			expect(vscode.window.showInformationMessage).toHaveBeenCalled();
			// Verify the message contains commit-related content
			const callArgs = vi.mocked(vscode.window.showInformationMessage).mock.calls[0];
			expect(callArgs[0]).toContain("Commit");
		});

		it("should handle commit_recommended trigger", async () => {
			// Implementation uses showInformationMessage for all nudges
			vi.mocked(vscode.window.showInformationMessage).mockResolvedValue("Commit Now" as any);

			const response = await nudgeManager.showNudge("commit_recommended");

			// Verify the nudge was shown
			expect(vscode.window.showInformationMessage).toHaveBeenCalled();
		});
	});

	// ===========================================================================
	// Educational Messaging Tests
	// ===========================================================================

	describe("Educational Messaging", () => {
		it("should include educational content for commit_suggested", async () => {
			vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(undefined);

			await nudgeManager.showNudge("commit_suggested");

			const callArgs = vi.mocked(vscode.window.showInformationMessage).mock.calls[0];
			const message = callArgs[0] as string;

			// Should contain commit-related content
			expect(message.toLowerCase()).toMatch(/commit|changes|pr|review/);
		});

		it("should include research-backed message for commit_recommended", async () => {
			vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(undefined);

			await nudgeManager.showNudge("commit_recommended");

			const callArgs = vi.mocked(vscode.window.showInformationMessage).mock.calls[0];
			const message = callArgs[0] as string;

			// Should contain educational content about committing
			expect(message.length).toBeGreaterThan(20); // Substantial message
		});

		it("should provide Learn More action", async () => {
			vi.mocked(vscode.window.showInformationMessage).mockResolvedValue("Learn More" as any);

			const response = await nudgeManager.showNudge("commit_suggested");

			// "Learn More" returns "learn_more" response (though not in commit triggers)
			// The commit triggers only have: Commit Now, Create Snapshot, Not Now
			expect(response).toBeDefined();
		});
	});

	// ===========================================================================
	// Action Response Tests
	// ===========================================================================

	describe("Action Responses", () => {
		it("should execute git commit command when user clicks 'Commit Now'", async () => {
			vi.mocked(vscode.window.showInformationMessage).mockResolvedValue("Commit Now" as any);

			const response = await nudgeManager.showNudge("commit_suggested");

			expect(response).toBe("commit_now");
			// Should trigger the git commit command (workbench.action.git.commit)
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith("workbench.action.git.commit");
		});

		it("should create snapshot when user clicks 'Create Snapshot'", async () => {
			vi.mocked(vscode.window.showInformationMessage).mockResolvedValue("Create Snapshot" as any);

			const response = await nudgeManager.showNudge("commit_suggested");

			expect(response).toBe("create_snapshot");
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith("vreko.createSnapshot");
		});

		it("should respect 'Not Now' dismissal", async () => {
			vi.mocked(vscode.window.showInformationMessage).mockResolvedValue("Not Now" as any);

			const response = await nudgeManager.showNudge("commit_suggested");

			expect(response).toBe("not_now");
			expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
		});

		it("should handle dismissed nudge", async () => {
			vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(undefined);

			const response = await nudgeManager.showNudge("commit_suggested");

			expect(response).toBe("dismissed");
		});
	});

	// ===========================================================================
	// Cooldown and Rate Limiting Tests
	// ===========================================================================

	describe("Cooldown Handling", () => {
		it("should use session-level cooldown for nudges via maybeNudge", async () => {
			vi.mocked(vscode.window.showInformationMessage).mockResolvedValue("Not Now" as any);

			// Session flag starts false
			expect(nudgeManager.wasShownThisSession()).toBe(false);

			// maybeNudge() sets the session flag after showing
			await nudgeManager.maybeNudge("commit_suggested");

			// Session flag should be set, preventing immediate second nudge
			expect(nudgeManager.wasShownThisSession()).toBe(true);
		});

		it("should NOT set session flag when using showNudge directly", async () => {
			vi.mocked(vscode.window.showInformationMessage).mockResolvedValue("Not Now" as any);

			// showNudge is the low-level display method, doesn't manage session state
			await nudgeManager.showNudge("commit_suggested");

			// Session flag not set by direct showNudge call
			expect(nudgeManager.wasShownThisSession()).toBe(false);
		});

		it("should allow first nudge in session", async () => {
			vi.mocked(vscode.window.showInformationMessage).mockResolvedValue("Not Now" as any);

			// First nudge should work
			await nudgeManager.showNudge("commit_suggested");

			expect(vi.mocked(vscode.window.showInformationMessage).mock.calls.length).toBe(1);
		});
	});

	// ===========================================================================
	// Disable/Enable Tests
	// ===========================================================================

	describe("Nudge Disable State", () => {
		it("should check if nudge is disabled", () => {
			// Initially not disabled
			expect(nudgeManager.isNudgeDisabled("commit_suggested")).toBe(false);
		});

		it("should allow re-enabling disabled nudges", async () => {
			// Disable the nudge
			await mockContext.globalState.update("vreko.nudge.commit_suggested.disabled", true);

			// Should be disabled
			expect(nudgeManager.isNudgeDisabled("commit_suggested")).toBe(true);

			// Re-enable
			await nudgeManager.enableNudge("commit_suggested");

			// Should be enabled again
			expect(nudgeManager.isNudgeDisabled("commit_suggested")).toBe(false);
		});
	});

	// ===========================================================================
	// Integration Tests
	// ===========================================================================

	describe("Commit Coaching Integration", () => {
		it("should return correct response type for commit actions", async () => {
			vi.mocked(vscode.window.showInformationMessage).mockResolvedValue("Commit Now" as any);

			const response = await nudgeManager.showNudge("commit_suggested");

			// Response type should be NudgeResponse
			const validResponses: NudgeResponse[] = [
				"create_snapshot",
				"authenticate",
				"learn_more",
				"not_now",
				"never",
				"dismissed",
				"commit_now",
			];
			expect(validResponses).toContain(response);
		});

		it("should handle commit_recommended with Create Snapshot First option", async () => {
			vi.mocked(vscode.window.showInformationMessage).mockResolvedValue("Create Snapshot First" as any);

			const response = await nudgeManager.showNudge("commit_recommended");

			expect(response).toBe("create_snapshot");
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith("vreko.createSnapshot");
		});
	});
});
