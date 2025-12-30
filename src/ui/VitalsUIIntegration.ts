/**
 * VitalsUIIntegration
 *
 * Wires together all vitals-related UI components:
 * - UnifiedDataService (data layer)
 * - StatusBarManager (session health display)
 * - VitalsDashboardPanel (WebView)
 * - SnapshotRecommendationUI (notifications)
 *
 * This module handles the event flow and data transformations between components.
 *
 * @packageDocumentation
 */

import {
	PRESSURE_THRESHOLDS,
	type TempLevel,
	type Trajectory,
	type VitalsSnapshot,
} from "@snapback/intelligence/vitals";
import * as vscode from "vscode";
import {
	type SnapshotRecommendation as DataRecommendation,
	type SessionHealth,
	UnifiedDataService,
} from "../services/UnifiedDataService";
import { SESSION_HEALTH_SIGNAGE, TRAJECTORY_SIGNAGE } from "../signage/constants";
import type { SessionHealthCanonical, TemperatureLevelCanonical, TrajectoryCanonical } from "../signage/types";
import { logger } from "../utils/logger";
import { SnapshotRecommendationUI, type SnapshotRecommendation as UIRecommendation } from "./SnapshotRecommendationUI";
import type { StatusBarManager } from "./StatusBarManager";
import type { VitalsDisplayData } from "./ux-types";
import { VitalsDashboardPanel } from "./VitalsDashboardPanel";

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
 */
function deriveHealthLevel(healthScore: number): SessionHealthCanonical {
	if (healthScore >= 70) {
		return "healthy";
	}
	if (healthScore >= 40) {
		return "warning";
	}
	return "critical";
}

/**
 * Map intelligence package temperature level to canonical signage level
 * Intelligence uses "cold", signage uses "cool"
 */
function mapTemperatureToCanonical(level: TempLevel): TemperatureLevelCanonical {
	if (level === "cold") {
		return "cool";
	}
	return level; // "warm", "hot", "burning" are the same
}

/**
 * Map intelligence package trajectory to canonical signage trajectory
 * Intelligence: stable, escalating, critical, recovering
 * Signage: stable, degrading, critical, improving
 */
function mapVitalsTrajectoryToCanonical(trajectory: Trajectory): TrajectoryCanonical {
	switch (trajectory) {
		case "escalating":
			return "degrading";
		case "recovering":
			return "improving";
		default:
			return trajectory; // "stable" and "critical" are the same
	}
}

/**
 * Transform VitalsSnapshot to VitalsDisplayData for StatusBar
 */
function transformVitalsToDisplayData(
	snapshot: VitalsSnapshot,
	sessionHealth?: SessionHealthCanonical,
): VitalsDisplayData {
	return {
		pulse: {
			level: snapshot.pulse.level,
			value: snapshot.pulse.changesPerMinute,
		},
		temperature: {
			level: mapTemperatureToCanonical(snapshot.temperature.level),
			percentage: snapshot.temperature.aiPercentage,
			...(snapshot.temperature.detectedTool && { tool: snapshot.temperature.detectedTool }),
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
	if (value < PRESSURE_THRESHOLDS.low) {
		return "falling";
	}
	return "stable";
}

/**
 * Main integration class connecting data service to UI components
 */
export class VitalsUIIntegration implements vscode.Disposable {
	private dataService: UnifiedDataService;
	private statusBarManager: StatusBarManager;
	private recommendationUI: SnapshotRecommendationUI;
	private extensionUri: vscode.Uri;
	private config: VitalsUIConfig;
	private disposables: vscode.Disposable[] = [];

	/**
	 * Last auto-snapshot timestamp to prevent spam
	 * Auto-snapshot is limited to once per 60 seconds minimum
	 */
	private lastAutoSnapshotTime = 0;
	private readonly AUTO_SNAPSHOT_COOLDOWN = 60 * 1000; // 60 seconds

	constructor(
		workspaceId: string,
		workspaceRoot: string,
		extensionUri: vscode.Uri,
		statusBarManager: StatusBarManager,
		config: Partial<VitalsUIConfig> = {},
	) {
		this.extensionUri = extensionUri;
		this.statusBarManager = statusBarManager;
		this.config = { ...DEFAULT_CONFIG, ...config };

		// Initialize data service
		this.dataService = UnifiedDataService.for(workspaceId, workspaceRoot);

		// Initialize recommendation UI with StatusBarManager reference
		// This ensures consolidated status bar (no duplicate items)
		this.recommendationUI = new SnapshotRecommendationUI(statusBarManager);
		this.disposables.push(this.recommendationUI);

		// Wire up event listeners
		this.setupEventListeners();

		// Apply initial config
		this.statusBarManager.setVitalsEnabled(this.config.showVitalsInStatusBar);
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
		const healthLevel = deriveHealthLevel(sessionHealth.healthScore);
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
		this.statusBarManager.updateSessionHealth(healthLevel, trajectory);

		// CONSOLIDATED: Also update power user vitals display if enabled
		// This replaces the separate VitalsIntegration class
		const vitals = this.dataService.getVitals();
		if (vitals && this.config.showVitalsInStatusBar) {
			const displayData = transformVitalsToDisplayData(vitals, healthLevel);
			this.statusBarManager.showVitals(displayData);
		}

		// AUTO-SNAPSHOT ON WARNING OR CRITICAL: Don't wait for disaster - protect proactively!
		// User insight: "Its a stupid idea to see the codebase in a severe state and wait for user action"
		if (healthLevel === "critical" || healthLevel === "warning") {
			if (this.shouldAutoSnapshot()) {
				const reason =
					healthLevel === "critical"
						? "Session health critical - auto-protecting your work"
						: "Session health degrading - creating safety checkpoint";
				void this.triggerAutoSnapshot(reason);
				return; // Don't show recommendation, we're handling it
			}
			logger.debug("Auto-snapshot skipped due to cooldown", {
				healthLevel,
				timeSinceLastAutoSnapshot: Date.now() - this.lastAutoSnapshotTime,
				cooldownMs: this.AUTO_SNAPSHOT_COOLDOWN,
			});
		}

		// For healthy sessions: show recommendation if enabled and below threshold
		if (this.config.enableRecommendations && sessionHealth.healthScore < this.config.recommendationThreshold) {
			this.triggerRecommendation(sessionHealth);
		}
	}

	/**
	 * Check if auto-snapshot should trigger (respects cooldown)
	 */
	private shouldAutoSnapshot(): boolean {
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
		void this.statusBarManager.showActivitySequenceByType("vitals-degrading");

		// Execute snapshot command
		try {
			await vscode.commands.executeCommand("snapback.createSnapshot");

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
		const healthLevel = deriveHealthLevel(sessionHealth.healthScore);
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
		const healthLevel = deriveHealthLevel(sessionHealth.healthScore);
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
		const healthLevel = deriveHealthLevel(sessionHealth.healthScore);
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
	 */
	openDashboard(): void {
		VitalsDashboardPanel.createOrShow(this.extensionUri, this.dataService);
	}

	/**
	 * Update configuration
	 */
	updateConfig(config: Partial<VitalsUIConfig>): void {
		this.config = { ...this.config, ...config };
		this.statusBarManager.setVitalsEnabled(this.config.showVitalsInStatusBar);
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
	// Command to open vitals dashboard
	context.subscriptions.push(
		vscode.commands.registerCommand("snapback.openVitalsDashboard", () => {
			integration.openDashboard();
		}),
	);

	// Command to toggle vitals display in status bar
	context.subscriptions.push(
		vscode.commands.registerCommand("snapback.toggleVitalsDisplay", () => {
			const config = vscode.workspace.getConfiguration("snapback");
			const currentValue = config.get<boolean>("vitals.showInStatusBar", false);
			void config.update("vitals.showInStatusBar", !currentValue, vscode.ConfigurationTarget.Workspace);
			integration.updateConfig({ showVitalsInStatusBar: !currentValue });
		}),
	);

	// Command to refresh vitals data
	context.subscriptions.push(
		vscode.commands.registerCommand("snapback.refreshVitals", () => {
			integration.refresh();
		}),
	);
}

/**
 * Factory function for creating vitals integration
 */
export function createVitalsUIIntegration(
	workspaceId: string,
	workspaceRoot: string,
	extensionUri: vscode.Uri,
	statusBarManager: StatusBarManager,
): VitalsUIIntegration {
	// Read config from workspace settings
	const config = vscode.workspace.getConfiguration("snapback");
	const vitalsConfig: Partial<VitalsUIConfig> = {
		showVitalsInStatusBar: config.get<boolean>("vitals.showInStatusBar", false),
		enableRecommendations: config.get<boolean>("vitals.enableRecommendations", true),
		recommendationThreshold: config.get<number>("vitals.recommendationThreshold", 70),
	};

	return new VitalsUIIntegration(workspaceId, workspaceRoot, extensionUri, statusBarManager, vitalsConfig);
}
