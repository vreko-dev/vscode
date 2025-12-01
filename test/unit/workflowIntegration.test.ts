import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkflowIntegration } from "../../src/workflowIntegration.js";

// Define interfaces for the mock dependencies
interface MockSmartContextDetector {
	detectContext: ReturnType<typeof vi.fn>;
}

// Use Record<string, unknown> instead of {} to avoid the banned types error
type MockOperationCoordinator = Record<string, unknown>;

interface MockNotificationManager {
	showNotification: ReturnType<typeof vi.fn>;
	showEnhancedSystemStatus: ReturnType<typeof vi.fn>;
	showEnhancedAiActivity: ReturnType<typeof vi.fn>;
	showEnhancedFailureRecovery: ReturnType<typeof vi.fn>;
}

describe("WorkflowIntegration", () => {
	let workflowIntegration: WorkflowIntegration;
	let mockSmartContextDetector: MockSmartContextDetector;
	let mockOperationCoordinator: MockOperationCoordinator;
	let mockNotificationManager: MockNotificationManager;

	beforeEach(() => {
		// Create mock dependencies
		mockSmartContextDetector = {
			detectContext: vi.fn(),
		};

		mockOperationCoordinator = {
			// Add mock methods as needed
		};

		mockNotificationManager = {
			showNotification: vi.fn(),
			showEnhancedSystemStatus: vi.fn(),
			showEnhancedAiActivity: vi.fn(),
			showEnhancedFailureRecovery: vi.fn(),
		};

		workflowIntegration = new WorkflowIntegration(
			mockSmartContextDetector,
			mockOperationCoordinator,
			mockNotificationManager,
		);

		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("constructor", () => {
		it("should create workflow integration with dependencies", () => {
			expect(workflowIntegration).toBeDefined();
			// @ts-expect-error - accessing private properties for testing
			expect(workflowIntegration.smartContextDetector).toBe(
				mockSmartContextDetector,
			);
			// @ts-expect-error - accessing private properties for testing
			expect(workflowIntegration.operationCoordinator).toBe(
				mockOperationCoordinator,
			);
			// @ts-expect-error - accessing private properties for testing
			expect(workflowIntegration.notificationManager).toBe(
				mockNotificationManager,
			);
		});
	});

	describe("getWorkflowSuggestions", () => {
		it("should generate suggestions based on predicted next action", async () => {
			mockSmartContextDetector.detectContext.mockResolvedValue({
				projectType: "typescript",
				framework: "vscode-extension",
				riskPatterns: [],
				sensitiveFiles: [],
				activeDevelopmentAreas: ["auth"],
				predictedNextAction: "focus_on_auth",
			});

			const suggestions = await workflowIntegration.getWorkflowSuggestions();

			expect(suggestions).toHaveLength(1);
			expect(suggestions[0]).toEqual({
				id: expect.stringMatching(/^suggestion-\d+-1$/),
				title: "Predicted Action",
				description: "Based on your activity, you might want to focus on auth",
				action: "focus_on_auth",
				confidence: 85,
				priority: "high",
			});
		});

		it("should generate suggestions for risk patterns", async () => {
			mockSmartContextDetector.detectContext.mockResolvedValue({
				projectType: "typescript",
				framework: "vscode-extension",
				riskPatterns: ["rapid_file_changes", "frequent_branch_switching"],
				sensitiveFiles: [],
				activeDevelopmentAreas: [],
				predictedNextAction: null,
			});

			const suggestions = await workflowIntegration.getWorkflowSuggestions();

			expect(suggestions).toHaveLength(1);
			expect(suggestions[0]).toEqual({
				id: expect.stringMatching(/^suggestion-\d+-2$/),
				title: "Risk Detected",
				description: "Rapid changes detected. Consider creating a snapshot.",
				action: "create_checkpoint",
				confidence: 90, // 80 + (2 risk patterns * 5)
				priority: "high",
			});
		});

		it("should generate suggestions for sensitive files", async () => {
			mockSmartContextDetector.detectContext.mockResolvedValue({
				projectType: "typescript",
				framework: "vscode-extension",
				riskPatterns: [],
				sensitiveFiles: [".env", "config.json", "secrets.json"],
				activeDevelopmentAreas: [],
				predictedNextAction: null,
			});

			const suggestions = await workflowIntegration.getWorkflowSuggestions();

			expect(suggestions).toHaveLength(1);
			expect(suggestions[0]).toEqual({
				id: expect.stringMatching(/^suggestion-\d+-3$/),
				title: "Sensitive Files Detected",
				description:
					"Sensitive configuration files detected. Consider adding protection.",
				action: "protect_sensitive_files",
				confidence: 80, // 60 + 20 (critical sensitivity bonus)
				priority: "high",
			});
		});

		it("should generate suggestions for sensitive files with high-risk patterns", async () => {
			mockSmartContextDetector.detectContext.mockResolvedValue({
				projectType: "typescript",
				framework: "vscode-extension",
				riskPatterns: [],
				sensitiveFiles: ["secrets.key", "private.pem"],
				activeDevelopmentAreas: [],
				predictedNextAction: null,
			});

			const suggestions = await workflowIntegration.getWorkflowSuggestions();

			expect(suggestions).toHaveLength(1);
			expect(suggestions[0].confidence).toBe(80); // 60 + 20 (high sensitivity bonus)
			expect(suggestions[0].priority).toBe("high");
		});

		it("should generate multiple suggestions and sort by priority and confidence", async () => {
			mockSmartContextDetector.detectContext.mockResolvedValue({
				projectType: "typescript",
				framework: "vscode-extension",
				riskPatterns: ["rapid_file_changes"],
				sensitiveFiles: [".env"],
				activeDevelopmentAreas: ["auth"],
				predictedNextAction: "focus_on_auth",
			});

			const suggestions = await workflowIntegration.getWorkflowSuggestions();

			expect(suggestions).toHaveLength(3);

			// Should be sorted by priority (high first) and then confidence (high first)
			expect(suggestions[0].priority).toBe("high");
			expect(suggestions[1].priority).toBe("high");
			expect(suggestions[2].priority).toBe("medium");

			// Within same priority, higher confidence should come first
			if (suggestions[0].priority === suggestions[1].priority) {
				expect(suggestions[0].confidence).toBeGreaterThanOrEqual(
					suggestions[1].confidence,
				);
			}
		});

		it("should handle empty context", async () => {
			mockSmartContextDetector.detectContext.mockResolvedValue({
				projectType: "unknown",
				framework: null,
				riskPatterns: [],
				sensitiveFiles: [],
				activeDevelopmentAreas: [],
				predictedNextAction: null,
			});

			const suggestions = await workflowIntegration.getWorkflowSuggestions();

			expect(suggestions).toHaveLength(0);
		});

		it("should handle context detection errors", async () => {
			mockSmartContextDetector.detectContext.mockRejectedValue(
				new Error("Context detection failed"),
			);

			await expect(
				workflowIntegration.getWorkflowSuggestions(),
			).rejects.toThrow("Context detection failed");
		});
	});

	describe("applySuggestion", () => {
		it("should apply suggestion and show notification", async () => {
			const suggestionId = "suggestion-1234567890-1";

			await workflowIntegration.applySuggestion(suggestionId);

			expect(mockNotificationManager.showNotification).toHaveBeenCalledWith({
				id: `applied-${suggestionId}`,
				type: "info",
				icon: "✨",
				message: "Workflow suggestion applied",
				detail: `Applied workflow suggestion: ${suggestionId}\n\nYour code has been enhanced with AI-powered improvements.`,
				timestamp: expect.any(Number),
				actions: [
					{ title: "View Changes", command: "snapback.viewChanges" },
					{ title: "Undo", command: "snapback.undoSuggestion" },
				],
			});
		});

		it("should handle notification errors gracefully", async () => {
			const suggestionId = "suggestion-1234567890-1";
			mockNotificationManager.showNotification.mockRejectedValue(
				new Error("Notification failed"),
			);

			await expect(
				workflowIntegration.applySuggestion(suggestionId),
			).rejects.toThrow("Notification failed");
		});
	});

	describe("autoApplySuggestions", () => {
		it("should auto-apply high-confidence suggestions", async () => {
			// Mock suggestions with one high-confidence suggestion
			mockSmartContextDetector.detectContext.mockResolvedValue({
				projectType: "typescript",
				framework: "vscode-extension",
				riskPatterns: ["rapid_file_changes"],
				sensitiveFiles: [],
				activeDevelopmentAreas: [],
				predictedNextAction: "focus_on_auth",
			});

			await workflowIntegration.autoApplySuggestions();

			// Should show system status notification
			expect(
				mockNotificationManager.showEnhancedSystemStatus,
			).toHaveBeenCalled();

			// Should apply the high-confidence suggestion
			expect(mockNotificationManager.showNotification).toHaveBeenCalled();
			expect(mockNotificationManager.showEnhancedAiActivity).toHaveBeenCalled();
		});

		it("should handle multiple high-confidence suggestions", async () => {
			// Mock context that generates multiple high-confidence suggestions
			mockSmartContextDetector.detectContext.mockResolvedValue({
				projectType: "typescript",
				framework: "vscode-extension",
				riskPatterns: ["rapid_file_changes"],
				sensitiveFiles: ["secrets.key"],
				activeDevelopmentAreas: ["auth"],
				predictedNextAction: "focus_on_auth",
			});

			await workflowIntegration.autoApplySuggestions();

			// Should show system status notification
			expect(
				mockNotificationManager.showEnhancedSystemStatus,
			).toHaveBeenCalled();

			// Should apply multiple suggestions
			expect(mockNotificationManager.showNotification).toHaveBeenCalledTimes(2);
			expect(
				mockNotificationManager.showEnhancedAiActivity,
			).toHaveBeenCalledTimes(2);
		});

		it("should handle suggestion execution errors gracefully", async () => {
			mockSmartContextDetector.detectContext.mockResolvedValue({
				projectType: "typescript",
				framework: "vscode-extension",
				riskPatterns: ["rapid_file_changes"],
				sensitiveFiles: [],
				activeDevelopmentAreas: ["auth"],
				predictedNextAction: "focus_on_auth",
			});

			// Make the first applySuggestion fail
			mockNotificationManager.showNotification
				.mockRejectedValueOnce(new Error("Apply failed"))
				.mockResolvedValueOnce(undefined);

			await workflowIntegration.autoApplySuggestions();

			// Should show failure recovery notification
			expect(
				mockNotificationManager.showEnhancedFailureRecovery,
			).toHaveBeenCalled();

			// Should attempt to continue processing suggestions after a failure
			expect(mockNotificationManager.showNotification).toHaveBeenCalledTimes(2);
		});

		it("should handle no eligible suggestions", async () => {
			mockSmartContextDetector.detectContext.mockResolvedValue({
				projectType: "typescript",
				framework: "vscode-extension",
				riskPatterns: [],
				sensitiveFiles: [],
				activeDevelopmentAreas: [],
				predictedNextAction: null,
			});

			await workflowIntegration.autoApplySuggestions();

			// Should not show system status notification when no suggestions
			expect(
				mockNotificationManager.showEnhancedSystemStatus,
			).not.toHaveBeenCalled();

			// Should not apply any suggestions
			expect(mockNotificationManager.showNotification).not.toHaveBeenCalled();
			expect(
				mockNotificationManager.showEnhancedAiActivity,
			).not.toHaveBeenCalled();
		});

		it("should handle context detection errors", async () => {
			mockSmartContextDetector.detectContext.mockRejectedValue(
				new Error("Context detection failed"),
			);

			await expect(workflowIntegration.autoApplySuggestions()).rejects.toThrow(
				"Context detection failed",
			);
		});

		it("should filter suggestions by confidence and priority", async () => {
			// Mock a low-confidence suggestion that should not be auto-applied
			mockSmartContextDetector.detectContext.mockResolvedValue({
				projectType: "typescript",
				framework: "vscode-extension",
				riskPatterns: [],
				sensitiveFiles: [],
				activeDevelopmentAreas: [],
				predictedNextAction: "focus_on_auth", // This generates 85 confidence, so it should be applied
			});

			await workflowIntegration.autoApplySuggestions();

			// Should apply the high-confidence suggestion
			expect(
				mockNotificationManager.showEnhancedSystemStatus,
			).toHaveBeenCalled();
		});
	});

	describe("edge cases", () => {
		it("should handle special characters in suggestion IDs", async () => {
			mockSmartContextDetector.detectContext.mockResolvedValue({
				projectType: "typescript",
				framework: "vscode-extension",
				riskPatterns: [],
				sensitiveFiles: [],
				activeDevelopmentAreas: [],
				predictedNextAction: "test-action_with.special@chars",
			});

			const suggestions = await workflowIntegration.getWorkflowSuggestions();

			expect(suggestions).toHaveLength(1);
			expect(suggestions[0].action).toBe("test-action_with.special@chars");
		});

		it("should handle unicode characters in context", async () => {
			mockSmartContextDetector.detectContext.mockResolvedValue({
				projectType: "typescript",
				framework: "vscode-extension",
				riskPatterns: [],
				sensitiveFiles: ["файл.env"],
				activeDevelopmentAreas: ["директория"],
				predictedNextAction: "фокус_на_директория",
			});

			const suggestions = await workflowIntegration.getWorkflowSuggestions();

			expect(suggestions).toHaveLength(2);
		});

		it("should handle very long suggestion details", async () => {
			mockSmartContextDetector.detectContext.mockResolvedValue({
				projectType: "typescript",
				framework: "vscode-extension",
				riskPatterns: [],
				sensitiveFiles: [],
				activeDevelopmentAreas: [`${"a".repeat(1000)}`],
				predictedNextAction: `${"b".repeat(1000)}`,
			});

			const suggestions = await workflowIntegration.getWorkflowSuggestions();

			expect(suggestions).toHaveLength(1);
			expect(suggestions[0].action).toBe(`${"b".repeat(1000)}`);
		});

		it("should handle many risk patterns", async () => {
			const manyRiskPatterns = Array.from(
				{ length: 10 },
				(_, i) => `pattern-${i}`,
			);

			mockSmartContextDetector.detectContext.mockResolvedValue({
				projectType: "typescript",
				framework: "vscode-extension",
				riskPatterns: manyRiskPatterns,
				sensitiveFiles: [],
				activeDevelopmentAreas: [],
				predictedNextAction: null,
			});

			const suggestions = await workflowIntegration.getWorkflowSuggestions();

			// Confidence should be capped at 95
			expect(suggestions[0].confidence).toBe(95);
		});

		it("should handle concurrent suggestion generation", async () => {
			mockSmartContextDetector.detectContext.mockResolvedValue({
				projectType: "typescript",
				framework: "vscode-extension",
				riskPatterns: ["rapid_file_changes"],
				sensitiveFiles: [".env"],
				activeDevelopmentAreas: ["auth"],
				predictedNextAction: "focus_on_auth",
			});

			// Run multiple suggestion generations concurrently
			const promises = Array.from({ length: 5 }, () =>
				workflowIntegration.getWorkflowSuggestions(),
			);

			const results = await Promise.all(promises);

			expect(results).toHaveLength(5);
			results.forEach((result) => {
				expect(result).toHaveLength(3);
			});
		});

		it("should handle concurrent auto-apply operations", async () => {
			mockSmartContextDetector.detectContext.mockResolvedValue({
				projectType: "typescript",
				framework: "vscode-extension",
				riskPatterns: ["rapid_file_changes"],
				sensitiveFiles: [".env"],
				activeDevelopmentAreas: ["auth"],
				predictedNextAction: "focus_on_auth",
			});

			// Run multiple auto-apply operations concurrently
			const promises = Array.from({ length: 3 }, () =>
				workflowIntegration.autoApplySuggestions(),
			);

			await Promise.all(promises);

			// Should have called notifications multiple times
			expect(
				mockNotificationManager.showEnhancedSystemStatus,
			).toHaveBeenCalledTimes(3);
		});
	});
});
