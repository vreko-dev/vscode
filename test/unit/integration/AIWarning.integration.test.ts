import { logger } from "@snapback/infrastructure";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { AIWarningManager } from "@vscode/ai/AIWarningManager";
import { isOk } from "@vscode/types/result";

// Mock logger
vi.mock("@snapback/infrastructure", () => ({
	logger: {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	},
}));

describe("AIWarning Integration", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("AI Detection Warning Flow", () => {
		it("should show warning and track user choice", async () => {
			const mockShowWarningMessage = vi
				.fn()
				.mockResolvedValueOnce("Accept & Save");
			(vscode.window.showWarningMessage as any) = mockShowWarningMessage;

			const warningManager = new AIWarningManager();
			const result = await warningManager.showWarning({
				tool: "GITHUB_COPILOT",
				confidence: 0.85,
				pattern: "burst",
			});

			expect(mockShowWarningMessage).toHaveBeenCalled();
			expect(isOk(result)).toBe(true);
			if (isOk(result)) {
				expect(result.value.choice).toBe("accept");
				expect(result.value.timestamp).toBeGreaterThan(0);
				expect(result.value.responseTime).toBeGreaterThanOrEqual(0);
			}
		});

		it("should log telemetry with full detection context", async () => {
			const mockShowWarningMessage = vi
				.fn()
				.mockResolvedValueOnce("Accept & Save");
			(vscode.window.showWarningMessage as any) = mockShowWarningMessage;

			const warningManager = new AIWarningManager();
			const result = await warningManager.showWarning({
				tool: "GITHUB_COPILOT",
				confidence: 0.88,
				pattern: "burst",
				burst: {
					isBurst: true,
					confidence: 0.88,
					details: {
						totalInserted: 500,
						totalDeleted: 100,
						ratio: 5.0,
						changeCount: 3,
						duration: 5000,
					},
				},
			});

			expect(isOk(result)).toBe(true);
			expect(logger.info).toHaveBeenCalledWith(
				"AI warning shown",
				expect.objectContaining({
					tool: "GITHUB_COPILOT",
					confidence: 0.88,
					pattern: "burst",
					choice: "accept",
					responseTime: expect.any(Number),
					burstDetail: expect.objectContaining({
						totalInserted: 500,
						totalDeleted: 100,
						ratio: 5.0,
					}),
				}),
			);
		});

		it("should handle all user choice outcomes", async () => {
			const warningManager = new AIWarningManager();

			// Test: Accept & Save
			(vscode.window.showWarningMessage as any) = vi
				.fn()
				.mockResolvedValueOnce("Accept & Save");
			let result = await warningManager.showWarning({
				tool: "GITHUB_COPILOT",
				confidence: 0.85,
				pattern: "burst",
			});
			expect(isOk(result)).toBe(true);
			if (isOk(result)) {
				expect(result.value.choice).toBe("accept");
			}

			// Test: Review Changes
			vi.clearAllMocks();
			(vscode.window.showWarningMessage as any) = vi
				.fn()
				.mockResolvedValueOnce("Review Changes");
			result = await warningManager.showWarning({
				tool: "CLAUDE",
				confidence: 0.9,
				pattern: "burst",
			});
			expect(isOk(result)).toBe(true);
			if (isOk(result)) {
				expect(result.value.choice).toBe("review");
			}

			// Test: Restore Previous
			vi.clearAllMocks();
			(vscode.window.showWarningMessage as any) = vi
				.fn()
				.mockResolvedValueOnce("Restore Previous");
			result = await warningManager.showWarning({
				tool: "CURSOR",
				confidence: 0.75,
				pattern: "burst",
			});
			expect(isOk(result)).toBe(true);
			if (isOk(result)) {
				expect(result.value.choice).toBe("restore");
			}

			// Test: Dismissed (dialog closed)
			vi.clearAllMocks();
			(vscode.window.showWarningMessage as any) = vi
				.fn()
				.mockResolvedValueOnce(undefined);
			result = await warningManager.showWarning({
				tool: "TABNINE",
				confidence: 0.7,
				pattern: "burst",
			});
			expect(isOk(result)).toBe(true);
			if (isOk(result)) {
				expect(result.value.choice).toBe("dismissed");
			}
		});

		it("should include burst details in message when provided", async () => {
			const mockShowWarningMessage = vi
				.fn()
				.mockResolvedValueOnce("Accept & Save");
			(vscode.window.showWarningMessage as any) = mockShowWarningMessage;

			const warningManager = new AIWarningManager();
			const result = await warningManager.showWarning({
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
			});

			expect(isOk(result)).toBe(true);
			const messageArg = mockShowWarningMessage.mock.calls[0][0];
			expect(messageArg).toContain("Rapid insertion");
			expect(messageArg).toContain("500");
		});

		it("should format tool names correctly for display", async () => {
			const warningManager = new AIWarningManager();

			const testCases = [
				{ tool: "GITHUB_COPILOT", expected: "GitHub Copilot" },
				{ tool: "CLAUDE", expected: "Claude" },
				{ tool: "CURSOR", expected: "Cursor" },
				{ tool: "TABNINE", expected: "Tabnine" },
			];

			for (const { tool, expected } of testCases) {
				vi.clearAllMocks();
				const mockShowWarningMessage = vi
					.fn()
					.mockResolvedValueOnce("Accept & Save");
				(vscode.window.showWarningMessage as any) = mockShowWarningMessage;

				await warningManager.showWarning({
					tool,
					confidence: 0.85,
					pattern: "burst",
				});

				const messageArg = mockShowWarningMessage.mock.calls[0][0];
				expect(messageArg).toContain(expected);
			}
		});

		it("should track response time accurately", async () => {
			const mockShowWarningMessage = vi.fn().mockImplementation(
				() =>
					new Promise((resolve) => {
						setTimeout(() => resolve("Accept & Save"), 10);
					}),
			);
			(vscode.window.showWarningMessage as any) = mockShowWarningMessage;

			const warningManager = new AIWarningManager();
			const result = await warningManager.showWarning({
				tool: "GITHUB_COPILOT",
				confidence: 0.85,
				pattern: "burst",
			});

			expect(isOk(result)).toBe(true);
			if (isOk(result)) {
				expect(result.value.responseTime).toBeGreaterThanOrEqual(10);
				expect(result.value.responseTime).toBeLessThan(1000);
			}
		});
	});
});
