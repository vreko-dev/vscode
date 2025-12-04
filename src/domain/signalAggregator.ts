/**
 * SignalAggregator
 *
 * Aggregates signals from multiple detection engines:
 * - AIPresenceDetector: AI tool usage (CoPilot, Cursor, etc.)
 * - AIRiskService: Risk scoring based on patterns
 * - SessionTagger: File grouping via DBSCAN clustering
 * - BurstDetector: Rapid change detection
 * - PatternMatcher: Critical file identification
 *
 * Outputs SaveContext for AutoDecisionEngine
 */

export interface AISignal {
	detected: boolean;
	toolName?: string;
	confidence: number;
	indicators?: string[];
}

export interface RiskSignal {
	score: number;
	factors?: string[];
}

export interface BurstSignal {
	detected: boolean;
	fileCount?: number;
	timeWindowMs?: number;
	velocity?: number;
}

export interface CriticalFileSignal {
	detected: boolean;
	files?: string[];
	count: number;
}

export interface SessionSignal {
	sessionId: string;
	fileCount: number;
	durationMs: number;
	clusters?: number;
	density?: number;
}

export interface FileInfo {
	path: string;
	extension: string;
	sizeBytes: number;
	isNew: boolean;
	isBinary: boolean;
	nextHash: string;
}

export interface SaveContext {
	repoId: string;
	timestamp: number;
	files: FileInfo[];
	aiDetected: boolean;
	aiToolName?: string;
	aiConfidence: number;
	sessionId: string;
	sessionFileCount: number;
	sessionDurationMs: number;
	riskScore: number;
	burstDetected: boolean;
	containsCriticalFiles: boolean;
	criticalFileCount: number;
}

export interface AggregationSignals {
	ai: AISignal;
	risk: RiskSignal;
	burst: BurstSignal;
	critical: CriticalFileSignal;
	session: SessionSignal;
}

/**
 * Aggregates individual signals from detection engines
 */
export class SignalAggregator {
	private aiSignal: AISignal = {
		detected: false,
		confidence: 0,
	};

	private riskSignal: RiskSignal = {
		score: 0,
		factors: [],
	};

	private burstSignal: BurstSignal = {
		detected: false,
		fileCount: 0,
		timeWindowMs: 0,
	};

	private criticalSignal: CriticalFileSignal = {
		detected: false,
		files: [],
		count: 0,
	};

	private sessionSignal: SessionSignal = {
		sessionId: "",
		fileCount: 0,
		durationMs: 0,
		clusters: 0,
	};

	setAISignal(signal: AISignal): void {
		this.aiSignal = signal;
	}

	setRiskSignal(signal: RiskSignal): void {
		this.riskSignal = signal;
	}

	setBurstSignal(signal: BurstSignal): void {
		this.burstSignal = signal;
	}

	setCriticalFileSignal(signal: CriticalFileSignal): void {
		this.criticalSignal = signal;
	}

	setSessionSignal(signal: SessionSignal): void {
		this.sessionSignal = signal;
	}

	getSignals(): AggregationSignals {
		return {
			ai: this.aiSignal,
			risk: this.riskSignal,
			burst: this.burstSignal,
			critical: this.criticalSignal,
			session: this.sessionSignal,
		};
	}

	/**
	 * Aggregate all signals into SaveContext
	 */
	aggregate(files: FileInfo[], repoId: string): SaveContext {
		return {
			repoId,
			timestamp: Date.now(),
			files,
			aiDetected: this.aiSignal.detected,
			aiToolName: this.aiSignal.toolName,
			aiConfidence: this.aiSignal.confidence,
			sessionId: this.sessionSignal.sessionId,
			sessionFileCount: this.sessionSignal.fileCount,
			sessionDurationMs: this.sessionSignal.durationMs,
			riskScore: this.riskSignal.score,
			burstDetected: this.burstSignal.detected,
			containsCriticalFiles: this.criticalSignal.detected,
			criticalFileCount: this.criticalSignal.count,
		};
	}

	/**
	 * Check if aggregated signals warrant high-risk decision
	 */
	isHighRisk(): boolean {
		const signals = this.getSignals();

		// High risk if any strong signal present
		const aiRisk = signals.ai.detected && signals.ai.confidence >= 0.7;
		const scoreRisk = signals.risk.score >= 60;
		const burstRisk =
			signals.burst.detected &&
			signals.burst.fileCount !== undefined &&
			signals.burst.fileCount >= 3;
		const criticalRisk =
			signals.critical.detected && signals.critical.count > 0;

		return aiRisk || scoreRisk || (burstRisk && criticalRisk);
	}

	/**
	 * Calculate signal strength (0-5)
	 */
	getSignalStrength(): number {
		const signals = this.getSignals();

		let strength = 0;

		if (signals.ai.detected && signals.ai.confidence >= 0.7) {
			strength += 1;
		}
		if (signals.risk.score >= 60) {
			strength += 1;
		}
		if (
			signals.burst.detected &&
			signals.burst.fileCount !== undefined &&
			signals.burst.fileCount >= 3
		) {
			strength += 1;
		}
		if (signals.critical.detected && signals.critical.count > 0) {
			strength += 1;
		}
		if (signals.session.fileCount >= 3) {
			strength += 1;
		}

		return strength;
	}

	/**
	 * Reset all signals
	 */
	reset(): void {
		this.aiSignal = { detected: false, confidence: 0 };
		this.riskSignal = { score: 0, factors: [] };
		this.burstSignal = { detected: false, fileCount: 0, timeWindowMs: 0 };
		this.criticalSignal = { detected: false, files: [], count: 0 };
		this.sessionSignal = {
			sessionId: "",
			fileCount: 0,
			durationMs: 0,
			clusters: 0,
		};
	}
}

/**
 * Factory for creating configured SignalAggregator
 */
export function createSignalAggregator(): SignalAggregator {
	return new SignalAggregator();
}
