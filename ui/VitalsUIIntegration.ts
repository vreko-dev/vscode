/**
 * VitalsUIIntegration
 *
 * Wires together all vitals-related UI components:
 * - UnifiedDataService (data layer)
 * - StatusBarManager (session health display)
 * - UnifiedDashboardPanel (consolidated WebView with vitals tab)
 * - SnapshotRecommendationUI (notifications)
 *
 * This module handles the event flow and data transformations between components.
 *
 * @packageDocumentation
 */

import type { VitalsSnapshot } from "@vreko/contracts";

// Local string union types for vitals (contracts exports wrong interfaces for these)
type TempLevel = "cold" | "warm" | "hot" | "burning";
type Trajectory = "stable" | "escalating" | "critical" | "recovering";

import * as vscode from "vscode";
import type { NudgeManager } from "../nurturing/NudgeManager";
import {
	type SnapshotRecommendation as DataRecommendation,
	type SessionHealth,
	UnifiedDataService,
} from "../services/UnifiedDataService";
import { PRESSURE_THRESHOLDS } from "../services/workspace-data/types.js";
import {
	PULSE_LEVEL_SIGNAGE,
	SESSION_HEALTH_SIGNAGE,
	TEMPERATURE_LEVEL_SIGNAGE,
	TRAJECTORY_SIGNAGE,
} from "../signage/constants";
import type { SessionHealthCanonical, TemperatureLevelCanonical, TrajectoryCanonical } from "../signage/types";
import type { StatusFlagManager } from "../signals/StatusFlagManager";
import { logger } from "../utils/logger";
import { SnapshotRecommendationUI, type SnapshotRecommendation as UIRecommendation } from "./SnapshotRecommendationUI";
import type { VitalsDisplayData } from "./ux-types";
// REMOVED: VitalsDashboardPanel - consolidated into UnifiedDashboardPanel vitals tab

/**
 * Configuration for vitals integration
 */
export interface VitalsUIConfig {
	/** Enable vitals display in status bar (power user mode) */
	showVitalsInStatusBar: boolean;
	/** Enable snapshot recommendation notifications */
	enableRecommendations: boolean;
	/** Threshold for showing recommendations (0-100 health score) */
	recommendationThreshold: number;
}

const DEFAULT_CONFIG: VitalsUIConfig = {
	showVitalsInStatusBar: false, // Opt-in power user feature
	enableRecommendations: true,
	recommendationThreshold: 70, // Show recommendations when health drops below 70
};

/**
 * Map internal trajectory to canonical signage type
 */
function mapTrajectoryToCanonical(trajectory: SessionHealth["trajectory"]): TrajectoryCanonical {
	switch (trajectory) {
		case "improving":
			return "improving";
		case "stable":
			return "stable";
		case "degrading":
			return "degrading";
		case "critical":
			return "critical";
		default:
			return "stable";
	}
}

/**
 * Derive session health canonical level from health score
 * 4-zone system: healthy > caution > warning > critical
 * - healthy (70-100): Low risk, stable
 * - caution (50-70): Moderate activity, monitor recommended
 * - warning (40-50): Elevated risk, snapshot recommended
 * - critical (0-40): High risk, immediate action needed
 *
 * 🆕 ThresholdCalibrator integration: Adjusts health score based on user behavior profile
 * - Conservative users (multiplier < 1.0): Lower effective health score → earlier warnings
 * - Aggressive users (multiplier > 1.0): Higher effective health score → fewer warnings
 *
 * @param healthScore Raw health score (0-100)
 * @param thresholdMultiplier Calibrated multiplier from learning system (0.7-1.3, default 1.0)
 */
function deriveHealthLevel(healthScore: number, thresholdMultiplier = 1.0): SessionHealthCanonical {
	// Apply calibrated threshold multiplier to adjust health perception
	// Conservative users (0.7x) see lower effective health → more protective
	// Aggressive users (1.3x) see higher effective health → less nagging
	const adjustedHealthScore = Math.min(100, healthScore * thresholdMultiplier);

	if (adjustedHealthScore >= 70) {
		return "healthy";
	}
	if (adjustedHealthScore >= 50) {
		return "caution";
	}
	if (adjustedHealthScore >= 40) {
		return "warning";
	}
	return "critical";
}

/**
 * Map intelligence package temperature level to canonical signage level
 * Intelligence uses "cold", signage uses "cool"
 */
function mapTemperatureToCanonical(level: TempLevel | "cool"): TemperatureLevelCanonical {
	if (level === "cold" || level === "cool") {
		return "cool";
	}
	return level as TemperatureLevelCanonical; // "warm", "hot", "burning" are the same
}

/**
 * Map intelligence package trajectory to canonical signage trajectory
 * Intelligence: stable, escalating, critical, recovering
 * Signage: stable, degrading, critical, improving
 */
function mapVitalsTrajectoryToCanonical(trajectory: Trajectory | VitalsSnapshot["trajectory"]): TrajectoryCanonical {
	switch (trajectory) {
		case "escalating":
			return "degrading";
		case "recovering":
		case "improving":
			return "improving";
		case "degrading":
			return "degrading";
		default:
			return trajectory as TrajectoryCanonical; // "stable" and "critical" are the same
	}
}

/**
 * Transform VitalsSnapshot to VitalsDisplayData for StatusBar
 */
function transformVitalsToDisplayData(
	snapshot: VitalsSnapshot,
	sessionHealth?: SessionHealthCanonical,
): VitalsDisplayData {
	// Map pulse level: "active" in vitals -> "steady" in canonical (closest match)
	const pulseLevel = (
		snapshot.pulse.level === "active" ? "steady" : snapshot.pulse.level
	) as import("../signage/types").PulseLevelCanonical;
	return {
		pulse: {
			level: pulseLevel,
			value: snapshot.pulse.changesPerMinute,
		},
		temperature: {
			level: mapTemperatureToCanonical(snapshot.temperature.level),
			percentage: snapshot.temperature.aiPercentage,
			...((snapshot.temperature as { level: string; aiPercentage: number; detectedTool?: string })
				.detectedTool && {
				tool: (snapshot.temperature as { level: string; aiPercentage: number; detectedTool?: string })
					.detectedTool,
			}),
		},
		pressure: {
			value: snapshot.pressure.value,
			trend: calculatePressureTrend(snapshot.pressure.value),
		},
		oxygen: {
			value: snapshot.oxygen.value,
		},
		trajectory: mapVitalsTrajectoryToCanonical(snapshot.trajectory),
		sessionHealth,
	};
}

/**
 * Calculate pressure trend based on value
 */
function calculatePressureTrend(value: number): "rising" | "stable" | "falling" {
	if (value >= PRESSURE_THRESHOLDS.high) {
		return "rising";
	}
	if (value < 25) {
		return "falling";
	}
	return "stable";
}

/**
 * Build a MarkdownString tooltip for the status bar hover (VSUI-05).
 *
 * Format (max 5 lines, per UI-SPEC):
 *   🦎 Vreko  -  {HealthLabel}  {TrajectoryArrow}
 *
 *   Pulse   {PulseIcon} {PulseLabel}  ({N} changes/min)
 *   Temp    {TempIcon} {TempLabel}  ({N}% AI)
 *   Tool    {DetectedTool}        ← omitted when absent
 *
 * Security: isTrusted=true is required for VS Code MarkdownString extension support.
 * Content is derived from enum labels and numbers only  -  no user-controlled strings.
 */
function buildVitalsTooltip(
	vitals: VitalsSnapshot,
	healthLevel: SessionHealthCanonical,
	trajectoryCanonical: TrajectoryCanonical,
): vscode.MarkdownString {
	const healthSignage = SESSION_HEALTH_SIGNAGE[healthLevel];
	const trajectorySignage = TRAJECTORY_SIGNAGE[trajectoryCanonical];

	// Map VitalsSnapshot pulse level to canonical (active → steady)
	const pulseLevelCanonical = (
		vitals.pulse.level === "active" ? "steady" : vitals.pulse.level
	) as import("../signage/types").PulseLevelCanonical;
	const pulseSignage = PULSE_LEVEL_SIGNAGE[pulseLevelCanonical] ?? PULSE_LEVEL_SIGNAGE.steady;

	// Map temperature level (cold → cool)
	const tempLevelCanonical = mapTemperatureToCanonical(vitals.temperature.level);
	const tempSignage = TEMPERATURE_LEVEL_SIGNAGE[tempLevelCanonical] ?? TEMPERATURE_LEVEL_SIGNAGE.cool;

	const changesPerMin = vitals.pulse.changesPerMinute ?? 0;
	const aiPct = Math.round((vitals.temperature.aiPercentage ?? 0) * 100);
	const detectedTool = (vitals.temperature as { level: string; aiPercentage: number; detectedTool?: string })
		.detectedTool;

	const lines: string[] = [
		`🦎 Vreko  -  ${healthSignage.label}  ${trajectorySignage.arrow}`,
		``,
		`Pulse   ${pulseSignage.icon} ${pulseSignage.label}  (${changesPerMin} changes/min)`,
		`Temp    ${tempSignage.icon} ${tempSignage.label}  (${aiPct}% AI)`,
	];
	if (detectedTool) {
		lines.push(`Tool    ${detectedTool}`);
	}

	const md = new vscode.MarkdownString(lines.join("\n"), true);
	md.isTrusted = true;
	return md;
}

/**
 * Main integration class connecting data service to UI components
 */
export class VitalsUIIntegration implements vscode.Disposable {
	// biome-ignore lint/correctness/noUnusedPrivateClassMembers: Stored for WebView panel creation
	private readonly _extensionUri: vscode.Uri;
	private dataService: UnifiedDataService;
	private statusFlagManager: StatusFlagManager;
	private recommendationUI: SnapshotRecommendationUI;
	private nudgeManager: NudgeManager | null;
	private config: VitalsUIConfig;
	private disposables: vscode.Disposable[] = [];

	/**
	 * Last auto-snapshot timestamp to prevent spam
	 * Auto-snapshot is limited to once per 60 seconds minimum
	 */
	private lastAutoSnapshotTime = 0;
	private readonly AUTO_SNAPSHOT_COOLDOWN = 60 * 1000; // 60 seconds

	/**
	 * Track previous health level for edge detection (only nudge on transitions)
	 */
	private previousHealthLevel: SessionHealthCanonical = "healthy";

	constructor(
		workspaceId: string,
		workspaceRoot: string,
		extensionUri: vscode.Uri,
		statusFlagManager: StatusFlagManager,
		nudgeManager: NudgeManager | null,
		config: Partial<VitalsUIConfig> = {},
	) {
		this._extensionUri = extensionUri;
		this.statusFlagManager = statusFlagManager;
		this.nudgeManager = nudgeManager;
		this.config = { ...DEFAULT_CONFIG, ...config };

		// Initialize data service
		this.dataService = UnifiedDataService.for(workspaceId, workspaceRoot);

		// Initialize recommendation UI with StatusFlagManager reference
		// This ensures consolidated status bar (no duplicate items)
		this.recommendationUI = new SnapshotRecommendationUI(statusFlagManager);
		this.disposables.push(this.recommendationUI);

		// Wire up event listeners
		this.setupEventListeners();

		// Apply initial config
		this.statusFlagManager.setVitalsEnabled(this.config.showVitalsInStatusBar);
	}

	/**
	 * Setup event listeners for data changes
	 */
	private setupEventListeners(): void {
		// Listen for data changes from UnifiedDataService
		// NOTE: Only listen to health-changed (not vitals-updated) to avoid duplicate notifications.
		// UnifiedDataService fires both events in sequence from updateVitals(), and both
		// would trigger handleSessionHealthUpdate() causing duplicate warnings.
		const dataChangeDisposable = this.dataService.onDataChange((event) => {
			switch (event.type) {
				case "health-changed":
					this.handleSessionHealthUpdate();
					break;
				// NOTE: Intentionally NOT handling "recommendation-changed" here.
				// handleSessionHealthUpdate() already calls triggerRecommendation() when needed,
				// so handling both events would show duplicate notifications.
				case "learnings-updated":
				case "violations-updated":
				case "patterns-updated":
					// These trigger dashboard refresh if open
					// VitalsDashboardPanel handles its own refresh via data service
					break;
			}
		});

		this.disposables.push(dataChangeDisposable);
	}

	/**
	 * Handle session health update
	 *
	 * DESIGN: When health becomes critical, auto-create snapshot instead of just nagging.
	 * This is the core value prop - protect the user's work proactively.
	 *
	 * CONSOLIDATION: This method now handles BOTH:
	 * 1. Session health updates (updateSessionHealth)
	 * 2. Power user vitals display (showVitals) - previously in separate VitalsIntegration class
	 */
	private handleSessionHealthUpdate(): void {
		const sessionHealth = this.dataService.getSessionHealth();

		// 🆕 ThresholdCalibrator: Get calibrated multiplier for adaptive health zones
		const thresholdMultiplier = this.dataService.getThresholdMultiplier();
		const healthLevel = deriveHealthLevel(sessionHealth.healthScore, thresholdMultiplier);
		const trajectory = mapTrajectoryToCanonical(sessionHealth.trajectory);

		// Debug: Log health state for troubleshooting auto-snapshot triggers
		logger.debug("Session health updated", {
			healthScore: sessionHealth.healthScore,
			healthLevel,
			trajectory,
			cooldownActive: !this.shouldAutoSnapshot(),
			timeSinceLastAutoSnapshot: Date.now() - this.lastAutoSnapshotTime,
		});

		// Update session health (background color, tooltip)
		this.statusFlagManager.updateSessionHealth(healthLevel, trajectory);

		// CONSOLIDATED: Also update power user vitals display if enabled
		// This replaces the separate VitalsIntegration class
		const vitals = this.dataService.getVitals();
		if (vitals && this.config.showVitalsInStatusBar) {
			const displayData = transformVitalsToDisplayData(vitals, healthLevel);
			this.statusFlagManager.showVitals(displayData);
		}

		// VSUI-05: Populate hover tooltip with pulse/temperature/tool context from vitals.
		// Always update tooltip when vitals are available  -  not gated on showVitalsInStatusBar
		// so the hover is informative even in the default (non-power-user) mode.
		if (vitals) {
			this.statusFlagManager.setTooltipOverride(buildVitalsTooltip(vitals, healthLevel, trajectory));
		}

		// AUTO-SNAPSHOT ON WARNING OR CRITICAL: Don't wait for disaster - protect proactively!
		// User insight: "Its a stupid idea to see the codebase in a severe state and wait for user action"
		if (healthLevel === "critical" || healthLevel === "warning") {
			if (this.shouldAutoSnapshot()) {
				const reason =
					healthLevel === "critical"
						? "Session health critical - auto-protecting your work"
						: "Session health degrading - creating safety snapshot";
				void this.triggerAutoSnapshot(reason);
				return; // Don't show recommendation, we're handling it
			}
			logger.debug("Auto-snapshot skipped due to cooldown", {
				healthLevel,
				timeSinceLastAutoSnapshot: Date.now() - this.lastAutoSnapshotTime,
				cooldownMs: this.AUTO_SNAPSHOT_COOLDOWN,
			});

			// 🆕 NudgeManager Integration: Trigger educational nudge on health degradation
			// Only trigger on transition TO warning/critical state (edge detection)
			if (this.nudgeManager && this.previousHealthLevel !== healthLevel) {
				if (healthLevel === "critical" || healthLevel === "warning") {
					logger.debug("Triggering session_health_warning nudge", {
						previousLevel: this.previousHealthLevel,
						currentLevel: healthLevel,
					});
					void this.nudgeManager.maybeNudge("session_health_warning");
				}
			}
		}

		// 🆕 NudgeManager Integration: Trigger snapshot_recommended based on PressureRecommendation
		// This provides proactive educational messaging before health becomes critical
		if (this.nudgeManager && healthLevel !== "critical" && healthLevel !== "warning") {
			const vitals = this.dataService.getVitals();
			if (vitals) {
				// Access PressureRecommendation via the data service's vitals
				const pressureValue = vitals.pressure.value;
				// Trigger nudge when pressure indicates snapshot is recommended (>= 60)
				// but health hasn't degraded yet - proactive education
				if (pressureValue >= 60 && this.previousHealthLevel === healthLevel) {
					logger.debug("Triggering snapshot_recommended nudge based on pressure", {
						pressureValue,
						healthLevel,
					});
					void this.nudgeManager.maybeNudge("snapshot_recommended");
				}
			}
		}

		// Update previous health level for edge detection
		this.previousHealthLevel = healthLevel;

		// For healthy sessions: show recommendation if enabled and below threshold
		if (this.config.enableRecommendations && sessionHealth.healthScore < this.config.recommendationThreshold) {
			this.triggerRecommendation(sessionHealth);
		}
	}

	/**
	 * Check if auto-snapshot should trigger (respects cooldown and workspace trust)
	 *
	 * SECURITY: Auto-snapshot is disabled in untrusted workspaces to prevent
	 * potential data exfiltration or malicious code execution through snapshot triggers.
	 */
	private shouldAutoSnapshot(): boolean {
		// HARDENING: Respect VS Code workspace trust
		// Auto-snapshot could be exploited in malicious workspaces to trigger code execution
		if (!vscode.workspace.isTrusted) {
			logger.debug("Auto-snapshot disabled: untrusted workspace");
			return false;
		}

		const now = Date.now();
		return now - this.lastAutoSnapshotTime >= this.AUTO_SNAPSHOT_COOLDOWN;
	}

	/**
	 * Trigger auto-snapshot and update UI accordingly
	 *
	 * DESIGN: Only set cooldown AFTER successful snapshot to allow retry on failure.
	 * This ensures users get protection even if the first attempt fails.
	 */
	private async triggerAutoSnapshot(reason: string): Promise<void> {
		logger.info("Auto-snapshot triggered", { reason });

		// Show activity sequence in status bar
		void this.statusFlagManager.showActivitySequenceByType("vitals-degrading");

		// Execute snapshot command
		try {
			await vscode.commands.executeCommand("vreko.createSnapshot");

			// Only set cooldown AFTER successful snapshot
			// This allows retry if the attempt fails
			this.lastAutoSnapshotTime = Date.now();

			// Clear any pending recommendation
			this.recommendationUI.clearRecommendation();
			logger.info("Auto-snapshot created successfully", { reason });
		} catch (error) {
			// Log the failure - don't set cooldown so we can retry
			logger.warn("Auto-snapshot failed, showing recommendation fallback", {
				reason,
				error: error instanceof Error ? error.message : String(error),
			});

			// If snapshot fails, show recommendation as fallback
			const sessionHealth = this.dataService.getSessionHealth();
			this.triggerRecommendation(sessionHealth);
		}
	}

	/**
	 * Handle recommendation update from data service
	 */
	private handleRecommendationUpdate(): void {
		if (!this.config.enableRecommendations) {
			return;
		}

		const recommendation = this.dataService.getSnapshotRecommendation();
		if (recommendation?.should) {
			const sessionHealth = this.dataService.getSessionHealth();
			const uiRecommendation = this.transformRecommendation(recommendation, sessionHealth);
			this.recommendationUI.updateRecommendation(uiRecommendation);
		} else {
			this.recommendationUI.clearRecommendation();
		}
	}

	/**
	 * Trigger recommendation based on session health
	 */
	private triggerRecommendation(sessionHealth: SessionHealth): void {
		const thresholdMultiplier = this.dataService.getThresholdMultiplier();
		const healthLevel = deriveHealthLevel(sessionHealth.healthScore, thresholdMultiplier);
		const trajectory = mapTrajectoryToCanonical(sessionHealth.trajectory);
		const urgency = this.calculateUrgency(sessionHealth);

		const recommendation: UIRecommendation = {
			urgency,
			reason: this.buildRecommendationReason(sessionHealth),
			details: sessionHealth.activeWarnings.join("; "),
			sessionHealth: healthLevel,
			trajectory,
			lastSnapshotAge: sessionHealth.lastSnapshotMinutesAgo
				? sessionHealth.lastSnapshotMinutesAgo * 60
				: undefined,
		};

		this.recommendationUI.updateRecommendation(recommendation);
	}

	/**
	 * Transform data service recommendation to UI recommendation
	 */
	private transformRecommendation(dataRec: DataRecommendation, sessionHealth: SessionHealth): UIRecommendation {
		const thresholdMultiplier = this.dataService.getThresholdMultiplier();
		const healthLevel = deriveHealthLevel(sessionHealth.healthScore, thresholdMultiplier);
		const trajectory = mapTrajectoryToCanonical(sessionHealth.trajectory);

		return {
			urgency: this.mapUrgency(dataRec.urgency),
			reason: dataRec.reason,
			details: sessionHealth.activeWarnings?.join("; "),
			sessionHealth: healthLevel,
			trajectory,
			lastSnapshotAge: sessionHealth.lastSnapshotMinutesAgo
				? sessionHealth.lastSnapshotMinutesAgo * 60
				: undefined,
		};
	}

	/**
	 * Calculate urgency level from session health
	 */
	private calculateUrgency(sessionHealth: SessionHealth): UIRecommendation["urgency"] {
		if (sessionHealth.healthScore < 20 || sessionHealth.trajectory === "critical") {
			return "critical";
		}
		if (sessionHealth.healthScore < 40 || sessionHealth.trajectory === "degrading") {
			return "high";
		}
		if (sessionHealth.healthScore < 60) {
			return "medium";
		}
		return "low";
	}

	/**
	 * Map data service urgency to UI urgency
	 */
	private mapUrgency(urgency: DataRecommendation["urgency"]): UIRecommendation["urgency"] {
		switch (urgency) {
			case "now":
				return "critical";
			case "soon":
				return "high";
			default:
				return "low";
		}
	}

	/**
	 * Build human-readable recommendation reason
	 */
	private buildRecommendationReason(sessionHealth: SessionHealth): string {
		const thresholdMultiplier = this.dataService.getThresholdMultiplier();
		const healthLevel = deriveHealthLevel(sessionHealth.healthScore, thresholdMultiplier);
		const healthSignage = SESSION_HEALTH_SIGNAGE[healthLevel];
		const trajectory = mapTrajectoryToCanonical(sessionHealth.trajectory);
		const trajectorySignage = TRAJECTORY_SIGNAGE[trajectory];

		if (healthLevel === "critical") {
			return "Session health is critical - snapshot strongly recommended";
		}

		if (trajectory === "degrading" || trajectory === "critical") {
			return `Session health ${trajectorySignage.arrow} ${trajectorySignage.label.toLowerCase()} - consider a snapshot`;
		}

		if (sessionHealth.lastSnapshotMinutesAgo && sessionHealth.lastSnapshotMinutesAgo > 60) {
			const hours = Math.floor(sessionHealth.lastSnapshotMinutesAgo / 60);
			return `No snapshot in ${hours}+ hours - consider creating one`;
		}

		return `${healthSignage.label} session - snapshot recommended`;
	}

	/**
	 * Open the vitals dashboard panel
	 * CONSOLIDATION: Routes to UnifiedDashboardPanel vitals tab
	 */
	openDashboard(): void {
		void vscode.commands.executeCommand("vreko.openDashboard.vitals");
	}

	/**
	 * Update configuration
	 */
	updateConfig(config: Partial<VitalsUIConfig>): void {
		this.config = { ...this.config, ...config };
		this.statusFlagManager.setVitalsEnabled(this.config.showVitalsInStatusBar);
	}

	/**
	 * Force refresh all data
	 */
	refresh(): void {
		// Force a manual refresh of all data
		this.handleSessionHealthUpdate();
		this.handleRecommendationUpdate();
	}

	/**
	 * Get current data service instance
	 */
	getDataService(): UnifiedDataService {
		return this.dataService;
	}

	dispose(): void {
		for (const d of this.disposables) {
			d.dispose();
		}
		// Note: Don't dispose dataService here - it's a singleton managed separately
	}
}

/**
 * Register vitals-related commands
 */
export function registerVitalsCommands(context: vscode.ExtensionContext, integration: VitalsUIIntegration): void {
	// Command to open vitals dashboard - Routes to UnifiedDashboardPanel vitals tab
	// CONSOLIDATION: All dashboard-related commands now route to single UnifiedDashboardPanel
	context.subscriptions.push(
		vscode.commands.registerCommand("vreko.openVitalsDashboard", async () => {
			// Route to unified dashboard with vitals tab
			await vscode.commands.executeCommand("vreko.openDashboard.vitals");
		}),
	);

	// Command to toggle vitals display in status bar
	context.subscriptions.push(
		vscode.commands.registerCommand("vreko.toggleVitalsDisplay", () => {
			const config = vscode.workspace.getConfiguration("vreko");
			const currentValue = config.get<boolean>("vitals.showInStatusBar", false);
			void config.update("vitals.showInStatusBar", !currentValue, vscode.ConfigurationTarget.Workspace);
			integration.updateConfig({ showVitalsInStatusBar: !currentValue });
		}),
	);

	// Command to refresh vitals data
	context.subscriptions.push(
		vscode.commands.registerCommand("vreko.refreshVitals", () => {
			integration.refresh();
		}),
	);
}

/**
 * Factory function for creating vitals integration
 *
 * @param nudgeManager - Optional NudgeManager for educational messaging.
 *                       When provided, triggers nudges on health degradation and pressure thresholds.
 */
export function createVitalsUIIntegration(
	workspaceId: string,
	workspaceRoot: string,
	extensionUri: vscode.Uri,
	statusFlagManager: StatusFlagManager,
	nudgeManager: NudgeManager | null = null,
): VitalsUIIntegration {
	// Read config from workspace settings
	const config = vscode.workspace.getConfiguration("vreko");
	const vitalsConfig: Partial<VitalsUIConfig> = {
		showVitalsInStatusBar: config.get<boolean>("vitals.showInStatusBar", false),
		enableRecommendations: config.get<boolean>("vitals.enableRecommendations", true),
		recommendationThreshold: config.get<number>("vitals.recommendationThreshold", 70),
	};

	return new VitalsUIIntegration(
		workspaceId,
		workspaceRoot,
		extensionUri,
		statusFlagManager,
		nudgeManager,
		vitalsConfig,
	);
}
