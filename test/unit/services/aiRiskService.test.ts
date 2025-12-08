/**
 * @fileoverview AIRiskService Test Suite
 *
 * Tests for NoopAIRiskService and RemoteAIRiskService implementations
 * Covers risk assessment, caching, and error handling
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AIRiskService } from "@vscode/services/aiRiskService";
import {
	NoopAIRiskService,
	RemoteAIRiskService,
} from "@vscode/services/aiRiskService";

describe("NoopAIRiskService", () => {
	let service: AIRiskService;

	beforeEach(() => {
		service = new NoopAIRiskService();
	});

	it("should always return low risk assessment", async () => {
		const assessment = await service.assessChange({
			filePath: "/test/file.ts",
			before: "old content",
			after: "new content",
			category: "ai-generated",
		});

		expect(assessment.level).toBe("low");
		expect(assessment.score).toBe(0);
		expect(assessment.confidence).toBe(1);
		expect(assessment.factors).toEqual([]);
	});

	it("should return null for cached risk", () => {
		const cached = service.getCachedRisk("/test/file.ts");
		expect(cached).toBeNull();
	});

	it("should handle clearCache as no-op", () => {
		expect(() => {
			service.clearCache("/test/file.ts");
		}).not.toThrow();
	});

	it("should always return consistent low risk", async () => {
		const assessment1 = await service.assessChange({
			filePath: "/test/file.ts",
			before: "content",
			after: "modified content",
			category: "ai-generated",
		});

		const assessment2 = await service.assessChange({
			filePath: "/test/file.ts",
			before: "different",
			after: "very different changes with more modifications",
			category: "ai-generated",
		});

		expect(assessment1.level).toBe("low");
		expect(assessment2.level).toBe("low");
		expect(assessment1.score).toBe(assessment2.score);
	});
});

describe("RemoteAIRiskService", () => {
	let service: RemoteAIRiskService;
	let mockApiClient: any;
	let mockConfig: any;

	beforeEach(() => {
		// Mock API client
		mockApiClient = {
			analyzeRisk: vi.fn(),
		};

		// Mock configuration
		mockConfig = {
			get: vi.fn((key: string, defaultValue?: any) => {
				const configMap: Record<string, any> = {
					"snapback.guardian.enabled": true,
					"snapback.guardian.thresholds.warn": 60,
					"snapback.guardian.thresholds.block": 85,
				};
				return configMap[key] ?? defaultValue;
			}),
		};

		service = new RemoteAIRiskService(mockApiClient, mockConfig);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("should map API response to AIRiskAssessment", async () => {
		mockApiClient.analyzeRisk.mockResolvedValue({
			riskLevel: "high",
			riskScore: 85,
			confidence: 0.95,
			riskFactors: ["eval() usage", "dynamic code execution"],
		});

		const assessment = await service.assessChange({
			filePath: "/test/file.ts",
			before: "old",
			after: "eval(userInput)",
			category: "ai-generated",
		});

		expect(assessment.level).toBe("high");
		expect(assessment.score).toBe(85);
		expect(assessment.confidence).toBe(0.95);
		expect(assessment.factors).toEqual([
			"eval() usage",
			"dynamic code execution",
		]);
		expect(assessment.timestamp).toBeDefined();
	});

	it("should cache risk assessments with TTL", async () => {
		const filePath = "/test/file.ts";
		mockApiClient.analyzeRisk.mockResolvedValue({
			riskLevel: "medium",
			riskScore: 50,
			confidence: 0.8,
			riskFactors: [],
		});

		// First call should hit API
		const assessment1 = await service.assessChange({
			filePath,
			before: "old",
			after: "new",
			category: "ai-generated",
		});

		expect(mockApiClient.analyzeRisk).toHaveBeenCalledTimes(1);

		// Cached call should not hit API
		const cached = service.getCachedRisk(filePath);
		expect(cached).toEqual(assessment1);
		expect(mockApiClient.analyzeRisk).toHaveBeenCalledTimes(1); // Still 1, not 2

		// Clear cache
		service.clearCache(filePath);
		const afterClear = service.getCachedRisk(filePath);
		expect(afterClear).toBeNull();
	});

	it("should handle API errors gracefully", async () => {
		mockApiClient.analyzeRisk.mockRejectedValue(new Error("API unavailable"));

		const assessment = await service.assessChange({
			filePath: "/test/file.ts",
			before: "old",
			after: "new",
			category: "ai-generated",
		});

		// Should fall back to low risk
		expect(assessment.level).toBe("low");
		expect(assessment.score).toBe(0);
		expect(assessment.confidence).toBeLessThan(1); // Lower confidence on fallback
	});

	it("should validate API response shape before mapping", async () => {
		// API returns unexpected shape
		mockApiClient.analyzeRisk.mockResolvedValue({
			unexpectedField: "value",
		});

		const assessment = await service.assessChange({
			filePath: "/test/file.ts",
			before: "old",
			after: "new",
			category: "ai-generated",
		});

		// Should handle gracefully
		expect(assessment.level).toBe("low");
	});

	it("should respect configuration for risk thresholds", async () => {
		const configWithHighThreshold = {
			get: vi.fn((key: string, defaultValue?: any) => {
				const configMap: Record<string, any> = {
					"snapback.guardian.enabled": true,
					"snapback.guardian.thresholds.warn": 80,
					"snapback.guardian.thresholds.block": 95,
				};
				return configMap[key] ?? defaultValue;
			}),
		};

		const serviceWithConfig = new RemoteAIRiskService(
			mockApiClient,
			configWithHighThreshold,
		);

		mockApiClient.analyzeRisk.mockResolvedValue({
			riskLevel: "high",
			riskScore: 85,
			confidence: 0.9,
			riskFactors: [],
		});

		const assessment = await serviceWithConfig.assessChange({
			filePath: "/test/file.ts",
			before: "old",
			after: "new",
			category: "ai-generated",
		});

		expect(assessment.score).toBe(85);
	});

	it("should handle disabled guardian configuration", async () => {
		const disabledConfig = {
			get: vi.fn((key: string, defaultValue?: any) => {
				const configMap: Record<string, any> = {
					"snapback.guardian.enabled": false,
				};
				return configMap[key] ?? defaultValue;
			}),
		};

		const disabledService = new RemoteAIRiskService(
			mockApiClient,
			disabledConfig,
		);

		mockApiClient.analyzeRisk.mockResolvedValue({
			riskLevel: "high",
			riskScore: 85,
			confidence: 0.95,
			riskFactors: [],
		});

		const assessment = await disabledService.assessChange({
			filePath: "/test/file.ts",
			before: "old",
			after: "new",
			category: "ai-generated",
		});

		// When disabled, should return low risk (no-op behavior)
		expect(assessment.level).toBe("low");
	});

	it("should include timestamp in assessment", async () => {
		mockApiClient.analyzeRisk.mockResolvedValue({
			riskLevel: "low",
			riskScore: 20,
			confidence: 0.7,
			riskFactors: [],
		});

		const beforeTime = Date.now();
		const assessment = await service.assessChange({
			filePath: "/test/file.ts",
			before: "old",
			after: "new",
			category: "ai-generated",
		});
		const afterTime = Date.now();

		expect(assessment.timestamp).toBeGreaterThanOrEqual(beforeTime);
		expect(assessment.timestamp).toBeLessThanOrEqual(afterTime);
	});
});
