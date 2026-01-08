/**
 * DORAMetricsService - DORA Metrics Integration for VS Code Extension
 *
 * Bridges the DORAMetrics class from @snapback/intelligence with the extension's
 * snapshot and restore operations. Provides singleton access per workspace.
 *
 * Metrics tracked:
 * - Mean Time To Recovery (MTTR): Time from restore request to completion
 * - Lead Time for Protection: Time from code change to snapshot
 * - Snapshot Frequency: Snapshots per hour
 * - Recovery Success Rate: Percentage of successful restores
 * - Rework Rate: Percentage of recovery-triggered snapshots
 *
 * @packageDocumentation
 */

import {
	createDORAMetrics,
	type DORAMetrics,
	type DORASnapshot,
	type DORASnapshotEvent,
	type RecoveryEvent,
} from "@snapback/intelligence/vitals";
import { logger } from "../utils/logger";

/**
 * Snapshot origin types for DORA tracking
 */
export type SnapshotOrigin = "manual" | "auto" | "ai-detected" | "recovery";

/**
 * Active recovery tracking for MTTR calculation
 */
interface ActiveRecovery {
	snapshotId: string;
	requestTime: number;
	filesExpected: number;
}

/**
 * DORAMetricsService - Singleton per workspace
 *
 * @example
 * ```typescript
 * const dora = DORAMetricsService.for("workspace-123");
 *
 * // On snapshot creation
 * dora.recordSnapshotCreated("snap-1", "auto", 30000);
 *
 * // On restore start
 * dora.recordRecoveryStart("snap-1", 5);
 *
 * // On restore complete
 * dora.recordRecoveryComplete("snap-1", true, 5);
 *
 * // Get metrics
 * const metrics = dora.getMetrics();
 * console.log(`Performance tier: ${metrics.performanceTier}`);
 * ```
 */
export class DORAMetricsService {
	private static instances = new Map<string, DORAMetricsService>();

	private readonly metrics: DORAMetrics;
	private readonly workspaceId: string;
	private activeRecoveries = new Map<string, ActiveRecovery>();

	private constructor(workspaceId: string) {
		this.workspaceId = workspaceId;
		this.metrics = createDORAMetrics(workspaceId);

		logger.debug("DORAMetricsService initialized", { workspaceId });
	}

	/**
	 * Get or create service instance for workspace
	 */
	static for(workspaceId: string): DORAMetricsService {
		let instance = DORAMetricsService.instances.get(workspaceId);
		if (!instance) {
			instance = new DORAMetricsService(workspaceId);
			DORAMetricsService.instances.set(workspaceId, instance);
		}
		return instance;
	}

	/**
	 * Clear all instances (for testing)
	 */
	static clearAll(): void {
		DORAMetricsService.instances.clear();
	}

	// =========================================================================
	// SNAPSHOT TRACKING
	// =========================================================================

	/**
	 * Record a snapshot creation event
	 *
	 * @param snapshotId - Unique snapshot identifier
	 * @param origin - How the snapshot was triggered
	 * @param timeSinceLastChange - Milliseconds since last code change (lead time)
	 * @param isRecoveryTriggered - Whether this was created after a recovery scenario
	 */
	recordSnapshotCreated(
		snapshotId: string,
		origin: SnapshotOrigin,
		timeSinceLastChange: number,
		isRecoveryTriggered = false,
	): void {
		const event: DORASnapshotEvent = {
			snapshotId,
			timestamp: Date.now(),
			timeSinceLastChange,
			isRecoveryTriggered,
			trigger: origin,
		};

		this.metrics.recordSnapshot(event);

		logger.debug("DORA: Snapshot recorded", {
			snapshotId,
			origin,
			timeSinceLastChange,
			isRecoveryTriggered,
		});
	}

	// =========================================================================
	// RECOVERY TRACKING
	// =========================================================================

	/**
	 * Record the start of a recovery operation
	 * Call this when user initiates a restore
	 *
	 * @param snapshotId - Snapshot being restored
	 * @param filesExpected - Number of files to be restored
	 */
	recordRecoveryStart(snapshotId: string, filesExpected: number): void {
		this.activeRecoveries.set(snapshotId, {
			snapshotId,
			requestTime: Date.now(),
			filesExpected,
		});

		logger.debug("DORA: Recovery started", { snapshotId, filesExpected });
	}

	/**
	 * Record the completion of a recovery operation
	 * Call this when restore completes (success or failure)
	 *
	 * @param snapshotId - Snapshot that was restored
	 * @param success - Whether the restore succeeded
	 * @param filesRestored - Actual number of files restored
	 * @param failureReason - Reason for failure (if any)
	 */
	recordRecoveryComplete(snapshotId: string, success: boolean, filesRestored: number, failureReason?: string): void {
		const activeRecovery = this.activeRecoveries.get(snapshotId);

		if (!activeRecovery) {
			// Recovery was not tracked - create a synthetic start time
			logger.warn("DORA: Recovery complete without start tracking", { snapshotId });
			const syntheticStart = Date.now() - 1000; // Assume 1 second ago
			this.activeRecoveries.set(snapshotId, {
				snapshotId,
				requestTime: syntheticStart,
				filesExpected: filesRestored,
			});
		}

		const recovery = this.activeRecoveries.get(snapshotId)!;
		const completionTime = Date.now();

		const event: RecoveryEvent = {
			snapshotId,
			requestTime: recovery.requestTime,
			completionTime,
			success,
			filesRestored,
			failureReason,
		};

		this.metrics.recordRecovery(event);
		this.activeRecoveries.delete(snapshotId);

		const recoveryTime = completionTime - recovery.requestTime;

		logger.info("DORA: Recovery completed", {
			snapshotId,
			success,
			filesRestored,
			recoveryTimeMs: recoveryTime,
			failureReason,
		});
	}

	/**
	 * Record a failed recovery that never started properly
	 *
	 * @param snapshotId - Snapshot that failed to restore
	 * @param failureReason - Reason for the failure
	 */
	recordRecoveryFailed(snapshotId: string, failureReason: string): void {
		const event: RecoveryEvent = {
			snapshotId,
			requestTime: Date.now(),
			completionTime: Date.now(),
			success: false,
			filesRestored: 0,
			failureReason,
		};

		this.metrics.recordRecovery(event);
		this.activeRecoveries.delete(snapshotId);

		logger.warn("DORA: Recovery failed", { snapshotId, failureReason });
	}

	// =========================================================================
	// METRICS ACCESS
	// =========================================================================

	/**
	 * Get current DORA metrics snapshot
	 */
	getMetrics(): DORASnapshot {
		return this.metrics.getMetrics();
	}

	/**
	 * Get recovery time for a specific restore operation
	 *
	 * @param snapshotId - Snapshot ID to check
	 * @returns Recovery time in ms, or null if not found
	 */
	getRecoveryTime(snapshotId: string): number | null {
		return this.metrics.getRecoveryTime(snapshotId);
	}

	/**
	 * Get trend analysis for metrics
	 */
	getTrends(): {
		recoveryTrend: "improving" | "stable" | "degrading";
		frequencyTrend: "improving" | "stable" | "degrading";
	} {
		return this.metrics.getTrends();
	}

	/**
	 * Check if current performance tier meets target
	 *
	 * @param target - Target tier to check against
	 * @returns true if current tier is at or above target
	 */
	meetsPerformanceTarget(target: "elite" | "high" | "medium" | "low"): boolean {
		const metrics = this.getMetrics();
		const tierOrder = ["low", "medium", "high", "elite"];
		const currentIndex = tierOrder.indexOf(metrics.performanceTier);
		const targetIndex = tierOrder.indexOf(target);
		return currentIndex >= targetIndex;
	}

	/**
	 * Reset metrics (for testing)
	 */
	reset(): void {
		this.metrics.reset();
		this.activeRecoveries.clear();
		logger.debug("DORA: Metrics reset", { workspaceId: this.workspaceId });
	}
}

/**
 * Factory function for getting DORA metrics service
 */
export function getDORAMetricsService(workspaceId: string): DORAMetricsService {
	return DORAMetricsService.for(workspaceId);
}
