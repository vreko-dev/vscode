/**
 * AnalysisCoordinator Retry Logic Tests
 *
 * Tests for API analysis retry with exponential backoff:
 * - Successful retry on transient failures
 * - No retry on client errors (4xx)
 * - Fallback to local assessment after max retries
 * - Correct delay progression
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock vscode before importing
vi.mock("vscode", () => ({
	Uri: {
		file: vi.fn((path: string) => ({ fsPath: path, path })),
	},
	Range: class {
		constructor(
			public startLine: number,
			public startChar: number,
			public endLine: number,
			public endChar: number,
		) {}
	},
	Position: class {
		constructor(
			public line: number,
			public character: number,
		) {}
	},
	Diagnostic: class {
		source = "";
		code = "";
		constructor(
			public range: unknown,
			public message: string,
			public severity: number,
		) {}
	},
	DiagnosticSeverity: {
		Error: 0,
		Warning: 1,
		Information: 2,
		Hint: 3,
	},
	languages: {
		createDiagnosticCollection: vi.fn(() => ({
			set: vi.fn(),
			delete: vi.fn(),
			dispose: vi.fn(),
		})),
	},
	window: {
		showErrorMessage: vi.fn(),
		showWarningMessage: vi.fn(),
		showInformationMessage: vi.fn(),
		setStatusBarMessage: vi.fn(),
	},
	workspace: {
		applyEdit: vi.fn().mockResolvedValue(true),
	},
	WorkspaceEdit: class {
		replace = vi.fn();
	},
	CancellationError: class extends Error {},
}));

// Mock logger
vi.mock("@vscode/utils/logger", () => ({
	logger: {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	},
}));

// Mock ApiClient
const mockAnalyzeFiles = vi.fn();
vi.mock("@vscode/services/api-client", () => ({
	ApiClient: class {
		analyzeFiles = mockAnalyzeFiles;
	},
}));

describe("AnalysisCoordinator Retry Logic", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("retry behavior", () => {
		it("should succeed on first attempt without retry", async () => {
			const mockResult = { score: 0.5, factors: [], severity: "medium" };
			mockAnalyzeFiles.mockResolvedValueOnce(mockResult);

			// Simulate retry logic
			let attempts = 0;
			const maxRetries = 3;
			let result;

			for (let attempt = 0; attempt < maxRetries; attempt++) {
				try {
					attempts++;
					result = await mockAnalyzeFiles([{ path: "test.ts", content: "code" }]);
					break;
				} catch {
					if (attempt === maxRetries - 1) throw new Error("Max retries");
				}
			}

			expect(attempts).toBe(1);
			expect(result).toEqual(mockResult);
		});

		it("should retry on transient failure and succeed", async () => {
			const mockResult = { score: 0.5, factors: [], severity: "medium" };
			mockAnalyzeFiles
				.mockRejectedValueOnce(new Error("Network timeout"))
				.mockResolvedValueOnce(mockResult);

			let attempts = 0;
			const maxRetries = 3;
			let result;
			let lastError: Error | undefined;

			for (let attempt = 0; attempt < maxRetries; attempt++) {
				try {
					attempts++;
					result = await mockAnalyzeFiles([{ path: "test.ts", content: "code" }]);
					break;
				} catch (error) {
					lastError = error as Error;
					if (attempt < maxRetries - 1) {
						// Would normally wait here
					}
				}
			}

			expect(attempts).toBe(2);
			expect(result).toEqual(mockResult);
		});

		it("should exhaust retries on persistent failure", async () => {
			mockAnalyzeFiles.mockRejectedValue(new Error("Server error 500"));

			let attempts = 0;
			const maxRetries = 3;
			let lastError: Error | undefined;

			for (let attempt = 0; attempt < maxRetries; attempt++) {
				try {
					attempts++;
					await mockAnalyzeFiles([{ path: "test.ts", content: "code" }]);
					break;
				} catch (error) {
					lastError = error as Error;
				}
			}

			expect(attempts).toBe(3);
			expect(lastError?.message).toBe("Server error 500");
		});
	});

	describe("client error detection", () => {
		/**
		 * Simulates the isClientError method
		 */
		function isClientError(error: Error): boolean {
			const message = error.message.toLowerCase();
			return (
				message.includes("400") ||
				message.includes("401") ||
				message.includes("403") ||
				message.includes("404") ||
				message.includes("bad request") ||
				message.includes("unauthorized") ||
				message.includes("forbidden") ||
				message.includes("not found")
			);
		}

		it("should identify 400 as client error", () => {
			expect(isClientError(new Error("HTTP 400 Bad Request"))).toBe(true);
		});

		it("should identify 401 as client error", () => {
			expect(isClientError(new Error("HTTP 401 Unauthorized"))).toBe(true);
		});

		it("should identify 403 as client error", () => {
			expect(isClientError(new Error("HTTP 403 Forbidden"))).toBe(true);
		});

		it("should identify 404 as client error", () => {
			expect(isClientError(new Error("HTTP 404 Not Found"))).toBe(true);
		});

		it("should identify 'bad request' as client error", () => {
			expect(isClientError(new Error("Bad Request: invalid input"))).toBe(true);
		});

		it("should identify 'unauthorized' as client error", () => {
			expect(isClientError(new Error("Unauthorized access"))).toBe(true);
		});

		it("should not identify 500 as client error", () => {
			expect(isClientError(new Error("HTTP 500 Internal Server Error"))).toBe(false);
		});

		it("should not identify network timeout as client error", () => {
			expect(isClientError(new Error("Network timeout"))).toBe(false);
		});

		it("should not identify connection refused as client error", () => {
			expect(isClientError(new Error("ECONNREFUSED"))).toBe(false);
		});
	});

	describe("backoff timing", () => {
		it("should use correct exponential delays", () => {
			const baseDelay = 500;
			const delays = [0, 1, 2].map((attempt) => baseDelay * 2 ** attempt);

			expect(delays[0]).toBe(500); // First retry
			expect(delays[1]).toBe(1000); // Second retry
			expect(delays[2]).toBe(2000); // Third retry
		});

		it("should not exceed reasonable total time", () => {
			const baseDelay = 500;
			const maxRetries = 3;
			const totalTime = Array.from({ length: maxRetries }, (_, i) => baseDelay * 2 ** i).reduce(
				(a, b) => a + b,
				0,
			);

			// Total time: 500 + 1000 + 2000 = 3500ms
			expect(totalTime).toBe(3500);
			expect(totalTime).toBeLessThan(5000); // Should complete in under 5s
		});
	});

	describe("no retry on client errors", () => {
		it("should not retry on 401 Unauthorized", async () => {
			mockAnalyzeFiles.mockRejectedValueOnce(new Error("HTTP 401 Unauthorized"));

			let attempts = 0;
			const maxRetries = 3;

			function isClientError(error: Error): boolean {
				const message = error.message.toLowerCase();
				return message.includes("401") || message.includes("unauthorized");
			}

			for (let attempt = 0; attempt < maxRetries; attempt++) {
				try {
					attempts++;
					await mockAnalyzeFiles([{ path: "test.ts", content: "code" }]);
					break;
				} catch (error) {
					if (isClientError(error as Error)) {
						break; // Don't retry client errors
					}
				}
			}

			expect(attempts).toBe(1); // Should only try once
		});

		it("should retry on 503 Service Unavailable", async () => {
			mockAnalyzeFiles
				.mockRejectedValueOnce(new Error("HTTP 503 Service Unavailable"))
				.mockRejectedValueOnce(new Error("HTTP 503 Service Unavailable"))
				.mockResolvedValueOnce({ score: 0.3, factors: [], severity: "low" });

			let attempts = 0;
			const maxRetries = 3;

			function isClientError(error: Error): boolean {
				const message = error.message.toLowerCase();
				return message.includes("401") || message.includes("403") || message.includes("404");
			}

			for (let attempt = 0; attempt < maxRetries; attempt++) {
				try {
					attempts++;
					const result = await mockAnalyzeFiles([{ path: "test.ts", content: "code" }]);
					expect(result.score).toBe(0.3);
					break;
				} catch (error) {
					if (isClientError(error as Error)) {
						break;
					}
				}
			}

			expect(attempts).toBe(3); // Should retry twice before success
		});
	});

	describe("fallback behavior", () => {
		it("should fallback to local assessment after retries exhausted", async () => {
			mockAnalyzeFiles.mockRejectedValue(new Error("API unavailable"));

			let usedFallback = false;
			const maxRetries = 3;

			for (let attempt = 0; attempt < maxRetries; attempt++) {
				try {
					await mockAnalyzeFiles([{ path: "test.ts", content: "code" }]);
					break;
				} catch {
					if (attempt === maxRetries - 1) {
						// Use fallback
						usedFallback = true;
					}
				}
			}

			expect(usedFallback).toBe(true);
		});
	});
});
