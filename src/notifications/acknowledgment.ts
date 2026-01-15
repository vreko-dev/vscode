/**
 * @fileoverview Notification Acknowledgment Persistence
 *
 * Manages persistent "Don't show again" preferences for notifications.
 * Uses VS Code's globalState for persistence across sessions.
 *
 * ENHANCEMENT: Now stores full metadata (message, timestamp) for dismissed notifications display
 */

import type * as vscode from "vscode";

/** Key prefix for storing acknowledgments in globalState */
const STORAGE_KEY = "snapback.notifications.acknowledged";

export interface AcknowledgmentRecord {
	key: string;
	message: string;
	timestamp: number;
	scope?: string;
}

/**
 * Manages notification acknowledgment state.
 * Persists user's "Don't show again" preferences in VS Code's globalState.
 */
export class NotificationAcknowledgment {
	private acknowledged: Map<string, AcknowledgmentRecord>;

	constructor(private readonly globalState: vscode.Memento) {
		// Load persisted acknowledgments
		const stored = globalState.get<AcknowledgmentRecord[]>(STORAGE_KEY, []);
		this.acknowledged = new Map(stored.map((record) => [record.key, record]));
	}

	/**
	 * Check if a notification has been acknowledged.
	 *
	 * @param notificationId - The notification type identifier
	 * @param scope - Optional scope for context-specific acknowledgments (e.g., file path)
	 * @returns true if the notification has been acknowledged
	 */
	isAcknowledged(notificationId: string, scope?: string): boolean {
		const key = this.buildKey(notificationId, scope);
		return this.acknowledged.has(key);
	}

	/**
	 * Get all acknowledged notifications (for tree view display).
	 */
	getAll(): AcknowledgmentRecord[] {
		return Array.from(this.acknowledged.values());
	}

	/**
	 * Acknowledge a notification (mark as "Don't show again").
	 *
	 * @param notificationId - The notification type identifier
	 * @param message - Human-readable message for display in tree view
	 * @param scope - Optional scope for context-specific acknowledgments
	 */
	async acknowledge(notificationId: string, message: string, scope?: string): Promise<void> {
		const key = this.buildKey(notificationId, scope);
		this.acknowledged.set(key, {
			key,
			message,
			timestamp: Date.now(),
			scope,
		});
		await this.persist();
	}

	/**
	 * Reset acknowledgment for a notification.
	 *
	 * @param notificationId - The notification type identifier
	 * @param scope - Optional scope for context-specific acknowledgments
	 */
	async reset(notificationId: string, scope?: string): Promise<void> {
		const key = this.buildKey(notificationId, scope);
		this.acknowledged.delete(key);
		await this.persist();
	}

	/**
	 * Reset all acknowledgments.
	 */
	async resetAll(): Promise<void> {
		this.acknowledged.clear();
		await this.persist();
	}

	/**
	 * Build a unique key for the notification+scope combination.
	 */
	private buildKey(notificationId: string, scope?: string): string {
		return scope ? `${notificationId}:${scope}` : notificationId;
	}

	/**
	 * Persist acknowledgments to globalState.
	 */
	private async persist(): Promise<void> {
		const records = Array.from(this.acknowledged.values());
		await this.globalState.update(STORAGE_KEY, records);
	}
}
