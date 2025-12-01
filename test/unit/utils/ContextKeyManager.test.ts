/**
 * @fileoverview Tests for ContextKeyManager
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import {
	CONTEXT_KEYS,
	ContextKeyManager,
} from "../../../src/utils/ContextKeyManager.js";

// Mock VS Code commands
vi.mock("vscode", () => ({
	commands: {
		executeCommand: vi.fn(),
	},
	ExtensionContext: vi.fn(),
}));

describe("ContextKeyManager", () => {
	let contextKeyManager: ContextKeyManager;
	let mockContext: any;

	beforeEach(() => {
		// Create a mock context
		mockContext = {};

		contextKeyManager = new ContextKeyManager(mockContext);

		// Clear mock calls
		vi.clearAllMocks();
	});

	describe("setContextKey", () => {
		it("should set context key correctly", async () => {
			vi.mocked(vscode.commands.executeCommand).mockResolvedValue(undefined);

			contextKeyManager.setContextKey("test.key", "testValue");

			// Wait for the async operation
			await new Promise((resolve) => setTimeout(resolve, 0));

			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"setContext",
				"test.key",
				"testValue",
			);
		});

		it("should handle errors when setting context key", async () => {
			vi.mocked(vscode.commands.executeCommand).mockRejectedValue(
				new Error("Test error"),
			);

			contextKeyManager.setContextKey("test.key", "testValue");

			// Wait for the async operation
			await new Promise((resolve) => setTimeout(resolve, 0));

			// Should not throw, just log the error
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"setContext",
				"test.key",
				"testValue",
			);
		});
	});

	describe("setExperienceTier", () => {
		it("should set experience tier context keys correctly for explorer", async () => {
			vi.mocked(vscode.commands.executeCommand).mockResolvedValue(undefined);

			contextKeyManager.setExperienceTier("explorer");

			// Wait for the async operations
			await new Promise((resolve) => setTimeout(resolve, 0));

			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"setContext",
				CONTEXT_KEYS.EXPERIENCE_TIER,
				"explorer",
			);
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"setContext",
				CONTEXT_KEYS.IS_EXPLORER,
				true,
			);
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"setContext",
				CONTEXT_KEYS.IS_INTERMEDIATE,
				false,
			);
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"setContext",
				CONTEXT_KEYS.IS_POWER,
				false,
			);
		});

		it("should set experience tier context keys correctly for intermediate", async () => {
			vi.mocked(vscode.commands.executeCommand).mockResolvedValue(undefined);

			contextKeyManager.setExperienceTier("intermediate");

			// Wait for the async operations
			await new Promise((resolve) => setTimeout(resolve, 0));

			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"setContext",
				CONTEXT_KEYS.EXPERIENCE_TIER,
				"intermediate",
			);
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"setContext",
				CONTEXT_KEYS.IS_EXPLORER,
				false,
			);
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"setContext",
				CONTEXT_KEYS.IS_INTERMEDIATE,
				true,
			);
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"setContext",
				CONTEXT_KEYS.IS_POWER,
				false,
			);
		});

		it("should set experience tier context keys correctly for power", async () => {
			vi.mocked(vscode.commands.executeCommand).mockResolvedValue(undefined);

			contextKeyManager.setExperienceTier("power");

			// Wait for the async operations
			await new Promise((resolve) => setTimeout(resolve, 0));

			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"setContext",
				CONTEXT_KEYS.EXPERIENCE_TIER,
				"power",
			);
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"setContext",
				CONTEXT_KEYS.IS_EXPLORER,
				false,
			);
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"setContext",
				CONTEXT_KEYS.IS_INTERMEDIATE,
				false,
			);
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"setContext",
				CONTEXT_KEYS.IS_POWER,
				true,
			);
		});
	});

	describe("setAIPresence", () => {
		it("should set AI presence context keys correctly when AI is detected", async () => {
			vi.mocked(vscode.commands.executeCommand).mockResolvedValue(undefined);

			contextKeyManager.setAIPresence({
				hasAI: true,
				detectedAssistants: ["GITHUB_COPILOT", "CLAUDE"],
				assistantDetails: {
					GITHUB_COPILOT: "GitHub Copilot",
					CLAUDE: "Claude",
				},
			});

			// Wait for the async operations
			await new Promise((resolve) => setTimeout(resolve, 0));

			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"setContext",
				CONTEXT_KEYS.AI_DETECTED,
				true,
			);
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"setContext",
				CONTEXT_KEYS.GITHUB_COPILOT_DETECTED,
				true,
			);
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"setContext",
				CONTEXT_KEYS.CLAUDE_DETECTED,
				true,
			);
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"setContext",
				CONTEXT_KEYS.TABNINE_DETECTED,
				false,
			);
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"setContext",
				CONTEXT_KEYS.CODEIUM_DETECTED,
				false,
			);
		});

		it("should set AI presence context keys correctly when no AI is detected", async () => {
			vi.mocked(vscode.commands.executeCommand).mockResolvedValue(undefined);

			contextKeyManager.setAIPresence({
				hasAI: false,
				detectedAssistants: [],
				assistantDetails: {},
			});

			// Wait for the async operations
			await new Promise((resolve) => setTimeout(resolve, 0));

			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"setContext",
				CONTEXT_KEYS.AI_DETECTED,
				false,
			);
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"setContext",
				CONTEXT_KEYS.GITHUB_COPILOT_DETECTED,
				false,
			);
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"setContext",
				CONTEXT_KEYS.CLAUDE_DETECTED,
				false,
			);
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"setContext",
				CONTEXT_KEYS.TABNINE_DETECTED,
				false,
			);
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"setContext",
				CONTEXT_KEYS.CODEIUM_DETECTED,
				false,
			);
		});
	});

	describe("setAICheckpointingEnabled", () => {
		it("should set AI checkpointing enabled context key correctly", async () => {
			vi.mocked(vscode.commands.executeCommand).mockResolvedValue(undefined);

			contextKeyManager.setAICheckpointingEnabled(true);

			// Wait for the async operation
			await new Promise((resolve) => setTimeout(resolve, 0));

			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"setContext",
				CONTEXT_KEYS.AI_CHECKPOINTING_ENABLED,
				true,
			);
		});
	});

	describe("setExtensionActive", () => {
		it("should set extension active context key correctly", async () => {
			vi.mocked(vscode.commands.executeCommand).mockResolvedValue(undefined);

			contextKeyManager.setExtensionActive(true);

			// Wait for the async operation
			await new Promise((resolve) => setTimeout(resolve, 0));

			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"setContext",
				CONTEXT_KEYS.IS_ACTIVE,
				true,
			);
		});
	});

	describe("setHasProtectedFiles", () => {
		it("should set protected files context key correctly", async () => {
			vi.mocked(vscode.commands.executeCommand).mockResolvedValue(undefined);

			contextKeyManager.setHasProtectedFiles(true);

			// Wait for the async operation
			await new Promise((resolve) => setTimeout(resolve, 0));

			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"setContext",
				CONTEXT_KEYS.HAS_PROTECTED_FILES,
				true,
			);
		});
	});

	describe("setHasSnapshots", () => {
		it("should set snapshots context key correctly", async () => {
			vi.mocked(vscode.commands.executeCommand).mockResolvedValue(undefined);

			contextKeyManager.setHasSnapshots(true);

			// Wait for the async operation
			await new Promise((resolve) => setTimeout(resolve, 0));

			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"setContext",
				CONTEXT_KEYS.HAS_SNAPSHOTS,
				true,
			);
		});
	});

	describe("setHasSessions", () => {
		it("should set sessions context key correctly", async () => {
			vi.mocked(vscode.commands.executeCommand).mockResolvedValue(undefined);

			contextKeyManager.setHasSessions(true);

			// Wait for the async operation
			await new Promise((resolve) => setTimeout(resolve, 0));

			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"setContext",
				CONTEXT_KEYS.HAS_SESSIONS,
				true,
			);
		});
	});

	describe("setHasPolicyOverrides", () => {
		it("should set policy overrides context key correctly", async () => {
			vi.mocked(vscode.commands.executeCommand).mockResolvedValue(undefined);

			contextKeyManager.setHasPolicyOverrides(true);

			// Wait for the async operation
			await new Promise((resolve) => setTimeout(resolve, 0));

			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"setContext",
				CONTEXT_KEYS.HAS_POLICY_OVERRIDES,
				true,
			);
		});
	});

	describe("setOfflineMode", () => {
		it("should set offline mode context key correctly", async () => {
			vi.mocked(vscode.commands.executeCommand).mockResolvedValue(undefined);

			contextKeyManager.setOfflineMode(true);

			// Wait for the async operation
			await new Promise((resolve) => setTimeout(resolve, 0));

			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"setContext",
				CONTEXT_KEYS.OFFLINE_MODE,
				true,
			);
		});
	});

	describe("setTelemetryEnabled", () => {
		it("should set telemetry enabled context key correctly", async () => {
			vi.mocked(vscode.commands.executeCommand).mockResolvedValue(undefined);

			contextKeyManager.setTelemetryEnabled(false);

			// Wait for the async operation
			await new Promise((resolve) => setTimeout(resolve, 0));

			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"setContext",
				CONTEXT_KEYS.TELEMETRY_ENABLED,
				false,
			);
		});
	});

	describe("resetAllContextKeys", () => {
		it("should reset all context keys", async () => {
			vi.mocked(vscode.commands.executeCommand).mockResolvedValue(undefined);

			contextKeyManager.resetAllContextKeys();

			// Wait for the async operations
			await new Promise((resolve) => setTimeout(resolve, 0));

			// Should reset all context keys
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"setContext",
				CONTEXT_KEYS.EXPERIENCE_TIER,
				undefined,
			);
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"setContext",
				CONTEXT_KEYS.IS_EXPLORER,
				undefined,
			);
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"setContext",
				CONTEXT_KEYS.IS_INTERMEDIATE,
				undefined,
			);
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"setContext",
				CONTEXT_KEYS.IS_POWER,
				undefined,
			);
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"setContext",
				CONTEXT_KEYS.AI_CHECKPOINTING_ENABLED,
				undefined,
			);
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"setContext",
				CONTEXT_KEYS.AI_DETECTED,
				undefined,
			);
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"setContext",
				CONTEXT_KEYS.GITHUB_COPILOT_DETECTED,
				undefined,
			);
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"setContext",
				CONTEXT_KEYS.CLAUDE_DETECTED,
				undefined,
			);
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"setContext",
				CONTEXT_KEYS.TABNINE_DETECTED,
				undefined,
			);
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"setContext",
				CONTEXT_KEYS.CODEIUM_DETECTED,
				undefined,
			);
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"setContext",
				CONTEXT_KEYS.IS_ACTIVE,
				undefined,
			);
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"setContext",
				CONTEXT_KEYS.HAS_PROTECTED_FILES,
				undefined,
			);
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"setContext",
				CONTEXT_KEYS.HAS_SNAPSHOTS,
				undefined,
			);
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"setContext",
				CONTEXT_KEYS.HAS_SESSIONS,
				undefined,
			);
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"setContext",
				CONTEXT_KEYS.HAS_POLICY_OVERRIDES,
				undefined,
			);
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"setContext",
				CONTEXT_KEYS.OFFLINE_MODE,
				undefined,
			);
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"setContext",
				CONTEXT_KEYS.TELEMETRY_ENABLED,
				undefined,
			);
		});
	});

	describe("initializeContextKeys", () => {
		it("should initialize context keys with default values", async () => {
			vi.mocked(vscode.commands.executeCommand).mockResolvedValue(undefined);

			contextKeyManager.initializeContextKeys();

			// Wait for the async operations
			await new Promise((resolve) => setTimeout(resolve, 0));

			// Should initialize all context keys with default values
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"setContext",
				CONTEXT_KEYS.EXPERIENCE_TIER,
				"unknown",
			);
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"setContext",
				CONTEXT_KEYS.IS_EXPLORER,
				false,
			);
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"setContext",
				CONTEXT_KEYS.IS_INTERMEDIATE,
				false,
			);
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"setContext",
				CONTEXT_KEYS.IS_POWER,
				false,
			);
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"setContext",
				CONTEXT_KEYS.AI_CHECKPOINTING_ENABLED,
				false,
			);
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"setContext",
				CONTEXT_KEYS.AI_DETECTED,
				false,
			);
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"setContext",
				CONTEXT_KEYS.GITHUB_COPILOT_DETECTED,
				false,
			);
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"setContext",
				CONTEXT_KEYS.CLAUDE_DETECTED,
				false,
			);
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"setContext",
				CONTEXT_KEYS.TABNINE_DETECTED,
				false,
			);
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"setContext",
				CONTEXT_KEYS.CODEIUM_DETECTED,
				false,
			);
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"setContext",
				CONTEXT_KEYS.IS_ACTIVE,
				false,
			);
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"setContext",
				CONTEXT_KEYS.HAS_PROTECTED_FILES,
				false,
			);
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"setContext",
				CONTEXT_KEYS.HAS_SNAPSHOTS,
				false,
			);
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"setContext",
				CONTEXT_KEYS.HAS_SESSIONS,
				false,
			);
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"setContext",
				CONTEXT_KEYS.HAS_POLICY_OVERRIDES,
				false,
			);
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"setContext",
				CONTEXT_KEYS.OFFLINE_MODE,
				false,
			);
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"setContext",
				CONTEXT_KEYS.TELEMETRY_ENABLED,
				true,
			);
		});
	});
});
