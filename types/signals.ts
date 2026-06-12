/**
 * Signal Types for VSCode Extension
 *
 * LOCAL type definitions for thin client architecture.
 * Defines signal detection input/output types used by API clients.
 */

// =============================================================================
// AI DETECTION
// =============================================================================

export interface AiDetectionInput {
	content: string;
	filePath?: string;
	language?: string;
}

export interface AiDetectionOutput {
	isAiGenerated: boolean;
	confidence: number;
	tool?: string;
	reasoning?: string;
}

// =============================================================================
// BURST DETECTION
// =============================================================================

export interface BurstDetectionInput {
	events: Array<{ timestamp: number; filePath: string; changeSize: number }>;
	windowMs?: number;
}

export interface BurstDetectionOutput {
	isBurst: boolean;
	burstScore: number;
	eventCount: number;
	windowMs: number;
	velocity?: number;
}

// =============================================================================
// COMPLEXITY ANALYSIS
// =============================================================================

export interface ComplexityAnalysisInput {
	content: string;
	filePath?: string;
	language?: string;
}

export interface ComplexityAnalysisOutput {
	complexity: number;
	factors: string[];
	hotspots?: Array<{ line: number; reason: string }>;
}

// =============================================================================
// THREAT DETECTION
// =============================================================================

export interface ThreatDetectionInput {
	content: string;
	filePath?: string;
}

export interface ThreatDetectionOutput {
	threats: Array<{ type: string; severity: string; description: string; line?: number }>;
	riskScore: number;
	threatCount?: number;
}

// =============================================================================
// COMPREHENSIVE SIGNAL
// =============================================================================

export interface ComprehensiveSignalInput {
	content: string;
	filePath?: string;
	language?: string;
	events?: Array<{ timestamp: number; filePath: string; changeSize: number }>;
}

export interface ComprehensiveSignalOutput {
	ai: AiDetectionOutput;
	burst: BurstDetectionOutput;
	complexity: ComplexityAnalysisOutput;
	threats: ThreatDetectionOutput;
	overallRisk: number;
	riskLevel?: string;
	signals?: Record<string, unknown>;
}

// =============================================================================
// ATTRIBUTION
// =============================================================================

export interface AttributionRecord {
	id: string;
	userId: string;
	action: string;
	timestamp: number;
	metadata?: Record<string, unknown>;
}
