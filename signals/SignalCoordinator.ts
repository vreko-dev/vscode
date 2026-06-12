/**
 * SignalCoordinator - Central Signal Communication Coordinator
 *
 * Brings together SignalState, SignalEventBus, StatusFlagManager, and NotificationQueue.
 * Handles all daemon events with graceful degradation for unwired events.
 *
 * Responsibilities:
 * - Subscribes to SignalEventBus events
 * - Updates SignalState from events
 * - Manages StatusFlagManager for status bar
 * - Queues notifications via NotificationQueue
 * - Handles milestones and progressive disclosure
 * - Graceful degradation for missing daemon data
 *
 * @module signals/SignalCoordinator
 * @see docs/plans/vreko_signal_communicaton.md
 */

import { PIONEER_EVENTS } from "@vreko/contracts/pioneer";
import * as vscode from "vscode";
import { ApiClient } from "../services/api-client";
import type { DaemonBridge } from "../services/DaemonBridge";
import { getActivationFunnel } from "../telemetry/ActivationFunnelIntegration";
import { FunnelType } from "../telemetry/TelemetryFunnel";
import type { AIInsights, AIInsightsInput } from "../types/ai-insights";
import { type ClosingCeremonyData, showClosingCeremony } from "../ui/ClosingCeremonyUI";
import { logger } from "../utils/logger";
import { NOTIFICATION_PRIORITY, type NotificationQueue } from "./NotificationQueue";
import type { SignalEventBus } from "./SignalEventBus";
import { SignalState } from "./SignalState";
import { StatusFlagManager } from "./StatusFlagManager";
import type {
	GuardChangedEventData,
	HealthDegradedEventData,
	HealthRecoveredEventData,
	LearningPromotedEventData,
	ProtectionChangedEventData,
	SessionReview,
	StatusFlagKey,
	SubscriptionTier,
	SyncCompletedEventData,
	SyncFailedEventData,
	UserInfo,
	ViolationReportedEventData,
	VrekoSignalEvent,
	WorkspaceHealthEventData,
} from "./types";

// Pattern promotion copy from spec Section 2.2
const PATTERN_COPY: Record<
	string,
	{ text: string; codicon: string; tooltip: (data: LearningPromotedEventData) => string }
> = {
	co_change: {
		text: "Pattern learned",
		codicon: "$(link)",
		tooltip: (data) => `Co-change pattern detected: ${data.content}`,
	},
	fragile_file: {
		text: "Fragile file detected",
		codicon: "🦎",
		tooltip: (data) => `Fragile file: ${data.content}`,
	},
	rollback_correlation: {
		text: "Rollback pattern",
		codicon: "$(warning)",
		tooltip: (data) => `Vreko saw it coming  -  ${data.content}`,
	},
};

/**
 * SignalCoordinator - Main entry point for signal communication
 */
export class SignalCoordinator implements vscode.Disposable {
	private context: vscode.ExtensionContext;
	private signalState: SignalState;
	private eventBus: SignalEventBus;
	private flagManager: StatusFlagManager;
	private notificationQueue: NotificationQueue;
	private daemonBridge?: DaemonBridge;

	// Milestone tracking
	private lastPatternShownAt = 0;
	private readonly PATTERN_GATE_MS = 5 * 60 * 1000; // 5 minutes

	// Degradation tracking
	private lastDegradationNotificationAt = 0;
	private readonly DEGRADATION_GATE_MS = 10 * 60 * 1000; // 10 minutes

	// Large risk notification tracking
	private lastLargeRiskNotificationAt = 0;
	private readonly LARGE_RISK_GATE_MS = 10 * 60 * 1000; // 10 minutes

	// Disposables
	private disposables: vscode.Disposable[] = [];

	/**
	 * Create a new SignalCoordinator
	 */
	constructor(
		context: vscode.ExtensionContext,
		eventBus: SignalEventBus,
		notificationQueue: NotificationQueue,
		daemonBridge?: DaemonBridge,
	) {
		this.context = context;
		this.eventBus = eventBus;
		this.notificationQueue = notificationQueue;
		this.daemonBridge = daemonBridge;

		// Initialize state
		this.signalState = new SignalState();
		this.signalState.restore(context);

		// Initialize flag manager
		this.flagManager = new StatusFlagManager(this.signalState);

		// Subscribe to events
		this.subscribeToEvents();

		// Listen for state changes to persist
		this.disposables.push(
			this.signalState.onChanged(() => {
				this.signalState.persist(context);
			}),
		);

		logger.info("SignalCoordinator initialized", {
			tier: this.signalState.tier,
			snapshotCountLifetime: this.signalState.snapshotCountLifetime,
		});
	}

	// =========================================================================
	// Event Subscription
	// =========================================================================

	/**
	 * Subscribe to all signal events
	 */
	private subscribeToEvents(): void {
		const disposable = this.eventBus.event((event) => {
			try {
				this.handleEvent(event);
			} catch (err) {
				// FM-5: Prevent uncaught throws from propagating back through
				// SignalEventBus._emitter.fire() and crashing the IPC handler.
				// Without this guard, one bad event silently drops all future events.
				logger.error("[SignalCoordinator] Unhandled error in handleEvent  -  event dropped", {
					type: event.type,
					error: err instanceof Error ? err.message : String(err),
				});
			}
		});
		this.disposables.push(disposable);
	}

	/**
	 * Handle incoming signal events with graceful degradation
	 */
	private handleEvent(event: VrekoSignalEvent): void {
		switch (event.type) {
			case "snapshot.created":
				this.handleSnapshotCreated(event.data);
				break;
			case "snapshot.restored":
				this.handleSnapshotRestored(event.data);
				break;
			case "session.started":
				this.handleSessionStarted(event.data);
				break;
			case "session.ended":
				this.handleSessionEnded(event.data);
				break;
			case "intelligence.capture":
				this.handleIntelligenceCapture(event.data);
				break;
			case "risk.updated":
				this.handleRiskUpdated(event.data);
				break;
			case "risk.fragile-detected":
				this.handleFragileDetected(event.data);
				break;
			case "learning.added":
				this.handleLearningAdded(event.data);
				break;
			case "learning.promoted":
				this.handleLearningPromoted(event.data);
				break;
			case "learning.pruned":
				this.handleLearningPruned(event.data);
				break;
			case "daemon.started":
				this.handleDaemonStarted();
				break;
			case "daemon.shutdown":
				this.handleDaemonShutdown(event.data.reason);
				break;
			case "watch.file-changed":
				this.handleFileChanged(event.data.file);
				break;
			case "momentum.score-updated":
				// Not yet implemented in UI
				break;

			// Health monitoring events (SB-HEALTH-001)
			case "health.degraded":
				this.handleHealthDegraded(event.data);
				break;
			case "health.recovered":
				this.handleHealthRecovered(event.data);
				break;
			case "protection.changed":
				this.handleProtectionChanged(event.data);
				break;
			case "violation.reported":
				this.handleViolationReported(event.data);
				break;
			case "sync.completed":
				this.handleSyncCompleted(event.data);
				break;
			case "sync.failed":
				this.handleSyncFailed(event.data);
				break;
			case "workspace.health":
				this.handleWorkspaceHealth(event.data);
				break;
			case "guard.changed":
				this.handleGuardChanged(event.data);
				break;
		}
	}

	// =========================================================================
	// Event Handlers
	// =========================================================================

	/**
	 * Handle snapshot.created event
	 */
	private handleSnapshotCreated(data: { id: string; name: string; fileCount?: number; aiAttributed: boolean }): void {
		// Update state
		this.signalState.onSnapshotCreated(data);

		// Set checkpoint flag
		this.flagManager.setFlag("checkpoint");

		// Milestone #1: First snapshot
		if (!this.signalState.isMilestoneShown("firstSnapshotShown") && this.signalState.snapshotCountSession === 1) {
			this.signalState.markMilestoneShown("firstSnapshotShown");
			// Status bar shows this via flag, no notification needed
		}

		// Milestone #3: 10th snapshot
		if (!this.signalState.isMilestoneShown("tenthSnapshotShown") && this.signalState.snapshotCountLifetime === 10) {
			this.signalState.markMilestoneShown("tenthSnapshotShown");
			// Tooltip gains persistent message
		}

		// Pioneer funnel step 5: first snapshot
		if (!this.context.globalState.get<boolean>("vreko.pioneer.firstSnapshot", false)) {
			void this.context.globalState.update("vreko.pioneer.firstSnapshot", true);
			getActivationFunnel()?.trackStep(FunnelType.ACTIVATION, PIONEER_EVENTS.FIRST_SNAPSHOT, {
				step: 5,
				timestamp: Date.now(),
			});
		}
	}

	/**
	 * Handle snapshot.restored event (Hero moment)
	 */
	private handleSnapshotRestored(data: {
		id: string;
		name: string;
		fileCount: number;
		lineCount: number;
		aiTool?: string;
	}): void {
		// Set recovery flag
		this.flagManager.setFlag("recovery", {
			text: `Restored ${data.fileCount} files`,
		});

		// Build AI attribution for recovery notification
		const aiAttribution = data.aiTool ? ` · AI changes by ${data.aiTool} reverted` : "";

		// Recovery celebration notification (NO auto-dismiss)
		const snapshotId = data.id;
		void this.notificationQueue.push(`recovery-${snapshotId}`, NOTIFICATION_PRIORITY.RECOVERY, () =>
			vscode.window
				.showInformationMessage(`$(history) Restored to "${data.name}"${aiAttribution}`, "View Diff", "Dismiss")
				.then((choice) => {
					if (choice === "View Diff") {
						void vscode.commands.executeCommand("vreko.diffSnapshot", snapshotId);
					}
					return choice;
				}),
		);
	}

	/**
	 * Handle session.started event
	 */
	private handleSessionStarted(data: {
		taskId: string;
		sessionName: string;
		learningCount?: number;
		fragileCount?: number;
	}): void {
		// Graceful degradation: ensure required fields exist
		const safeData = {
			taskId: data.taskId,
			sessionName: data.sessionName,
			learningCount: data.learningCount ?? 0,
			fragileCount: data.fragileCount ?? 0,
		};

		this.signalState.onSessionStarted(safeData);

		// Pioneer funnel step 4: first session
		if (!this.context.globalState.get<boolean>("vreko.pioneer.firstSession", false)) {
			void this.context.globalState.update("vreko.pioneer.firstSession", true);
			getActivationFunnel()?.trackStep(FunnelType.ACTIVATION, PIONEER_EVENTS.FIRST_SESSION, {
				step: 4,
				timestamp: Date.now(),
			});
		}

		// Clear any stale flags
		this.flagManager.clearFlag("recovery");
	}

	/**
	 * Handle session.ended event (Closing ceremony)
	 */
	private handleSessionEnded(data: { taskId: string; sessionName?: string; duration?: number }): void {
		// Capture before reset  -  onSessionEnded() clears sessionName and sessionDuration
		const preResetDuration = this.signalState.sessionDuration;
		const preResetName = this.signalState.sessionName;
		this.signalState.onSessionEnded();

		// Trigger closing ceremony with captured values
		void this.showClosingCeremony(data.taskId, preResetDuration, preResetName);
	}

	/**
	 * Handle intelligence.capture event
	 */
	private handleIntelligenceCapture(data: {
		actor: { type: string; tool?: string; confidence?: number };
		pathHash: string;
	}): void {
		this.signalState.onIntelligenceCapture(data);

		// Set AI session flag
		if (data.actor.tool) {
			this.flagManager.setFlag("ai_session", {
				text: `${data.actor.tool} active`,
			});

			// Track AI-modified file
			this.signalState.onAIModifiedFile(data.pathHash);

			// Milestone #2: First AI detection
			if (!this.signalState.isMilestoneShown("firstAIDetectionShown")) {
				this.signalState.markMilestoneShown("firstAIDetectionShown");
				void this.notificationQueue.push("milestone-ai", NOTIFICATION_PRIORITY.MILESTONE_AI, () =>
					vscode.window.showInformationMessage(
						`$(sparkle) Detected ${data.actor.tool}. AI-assisted changes will be protected automatically.`,
					),
				);
			}
		}
	}

	/**
	 * Handle risk.updated event
	 */
	private handleRiskUpdated(data: {
		previousLevel?: string;
		newLevel?: string;
		reason?: string;
		affectedFiles?: string[];
	}): void {
		// Graceful degradation: ensure required fields
		if (!data.newLevel || !data.reason) {
			logger.warn("[SignalCoordinator] risk.updated missing level/reason  -  using defaults");
		}

		const safeData = {
			previousLevel: data.previousLevel ?? "normal",
			newLevel: data.newLevel ?? "normal",
			reason: data.reason ?? "",
			affectedFiles: data.affectedFiles ?? [],
		};

		this.signalState.onRiskUpdated(safeData);

		// Only show elevated flag for threshold increases
		if (safeData.newLevel !== "normal" && safeData.newLevel !== safeData.previousLevel) {
			// Don't show for risk decreasing
			const levels = ["normal", "elevated", "high", "critical"];
			const prevIndex = levels.indexOf(safeData.previousLevel);
			const newIndex = levels.indexOf(safeData.newLevel);

			if (newIndex > prevIndex) {
				this.flagManager.setFlag("elevated");
			}
		}

		// largeRiskyChange: critical level + AI active + affected file present + gate
		// Context7: no $(icon) in showWarningMessage strings; use plain text
		if (
			safeData.newLevel === "critical" &&
			safeData.affectedFiles.length > 0 &&
			this.signalState.aiToolsDetected.length > 0 &&
			!this.signalState.isMilestoneShown("largeRiskyDismissed")
		) {
			const now = Date.now();
			if (now - this.lastLargeRiskNotificationAt >= this.LARGE_RISK_GATE_MS) {
				this.lastLargeRiskNotificationAt = now;
				const fileName = safeData.affectedFiles[0].split("/").pop() ?? safeData.affectedFiles[0];
				const aiTool = this.signalState.aiToolsDetected[0];
				void this.notificationQueue.push("large-risky-change", NOTIFICATION_PRIORITY.LARGE_RISK, async () => {
					const result = await vscode.window.showWarningMessage(
						`Large change detected in ${fileName} · ${aiTool}-attributed · Vreko saw it coming`,
						"Snapshot now",
						"Dismiss",
					);
					if (result === "Snapshot now") {
						void vscode.commands.executeCommand("vreko.createSnapshot");
					}
					return result ?? undefined;
				});
			}
		}
	}

	/**
	 * Handle risk.fragile-detected event
	 */
	private handleFragileDetected(data: { file: string; reason: string; observationCount?: number }): void {
		this.signalState.onFragileDetected(data);

		// Milestone #4: First fragile file
		if (!this.signalState.isMilestoneShown("firstFragileShown")) {
			this.signalState.markMilestoneShown("firstFragileShown");

			// Show notification with Learn More action
			void this.notificationQueue.push("milestone-fragile", NOTIFICATION_PRIORITY.MILESTONE_FRAGILE, async () => {
				const result = await vscode.window.showInformationMessage(
					`🦎 ${data.file} identified as fragile  -  extra protection active.`,
					"Learn More",
				);
				if (result === "Learn More") {
					void vscode.env.openExternal(vscode.Uri.parse("https://docs.vreko.dev/features/fragile-files"));
				}
				return result;
			});
		}
	}

	/**
	 * Handle learning.added event
	 */
	private handleLearningAdded(data: { id: string; type: string; content: string; tier?: string }): void {
		this.signalState.onLearningAdded(data);
	}

	/**
	 * Handle learning.promoted event (Pattern promotion)
	 */
	private handleLearningPromoted(data: LearningPromotedEventData): void {
		this.signalState.onLearningPromoted(data);

		// Gate: only valid types, not for new users, 5 min cooldown
		const validTypes = ["co_change", "fragile_file", "rollback_correlation"];
		if (!validTypes.includes(data.type)) {
			logger.warn("SignalCoordinator: Unknown learning type  -  skipping notification gate", {
				type: data.type,
			});
			return;
		}
		if (this.signalState.tier === "new") {
			return;
		}

		const now = Date.now();
		if (now - this.lastPatternShownAt < this.PATTERN_GATE_MS) {
			return;
		}

		// Show pattern flag
		const copy = PATTERN_COPY[data.type];
		if (copy) {
			const duration = this.signalState.tier === "power" ? 3000 : 5000;
			this.flagManager.setFlag("pattern", {
				text: copy.text,
				codicon: copy.codicon,
				tooltipOverride: copy.tooltip(data),
				expiresAt: now + duration,
			});
		}

		this.lastPatternShownAt = now;
	}

	/**
	 * Handle learning.pruned event
	 */
	private handleLearningPruned(data: { id: string }): void {
		this.signalState.onLearningPruned(data);
	}

	/**
	 * Handle daemon.started event
	 */
	private handleDaemonStarted(): void {
		// Clear disconnected/degraded flags
		this.flagManager.clearFlag("disconnected");
		this.flagManager.clearFlag("degraded");
	}

	/**
	 * Handle daemon.shutdown event
	 */
	private handleDaemonShutdown(reason?: string): void {
		this.flagManager.setFlag("disconnected");

		// FM-8: Clear all stale health.degraded toasts that may have queued during
		// the crash sequence. Without this, they drain one-by-one after the daemon
		// is already gone, producing confusing sequential "unresponsive" messages.
		this.notificationQueue.clearPending();

		if (reason === "user_initiated") {
			return;
		}

		if (reason === "cli_missing") {
			// FM-6: CLI not found  -  actionable install message
			void this.notificationQueue.push("daemon-cli-missing", NOTIFICATION_PRIORITY.DEGRADATION, async () => {
				const result = await vscode.window.showErrorMessage(
					"Vreko CLI not found. Install it to enable protection.",
					"Install CLI",
					"Dismiss",
				);
				if (result === "Install CLI") {
					void vscode.env.openExternal(vscode.Uri.parse("https://vreko.dev/install"));
				}
				return result ?? undefined;
			});
			return;
		}

		if (reason === "exhausted") {
			// FM-6: Reconnect attempts exhausted  -  user needs manual intervention
			void this.notificationQueue.push("daemon-exhausted", NOTIFICATION_PRIORITY.DEGRADATION, async () => {
				const result = await vscode.window.showWarningMessage(
					"Vreko daemon stopped responding. Manual restart required.",
					"Restart Daemon",
					"Dismiss",
				);
				if (result === "Restart Daemon") {
					void vscode.commands.executeCommand("vreko.restartDaemon");
				}
				return result ?? undefined;
			});
			return;
		}

		// Unexpected shutdown  -  generic degradation notification
		void this.showDegradationNotification();
	}

	/**
	 * Handle file changed event
	 */
	private handleFileChanged(filePath: string): void {
		this.signalState.onFileChanged(filePath);
	}

	// =========================================================================
	// Health Monitoring Handlers (SB-HEALTH-001)
	// =========================================================================

	/**
	 * Handle health.degraded event
	 * Sets degraded flag and shows notification for critical components
	 */
	private handleHealthDegraded(data: HealthDegradedEventData): void {
		// Set degraded flag on status bar
		this.flagManager.setFlag("degraded");

		// Track degradation in state
		logger.warn("[SignalCoordinator] Component health degraded", {
			componentType: data.componentType,
			elapsed: data.elapsed,
		});

		// Show notification for supervisor degradation (critical component)
		if (data.componentType === "supervisor") {
			void this.notificationQueue.push("health-degraded", NOTIFICATION_PRIORITY.DEGRADATION, async () => {
				const result = await vscode.window.showWarningMessage(
					"Vreko supervisor unresponsive",
					"Restart",
					"Dismiss",
				);
				if (result === "Restart") {
					void vscode.commands.executeCommand("vreko.restartDaemon");
				}
				return result ?? undefined;
			});
		}
	}

	/**
	 * Handle health.recovered event
	 * Clears degraded flag and shows recovery notification
	 */
	private handleHealthRecovered(data: HealthRecoveredEventData): void {
		// Clear degraded flag
		this.flagManager.clearFlag("degraded");

		logger.info("[SignalCoordinator] Component health recovered", {
			componentType: data.componentType,
			previousMissed: data.previousMissed,
		});

		// Show recovery notification for significant recoveries
		if (data.previousMissed >= 3) {
			void this.notificationQueue.push("health-recovered", NOTIFICATION_PRIORITY.RECOVERY, () =>
				vscode.window.showInformationMessage(
					`$(check) Vreko ${data.componentType} recovered and protecting your work`,
				),
			);
		}
	}

	/**
	 * Handle protection.changed event
	 * Sets elevated flag when protection increases
	 */
	private handleProtectionChanged(data: ProtectionChangedEventData): void {
		const protectionOrder = ["none", "low", "medium", "high", "critical"];
		const prevIndex = protectionOrder.indexOf(data.previousLevel);
		const newIndex = protectionOrder.indexOf(data.level);

		// Only show elevated flag when protection increases
		if (newIndex > prevIndex) {
			this.flagManager.setFlag("elevated", {
				expiresAt: Date.now() + 3000, // 3 second expiry per spec
			});
		}

		logger.debug("[SignalCoordinator] Protection changed", {
			file: data.file,
			previousLevel: data.previousLevel,
			level: data.level,
		});
	}

	/**
	 * Handle violation.reported event
	 * Tracks in state for learning system (no notification)
	 */
	private handleViolationReported(data: ViolationReportedEventData): void {
		// Track violation for learning system - no user notification
		logger.debug("[SignalCoordinator] Violation reported", {
			type: data.violationType,
			file: data.file,
			message: data.message,
		});
	}

	/**
	 * Handle sync.completed event
	 * Updates state only
	 */
	private handleSyncCompleted(_data: SyncCompletedEventData): void {
		logger.debug("[SignalCoordinator] Sync completed successfully");
	}

	/**
	 * Handle sync.failed event
	 * Shows warning notification with retry button
	 */
	private handleSyncFailed(data: SyncFailedEventData): void {
		logger.warn("[SignalCoordinator] Sync failed", { error: data.error });

		void this.notificationQueue.push("sync-failed", NOTIFICATION_PRIORITY.DEGRADATION, async () => {
			const actions = data.retryable ? ["Retry", "Dismiss"] : ["Dismiss"];
			const result = await vscode.window.showWarningMessage(
				`$(sync-ignored) Sync failed: ${data.error}`,
				...actions,
			);
			if (result === "Retry") {
				void vscode.commands.executeCommand("vreko.syncNow");
			}
			return result ?? undefined;
		});
	}

	/**
	 * Handle workspace.health event
	 * Notifies when health score drops below threshold
	 */
	private handleWorkspaceHealth(data: WorkspaceHealthEventData): void {
		logger.debug("[SignalCoordinator] Workspace health update", {
			healthScore: data.healthScore,
			issueCount: data.issues.length,
		});

		// Notify when health score is critically low
		if (data.healthScore < 50) {
			const errorCount = data.issues.filter((i) => i.severity === "error").length;
			const warningCount = data.issues.filter((i) => i.severity === "warning").length;

			void this.notificationQueue.push("workspace-health", NOTIFICATION_PRIORITY.DEGRADATION, async () => {
				const result = await vscode.window.showWarningMessage(
					`Workspace health: ${data.healthScore}% (${errorCount} errors, ${warningCount} warnings)`,
					"View Issues",
					"Dismiss",
				);
				if (result === "View Issues") {
					void vscode.commands.executeCommand("vreko.showHealthPanel");
				}
				return result ?? undefined;
			});
		}
	}

	/**
	 * Handle guard.changed event
	 * Sets elevated flag when guards fail
	 */
	private handleGuardChanged(data: GuardChangedEventData): void {
		// Check if any guards transitioned to fail state
		const failedGuards = data.changed.filter((g) => g.currentState === "fail");
		const hasNewFailures = failedGuards.length > 0;

		if (hasNewFailures) {
			this.flagManager.setFlag("elevated", {
				expiresAt: Date.now() + 5000, // 5 second expiry per spec
			});

			logger.warn("[SignalCoordinator] Guards failed", {
				failed: failedGuards.map((g) => g.name),
			});
		}

		// Log all guard state changes
		logger.debug("[SignalCoordinator] Guard changed", {
			changed: data.changed.length,
			current: `${data.current.filter((g) => g.state === "fail").length} failing`,
		});
	}

	// =========================================================================
	// Closing Ceremony
	// =========================================================================

	/**
	 * Show closing ceremony with timeout fallback
	 *
	 * Delegates to the existing ClosingCeremonyUI while providing
	 * fallback data when daemon is unavailable.
	 */
	private async showClosingCeremony(
		sessionId: string,
		preResetDuration = 0,
		preResetName: string | null = null,
	): Promise<void> {
		// Mark milestone
		if (!this.signalState.isMilestoneShown("firstClosingCeremonyShown")) {
			this.signalState.markMilestoneShown("firstClosingCeremonyShown");
			// Pioneer funnel step 6: first ceremony (guard IS the idempotency mechanism)
			getActivationFunnel()?.trackStep(FunnelType.ACTIVATION, PIONEER_EVENTS.FIRST_CEREMONY, {
				step: 6,
				timestamp: Date.now(),
			});
		}

		const workspacePath =
			this.context.workspaceState.get<string>("workspaceRoot") ??
			vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ??
			"";

		// Build local review immediately  -  always available, used for AI insights
		// and as fallback when daemon is unreachable.
		const localReview = this.buildReviewFromSignalState(preResetDuration, preResetName);

		// Pre-fire AI insights (Pro feature, non-blocking)
		// By the time user clicks "View Details", insights should be ready
		const insightsPromise = this.fireAIInsights(localReview);

		// Try daemon for rich ceremony data:
		// coherenceScore, concurrentSessions, fragileFilesInSession, topLearnings
		const daemonCeremony = await this.getClosingCeremonyFromDaemon(workspacePath, sessionId);

		const ceremonyData: ClosingCeremonyData = daemonCeremony
			? { ...daemonCeremony, insightsPromise }
			: {
					sessionId: localReview.sessionId,
					workspacePath,
					duration: localReview.duration,
					learningsCaptured: localReview.learningsAdded,
					fragileFilesInSession: [],
					tokensSaved: localReview.tokenSavingsEstimate,
					tokensSavedIsEstimate: true,
					coherenceScore: "medium",
					coherenceRationale: "Session completed",
					checkpointsCreated: localReview.snapshotCount,
					healthDelta: null,
					concurrentSessions: null,
					topLearnings: [],
					insightsPromise,
				};

		// Delegate to existing ClosingCeremonyUI
		await showClosingCeremony(ceremonyData);
	}

	/**
	 * Fetch full closing ceremony data from daemon with a 3s timeout.
	 * Returns null when daemon is unavailable or the request fails.
	 *
	 * Prefer this over the thin session.review RPC to get:
	 * coherenceScore, concurrentSessions, fragileFilesInSession, topLearnings.
	 */
	private async getClosingCeremonyFromDaemon(
		workspacePath: string,
		sessionId: string,
	): Promise<ClosingCeremonyData | null> {
		if (!this.daemonBridge) {
			return null;
		}

		const timeout = new Promise<null>((resolve) =>
			setTimeout(() => {
				logger.debug("[SignalCoordinator] getClosingCeremony timed out  -  using local fallback");
				resolve(null);
			}, 3000),
		);

		try {
			const result = await Promise.race([
				this.daemonBridge.getClosingCeremony(workspacePath, sessionId),
				timeout,
			]);
			return result ?? null;
		} catch (error) {
			logger.debug("[SignalCoordinator] getClosingCeremony RPC failed  -  using local fallback", { error });
			return null;
		}
	}

	/**
	 * Build session review from local SignalState
	 */
	private buildReviewFromSignalState(preResetDuration = 0, preResetName: string | null = null): SessionReview {
		const state = this.signalState;

		return {
			sessionId: state.currentSessionId ?? "unknown",
			sessionName: preResetName ?? state.sessionName ?? "Coding session",
			duration: preResetDuration || state.sessionDuration,
			snapshotCount: state.snapshotCountSession,
			fileCount: state.filesModifiedSession.size,
			aiDetected: state.aiToolsDetected.length > 0,
			aiTools: state.aiToolsDetected.map((tool) => ({
				tool,
				confidence: 0.8, // Local tracking doesn't have per-tool confidence
				editCount: 0, // Unavailable locally
			})),
			learningsAdded: state.learningsAddedSession,
			learningsApplied: 0, // Only daemon knows this
			patternsReinforced: 0, // Only daemon knows this
			fragileFilesTouched: state.fragileFilesTouchedSession,
			tokenSavingsEstimate: 0, // Only daemon can estimate
			pitfallsAvoided: 0, // Only daemon can estimate
			summary: `Session with ${state.snapshotCountSession} snapshots across ${state.filesModifiedSession.size} files`,
		};
	}

	/**
	 * Fire AI insights request (Pro feature, non-blocking)
	 *
	 * Pre-fire pattern: Call immediately when session ends.
	 * By the time user clicks "View Details", insights are ready.
	 *
	 * @param review - Session review data
	 * @returns Promise that resolves to AI insights or null
	 */
	private fireAIInsights(review: SessionReview): Promise<AIInsights | null> {
		const client = new ApiClient();

		// Build AI insights input from session review
		// Note: Some data is approximated since full pattern data isn't available locally
		const input: AIInsightsInput = {
			sessionId: review.sessionId,
			session: {
				mode: review.aiDetected ? "ai-assisted" : "manual",
				domains: this.inferDomainsFromFiles(review.fileCount),
				violationCount: review.fragileFilesTouched,
				scopeType: review.fileCount > 20 ? "wide" : review.fileCount > 5 ? "moderate" : "focused",
			},
			patterns: {
				total: review.patternsReinforced + review.learningsAdded,
				byType: {
					learning: review.learningsAdded,
					pattern: review.patternsReinforced,
				},
				byDomain: {}, // Not available locally
				avgConfidence: 0.75, // Default confidence
				regressionRate: review.pitfallsAvoided / Math.max(review.snapshotCount, 1),
			},
			query: {
				type: "synthesis",
			},
		};

		// Fire and return promise (don't await - non-blocking)
		return client.generateInsights(input).catch((error) => {
			logger.debug("AI insights request failed", { error });
			return null;
		});
	}

	/**
	 * Infer domains from file count (simplified)
	 *
	 * Full domain inference would require file path analysis.
	 * This provides a reasonable approximation for the AI prompt.
	 */
	private inferDomainsFromFiles(_fileCount: number): string[] {
		// Domain inference requires actual file path analysis, which is not available here.
		// Return empty array  -  consumers should handle absence gracefully.
		return [];
	}

	// =========================================================================
	// Degradation Notification
	// =========================================================================

	/**
	 * Show degradation notification with 10-minute gate
	 */
	private showDegradationNotification(): void {
		const now = Date.now();
		if (now - this.lastDegradationNotificationAt < this.DEGRADATION_GATE_MS) {
			return; // Too soon
		}

		this.lastDegradationNotificationAt = now;

		void this.notificationQueue.push("degradation", NOTIFICATION_PRIORITY.DEGRADATION, async () => {
			const result = await vscode.window.showWarningMessage(
				"Vreko protection paused  -  daemon unresponsive, reconnecting...",
				"Restart Daemon",
				"Dismiss",
			);

			if (result === "Restart Daemon") {
				void vscode.commands.executeCommand("vreko.restartDaemon");
			}

			return result ?? undefined;
		});
	}

	// =========================================================================
	// Public API
	// =========================================================================

	/**
	 * Set a status flag
	 */
	setFlag(key: StatusFlagKey, flag?: Partial<import("./types").StatusFlag>): void {
		this.flagManager.setFlag(key, flag);
	}

	/**
	 * Clear a status flag
	 */
	clearFlag(key: StatusFlagKey): void {
		this.flagManager.clearFlag(key);
	}

	/**
	 * Get the current SignalState
	 */
	getState(): SignalState {
		return this.signalState;
	}

	/**
	 * Get the StatusFlagManager
	 */
	getFlagManager(): StatusFlagManager {
		return this.flagManager;
	}

	/**
	 * Update user info from authentication state
	 * Call this when user logs in, logs out, or auth state changes
	 *
	 * @param username - Display username
	 * @param subscriptionTier - Subscription tier from credentials
	 * @param isPioneer - Whether user is a Pioneer program participant
	 */
	updateUserInfo(
		username: string | undefined,
		subscriptionTier: SubscriptionTier | undefined,
		isPioneer?: boolean,
	): void {
		if (!username || !subscriptionTier) {
			// User logged out - clear user info
			this.signalState.userInfo = undefined;
			logger.debug("SignalCoordinator: User info cleared (logout)");
		} else {
			// User logged in - update user info
			this.signalState.userInfo = {
				username,
				subscriptionTier,
				isPioneer,
			};
			logger.debug("SignalCoordinator: User info updated", {
				username,
				subscriptionTier,
				isPioneer: isPioneer ?? false,
			});
		}

		// Trigger state change to re-render tooltip
		this.signalState.notifyChanged();
	}

	/**
	 * Update user info from a UserInfo object
	 */
	setUserInfo(userInfo: UserInfo | undefined): void {
		this.signalState.userInfo = userInfo;
		this.signalState.notifyChanged();
		logger.debug("SignalCoordinator: User info set", {
			username: userInfo?.username,
			subscriptionTier: userInfo?.subscriptionTier,
			isPioneer: userInfo?.isPioneer ?? false,
		});
	}

	/**
	 * Force refresh of status bar
	 */
	refresh(): void {
		this.flagManager.refresh();
	}

	// =========================================================================
	// Lifecycle
	// =========================================================================

	/**
	 * Dispose all resources
	 */
	dispose(): void {
		for (const d of this.disposables) {
			d.dispose();
		}
		this.disposables = [];
		this.flagManager.dispose();
		this.signalState.dispose();
	}
}
