/**
 * AI Insights Types
 *
 * Types for AI-powered insight generation in closing ceremonies.
 * Mirrors the schemas from apps/api/modules/ai/schemas.ts
 *
 * @module types/ai-insights
 */

// =============================================================================
// Insight Types
// =============================================================================

/**
 * Single insight returned by the AI.
 */
export interface AIInsight {
	type: "warning" | "suggestion" | "synthesis" | "prediction";
	title: string;
	body: string;
	confidence: number;
	domain?: string;
}

/**
 * Response from AI insight generation.
 */
export interface AIInsights {
	summary: string;
	whyItMatters: string;
	topRisks: string[];
	nextAction: string;
	insights: AIInsight[];
	model: string;
	cached: boolean;
}

// =============================================================================
// Input Types
// =============================================================================

/**
 * Input for AI insight generation.
 * Contains anonymized session metadata - no code, no file paths.
 */
export interface AIInsightsInput {
	sessionId: string;
	session: {
		mode: string;
		domains: string[];
		violationCount: number;
		scopeType: string;
	};
	patterns: {
		total: number;
		byType: Record<string, number>;
		byDomain: Record<string, number>;
		avgConfidence: number;
		regressionRate: number;
	};
	query: {
		type: "synthesis" | "diagnostic" | "prediction";
	};
}
