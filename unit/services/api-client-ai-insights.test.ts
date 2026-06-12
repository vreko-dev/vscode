/**
 * Tests for ApiClient.generateInsights
 *
 * Tests the AI insights generation for closing ceremonies.
 * Covers Pro-gated access, graceful degradation, and pre-fire pattern.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock SecureConfigService
vi.mock("../../../src/security/SecureConfigService", () => ({
	getSecureConfig: vi.fn(() => ({
		get: vi.fn().mockResolvedValue("sk-test-api-key"),
		set: vi.fn(),
	})),
}));

// Mock logger
vi.mock("../../../src/utils/logger", () => ({
	logger: {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}));

describe("ApiClient.generateInsights", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("with API key", () => {
		it("should call AI insights endpoint and return result", async () => {
			// ARRANGE - create mock adapter inside test
			const mockNetworkAdapter = {
				post: vi.fn().mockResolvedValue({
					ok: true,
					data: {
						summary: "Session focused on security patterns",
						whyItMatters: "Security improvements reduce vulnerability risk",
						topRisks: ["High fragile file count"],
						nextAction: "Review security patterns",
						insights: [],
						model: "gemini-2.0-flash",
						cached: false,
					},
				}),
				get: vi.fn().mockResolvedValue({ ok: true, data: {} }),
			};

			const input = {
				sessionId: "test-session-123",
				session: {
					mode: "ai-assisted",
					domains: ["security", "architecture"],
					violationCount: 3,
					scopeType: "monorepo",
				},
				patterns: {
					total: 14,
					byType: { "anti-pattern": 8, "best-practice": 6 },
					byDomain: { security: 9, architecture: 5 },
					avgConfidence: 0.74,
					regressionRate: 0.31,
				},
				query: { type: "synthesis" as const },
			};

			// ACT - import and create client inside test
			const { ApiClient } = await import("../../../src/services/api-client");
			const client = new ApiClient(mockNetworkAdapter as any);
			const result = await client.generateInsights(input);

			// ASSERT
			expect(mockNetworkAdapter.post).toHaveBeenCalled();
			expect(result).not.toBeNull();
			expect(result?.summary).toBe("Session focused on security patterns");
		});

		it("should return null on 403 (Pro required)", async () => {
			// ARRANGE
			const mockNetworkAdapter = {
				post: vi.fn().mockResolvedValue({
					ok: false,
					status: 403,
				}),
				get: vi.fn().mockResolvedValue({ ok: true, data: {} }),
			};

			// ACT
			const { ApiClient } = await import("../../../src/services/api-client");
			const client = new ApiClient(mockNetworkAdapter as any);
			const result = await client.generateInsights({
				sessionId: "test",
				session: { mode: "manual", domains: [], violationCount: 0, scopeType: "focused" },
				patterns: { total: 0, byType: {}, byDomain: {}, avgConfidence: 0, regressionRate: 0 },
				query: { type: "synthesis" },
			});

			// ASSERT
			expect(result).toBeNull();
		});

		it("should return null on network error", async () => {
			// ARRANGE
			const mockNetworkAdapter = {
				post: vi.fn().mockRejectedValue(new Error("Network error")),
				get: vi.fn().mockResolvedValue({ ok: true, data: {} }),
			};

			// ACT
			const { ApiClient } = await import("../../../src/services/api-client");
			const client = new ApiClient(mockNetworkAdapter as any);
			const result = await client.generateInsights({
				sessionId: "test",
				session: { mode: "manual", domains: [], violationCount: 0, scopeType: "focused" },
				patterns: { total: 0, byType: {}, byDomain: {}, avgConfidence: 0, regressionRate: 0 },
				query: { type: "synthesis" },
			});

			// ASSERT
			expect(result).toBeNull();
		});
	});

	describe("with session token (OAuth)", () => {
		it("should use Bearer token instead of API key", async () => {
			// ARRANGE
			const mockNetworkAdapter = {
				post: vi.fn().mockResolvedValue({
					ok: true,
					data: {
						summary: "Test",
						whyItMatters: "Test",
						topRisks: [],
						nextAction: "Test",
						insights: [],
						model: "test",
						cached: true,
					},
				}),
				get: vi.fn().mockResolvedValue({ ok: true, data: {} }),
			};

			// ACT
			const { ApiClient } = await import("../../../src/services/api-client");
			const client = new ApiClient(mockNetworkAdapter as any);
			await client.setSessionToken("oauth-access-token", "user@example.com");
			await client.generateInsights({
				sessionId: "test",
				session: { mode: "manual", domains: [], violationCount: 0, scopeType: "focused" },
				patterns: { total: 0, byType: {}, byDomain: {}, avgConfidence: 0, regressionRate: 0 },
				query: { type: "synthesis" },
			});

			// ASSERT
			expect(mockNetworkAdapter.post).toHaveBeenCalledWith(
				expect.stringContaining("/api/ai/generateInsights"),
				expect.any(Object),
				expect.objectContaining({ Authorization: "Bearer oauth-access-token" }),
			);
		});
	});
});
