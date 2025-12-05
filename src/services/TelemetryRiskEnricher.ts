/**
 * Telemetry Risk Factor Enricher
 *
 * Enriches raw risk factor identifiers with human-readable descriptions
 * using the SDK utility before telemetry transmission.
 *
 * This ensures consistent risk communication across all SnapBack platforms
 * and provides better observability for risk-related events.
 *
 * @module TelemetryRiskEnricher
 */

// REFACTOR: Import from centralized SDK utility
// This will be uncommented once SDK build is successful
// import { describeRiskFactors } from "@snapback/sdk";

/**
 * Local fallback implementation (will be removed in cleanup phase)
 * TODO: Once SDK is published, import describeRiskFactors from @snapback/sdk directly
 */
const RISK_FACTOR_DESCRIPTIONS: Record<string, string> = {
	"eval execution":
		"Dynamic code execution detected - eval() allows runtime code execution",
	"sql injection":
		"SQL injection vulnerability pattern - concatenated user input in queries",
	"command execution":
		"Dangerous shell command usage - potential OS command injection",
	"hardcoded secret":
		"Potential secret/credential found in code - API keys, tokens exposed",
	"auth bypass":
		"Authentication bypass pattern - insufficient access control checks",
	"path traversal":
		"Directory traversal vulnerability - unrestricted path access",
	"xss pattern":
		"Cross-site scripting vulnerability - unsanitized user input in DOM",
	deserialization:
		"Unsafe deserialization detected - potential object injection",
	cryptography:
		"Weak cryptography usage - deprecated algorithms or insufficient key length",
	"dependency change":
		"Dependency version change - verify no breaking changes or vulnerabilities",
};

/**
 * Enriches raw risk factor identifiers with descriptions
 *
 * This function will eventually import from @snapback/sdk once that package is built.
 * For now, it provides a local implementation that matches the SDK utility.
 *
 * @param factors - Array of raw risk factor identifiers (e.g., ["eval execution", "sql injection"])
 * @returns Array of human-readable descriptions in same order as input
 *
 * @example
 * ```typescript
 * const descriptions = enrichRiskFactors(["eval execution", "hardcoded secret"]);
 * // Returns: [
 * //   "Dynamic code execution detected...",
 * //   "Potential secret/credential found..."
 * // ]
 * ```
 */
export function enrichRiskFactors(factors: string[]): string[] {
	return factors.map(
		(factor) => RISK_FACTOR_DESCRIPTIONS[factor.toLowerCase()] || factor,
	);
}

/**
 * Telemetry enrichment properties added to risk detection events
 */
export interface RiskTelemetryEnrichment {
	/** Human-readable descriptions of detected risk factors */
	enrichedDescriptions: string[];
	/** Timestamp of enrichment (for audit trail) */
	enrichedAt?: number;
}

/**
 * Enriches a telemetry properties object with risk factor descriptions
 *
 * @param patterns - Raw risk factor identifiers from RiskAnalyzer
 * @returns Enrichment object with descriptions to spread into telemetry properties
 *
 * @example
 * ```typescript
 * const patterns = ["eval execution"];
 * const enrichment = createRiskEnrichment(patterns);
 *
 * telemetry.trackRiskDetected(riskLevel, patterns, confidence, enrichment);
 * ```
 */
export function createRiskEnrichment(
	patterns: string[],
): RiskTelemetryEnrichment {
	return {
		enrichedDescriptions: enrichRiskFactors(patterns),
		enrichedAt: Date.now(),
	};
}

/**
 * Type-safe risk detection event with enriched data
 */
export interface EnrichedRiskDetectionEvent {
	event: "risk.detected";
	properties: {
		riskLevel: string;
		patterns: string[];
		enrichedDescriptions: string[];
		confidence: number;
		enrichedAt: number;
		[key: string]: unknown;
	};
	timestamp: number;
}

/**
 * Validates that enrichment has been applied to an event
 *
 * @param properties - Telemetry event properties
 * @returns True if enrichment is present and valid
 */
export function hasRiskEnrichment(
	properties: Record<string, unknown>,
): properties is Record<string, unknown> & RiskTelemetryEnrichment {
	return (
		Array.isArray(properties.enrichedDescriptions) &&
		properties.enrichedDescriptions.length > 0 &&
		(properties.enrichedDescriptions as string[]).every(
			(desc) => typeof desc === "string" && desc.length > 0,
		)
	);
}
