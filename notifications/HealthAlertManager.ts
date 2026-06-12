/**
 * HealthAlertManager - Proactive toast alerts for MCP health state changes
 *
 * Notification Rules:
 * - healthy → degraded: None (status bar only)
 * - * → unhealthy: Warning toast with Retry/View Status actions
 * - unhealthy → healthy: Info toast (recovery notification)
 * - unknown → healthy: None
 *
 * Features:
 * - Debounces rapid state changes (5s window)
 * - Respects user setting: vreko.mcp.healthGuardian.proactiveAlerts
 * - Non-modal toasts only (never blocks workflow)
 *
 * @module notifications/HealthAlertManager
 */

import * as vscode from "vscode";
import { logger } from "../utils/logger";

/**
 * Health change event shape for MCP health state transitions
 */
export interface HealthChangeEvent {
	previousState?: string;
	currentState?: string;
	from?: string;
	to?: string;
	reason?: string;
	timestamp: number;
}

/**
 * Recovery event from unhealthy → healthy
 */
export interface RecoveryEvent {
	from: "unhealthy";
	to: "healthy";
	downDurationMs: number;
	timestamp: number;
}

/**
 * Health Alert Manager
 * Shows proactive toast notifications for MCP health state changes
 */
export class HealthAlertManager implements vscode.Disposable {
	private readonly disposables: vscode.Disposable[] = [];
	private lastNotificationTime = 0;
	private readonly DEBOUNCE_MS = 5000;
	private unhealthySince: number | null = null;
	private isDisposed = false;
	private pendingAlert: NodeJS.Timeout | null = null;

	/**
	 * Handle health state changes
	 * @param event - The health change event
	 */
	handleHealthChange(event: HealthChangeEvent): void {
		// Don't process if disposed
		if (this.isDisposed) {
			return;
		}

		// Support both old (from/to) and new (previousState/currentState) event formats
		const eventRecord = event as unknown as Record<string, unknown>;
		const previousState = eventRecord.previousState || eventRecord.from;
		const currentState = eventRecord.currentState || eventRecord.to;

		// Respect user setting
		if (!this.isEnabled()) {
			logger.debug("Proactive alerts disabled, skipping notification", {
				previousState,
				currentState,
			});
			return;
		}

		logger.debug("Processing health change", {
			previousState,
			currentState,
			reason: event.reason,
		});

		// Transition to unhealthy
		if (currentState === "unhealthy" && previousState !== "unhealthy") {
			this.handleUnhealthyTransition(event);
		}
		// Transition to healthy from unhealthy (recovery)
		else if (currentState === "healthy" && previousState === "unhealthy") {
			this.handleRecoveryTransition(event);
		}
		// Transition to degraded or healthy (no notification)
		else if (currentState === "degraded" || currentState === "healthy") {
			logger.debug("No notification for degraded or healthy state");
		}
	}

	/**
	 * Handle transition to unhealthy state
	 * Debounces notification to avoid rapid state changes (5s window)
	 * Per spec: only show notification if still unhealthy after 5s
	 */
	private handleUnhealthyTransition(event: HealthChangeEvent): void {
		// Track when we became unhealthy
		if (!this.unhealthySince) {
			this.unhealthySince = event.timestamp;
		}

		// Cancel any existing pending alert
		if (this.pendingAlert) {
			clearTimeout(this.pendingAlert);
		}

		logger.debug("Scheduling unhealthy notification (5s delay)", {
			reason: event.reason,
		});

		// Schedule notification after debounce window
		// This allows time for quick recovery without showing alert
		this.pendingAlert = setTimeout(() => {
			// Only show if we're still unhealthy (not disposed)
			if (!this.isDisposed) {
				void this.showUnhealthyNotification(event);
			}
			this.pendingAlert = null;
		}, this.DEBOUNCE_MS);
	}

	/**
	 * Handle transition from unhealthy to healthy (recovery)
	 * Cancels pending unhealthy alert if recovered within debounce window
	 */
	private handleRecoveryTransition(event: HealthChangeEvent): void {
		// Calculate downtime
		const downDurationMs = this.unhealthySince ? event.timestamp - this.unhealthySince : 0;

		// If we have a pending alert and recovered quickly, cancel it
		if (this.pendingAlert) {
			logger.debug("Canceling pending unhealthy alert (recovered within 5s)", {
				downDurationMs,
			});
			clearTimeout(this.pendingAlert);
			this.pendingAlert = null;

			// Show quick recovery toast instead
			const recoverySeconds = Math.round(downDurationMs / 1000);
			void vscode.window.showInformationMessage(`Vreko MCP recovered quickly (${recoverySeconds}s)`);
		} else {
			// Show standard recovery notification
			const recoveryEvent: RecoveryEvent = {
				from: "unhealthy",
				to: "healthy",
				downDurationMs,
				timestamp: event.timestamp,
			};

			this.showRecoveryNotification(recoveryEvent);
		}

		// Reset tracking
		this.unhealthySince = null;
	}

	/**
	 * Check if notification should be debounced
	 * Returns true if less than 5s since last notification
	 */
	private shouldDebounce(): boolean {
		const timeSinceLastNotification = Date.now() - this.lastNotificationTime;
		return timeSinceLastNotification < this.DEBOUNCE_MS;
	}

	/**
	 * Show warning notification for unhealthy state
	 */
	private async showUnhealthyNotification(event: HealthChangeEvent): Promise<void> {
		// Check debounce before showing notification
		if (this.shouldDebounce()) {
			logger.debug("Skipping notification due to debounce", {
				timeSinceLastMs: Date.now() - this.lastNotificationTime,
			});
			return;
		}

		// Check proactive alerts setting
		if (!this.isEnabled()) {
			logger.debug("Proactive alerts disabled, skipping notification");
			return;
		}

		const message = `Vreko MCP is unhealthy${event.reason ? `: ${event.reason}` : ""}`;

		logger.info("Showing unhealthy notification", {
			message,
			reason: event.reason,
		});

		// Update last notification time
		this.lastNotificationTime = Date.now();

		const result = await vscode.window.showWarningMessage(message, "Retry", "View Status");

		if (result === "Retry") {
			logger.debug("User requested MCP diagnose");
			await vscode.commands.executeCommand("vreko.mcp.diagnose");
		} else if (result === "View Status") {
			logger.debug("User requested MCP status");
			await vscode.commands.executeCommand("vreko.mcp.status");
		}
	}

	/**
	 * Show info notification for recovery
	 */
	private async showRecoveryNotification(event: RecoveryEvent): Promise<void> {
		// Check debounce before showing notification
		if (this.shouldDebounce()) {
			logger.debug("Skipping recovery notification due to debounce", {
				timeSinceLastMs: Date.now() - this.lastNotificationTime,
			});
			return;
		}

		// Check proactive alerts setting
		if (!this.isEnabled()) {
			logger.debug("Proactive alerts disabled, skipping recovery notification");
			return;
		}

		const downSeconds = Math.round(event.downDurationMs / 1000);
		const message = `Vreko MCP recovered after ${downSeconds}s`;

		logger.info("Showing recovery notification", {
			message,
			downDurationMs: event.downDurationMs,
		});

		// Update last notification time
		this.lastNotificationTime = Date.now();

		await vscode.window.showInformationMessage(message);
	}

	/**
	 * Check if proactive alerts are enabled in user settings
	 */
	private isEnabled(): boolean {
		const config = vscode.workspace.getConfiguration("vreko");
		return config.get<boolean>("mcp.healthGuardian.proactiveAlerts", true);
	}

	/**
	 * Dispose resources
	 */
	dispose(): void {
		this.isDisposed = true;

		// Cancel any pending alert before disposing
		if (this.pendingAlert) {
			clearTimeout(this.pendingAlert);
			this.pendingAlert = null;
		}

		// Dispose subscriptions
		for (const disposable of this.disposables) {
			disposable.dispose();
		}
		this.disposables.length = 0;

		logger.debug("HealthAlertManager disposed");
	}
}
