import { beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { isOk } from "../types/result.js";
import { logger } from "../utils/logger.js";
import { type AIDetection, AIWarningManager } from "./AIWarningManager.js";

// Mock vscode module
vi.mock("vscode");

// Mock logger
vi.mock("../utils/logger.js", () => ({
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
		it("should show warning dialog with correct title and message", async () => {
			const mockShowInformationMessage = vi
				.fn()
				.mockResolvedValueOnce("Accept & Save");
			(vscode.window.showInformationMessage as any) =
				mockShowInformationMessage;

			const detection: AIDetection = {
				tool: "GITHUB_COPILOT",
				confidence: 0.85,
				pattern: "burst",
			};

			await warningManager.showWarning(detection);

			expect(mockShowInformationMessage).toHaveBeenCalledOnce();
			const call = mockShowInformationMessage.mock.calls[0];
			expect(call[0]).toContain("AI-Assisted Code Detected");
			expect(call[1]).toEqual([
				"Review Changes",
				"Accept & Save",
				"Restore Previous",
			]);
		});

		it("should return 'accept' choice when user selects 'Accept & Save'", async () => {
			const mockShowInformationMessage = vi
				.fn()
				.mockResolvedValueOnce("Accept & Save");
			(vscode.window.showInformationMessage as any) =
				mockShowInformationMessage;

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
				expect(result.value.responseTime).toBeGreaterThan(0);
			}
		});

		it("should return 'review' choice when user selects 'Review Changes'", async () => {
			const mockShowInformationMessage = vi
				.fn()
				.mockResolvedValueOnce("Review Changes");
			(vscode.window.showInformationMessage as any) =
				mockShowInformationMessage;

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
			const mockShowInformationMessage = vi
				.fn()
				.mockResolvedValueOnce("Restore Previous");
			(vscode.window.showInformationMessage as any) =
				mockShowInformationMessage;

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
			const mockShowInformationMessage = vi
				.fn()
				.mockResolvedValueOnce(undefined);
			(vscode.window.showInformationMessage as any) =
				mockShowInformationMessage;

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

		it("should include confidence level in message", async () => {
			const mockShowInformationMessage = vi
				.fn()
				.mockResolvedValueOnce("Accept & Save");
			(vscode.window.showInformationMessage as any) =
				mockShowInformationMessage;

			const detection: AIDetection = {
				tool: "GITHUB_COPILOT",
				confidence: 0.92,
				pattern: "burst",
			};

			await warningManager.showWarning(detection);

			const messageArg = mockShowInformationMessage.mock.calls[0][0];
			expect(messageArg).toContain("High");
		});

		it("should include tool name in message", async () => {
			const mockShowInformationMessage = vi
				.fn()
				.mockResolvedValueOnce("Accept & Save");
			(vscode.window.showInformationMessage as any) =
				mockShowInformationMessage;

			const detection: AIDetection = {
				tool: "CURSOR",
				confidence: 0.85,
				pattern: "burst",
			};

			await warningManager.showWarning(detection);

			const messageArg = mockShowInformationMessage.mock.calls[0][0];
			expect(messageArg).toContain("Cursor");
		});

		it("should include burst details when burst detection provided", async () => {
			const mockShowInformationMessage = vi
				.fn()
				.mockResolvedValueOnce("Accept & Save");
			(vscode.window.showInformationMessage as any) =
				mockShowInformationMessage;

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

			const messageArg = mockShowInformationMessage.mock.calls[0][0];
			expect(messageArg).toContain("500");
		});

		it("should log warning event with structured data", async () => {
			const mockShowInformationMessage = vi
				.fn()
				.mockResolvedValueOnce("Accept & Save");
			(vscode.window.showInformationMessage as any) =
				mockShowInformationMessage;

			const detection: AIDetection = {
				tool: "CLAUDE",
				confidence: 0.88,
				pattern: "burst",
			};

			await warningManager.showWarning(detection);

			expect(logger.info).toHaveBeenCalledWith(
				"AI warning shown",
				expect.objectContaining({
					tool: "CLAUDE",
					confidence: 0.88,
					pattern: "burst",
					choice: "accept",
				}),
			);
		});

		it("should measure response time accurately", async () => {
			const mockShowInformationMessage = vi
				.fn()
				.mockResolvedValueOnce("Accept & Save");
			(vscode.window.showInformationMessage as any) =
				mockShowInformationMessage;

			const detection: AIDetection = {
				tool: "GITHUB_COPILOT",
				confidence: 0.85,
				pattern: "burst",
			};

			const result = await warningManager.showWarning(detection);

			expect(isOk(result)).toBe(true);
			if (isOk(result)) {
				expect(result.value.responseTime).toBeGreaterThanOrEqual(0);
				expect(result.value.responseTime).toBeLessThan(10000); // Reasonable upper bound
			}
		});

		it("should handle tool constants correctly in message", async () => {
			const mockShowInformationMessage = vi
				.fn()
				.mockResolvedValueOnce("Accept & Save");
			(vscode.window.showInformationMessage as any) =
				mockShowInformationMessage;

			const detection: AIDetection = {
				tool: "GITHUB_COPILOT",
				confidence: 0.85,
				pattern: "burst",
			};

			await warningManager.showWarning(detection);

			const messageArg = mockShowInformationMessage.mock.calls[0][0];
			expect(messageArg).toContain("GitHub Copilot");
		});
	});

	describe("shouldWarn", () => {
		it("should return true when confidence exceeds threshold", () => {
			expect(AIWarningManager.shouldWarn(0.75, 0.6)).toBe(true);
		});

		it("should return false when confidence below threshold", () => {
			expect(AIWarningManager.shouldWarn(0.5, 0.6)).toBe(false);
		});

		it("should use default threshold of 0.6 when not provided", () => {
			expect(AIWarningManager.shouldWarn(0.61)).toBe(true);
			expect(AIWarningManager.shouldWarn(0.59)).toBe(false);
		});

		it("should handle edge case at exact threshold boundary", () => {
			expect(AIWarningManager.shouldWarn(0.6, 0.6)).toBe(true);
		});

		it("should handle 0 confidence", () => {
			expect(AIWarningManager.shouldWarn(0, 0.6)).toBe(false);
		});

		it("should handle 1.0 confidence (100%)", () => {
			expect(AIWarningManager.shouldWarn(1.0, 0.6)).toBe(true);
		});
	});

	describe("getConfidenceLabel", () => {
		it("should return 'Very High' for confidence >= 0.9", () => {
			expect(AIWarningManager.getConfidenceLabel(0.9)).toBe("Very High");
			expect(AIWarningManager.getConfidenceLabel(0.95)).toBe("Very High");
			expect(AIWarningManager.getConfidenceLabel(1.0)).toBe("Very High");
		});

		it("should return 'High' for confidence 0.75-0.9", () => {
			expect(AIWarningManager.getConfidenceLabel(0.75)).toBe("High");
			expect(AIWarningManager.getConfidenceLabel(0.85)).toBe("High");
			expect(AIWarningManager.getConfidenceLabel(0.89)).toBe("High");
		});

		it("should return 'Medium' for confidence 0.5-0.75", () => {
			expect(AIWarningManager.getConfidenceLabel(0.5)).toBe("Medium");
			expect(AIWarningManager.getConfidenceLabel(0.65)).toBe("Medium");
			expect(AIWarningManager.getConfidenceLabel(0.74)).toBe("Medium");
		});

		it("should return 'Low' for confidence < 0.5", () => {
			expect(AIWarningManager.getConfidenceLabel(0.0)).toBe("Low");
			expect(AIWarningManager.getConfidenceLabel(0.25)).toBe("Low");
			expect(AIWarningManager.getConfidenceLabel(0.49)).toBe("Low");
		});
	});

	describe("edge cases and error handling", () => {
		it("should handle detection with missing optional burst property", async () => {
			const mockShowInformationMessage = vi
				.fn()
				.mockResolvedValueOnce("Accept & Save");
			(vscode.window.showInformationMessage as any) =
				mockShowInformationMessage;

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

		it("should handle unknown tool name and pattern gracefully", async () => {
			const mockShowInformationMessage = vi
				.fn()
				.mockResolvedValueOnce("Accept & Save");
			(vscode.window.showInformationMessage as any) =
				mockShowInformationMessage;

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

		it("should handle very high confidence (1.0)", async () => {
			const mockShowInformationMessage = vi
				.fn()
				.mockResolvedValueOnce("Accept & Save");
			(vscode.window.showInformationMessage as any) =
				mockShowInformationMessage;

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
				(call: any) => call[0] === "AI warning shown",
			);
			expect(logCall[1].confidence).toBe(1.0);
		});

		it("should handle dialog cancellation (undefined response)", async () => {
			const mockShowInformationMessage = vi
				.fn()
				.mockResolvedValueOnce(undefined);
			(vscode.window.showInformationMessage as any) =
				mockShowInformationMessage;

			const detection: AIDetection = {
				tool: "CLAUDE",
				confidence: 0.85,
				pattern: "burst",
			};

			const result = await warningManager.showWarning(detection);

			expect(isOk(result)).toBe(true);
			if (isOk(result)) {
				expect(result.value.choice).toBe("dismissed");
			}
			const logCall = (logger.info as any).mock.calls.find(
				(call: any) => call[0] === "AI warning shown",
			);
			expect(logCall[1].choice).toBe("dismissed");
		});
	});

	describe("timestamp and timing", () => {
		it("should record timestamp in milliseconds", async () => {
			const mockShowInformationMessage = vi
				.fn()
				.mockResolvedValueOnce("Accept & Save");
			(vscode.window.showInformationMessage as any) =
				mockShowInformationMessage;

			const before = Date.now();
			const detection: AIDetection = {
				tool: "GITHUB_COPILOT",
				confidence: 0.85,
				pattern: "burst",
			};

			const result = await warningManager.showWarning(detection);
			const after = Date.now();

			expect(isOk(result)).toBe(true);
			if (isOk(result)) {
				expect(result.value.timestamp).toBeGreaterThanOrEqual(before);
				expect(result.value.timestamp).toBeLessThanOrEqual(after);
			}
		});

		it("should record response time within reasonable bounds", async () => {
			const mockShowInformationMessage = vi
				.fn()
				.mockResolvedValueOnce("Accept & Save");
			(vscode.window.showInformationMessage as any) =
				mockShowInformationMessage;

			const detection: AIDetection = {
				tool: "GITHUB_COPILOT",
				confidence: 0.85,
				pattern: "burst",
			};

			const result = await warningManager.showWarning(detection);

			// Response time should be >= 0 (impossible to be negative)
			expect(isOk(result)).toBe(true);
			if (isOk(result)) {
				expect(result.value.responseTime).toBeGreaterThanOrEqual(0);
			}
		});
	});

	describe("logging integration", () => {
		it("should log all choice types correctly", async () => {
			const choices = [
				"Review Changes",
				"Accept & Save",
				"Restore Previous",
				undefined,
			];
			const expectedChoices = ["review", "accept", "restore", "dismissed"];

			for (let i = 0; i < choices.length; i++) {
				vi.clearAllMocks();
				const mockShowInformationMessage = vi
					.fn()
					.mockResolvedValueOnce(choices[i]);
				(vscode.window.showInformationMessage as any) =
					mockShowInformationMessage;

				const detection: AIDetection = {
					tool: "GITHUB_COPILOT",
					confidence: 0.85,
					pattern: "burst",
				};

				await warningManager.showWarning(detection);

				const logCall = (logger.info as any).mock.calls.find(
					(call: any) => call[0] === "AI warning shown",
				);
				expect(logCall[1].choice).toBe(expectedChoices[i]);
			}
		});

		it("should include all detection details in log", async () => {
			const mockShowInformationMessage = vi
				.fn()
				.mockResolvedValueOnce("Accept & Save");
			(vscode.window.showInformationMessage as any) =
				mockShowInformationMessage;

			const detection: AIDetection = {
				tool: "CURSOR",
				confidence: 0.92,
				pattern: "burst",
				burst: {
					isBurst: true,
					confidence: 0.92,
					details: {
						totalInserted: 1000,
						totalDeleted: 200,
						ratio: 5.0,
						changeCount: 5,
						duration: 8000,
					},
				},
			};

			await warningManager.showWarning(detection);

			const logCall = (logger.info as any).mock.calls.find(
				(call: any) => call[0] === "AI warning shown",
			);
			expect(logCall[1]).toMatchObject({
				tool: "CURSOR",
				confidence: 0.92,
				pattern: "burst",
				choice: "accept",
			});
			expect(logCall[1].burstDetail).toBeDefined();
		});
	});
});
