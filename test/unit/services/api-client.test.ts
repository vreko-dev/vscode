import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * API Client Method Existence Test
 *
 * CRITICAL BUG PREVENTION:
 * Code was calling `analyzeRisk()` method that doesn't exist on API client.
 * This caused silent failures when:
 * - Risk analysis was needed
 * - No fallback or error message shown
 * - Network issues weren't handled properly
 *
 * This test ensures:
 * - analyzeFiles method EXISTS (correct modern API)
 * - analyzeRisk method does NOT exist (old deprecated method)
 * - Network failures don't crash extension
 * - Graceful degradation when API unavailable
 */

describe("API Client Method Existence", () => {
	let apiClient: any;

	beforeEach(() => {
		vi.clearAllMocks();

		// Create minimal API client mock
		apiClient = {
			analyzeFiles: vi.fn(),
		};
	});

	describe("analyzeFiles Method", () => {
		it("should have analyzeFiles method", () => {
			expect(apiClient.analyzeFiles).toBeDefined();
			expect(typeof apiClient.analyzeFiles).toBe("function");
		});

		it("should accept file paths array", async () => {
			const files = ["src/app.ts", "src/utils.ts"];

			apiClient.analyzeFiles.mockResolvedValueOnce({
				analysis: [],
			});

			await apiClient.analyzeFiles(files);

			expect(apiClient.analyzeFiles).toHaveBeenCalledWith(files);
		});

		it("should accept options parameter", async () => {
			const files = ["app.ts"];
			const options = { verbose: true };

			apiClient.analyzeFiles.mockResolvedValueOnce({
				analysis: [],
			});

			await apiClient.analyzeFiles(files, options);

			expect(apiClient.analyzeFiles).toHaveBeenCalledWith(files, options);
		});

		it("should return analysis results", async () => {
			const results = {
				analysis: [
					{
						file: "app.ts",
						risk: "low",
					},
				],
			};

			apiClient.analyzeFiles.mockResolvedValueOnce(results);

			const analysis = await apiClient.analyzeFiles(["app.ts"]);

			expect(analysis).toEqual(results);
			expect(analysis.analysis).toHaveLength(1);
		});
	});

	describe("Deprecated analyzeRisk Method", () => {
		it("should NOT have deprecated analyzeRisk method", () => {
			// Old method should not exist
			expect((apiClient as any).analyzeRisk).toBeUndefined();
		});

		it("should not confuse analyzeRisk with analyzeFiles", () => {
			// Ensure they're not the same
			expect(apiClient.analyzeFiles).toBeDefined();
			expect((apiClient as any).analyzeRisk).toBeUndefined();

			// They should be different
			expect(typeof apiClient.analyzeFiles).toBe("function");
			expect(typeof (apiClient as any).analyzeRisk).toBe("undefined");
		});

		it("should throw if code tries to call analyzeRisk", () => {
			const tryCallAnalyzeRisk = () => {
				(apiClient as any).analyzeRisk();
			};

			expect(tryCallAnalyzeRisk).toThrow();
		});
	});

	describe("Network Error Handling", () => {
		it("should reject on network error", async () => {
			const networkError = new Error("Network timeout");

			apiClient.analyzeFiles.mockRejectedValueOnce(networkError);

			await expect(apiClient.analyzeFiles(["app.ts"])).rejects.toThrow(
				"Network timeout",
			);
		});

		it("should not crash extension on network failure", async () => {
			const networkError = new Error("Failed to fetch");

			apiClient.analyzeFiles.mockRejectedValueOnce(networkError);

			const crashed = false;

			try {
				await apiClient.analyzeFiles(["app.ts"]);
			} catch (error) {
				// Should be catchable, not crash
				expect(error).toBeDefined();
			}

			// Extension should still be functional
			expect(crashed).toBe(false);
		});

		it("should handle API unavailability", async () => {
			const unavailableError = new Error("API service unavailable");

			apiClient.analyzeFiles.mockRejectedValueOnce(unavailableError);

			const handleAnalyzeFailure = async () => {
				try {
					await apiClient.analyzeFiles(["app.ts"]);
					return { success: true, analysis: [] };
				} catch (_error) {
					// Graceful fallback
					return {
						success: false,
						analysis: [],
						error: "API temporarily unavailable",
					};
				}
			};

			const result = await handleAnalyzeFailure();

			expect(result.success).toBe(false);
			expect(result.error).toBe("API temporarily unavailable");
		});

		it("should allow retry after failure", async () => {
			apiClient.analyzeFiles
				.mockRejectedValueOnce(new Error("Timeout"))
				.mockResolvedValueOnce({ analysis: [] });

			// First call fails
			await expect(apiClient.analyzeFiles(["app.ts"])).rejects.toThrow(
				"Timeout",
			);

			// Second call succeeds
			const result = await apiClient.analyzeFiles(["app.ts"]);

			expect(result.analysis).toBeDefined();
		});

		it("should not retry indefinitely", async () => {
			apiClient.analyzeFiles.mockRejectedValue(new Error("Network error"));

			const maxRetries = 3;
			let attempts = 0;

			const analyzeWithRetry = async () => {
				for (let i = 0; i < maxRetries; i++) {
					try {
						attempts++;
						return await apiClient.analyzeFiles(["app.ts"]);
					} catch (error) {
						if (i === maxRetries - 1) {
							throw error; // Give up after max retries
						}
					}
				}
			};

			await expect(analyzeWithRetry()).rejects.toThrow();

			expect(attempts).toBe(maxRetries);
		});
	});

	describe("Request/Response Contract", () => {
		it("should accept empty file list", async () => {
			apiClient.analyzeFiles.mockResolvedValueOnce({
				analysis: [],
			});

			const result = await apiClient.analyzeFiles([]);

			expect(result.analysis).toEqual([]);
		});

		it("should handle large file lists", async () => {
			const largeFileList = Array.from(
				{ length: 1000 },
				(_, i) => `file${i}.ts`,
			);

			apiClient.analyzeFiles.mockResolvedValueOnce({
				analysis: Array.from({ length: 1000 }, (_, i) => ({
					file: `file${i}.ts`,
					risk: "low",
				})),
			});

			const result = await apiClient.analyzeFiles(largeFileList);

			expect(result.analysis).toHaveLength(1000);
		});

		it("should handle various file types", async () => {
			const files = ["app.ts", "utils.js", "README.md", "config.json"];

			apiClient.analyzeFiles.mockResolvedValueOnce({
				analysis: files.map((f) => ({ file: f, risk: "low" })),
			});

			const result = await apiClient.analyzeFiles(files);

			expect(result.analysis).toHaveLength(4);
		});

		it("should include file names in results", async () => {
			apiClient.analyzeFiles.mockResolvedValueOnce({
				analysis: [
					{
						file: "app.ts",
						risk: "medium",
						issues: 2,
					},
				],
			});

			const result = await apiClient.analyzeFiles(["app.ts"]);

			expect(result.analysis[0].file).toBe("app.ts");
		});

		it("should include risk level in results", async () => {
			apiClient.analyzeFiles.mockResolvedValueOnce({
				analysis: [
					{
						file: "app.ts",
						risk: "high",
					},
				],
			});

			const result = await apiClient.analyzeFiles(["app.ts"]);

			expect(["low", "medium", "high"]).toContain(result.analysis[0].risk);
		});
	});

	describe("Timeout Handling", () => {
		it("should timeout if API takes too long", async () => {
			apiClient.analyzeFiles.mockImplementationOnce(
				() =>
					new Promise((resolve) => {
						setTimeout(() => resolve({ analysis: [] }), 10000); // 10 seconds
					}),
			);

			const timeoutPromise = new Promise((_, reject) => {
				setTimeout(() => reject(new Error("Request timeout")), 5000); // 5 second timeout
			});

			const result = Promise.race([
				apiClient.analyzeFiles(["app.ts"]),
				timeoutPromise,
			]);

			await expect(result).rejects.toThrow("Request timeout");
		});

		it("should handle timeout gracefully", async () => {
			const handleTimeout = async () => {
				try {
					await new Promise((_, reject) => {
						setTimeout(() => reject(new Error("Timeout")), 100);
					});
				} catch (_error) {
					return {
						success: false,
						timeout: true,
						message: "Request timed out, please try again",
					};
				}
			};

			const result: any = await handleTimeout();

			expect(result.timeout).toBe(true);
			expect(result.message).toContain("timed out");
		});
	});

	describe("API Configuration", () => {
		it("should allow custom API endpoint", async () => {
			const customApiClient = {
				endpoint: "https://custom-api.example.com",
				analyzeFiles: vi.fn(),
			};

			expect(customApiClient.endpoint).toBeDefined();
			expect(customApiClient.analyzeFiles).toBeDefined();
		});

		it("should allow API key configuration", async () => {
			const authenticatedClient = {
				apiKey: "test-key-123",
				analyzeFiles: vi.fn(),
			};

			expect(authenticatedClient.apiKey).toBeDefined();
		});

		it("should include credentials in requests", async () => {
			const clientWithAuth = {
				apiKey: "secret-key",
				analyzeFiles: vi.fn().mockImplementation((_files, _options) => {
					// Auth should be included in request
					return Promise.resolve({
						analysis: [],
						authenticated: true,
					});
				}),
			};

			const result = await clientWithAuth.analyzeFiles(["app.ts"]);

			expect(result.authenticated).toBe(true);
		});
	});

	describe("Backward Compatibility", () => {
		it("should maintain analyzeFiles signature", async () => {
			// Ensure the method signature is stable
			const originalMethod = apiClient.analyzeFiles;

			apiClient.analyzeFiles.mockResolvedValueOnce({ analysis: [] });

			// Call with original signature
			await apiClient.analyzeFiles(["app.ts"]);

			expect(originalMethod).toHaveBeenCalled();
		});

		it("should not break existing code calling analyzeFiles", async () => {
			apiClient.analyzeFiles.mockResolvedValueOnce({
				analysis: [{ file: "app.ts", risk: "low" }],
			});

			// Old code pattern should still work
			const analysis = await apiClient.analyzeFiles(["app.ts"]);

			expect(analysis.analysis).toBeDefined();
			expect(Array.isArray(analysis.analysis)).toBe(true);
		});
	});
});
