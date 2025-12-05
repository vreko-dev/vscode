/**
 * @fileoverview AI Risk Service - Abstraction for risk assessment
 *
 * Provides a pluggable interface for AI code change risk assessment:
 * - Noop implementation: Always returns low risk (disabled mode)
 * - Remote implementation: Calls backend API for analysis
 *
 * Phase 2 Slice 4: Extracted from AnalysisCoordinator to enable testability
 * and pluggable risk backends
 */

import { logger } from "../utils/logger.js";

/**
 * AI risk level classification
 */
export type AIRiskLevel = "low" | "medium" | "high";

/**
 * Assessment from AI risk analysis
 */
export interface AIRiskAssessment {
	/** Risk level classification */
	level: AIRiskLevel;
	/** Risk score 0-100 */
	score: number;
	/** Confidence in assessment 0-1 */
	confidence: number;
	/** Risk factors that contributed to score */
	factors: string[];
	/** When assessment was computed */
	timestamp: number;
}

/**
 * Change details for risk assessment
 */
export interface ChangeToAssess {
	/** Absolute file path */
	filePath: string;
	/** Content before change */
	before: string;
	/** Content after change */
	after: string;
	/** Category of change (e.g., "ai-generated") */
	category?: string;
}

/**
 * AI Risk Service interface
 * Defines contract for risk assessment backends
 */
export interface AIRiskService {
	/**
	 * Assess risk of a code change
	 * @param change Change details to assess
	 * @returns Risk assessment result
	 */
	assessChange(change: ChangeToAssess): Promise<AIRiskAssessment>;

	/**
	 * Get cached risk assessment for a file
	 * @param filePath File to check cache for
	 * @returns Cached assessment or null if not in cache
	 */
	getCachedRisk(filePath: string): AIRiskAssessment | null;

	/**
	 * Clear cached risk for a file
	 * @param filePath File to clear cache for
	 */
	clearCache(filePath: string): void;
}

/**
 * No-op AI Risk Service
 * Always returns low risk - used when risk assessment is disabled
 *
 * This implementation:
 * - Has no side effects
 * - Makes no network calls
 * - Serves as the default/fallback implementation
 */
export class NoopAIRiskService implements AIRiskService {
	async assessChange(_change: ChangeToAssess): Promise<AIRiskAssessment> {
		return {
			level: "low",
			score: 0,
			confidence: 1,
			factors: [],
			timestamp: Date.now(),
		};
	}

	getCachedRisk(_filePath: string): AIRiskAssessment | null {
		return null;
	}

	clearCache(_filePath: string): void {
		// No-op
	}
}

/**
 * Remote AI Risk Service
 * Calls backend API for risk analysis with caching
 *
 * Responsibilities:
 * - Map API responses to AIRiskAssessment
 * - Implement in-memory cache with TTL
 * - Handle API failures gracefully (fall back to low risk)
 * - Respect configuration for enabled/disabled state
 */
export class RemoteAIRiskService implements AIRiskService {
	/** Cache with TTL (5 minutes) */
	private cache = new Map<
		string,
		{ assessment: AIRiskAssessment; expiresAt: number }
	>();
	private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

	constructor(
		private apiClient: any,
		private config: any,
	) {}

	async assessChange(change: ChangeToAssess): Promise<AIRiskAssessment> {
		// Check if risk assessment is disabled in config
		const enabled = this.config.get("snapback.guardian.enabled", true);
		if (!enabled) {
			return {
				level: "low",
				score: 0,
				confidence: 1,
				factors: [],
				timestamp: Date.now(),
			};
		}

		try {
			// Call API for risk analysis using analyzeFiles (analyzeRisk method doesn't exist)
			const apiResponse = await this.apiClient.analyzeFiles([
				{
					path: change.filePath,
					content: change.after,
				},
			]);

			// Map API response to our assessment type
			const assessment = this.mapApiResponse(apiResponse);
			logger.debug("AI risk assessment completed", {
				filePath: change.filePath,
				level: assessment.level,
				score: assessment.score,
			});

			// Cache the result
			this.cache.set(change.filePath, {
				assessment,
				expiresAt: Date.now() + this.CACHE_TTL_MS,
			});

			return assessment;
		} catch (error) {
			logger.error("Failed to assess AI risk via API", error as Error);

			// Fall back to low risk on error
			return {
				level: "low",
				score: 0,
				confidence: 0.5, // Lower confidence for fallback
				factors: [],
				timestamp: Date.now(),
			};
		}
	}

	getCachedRisk(filePath: string): AIRiskAssessment | null {
		const cached = this.cache.get(filePath);

		if (!cached) {
			return null;
		}

		// Check if cache is expired
		if (Date.now() > cached.expiresAt) {
			this.cache.delete(filePath);
			return null;
		}

		return cached.assessment;
	}

	clearCache(filePath: string): void {
		this.cache.delete(filePath);
	}

	/**
	 * Map API response shape to AIRiskAssessment
	 * Handles both old and new API response formats
	 */
	private mapApiResponse(response: any): AIRiskAssessment {
		if (!response || typeof response !== "object") {
			logger.warn("Invalid API response for risk analysis", { response });
			return {
				level: "low",
				score: 0,
				confidence: 0.5,
				factors: [],
				timestamp: Date.now(),
			};
		}

		// Extract fields from API response
		const riskLevel = response.riskLevel || response.level || "low";
		const riskScore = response.riskScore || response.score || 0;
		const confidence = response.confidence ?? 0.8;
		const riskFactors = response.riskFactors || response.factors || [];

		// Normalize risk level to our enum
		let level: AIRiskLevel = "low";
		if (typeof riskLevel === "string") {
			const normalized = riskLevel.toLowerCase();
			if (normalized === "high") {
				level = "high";
			} else if (normalized === "medium") {
				level = "medium";
			}
		}

		// Ensure factors is an array of strings
		const factors = Array.isArray(riskFactors)
			? riskFactors.map((f) => (typeof f === "string" ? f : String(f)))
			: [];

		return {
			level,
			score: typeof riskScore === "number" ? riskScore : 0,
			confidence:
				typeof confidence === "number"
					? Math.min(1, Math.max(0, confidence))
					: 0.8,
			factors,
			timestamp: Date.now(),
		};
	}
}
