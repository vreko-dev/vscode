/**
 * @fileoverview Notification Acknowledgment System
 *
 * Manages persistent "Don't show again" state for notifications using VS Code's globalState.
 * This allows users to control notification frequency without losing important alerts.
 */

import type * as vscode from "vscode";

/**
 * Manages notification acknowledgment state with persistence.
 * Uses globalState to remember user preferences across sessions.
 */
export class NotificationAcknowledgment {
	private static readonly PREFIX = "snapback.notif-ack:";

	constructor(private readonly globalState: vscode.Memento) {}

	/**
	 * Check if a notification has been acknowledged (user selected "Don't show again").
	 * @param notificationId Unique identifier for the notification type
	 * @param scope Optional scope (e.g., file path) for file-specific acknowledgments
	 */
	isAcknowledged(notificationId: string, scope?: string): boolean {
		const key = this.getKey(notificationId, scope);
		return this.globalState.get<boolean>(key, false);
	}

	/**
	 * Mark a notification as acknowledged ("Don't show again").
	 * Persists to globalState so it survives across sessions.
	 */
	async acknowledge(notificationId: string, scope?: string): Promise<void> {
		const key = this.getKey(notificationId, scope);
		await this.globalState.update(key, true);
	}

	/**
	 * Reset acknowledgment for a specific notification (will show again).
	 */
	async reset(notificationId: string, scope?: string): Promise<void> {
		const key = this.getKey(notificationId, scope);
		await this.globalState.update(key, undefined);
	}

	/**
	 * Reset all acknowledgments (for debugging/settings).
	 * Clears all stored acknowledgment preferences.
	 */
	async resetAll(): Promise<void> {
		const keys = this.globalState.get<string[]>("snapback.notif-ack-keys", []);
		for (const key of keys) {
			await this.globalState.update(key, undefined);
		}
		await this.globalState.update("snapback.notif-ack-keys", []);
	}

	/**
	 * Get list of all acknowledged notifications (for debugging).
	 */
	getAcknowledgedNotifications(): string[] {
		return this.globalState.get<string[]>("snapback.notif-ack-keys", []);
	}

	private getKey(notificationId: string, scope?: string): string {
		const key = scope
			? `${NotificationAcknowledgment.PREFIX}${notificationId}:${scope}`
			: `${NotificationAcknowledgment.PREFIX}${notificationId}`;

		// Track keys for resetAll()
		void this.trackKey(key);
		return key;
	}

	private async trackKey(key: string): Promise<void> {
		const keys = this.globalState.get<string[]>("snapback.notif-ack-keys", []);
		if (!keys.includes(key)) {
			await this.globalState.update("snapback.notif-ack-keys", [...keys, key]);
		}
	}
}
