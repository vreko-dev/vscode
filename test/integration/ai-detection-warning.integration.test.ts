/**
 * @fileoverview AI Detection → Warning E2E Integration Tests
 *
 * Tests the complete flow from AI detection to user warning:
 * 1. File edit detected with AI characteristics
 * 2. AI detection triggers (burst heuristics / extension presence)
 * 3. Warning dialog shown with correct tool and confidence
 * 4. User makes choice (accept/review/restore/dismiss)
 * 5. Choice is handled correctly
 *
 * ROI: Critical path for customer safety UX - validates users are
 * warned about AI-generated code before it's saved.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { AIWarningManager, type AIDetection } from "../../src/ai/AIWarningManager";
import { isOk } from "../../src/types/result";

// Mock logger
vi.mock("../../src/utils/logger", () => ({
	logger: {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	},
}));

describe("AI Detection → Warning E2E Integration", () => {
	let warningManager: AIWarningManager;

	beforeEach(() => {
		vi.clearAllMocks();
		warningManager = new AIWarningManager();
	});

	describe("Complete Detection → Warning Flow", () => {
		it("should detect AI and show warning with correct tool name", async () => {
			// Setup: Mock warning dialog
			const mockShowWarningMessage = vi.fn().mockResolvedValueOnce("Accept & Save");
			(vscode.window.showWarningMessage as any) = mockShowWarningMessage;

			// Act: Simulate detection result triggering warning
			const detection: AIDetection = {
				tool: "GITHUB_COPILOT",
				confidence: 0.85,
				pattern: "burst",
			};

			const result = await warningManager.showWarning(detection);

			// Assert: Warning shown with correct tool formatting
			expect(mockShowWarningMessage).toHaveBeenCalledTimes(1);
			const messageArg = mockShowWarningMessage.mock.calls[0][0];
			expect(messageArg).toContain("GitHub Copilot");
			expect(messageArg).toContain("85%");
			expect(isOk(result)).toBe(true);
		});

		it("should include burst details in warning when available", async () => {
			// Setup
			const mockShowWarningMessage = vi.fn().mockResolvedValueOnce("Review Changes");
			(vscode.window.showWarningMessage as any) = mockShowWarningMessage;

			// Act: Detection with burst details
			const detection: AIDetection = {
				tool: "CLAUDE",
				confidence: 0.92,
				pattern: "burst",
				burst: {
					isBurst: true,
					confidence: 0.92,
					details: {
						totalInserted: 847,
						totalDeleted: 12,
						ratio: 70.5,
						changeCount: 1,
						duration: 200,
					},
				},
			};

			await warningManager.showWarning(detection);

			// Assert: Burst details included in message
			const messageArg = mockShowWarningMessage.mock.calls[0][0];
			expect(messageArg).toContain("Rapid insertion");
			expect(messageArg).toContain("847");
		});
	});

	describe("User Choice Handling", () => {
		it("should handle Accept & Save choice correctly", async () => {
			// Setup
			(vscode.window.showWarningMessage as any) = vi.fn().mockResolvedValueOnce("Accept & Save");

			// Act
			const result = await warningManager.showWarning({
				tool: "CURSOR",
				confidence: 0.78,
				pattern: "extension-presence",
			});

			// Assert
			expect(isOk(result)).toBe(true);
			if (isOk(result)) {
				expect(result.value.choice).toBe("accept");
				expect(result.value.timestamp).toBeGreaterThan(0);
				expect(result.value.responseTime).toBeGreaterThanOrEqual(0);
			}
		});

		it("should handle Review Changes choice correctly", async () => {
			// Setup
			(vscode.window.showWarningMessage as any) = vi.fn().mockResolvedValueOnce("Review Changes");

			// Act
			const result = await warningManager.showWarning({
				tool: "TABNINE",
				confidence: 0.65,
				pattern: "burst",
			});

			// Assert
			expect(isOk(result)).toBe(true);
			if (isOk(result)) {
				expect(result.value.choice).toBe("review");
			}
		});

		it("should handle Restore Previous choice correctly", async () => {
			// Setup
			(vscode.window.showWarningMessage as any) = vi
				.fn()
				.mockResolvedValueOnce("Restore Previous");

			// Act
			const result = await warningManager.showWarning({
				tool: "CODEIUM",
				confidence: 0.88,
				pattern: "burst",
			});

			// Assert
			expect(isOk(result)).toBe(true);
			if (isOk(result)) {
				expect(result.value.choice).toBe("restore");
			}
		});

		it("should handle dialog dismissal (escape/click away)", async () => {
			// Setup: User closes dialog without choosing
			(vscode.window.showWarningMessage as any) = vi.fn().mockResolvedValueOnce(undefined);

			// Act
			const result = await warningManager.showWarning({
				tool: "GITHUB_COPILOT",
				confidence: 0.7,
				pattern: "extension-presence",
			});

			// Assert
			expect(isOk(result)).toBe(true);
			if (isOk(result)) {
				expect(result.value.choice).toBe("dismissed");
			}
		});
	});

	describe("Multi-Tool Detection Scenarios", () => {
		it("should display correct name for each supported AI tool", async () => {
			const testCases = [
				{ tool: "GITHUB_COPILOT", expected: "GitHub Copilot" },
				{ tool: "CLAUDE", expected: "Claude" },
				{ tool: "CURSOR", expected: "Cursor" },
				{ tool: "TABNINE", expected: "Tabnine" },
				{ tool: "CODEIUM", expected: "Codeium" },
				{ tool: "AMAZON_CODEWHISPERER", expected: "Amazon CodeWhisperer" },
				{ tool: "JETBRAINS_AI", expected: "JetBrains AI" },
			];

			for (const { tool, expected } of testCases) {
				vi.clearAllMocks();
				const mockShowWarningMessage = vi.fn().mockResolvedValueOnce("Accept & Save");
				(vscode.window.showWarningMessage as any) = mockShowWarningMessage;

				await warningManager.showWarning({
					tool,
					confidence: 0.8,
					pattern: "extension-presence",
				});

				const messageArg = mockShowWarningMessage.mock.calls[0][0];
				expect(messageArg).toContain(expected);
			}
		});

		it("should handle unknown tool gracefully with formatted name", async () => {
			const mockShowWarningMessage = vi.fn().mockResolvedValueOnce("Accept & Save");
			(vscode.window.showWarningMessage as any) = mockShowWarningMessage;

			await warningManager.showWarning({
				tool: "UNKNOWN_AI_TOOL",
				confidence: 0.6,
				pattern: "burst",
			});

			// Should format unknown tool: UNKNOWN_AI_TOOL -> UNKNOWN AI TOOL
			const messageArg = mockShowWarningMessage.mock.calls[0][0];
			expect(messageArg).toContain("UNKNOWN AI TOOL");
		});
	});

	describe("Confidence Level Display", () => {
		it("should show percentage confidence in warning", async () => {
			const testCases = [
				{ confidence: 0.99, expectedPercent: "99%" },
				{ confidence: 0.85, expectedPercent: "85%" },
				{ confidence: 0.6, expectedPercent: "60%" },
				{ confidence: 0.123, expectedPercent: "12%" }, // Rounded
			];

			for (const { confidence, expectedPercent } of testCases) {
				vi.clearAllMocks();
				const mockShowWarningMessage = vi.fn().mockResolvedValueOnce("Accept & Save");
				(vscode.window.showWarningMessage as any) = mockShowWarningMessage;

				await warningManager.showWarning({
					tool: "GITHUB_COPILOT",
					confidence,
					pattern: "burst",
				});

				const messageArg = mockShowWarningMessage.mock.calls[0][0];
				expect(messageArg).toContain(expectedPercent);
			}
		});

		it("should correctly classify confidence levels", () => {
			expect(AIWarningManager.getConfidenceLabel(0.95)).toBe("Very High");
			expect(AIWarningManager.getConfidenceLabel(0.75)).toBe("High");
			expect(AIWarningManager.getConfidenceLabel(0.55)).toBe("Medium");
			expect(AIWarningManager.getConfidenceLabel(0.3)).toBe("Low");
		});
	});

	describe("Warning Threshold Logic", () => {
		it("should determine if warning is needed based on threshold", () => {
			// Default threshold is 0.6
			expect(AIWarningManager.shouldWarn(0.9)).toBe(true);
			expect(AIWarningManager.shouldWarn(0.7)).toBe(true);
			expect(AIWarningManager.shouldWarn(0.6)).toBe(true);
			expect(AIWarningManager.shouldWarn(0.59)).toBe(false);
			expect(AIWarningManager.shouldWarn(0.3)).toBe(false);
		});

		it("should respect custom threshold when provided", () => {
			expect(AIWarningManager.shouldWarn(0.85, 0.9)).toBe(false);
			expect(AIWarningManager.shouldWarn(0.91, 0.9)).toBe(true);
			expect(AIWarningManager.shouldWarn(0.5, 0.4)).toBe(true);
		});
	});

	describe("Response Time Tracking", () => {
		it("should track time from warning shown to user response", async () => {
			// Setup: Simulate user taking time to respond
			const mockShowWarningMessage = vi.fn().mockImplementation(
				() =>
					new Promise<string>((resolve) => {
						setTimeout(() => resolve("Accept & Save"), 50);
					}),
			);
			(vscode.window.showWarningMessage as any) = mockShowWarningMessage;

			// Act
			const result = await warningManager.showWarning({
				tool: "GITHUB_COPILOT",
				confidence: 0.85,
				pattern: "burst",
			});

			// Assert: Response time should be at least 50ms
			expect(isOk(result)).toBe(true);
			if (isOk(result)) {
				expect(result.value.responseTime).toBeGreaterThanOrEqual(50);
				expect(result.value.responseTime).toBeLessThan(5000); // Sanity check
			}
		});
	});

	describe("Telemetry Integration", () => {
		it("should log warning event with full context", async () => {
			// Import logger to verify calls
			const { logger } = await import("../../src/utils/logger");

			const mockShowWarningMessage = vi.fn().mockResolvedValueOnce("Review Changes");
			(vscode.window.showWarningMessage as any) = mockShowWarningMessage;

			// Act
			await warningManager.showWarning({
				tool: "CLAUDE",
				confidence: 0.88,
				pattern: "burst",
				burst: {
					isBurst: true,
					confidence: 0.88,
					details: {
						totalInserted: 500,
						totalDeleted: 20,
						ratio: 25.0,
						changeCount: 2,
						duration: 300,
					},
				},
			});

			// Assert: Logger called with full context
			expect(logger.info).toHaveBeenCalledWith(
				"AI warning shown",
				expect.objectContaining({
					tool: "CLAUDE",
					confidence: 0.88,
					pattern: "burst",
					choice: "review",
					responseTime: expect.any(Number),
					burstDetail: expect.objectContaining({
						totalInserted: 500,
						totalDeleted: 20,
						ratio: 25.0,
					}),
				}),
			);
		});
	});

	describe("Edge Cases", () => {
		it("should handle rapid successive warnings", async () => {
			const mockShowWarningMessage = vi.fn().mockResolvedValue("Accept & Save");
			(vscode.window.showWarningMessage as any) = mockShowWarningMessage;

			// Fire multiple warnings rapidly
			const results = await Promise.all([
				warningManager.showWarning({
					tool: "GITHUB_COPILOT",
					confidence: 0.8,
					pattern: "burst",
				}),
				warningManager.showWarning({
					tool: "CLAUDE",
					confidence: 0.85,
					pattern: "burst",
				}),
				warningManager.showWarning({
					tool: "CURSOR",
					confidence: 0.9,
					pattern: "burst",
				}),
			]);

			// All should complete successfully
			expect(results).toHaveLength(3);
			results.forEach((result) => {
				expect(isOk(result)).toBe(true);
			});
		});

		it("should handle zero confidence gracefully", async () => {
			const mockShowWarningMessage = vi.fn().mockResolvedValueOnce("Accept & Save");
			(vscode.window.showWarningMessage as any) = mockShowWarningMessage;

			const result = await warningManager.showWarning({
				tool: "GITHUB_COPILOT",
				confidence: 0,
				pattern: "manual-trigger",
			});

			expect(isOk(result)).toBe(true);
			const messageArg = mockShowWarningMessage.mock.calls[0][0];
			expect(messageArg).toContain("0%");
		});

		it("should handle empty burst details", async () => {
			const mockShowWarningMessage = vi.fn().mockResolvedValueOnce("Accept & Save");
			(vscode.window.showWarningMessage as any) = mockShowWarningMessage;

			const result = await warningManager.showWarning({
				tool: "GITHUB_COPILOT",
				confidence: 0.8,
				pattern: "burst",
				burst: {
					isBurst: true,
					confidence: 0.8,
					details: {
						totalInserted: 0,
						totalDeleted: 0,
						ratio: 0,
						changeCount: 0,
						duration: 0,
					},
				},
			});

			// Should still show warning successfully
			expect(isOk(result)).toBe(true);
		});
	});
});
