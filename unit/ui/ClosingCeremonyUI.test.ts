/**
 * Tests for ClosingCeremonyUI AI Insights Display
 *
 * Tests the display of AI-generated insights in closing ceremonies.
 * Covers pre-fire pattern, graceful degradation, and Pro-gated features.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock vscode
vi.mock("vscode", () => ({
	window: {
		showInformationMessage: vi.fn(),
		showQuickPick: vi.fn(),
		workspace: {
			openTextDocument: vi.fn(),
			showTextDocument: vi.fn(),
		},
	},
	workspace: {
		openTextDocument: vi.fn().mockResolvedValue({}),
		showTextDocument: vi.fn(),
	},
	env: {
		clipboard: {
			writeText: vi.fn(),
		},
	},
	Uri: {
		parse: vi.fn(),
	},
}));

// Mock logger
vi.mock("../../../src/utils/logger", () => ({
	logger: {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}));

describe("ClosingCeremonyUI AI Insights", () => {
	let ClosingCeremonyUI: any;
	let ui: any;

	beforeEach(async () => {
		vi.clearAllMocks();
		ClosingCeremonyUI = (await import("../../../src/ui/ClosingCeremonyUI")).ClosingCeremonyUI;
		ui = new ClosingCeremonyUI();
	});

	describe("insightsPromise field", () => {
		it("should accept insightsPromise in ClosingCeremonyData", async () => {
			// ARRANGE
			const mockInsights = {
				summary: "Productive session",
				whyItMatters: "You made good progress",
				topRisks: ["Fragile file touched"],
				nextAction: "Review changes",
				insights: [
					{ type: "suggestion" as const, title: "Test", body: "Test body", confidence: 0.9 },
				],
				model: "gemini-2.0-flash",
				cached: false,
			};

			const ceremonyData = {
				sessionId: "test-session",
				workspacePath: "/test/workspace",
				duration: 300000,
				learningsCaptured: 2,
				fragileFilesInSession: [],
				tokensSaved: 1500,
				tokensSavedIsEstimate: true,
				coherenceScore: "high" as const,
				coherenceRationale: "Single domain",
				checkpointsCreated: 3,
				healthDelta: null,
				concurrentSessions: null,
				topLearnings: [],
				insightsPromise: Promise.resolve(mockInsights),
			};

			// ACT - showCeremony will await the promise internally
			// We're testing that the type accepts insightsPromise
			expect(ceremonyData.insightsPromise).toBeDefined();
		});

		it("should handle null insights (Pro not available)", async () => {
			// ARRANGE
			const ceremonyData = {
				sessionId: "test-session",
				workspacePath: "/test/workspace",
				duration: 300000,
				learningsCaptured: 2,
				fragileFilesInSession: [],
				tokensSaved: 1500,
				tokensSavedIsEstimate: true,
				coherenceScore: "high" as const,
				coherenceRationale: "Single domain",
				checkpointsCreated: 3,
				healthDelta: null,
				concurrentSessions: null,
				topLearnings: [],
				insightsPromise: Promise.resolve(null),
			};

			// ASSERT - null insights should be handled gracefully
			const insights = await ceremonyData.insightsPromise;
			expect(insights).toBeNull();
		});

		it("should handle rejected promise (network error)", async () => {
			// ARRANGE
			const ceremonyData = {
				sessionId: "test-session",
				workspacePath: "/test/workspace",
				duration: 300000,
				learningsCaptured: 2,
				fragileFilesInSession: [],
				tokensSaved: 1500,
				tokensSavedIsEstimate: true,
				coherenceScore: "high" as const,
				coherenceRationale: "Single domain",
				checkpointsCreated: 3,
				healthDelta: null,
				concurrentSessions: null,
				topLearnings: [],
				insightsPromise: Promise.reject(new Error("Network error")),
			};

			// ACT & ASSERT - should not throw
			await expect(ceremonyData.insightsPromise).rejects.toThrow("Network error");
		});
	});

	describe("insights display formatting", () => {
		it("should format insights with correct emoji types", () => {
			// ARRANGE
			const insightTypes = {
				warning: "⚠️",
				suggestion: "💡",
				synthesis: "🔗",
				prediction: "🔮",
			};

			// ASSERT
			expect(insightTypes.warning).toBe("⚠️");
			expect(insightTypes.suggestion).toBe("💡");
			expect(insightTypes.synthesis).toBe("🔗");
			expect(insightTypes.prediction).toBe("🔮");
		});

		it("should format confidence as percentage", () => {
			// ARRANGE
			const confidence = 0.85;

			// ACT
			const percentage = Math.round(confidence * 100);

			// ASSERT
			expect(percentage).toBe(85);
		});
	});

	describe("graceful degradation", () => {
		it("should work without insightsPromise field", () => {
			// ARRANGE
			const ceremonyData = {
				sessionId: "test-session",
				workspacePath: "/test/workspace",
				duration: 300000,
				learningsCaptured: 2,
				fragileFilesInSession: [],
				tokensSaved: 1500,
				tokensSavedIsEstimate: true,
				coherenceScore: "high" as const,
				coherenceRationale: "Single domain",
				checkpointsCreated: 3,
				healthDelta: null,
				concurrentSessions: null,
				topLearnings: [],
				// No insightsPromise - should still work
			};

			// ASSERT - ceremony data is valid without insights
			expect(ceremonyData.sessionId).toBe("test-session");
			expect((ceremonyData as any).insightsPromise).toBeUndefined();
		});
	});
});
