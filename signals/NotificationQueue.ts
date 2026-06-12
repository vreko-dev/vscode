/**
 * NotificationQueue - Priority-Based Notification Management
 *
 * VS Code shows all active notifications simultaneously with no native priority
 * or queuing. This utility enforces "never stack" in code.
 *
 * Features:
 * - Priority-based queuing (higher priority interrupts lower)
 * - Single active notification enforcement
 * - Pending queue for deferred notifications
 * - Async result handling
 * - FM-1: 30s timeout guard prevents zombie active state
 * - FM-2: Generation counter prevents double-drain on priority interrupt
 *
 * @module signals/NotificationQueue
 * @see docs/plans/vreko_signal_communicaton.md Appendix A.2
 */

import type * as vscode from "vscode";
import { logger } from "../utils/logger";

/**
 * Notification priority levels
 * Higher number = more important
 */
export const NOTIFICATION_PRIORITY = {
	/** Closing ceremony - important session summary */
	CLOSING_CEREMONY: 50,
	/** Critical update available */
	CRITICAL_UPDATE: 60,
	/** Recovery celebration - highest value moment */
	RECOVERY: 70,
	/** Degradation warning */
	DEGRADATION: 80,
	/** AI tool first detection milestone */
	MILESTONE_AI: 30,
	/** Fragile file first detection milestone */
	MILESTONE_FRAGILE: 30,
	/** Large risky change detected - actionable, above milestones but below ceremony */
	LARGE_RISK: 40,
} as const;

export type NotificationPriorityValue = (typeof NOTIFICATION_PRIORITY)[keyof typeof NOTIFICATION_PRIORITY];

/**
 * Pending notification in queue
 */
interface PendingNotification {
	key: string;
	priority: number;
	show: () => Thenable<string | undefined>;
	resolve: (value: string | undefined) => void;
}

/**
 * Active notification tracking
 */
interface ActiveNotification {
	key: string;
	priority: number;
}

/**
 * NotificationQueue - Enforces "never stack multiple notifications"
 *
 * @example
 * ```typescript
 * const queue = new NotificationQueue();
 *
 * // Show recovery notification (high priority)
 * await queue.push('recovery-123', NOTIFICATION_PRIORITY.RECOVERY, () =>
 *   vscode.window.showInformationMessage('Restored!', 'View Diff', 'Dismiss')
 * );
 *
 * // Lower priority notification will queue behind
 * await queue.push('milestone-ai', NOTIFICATION_PRIORITY.MILESTONE_AI, () =>
 *   vscode.window.showInformationMessage('AI detected')
 * );
 * ```
 */
export class NotificationQueue implements vscode.Disposable {
	private active: ActiveNotification | null = null;
	private pending: PendingNotification[] = [];

	/**
	 * FM-2: Monotonically-incrementing generation counter.
	 * Incremented whenever a higher-priority notification interrupts the active one.
	 * Each awaited show() call captures its generation at entry; if it differs on
	 * return, the call is orphaned and must NOT call onDismissed().
	 */
	private generation = 0;

	/** FM-1: Maximum ms to wait for a VS Code notification Thenable before force-dismissing. */
	private static readonly SHOW_TIMEOUT_MS = 30_000;

	/**
	 * Push a notification to the queue
	 *
	 * @param key - Unique identifier for this notification
	 * @param priority - Priority level (higher = more important)
	 * @param show - Function that shows the notification and returns a Thenable
	 * @returns Promise that resolves with the selected action or undefined
	 */
	async push(key: string, priority: number, show: () => Thenable<string | undefined>): Promise<string | undefined> {
		// FM-1: Race every show() against a 30s timeout. If the VS Code notification
		// API stalls (deactivation, rapid window switch, extension host restart),
		// the Thenable would never resolve, permanently blocking the queue.
		const showWithTimeout = (): Thenable<string | undefined> =>
			Promise.race([
				show(),
				new Promise<undefined>((resolve) =>
					setTimeout(() => {
						logger.warn("[NotificationQueue] Notification timed out after 30s  -  force-dismissing", {
							key,
						});
						resolve(undefined);
					}, NotificationQueue.SHOW_TIMEOUT_MS),
				),
			]);

		// If nothing active, show immediately
		if (!this.active) {
			this.active = { key, priority };
			return this.runShowWithGuard(showWithTimeout);
		}

		// If higher priority than active, interrupt immediately.
		// FM-2: Increment generation so the orphaned original show() call
		// skips its onDismissed() when it eventually resolves.
		if (priority > this.active.priority) {
			logger.debug("Higher priority notification interrupting active", {
				active: this.active.key,
				new: key,
				activePriority: this.active.priority,
				newPriority: priority,
			});
			this.generation++; // invalidate the orphaned show() call
			this.active = { key, priority };
			return this.runShowWithGuard(showWithTimeout);
		}

		// Queue for later
		return new Promise((resolve) => {
			this.pending.push({
				key,
				priority,
				show: () => {
					const p = showWithTimeout();
					p.then(resolve, () => resolve(undefined));
					return p;
				},
				resolve,
			});

			// Re-sort pending by priority (highest first)
			this.pending.sort((a, b) => b.priority - a.priority);
		});
	}

	/**
	 * Run showFn under the generation guard.
	 * Calls onDismissed() after the show resolves  -  but only if this call
	 * still owns the active slot (FM-2: generation unchanged).
	 */
	private async runShowWithGuard(showFn: () => Thenable<string | undefined>): Promise<string | undefined> {
		const myGeneration = this.generation;
		try {
			const result = await showFn();
			// FM-2: Only drain if this call still owns the active slot.
			if (this.generation === myGeneration) {
				this.onDismissed();
			}
			return result;
		} catch (error) {
			if (this.generation === myGeneration) {
				this.onDismissed();
			}
			throw error;
		}
	}

	/**
	 * Check if a notification is currently active
	 */
	isActive(): boolean {
		return this.active !== null;
	}

	/**
	 * Get the currently active notification key
	 */
	getActiveKey(): string | null {
		return this.active?.key ?? null;
	}

	/**
	 * Get count of pending notifications
	 */
	getPendingCount(): number {
		return this.pending.length;
	}

	/**
	 * Clear all pending notifications
	 */
	clearPending(): void {
		// Resolve all pending with undefined (dismissed)
		for (const pending of this.pending) {
			pending.resolve(undefined);
		}
		this.pending = [];
	}

	/**
	 * Handle notification dismissal - show next in queue
	 */
	private onDismissed(): void {
		this.active = null;

		if (this.pending.length === 0) {
			return;
		}

		// Show highest priority pending
		const next = this.pending.shift();
		if (!next) {
			return;
		}

		this.active = { key: next.key, priority: next.priority };

		// Show and chain dismissal
		next.show().then(
			(result) => {
				next.resolve(result);
				this.onDismissed();
			},
			() => {
				next.resolve(undefined);
				this.onDismissed();
			},
		);
	}

	/**
	 * Dispose the queue and clear all pending
	 */
	dispose(): void {
		this.clearPending();
	}
}

/**
 * Global singleton instance
 */
let globalQueue: NotificationQueue | null = null;

/**
 * Get or create the global NotificationQueue instance
 */
export function getNotificationQueue(): NotificationQueue {
	if (!globalQueue) {
		globalQueue = new NotificationQueue();
	}
	return globalQueue;
}

/**
 * Dispose the global queue (for testing/cleanup)
 */
export function disposeNotificationQueue(): void {
	if (globalQueue) {
		globalQueue.dispose();
		globalQueue = null;
	}
}
