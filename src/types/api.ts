/**
 * API and Event Type Definitions for SnapBack Extension
 */

/** Risk analysis result from Guardian or API */
export interface AnalysisResult {
	/** Risk score (0-10) */
	score: number;
	/** Risk severity level */
	severity: "low" | "medium" | "high" | "critical";
	/** Detected risk factors */
	factors: Array<{
		message?: string;
		type?: string;
	}>;
	/** Recommendations to mitigate risks */
	recommendations: string[];
	/** Human-readable risk level */
	riskLevel: string;
	/** Numeric risk score */
	riskScore: number;
}

/** Snapshot created event payload */
export interface SnapshotCreatedPayload {
	id: string;
	filePath: string;
	timestamp: number;
	metadata?: Record<string, unknown>;
}

/** Protection level changed event payload */
export interface ProtectionChangedPayload {
	filePath: string;
	level: "Watched" | "Warning" | "Protected";
	timestamp: number;
	reason?: string;
}

/** Session finalized event payload */
export interface SessionFinalizedPayload {
	sessionId: string;
	fileCount: number;
	reason: string;
	timestamp: number;
}

/** Iteration stats for AI editing tracking */
export interface IterationStats {
	filePath: string;
	consecutiveAIEdits: number;
	riskLevel: string;
	velocity: number;
	recommendation: string;
}

/** Protection level request */
export interface ProtectionLevelRequest {
	filePath: string;
}

/** Protection level response */
export interface ProtectionLevelResponse {
	filePath: string;
	isProtected: boolean;
	level: "Watched" | "Warning" | "Protected" | null;
}

/** Create snapshot request */
export interface CreateSnapshotRequest {
	filePath: string;
	reason?: string;
}

/** Create snapshot response */
export interface CreateSnapshotResponse {
	id: string;
	timestamp: number;
	meta: {
		source: string;
		reason?: string;
	};
}

/** Basic analysis result (fallback for offline mode) */
export interface BasicAnalysisResult {
	score: number;
	factors: string[];
	recommendations: string[];
	severity: string;
}

/** Type guard for AnalysisResult */
export function isAnalysisResult(value: unknown): value is AnalysisResult {
	return (
		typeof value === "object" &&
		value !== null &&
		"score" in value &&
		"severity" in value &&
		"factors" in value &&
		"recommendations" in value &&
		"riskLevel" in value &&
		"riskScore" in value
	);
}

/** Type guard for BasicAnalysisResult */
export function isBasicAnalysisResult(
	value: unknown,
): value is BasicAnalysisResult {
	return (
		typeof value === "object" &&
		value !== null &&
		"score" in value &&
		"severity" in value &&
		"factors" in value &&
		"recommendations" in value &&
		!("riskLevel" in value) // BasicAnalysisResult doesn't have riskLevel
	);
}
