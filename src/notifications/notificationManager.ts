import * as vscode from "vscode";
import type { CooldownCache } from "../storage/CooldownCache";
import type { AuditLog } from "../storage/AuditLog";
import { logger } from "@snapback/infrastructure";

/**
 * Notification configuration
 */
export interface NotificationConfig {
	id: string;
	type: "info" | "warning" | "error";
	title: string;
	message: string;
	actions?: Array<{ label: string; action: () => void }>;
	durationMs?: number;
}

/**
 * Context for notification (for audit logging)
 */
export interface NotificationContext {
	filePath?: string;
	riskScore?: number;
	threats?: string[];
	timestamp: number;
}

/**
 * NotificationManager handles user-facing alerts with throttling and audit logging.
 * Uses CooldownCache for ephemeral throttling (30s per notification type).
 * Uses AuditLog to persist events for Phase 23 (Analytics).
 */
export class NotificationManager {
	private auditLog: AuditLog;
	private shownNotifications = new Map<string, number>(); // Track shown times locally

	constructor(cooldownCache: CooldownCache, auditLog: AuditLog) {
		this.cooldownCache = cooldownCache;
		this.auditLog = auditLog;
	}

	/**
	 * Show notification to user with optional throttling and audit logging
	 */
	async show(
		config: NotificationConfig,
		context?: NotificationContext,
	): Promise<string | undefined> {
		// Check if we've shown this notification recently (30 second cooldown)
		const lastShown = this.shownNotifications.get(config.id) ?? 0;
		const now = Date.now();
		const timeSinceLastShown = now - lastShown;

		if (timeSinceLastShown < 30000) {
			logger.debug("Notification throttled", {
				notificationId: config.id,
				title: config.title,
				timeSinceLastShown,
			});
			return undefined;
		}

		// Mark as shown
		this.shownNotifications.set(config.id, now);

		// Log event to audit trail for Phase 23 (Analytics)
		await this.auditLog.append({
			action: "notification.shown" as any,
			filePath: context?.filePath ?? "<no-file>",
			protectionLevel: "notification",
			details: {
				notificationId: config.id,
				type: config.type,
				title: config.title,
				message: config.message,
				riskScore: context?.riskScore,
				threats: context?.threats,
			},
		});


		// Show to user
		const result = await this.showVsCodeMessage(config);

		// Execute action callback if user selected one
		if (result !== undefined && config.actions) {
			const action = config.actions[result];
			if (action) {
				try {
					action.action();
				} catch (error) {
					logger.error("Notification action failed", {
						notificationId: config.id,
						actionIndex: result,
						error: error instanceof Error ? error.message : String(error),
					});
				}
			}
		}

		return config.id;
	}

	/**
	 * Internal: show VS Code notification using vscode.window API
	 */
	private async showVsCodeMessage(config: NotificationConfig): Promise<number | undefined> {
		const actionLabels = config.actions?.map(a => a.label) ?? [];

		let result: string | undefined;

		if (config.type === "error") {
			result = await vscode.window.showErrorMessage(
				config.message,
				...actionLabels,
			);
		} else if (config.type === "warning") {
			result = await vscode.window.showWarningMessage(
				config.message,
				...actionLabels,
			);
		} else {
			result = await vscode.window.showInformationMessage(
				config.message,
				...actionLabels,
			);
		}

		// Map button label back to action index
		if (result && actionLabels.length > 0) {
			return actionLabels.indexOf(result);
		}

		return undefined;
	}
}

/**
 * Notification factory for common SnapBack alerts
 */
export class NotificationFactory {
	/**
	 * Threat detected notification (error level)
	 */
	static threatDetected(filePath: string, riskScore: number): NotificationConfig {
		return {
			id: `threat:${filePath}:${Date.now()}`,
			type: "error",
			title: "🚨 Threat Detected",
			message: `High-risk change detected in ${filePath} (Risk: ${riskScore}%)`,
			actions: [
				{
					label: "Review Risk",
					action: () => {
						// Handled by caller
					},
				},
				{
					label: "Dismiss",
					action: () => {
						// No-op
					},
				},
			],
		};
	}

	/**
	 * Risk threshold breached notification (warning level)
	 */
	static thresholdBreached(riskScore: number, threshold: number): NotificationConfig {
		return {
			id: `threshold:${Date.now()}`,
			type: "warning",
			title: "⚠️  Risk Threshold Breached",
			message: `Risk score (${riskScore}%) exceeds threshold (${threshold}%)`,
			actions: [
				{
					label: "View Settings",
					action: () => {
						// Caller handles settings navigation
					},
				},
			],
		};
	}

	/**
	 * Burst detection notification (warning level)
	 */
	static burstDetected(saveCount: number, windowMs: number): NotificationConfig {
		return {
			id: `burst:${Date.now()}`,
			type: "warning",
			title: "⚡ Burst Detected",
			message: `${saveCount} saves in ${windowMs}ms - enabling enhanced protection`,
		};
	}

	/**
	 * Recovery success notification (info level)
	 */
	static recoverySuccess(snapshotId: string): NotificationConfig {
		return {
			id: `recovery:${snapshotId}`,
			type: "info",
			title: "✅ Recovery Complete",
			message: `Snapshot restored successfully (${snapshotId})`,
		};
	}

	/**
	 * Snapshot created notification (info level)
	 */
	static snapshotCreated(fileCount: number): NotificationConfig {
		return {
			id: `snapshot:${Date.now()}`,
			type: "info",
			title: "📸 Snapshot Created",
			message: `Automatic snapshot: ${fileCount} files protected`,
			durationMs: 3000, // Auto-dismiss after 3 seconds
		};
	}

	/**
	 * Protection enabled notification (info level)
	 */
	static protectionEnabled(level: "watch" | "warn" | "block"): NotificationConfig {
		const levelDescriptions = {
			watch: "Monitoring changes",
			warn: "Showing warnings",
			block: "Requiring confirmation",
		};

		return {
			id: `protection:${level}:${Date.now()}`,
			type: "info",
			title: "🛡️  Protection Enabled",
			message: `File protection: ${levelDescriptions[level]}`,
			durationMs: 2000, // Auto-dismiss after 2 seconds
		};
	}

	/**
	 * Critical file notification (error level)
	 */
	static criticalFileModified(filePath: string): NotificationConfig {
		return {
			id: `critical:${filePath}:${Date.now()}`,
			type: "error",
			title: "🔒 Critical File Modified",
			message: `Important file changed: ${filePath}`,
			actions: [
				{
					label: "Review",
					action: () => {
						// Caller handles review
					},
				},
			],
		};
	}

	/**
	 * Permission denied notification (warning level)
	 */
	static permissionDenied(filePath: string): NotificationConfig {
		return {
			id: `permission:${filePath}:${Date.now()}`,
			type: "warning",
			title: "🚫 Permission Denied",
			message: `Cannot modify protected file: ${filePath}`,
			actions: [
				{
					label: "Adjust Protection",
					action: () => {
						// Caller handles settings
					},
				},
			],
		};
	}
}

/**
 * Notification service for integration with AutoDecisionIntegration
 * Subscribes to engine decisions and dispatches notifications
 */
export class NotificationService {
	private notificationManager: NotificationManager;

	constructor(cooldownCache: CooldownCache, auditLog: AuditLog) {
		this.notificationManager = new NotificationManager(cooldownCache, auditLog);
	}

	/**
	 * Handle decision from AutoDecisionEngine
	 */
	async handleDecision(decision: {
		riskScore: number;
		threats: string[];
		filePath?: string;
		action: "snapshot" | "notify" | "restore" | "none";
		reason?: string;
	} & Record<string, any>): Promise<void> {
		// Dispatch appropriate notification based on decision
		if (decision.action === "notify" && decision.threats.length > 0) {
			const isBurst = decision.threats.includes("burst-detection");
			const isCritical = decision.threats.includes("critical-file");

			if (isCritical && decision.filePath) {
				const notification = NotificationFactory.criticalFileModified(
					decision.filePath,
				);
				await this.notificationManager.show(notification, {
					filePath: decision.filePath,
					riskScore: decision.riskScore,
					threats: decision.threats,
					timestamp: Date.now(),
				});
			} else if (isBurst) {
				const notification = NotificationFactory.burstDetected(3, 500);
				await this.notificationManager.show(notification, {
					riskScore: decision.riskScore,
					threats: decision.threats,
					timestamp: Date.now(),
				});
			} else {
				const notification = NotificationFactory.threatDetected(
					decision.filePath ?? "current file",
					decision.riskScore,
				);
				await this.notificationManager.show(notification, {
					filePath: decision.filePath,
					riskScore: decision.riskScore,
					threats: decision.threats,
					timestamp: Date.now(),
				});
			}
		}

		if (decision.action === "snapshot") {
			const notification = NotificationFactory.snapshotCreated(1);
			await this.notificationManager.show(notification);
		}

		if (decision.action === "restore") {
			const notification = NotificationFactory.recoverySuccess("recent");
			await this.notificationManager.show(notification);
		}
	}

	/**
	 * Show threshold breach notification
	 */
	async notifyThresholdBreach(riskScore: number, threshold: number): Promise<void> {
		const notification = NotificationFactory.thresholdBreached(riskScore, threshold);
		await this.notificationManager.show(notification, {
			riskScore,
			timestamp: Date.now(),
		});
	}

	/**
	 * Show protection enabled notification
	 */
	async notifyProtectionEnabled(
		level: "watch" | "warn" | "block",
	): Promise<void> {
		const notification = NotificationFactory.protectionEnabled(level);
		await this.notificationManager.show(notification);
	}

	/**
	 * Show permission denied notification
	 */
	async notifyPermissionDenied(filePath: string): Promise<void> {
		const notification = NotificationFactory.permissionDenied(filePath);
		await this.notificationManager.show(notification, {
			filePath,
			timestamp: Date.now(),
		});
	}
}
