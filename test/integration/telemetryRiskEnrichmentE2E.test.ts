/**
 * E2E Integration Tests: Risk Factor Enrichment Through Telemetry Pipeline
 *
 * Tests the complete flow of risk detection → enrichment → telemetry transmission,
 * verifying that human-readable descriptions flow through the entire system.
 *
 * @module E2E Telemetry Risk Enrichment Tests
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
	createRiskEnrichment,
	hasRiskEnrichment,
} from "../../src/services/TelemetryRiskEnricher";

/**
 * E2E Scenario 1: Risk Detection → Enrichment → Telemetry
 *
 * This test verifies the complete pipeline from risk detection through
 * telemetry transmission with enriched descriptions.
 */
describe("E2E: Risk Detection to Telemetry Pipeline", () => {
	interface MockRiskAnalysisResult {
		score: number;
		severity: "low" | "medium" | "high" | "critical";
		factors: Array<{ type: string; message: string }>;
		recommendations: string[];
	}

	interface MockTelemetryEvent {
		event: string;
		properties: Record<string, unknown>;
		timestamp: number;
	}

	let capturedEvents: MockTelemetryEvent[] = [];
	let mockTelemetryClient: {
		trackEvent: (event: MockTelemetryEvent) => void;
	};

	beforeEach(() => {
		capturedEvents = [];
		mockTelemetryClient = {
			trackEvent: (event: MockTelemetryEvent) => {
				capturedEvents.push(event);
			},
		};
	});

	it("should enrich risk factors detected by analyzer before telemetry transmission", () => {
		// STEP 1: Simulate RiskAnalyzer output
		const riskAnalysisResult: MockRiskAnalysisResult = {
			score: 8.5,
			severity: "critical",
			factors: [
				{ type: "eval execution", message: "eval() call detected" },
				{ type: "sql injection", message: "SQL concatenation pattern" },
				{ type: "hardcoded secret", message: "API key in code" },
			],
			recommendations: ["Review code for security issues"],
		};

		// STEP 2: Extract factor types and enrich with descriptions
		const factorTypes = riskAnalysisResult.factors.map((f) => f.type);
		const enrichment = createRiskEnrichment(factorTypes);

		// STEP 3: Create telemetry event with enrichment
		const telemetryEvent: MockTelemetryEvent = {
			event: "risk.detected",
			properties: {
				riskLevel: riskAnalysisResult.severity,
				patterns: factorTypes,
				confidence: 0.92,
				...enrichment,
			},
			timestamp: Date.now(),
		};

		// STEP 4: Track telemetry
		mockTelemetryClient.trackEvent(telemetryEvent);

		// VERIFICATION: Check complete event structure
		expect(capturedEvents).toHaveLength(1);
		const event = capturedEvents[0];

		// Raw patterns preserved
		expect(event.properties.patterns).toEqual([
			"eval execution",
			"sql injection",
			"hardcoded secret",
		]);

		// Enriched descriptions added
		expect(event.properties.enrichedDescriptions).toHaveLength(3);
		expect((event.properties.enrichedDescriptions as string[])[0]).toContain(
			"Dynamic code execution",
		);
		expect((event.properties.enrichedDescriptions as string[])[1]).toContain(
			"SQL injection",
		);
		expect((event.properties.enrichedDescriptions as string[])[2]).toContain(
			"Potential secret",
		);

		// Enrichment timestamp present
		expect(event.properties.enrichedAt).toBeDefined();
		expect(typeof event.properties.enrichedAt).toBe("number");

		// Original properties preserved
		expect(event.properties.riskLevel).toBe("critical");
		expect(event.properties.confidence).toBe(0.92);
	});

	it("should handle unknown risk factors gracefully in enrichment", () => {
		const mixedFactors = [
			"eval execution",
			"unknown_future_pattern",
			"sql injection",
		];
		const enrichment = createRiskEnrichment(mixedFactors);

		const telemetryEvent: MockTelemetryEvent = {
			event: "risk.detected",
			properties: {
				riskLevel: "high",
				patterns: mixedFactors,
				confidence: 0.85,
				...enrichment,
			},
			timestamp: Date.now(),
		};

		mockTelemetryClient.trackEvent(telemetryEvent);

		expect(capturedEvents).toHaveLength(1);
		const event = capturedEvents[0];
		const descriptions = event.properties.enrichedDescriptions as string[];

		// Known factors have descriptions
		expect(descriptions[0]).toContain("Dynamic code execution");
		expect(descriptions[2]).toContain("SQL injection");

		// Unknown factor falls back to original identifier
		expect(descriptions[1]).toBe("unknown_future_pattern");

		// All patterns preserved
		expect(event.properties.patterns).toEqual(mixedFactors);
	});

	it("should validate enrichment before transmission", () => {
		const enrichment = createRiskEnrichment(["eval execution"]);

		const enrichmentAsRecord = enrichment as unknown as Record<string, unknown>;
		expect(hasRiskEnrichment(enrichmentAsRecord)).toBe(true);

		const invalidEnrichment = { enrichedDescriptions: [] };
		expect(hasRiskEnrichment(invalidEnrichment)).toBe(false);

		const malformedEnrichment = { enrichedDescriptions: [123] };
		expect(hasRiskEnrichment(malformedEnrichment)).toBe(false);
	});
});

/**
 * E2E Scenario 2: Multiple Risk Events with Enrichment
 *
 * Verifies enrichment works consistently across multiple risk detection events.
 */
describe("E2E: Multiple Risk Events with Enrichment", () => {
	interface MockTelemetryEvent {
		event: string;
		properties: Record<string, unknown>;
		timestamp: number;
	}

	let capturedEvents: MockTelemetryEvent[] = [];

	beforeEach(() => {
		capturedEvents = [];
	});

	it("should enrich multiple sequential risk detection events", () => {
		// Simulate monitoring session with multiple risk detections
		const riskScenarios = [
			{
				factors: ["eval execution"],
				riskLevel: "high",
				confidence: 0.95,
			},
			{
				factors: ["sql injection", "command execution"],
				riskLevel: "critical",
				confidence: 0.88,
			},
			{
				factors: ["hardcoded secret", "path traversal"],
				riskLevel: "high",
				confidence: 0.72,
			},
			{
				factors: ["xss pattern"],
				riskLevel: "medium",
				confidence: 0.65,
			},
		];

		// Process each scenario
		riskScenarios.forEach((scenario) => {
			const enrichment = createRiskEnrichment(scenario.factors);
			const event: MockTelemetryEvent = {
				event: "risk.detected",
				properties: {
					riskLevel: scenario.riskLevel,
					patterns: scenario.factors,
					confidence: scenario.confidence,
					...enrichment,
				},
				timestamp: Date.now(),
			};
			capturedEvents.push(event);
		});

		// Verify all events captured and enriched
		expect(capturedEvents).toHaveLength(4);

		// Check each event has correct enrichment
		expect(capturedEvents[0].properties.enrichedDescriptions).toHaveLength(1);
		expect(capturedEvents[1].properties.enrichedDescriptions).toHaveLength(2);
		expect(capturedEvents[2].properties.enrichedDescriptions).toHaveLength(2);
		expect(capturedEvents[3].properties.enrichedDescriptions).toHaveLength(1);

		// Verify consistency: descriptions match patterns
		capturedEvents.forEach((event) => {
			const patterns = event.properties.patterns as string[];
			const descriptions = event.properties.enrichedDescriptions as string[];

			expect(descriptions).toHaveLength(patterns.length);
			descriptions.forEach((desc) => {
				expect(desc.length).toBeGreaterThan(0);
			});
		});
	});

	it("should maintain enrichment audit trail with timestamps", () => {
		const beforeTime = Date.now();
		const enrichment = createRiskEnrichment(["sql injection"]);
		const afterTime = Date.now();

		expect(enrichment.enrichedAt).toBeDefined();
		expect((enrichment.enrichedAt as number) >= beforeTime).toBe(true);
		expect((enrichment.enrichedAt as number) <= afterTime).toBe(true);
	});
});

/**
 * E2E Scenario 3: Risk Enrichment with Event Validation
 *
 * Ensures enriched events pass validation before transmission.
 */
describe("E2E: Risk Enrichment Validation", () => {
	interface RiskDetectionEvent {
		event: "risk.detected";
		properties: {
			riskLevel: string;
			patterns: string[];
			enrichedDescriptions: string[];
			confidence: number;
			enrichedAt: number;
		};
		timestamp: number;
	}

	it("should validate enriched event structure before transmission", () => {
		const factors = ["eval execution", "sql injection"];
		const enrichment = createRiskEnrichment(factors);

		const event = {
			event: "risk.detected",
			properties: {
				riskLevel: "high",
				patterns: factors,
				confidence: 0.9,
				enrichedDescriptions: enrichment.enrichedDescriptions,
				enrichedAt: enrichment.enrichedAt || Date.now(),
			},
			timestamp: Date.now(),
		};

		// Validate event structure
		expect(event.event).toBe("risk.detected");
		expect(Array.isArray(event.properties.patterns)).toBe(true);
		expect(Array.isArray(event.properties.enrichedDescriptions)).toBe(true);
		expect(event.properties.patterns.length).toBe(
			event.properties.enrichedDescriptions.length,
		);

		// Validate enrichment completeness
		expect(
			(event.properties.enrichedDescriptions as string[]).every(
				(desc: string) => typeof desc === "string" && desc.length > 0,
			),
		).toBe(true);
	});

	it("should preserve event metadata during enrichment", () => {
		const customMetadata = {
			userId: "user_12345",
			sessionId: "session_67890",
			source: "vscode_extension",
		};

		const factors = ["hardcoded secret"];
		const enrichment = createRiskEnrichment(factors);

		const event = {
			event: "risk.detected",
			properties: {
				riskLevel: "high",
				patterns: factors,
				confidence: 0.92,
				...enrichment,
				...customMetadata,
			},
			timestamp: Date.now(),
		};

		// Verify custom metadata preserved
		expect(event.properties.userId).toBe("user_12345");
		expect(event.properties.sessionId).toBe("session_67890");
		expect(event.properties.source).toBe("vscode_extension");

		// Verify enrichment still present
		expect(event.properties.enrichedDescriptions).toBeDefined();
		expect(Array.isArray(event.properties.enrichedDescriptions)).toBe(true);
	});
});
