/**
 * CommitRiskBridge - Bridge between VS Code and CommitRiskSystem
 *
 * Connects the VS Code extension to the @snapback/intelligence CommitRiskSystem
 * for research-aligned commit coaching based on:
 * - 5-factor risk scoring (time, lines, files, AI, churn)
 * - Phase-aware thresholds (hotfix, feature, refactor, exploratory)
 * - Self-tuning via outcome tracking
 *
 * Based on 2025-2026 research:
 * - LinearB: PR Size is most significant driver of velocity
 * - GitClear: PRs <200 lines correlate with 5x faster review
 * - 41% of commits are AI-assisted (validates wA factor)
 *
 * @see https://linearb.io/blog/2025-engineering-benchmarks-insights
 * @module services/CommitRiskBridge
 */

import {
	type CommitPhase,
	CommitRiskSystem,
	type CommitRiskSystemState,
	DEFAULT_COOLDOWNS,
	type DEFAULT_THRESHOLDS,
	type DEFAULT_WEIGHTS,
	type DevelopmentPhase,
	deserializeCommitRiskSystem,
	mapToCommitPhase,
	type RiskContext,
	type RiskEvaluation,
	type SessionOutcome,
	serializeCommitRiskSystem,
} from "@snapback/intelligence/vitals";
import type { Memento } from "vscode";
import type { NudgeTrigger } from "../nurturing/NudgeManager";
import { logger } from "../utils/logger";

// =============================================================================
// Types
// =============================================================================

export interface CommitRiskBridgeOptions {
	/** Workspace root path for git operations */
	workspaceRoot: string;
	/** VS Code workspace state for persistence */
	workspaceState: Memento;
	/** Optional branch name (auto-detected if not provided) */
	branchName?: string;
}

export interface SessionState {
	/** Total lines changed in this session */
	linesChanged: number;
	/** Number of unique files changed */
	filesChanged: number;
	/** Minutes since last commit */
	minutesSinceCommit: number;
	/** Whether AI tools are currently active */
	aiActive: boolean;
	/** AI contribution fraction (0-1) */
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

const STORAGE_KEY = "snapback.commitRisk.state";
const DEFAULT_CHURN_PERCENT = 10; // Default churn estimate when not available

// =============================================================================
// CommitRiskBridge
// =============================================================================

/**
 * CommitRiskBridge - Manages commit risk evaluation for VS Code extension
 *
 * @example
 * ```typescript
 * const bridge = new CommitRiskBridge({
 *   workspaceRoot: '/path/to/workspace',
 *   workspaceState: context.workspaceState
 * });
 *
 * // Record file changes
 * bridge.recordFileChange('/path/to/file.ts', 50);
 *
 * // Evaluate risk
 * const evaluation = bridge.evaluate();
 * if (bridge.shouldShowCoaching()) {
 *   const trigger = bridge.getCoachingTrigger();
 *   nudgeManager.showNudge(trigger);
 * }
 * ```
 */
export class CommitRiskBridge {
	private riskSystem: CommitRiskSystem;
	private workspaceState: Memento;
	private workspaceRoot: string;

	// Session state tracking
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
	// 🔧 FIX: Use real-time by default; testTime allows test-controlled time
	// ISSUE: Previously currentTime was set once at construction and never updated,
	// causing cooldown logic to compare against stale timestamps
	private testTime: number | null = null;

	// 🆕 Session start time for automatic minutesSinceCommit tracking
	// This enables the time factor (wT=0.30) to work without manual updates
	private sessionStartTime: number = Date.now();

	constructor(options: CommitRiskBridgeOptions) {
		this.workspaceRoot = options.workspaceRoot;
		this.workspaceState = options.workspaceState;
		this.branchName = options.branchName ?? "main";

		// Detect phase from branch name
		this.currentPhase = mapToCommitPhase(this.detectBranchPhase(this.branchName));

		// Initialize risk system with default tuning
		this.riskSystem = new CommitRiskSystem();

		logger.debug("CommitRiskBridge initialized", {
			workspaceRoot: this.workspaceRoot,
			branchName: this.branchName,
			phase: this.currentPhase,
		});
	}

	// ===========================================================================
	// Core API
	// ===========================================================================

	/**
	 * Get current time - uses testTime if set (for testing), otherwise real Date.now()
	 * 🔧 FIX: This replaces the frozen currentTime that was set once at construction
	 */
	private getCurrentTime(): number {
		return this.testTime ?? Date.now();
	}

	/**
	 * Get effective minutes since commit
	 * 🔧 FIX: Auto-calculates from session start if not manually overridden
	 * This enables the time factor (wT=0.30, highest weight) to work automatically
	 */
	private getEffectiveMinutesSinceCommit(): number {
		// If manually set (e.g., from git integration or tests), use that value
		if (this.minutesSinceCommit > 0) {
			return this.minutesSinceCommit;
		}
		// Otherwise, calculate from session start time
		// This provides a baseline time estimate until git integration is added
		const elapsedMs = this.getCurrentTime() - this.sessionStartTime;
		return Math.floor(elapsedMs / 60000);
	}

	/**
	 * Evaluate current risk based on session state
	 */
	evaluate(): RiskEvaluation {
		const context: RiskContext = {
			// 🔧 FIX: Use effective minutes that auto-tracks session time
			minutesSinceCommit: this.getEffectiveMinutesSinceCommit(),
			linesChanged: this.sessionLinesChanged,
			filesChanged: this.sessionFilesChanged.size,
			aiFraction: this.aiFraction,
			churnPercent: this.churnPercent,
			phase: this.currentPhase,
			// 🔧 FIX: Use real-time instead of frozen construction time
			now: this.getCurrentTime(),
		};

		this.lastEvaluation = this.riskSystem.evaluate(context);

		logger.debug("Risk evaluation completed", {
			score: this.lastEvaluation.score,
			action: this.lastEvaluation.action,
			breakdown: this.lastEvaluation.breakdown,
		});

		return this.lastEvaluation;
	}

	/**
	 * Check if coaching should be shown based on current evaluation
	 */
	shouldShowCoaching(): boolean {
		if (!this.lastEvaluation) {
			return false;
		}

		const { action } = this.lastEvaluation;

		// Only coaching actions
		if (action === "none" || action === "auto_snapshot") {
			return false;
		}

		// Check prompt cooldown (10 min default, scaled by user tuning)
		// 🔧 FIX: Use getCurrentTime() for real-time cooldown calculation
		const config = this.riskSystem.getConfig();
		const scaledCooldown = DEFAULT_COOLDOWNS.minPromptInterval * config.userTuning.promptCooldownScale;
		if (this.lastPromptAt !== null) {
			const timeSincePrompt = this.getCurrentTime() - this.lastPromptAt;
			if (timeSincePrompt < scaledCooldown) {
				return false;
			}
		}

		return this.riskSystem.shouldAct(this.lastEvaluation);
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
	 * Record that a snapshot was created
	 */
	recordSnapshot(): void {
		this.riskSystem.recordSnapshot(this.getCurrentTime());

		// Reset session state (pressure released)
		this.sessionLinesChanged = 0;
		this.sessionFilesChanged.clear();

		logger.debug("Snapshot recorded, session state reset");
	}

	/**
	 * Record that a commit was made
	 */
	recordCommit(outcome?: CommitOutcome): void {
		// Record outcome for self-tuning if we have data
		if (outcome && this.lastEvaluation) {
			const sessionOutcome: SessionOutcome = {
				sessionId: `session_${this.getCurrentTime()}`,
				maxRiskScore: outcome.riskScoreAtCommit,
				linesAtCommit: outcome.linesCommitted,
				filesAtCommit: outcome.filesCommitted,
				aiFraction: this.aiFraction,
				churnPercent: this.churnPercent,
				phase: this.currentPhase,
				hadRevertWithin2Weeks: false, // Updated later via webhook/tracking
				hadBugFixWithin2Weeks: false, // Updated later
				timestamp: this.getCurrentTime(),
			};
			this.riskSystem.recordOutcome(sessionOutcome);
		}

		// Record snapshot to update cooldown state (commit includes implicit snapshot)
		this.riskSystem.recordSnapshot(this.getCurrentTime());

		// Reset session state
		this.sessionLinesChanged = 0;
		this.sessionFilesChanged.clear();
		this.minutesSinceCommit = 0;
		// 🆕 Reset session start time - commit is a natural checkpoint
		this.sessionStartTime = this.getCurrentTime();

		logger.debug("Commit recorded, session state reset");
	}

	/**
	 * Record that a coaching prompt was shown
	 */
	recordPromptShown(): void {
		this.lastPromptAt = this.getCurrentTime();
		this.riskSystem.recordPrompt(this.getCurrentTime());

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

	/**
	 * Set minutes since commit (for testing or manual override)
	 */
	setMinutesSinceCommit(minutes: number): void {
		this.minutesSinceCommit = minutes;
	}

	/**
	 * Set AI active state
	 */
	setAIActive(active: boolean, fraction = 0): void {
		this.aiActive = active;
		this.aiFraction = active ? Math.max(fraction, 0.2) : 0; // Minimum 20% when active
	}

	/**
	 * Check if AI is currently active
	 */
	isAIActive(): boolean {
		return this.aiActive;
	}

	/**
	 * Get current AI fraction
	 */
	getAIFraction(): number {
		return this.aiFraction;
	}

	/**
	 * Advance internal time (for testing)
	 * 🔧 FIX: Works with testTime to allow test-controlled time advancement
	 */
	advanceTime(ms: number): void {
		// Initialize testTime from real time if not already set
		if (this.testTime === null) {
			this.testTime = Date.now();
		}
		this.testTime += ms;
	}

	// ===========================================================================
	// Configuration
	// ===========================================================================

	/**
	 * Get current configuration
	 */
	getConfig(): {
		weights: typeof DEFAULT_WEIGHTS;
		thresholds: typeof DEFAULT_THRESHOLDS;
		userTuning: { thresholdScale: number; promptCooldownScale: number; snapshotCooldownScale: number };
		scaledThresholds: typeof DEFAULT_THRESHOLDS;
	} {
		return this.riskSystem.getConfig();
	}

	/**
	 * Get cooldown configuration (with user scaling applied)
	 */
	getCooldowns(): { minSnapshotInterval: number; minPromptInterval: number } {
		const config = this.riskSystem.getConfig();
		return {
			minSnapshotInterval: DEFAULT_COOLDOWNS.minSnapshotInterval * config.userTuning.snapshotCooldownScale,
			minPromptInterval: DEFAULT_COOLDOWNS.minPromptInterval * config.userTuning.promptCooldownScale,
		};
	}

	/**
	 * Set user tuning preferences
	 */
	setUserTuning(tuning: {
		thresholdScale?: number;
		promptCooldownScale?: number;
		snapshotCooldownScale?: number;
	}): void {
		this.riskSystem.setUserTuning(tuning);
	}

	/**
	 * Get current phase
	 */
	getCurrentPhase(): CommitPhase {
		return this.currentPhase;
	}

	/**
	 * Get session state
	 */
	getSessionState(): SessionState {
		return {
			linesChanged: this.sessionLinesChanged,
			filesChanged: this.sessionFilesChanged.size,
			minutesSinceCommit: this.minutesSinceCommit,
			aiActive: this.aiActive,
			aiFraction: this.aiFraction,
		};
	}

	/**
	 * Get outcome statistics for self-tuning analysis
	 */
	getOutcomeStats(): {
		totalSessions: number;
		badOutcomeRate: number;
		avgRiskAtBadOutcome: number;
		bucketStats: Map<string, { count: number; badRate: number }>;
	} {
		return this.riskSystem.getOutcomeStats();
	}

	// ===========================================================================
	// Persistence
	// ===========================================================================

	/**
	 * Persist state to workspace storage
	 */
	async persistState(): Promise<void> {
		try {
			const state = serializeCommitRiskSystem(this.riskSystem);
			await this.workspaceState.update(STORAGE_KEY, state);

			logger.debug("CommitRiskBridge state persisted");
		} catch (error) {
			logger.error("Failed to persist CommitRiskBridge state", error as Error);
		}
	}

	/**
	 * Restore state from workspace storage
	 */
	async restoreState(): Promise<void> {
		try {
			const state = this.workspaceState.get<CommitRiskSystemState>(STORAGE_KEY);

			if (state) {
				this.riskSystem = deserializeCommitRiskSystem(state);
				logger.debug("CommitRiskBridge state restored", {
					outcomes: state.outcomes.length,
				});
			}
		} catch (error) {
			logger.error("Failed to restore CommitRiskBridge state", error as Error);
		}
	}

	/**
	 * Dispose and cleanup
	 */
	dispose(): void {
		// Persist state on dispose
		void this.persistState();

		logger.debug("CommitRiskBridge disposed");
	}

	// ===========================================================================
	// Private Methods
	// ===========================================================================

	/**
	 * Detect development phase from branch name
	 * Returns DevelopmentPhase type for mapToCommitPhase compatibility
	 */
	private detectBranchPhase(branchName: string): DevelopmentPhase {
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

		if (lower.includes("release") || (lower.includes("v") && /\d+\.\d+/.test(lower))) {
			return "release";
		}

		// Default to feature for most branches
		return "feature";
	}
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a CommitRiskBridge instance
 */
export function createCommitRiskBridge(options: CommitRiskBridgeOptions): CommitRiskBridge {
	return new CommitRiskBridge(options);
}
