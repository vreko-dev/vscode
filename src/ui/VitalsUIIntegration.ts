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

import * as vscode from "vscode";
import {
	type SnapshotRecommendation as DataRecommendation,
	type SessionHealth,
	UnifiedDataService,
} from "../services/UnifiedDataService";
import { SESSION_HEALTH_SIGNAGE, TRAJECTORY_SIGNAGE } from "../signage/constants";
import type { SessionHealthCanonical, TrajectoryCanonical } from "../signage/types";
import { SnapshotRecommendationUI, type SnapshotRecommendation as UIRecommendation } from "./SnapshotRecommendationUI";
import type { StatusBarManager } from "./StatusBarManager";
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
 * Main integration class connecting data service to UI components
 */
export class VitalsUIIntegration implements vscode.Disposable {
	private dataService: UnifiedDataService;
	private statusBarManager: StatusBarManager;
	private recommendationUI: SnapshotRecommendationUI;
	private extensionUri: vscode.Uri;
	private config: VitalsUIConfig;
	private disposables: vscode.Disposable[] = [];

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

		// Initialize recommendation UI
		this.recommendationUI = new SnapshotRecommendationUI();
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
		const dataChangeDisposable = this.dataService.onDataChange((event) => {
			switch (event.type) {
				case "vitals-updated":
				case "health-changed":
					this.handleSessionHealthUpdate();
					break;
				case "recommendation-changed":
					this.handleRecommendationUpdate();
					break;
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
	 */
	private handleSessionHealthUpdate(): void {
		const sessionHealth = this.dataService.getSessionHealth();
		const healthLevel = deriveHealthLevel(sessionHealth.healthScore);
		const trajectory = mapTrajectoryToCanonical(sessionHealth.trajectory);

		// Update status bar
		this.statusBarManager.updateSessionHealth(healthLevel, trajectory);

		// Check if we should show recommendation based on health
		if (this.config.enableRecommendations && sessionHealth.healthScore < this.config.recommendationThreshold) {
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
		if (recommendation && recommendation.should) {
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
			case "optional":
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
