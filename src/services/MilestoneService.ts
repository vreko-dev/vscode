import type * as vscode from "vscode";
import type { NotificationManager } from "../notificationManager";
import type { TelemetryProxy } from "./telemetry-proxy";

/**
 * Milestone Service
 *
 * Tracks accumulated value metrics (protected files, recoveries) and triggers
 * milestone events to recognize user progress.
 *
 * Strategy:
 * - Avoid gamification (no points/XP)
 * - Focus on genuine value delivered (files protected, disaster averted)
 * - Use globalState for persistence across sessions
 */
export class MilestoneService {
	private static readonly KEYS = {
		TOTAL_FILES_PROTECTED: "snapback.milestones.totalFilesProtected",
		TOTAL_RECOVERIES: "snapback.milestones.totalRecoveries",
		LAST_MILESTONE_SHOWN: "snapback.milestones.lastShown",
		FIRST_SNAPSHOT_CREATED: "snapback.events.first_snapshot_created",
	};

	// Milestone thresholds
	private static readonly THRESHOLDS = {
		FILES_PROTECTED: [10, 100, 1000, 5000, 10000],
		RECOVERIES: [1, 5, 10, 25, 50],
	};

	constructor(
		private context: vscode.ExtensionContext,
		private telemetryProxy: TelemetryProxy,
		private notificationManager: NotificationManager,
	) {}

	/**
	 * P0 FIX: Track first snapshot creation (P0 Blocker #3)
	 * Records when the user creates their first snapshot for milestone tracking
	 */
	async trackFirstSnapshot(): Promise<void> {
		const hasCreated = this.context.globalState.get<boolean>(MilestoneService.KEYS.FIRST_SNAPSHOT_CREATED, false);

		if (!hasCreated) {
			await this.context.globalState.update(MilestoneService.KEYS.FIRST_SNAPSHOT_CREATED, true);

			this.telemetryProxy.trackEvent("first_snapshot.created", {
				timestamp: Date.now(),
			});

			this.notificationManager.showNotification({
				id: `first-snapshot-${Date.now()}`,
				type: "info",
				icon: "📸",
				message: "First Snapshot Created!",
				detail: "Your first snapshot is secured. Code changes are now being tracked.",
				timestamp: Date.now(),
			});
		}
	}

	/**
	 * Increment the count of protected files and check for milestones
	 * @param count Number of new files protected (default 1)
	 */
	async incrementProtectedFiles(count = 1): Promise<void> {
		const current = this.context.globalState.get<number>(MilestoneService.KEYS.TOTAL_FILES_PROTECTED, 0);
		const newValue = current + count;

		await this.context.globalState.update(MilestoneService.KEYS.TOTAL_FILES_PROTECTED, newValue);

		this.checkThresholds(current, newValue, MilestoneService.THRESHOLDS.FILES_PROTECTED, "files_protected");
	}

	/**
	 * Increment the count of recoveries (restores) and check for milestones
	 */
	async incrementRecoveries(): Promise<void> {
		const current = this.context.globalState.get<number>(MilestoneService.KEYS.TOTAL_RECOVERIES, 0);
		const newValue = current + 1;

		await this.context.globalState.update(MilestoneService.KEYS.TOTAL_RECOVERIES, newValue);

		this.checkThresholds(current, newValue, MilestoneService.THRESHOLDS.RECOVERIES, "recoveries");
	}

	/**
	 * Get current stats for display
	 */
	getStats(): { filesProtected: number; recoveries: number } {
		return {
			filesProtected: this.context.globalState.get<number>(MilestoneService.KEYS.TOTAL_FILES_PROTECTED, 0),
			recoveries: this.context.globalState.get<number>(MilestoneService.KEYS.TOTAL_RECOVERIES, 0),
		};
	}

	private checkThresholds(
		prev: number,
		current: number,
		thresholds: number[],
		metricType: "files_protected" | "recoveries",
	): void {
		const crossedThreshold = thresholds.find((t) => prev < t && current >= t);

		if (crossedThreshold) {
			this.triggerMilestone(metricType, crossedThreshold);
		}
	}

	private triggerMilestone(metricType: "files_protected" | "recoveries", value: number): void {
		// Track the milestone event
		this.telemetryProxy.trackEvent("value:milestone_reached", {
			milestone_type: metricType,
			value: value,
		});

		// Show user-facing celebration
		const message = this.getMilestoneMessage(metricType, value);

		this.notificationManager.showNotification({
			id: `milestone-${Date.now()}`,
			type: "info",
			icon: "🎉", // Celebration!
			message: message.title,
			detail: message.detail,
			timestamp: Date.now(),
			actions: [
				{ title: "Share Progress", command: "snapback.shareProgress" }, // Future feature
			],
		});
	}

	/**
	 * Trigger a generic first-time event with notification
	 * @param key Unique key for global state tracking (e.g., 'first_ai_detection')
	 * @param title Notification title
	 * @param detail Notification detail
	 */
	async triggerFirstTimeEvent(key: string, title: string, detail: string): Promise<void> {
		const fullKey = `snapback.events.${key}`;
		const hasOccurred = this.context.globalState.get<boolean>(fullKey, false);

		if (!hasOccurred) {
			await this.context.globalState.update(fullKey, true);

			this.telemetryProxy.trackEvent(`first_time:${key}`, {
				timestamp: Date.now(),
			});

			this.notificationManager.showNotification({
				id: `first-${key}-${Date.now()}`,
				type: "info",
				icon: "🎉",
				message: title,
				detail: detail,
				timestamp: Date.now(),
			});
		}
	}

	private getMilestoneMessage(
		metricType: "files_protected" | "recoveries",
		value: number,
	): { title: string; detail: string } {
		if (metricType === "files_protected") {
			return {
				title: `${value} Files Protected!`,
				detail: `You've protected ${value} files with SnapBack. That's a lot of code safe from accidental loss.`,
			};
		}
		return {
			title: `${value} Recovery Performed`, // Fixed grammar: "Recoveries" -> "Recovery" for 1, but "Recoveries" for others? Logic below handles pluralization if needed, but singular "1 Recovery" is better
			detail: `SnapBack has helped you recover from ${value} potential disasters. Keep coding fearlessly!`,
		};
	}
}
