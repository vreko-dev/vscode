import { logger } from "@snapback/infrastructure";

interface TelemetryEvent {
	type: string;
	snapshotId?: string;
	timestamp?: number;
	error?: string;
}

interface FunnelMetrics {
	initiated: number;
	completed: number;
	failed: number;
	conversionRate: number;
}

/**
 * FunnelValidator ensures snapshot creation telemetry events maintain correct ordering.
 * Validates event sequences and tracks funnel metrics.
 */
export class FunnelValidator {
	/**
	 * Validates that events follow correct order: initiated → completed.
	 */
	validateEventOrder(events: TelemetryEvent[]): boolean {
		if (!Array.isArray(events) || events.length === 0) {
			logger.warn("FunnelValidator: Empty event list");
			return false;
		}

		let hasInitiated = false;

		for (const event of events) {
			if (event.type === "snapshot_creation_initiated") {
				hasInitiated = true;
			} else if (event.type === "snapshot_creation_completed") {
				if (!hasInitiated) {
					logger.warn("FunnelValidator: Completed before initiated");
					return false;
				}
			}
		}

		logger.debug("FunnelValidator: Event order valid");
		return true;
	}

	/**
	 * Validates interleaved snapshots maintain separate event chains.
	 * Multiple snapshots can be in progress simultaneously.
	 */
	validateInterleavedSnapshots(events: TelemetryEvent[]): boolean {
		const snapshotStates = new Map<string, { initiated: boolean; completed: boolean }>();

		for (const event of events) {
			const snapshotId = event.snapshotId || "unknown";

			if (!snapshotStates.has(snapshotId)) {
				snapshotStates.set(snapshotId, { initiated: false, completed: false });
			}

			// Safe: we just set the value above if it didn't exist
			const state = snapshotStates.get(snapshotId);
			if (!state) {
				// This should never happen, but TypeScript requires the check
				continue;
			}

			if (event.type === "snapshot_creation_initiated") {
				state.initiated = true;
			} else if (event.type === "snapshot_creation_completed") {
				if (!state.initiated) {
					logger.warn("FunnelValidator: Completed without initiation", {
						snapshotId,
					});
					return false;
				}
				state.completed = true;
			}
		}

		logger.debug("FunnelValidator: Interleaved snapshots valid");
		return true;
	}

	/**
	 * Records failure in snapshot creation funnel.
	 */
	trackFailure(data: { snapshotId: string; reason: string }): {
		recorded: boolean;
		timestamp: number;
	} {
		logger.warn("Snapshot creation failure tracked", {
			snapshotId: data.snapshotId,
			reason: data.reason,
		});

		return {
			recorded: true,
			timestamp: Date.now(),
		};
	}

	/**
	 * Calculates funnel metrics from events.
	 */
	calculateMetrics(events: TelemetryEvent[]): FunnelMetrics {
		let initiated = 0;
		let completed = 0;
		let failed = 0;

		for (const event of events) {
			if (event.type === "snapshot_creation_initiated") {
				initiated++;
			} else if (event.type === "snapshot_creation_completed") {
				completed++;
			} else if (event.type === "snapshot_creation_failed") {
				failed++;
			}
		}

		const conversionRate = initiated > 0 ? (completed / initiated) * 100 : 0;

		return {
			initiated,
			completed,
			failed,
			conversionRate,
		};
	}
}
