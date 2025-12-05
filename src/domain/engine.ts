import type {
	AutoDecisionConfig,
	DecisionReason,
	ProtectionDecision,
	SaveContext,
} from "./types";
import { DEFAULT_CONFIG } from "./types";

/**
 * AutoDecisionEngine
 *
 * Core decision logic that combines multiple detection signals:
 * - AI presence detection (confidence 0-1)
 * - Risk scoring (0-100)
 * - Burst detection (file velocity)
 * - Session tracking (file accumulation)
 * - Critical file patterns
 *
 * Outputs a deterministic ProtectionDecision based on signal aggregation.
 */
export class AutoDecisionEngine {
	private config: AutoDecisionConfig;

	constructor(config: AutoDecisionConfig = DEFAULT_CONFIG) {
		this.config = config;
	}

	/**
	 * Make a protection decision based on aggregated signals
	 *
	 * Decision logic (in order of precedence):
	 * 1. Create Snapshot: If any critical signal triggers (high AI confidence, critical files, extreme risk)
	 * 2. Show Notification: If weak to moderate signals below protection threshold
	 * 3. Ignore: If all signals are clean
	 *
	 * @param context - Aggregated signals from multiple detectors
	 * @returns Protection decision with confidence and attribution reasons
	 */
	makeDecision(context: SaveContext): ProtectionDecision {
		const signals = this.extractSignals(context);
		const createSnapshot = this.shouldCreateSnapshot(signals);
		const showNotification = this.shouldNotify(signals);
		const reasons = this.attributeReasons(signals, createSnapshot);
		const confidence = this.calculateConfidence(signals, createSnapshot);
		const summary = this.generateSummary(reasons, signals);

		return {
			createSnapshot,
			showNotification,
			confidence,
			reasons,
			summary,
			context: {
				riskScore: signals.riskSignal.score,
				sessionId: "", // Will be populated by caller
				filesInSession: signals.burstSignal.fileCount,
				criticalFileCount: signals.criticalSignal.fileCount,
				aiToolName: undefined, // Will be populated by caller
			},
		};
	}

	/**
	 * Extract individual signals from SaveContext
	 */
	private extractSignals(context: SaveContext): {
		aiSignal: { detected: boolean; confidence: number };
		riskSignal: { score: number };
		burstSignal: { detected: boolean; fileCount: number };
		criticalSignal: { detected: boolean; fileCount: number };
	} {
		return {
			aiSignal: {
				detected: context.aiDetected,
				confidence: context.aiConfidence ?? 0,
			},
			riskSignal: {
				score: context.riskScore,
			},
			burstSignal: {
				detected: context.burstDetected,
				fileCount: context.sessionFileCount,
			},
			criticalSignal: {
				detected: context.containsCriticalFiles,
				fileCount: context.criticalFileCount,
			},
		};
	}

	/**
	 * Determine if we should create a snapshot based on signal strength
	 */
	private shouldCreateSnapshot(signals: {
		aiSignal: { detected: boolean; confidence: number };
		riskSignal: { score: number };
		burstSignal: { detected: boolean; fileCount: number };
		criticalSignal: { detected: boolean; fileCount: number };
	}): boolean {
		// Snapshot: Critical signals
		if (signals.aiSignal.detected && signals.aiSignal.confidence >= 0.8) {
			return true;
		}

		if (signals.riskSignal.score >= this.config.riskThreshold) {
			return true;
		}

		if (
			signals.criticalSignal.detected &&
			signals.criticalSignal.fileCount > 0
		) {
			return true;
		}

		// Snapshot: Burst with multiple files
		if (
			signals.burstSignal.detected &&
			signals.burstSignal.fileCount >= this.config.minFilesForBurst
		) {
			return true;
		}

		return false;
	}

	/**
	 * Determine if we should notify the user
	 */
	private shouldNotify(signals: {
		aiSignal: { detected: boolean; confidence: number };
		riskSignal: { score: number };
		burstSignal: { detected: boolean; fileCount: number };
		criticalSignal: { detected: boolean; fileCount: number };
	}): boolean {
		// Notify: Elevated signals below protection threshold
		if (signals.riskSignal.score >= this.config.notifyThreshold) {
			return true;
		}

		if (signals.aiSignal.detected && signals.aiSignal.confidence > 0.5) {
			return true;
		}

		return false;
	}

	/**
	 * Attribute decision to specific signals that triggered it
	 */
	private attributeReasons(
		signals: {
			aiSignal: { detected: boolean; confidence: number };
			riskSignal: { score: number };
			burstSignal: { detected: boolean; fileCount: number };
			criticalSignal: { detected: boolean; fileCount: number };
		},
		createSnapshot: boolean,
	): DecisionReason[] {
		const reasons: DecisionReason[] = [];

		if (!createSnapshot) {
			return reasons;
		}

		// Track which signals contributed
		const contributingSignals: Array<{
			type: DecisionReason;
			priority: number;
			triggered: boolean;
		}> = [
			{
				type: "ai_detected",
				priority: 1,
				triggered:
					signals.aiSignal.detected && signals.aiSignal.confidence >= 0.8,
			},
			{
				type: "risk_threshold",
				priority: 1,
				triggered: signals.riskSignal.score >= this.config.riskThreshold,
			},
			{
				type: "critical_file",
				priority: 1,
				triggered:
					signals.criticalSignal.detected &&
					signals.criticalSignal.fileCount > 0,
			},
			{
				type: "burst_pattern",
				priority: 2,
				triggered:
					signals.burstSignal.detected &&
					signals.burstSignal.fileCount >= this.config.minFilesForBurst,
			},
		];

		// Collect triggered signals
		const triggered = contributingSignals.filter((s) => s.triggered);

		// Add individual signal reasons (highest priority first)
		triggered.sort((a, b) => a.priority - b.priority);
		triggered.forEach((signal) => {
			reasons.push(signal.type);
		});

		return reasons.length > 0 ? reasons : ["fallback"];
	}

	/**
	 * Calculate overall confidence (0-1) for the decision
	 *
	 * Confidence combines:
	 * - AI confidence (if AI detected): normalized to 0-1
	 * - Risk score: normalized (riskScore / 100)
	 * - Signal count: more signals = higher confidence
	 *
	 * Formula: (AI_confidence * 0.4) + (risk_score/100 * 0.4) + (signal_count/4 * 0.2)
	 */
	private calculateConfidence(
		signals: {
			aiSignal: { detected: boolean; confidence: number };
			riskSignal: { score: number };
			burstSignal: { detected: boolean; fileCount: number };
			criticalSignal: { detected: boolean; fileCount: number };
		},
		createSnapshot: boolean,
	): number {
		if (!createSnapshot) {
			return 0;
		}

		let confidence = 0;

		// AI signal weight (40%)
		if (signals.aiSignal.detected) {
			confidence += signals.aiSignal.confidence * 0.4;
		}

		// Risk score weight (40%)
		confidence += Math.min(1, signals.riskSignal.score / 100) * 0.4;

		// Signal count weight (20%)
		let signalCount = 0;
		if (signals.aiSignal.detected) signalCount++;
		if (signals.riskSignal.score >= this.config.notifyThreshold) signalCount++;
		if (signals.burstSignal.detected) signalCount++;
		if (signals.criticalSignal.detected) signalCount++;

		confidence += Math.min(1, signalCount / 4) * 0.2;

		return Math.min(1, Math.round(confidence * 100) / 100); // Round to 2 decimals
	}

	/**
	 * Generate a human-readable summary for notifications
	 */
	private generateSummary(
		reasons: DecisionReason[],
		signals: {
			aiSignal: { detected: boolean; confidence: number };
			riskSignal: { score: number };
			burstSignal: { detected: boolean; fileCount: number };
			criticalSignal: { detected: boolean; fileCount: number };
		},
	): string {
		if (reasons.length === 0) {
			return "";
		}

		const parts: string[] = [];

		if (reasons.includes("ai_detected")) {
			parts.push(
				`AI detected (${Math.round(signals.aiSignal.confidence * 100)}%)`,
			);
		}

		if (reasons.includes("risk_threshold")) {
			parts.push(`High risk score (${signals.riskSignal.score}/100)`);
		}

		if (reasons.includes("critical_file")) {
			parts.push(
				`${signals.criticalSignal.fileCount} critical file(s) modified`,
			);
		}

		if (reasons.includes("burst_pattern")) {
			parts.push(
				`Rapid changes detected (${signals.burstSignal.fileCount} files)`,
			);
		}

		return parts.join(", ");
	}

	/**
	 * Validate a SaveContext before decision-making
	 *
	 * @throws Error if SaveContext is malformed
	 */
	validateContext(context: SaveContext): void {
		if (!context.repoId) {
			throw new Error("SaveContext missing repoId");
		}

		if (context.timestamp <= 0) {
			throw new Error("SaveContext timestamp must be positive");
		}

		if (!Array.isArray(context.files)) {
			throw new Error("SaveContext files must be an array");
		}

		if (
			context.aiConfidence !== undefined &&
			(context.aiConfidence < 0 || context.aiConfidence > 1)
		) {
			throw new Error("SaveContext aiConfidence must be between 0 and 1");
		}

		if (context.riskScore < 0 || context.riskScore > 100) {
			throw new Error("SaveContext riskScore must be between 0 and 100");
		}

		if (context.sessionFileCount < 0) {
			throw new Error("SaveContext sessionFileCount must be non-negative");
		}

		if (context.criticalFileCount < 0) {
			throw new Error("SaveContext criticalFileCount must be non-negative");
		}

		if (!context.sessionId) {
			throw new Error("SaveContext missing sessionId");
		}
	}

	/**
	 * Get the current configuration
	 */
	getConfig(): AutoDecisionConfig {
		return this.config;
	}

	/**
	 * Update configuration at runtime
	 */
	updateConfig(partial: Partial<AutoDecisionConfig>): void {
		this.config = {
			...this.config,
			...partial,
		};
	}
}

/**
 * Factory function to create an engine with default config
 */
export function createAutoDecisionEngine(
	config?: Partial<AutoDecisionConfig>,
): AutoDecisionEngine {
	const finalConfig = config
		? { ...DEFAULT_CONFIG, ...config }
		: DEFAULT_CONFIG;
	return new AutoDecisionEngine(finalConfig);
}
