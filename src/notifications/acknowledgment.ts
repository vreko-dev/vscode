/**
 * @fileoverview Notification Acknowledgment Persistence
 *
 * Manages persistent "Don't show again" preferences for notifications.
 * Uses VS Code's globalState for persistence across sessions.
 */

import type * as vscode from "vscode";

/** Key prefix for storing acknowledgments in globalState */
const STORAGE_KEY = "snapback.notifications.acknowledged";

/**
 * Manages notification acknowledgment state.
 * Persists user's "Don't show again" preferences in VS Code's globalState.
 */
export class NotificationAcknowledgment {
	private acknowledged: Set<string>;

	constructor(private readonly globalState: vscode.Memento) {
		// Load persisted acknowledgments
		const stored = globalState.get<string[]>(STORAGE_KEY, []);
		this.acknowledged = new Set(stored);
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
	 * Acknowledge a notification (mark as "Don't show again").
	 *
	 * @param notificationId - The notification type identifier
	 * @param scope - Optional scope for context-specific acknowledgments
	 */
	async acknowledge(notificationId: string, scope?: string): Promise<void> {
		const key = this.buildKey(notificationId, scope);
		this.acknowledged.add(key);
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
		await this.globalState.update(STORAGE_KEY, Array.from(this.acknowledged));
	}
}
