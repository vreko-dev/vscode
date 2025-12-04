/**
 * NotificationAdapter
 *
 * Transforms ProtectionDecision into user notifications:
 * - Maps decision types to notification types
 * - Assigns severity based on confidence/risk
 * - Formats decision context into user-friendly messages
 * - Manages notification state and interactions
 *
 * Flow: ProtectionDecision → NotificationAdapter → UserNotification
 */

import type { ProtectionDecision } from "./types";

export type NotificationType = "alert" | "warning" | "info" | "error";
export type NotificationSeverity = "critical" | "high" | "medium" | "low";
export type NotificationState = "pending" | "shown" | "dismissed" | "actioned";
export type ProtectionAction = "PROTECT" | "ALLOW" | "BLOCK";

export interface NotificationAction {
	label: string;
	action: string;
	primary?: boolean;
}

export interface UserNotification {
	id: string;
	type: NotificationType;
	severity: NotificationSeverity;
	title: string;
	message: string;
	details?: string;
	actions?: NotificationAction[];
	timestamp: number;
	state: NotificationState;
	duration?: number;
	persistent?: boolean;
	dismissable?: boolean;
	retryable?: boolean;
	autoDismiss?: boolean;
}

/**
 * Adapts ProtectionDecisions to user notifications
 */
export class NotificationAdapter {
	private notifications: Map<string, UserNotification> = new Map();
	private notificationCounter = 0;

	/**
	 * Convert ProtectionDecision to UserNotification
	 */
	adaptDecision(decision: ProtectionDecision): UserNotification {
		const id = this.generateId();
		const timestamp = Date.now();

		const action: ProtectionAction = decision.createSnapshot
			? "PROTECT"
			: decision.showNotification
				? "ALLOW"
				: "BLOCK";

		const notification: UserNotification = {
			id,
			type: this.actionToType(action),
			severity: this.actionToSeverity(action, decision.confidence),
			title: this.formatTitle(action),
			message: this.formatMessage(action, decision),
			timestamp,
			state: "pending",
			actions: this.getActions(action),
			autoDismiss: this.shouldAutoDismiss(action, decision.confidence),
			persistent: this.shouldPersist(action, decision.confidence),
		};

		this.notifications.set(id, notification);
		return notification;
	}

	/**
	 * Map action to NotificationType
	 */
	private actionToType(action: ProtectionAction): NotificationType {
		switch (action) {
			case "PROTECT":
				return "alert";
			case "ALLOW":
				return "info";
			case "BLOCK":
				return "error";
		}
	}

	/**
	 * Map action to severity
	 */
	private actionToSeverity(
		action: ProtectionAction,
		confidence: number,
	): NotificationSeverity {
		switch (action) {
			case "BLOCK":
				return "critical";
			case "PROTECT":
				return confidence >= 0.8 ? "high" : "medium";
			case "ALLOW":
				return "low";
		}
	}

	/**
	 * Format notification title
	 */
	private formatTitle(action: ProtectionAction): string {
		switch (action) {
			case "PROTECT":
				return "AI Activity Detected - Snapshot Created";
			case "ALLOW":
				return "Changes Allowed";
			case "BLOCK":
				return "Action Blocked";
		}
	}

	/**
	 * Format notification message
	 */
	private formatMessage(
		action: ProtectionAction,
		decision: ProtectionDecision,
	): string {
		const confidence = `${Math.round(decision.confidence * 100)}%`;

		switch (action) {
			case "PROTECT":
				return `AI usage detected (${confidence} confidence). Automatic snapshot created for recovery.`;
			case "ALLOW":
				return `Changes allowed. Confidence: ${confidence}.`;
			case "BLOCK":
				return `Suspicious pattern detected (${confidence} confidence). Action blocked for safety.`;
		}
	}

	/**
	 * Get actions for notification
	 */
	private getActions(action: ProtectionAction): NotificationAction[] {
		const actions: NotificationAction[] = [];

		if (action === "PROTECT") {
			actions.push({
				label: "View Protected Snapshot",
				action: "view_snapshot",
				primary: true,
			});
		} else if (action === "BLOCK") {
			actions.push({
				label: "Review Details",
				action: "review_decision",
				primary: true,
			});
		}

		actions.push({
			label: "Dismiss",
			action: "dismiss",
			primary: false,
		});

		return actions;
	}

	/**
	 * Determine if notification should auto-dismiss
	 */
	private shouldAutoDismiss(
		action: ProtectionAction,
		confidence: number,
	): boolean {
		return action === "ALLOW" && confidence > 0.9;
	}

	/**
	 * Determine if notification should persist
	 */
	private shouldPersist(action: ProtectionAction, confidence: number): boolean {
		return action === "BLOCK" || confidence < 0.7;
	}

	/**
	 * Mark notification as shown
	 */
	markShown(id: string): void {
		const notif = this.notifications.get(id);
		if (notif) {
			notif.state = "shown";
		}
	}

	/**
	 * Mark notification as dismissed
	 */
	markDismissed(id: string): void {
		const notif = this.notifications.get(id);
		if (notif) {
			notif.state = "dismissed";
		}
	}

	/**
	 * Mark notification as actioned
	 */
	markActioned(id: string): void {
		const notif = this.notifications.get(id);
		if (notif) {
			notif.state = "actioned";
		}
	}

	/**
	 * Get all pending notifications, sorted by severity
	 */
	getPendingNotifications(): UserNotification[] {
		const severityPriority: Record<NotificationSeverity, number> = {
			critical: 1,
			high: 2,
			medium: 3,
			low: 4,
		};

		return Array.from(this.notifications.values())
			.filter((n) => n.state === "pending")
			.sort(
				(a, b) => severityPriority[a.severity] - severityPriority[b.severity],
			);
	}

	/**
	 * Clear notification
	 */
	clearNotification(id: string): void {
		this.notifications.delete(id);
	}

	/**
	 * Clear all notifications
	 */
	clearAll(): void {
		this.notifications.clear();
	}

	/**
	 * Get notification by ID
	 */
	getNotification(id: string): UserNotification | undefined {
		return this.notifications.get(id);
	}

	/**
	 * Generate unique notification ID
	 */
	private generateId(): string {
		return `notif-${++this.notificationCounter}-${Date.now()}`;
	}
}

/**
 * Factory for creating NotificationAdapter
 */
export function createNotificationAdapter(): NotificationAdapter {
	return new NotificationAdapter();
}
