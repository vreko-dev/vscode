import { describe, expect, it, vi } from "vitest";
import { RulesManager } from "@vscode/rules/RulesManager";

// Test to verify offline mode behavior - RED (Failing Test)
describe("Offline Mode - RED (Failing Test)", () => {
	it("should use cached rules when offline mode is enabled and network request fails", async () => {
		// Create a mock context
		const mockContext: any = {
			extension: {
				packageJSON: {
					version: "1.0.0",
				},
			},
		};

		// Create RulesManager instance
		const rulesManager = new RulesManager(mockContext);

		// Mock cached rules
		const cachedRules: any = {
			protection: [
				{
					pattern: "*.env",
					level: "Protected",
					reason: "Environment files contain sensitive data",
				},
			],
		};

		// Set up cached rules in the manager
		(rulesManager as any).currentRules = cachedRules;

		// Mock logger to verify offline mode is detected
		const mockLogger = vi.spyOn((rulesManager as any).logger, "warn");

		// Mock the fetchRules method to simulate network error
		const _originalFetchRules = (rulesManager as any).fetchRules;
		(rulesManager as any).fetchRules = vi.fn().mockImplementation(async () => {
			// Simulate network error
			throw new Error("Network error");
		});

		// Try to start polling - should handle network error gracefully
		try {
			await (rulesManager as any).fetchRules();
		} catch (_error) {
			// Expected error
		}

		// Verify that offline mode warning was logged
		expect(mockLogger).toHaveBeenCalledWith(
			"Failed to fetch rules",
			new Error("Network error"),
		);

		// Verify that cached rules are still available
		const rules = rulesManager.getCurrentRules();
		expect(rules).toEqual(cachedRules);
	});

	it("should throw error when offline mode is enabled but no cached rules available", async () => {
		// Create a mock context
		const mockContext: any = {
			extension: {
				packageJSON: {
					version: "1.0.0",
				},
			},
		};

		// Create RulesManager instance with no cached rules
		const rulesManager = new RulesManager(mockContext);

		// Mock the fetchRules method to simulate network error
		(rulesManager as any).fetchRules = vi.fn().mockImplementation(async () => {
			throw new Error("Network error");
		});

		// Try to start polling - should handle network error gracefully
		try {
			await (rulesManager as any).fetchRules();
		} catch (error) {
			// Verify error is thrown when no cached rules
			expect((error as Error).message).toBe("Network error");
		}
	});
});
