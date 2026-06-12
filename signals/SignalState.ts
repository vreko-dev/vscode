/**
 * SignalState - Unified State Management
 *
 * Single class holding all extension-side signal tracking.
 * Combines state, milestones, and tier computation per Signal Communication Spec v2.0.
 *
 * Features:
 * - Session-scoped counters (reset on session.started)
 * - Workspace-scoped tracking (file changes, AI modifications)
 * - Milestone flags (persisted to workspaceState)
 * - Lifetime counters (persisted to globalState)
 * - Intelligence data (updated by events)
 * - Ring buffer for recent events
 *
 * @module signals/SignalState
 * @see docs/plans/vreko_signal_communicaton.md Appendix A.4
 */

import * as vscode from "vscode";
import { RingBuffer } from "./RingBuffer";
import type {
	DisclosureTier,
	IntelligenceCaptureEventData,
	LearningAddedEventData,
	LearningPromotedEventData,
	LearningPrunedEventData,
	MilestoneState,
	RiskFragileDetectedEventData,
	RiskUpdatedEventData,
	SessionStartedEventData,
	SnapshotCreatedEventData,
	UserInfo,
} from "./types";

// Default milestone state
const _DEFAULT_MILESTONES: MilestoneState = {
	firstSnapshotShown: false,
	firstAIDetectionShown: false,
	tenthSnapshotShown: false,
	firstFragileShown: false,
	firstClosingCeremonyShown: false,
	largeRiskyDismissed: false,
};

/**
 * Unified SignalState class
 *
 * Thread-safe state management for all signal communication.
 * All mutations happen through event handlers.
 */
export class SignalState {
	// =========================================================================
	// Session-scoped (reset on session.started)
	// =========================================================================
	currentSessionId: string | null = null;
	sessionName: string | null = null;
	private _sessionStartTime = 0;
	snapshotCountSession = 0;
	filesModifiedSession: Set<string> = new Set();
	aiToolsDetected: string[] = [];
	learningsAddedSession = 0;
	fragileFilesTouchedSession = 0;

	// =========================================================================
	// Workspace-scoped (persisted to workspaceState)
	// =========================================================================
	fileChangeCounts: Map<string, number> = new Map();
	aiModifiedFiles: Set<string> = new Set();
	fragileFiles: Map<string, string> = new Map();

	// =========================================================================
	// Milestones (persisted to workspaceState)
	// =========================================================================
	firstSnapshotShown = false;
	firstAIDetectionShown = false;
	tenthSnapshotShown = false;
	firstFragileShown = false;
	firstClosingCeremonyShown = false;
	/** Persisted: user dismissed largeRiskyChange toast; suppress future toasts */
	largeRiskyDismissed = false;

	// =========================================================================
	// Lifetime (persisted to globalState, cross-workspace)
	// =========================================================================
	snapshotCountLifetime = 0;

	// =========================================================================
	// User Info (from authentication, updated on login/logout)
	// =========================================================================
	userInfo: UserInfo | undefined;

	// =========================================================================
	// Intelligence (updated by events, defaults safe for unwired)
	// =========================================================================
	learningCount = 0;
	fragileFileCount = 0;
	patternCount = 0;
	currentRiskLevel = "normal";
	riskReason = "";

	// =========================================================================
	// Ring buffer (10 internal, 1 rendered)
	// =========================================================================
	recentEvents: RingBuffer = new RingBuffer(10);

	// =========================================================================
	// Event emitter for state changes
	// =========================================================================
	private _onChanged = new vscode.EventEmitter<void>();
	readonly onChanged = this._onChanged.event;

	/** Notify subscribers of an external state change (e.g. user info update). */
	notifyChanged(): void {
		this._onChanged.fire();
	}

	// =========================================================================
	// Computed Properties
	// =========================================================================

	/**
	 * User disclosure tier based on lifetime snapshot count
	 * - new: < 5 snapshots
	 * - active: 5-49 snapshots
	 * - power: 50+ snapshots
	 */
	get tier(): DisclosureTier {
		if (this.snapshotCountLifetime < 5) {
			return "new";
		}
		if (this.snapshotCountLifetime < 50) {
			return "active";
		}
		return "power";
	}

	/**
	 * Current session duration in milliseconds
	 */
	get sessionDuration(): number {
		return this._sessionStartTime > 0 ? Date.now() - this._sessionStartTime : 0;
	}

	/**
	 * Session start time (Unix ms)
	 */
	get sessionStartTime(): number {
		return this._sessionStartTime;
	}

	// =========================================================================
	// Event Handlers
	// =========================================================================

	/**
	 * Handle snapshot.created event
	 */
	onSnapshotCreated(data: SnapshotCreatedEventData): void {
		this.snapshotCountSession++;
		this.snapshotCountLifetime++;
		this.recentEvents.push({
			description: `Snapshot: ${data.name}`,
			timestamp: Date.now(),
		});
		this._onChanged.fire();
	}

	/**
	 * Handle session.started event
	 */
	onSessionStarted(data: SessionStartedEventData): void {
		this.currentSessionId = data.taskId;
		this.sessionName = data.sessionName;
		this._sessionStartTime = Date.now();

		// Reset session-scoped counters
		this.snapshotCountSession = 0;
		this.filesModifiedSession.clear();
		this.aiToolsDetected = [];
		this.learningsAddedSession = 0;
		this.fragileFilesTouchedSession = 0;

		// Briefing data from daemon (or safe defaults if unwired)
		this.learningCount = data.learningCount ?? this.learningCount;
		this.fragileFileCount = data.fragileCount ?? this.fragileFileCount;

		this._onChanged.fire();
	}

	/**
	 * Handle session.ended event
	 */
	onSessionEnded(): void {
		this.currentSessionId = null;
		this.sessionName = null;
		this._sessionStartTime = 0;
		this._onChanged.fire();
	}

	/**
	 * Handle intelligence.capture event
	 */
	onIntelligenceCapture(data: IntelligenceCaptureEventData): void {
		if (data.actor.type === "ai" && data.actor.tool && !this.aiToolsDetected.includes(data.actor.tool)) {
			this.aiToolsDetected.push(data.actor.tool);
		}
		this._onChanged.fire();
	}

	/**
	 * Handle learning.added event
	 */
	onLearningAdded(_data: LearningAddedEventData): void {
		this.learningCount++;
		this.learningsAddedSession++;
		this._onChanged.fire();
	}

	/**
	 * Handle learning.pruned event
	 */
	onLearningPruned(_data: LearningPrunedEventData): void {
		this.learningCount = Math.max(0, this.learningCount - 1);
		this._onChanged.fire();
	}

	/**
	 * Handle learning.promoted event (pattern promotion)
	 */
	onLearningPromoted(data: LearningPromotedEventData): void {
		this.patternCount++;
		if (data.type === "fragile_file") {
			// Update fragile file tracking
			this.fragileFileCount = this.fragileFiles.size;
		}
		// Add to ring buffer for "Last event" tooltip (§1.2)
		this.recentEvents.push({
			description: `Pattern: ${data.type} learned`,
			timestamp: Date.now(),
		});
		this._onChanged.fire();
	}

	/**
	 * Handle risk.updated event
	 */
	onRiskUpdated(data: RiskUpdatedEventData): void {
		this.currentRiskLevel = data.newLevel ?? "normal";
		this.riskReason = data.reason ?? "";
		this._onChanged.fire();
	}

	/**
	 * Handle risk.fragile-detected event
	 */
	onFragileDetected(data: RiskFragileDetectedEventData): void {
		this.fragileFiles.set(data.file, data.reason);
		this.fragileFileCount = this.fragileFiles.size;
		this._onChanged.fire();
	}

	/**
	 * Handle watch.file-changed event
	 */
	onFileChanged(filePath: string): void {
		// Update file change counts for heat decorations
		const currentCount = this.fileChangeCounts.get(filePath) ?? 0;
		this.fileChangeCounts.set(filePath, currentCount + 1);
		this.filesModifiedSession.add(filePath);
		this._onChanged.fire();
	}

	/**
	 * Handle AI-modified file tracking
	 */
	onAIModifiedFile(filePath: string): void {
		this.aiModifiedFiles.add(filePath);
		this._onChanged.fire();
	}

	// =========================================================================
	// Persistence
	// =========================================================================

	/**
	 * Persist state to VS Code storage
	 */
	persist(context: vscode.ExtensionContext): void {
		// Lifetime counters to globalState
		context.globalState.update("vreko.snapshotCountLifetime", this.snapshotCountLifetime);

		// Milestones to workspaceState
		context.workspaceState.update("vreko.milestones", {
			firstSnapshotShown: this.firstSnapshotShown,
			firstAIDetectionShown: this.firstAIDetectionShown,
			tenthSnapshotShown: this.tenthSnapshotShown,
			firstFragileShown: this.firstFragileShown,
			firstClosingCeremonyShown: this.firstClosingCeremonyShown,
			largeRiskyDismissed: this.largeRiskyDismissed,
		});
	}

	/**
	 * Restore state from VS Code storage
	 */
	restore(context: vscode.ExtensionContext): void {
		// Restore lifetime counters
		this.snapshotCountLifetime = context.globalState.get("vreko.snapshotCountLifetime", 0);

		// Restore milestones
		const milestones = context.workspaceState.get<Partial<MilestoneState>>("vreko.milestones", {});
		this.firstSnapshotShown = milestones.firstSnapshotShown ?? false;
		this.firstAIDetectionShown = milestones.firstAIDetectionShown ?? false;
		this.tenthSnapshotShown = milestones.tenthSnapshotShown ?? false;
		this.firstFragileShown = milestones.firstFragileShown ?? false;
		this.firstClosingCeremonyShown = milestones.firstClosingCeremonyShown ?? false;
		this.largeRiskyDismissed = milestones.largeRiskyDismissed ?? false;
	}

	/**
	 * Mark a milestone as shown
	 */
	markMilestoneShown(milestone: keyof MilestoneState): void {
		switch (milestone) {
			case "firstSnapshotShown":
				this.firstSnapshotShown = true;
				break;
			case "firstAIDetectionShown":
				this.firstAIDetectionShown = true;
				break;
			case "tenthSnapshotShown":
				this.tenthSnapshotShown = true;
				break;
			case "firstFragileShown":
				this.firstFragileShown = true;
				break;
			case "firstClosingCeremonyShown":
				this.firstClosingCeremonyShown = true;
				break;
			case "largeRiskyDismissed":
				this.largeRiskyDismissed = true;
				break;
		}
	}

	/**
	 * Check if a milestone has been shown
	 */
	isMilestoneShown(milestone: keyof MilestoneState): boolean {
		switch (milestone) {
			case "firstSnapshotShown":
				return this.firstSnapshotShown;
			case "firstAIDetectionShown":
				return this.firstAIDetectionShown;
			case "tenthSnapshotShown":
				return this.tenthSnapshotShown;
			case "firstFragileShown":
				return this.firstFragileShown;
			case "firstClosingCeremonyShown":
				return this.firstClosingCeremonyShown;
			case "largeRiskyDismissed":
				return this.largeRiskyDismissed;
			default:
				return false;
		}
	}

	/**
	 * Get file heat level for decorations
	 */
	getFileHeat(filePath: string): "normal" | "warm" | "hot" {
		const count = this.fileChangeCounts.get(filePath) ?? 0;
		if (count >= 10) {
			return "hot";
		}
		if (count >= 5) {
			return "warm";
		}
		return "normal";
	}

	/**
	 * Get file decoration type
	 */
	getFileDecoration(filePath: string): { type: string; tooltip: string } | null {
		const isAI = this.aiModifiedFiles.has(filePath);
		const isFragile = this.fragileFiles.has(filePath);
		const heat = this.getFileHeat(filePath);

		// Build decoration
		if (isAI && heat === "hot") {
			return { type: "ai-hot", tooltip: "AI + high activity" };
		}
		if (isAI) {
			const tool = this.aiToolsDetected[0] ?? "AI";
			return { type: "ai-modified", tooltip: `Modified by ${tool}` };
		}
		if (isFragile) {
			const reason = this.fragileFiles.get(filePath) ?? "fragile";
			return { type: "fragile", tooltip: `Fragile: ${reason}` };
		}
		if (heat === "hot") {
			const count = this.fileChangeCounts.get(filePath) ?? 0;
			return { type: "hot", tooltip: `High activity: ${count} changes` };
		}
		if (heat === "warm") {
			const count = this.fileChangeCounts.get(filePath) ?? 0;
			return { type: "warm", tooltip: `${count} changes this session` };
		}

		return null;
	}

	// =========================================================================
	// User Info Helpers
	// =========================================================================

	/**
	 * Get display label for Pioneer status
	 */
	getPioneerLabel(): string {
		return "Pioneer";
	}

	/**
	 * Get formatted tier string for tooltip display
	 */
	getTierDisplayText(): string {
		if (!this.userInfo) {
			return "";
		}

		if (this.userInfo.isPioneer) {
			return `${this.getPioneerLabel()} 🌱`;
		}

		// Capitalize subscription tier
		const tier = this.userInfo.subscriptionTier;
		return tier.charAt(0).toUpperCase() + tier.slice(1);
	}

	/**
	 * Dispose resources
	 */
	dispose(): void {
		this._onChanged.dispose();
	}
}
