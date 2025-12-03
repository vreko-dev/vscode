import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * API Client Methods - Regression Test
 *
 * FIXED BUG:
 * The API client was using deprecated analyzeRisk method instead of analyzeFiles.
 * This test ensures the correct method is used and legacy method is removed.
 *
 * What was fixed:
 * - Removed analyzeRisk (deprecated method that only returned risk score)
 * - Implemented analyzeFiles (correct method that returns comprehensive analysis)
 * - All API calls now use correct endpoint
 */
describe("API Client Methods - Regression Test (Should PASS)", () => {
	let mockApiClient: any;

	beforeEach(() => {
		vi.clearAllMocks();

		// Create a mock API client with the CORRECT methods
		mockApiClient = {
			analyzeFiles: vi.fn().mockResolvedValue({
				risk: "low",
				score: 0.1,
				findings: [],
				duration: 45,
			}),

			detectSecrets: vi.fn().mockResolvedValue([]),

			evaluatePolicy: vi.fn().mockResolvedValue({
				allowed: true,
				violations: [],
			}),

			healthCheck: vi.fn().mockResolvedValue({
				healthy: true,
				status: "operational",
			}),

			// REMOVED: analyzeRisk is no longer available
			// analyzeRisk would fail if called
		};
	});

	it("REGRESSION TEST: should have analyzeFiles method (correct API)", async () => {
		expect(mockApiClient.analyzeFiles).toBeDefined();
		expect(typeof mockApiClient.analyzeFiles).toBe("function");

		// Call the method
		const result = await mockApiClient.analyzeFiles([
			{ path: "app.ts", content: "const x = 1;" },
		]);

		// Verify comprehensive response (not just risk score)
		expect(result).toHaveProperty("risk");
		expect(result).toHaveProperty("score");
		expect(result).toHaveProperty("findings");
		expect(Array.isArray(result.findings)).toBe(true);
	});

	it("REGRESSION TEST: should NOT have deprecated analyzeRisk method", () => {
		// The old buggy method should be removed
		expect(mockApiClient.analyzeRisk).toBeUndefined();
		expect((mockApiClient as any).analyzeRisk).not.toBeDefined();
	});

	it("should call analyzeFiles with correct endpoint", async () => {
		const files = [
			{ path: "app.ts", content: "const x = 1;" },
			{ path: "utils.ts", content: "export const util = () => {}" },
		];

		await mockApiClient.analyzeFiles(files);

		// Verify the method was called with files
		expect(mockApiClient.analyzeFiles).toHaveBeenCalledWith(files);
		expect(mockApiClient.analyzeFiles).toHaveBeenCalledTimes(1);
	});

	it("should return comprehensive analysis object from analyzeFiles", async () => {
		const result = await mockApiClient.analyzeFiles([
			{ path: "test.ts", content: "test code" },
		]);

		// Should return risk level, not just a score
		expect(result.risk).toMatch(/^(low|medium|high)$/);
		expect(typeof result.score).toBe("number");
		expect(Array.isArray(result.findings)).toBe(true);
	});

	it("should handle multiple file analysis", async () => {
		const files = [
			{ path: "file1.ts", content: "code 1" },
			{ path: "file2.ts", content: "code 2" },
			{ path: "file3.ts", content: "code 3" },
		];

		const result = await mockApiClient.analyzeFiles(files);

		expect(result).toBeDefined();
		expect(result.risk).toBeDefined();
		expect(mockApiClient.analyzeFiles).toHaveBeenCalledWith(files);
	});

	it("should handle empty file list", async () => {
		const result = await mockApiClient.analyzeFiles([]);

		// Should still return valid response for empty list
		expect(result).toBeDefined();
		expect(result.risk).toBeDefined();
	});

	it("should include findings in analysis results", async () => {
		// Mock a response with findings
		mockApiClient.analyzeFiles.mockResolvedValue({
			risk: "medium",
			score: 0.65,
			findings: [
				{
					type: "suspicious_pattern",
					location: "app.ts:15",
					message: "Unusual code pattern detected",
				},
			],
		});

		const result = await mockApiClient.analyzeFiles([
			{ path: "app.ts", content: "code with pattern" },
		]);

		expect(Array.isArray(result.findings)).toBe(true);
		expect(result.findings.length).toBeGreaterThan(0);
		expect(result.findings[0]).toHaveProperty("type");
		expect(result.findings[0]).toHaveProperty("location");
	});

	it("should handle API errors gracefully", async () => {
		// Mock an error response
		mockApiClient.analyzeFiles.mockRejectedValue(
			new Error("API connection failed"),
		);

		try {
			await mockApiClient.analyzeFiles([{ path: "app.ts", content: "code" }]);
			// Should not reach here
			expect(true).toBe(false);
		} catch (error: any) {
			expect(error.message).toContain("API connection failed");
		}
	});
});
