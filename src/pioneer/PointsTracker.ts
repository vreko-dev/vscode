import { randomUUID } from "node:crypto";
import { calculateBackoff } from "@snapback/sdk";
import * as vscode from "vscode";
import { API_BASE_URL } from "../constants";
import { logger } from "../utils/logger";
import type { PioneerAuth } from "./PioneerAuth";

type ActionType = "github_star" | "discord_join" | "referral" | "feedback" | "bug_report" | "tutorial_complete";

/**
 * P0 FIX #4: Queued action for offline retry
 */
interface QueuedAction {
	/** Unique identifier for this action */
	id: string;
	/** Action type */
	actionType: ActionType;
	/** Additional metadata */
	metadata?: Record<string, unknown>;
	/** Timestamp when action was queued */
	timestamp: number;
	/** Number of retry attempts */
	retryCount: number;
}

/** Storage key for offline queue */
const OFFLINE_QUEUE_KEY = "snapback.pioneer.offlineActionQueue";
/** Maximum retries before dropping action */
const MAX_RETRIES = 5;
/** Base delay for exponential backoff (ms) */
const BASE_RETRY_DELAY = 1000;
/** Maximum retry delay cap (ms) */
const MAX_RETRY_DELAY = 60000;
/** Maximum age of queued actions (7 days) */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface PointsTrackerResult {
	success: boolean;
	pointsEarned: number;
	newTotalPoints: number;
	tierChanged: boolean;
	newTier?: string;
}

/**
 * Tracks pioneer actions and syncs with the server.
 *
 * Responsibilities:
 * - Submit actions to API when triggered
 * - Emit events for UI updates
 * - P0 FIX #4: Queue actions when offline and retry when back online
 */
export class PointsTracker {
	private pioneerAuth?: PioneerAuth;
	private context?: vscode.ExtensionContext;
	private onPointsUpdateEmitter = new vscode.EventEmitter<PointsTrackerResult>();
	private isProcessingQueue = false;
	private retryTimer: NodeJS.Timeout | undefined;

	/** Event fired when points are updated */
	readonly onPointsUpdate = this.onPointsUpdateEmitter.event;

	/**
	 * P0 FIX #4: Set the extension context for offline queue persistence
	 */
	setContext(context: vscode.ExtensionContext): void {
		this.context = context;

		// Setup network monitoring for queue processing
		this.setupNetworkMonitoring();

		// Process any queued actions on startup
		void this.processOfflineQueue();
	}

	/**
	 * P0 FIX #4: Setup network monitoring to process queue when online
	 */
	private setupNetworkMonitoring(): void {
		// Check if running in a browser-like environment with event listeners
		// biome-ignore lint/suspicious/noExplicitAny: globalThis type varies by environment
		const globalWindow = globalThis as any;

		if (typeof globalWindow?.addEventListener === "function") {
			globalWindow.addEventListener("online", () => {
				logger.info("[PointsTracker] Network online, processing offline queue");
				void this.processOfflineQueue();
			});
		}

		// Also schedule periodic queue processing (fallback for Node.js environment)
		setInterval(() => {
			if (!this.isProcessingQueue) {
				void this.processOfflineQueue();
			}
		}, 60000); // Check every minute
	}

	/**
	 * Set the PioneerAuth instance for getting session tokens
	 */
	setAuth(auth: PioneerAuth): void {
		this.pioneerAuth = auth;
	}

	/**
	 * Submit an action and add points
	 * Calls the real API to record the action
	 * P0 FIX #4: Queues action for offline retry if submission fails
	 */
	async addPoints(actionType: ActionType, metadata?: Record<string, unknown>): Promise<PointsTrackerResult> {
		logger.info(`[PointsTracker] Submitting action: ${actionType}`);

		if (!this.pioneerAuth) {
			logger.error("PointsTracker: PioneerAuth not set");
			// P0 FIX #4: Queue action for later if no auth yet
			this.queueAction(actionType, metadata);
			return {
				success: false,
				pointsEarned: 0,
				newTotalPoints: 0,
				tierChanged: false,
			};
		}

		const sessionToken = await this.pioneerAuth.getSessionToken();

		if (!sessionToken) {
			logger.warn("PointsTracker: No session token, queuing action for retry");
			// P0 FIX #4: Queue action for later when we get a session
			this.queueAction(actionType, metadata);
			return {
				success: false,
				pointsEarned: 0,
				newTotalPoints: 0,
				tierChanged: false,
			};
		}

		try {
			const response = await fetch(`${this.getApiBaseUrl()}/api/pioneer/actions/submit`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${sessionToken}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					actionType,
					metadata,
				}),
			});

			if (!response.ok) {
				const errorText = await response.text();
				logger.error(`PointsTracker: API error ${response.status}: ${errorText}`);
				// P0 FIX #4: Queue for retry on server error (5xx)
				if (response.status >= 500) {
					this.queueAction(actionType, metadata);
				}
				return {
					success: false,
					pointsEarned: 0,
					newTotalPoints: 0,
					tierChanged: false,
				};
			}

			const data = (await response.json()) as {
				success: boolean;
				action: { points: number };
				profile: { totalPoints: number; tier: string };
			};

			const result: PointsTrackerResult = {
				success: true,
				pointsEarned: data.action.points,
				newTotalPoints: data.profile.totalPoints,
				tierChanged: false, // Will be updated based on tier comparison
				newTier: data.profile.tier,
			};

			logger.info("PointsTracker: Action submitted", {
				actionType,
				pointsEarned: result.pointsEarned,
				newTotalPoints: result.newTotalPoints,
			});

			// Emit event for UI updates
			this.onPointsUpdateEmitter.fire(result);

			// Invalidate profile cache to get fresh data
			this.pioneerAuth.invalidateCache();

			return result;
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			logger.error("PointsTracker: Failed to submit action, queuing for retry", err);
			// P0 FIX #4: Queue action for offline retry
			this.queueAction(actionType, metadata);
			return {
				success: false,
				pointsEarned: 0,
				newTotalPoints: 0,
				tierChanged: false,
			};
		}
	}

	/**
	 * Sync points with server (refresh profile)
	 * Used on activation to get latest state
	 */
	async syncWithServer(): Promise<void> {
		logger.info("[PointsTracker] Syncing points with server...");

		if (!this.pioneerAuth) {
			logger.warn("PointsTracker: PioneerAuth not set, sync skipped");
			return;
		}

		// Force profile refresh
		this.pioneerAuth.invalidateCache();
		await this.pioneerAuth.getProfile();

		logger.info("[PointsTracker] Sync complete");
	}

	/**
	 * Get API base URL from configuration
	 */
	private getApiBaseUrl(): string {
		const config = vscode.workspace.getConfiguration("snapback");
		return config.get<string>("apiBaseUrl") || API_BASE_URL;
	}

	// ============================================================
	// P0 FIX #4: Offline Queue Implementation
	// ============================================================

	/**
	 * Queue an action for offline retry
	 */
	private queueAction(actionType: ActionType, metadata?: Record<string, unknown>): void {
		if (!this.context) {
			logger.warn("[PointsTracker] Cannot queue action: context not set");
			return;
		}

		const queue = this.getOfflineQueue();

		const queuedAction: QueuedAction = {
			id: randomUUID(),
			actionType,
			metadata,
			timestamp: Date.now(),
			retryCount: 0,
		};

		queue.push(queuedAction);

		// Enforce max size (100 actions) - drop oldest
		if (queue.length > 100) {
			queue.shift();
		}

		this.persistQueue(queue);
		logger.info(`[PointsTracker] Queued action for retry: ${actionType}`, {
			queueSize: queue.length,
		});
	}

	/**
	 * Get the offline queue from storage
	 */
	private getOfflineQueue(): QueuedAction[] {
		if (!this.context) {
			return [];
		}

		try {
			const persisted = this.context.globalState.get<QueuedAction[]>(OFFLINE_QUEUE_KEY, []);
			const now = Date.now();

			// Filter valid events (not too old, has required fields)
			return Array.isArray(persisted)
				? persisted.filter((action) => {
						if (
							!action ||
							typeof action !== "object" ||
							!action.id ||
							!action.actionType ||
							typeof action.timestamp !== "number"
						) {
							return false;
						}
						// Drop actions older than 7 days
						if (now - action.timestamp > MAX_AGE_MS) {
							return false;
						}
						return true;
					})
				: [];
		} catch {
			return [];
		}
	}

	/**
	 * Persist the queue to storage
	 */
	private persistQueue(queue: QueuedAction[]): void {
		if (!this.context) {
			return;
		}
		void this.context.globalState.update(OFFLINE_QUEUE_KEY, queue);
	}

	/**
	 * Process the offline queue - retry queued actions
	 */
	private async processOfflineQueue(): Promise<void> {
		if (this.isProcessingQueue || !this.context || !this.pioneerAuth) {
			return;
		}

		const sessionToken = await this.pioneerAuth.getSessionToken();
		if (!sessionToken) {
			// No session yet, schedule retry later
			this.scheduleNextProcessing(30000);
			return;
		}

		this.isProcessingQueue = true;

		try {
			const queue = this.getOfflineQueue();
			if (queue.length === 0) {
				return;
			}

			logger.info(`[PointsTracker] Processing offline queue: ${queue.length} actions`);

			let processedCount = 0;
			const maxBatchSize = 5; // Limit batch size to avoid blocking

			while (queue.length > 0 && processedCount < maxBatchSize) {
				const action = queue[0];
				if (!action) {
					break;
				}

				// Check if we should still retry this action
				if (action.retryCount >= MAX_RETRIES) {
					logger.warn(`[PointsTracker] Dropping action after max retries: ${action.actionType}`);
					queue.shift();
					this.persistQueue(queue);
					processedCount++;
					continue;
				}

				// Attempt to submit
				const success = await this.submitQueuedAction(action, sessionToken);

				if (success) {
					// Remove from queue on success
					queue.shift();
					this.persistQueue(queue);
					logger.debug(`[PointsTracker] Queued action submitted: ${action.actionType}`);
					processedCount++;
				} else {
					// Increment retry count and wait
					action.retryCount++;
					this.persistQueue(queue);

					const retryDelay = calculateBackoff(
						action.retryCount,
						BASE_RETRY_DELAY,
						MAX_RETRY_DELAY,
						false, // No jitter
					);
					logger.debug(`[PointsTracker] Action retry scheduled in ${retryDelay}ms: ${action.actionType}`);

					// Schedule retry with exponential backoff
					this.scheduleNextProcessing(retryDelay);
					break; // Stop processing, wait for retry
				}
			}

			if (queue.length > 0 && processedCount >= maxBatchSize) {
				// More to process, schedule next batch
				this.scheduleNextProcessing(1000);
			}
		} finally {
			this.isProcessingQueue = false;
		}
	}

	/**
	 * Submit a queued action to the API
	 */
	private async submitQueuedAction(action: QueuedAction, sessionToken: string): Promise<boolean> {
		try {
			const response = await fetch(`${this.getApiBaseUrl()}/api/pioneer/actions/submit`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${sessionToken}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					actionType: action.actionType,
					metadata: {
						...action.metadata,
						_queued_at: action.timestamp,
						_retry_count: action.retryCount,
					},
				}),
			});

			if (response.ok) {
				const data = (await response.json()) as {
					success: boolean;
					action: { points: number };
					profile: { totalPoints: number; tier: string };
				};

				// Emit event for UI updates
				this.onPointsUpdateEmitter.fire({
					success: true,
					pointsEarned: data.action.points,
					newTotalPoints: data.profile.totalPoints,
					tierChanged: false,
					newTier: data.profile.tier,
				});

				// Invalidate profile cache
				this.pioneerAuth?.invalidateCache();

				return true;
			}

			// Server error (5xx) - should retry
			if (response.status >= 500) {
				return false;
			}

			// Client error (4xx) - don't retry (e.g., invalid action type)
			logger.warn(`[PointsTracker] Client error for queued action, dropping: ${response.status}`);
			return true; // Return true to remove from queue
		} catch (error) {
			logger.debug("[PointsTracker] Network error submitting queued action", {
				error: error instanceof Error ? error.message : String(error),
			});
			return false; // Network error - should retry
		}
	}

	/**
	 * Schedule next queue processing
	 */
	private scheduleNextProcessing(delay: number): void {
		if (this.retryTimer) {
			clearTimeout(this.retryTimer);
		}

		this.retryTimer = setTimeout(() => {
			this.retryTimer = undefined;
			void this.processOfflineQueue();
		}, delay);
	}

	/**
	 * Get the current queue size (for monitoring/testing)
	 */
	getQueueSize(): number {
		return this.getOfflineQueue().length;
	}

	/**
	 * Dispose resources
	 */
	dispose(): void {
		if (this.retryTimer) {
			clearTimeout(this.retryTimer);
		}
		this.onPointsUpdateEmitter.dispose();
	}
}
