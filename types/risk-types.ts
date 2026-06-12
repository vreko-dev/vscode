/**
 * @fileoverview Risk assessment type contracts for the Vreko extension.
 *
 * These types define the interface between the extension (thin client) and the
 * daemon's `risk/assess` IPC endpoint. Implementations MUST NOT compute risk
 * locally  -  all assessment is delegated to the daemon via DaemonBridge.request().
 *
 * Phase 2B: Extracted from aiRiskService.ts after RemoteAIRiskService and
 * NoopAIRiskService were removed in favour of daemon IPC delegation.
 */

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
	/** Category of change (e.g., "ai-generated") */
	category?: string;
}

/**
 * AI Risk Service interface
 *
 * The canonical implementation calls `daemonBridge.request<AIRiskAssessment>('risk/assess', ...)`
 * and falls back to `{ level: 'low', score: 0, confidence: 0.5, factors: [], timestamp }` on error.
 * Never instantiate RemoteAIRiskService or NoopAIRiskService  -  those classes are deleted.
 */
export interface AIRiskService {
	/**
	 * Assess risk of a code change
	 */
	assessChange(change: ChangeToAssess): Promise<AIRiskAssessment>;

	/**
	 * Get cached risk assessment for a file (implementations may return null)
	 */
	getCachedRisk(filePath: string): AIRiskAssessment | null;

	/**
	 * Clear cached risk for a file
	 */
	clearCache(filePath: string): void;
}
