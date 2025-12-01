import { describe, expect, it } from "vitest";
import { ApiClient } from "../../src/services/api-client";

describe("Backend API End-to-End Tests", () => {
	let apiClient: ApiClient;

	beforeEach(() => {
		apiClient = new ApiClient();

		// Override the base URL to point to our test deployment
		// Note: api-simple test package has been removed
		(apiClient as unknown as { baseUrl: string }).baseUrl =
			"http://localhost:3000/api";

		// Set a test API key
		apiClient.setApiKey("test-key-12345");
	});

	it("should successfully call the analyze endpoint", async () => {
		// Test data
		const testFiles = [
			{
				path: "src/test.js",
				content: 'const apiKey = "SECRET_1234567890";',
			},
		];

		try {
			// Call the analyze API
			const result = await apiClient.analyzeFiles(testFiles);

			// Verify the response structure
			expect(result).toHaveProperty("riskScore");
			expect(typeof result.riskScore).toBe("number");
			expect(result).toHaveProperty("analysisTimeMs");
			expect(typeof result.analysisTimeMs).toBe("number");

			// Log the result for debugging
			console.log("Analyze API Response:", result);
		} catch (error) {
			// If the API call fails, we want to see the error
			console.error("Analyze API Error:", error);
			throw error;
		}
	});

	it("should successfully call the detect-secrets endpoint", async () => {
		// Test data
		const testFiles = [
			{
				path: "src/secrets.js",
				content: 'const password = "mySecretPassword123";',
			},
		];

		try {
			// Call the detect-secrets API
			const result = await apiClient.detectSecrets(testFiles);

			// Verify the response structure
			expect(result).toHaveProperty("secrets");
			expect(Array.isArray(result.secrets)).toBe(true);
			expect(result).toHaveProperty("detectionTimeMs");
			expect(typeof result.detectionTimeMs).toBe("number");

			// Log the result for debugging
			console.log("Detect Secrets API Response:", result);
		} catch (error) {
			// If the API call fails, we want to see the error
			console.error("Detect Secrets API Error:", error);
			throw error;
		}
	});

	it("should successfully call the policy evaluate endpoint", async () => {
		// Test data with a high risk score
		const testData = {
			riskScore: 85,
			riskFactors: [
				{
					type: "secret_exposure",
					severity: "high",
					message: "API key detected",
				},
			],
		};

		try {
			// Call the policy evaluate API
			const result = await apiClient.evaluatePolicy(testData);

			// Verify the response structure
			expect(result).toHaveProperty("action");
			expect(["block", "allow"]).toContain(result.action);
			expect(result).toHaveProperty("reason");
			expect(typeof result.reason).toBe("string");
			expect(result).toHaveProperty("evaluationTimeMs");
			expect(typeof result.evaluationTimeMs).toBe("number");

			// Log the result for debugging
			console.log("Policy Evaluate API Response:", result);
		} catch (error) {
			// If the API call fails, we want to see the error
			console.error("Policy Evaluate API Error:", error);
			throw error;
		}
	});

	it("should successfully call the health check endpoint", async () => {
		try {
			// Call the health check API
			const isHealthy = await apiClient.healthCheck();

			// Verify the response
			expect(typeof isHealthy).toBe("boolean");
			expect(isHealthy).toBe(true);

			// Log the result for debugging
			console.log("Health Check API Response:", isHealthy);
		} catch (error) {
			// If the API call fails, we want to see the error
			console.error("Health Check API Error:", error);
			throw error;
		}
	});
});
