/**
 * @fileoverview Tests for AdaptiveHintManager
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import {
	AdaptiveHintManager,
	type Hint,
} from "@vscode/utils/AdaptiveHintManager";

// Mock VS Code API
vi.mock("vscode", () => ({
	window: {
		showInformationMessage: vi.fn(),
	},
	env: {
		openExternal: vi.fn(),
	},
	commands: {
		executeCommand: vi.fn(),
	},
	Uri: {
		parse: vi
			.fn()
			.mockImplementation((url: string) => ({ toString: () => url })),
	},
	ExtensionContext: vi.fn(),
}));

describe("AdaptiveHintManager", () => {
	let adaptiveHintManager: AdaptiveHintManager;
	let mockContext: any;

	beforeEach(() => {
		// Create a mock context
		mockContext = {};

		adaptiveHintManager = new AdaptiveHintManager(mockContext);

		// Clear mock calls
		vi.clearAllMocks();
	});

	describe("setExperienceTier", () => {
		it("should set experience tier correctly", () => {
			adaptiveHintManager.setExperienceTier("explorer");

			// We can't directly test the private property, but we can test the behavior
			const hints = adaptiveHintManager.getAppropriateHints();

			// Should have explorer hints
			expect(hints.length).toBeGreaterThan(0);
			expect(
				hints.some((hint) => hint.appropriateTiers.includes("explorer")),
			).toBe(true);
		});
	});

	describe("setAIEnabled", () => {
		it("should set AI enabled status correctly", () => {
			adaptiveHintManager.setAIEnabled(true);

			// We can test this by checking if AI hints are included
			adaptiveHintManager.setExperienceTier("explorer");
			const hints = adaptiveHintManager.getAppropriateHints();

			// Should include AI hints when AI is enabled
			expect(hints.some((hint) => hint.isAIHint)).toBe(true);
		});
	});

	describe("getAppropriateHints", () => {
		it("should return empty array for unknown tier", () => {
			adaptiveHintManager.setExperienceTier("unknown");
			const hints = adaptiveHintManager.getAppropriateHints();

			expect(hints).toEqual([]);
		});

		it("should return appropriate hints for explorer tier", () => {
			adaptiveHintManager.setExperienceTier("explorer");
			adaptiveHintManager.setAIEnabled(true);
			const hints = adaptiveHintManager.getAppropriateHints();

			expect(hints.length).toBeGreaterThan(0);
			expect(
				hints.every((hint) => hint.appropriateTiers.includes("explorer")),
			).toBe(true);
		});

		it("should filter out AI hints when AI is disabled", () => {
			adaptiveHintManager.setExperienceTier("explorer");
			adaptiveHintManager.setAIEnabled(false);
			const hints = adaptiveHintManager.getAppropriateHints();

			// Should not include AI hints when AI is disabled
			expect(hints.some((hint) => hint.isAIHint)).toBe(false);
		});

		it("should include AI hints when AI is enabled", () => {
			adaptiveHintManager.setExperienceTier("explorer");
			adaptiveHintManager.setAIEnabled(true);
			const hints = adaptiveHintManager.getAppropriateHints();

			// Should include AI hints when AI is enabled
			expect(hints.some((hint) => hint.isAIHint)).toBe(true);
		});
	});

	describe("getRandomHint", () => {
		it("should return undefined when no hints available", () => {
			adaptiveHintManager.setExperienceTier("unknown");
			const hint = adaptiveHintManager.getRandomHint();

			expect(hint).toBeUndefined();
		});

		it("should return a random hint when hints are available", () => {
			adaptiveHintManager.setExperienceTier("explorer");
			adaptiveHintManager.setAIEnabled(true);
			const hint = adaptiveHintManager.getRandomHint();

			expect(hint).toBeDefined();
			expect(hint?.appropriateTiers.includes("explorer")).toBe(true);
		});

		it("should filter by category when specified", () => {
			adaptiveHintManager.setExperienceTier("explorer");
			adaptiveHintManager.setAIEnabled(true);
			const hint = adaptiveHintManager.getRandomHint("getting-started");

			expect(hint).toBeDefined();
			expect(hint?.category).toBe("getting-started");
		});

		it("should filter by priority when specified", () => {
			adaptiveHintManager.setExperienceTier("explorer");
			adaptiveHintManager.setAIEnabled(true);
			const hint = adaptiveHintManager.getRandomHint(undefined, "high");

			expect(hint).toBeDefined();
			expect(hint?.priority).toBe("high");
		});
	});

	describe("showHint", () => {
		it("should show hint with command button", async () => {
			vi.mocked(vscode.window.showInformationMessage).mockResolvedValueOnce(
				"Show Me" as never,
			);
			vi.mocked(vscode.commands.executeCommand).mockResolvedValue(undefined);

			const hint: Hint = {
				id: "test-hint",
				title: "Test Hint",
				content: "This is a test hint",
				category: "getting-started",
				priority: "medium",
				appropriateTiers: ["explorer"],
				isAIHint: false,
				command: "snapback.testCommand",
			};

			await adaptiveHintManager.showHint(hint);

			expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
				"Test Hint: This is a test hint",
				"Show Me",
				"Got It",
			);

			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"snapback.testCommand",
			);
		});

		it("should show hint with URL button", async () => {
			vi.mocked(vscode.window.showInformationMessage).mockResolvedValueOnce(
				"Learn More" as never,
			);
			vi.mocked(vscode.env.openExternal).mockResolvedValue(true as never);

			const hint: Hint = {
				id: "test-hint",
				title: "Test Hint",
				content: "This is a test hint",
				category: "getting-started",
				priority: "medium",
				appropriateTiers: ["explorer"],
				isAIHint: false,
				url: "https://snapback.example.com/test",
			};

			await adaptiveHintManager.showHint(hint);

			expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
				"Test Hint: This is a test hint",
				"Learn More",
				"Got It",
			);

			expect(vscode.env.openExternal).toHaveBeenCalled();
			// Check that it was called with a URI that has the correct URL
			const call = vi.mocked(vscode.env.openExternal).mock.calls[0];
			expect(call[0].toString()).toBe("https://snapback.example.com/test");
		});

		it("should show hint with both command and URL buttons", async () => {
			vi.mocked(vscode.window.showInformationMessage).mockResolvedValueOnce(
				"Got It" as never,
			);

			const hint: Hint = {
				id: "test-hint",
				title: "Test Hint",
				content: "This is a test hint",
				category: "getting-started",
				priority: "medium",
				appropriateTiers: ["explorer"],
				isAIHint: false,
				command: "snapback.testCommand",
				url: "https://snapback.example.com/test",
			};

			await adaptiveHintManager.showHint(hint);

			expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
				"Test Hint: This is a test hint",
				"Show Me",
				"Learn More",
				"Got It",
			);
		});

		it("should handle 'Got It' selection", async () => {
			vi.mocked(vscode.window.showInformationMessage).mockResolvedValueOnce(
				"Got It" as never,
			);

			const hint: Hint = {
				id: "test-hint",
				title: "Test Hint",
				content: "This is a test hint",
				category: "getting-started",
				priority: "medium",
				appropriateTiers: ["explorer"],
				isAIHint: false,
			};

			await adaptiveHintManager.showHint(hint);

			expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
				"Test Hint: This is a test hint",
				"Got It",
			);
		});
	});

	describe("getHintStatistics", () => {
		it("should return correct hint statistics", () => {
			adaptiveHintManager.setExperienceTier("explorer");
			adaptiveHintManager.setAIEnabled(true);
			const stats = adaptiveHintManager.getHintStatistics();

			expect(stats.totalHints).toBeGreaterThan(0);
			expect(stats.appropriateHints).toBeGreaterThan(0);
			expect(stats.shownHints).toBe(0); // No hints shown yet
			expect(stats.aiHintsAvailable).toBeGreaterThan(0); // AI is enabled
		});
	});

	describe("resetHintData", () => {
		it("should reset hint tracking data", () => {
			// This method doesn't have observable side effects we can test directly
			// but we can ensure it doesn't throw
			expect(() => {
				adaptiveHintManager.resetHintData();
			}).not.toThrow();
		});
	});
});
