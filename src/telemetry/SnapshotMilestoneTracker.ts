import { logger } from "@snapback/infrastructure";

type MilestoneType = "first" | "tenth" | "hundredth" | null;

interface MilestoneEvent {
	eventType: "milestone";
	milestone: MilestoneType;
	snapshotNumber: number;
	timestamp: number;
}

/**
 * SnapshotMilestoneTracker detects and emits telemetry for snapshot creation milestones.
 * Tracks 1st, 10th, 100th, and 1000th snapshots.
 */
export class SnapshotMilestoneTracker {
	private snapshotCount = 0;

	/**
	 * Records a snapshot and detects if it hits a milestone.
	 */
	recordSnapshot(): MilestoneType {
		this.snapshotCount++;
		const milestone = this.detectMilestone(this.snapshotCount);

		if (milestone) {
			logger.info("Snapshot milestone reached", {
				milestone,
				count: this.snapshotCount,
			});
		}

		return milestone;
	}

	/**
	 * Detects if a snapshot count is a milestone.
	 * Milestones: 1st, 10th, 100th, 1000th
	 */
	detectMilestone(count: number): MilestoneType {
		if (count === 1) return "first";
		if (count === 10) return "tenth";
		if (count === 100) return "hundredth";
		return null;
	}

	/**
	 * Tracks a sequence of milestone snapshots.
	 */
	trackMilestoneSequence(counts: number[]): MilestoneEvent[] {
		const events: MilestoneEvent[] = [];

		for (const count of counts) {
			const milestone = this.detectMilestone(count);
			if (milestone) {
				events.push({
					eventType: "milestone",
					milestone,
					snapshotNumber: count,
					timestamp: Date.now(),
				});
			}
		}

		logger.debug("Milestone sequence tracked", {
			total: counts.length,
			milestones: events.length,
		});

		return events;
	}

	/**
	 * Gets current snapshot count.
	 */
	getCount(): number {
		return this.snapshotCount;
	}

	/**
	 * Resets counter (for testing).
	 */
	reset(): void {
		this.snapshotCount = 0;
	}
}
