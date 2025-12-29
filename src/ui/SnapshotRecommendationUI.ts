/**
 * SnapshotRecommendationUI
 *
 * Displays snapshot recommendations based on session health and vitals.
 * Uses non-intrusive notifications with progressive urgency.
 *
 * DESIGN PRINCIPLES:
 * - Non-blocking by default (toast notifications)
 * - Progressive urgency (info → warning → critical)
 * - Respects user snooze preferences
 * - Integrates with UnifiedDataService for data
 *
 * @packageDocumentation
 */

import * as vscode from "vscode";
import { SESSION_HEALTH_SIGNAGE } from "../signage/constants";
import type { SessionHealthCanonical, TrajectoryCanonical } from "../signage/types";
// REMOVED: TRAJECTORY_SIGNAGE - no longer needed (tooltip built by StatusBarManager)
import type { RecommendationUrgency, StatusBarManager } from "./StatusBarManager";

/**
 * Snapshot recommendation with context
 */
export interface SnapshotRecommendation {
	urgency: "low" | "medium" | "high" | "critical";
	reason: string;
	details?: string;
	filesAtRisk?: number;
	lastSnapshotAge?: number; // seconds
	sessionHealth: SessionHealthCanonical;
	trajectory: TrajectoryCanonical;
}

/**
 * User action buttons for recommendations
 */
const ACTIONS = {
	CREATE_SNAPSHOT: "Create Snapshot",
	SNOOZE_5MIN: "Snooze 5min",
	SNOOZE_30MIN: "Snooze 30min",
	OPEN_DASHBOARD: "Open Dashboard",
	DISMISS: "Dismiss",
} as const;

/**
 * Cooldown periods between notifications (ms)
 */
const NOTIFICATION_COOLDOWNS = {
	low: 30 * 60 * 1000, // 30 minutes
	medium: 15 * 60 * 1000, // 15 minutes
	high: 5 * 60 * 1000, // 5 minutes
	critical: 60 * 1000, // 1 minute
} as const;

export class SnapshotRecommendationUI implements vscode.Disposable {
	private lastNotificationTime = 0;
	private snoozeUntil = 0;
	private disposables: vscode.Disposable[] = [];

	/**
	 * Reference to StatusBarManager for consolidated status bar updates
	 *
	 * DESIGN: We no longer create our own status bar item.
	 * Instead, we delegate to StatusBarManager.showRecommendation()
	 * This consolidates all status bar state into a single item.
	 */
	private statusBarManager: StatusBarManager | undefined;

	constructor(statusBarManager?: StatusBarManager) {
		this.statusBarManager = statusBarManager;
	}

	/**
	 * Set StatusBarManager reference (for deferred initialization)
	 */
	setStatusBarManager(manager: StatusBarManager): void {
		this.statusBarManager = manager;
	}

	/**
	 * Update recommendation and potentially show notification
	 */
	updateRecommendation(recommendation: SnapshotRecommendation): void {
		this.updateStatusBar(recommendation);

		// Check if we should show a notification
		if (this.shouldShowNotification(recommendation)) {
			this.showNotification(recommendation);
		}
	}

	/**
	 * Clear recommendation (e.g., after snapshot created)
	 */
	clearRecommendation(): void {
		this.statusBarManager?.clearRecommendation();
	}

	/**
	 * User requested snooze
	 */
	snooze(durationMs: number): void {
		this.snoozeUntil = Date.now() + durationMs;
		this.statusBarManager?.clearRecommendation();
	}

	/**
	 * Check if notification should be shown
	 */
	private shouldShowNotification(recommendation: SnapshotRecommendation): boolean {
		const now = Date.now();

		// Respect snooze
		if (now < this.snoozeUntil) {
			return false;
		}

		// Respect cooldown based on urgency
		const cooldown = NOTIFICATION_COOLDOWNS[recommendation.urgency];
		if (now - this.lastNotificationTime < cooldown) {
			return false;
		}

		// Only notify for medium+ urgency
		if (recommendation.urgency === "low") {
			return false;
		}

		return true;
	}

	/**
	 * Update status bar with recommendation indicator
	 *
	 * DESIGN: Now delegates to StatusBarManager for consolidated status bar.
	 */
	private updateStatusBar(recommendation: SnapshotRecommendation): void {
		// Only show status bar indicator for medium+ urgency
		if (recommendation.urgency === "low") {
			this.statusBarManager?.clearRecommendation();
			return;
		}

		// Delegate to StatusBarManager
		this.statusBarManager?.showRecommendation(
			recommendation.urgency as RecommendationUrgency,
			recommendation.reason,
		);
	}

	// REMOVED: buildTooltip() - tooltip now built by StatusBarManager

	/**
	 * Show notification based on urgency
	 */
	private async showNotification(recommendation: SnapshotRecommendation): Promise<void> {
		this.lastNotificationTime = Date.now();

		const healthSignage = SESSION_HEALTH_SIGNAGE[recommendation.sessionHealth];
		const message = `${healthSignage.emoji} ${recommendation.reason}`;

		let result: string | undefined;

		switch (recommendation.urgency) {
			case "critical":
				result = await vscode.window.showErrorMessage(
					message,
					ACTIONS.CREATE_SNAPSHOT,
					ACTIONS.OPEN_DASHBOARD,
					ACTIONS.SNOOZE_5MIN,
				);
				break;

			case "high":
				result = await vscode.window.showWarningMessage(
					message,
					ACTIONS.CREATE_SNAPSHOT,
					ACTIONS.SNOOZE_5MIN,
					ACTIONS.DISMISS,
				);
				break;

			default:
				result = await vscode.window.showInformationMessage(
					message,
					ACTIONS.CREATE_SNAPSHOT,
					ACTIONS.SNOOZE_30MIN,
					ACTIONS.DISMISS,
				);
		}

		// Handle user action
		await this.handleAction(result);
	}

	/**
	 * Handle user action from notification
	 */
	private async handleAction(action: string | undefined): Promise<void> {
		if (!action) {
			return;
		}

		switch (action) {
			case ACTIONS.CREATE_SNAPSHOT:
				await vscode.commands.executeCommand("snapback.createSnapshot");
				this.clearRecommendation();
				break;

			case ACTIONS.OPEN_DASHBOARD:
				await vscode.commands.executeCommand("snapback.openVitalsDashboard");
				break;

			case ACTIONS.SNOOZE_5MIN:
				this.snooze(5 * 60 * 1000);
				vscode.window.showInformationMessage("Snapshot reminders snoozed for 5 minutes");
				break;

			case ACTIONS.SNOOZE_30MIN:
				this.snooze(30 * 60 * 1000);
				vscode.window.showInformationMessage("Snapshot reminders snoozed for 30 minutes");
				break;

			case ACTIONS.DISMISS:
				// Just dismiss, no action needed
				break;
		}
	}

	// REMOVED: formatAge() - no longer needed (tooltip built by StatusBarManager)

	dispose(): void {
		for (const d of this.disposables) {
			d.dispose();
		}
	}
}

/**
 * Factory function for creating recommendation UI
 */
export function createSnapshotRecommendationUI(): SnapshotRecommendationUI {
	return new SnapshotRecommendationUI();
}
