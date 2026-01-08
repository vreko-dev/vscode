/**
 * NotificationManager - Centralized notification service
 *
 * Prevents notification fatigue by:
 * - Priority-based queuing (critical > high > medium > low)
 * - Deduplication of similar messages
 * - Rate limiting based on priority
 * - Batching low-priority notifications
 *
 * Addresses UX feedback: "Notification overload risk - 50+ show*Message calls"
 */

import * as vscode from "vscode";
import { logger } from "../utils/logger";

export type NotificationPriority = "critical" | "high" | "medium" | "low";

export interface Notification {
	id: string;
	priority: NotificationPriority;
	message: string;
	actions?: string[];
	detail?: string;
	cooldownMs?: number;
}

export interface NotificationResult {
	action?: string;
	dismissed: boolean;
}

/**
 * NotificationManager - Singleton service for managing VS Code notifications
 */
export class NotificationManager {
	private static instance: NotificationManager | null = null;

	private queue: Notification[] = [];
	private showing = false;
	private lastShown = new Map<string, number>();
	private batchTimer: NodeJS.Timeout | null = null;

	// Configuration
	private readonly defaultCooldowns: Record<NotificationPriority, number> = {
		critical: 0, // No cooldown for critical
		high: 30000, // 30 seconds
		medium: 60000, // 1 minute
		low: 300000, // 5 minutes
	};

	private readonly batchDelay = 2000; // Batch low-priority for 2 seconds

	private constructor() {}

	/**
	 * Get the singleton instance
	 */
	static getInstance(): NotificationManager {
		if (!NotificationManager.instance) {
			NotificationManager.instance = new NotificationManager();
		}
		return NotificationManager.instance;
	}

	/**
	 * Show a notification with priority-based handling
	 */
	async show(notification: Notification): Promise<NotificationResult> {
		// Check cooldown
		if (!this.canShow(notification)) {
			logger.debug("Notification suppressed by cooldown", { id: notification.id });
			return { dismissed: true };
		}

		// Check for duplicates in queue
		if (this.isDuplicate(notification)) {
			logger.debug("Notification suppressed (duplicate in queue)", { id: notification.id });
			return { dismissed: true };
		}

		// Handle based on priority
		if (notification.priority === "critical" || notification.priority === "high") {
			// Show immediately
			return this.showImmediate(notification);
		}

		// Queue for batching
		this.queue.push(notification);
		this.scheduleBatch();
		return { dismissed: false };
	}

	/**
	 * Show error notification (critical priority)
	 */
	async error(message: string, actions?: string[], detail?: string): Promise<NotificationResult> {
		return this.show({
			id: `error-${Date.now()}`,
			priority: "critical",
			message,
			actions,
			detail,
		});
	}

	/**
	 * Show warning notification (high priority)
	 */
	async warn(message: string, actions?: string[], detail?: string): Promise<NotificationResult> {
		return this.show({
			id: `warn-${Date.now()}`,
			priority: "high",
			message,
			actions,
			detail,
		});
	}

	/**
	 * Show info notification (medium priority)
	 */
	async info(message: string, actions?: string[], detail?: string): Promise<NotificationResult> {
		return this.show({
			id: `info-${Date.now()}`,
			priority: "medium",
			message,
			actions,
			detail,
		});
	}

	/**
	 * Show low-priority notification (batched)
	 */
	async debug(message: string, actions?: string[], detail?: string): Promise<NotificationResult> {
		return this.show({
			id: `debug-${Date.now()}`,
			priority: "low",
			message,
			actions,
			detail,
		});
	}

	/**
	 * Check if notification can be shown based on cooldown
	 */
	private canShow(notification: Notification): boolean {
		const lastTime = this.lastShown.get(notification.id) || 0;
		const cooldown = notification.cooldownMs ?? this.defaultCooldowns[notification.priority];
		const elapsed = Date.now() - lastTime;

		return elapsed >= cooldown;
	}

	/**
	 * Check if notification is duplicate of queued item
	 */
	private isDuplicate(notification: Notification): boolean {
		return this.queue.some(
			(n) =>
				n.id === notification.id ||
				(n.message === notification.message && n.priority === notification.priority),
		);
	}

	/**
	 * Show notification immediately
	 */
	private async showImmediate(notification: Notification): Promise<NotificationResult> {
		this.showing = true;
		this.lastShown.set(notification.id, Date.now());

		try {
			let choice: string | undefined;

			if (notification.priority === "critical") {
				choice = await vscode.window.showErrorMessage(
					notification.message,
					{ detail: notification.detail, modal: false },
					...(notification.actions || []),
				);
			} else if (notification.priority === "high") {
				choice = await vscode.window.showWarningMessage(
					notification.message,
					{ detail: notification.detail },
					...(notification.actions || []),
				);
			} else {
				choice = await vscode.window.showInformationMessage(
					notification.message,
					{ detail: notification.detail },
					...(notification.actions || []),
				);
			}

			return {
				action: choice,
				dismissed: choice === undefined,
			};
		} finally {
			this.showing = false;
			this.processQueue();
		}
	}

	/**
	 * Schedule batch processing of low-priority notifications
	 */
	private scheduleBatch(): void {
		if (this.batchTimer) {
			return; // Already scheduled
		}

		this.batchTimer = setTimeout(() => {
			this.processBatch();
		}, this.batchDelay);
	}

	/**
	 * Process batched notifications
	 */
	private processBatch(): void {
		this.batchTimer = null;

		if (this.queue.length === 0) {
			return;
		}

		// Sort by priority (critical > high > medium > low)
		this.queue.sort((a, b) => {
			const priorityOrder: Record<NotificationPriority, number> = {
				critical: 0,
				high: 1,
				medium: 2,
				low: 3,
			};
			return priorityOrder[a.priority] - priorityOrder[b.priority];
		});

		this.processQueue();
	}

	/**
	 * Process the notification queue
	 */
	private async processQueue(): Promise<void> {
		if (this.showing || this.queue.length === 0) {
			return;
		}

		const notification = this.queue.shift();
		if (!notification) {
			return;
		}

		// Check cooldown again (might have changed while in queue)
		if (!this.canShow(notification)) {
			this.processQueue(); // Try next
			return;
		}

		await this.showImmediate(notification);
	}

	/**
	 * Clear all queued notifications
	 */
	clearQueue(): void {
		this.queue = [];
		if (this.batchTimer) {
			clearTimeout(this.batchTimer);
			this.batchTimer = null;
		}
	}

	/**
	 * Get queue status for diagnostics
	 */
	getStatus(): {
		queueLength: number;
		showing: boolean;
		lastShownCount: number;
	} {
		return {
			queueLength: this.queue.length,
			showing: this.showing,
			lastShownCount: this.lastShown.size,
		};
	}

	/**
	 * Reset cooldowns (for testing)
	 */
	resetCooldowns(): void {
		this.lastShown.clear();
	}
}

/**
 * Get the global NotificationManager instance
 */
export function getNotificationManager(): NotificationManager {
	return NotificationManager.getInstance();
}
