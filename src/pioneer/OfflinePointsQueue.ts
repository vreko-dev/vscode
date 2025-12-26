/**
 * OfflinePointsQueue.ts
 *
 * Queues Pioneer points events when offline and syncs on reconnect.
 * Follows the OfflineEventQueue pattern with globalState persistence.
 *
 * Spec Reference: unified_ux_spec.md §3.6, §5.2, §7.1 P0-4
 * Edge Cases Covered:
 *   - J5-E01: Points awarded while offline (P0)
 *   - J5-E04: Tier threshold crossed offline
 *
 * Implementation Pattern: From SnapBack learning #4 (OfflineEventQueue pattern)
 *
 * @see https://github.com/your-org/snapback/blob/main/apps/vscode/unified_ux_spec.md
 */

import { randomUUID } from "node:crypto";
import { calculateBackoff } from "@snapback/sdk";
import type * as vscode from "vscode";
import { logger } from "../utils/logger";

/**
 * Queued point event with retry metadata.
 */
export interface QueuedPointEvent {
	/** Unique identifier for this event */
	id: string;
	/** Action that earned points (e.g., 'snapshot_created', 'first_restore') */
	action: string;
	/** Points value for this action */
	points: number;
	/** Timestamp when event was created */
	timestamp: number;
	/** Number of retry attempts */
	retryCount: number;
	/** Optional metadata about the action */
	metadata?: Record<string, unknown>;
}

/**
 * Configuration for OfflinePointsQueue.
 */
export interface OfflinePointsQueueConfig {
	/** Maximum number of events to keep in queue */
	maxSize?: number;
	/** Maximum number of retry attempts per event */
	maxRetries?: number;
	/** Base delay for exponential backoff (ms) */
	baseRetryDelayMs?: number;
	/** Maximum retry delay cap (ms) */
	maxRetryDelayMs?: number;
	/** Maximum age of events in ms (events older than this are dropped) */
	maxAgeMs?: number;
}

const STORAGE_KEY = "snapback.pioneer.offlinePointsQueue";
const PENDING_POINTS_KEY = "snapback.pioneer.pendingPoints";

const DEFAULT_CONFIG: Required<OfflinePointsQueueConfig> = {
	maxSize: 50, // Lower than telemetry - points are critical
	maxRetries: 10, // More retries - points should eventually sync
	baseRetryDelayMs: 2000, // 2 seconds
	maxRetryDelayMs: 300_000, // 5 minutes max
	maxAgeMs: 30 * 24 * 60 * 60 * 1000, // 30 days (points matter!)
};

/** Point values for different actions */
export const POINT_VALUES: Record<string, number> = {
	snapshot_created: 1,
	first_restore: 10,
	disaster_averted: 5,
	protection_upgraded: 2,
	session_completed: 1,
	referral_accepted: 25,
};

/**
 * Persistent queue for offline Pioneer points.
 *
 * Features:
 * - Persists to VS Code globalState
 * - Automatic size limiting with FIFO eviction
 * - Exponential backoff retry logic (from SDK)
 * - Age-based event expiration
 * - Pending points tracking for UI display
 */
export class OfflinePointsQueue {
	private events: QueuedPointEvent[] = [];
	private pendingPoints = 0;
	private readonly config: Required<OfflinePointsQueueConfig>;
	private flushTimer: ReturnType<typeof setTimeout> | null = null;
	private isOnline = true;
	private apiEndpoint?: string;
	private authToken?: string;

	constructor(
		private readonly context: vscode.ExtensionContext,
		config: OfflinePointsQueueConfig = {},
	) {
		this.config = { ...DEFAULT_CONFIG, ...config };
		this.loadFromStorage();
		this.setupNetworkMonitoring();
	}

	/**
	 * Set API endpoint and auth token for flushing.
	 */
	configure(apiEndpoint: string, authToken: string): void {
		this.apiEndpoint = apiEndpoint;
		this.authToken = authToken;
	}

	/**
	 * Load events from persistent storage.
	 */
	private loadFromStorage(): void {
		try {
			const persisted = this.context.globalState.get<QueuedPointEvent[]>(STORAGE_KEY, []);

			// Validate and filter events
			const now = Date.now();
			const validEvents = Array.isArray(persisted)
				? persisted.filter((event) => {
						// Validate required fields
						if (
							!event ||
							typeof event !== "object" ||
							!event.id ||
							!event.action ||
							typeof event.points !== "number" ||
							typeof event.timestamp !== "number" ||
							typeof event.retryCount !== "number"
						) {
							return false;
						}
						// Check age
						return now - event.timestamp <= this.config.maxAgeMs;
					})
				: [];

			// Enforce max size (keep most recent)
			this.events =
				validEvents.length > this.config.maxSize ? validEvents.slice(-this.config.maxSize) : validEvents;

			// Recalculate pending points from valid events
			this.pendingPoints = this.events.reduce((sum, e) => sum + e.points, 0);

			logger.debug("OfflinePointsQueue loaded", {
				events: this.events.length,
				pendingPoints: this.pendingPoints,
			});
		} catch {
			this.events = [];
			this.pendingPoints = 0;
		}
	}

	/**
	 * Persist events to storage.
	 */
	private persist(): void {
		void this.context.globalState.update(STORAGE_KEY, this.events);
		void this.context.globalState.update(PENDING_POINTS_KEY, this.pendingPoints);
	}

	/**
	 * Setup network monitoring for auto-flush.
	 */
	private setupNetworkMonitoring(): void {
		const globalWindow = globalThis as { addEventListener?: (type: string, handler: () => void) => void };

		if (globalWindow.addEventListener) {
			globalWindow.addEventListener("online", () => {
				this.isOnline = true;
				logger.info("Network restored, flushing offline points queue");
				void this.flush();
			});

			globalWindow.addEventListener("offline", () => {
				this.isOnline = false;
				logger.info("Network disconnected, points will be queued");
			});
		}

		// Periodic flush attempt (every 5 minutes if online)
		this.flushTimer = setInterval(
			() => {
				if (this.isOnline && this.events.length > 0) {
					void this.flush();
				}
			},
			5 * 60 * 1000,
		);
	}

	/**
	 * Add a point-earning action to the queue.
	 */
	async enqueue(action: string, metadata?: Record<string, unknown>): Promise<void> {
		const points = POINT_VALUES[action] ?? 1;

		const event: QueuedPointEvent = {
			id: randomUUID(),
			action,
			points,
			timestamp: Date.now(),
			retryCount: 0,
			metadata,
		};

		this.events.push(event);
		this.pendingPoints += points;

		// Enforce size limit (drop oldest)
		if (this.events.length > this.config.maxSize) {
			const dropped = this.events.shift();
			if (dropped) {
				this.pendingPoints -= dropped.points;
			}
		}

		this.persist();

		logger.debug("Point event queued", {
			action,
			points,
			queueSize: this.events.length,
			pendingTotal: this.pendingPoints,
		});

		// Try to flush immediately if online
		if (this.isOnline) {
			void this.flush();
		}
	}

	/**
	 * Attempt to flush queue to API.
	 * Uses batch submission with exponential backoff on failure.
	 */
	async flush(): Promise<{ success: boolean; synced: number; remaining: number }> {
		if (this.events.length === 0) {
			return { success: true, synced: 0, remaining: 0 };
		}

		if (!this.apiEndpoint || !this.authToken) {
			logger.debug("OfflinePointsQueue: API not configured, skipping flush");
			return { success: false, synced: 0, remaining: this.events.length };
		}

		const batch = [...this.events];
		let synced = 0;

		try {
			const response = await fetch(`${this.apiEndpoint}/api/rpc/pioneer.submitPoints`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${this.authToken}`,
				},
				body: JSON.stringify({
					events: batch.map((e) => ({
						action: e.action,
						points: e.points,
						timestamp: e.timestamp,
						metadata: e.metadata,
					})),
				}),
			});

			if (response.ok) {
				// Success - clear synced events
				synced = batch.length;
				this.events = [];
				this.pendingPoints = 0;
				this.persist();

				logger.info("Pioneer points synced successfully", {
					synced,
					totalPoints: batch.reduce((sum, e) => sum + e.points, 0),
				});

				return { success: true, synced, remaining: 0 };
			}

			// API error - increment retry counts
			for (const event of this.events) {
				event.retryCount++;
			}

			// Remove events that exceeded max retries
			const before = this.events.length;
			this.events = this.events.filter((e) => e.retryCount < this.config.maxRetries);
			this.pendingPoints = this.events.reduce((sum, e) => sum + e.points, 0);

			if (this.events.length < before) {
				logger.warn("Dropped expired point events", {
					dropped: before - this.events.length,
				});
			}

			this.persist();

			// Schedule retry with backoff
			const maxRetry = Math.max(...this.events.map((e) => e.retryCount), 1);
			const delay = calculateBackoff(maxRetry, this.config.baseRetryDelayMs, this.config.maxRetryDelayMs, true);

			logger.debug("Points sync failed, will retry", {
				status: response.status,
				retryInMs: delay,
			});

			setTimeout(() => void this.flush(), delay);

			return { success: false, synced: 0, remaining: this.events.length };
		} catch (error) {
			logger.debug("Points sync failed (network)", {
				error: error instanceof Error ? error.message : String(error),
			});

			return { success: false, synced: 0, remaining: this.events.length };
		}
	}

	/**
	 * Get pending points count (for UI display).
	 */
	getPendingPoints(): number {
		return this.pendingPoints;
	}

	/**
	 * Get queue size.
	 */
	size(): number {
		return this.events.length;
	}

	/**
	 * Check if queue is empty.
	 */
	isEmpty(): boolean {
		return this.events.length === 0;
	}

	/**
	 * Clear all events (use with caution).
	 */
	clear(): void {
		this.events = [];
		this.pendingPoints = 0;
		this.persist();
	}

	/**
	 * Dispose resources.
	 */
	dispose(): void {
		if (this.flushTimer) {
			clearInterval(this.flushTimer);
			this.flushTimer = null;
		}
	}
}
