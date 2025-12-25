/**
 * RestoreTelemetry.ts
 *
 * Specialized telemetry for restore operations.
 * Tracks the critical "aha moment" funnel when users successfully recover code.
 *
 * Spec Reference: unified_ux_spec.md §9.1
 * Covers:
 *   - P0-1: snapshot_restored telemetry
 *   - Restore success/failure/cancellation tracking
 *
 * @see https://github.com/your-org/snapback/blob/main/apps/vscode/unified_ux_spec.md
 */

import type { TelemetryProxy } from "../services/telemetry-proxy";
import { logger } from "../utils/logger";

/**
 * Restore operation metadata for telemetry.
 */
export interface RestoreMetadata {
	/** Unique snapshot identifier */
	snapshotId: string;
	/** Number of files restored */
	fileCount: number;
	/** Duration in milliseconds */
	durationMs: number;
	/** Type of restore operation */
	restoreType: "full_snapshot" | "single_file" | "partial" | "cluster";
	/** Whether conflicts were detected */
	hadConflicts: boolean;
	/** Source that triggered the restore */
	source: "command" | "tree_view" | "notification" | "quick_pick" | "mcp";
}

/**
 * Tracks restore-specific telemetry events.
 * Part of the "aha moment" funnel - critical for measuring product value.
 *
 * Events:
 * - snapshot_restored: Successful restore (P0-1)
 * - restore_failed: Failed restore attempt
 * - restore_cancelled: User cancelled restore
 * - restore_started: Restore initiated (for funnel analysis)
 */
export class RestoreTelemetry {
	private restoreStartTimes = new Map<string, number>();

	constructor(private readonly telemetry?: TelemetryProxy) {}

	/**
	 * Set telemetry proxy after construction.
	 */
	setTelemetry(telemetry: TelemetryProxy): RestoreTelemetry {
		return new RestoreTelemetry(telemetry);
	}

	/**
	 * Mark restore as started (for duration tracking).
	 */
	trackRestoreStart(snapshotId: string): void {
		this.restoreStartTimes.set(snapshotId, Date.now());

		this.trackEvent("restore_started", {
			snapshot_id: snapshotId,
		});

		logger.debug("Restore started", { snapshotId });
	}

	/**
	 * Track successful restore operation.
	 * P0-1 Requirement - The "aha moment" telemetry.
	 */
	trackRestoreSuccess(snapshotId: string, fileCount: number, metadata?: Partial<RestoreMetadata>): void {
		const startTime = this.restoreStartTimes.get(snapshotId) ?? Date.now();
		const durationMs = Date.now() - startTime;
		this.restoreStartTimes.delete(snapshotId);

		this.trackEvent("snapshot_restored", {
			snapshot_id: snapshotId,
			files_restored: fileCount,
			duration_ms: durationMs,
			restore_type: metadata?.restoreType ?? "full_snapshot",
			had_conflicts: metadata?.hadConflicts ?? false,
			source: metadata?.source ?? "command",
			success: true,
		});

		// Also track value:disaster_averted for analytics
		this.trackEvent("value:disaster_averted", {
			files_restored: fileCount,
			recovery_type: metadata?.restoreType ?? "full_snapshot",
			lines_recovered: fileCount * 50, // Estimate: 50 lines/file average
			severity: fileCount > 1 ? "high" : "medium",
		});

		logger.info("Restore successful", {
			snapshotId,
			fileCount,
			durationMs,
		});
	}

	/**
	 * Track failed restore attempt.
	 */
	trackRestoreFailure(snapshotId: string, error: string, metadata?: Partial<RestoreMetadata>): void {
		const startTime = this.restoreStartTimes.get(snapshotId) ?? Date.now();
		const durationMs = Date.now() - startTime;
		this.restoreStartTimes.delete(snapshotId);

		this.trackEvent("restore_failed", {
			snapshot_id: snapshotId,
			error_message: error,
			duration_ms: durationMs,
			restore_type: metadata?.restoreType ?? "full_snapshot",
			source: metadata?.source ?? "command",
		});

		logger.warn("Restore failed", {
			snapshotId,
			error,
			durationMs,
		});
	}

	/**
	 * Track restore cancellation by user.
	 */
	trackRestoreCancelled(snapshotId: string, reason?: string, metadata?: Partial<RestoreMetadata>): void {
		const startTime = this.restoreStartTimes.get(snapshotId) ?? Date.now();
		const durationMs = Date.now() - startTime;
		this.restoreStartTimes.delete(snapshotId);

		this.trackEvent("restore_cancelled", {
			snapshot_id: snapshotId,
			cancellation_reason: reason ?? "user_cancelled",
			duration_ms: durationMs,
			restore_type: metadata?.restoreType ?? "full_snapshot",
			source: metadata?.source ?? "command",
		});

		logger.info("Restore cancelled", {
			snapshotId,
			reason,
		});
	}

	/**
	 * Track conflict resolution during restore.
	 */
	trackConflictResolved(snapshotId: string, resolution: "keep_current" | "use_snapshot" | "merge" | "skip"): void {
		this.trackEvent("restore_conflict_resolved", {
			snapshot_id: snapshotId,
			resolution,
		});
	}

	/**
	 * Internal event tracking with null safety.
	 */
	private trackEvent(event: string, properties: Record<string, unknown>): void {
		if (!this.telemetry) {
			logger.debug("Telemetry not configured, skipping event", { event });
			return;
		}

		void this.telemetry.trackEvent(event, properties).catch((err) => {
			logger.debug("Telemetry event failed", {
				event,
				error: err instanceof Error ? err.message : String(err),
			});
		});
	}
}
