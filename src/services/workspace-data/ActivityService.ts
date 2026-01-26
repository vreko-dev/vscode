/**
 * ActivityService - Activity Timeline and AI Detection
 *
 * Single responsibility: Manage activity events, timeline building, and AI detection history.
 *
 * @packageDocumentation
 */

import { logger } from "../../utils/logger";
import type { ActivityData, ActivityEvent, AIDetectionEntry, RestoreEvent, SnapshotCoordinator } from "./types";
import { TIMELINE_MAX_SNAPSHOTS, TIMELINE_WINDOW_DAYS } from "./types";

/**
 * Callback for data change notifications
 */
export type ActivityChangeCallback = (event: "activity-updated" | "ai-detection-recorded" | "restore-recorded") => void;

/**
 * Service for managing activity timeline and AI detection
 */
export class ActivityService {
	private activityEvents: ActivityEvent[] = [];
	private aiDetectionHistory: Map<string, AIDetectionEntry> = new Map();
	private restoreEvents: RestoreEvent[] = [];
	private onChangeCallback?: ActivityChangeCallback;

	constructor(private readonly coordinator: SnapshotCoordinator) {}

	/**
	 * Set change callback for notifying parent service
	 */
	setOnChangeCallback(callback: ActivityChangeCallback): void {
		this.onChangeCallback = callback;
	}

	/**
	 * Get restore events (for StatsService)
	 */
	getRestoreEvents(): RestoreEvent[] {
		return this.restoreEvents;
	}

	/**
	 * Get activity data for activity tab
	 */
	async getActivityData(): Promise<ActivityData> {
		const now = Date.now();
		const todayStart = new Date().setHours(0, 0, 0, 0);
		const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;
		const weekStart = now - TIMELINE_WINDOW_DAYS * 24 * 60 * 60 * 1000;

		const timeline = await this.buildTimeline();
		const aiDetectionLog = this.getAIDetectionLog();

		const todayEvents = timeline.filter((e) => e.timestamp >= todayStart).length;
		const yesterdayEvents = timeline.filter(
			(e) => e.timestamp >= yesterdayStart && e.timestamp < todayStart,
		).length;
		const weekEvents = timeline.filter((e) => e.timestamp >= weekStart).length;

		return {
			timeline,
			aiDetectionLog,
			todayEvents,
			yesterdayEvents,
			weekEvents,
		};
	}

	/**
	 * Build activity timeline from various sources
	 */
	private async buildTimeline(): Promise<ActivityEvent[]> {
		const events: ActivityEvent[] = [...this.activityEvents];
		const now = Date.now();
		const windowStart = now - TIMELINE_WINDOW_DAYS * 24 * 60 * 60 * 1000;

		try {
			const snapshots = await this.coordinator.listSnapshots();
			const recentSnapshots = snapshots.filter((s) => s.timestamp > windowStart).slice(0, TIMELINE_MAX_SNAPSHOTS);

			for (const snapshot of recentSnapshots) {
				events.push({
					id: snapshot.id,
					type: "auto-snapshot",
					file: snapshot.anchorFile || snapshot.name || "snapshot",
					timestamp: snapshot.timestamp,
					details: `${snapshot.fileCount} files`,
				});
			}

			// Add restore events
			for (const restore of this.restoreEvents) {
				if (restore.timestamp > windowStart) {
					events.push({
						id: `restore-${restore.snapshotId}-${restore.timestamp}`,
						type: "restore",
						file: `Restored ${restore.filesRestored} files`,
						timestamp: restore.timestamp,
						details: `~${restore.tokensEstimate} tokens saved`,
					});
				}
			}
		} catch (error) {
			logger.error("ActivityService: Failed to build timeline", error as Error);
		}

		// Deduplicate and sort
		const uniqueEvents = new Map<string, ActivityEvent>();
		for (const event of events) {
			if (!uniqueEvents.has(event.id)) {
				uniqueEvents.set(event.id, event);
			}
		}

		return Array.from(uniqueEvents.values()).sort((a, b) => b.timestamp - a.timestamp);
	}

	/**
	 * Get AI detection log sorted by sessions
	 */
	private getAIDetectionLog(): AIDetectionEntry[] {
		return Array.from(this.aiDetectionHistory.values()).sort((a, b) => b.sessions - a.sessions);
	}

	/**
	 * Record a restore event
	 */
	recordRestore(snapshotId: string, filesRestored: number): void {
		const TOKENS_PER_LINE = 4;
		const TOKENS_PER_RESTORE = 1400;
		const LINES_PER_FILE_ESTIMATE = 50;

		const tokensEstimate = filesRestored * LINES_PER_FILE_ESTIMATE * TOKENS_PER_LINE + TOKENS_PER_RESTORE;

		this.restoreEvents.push({
			snapshotId,
			timestamp: Date.now(),
			filesRestored,
			tokensEstimate,
		});

		// Prune old events (keep last 30 days)
		const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
		this.restoreEvents = this.restoreEvents.filter((e) => e.timestamp > thirtyDaysAgo);

		this.onChangeCallback?.("restore-recorded");
		logger.debug("ActivityService: Restore recorded", { snapshotId, filesRestored, tokensEstimate });
	}

	/**
	 * Record AI detection
	 */
	recordAIDetection(tool: string, confidence: number): void {
		const existing = this.aiDetectionHistory.get(tool) || {
			tool,
			sessions: 0,
			accuracy: confidence * 100,
			lastDetected: 0,
		};

		existing.sessions++;
		existing.lastDetected = Date.now();
		existing.accuracy = Math.round((existing.accuracy + confidence * 100) / 2);

		this.aiDetectionHistory.set(tool, existing);
		this.onChangeCallback?.("ai-detection-recorded");
	}

	/**
	 * Add a custom activity event
	 */
	addActivityEvent(event: ActivityEvent): void {
		this.activityEvents.push(event);
		this.onChangeCallback?.("activity-updated");
	}
}
