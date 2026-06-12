/**
 * CommitRiskBridge - Bridge between VS Code and CommitRiskSystem
 *
 * Connects the VS Code extension to the @vreko/intelligence CommitRiskSystem
 * for research-aligned commit coaching based on:
 * - 5-factor risk scoring (time, lines, files, AI, churn)
 * - Phase-aware thresholds (hotfix, feature, refactor, exploratory)
 * - Self-tuning via outcome tracking
 *
 * Now delegates all heavy computation to daemon via DaemonBridge.
 *
 * @see https://linearb.io/blog/2025-engineering-benchmarks-insights
 * @module services/CommitRiskBridge
 */

// TYPE-ONLY imports - these do NOT force bundling!
import type { CommitPhase, CommitRiskSystemState, RiskContext, RiskEvaluation, SessionOutcome } from "@vreko/contracts";
import type { Memento } from "vscode";
import type { NudgeTrigger } from "../nurturing/NudgeManager";
import { logger } from "../utils/logger";
import { getDaemonBridge } from "./DaemonBridge";

// =============================================================================
// Inlined Constants (data only, not runtime logic)
// =============================================================================

const DEFAULT_WEIGHTS = {
	wT: 0.3,
	wL: 0.25,
	wF: 0.15,
	wA: 0.2,
	wC: 0.1,
} as const;

const DEFAULT_THRESHOLDS = {
	autoSnapshot: 0.35,
	suggestCommit: 0.55,
	strongCommit: 0.8,
} as const;

const DEFAULT_COOLDOWNS = {
	minSnapshotInterval: 5 * 60 * 1000,
	minPromptInterval: 10 * 60 * 1000,
} as const;

// =============================================================================
// Types
// =============================================================================

export interface CommitRiskBridgeOptions {
	workspaceRoot: string;
	workspaceState: Memento;
	branchName?: string;
}

export interface SessionState {
	linesChanged: number;
	filesChanged: number;
	minutesSinceCommit: number;
	aiActive: boolean;
	aiFraction: number;
}

export interface CommitOutcome {
	linesCommitted: number;
	filesCommitted: number;
	riskScoreAtCommit: number;
}

// =============================================================================
// Constants
// =============================================================================

const STORAGE_KEY = "vreko.commitRisk.state";
const DEFAULT_CHURN_PERCENT = 10;

// =============================================================================
// CommitRiskBridge
// =============================================================================

/**
 * CommitRiskBridge - Manages commit risk evaluation for VS Code extension
 *
 * This is a THIN CLIENT that delegates all heavy computation to the daemon
 * via DaemonBridge. The extension does NOT bundle @vreko/intelligence.
 */
export class CommitRiskBridge {
	private workspaceState: Memento;
	private workspaceRoot: string;
	private workspaceId: string;

	// Session state tracking (kept locally - lightweight)
	private sessionLinesChanged = 0;
	private sessionFilesChanged = new Set<string>();
	private minutesSinceCommit = 0;
	private aiActive = false;
	private aiFraction = 0;
	private churnPercent = DEFAULT_CHURN_PERCENT;

	// Current phase
	private currentPhase: CommitPhase = "feature";
	private branchName: string;

	// Last evaluation for coaching decisions
	private lastEvaluation: RiskEvaluation | null = null;

	// Timing for cooldowns and test manipulation
	private lastPromptAt: number | null = null;
	private testTime: number | null = null;

	// Session start time for automatic minutesSinceCommit tracking
	private sessionStartTime: number = Date.now();

	// Initialization state
	private initialized = false;

	constructor(options: CommitRiskBridgeOptions) {
		this.workspaceRoot = options.workspaceRoot;
		this.workspaceState = options.workspaceState;
		this.workspaceId = options.workspaceRoot;
		this.branchName = options.branchName ?? "main";
		this.currentPhase = this.detectCommitPhase(this.branchName);

		logger.debug("CommitRiskBridge created (thin client)", {
			workspaceRoot: this.workspaceRoot,
			workspaceId: this.workspaceId,
			branchName: this.branchName,
			phase: this.currentPhase,
		});
	}

	/**
	 * Initialize the bridge - must be called before using other methods
	 */
	async initialize(): Promise<void> {
		if (this.initialized) {
			return;
		}

		try {
			const bridge = getDaemonBridge(this.workspaceId);
			await bridge.request("commitRisk.initialize", {
				workspaceId: this.workspaceId,
				branchName: this.branchName,
			});
			this.initialized = true;
			logger.debug("CommitRiskBridge initialized via daemon");
		} catch (error) {
			logger.warn("CommitRiskBridge: daemon unavailable", { error: (error as Error).message });
		}
	}

	// ===========================================================================
	// Core API
	// ===========================================================================

	private getCurrentTime(): number {
		return this.testTime ?? Date.now();
	}

	private getEffectiveMinutesSinceCommit(): number {
		if (this.minutesSinceCommit > 0) {
			return this.minutesSinceCommit;
		}
		const elapsedMs = this.getCurrentTime() - this.sessionStartTime;
		return Math.floor(elapsedMs / 60000);
	}

	/**
	 * Evaluate current risk based on session state (delegates to daemon)
	 */
	async evaluate(): Promise<RiskEvaluation> {
		if (!this.initialized) {
			await this.initialize();
		}

		const context: RiskContext = {
			workspaceId: this.workspaceId,
			sessionId: `session_${this.getCurrentTime()}`,
			minutesSinceCommit: this.getEffectiveMinutesSinceCommit(),
			linesChanged: this.sessionLinesChanged,
			filesChanged: this.sessionFilesChanged.size,
			aiFraction: this.aiFraction,
			churnPercent: this.churnPercent,
			phase: this.currentPhase,
			now: this.getCurrentTime(),
		};

		try {
			const bridge = getDaemonBridge(this.workspaceId);
			const response = await bridge.request<{ success: boolean; evaluation?: RiskEvaluation; error?: string }>(
				"commitRisk.evaluate",
				{ workspaceId: this.workspaceId, context },
			);

			if (!response.success || !response.evaluation) {
				throw new Error(response.error ?? "Failed to evaluate commit risk");
			}

			this.lastEvaluation = response.evaluation;
			logger.debug("Risk evaluation completed via daemon", {
				score: this.lastEvaluation.score,
				action: this.lastEvaluation.action,
			});

			return this.lastEvaluation;
		} catch (error) {
			logger.warn("evaluate: daemon unavailable", { error: (error as Error).message });
			// Return a default evaluation with all required fields
			return {
				score: 0,
				action: "none",
				breakdown: {
					timeRisk: 0,
					linesRisk: 0,
					filesRisk: 0,
					aiRisk: 0,
					churnRisk: 0,
					rawScore: 0,
					phaseMultiplier: 1,
					finalScore: 0,
				},
				escalation: "none",
				reason: "Daemon unavailable",
				context: {
					minutesSinceCommit: 0,
					linesChanged: 0,
					filesChanged: 0,
					aiFraction: 0,
					churnPercent: 0,
					phase: "feature",
					now: Date.now(),
				},
			} as RiskEvaluation;
		}
	}

	/**
	 * Check if coaching should be shown based on current evaluation
	 */
	async shouldShowCoaching(): Promise<boolean> {
		if (!this.lastEvaluation) {
			return false;
		}

		const { action } = this.lastEvaluation;

		if (action === "none" || action === "auto_snapshot") {
			return false;
		}

		// Check prompt cooldown locally
		try {
			const bridge = getDaemonBridge(this.workspaceId);
			const configResponse = await bridge.request<{
				success: boolean;
				config?: { userTuning: { promptCooldownScale: number } };
				error?: string;
			}>("commitRisk.getConfig", { workspaceId: this.workspaceId });

			if (configResponse.success && configResponse.config) {
				const scaledCooldown =
					DEFAULT_COOLDOWNS.minPromptInterval * configResponse.config.userTuning.promptCooldownScale;
				if (this.lastPromptAt !== null) {
					const timeSincePrompt = this.getCurrentTime() - this.lastPromptAt;
					if (timeSincePrompt < scaledCooldown) {
						return false;
					}
				}
			}

			const response = await bridge.request<{ success: boolean; shouldShow?: boolean; error?: string }>(
				"commitRisk.shouldShowCoaching",
				{ workspaceId: this.workspaceId, evaluation: this.lastEvaluation },
			);

			return response.success === true && response.shouldShow === true;
		} catch {
			logger.debug("shouldShowCoaching: daemon unavailable, skipping coaching");
			return false;
		}
	}

	/**
	 * Get the appropriate NudgeTrigger for the current risk level
	 */
	getCoachingTrigger(): NudgeTrigger | null {
		if (!this.lastEvaluation) {
			return null;
		}

		switch (this.lastEvaluation.action) {
			case "suggest_commit":
				return "commit_suggested";
			case "strong_commit":
				return "commit_recommended";
			default:
				return null;
		}
	}

	// ===========================================================================
	// State Management
	// ===========================================================================

	/**
	 * Record a file change (called on save events)
	 */
	recordFileChange(filePath: string, linesChanged: number): void {
		this.sessionLinesChanged += linesChanged;
		this.sessionFilesChanged.add(filePath);

		logger.debug("File change recorded", {
			filePath,
			linesChanged,
			totalLines: this.sessionLinesChanged,
			totalFiles: this.sessionFilesChanged.size,
		});
	}

	/**
	 * Record that a snapshot was created (delegates to daemon)
	 */
	async recordSnapshot(): Promise<void> {
		try {
			const bridge = getDaemonBridge(this.workspaceId);
			await bridge.request("commitRisk.recordSnapshot", {
				workspaceId: this.workspaceId,
				timestamp: this.getCurrentTime(),
			});
		} catch (error) {
			logger.debug("recordSnapshot: daemon unavailable", { error: (error as Error).message });
		}

		this.sessionLinesChanged = 0;
		this.sessionFilesChanged.clear();
		logger.debug("Snapshot recorded, session state reset");
	}

	/**
	 * Record that a commit was made (delegates to daemon)
	 */
	async recordCommit(outcome?: CommitOutcome): Promise<void> {
		try {
			const bridge = getDaemonBridge(this.workspaceId);

			if (outcome && this.lastEvaluation) {
				const sessionOutcome: SessionOutcome = {
					sessionId: `session_${this.getCurrentTime()}`,
					maxRiskScore: outcome.riskScoreAtCommit,
					linesAtCommit: outcome.linesCommitted,
					filesAtCommit: outcome.filesCommitted,
					aiFraction: this.aiFraction,
					churnPercent: this.churnPercent,
					phase: this.currentPhase,
					hadRevertWithin2Weeks: false,
				};
				await bridge.request("commitRisk.recordOutcome", {
					workspaceId: this.workspaceId,
					outcome: sessionOutcome,
				});
			}

			await bridge.request("commitRisk.recordSnapshot", {
				workspaceId: this.workspaceId,
				timestamp: this.getCurrentTime(),
			});
		} catch (error) {
			logger.debug("recordCommit: daemon unavailable", { error: (error as Error).message });
		}

		this.sessionLinesChanged = 0;
		this.sessionFilesChanged.clear();
		this.minutesSinceCommit = 0;
		this.sessionStartTime = this.getCurrentTime();
		logger.debug("Commit recorded, session state reset");
	}

	/**
	 * Record that a coaching prompt was shown
	 */
	async recordPromptShown(): Promise<void> {
		this.lastPromptAt = this.getCurrentTime();
		try {
			const bridge = getDaemonBridge(this.workspaceId);
			await bridge.request("commitRisk.recordPrompt", {
				workspaceId: this.workspaceId,
				timestamp: this.getCurrentTime(),
			});
		} catch {
			logger.debug("recordPromptShown: daemon unavailable, prompt not recorded");
		}
		logger.debug("Prompt shown recorded");
	}

	/**
	 * Reset all session state
	 */
	reset(): void {
		this.sessionLinesChanged = 0;
		this.sessionFilesChanged.clear();
		this.minutesSinceCommit = 0;
		this.aiActive = false;
		this.aiFraction = 0;
		this.lastEvaluation = null;
		logger.debug("Session state reset");
	}

	// ===========================================================================
	// Test Helpers and Setters
	// ===========================================================================

	setMinutesSinceCommit(minutes: number): void {
		this.minutesSinceCommit = minutes;
	}

	setAIActive(active: boolean, fraction = 0): void {
		this.aiActive = active;
		this.aiFraction = active ? Math.max(fraction, 0.2) : 0;
	}

	isAIActive(): boolean {
		return this.aiActive;
	}

	getAIFraction(): number {
		return this.aiFraction;
	}

	advanceTime(ms: number): void {
		if (this.testTime === null) {
			this.testTime = Date.now();
		}
		this.testTime += ms;
	}

	// ===========================================================================
	// Configuration
	// ===========================================================================

	async getConfig(): Promise<{
		weights: typeof DEFAULT_WEIGHTS;
		thresholds: typeof DEFAULT_THRESHOLDS;
		userTuning: { thresholdScale: number; promptCooldownScale: number; snapshotCooldownScale: number };
		scaledThresholds: typeof DEFAULT_THRESHOLDS;
	}> {
		try {
			const bridge = getDaemonBridge(this.workspaceId);
			const response = await bridge.request<{
				success: boolean;
				config?: {
					weights: typeof DEFAULT_WEIGHTS;
					thresholds: typeof DEFAULT_THRESHOLDS;
					userTuning: { thresholdScale: number; promptCooldownScale: number; snapshotCooldownScale: number };
					scaledThresholds: typeof DEFAULT_THRESHOLDS;
				};
				error?: string;
			}>("commitRisk.getConfig", { workspaceId: this.workspaceId });

			if (!response.success || !response.config) {
				throw new Error(response.error ?? "Failed to get commit risk config");
			}

			return response.config;
		} catch {
			logger.debug("getConfig: daemon unavailable, using defaults");
			return {
				weights: DEFAULT_WEIGHTS,
				thresholds: DEFAULT_THRESHOLDS,
				userTuning: { thresholdScale: 1, promptCooldownScale: 1, snapshotCooldownScale: 1 },
				scaledThresholds: DEFAULT_THRESHOLDS,
			};
		}
	}

	async getCooldowns(): Promise<{ minSnapshotInterval: number; minPromptInterval: number }> {
		const config = await this.getConfig();
		return {
			minSnapshotInterval: DEFAULT_COOLDOWNS.minSnapshotInterval * config.userTuning.snapshotCooldownScale,
			minPromptInterval: DEFAULT_COOLDOWNS.minPromptInterval * config.userTuning.promptCooldownScale,
		};
	}

	async setUserTuning(tuning: {
		thresholdScale?: number;
		promptCooldownScale?: number;
		snapshotCooldownScale?: number;
	}): Promise<void> {
		try {
			const bridge = getDaemonBridge(this.workspaceId);
			const response = await bridge.request<{ success: boolean; error?: string }>("commitRisk.setUserTuning", {
				workspaceId: this.workspaceId,
				tuning,
			});

			if (!response.success) {
				throw new Error(response.error ?? "Failed to set user tuning");
			}
		} catch (error) {
			logger.warn("setUserTuning: daemon unavailable", { error: (error as Error).message });
		}
	}

	getCurrentPhase(): CommitPhase {
		return this.currentPhase;
	}

	getSessionState(): SessionState {
		return {
			linesChanged: this.sessionLinesChanged,
			filesChanged: this.sessionFilesChanged.size,
			minutesSinceCommit: this.minutesSinceCommit,
			aiActive: this.aiActive,
			aiFraction: this.aiFraction,
		};
	}

	async getOutcomeStats(): Promise<{
		totalSessions: number;
		badOutcomeRate: number;
		avgRiskAtBadOutcome: number;
		bucketStats: Map<string, { count: number; badRate: number }>;
	}> {
		try {
			const bridge = getDaemonBridge(this.workspaceId);
			const response = await bridge.request<{
				success: boolean;
				stats?: {
					totalSessions: number;
					badOutcomeRate: number;
					avgRiskAtBadOutcome: number;
					bucketStats: Array<[string, { count: number; badRate: number }]>;
				};
				error?: string;
			}>("commitRisk.getOutcomeStats", { workspaceId: this.workspaceId });

			if (!response.success || !response.stats) {
				throw new Error(response.error ?? "Failed to get outcome stats");
			}

			const bucketStatsMap = new Map<string, { count: number; badRate: number }>();
			for (const [key, value] of response.stats.bucketStats) {
				bucketStatsMap.set(key, value);
			}

			return {
				...response.stats,
				bucketStats: bucketStatsMap,
			};
		} catch {
			logger.debug("getBucketStats: daemon unavailable, returning empty stats");
			return {
				totalSessions: 0,
				badOutcomeRate: 0,
				avgRiskAtBadOutcome: 0,
				bucketStats: new Map(),
			};
		}
	}

	// ===========================================================================
	// Persistence
	// ===========================================================================

	async persistState(): Promise<void> {
		try {
			const bridge = getDaemonBridge(this.workspaceId);
			const response = await bridge.request<{ success: boolean; state?: CommitRiskSystemState; error?: string }>(
				"commitRisk.serialize",
				{ workspaceId: this.workspaceId },
			);

			if (response.success && response.state) {
				await this.workspaceState.update(STORAGE_KEY, response.state);
				logger.debug("CommitRiskBridge state persisted");
			}
		} catch (error) {
			logger.error("Failed to persist CommitRiskBridge state", error as Error);
		}
	}

	async restoreState(): Promise<void> {
		try {
			const state = this.workspaceState.get<CommitRiskSystemState>(STORAGE_KEY);

			if (state) {
				const bridge = getDaemonBridge(this.workspaceId);
				const response = await bridge.request<{ success: boolean; error?: string }>("commitRisk.deserialize", {
					workspaceId: this.workspaceId,
					state,
				});

				if (response.success) {
					this.initialized = true;
					logger.debug("CommitRiskBridge state restored", {
						outcomes: state.outcomes.length,
					});
				}
			}
		} catch (error) {
			logger.error("Failed to restore CommitRiskBridge state", error as Error);
		}
	}

	/**
	 * Dispose and cleanup
	 */
	dispose(): void {
		void this.persistState();
		logger.debug("CommitRiskBridge disposed");
	}

	// ===========================================================================
	// Private Methods
	// ===========================================================================

	private detectCommitPhase(branchName: string): CommitPhase {
		const lower = branchName.toLowerCase();

		if (
			lower.includes("hotfix") ||
			lower.includes("fix/") ||
			lower.includes("bugfix") ||
			lower.includes("urgent") ||
			lower.includes("critical")
		) {
			return "hotfix";
		}

		if (lower.includes("refactor") || lower.includes("cleanup") || lower.includes("chore")) {
			return "refactor";
		}

		if (lower.includes("experiment") || lower.includes("spike") || lower.includes("poc") || lower.includes("wip")) {
			return "exploratory";
		}

		return "feature";
	}
}

// =============================================================================
// Factory
// =============================================================================

export function createCommitRiskBridge(options: CommitRiskBridgeOptions): CommitRiskBridge {
	return new CommitRiskBridge(options);
}
