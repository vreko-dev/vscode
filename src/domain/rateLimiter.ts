/**
 * SnapshotRateLimiter
 *
 * Implements sliding window rate limiting for snapshot creation.
 * Tracks snapshot timestamps and enforces maximum snapshots per time period.
 *
 * Example:
 * - maxSnapshotsPerMinute: 4
 * - windowSizeMs: 60000 (1 minute)
 * - Track timestamps of snapshots created
 * - Reject if 4+ snapshots in last 60 seconds
 * - Allow new snapshot once oldest snapshot expires
 */

export interface RateLimiterConfig {
	/** Maximum snapshots allowed per window */
	maxSnapshots: number;

	/** Window size in milliseconds (default: 60000 = 1 minute) */
	windowSizeMs?: number;
}

export interface RateLimiterStatus {
	/** Current count of snapshots within window */
	count: number;

	/** Remaining quota (negative if over limit) */
	remaining: number;

	/** Milliseconds to wait until next snapshot allowed (0 if can snapshot now) */
	waitTimeMs: number;

	/** Whether a snapshot can be created right now */
	canSnapshot: boolean;
}

/**
 * Sliding window rate limiter for snapshot creation
 */
export class SnapshotRateLimiter {
	private timestamps: number[] = [];
	private readonly maxSnapshots: number;
	private readonly windowSizeMs: number;

	constructor(config: RateLimiterConfig) {
		this.maxSnapshots = config.maxSnapshots;
		this.windowSizeMs = config.windowSizeMs ?? 60000;

		if (this.maxSnapshots <= 0) {
			throw new Error("maxSnapshots must be positive");
		}

		if (this.windowSizeMs <= 0) {
			throw new Error("windowSizeMs must be positive");
		}
	}

	/**
	 * Clean up snapshots outside the current window
	 *
	 * @param currentTime - Current time in milliseconds
	 */
	private cleanup(currentTime: number): void {
		const windowStart = currentTime - this.windowSizeMs;
		this.timestamps = this.timestamps.filter((ts) => ts >= windowStart);
	}

	/**
	 * Check if a snapshot can be created and get status
	 *
	 * @param currentTime - Current time in milliseconds (defaults to Date.now())
	 * @returns Status indicating if snapshot is allowed
	 */
	getStatus(currentTime: number = Date.now()): RateLimiterStatus {
		this.cleanup(currentTime);

		const count = this.timestamps.length;
		const remaining = this.maxSnapshots - count;
		const canSnapshot = count < this.maxSnapshots;

		let waitTimeMs = 0;
		if (!canSnapshot && this.timestamps.length > 0) {
			const oldestTimestamp = this.timestamps[0];
			waitTimeMs = oldestTimestamp + this.windowSizeMs - currentTime;
			// Clamp to 0 if already expired (shouldn't happen after cleanup, but be safe)
			waitTimeMs = Math.max(0, waitTimeMs);
		}

		return {
			count,
			remaining,
			waitTimeMs,
			canSnapshot,
		};
	}

	/**
	 * Record a snapshot and return whether it was accepted
	 *
	 * @param timestamp - Timestamp of snapshot (defaults to Date.now())
	 * @returns true if snapshot was recorded, false if rate limit exceeded
	 */
	recordSnapshot(timestamp: number = Date.now()): boolean {
		const status = this.getStatus(timestamp);

		if (!status.canSnapshot) {
			return false;
		}

		this.timestamps.push(timestamp);
		return true;
	}

	/**
	 * Get current snapshot count within window
	 */
	getCount(currentTime: number = Date.now()): number {
		this.cleanup(currentTime);
		return this.timestamps.length;
	}

	/**
	 * Get remaining quota
	 */
	getRemaining(currentTime: number = Date.now()): number {
		return this.maxSnapshots - this.getCount(currentTime);
	}

	/**
	 * Get wait time until next snapshot is allowed
	 */
	getWaitTime(currentTime: number = Date.now()): number {
		const status = this.getStatus(currentTime);
		return status.waitTimeMs;
	}

	/**
	 * Check if snapshot can be created
	 */
	canSnapshot(currentTime: number = Date.now()): boolean {
		return this.getStatus(currentTime).canSnapshot;
	}

	/**
	 * Reset the rate limiter (clear all snapshots)
	 */
	reset(): void {
		this.timestamps = [];
	}

	/**
	 * Get all tracked timestamps (for testing)
	 */
	getTimestamps(): readonly number[] {
		return Object.freeze([...this.timestamps]);
	}
}

/**
 * Create a rate limiter with default configuration
 *
 * @param maxSnapshots - Maximum snapshots per minute (default: 4)
 * @param windowSizeMs - Window size in milliseconds (default: 60000)
 * @returns New SnapshotRateLimiter instance
 */
export function createRateLimiter(
	maxSnapshots: number = 4,
	windowSizeMs: number = 60000,
): SnapshotRateLimiter {
	return new SnapshotRateLimiter({ maxSnapshots, windowSizeMs });
}
