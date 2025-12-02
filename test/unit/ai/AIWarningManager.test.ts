import { describe, it, expect, vi, beforeEach } from "vitest";
import * as vscode from "vscode";
import { AIWarningManager, type AIDetection } from "../../../src/ai/AIWarningManager.js";
import { logger } from "@snapback/infrastructure";
import { isOk } from "../../../src/types/result.js";

// Mock logger
vi.mock("@snapback/infrastructure", () => ({
	logger: {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	},
}));

describe("AIWarningManager", () => {
	let warningManager: AIWarningManager;

	beforeEach(() => {
		warningManager = new AIWarningManager();
		vi.clearAllMocks();
	});

	describe("showWarning", () => {
		it("should show warning dialog with correct options", async () => {
			const mockShowWarningMessage = vi.fn().mockResolvedValueOnce("Accept & Save");
			(vscode.window.showWarningMessage as any) = mockShowWarningMessage;

			const detection: AIDetection = {
				tool: "GITHUB_COPILOT",
				confidence: 0.85,
				pattern: "burst",
			};

			const result = await warningManager.showWarning(detection);

			expect(mockShowWarningMessage).toHaveBeenCalledOnce();
			expect(isOk(result)).toBe(true);
			const call = mockShowWarningMessage.mock.calls[0];
			expect(call[0]).toContain("AI-assisted edit detected");
			expect(call.slice(2)).toEqual(["Review Changes", "Accept & Save", "Restore Previous"]);
		});

		it("should return 'accept' choice when user selects 'Accept & Save'", async () => {
			const mockShowWarningMessage = vi.fn().mockResolvedValueOnce("Accept & Save");
			(vscode.window.showWarningMessage as any) = mockShowWarningMessage;

			const detection: AIDetection = {
				tool: "CLAUDE",
				confidence: 0.9,
				pattern: "extension-presence",
			};

			const result = await warningManager.showWarning(detection);

			expect(isOk(result)).toBe(true);
			if (isOk(result)) {
				expect(result.value.choice).toBe("accept");
				expect(result.value.timestamp).toBeGreaterThan(0);
				expect(result.value.responseTime).toBeGreaterThanOrEqual(0);
			}
		});

		it("should return 'review' choice when user selects 'Review Changes'", async () => {
			const mockShowWarningMessage = vi.fn().mockResolvedValueOnce("Review Changes");
			(vscode.window.showWarningMessage as any) = mockShowWarningMessage;

			const detection: AIDetection = {
				tool: "CURSOR",
				confidence: 0.75,
				pattern: "burst",
			};

			const result = await warningManager.showWarning(detection);

			expect(isOk(result)).toBe(true);
			if (isOk(result)) {
				expect(result.value.choice).toBe("review");
			}
		});

		it("should return 'restore' choice when user selects 'Restore Previous'", async () => {
			const mockShowWarningMessage = vi.fn().mockResolvedValueOnce("Restore Previous");
			(vscode.window.showWarningMessage as any) = mockShowWarningMessage;

			const detection: AIDetection = {
				tool: "GITHUB_COPILOT",
				confidence: 0.95,
				pattern: "burst",
			};

			const result = await warningManager.showWarning(detection);

			expect(isOk(result)).toBe(true);
			if (isOk(result)) {
				expect(result.value.choice).toBe("restore");
			}
		});

		it("should return 'dismissed' choice when user closes dialog", async () => {
			const mockShowWarningMessage = vi.fn().mockResolvedValueOnce(undefined);
			(vscode.window.showWarningMessage as any) = mockShowWarningMessage;

			const detection: AIDetection = {
				tool: "CLAUDE",
				confidence: 0.8,
				pattern: "extension-presence",
			};

			const result = await warningManager.showWarning(detection);

			expect(isOk(result)).toBe(true);
			if (isOk(result)) {
				expect(result.value.choice).toBe("dismissed");
			}
		});

		it("should include confidence percentage in message", async () => {
			const mockShowWarningMessage = vi.fn().mockResolvedValueOnce("Accept & Save");
			(vscode.window.showWarningMessage as any) = mockShowWarningMessage;

			const detection: AIDetection = {
				tool: "GITHUB_COPILOT",
				confidence: 0.92,
				pattern: "burst",
			};

			await warningManager.showWarning(detection);

			const messageArg = mockShowWarningMessage.mock.calls[0][0];
			expect(messageArg).toContain("92%");
		});

		it("should include tool name in message", async () => {
			const mockShowWarningMessage = vi.fn().mockResolvedValueOnce("Accept & Save");
			(vscode.window.showWarningMessage as any) = mockShowWarningMessage;

			const detection: AIDetection = {
				tool: "CURSOR",
				confidence: 0.85,
				pattern: "burst",
			};

			await warningManager.showWarning(detection);

			const messageArg = mockShowWarningMessage.mock.calls[0][0];
			expect(messageArg).toContain("Cursor");
		});

		it("should include burst details when burst detection provided", async () => {
			const mockShowWarningMessage = vi.fn().mockResolvedValueOnce("Accept & Save");
			(vscode.window.showWarningMessage as any) = mockShowWarningMessage;

			const detection: AIDetection = {
				tool: "GITHUB_COPILOT",
				confidence: 0.85,
				pattern: "burst",
				burst: {
					isBurst: true,
					confidence: 0.85,
					details: {
						totalInserted: 500,
						totalDeleted: 100,
						ratio: 5.0,
						changeCount: 3,
						duration: 5000,
					},
				},
			};

			await warningManager.showWarning(detection);

			const messageArg = mockShowWarningMessage.mock.calls[0][0];
			expect(messageArg).toContain("500");
			expect(messageArg).toContain("Rapid insertion");
		});

		it("should log warning event with structured data", async () => {
			const mockShowWarningMessage = vi.fn().mockResolvedValueOnce("Accept & Save");
			(vscode.window.showWarningMessage as any) = mockShowWarningMessage;

			const detection: AIDetection = {
				tool: "CLAUDE",
				confidence: 0.88,
				pattern: "burst",
			};

			const result = await warningManager.showWarning(detection);

			expect(isOk(result)).toBe(true);
			expect(logger.info).toHaveBeenCalledWith(
				"AI warning shown",
				expect.objectContaining({
					tool: "CLAUDE",
					confidence: 0.88,
					pattern: "burst",
					choice: "accept",
				})
			);
		});

		it("should measure response time", async () => {
			const mockShowWarningMessage = vi.fn().mockResolvedValueOnce("Accept & Save");
			(vscode.window.showWarningMessage as any) = mockShowWarningMessage;

			const detection: AIDetection = {
				tool: "GITHUB_COPILOT",
				confidence: 0.85,
				pattern: "burst",
			};

			const result = await warningManager.showWarning(detection);

			expect(isOk(result)).toBe(true);
			if (isOk(result)) {
				expect(result.value.responseTime).toBeGreaterThanOrEqual(0);
				expect(result.value.responseTime).toBeLessThan(10000);
			}
		});
	});

	describe("getConfidenceLabel", () => {
		it("should return 'Very High' for confidence >= 0.9", () => {
			expect(AIWarningManager.getConfidenceLabel(0.9)).toBe("Very High");
			expect(AIWarningManager.getConfidenceLabel(0.99)).toBe("Very High");
			expect(AIWarningManager.getConfidenceLabel(1.0)).toBe("Very High");
		});

		it("should return 'High' for confidence 0.7-0.9", () => {
			expect(AIWarningManager.getConfidenceLabel(0.7)).toBe("High");
			expect(AIWarningManager.getConfidenceLabel(0.85)).toBe("High");
			expect(AIWarningManager.getConfidenceLabel(0.89)).toBe("High");
		});

		it("should return 'Medium' for confidence 0.5-0.7", () => {
			expect(AIWarningManager.getConfidenceLabel(0.5)).toBe("Medium");
			expect(AIWarningManager.getConfidenceLabel(0.65)).toBe("Medium");
			expect(AIWarningManager.getConfidenceLabel(0.69)).toBe("Medium");
		});

		it("should return 'Low' for confidence < 0.5", () => {
			expect(AIWarningManager.getConfidenceLabel(0.0)).toBe("Low");
			expect(AIWarningManager.getConfidenceLabel(0.25)).toBe("Low");
			expect(AIWarningManager.getConfidenceLabel(0.49)).toBe("Low");
		});
	});

	describe("shouldWarn", () => {
		it("should return true when confidence >= threshold", () => {
			expect(AIWarningManager.shouldWarn(0.6)).toBe(true);
			expect(AIWarningManager.shouldWarn(0.8)).toBe(true);
			expect(AIWarningManager.shouldWarn(1.0)).toBe(true);
		});

		it("should return false when confidence < threshold", () => {
			expect(AIWarningManager.shouldWarn(0.5)).toBe(false);
			expect(AIWarningManager.shouldWarn(0.3)).toBe(false);
			expect(AIWarningManager.shouldWarn(0.0)).toBe(false);
		});

		it("should respect custom threshold", () => {
			expect(AIWarningManager.shouldWarn(0.75, 0.8)).toBe(false);
			expect(AIWarningManager.shouldWarn(0.85, 0.8)).toBe(true);
			expect(AIWarningManager.shouldWarn(0.8, 0.8)).toBe(true);
		});

		it("should use default threshold of 0.6 when not specified", () => {
			expect(AIWarningManager.shouldWarn(0.59)).toBe(false);
			expect(AIWarningManager.shouldWarn(0.6)).toBe(true);
		});
	});

	describe("edge cases and error handling", () => {
		it("should handle detection with missing optional burst property", async () => {
			const mockShowWarningMessage = vi.fn().mockResolvedValueOnce("Accept & Save");
			(vscode.window.showWarningMessage as any) = mockShowWarningMessage;

			const detection: AIDetection = {
				tool: "UNKNOWN_TOOL",
				confidence: 0.75,
				pattern: "unknown_pattern",
			};

			const result = await warningManager.showWarning(detection);

			expect(isOk(result)).toBe(true);
			if (isOk(result)) {
				expect(result.value.choice).toBe("accept");
			}
			expect(logger.info).toHaveBeenCalled();
		});

		it("should handle unknown tool name gracefully", async () => {
			const mockShowWarningMessage = vi.fn().mockResolvedValueOnce("Accept & Save");
			(vscode.window.showWarningMessage as any) = mockShowWarningMessage;

			const detection: AIDetection = {
				tool: "FUTURE_AI_TOOL_V999",
				confidence: 0.8,
				pattern: "burst",
			};

			await warningManager.showWarning(detection);

			const messageArg = mockShowWarningMessage.mock.calls[0][0];
			// Should include the tool name as fallback (underscores replaced with spaces)
			expect(messageArg).toContain("FUTURE AI TOOL V999");
		});

		it("should handle very high confidence (1.0)", async () => {
			const mockShowWarningMessage = vi.fn().mockResolvedValueOnce("Accept & Save");
			(vscode.window.showWarningMessage as any) = mockShowWarningMessage;

			const detection: AIDetection = {
				tool: "GITHUB_COPILOT",
				confidence: 1.0,
				pattern: "burst",
			};

			const result = await warningManager.showWarning(detection);

			expect(isOk(result)).toBe(true);
			if (isOk(result)) {
				expect(result.value.choice).toBe("accept");
			}
			const logCall = (logger.info as any).mock.calls.find(
				(call: any) => call[0] === "AI warning shown"
			);
			expect(logCall[1].confidence).toBe(1.0);
		});

		it("should handle multiple consecutive calls without interference", async () => {
			const mockShowWarningMessage = vi.fn();
			mockShowWarningMessage.mockResolvedValueOnce("Accept & Save");
			mockShowWarningMessage.mockResolvedValueOnce("Review Changes");
			(vscode.window.showWarningMessage as any) = mockShowWarningMessage;

			const detection: AIDetection = {
				tool: "CLAUDE",
				confidence: 0.75,
				pattern: "burst",
			};

			const result1 = await warningManager.showWarning(detection);
			const result2 = await warningManager.showWarning(detection);

			expect(isOk(result1)).toBe(true);
			expect(isOk(result2)).toBe(true);
			if (isOk(result1) && isOk(result2)) {
				expect(result1.value.choice).toBe("accept");
				expect(result2.value.choice).toBe("review");
			}
		});

		it("should record correct timestamp", async () => {
			const mockShowWarningMessage = vi.fn().mockResolvedValueOnce("Accept & Save");
			(vscode.window.showWarningMessage as any) = mockShowWarningMessage;

			const detection: AIDetection = {
				tool: "GITHUB_COPILOT",
				confidence: 0.85,
				pattern: "burst",
			};

			const before = Date.now();
			const result = await warningManager.showWarning(detection);
			const after = Date.now();

			expect(isOk(result)).toBe(true);
			if (isOk(result)) {
				expect(result.value.timestamp).toBeGreaterThanOrEqual(before);
				expect(result.value.timestamp).toBeLessThanOrEqual(after);
			}
		});

		it("should record response time within reasonable bounds", async () => {
			const mockShowWarningMessage = vi.fn().mockResolvedValueOnce("Accept & Save");
			(vscode.window.showWarningMessage as any) = mockShowWarningMessage;

			const detection: AIDetection = {
				tool: "GITHUB_COPILOT",
				confidence: 0.85,
				pattern: "burst",
			};

			const result = await warningManager.showWarning(detection);

			expect(isOk(result)).toBe(true);
			if (isOk(result)) {
				expect(result.value.responseTime).toBeGreaterThanOrEqual(0);
			}
		});
	});

	describe("logging integration", () => {
		it("should log all choice types correctly", async () => {
			const choices = ["Review Changes", "Accept & Save", "Restore Previous", undefined];
			const expectedChoices = ["review", "accept", "restore", "dismissed"];

			for (let i = 0; i < choices.length; i++) {
				vi.clearAllMocks();
				const mockShowWarningMessage = vi.fn().mockResolvedValueOnce(choices[i]);
				(vscode.window.showWarningMessage as any) = mockShowWarningMessage;

				const detection: AIDetection = {
					tool: "GITHUB_COPILOT",
					confidence: 0.85,
					pattern: "burst",
				};

				const result = await warningManager.showWarning(detection);

				expect(isOk(result)).toBe(true);
				if (isOk(result)) {
					expect(result.value.choice).toBe(expectedChoices[i]);
				}
				expect(logger.info).toHaveBeenCalledWith(
					"AI warning shown",
					expect.objectContaining({
						choice: expectedChoices[i],
					})
				);
			}
		});
	});
});

