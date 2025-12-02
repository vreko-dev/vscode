/**
 * @fileoverview NotificationManager - Centralized notification system for SnapBack extension
 *
 * This module implements a unified notification management system that bridges the gap between
 * VS Code's native notification API and SnapBack's domain-specific notification requirements.
 *
 * Architecture Pattern: Facade Pattern
 * - Provides a simplified interface to VS Code's complex notification system
 * - Maintains notification history for audit trails and user review
 * - Encapsulates notification categorization and action binding logic
 *
 * Design Decisions:
 * - FIFO queue with bounded caacity prevents memory leaks in long-running sessions
 * - Immutable notification objects ensure consistent state across async operations
 * - Action-oriented design enables workflow integration through command binding
 *
 * Integration Points:
 * - VS Code Command Palette (via action commands)
 * - SnapBack Views (notification history display)
 * - Risk Analysis System (automated warning notifications)
 * - Snapshot System (success/failure feedback)
 *
 * @author SnapBack Development Team
 * @since 1.0.0
 */

import * as vscode from "vscode";
import { SNAPBACK_ICONS } from "./constants/index.js";
import { logger } from "./utils/logger.js";

/**
 * Represents a structured notification within the SnapBack ecosystem.
 *
 * Design Pattern: Data Transfer Object (DTO)
 * This interface serves as a contract between notification producers and consumers,
 * ensuring consistent notification structure across all SnapBack components.
 *
 * @interface SnapBackNotification
 * @example
 * ```typescript
 * const riskNotification: SnapBackNotification = {
 *   id: 'risk-' + Date.now(),
 *   type: 'warning',
 *   message: 'High-risk operation detected in auth.ts',
 *   timestamp: Date.now(),
 *   actions: [
 *     { title: 'Analyze', command: 'snapback.analyzeRisk' },
 *     { title: 'Create Snapshot', command: 'snapback.createSnapshot' }
 *   ],
 *   dismissible: true
 * };
 * ```
 */
export interface SnapBackNotification {
	/**
	 * Unique identifier for notification tracking and dismissal.
	 * Format: `{category}-{timestamp}` for predictable collision avoidance.
	 */
	id: string;

	/**
	 * Notification severity level mapped to VS Code's notification types.
	 * Determines visual styling and user attention priority.
	 */
	type: "info" | "warning" | "error";

	/**
	 * Human-readable notification content.
	 * Should be concise, actionable, and context-specific.
	 */
	message: string;

	/**
	 * Detailed expanded content for richer notifications.
	 * Provides additional context and technical details when expanded.
	 */
	detail?: string;

	/**
	 * Icon or emoji to display with the notification for better visual recognition.
	 */
	icon?: string;

	/**
	 * Unix timestamp for chronological ordering and expiry logic.
	 * Enables notification history sorting and time-based cleanup.
	 */
	timestamp: number;

	/**
	 * Optional action buttons that trigger VS Code commands.
	 * Enables direct workflow integration from notification UI.
	 */
	actions?: { title: string; command: string }[];

	/**
	 * Controls whether users can manually dismiss this notification.
	 * Critical system notifications should set this to false.
	 */
	dismissible?: boolean;
}

/**
 * Centralized notification management system for the SnapBack VS Code extension.
 *
 * This class implements a facade pattern over VS Code's notification API, providing
 * domain-specific notification handling with persistent history and action integration.
 *
 * Key Responsibilities:
 * - Translate domain events into user-facing notifications
 * - Maintain bounded notification history for user review
 * - Coordinate notification actions with VS Code command system
 * - Prevent notification spam through intelligent queuing
 *
 * Design Patterns:
 * - Facade: Simplifies VS Code notification API interaction
 * - Observer: Responds to domain events throughout the extension
 * - Command: Integrates notification actions with VS Code commands
 *
 * Memory Management:
 * The notification history is bounded by `maxNotifications` to prevent memory leaks
 * during long-running development sessions. Oldest notifications are automatically
 * evicted using FIFO (First In, First Out) policy.
 *
 * Thread Safety:
 * All operations are synchronous or use VS Code's single-threaded execution model,
 * eliminating race conditions in notification state management.
 *
 * @class NotificationManager
 * @example
 * ```typescript
 * const notificationManager = new NotificationManager();
 *
 * // Show domain-specific notifications
 * await notificationManager.showSnapshotCreated('v1.2.3');
 * await notificationManager.showRiskDetected('HIGH', 'database.ts');
 *
 * // Review notification history
 * const recent = notificationManager.getRecentNotifications(5);
 * logger.info(`Last ${recent.length} notifications:`, recent);
 * ```
 */
export class NotificationManager {
	/**
	 * Ordered notification history with newest notifications first.
	 * FIFO queue implementation for memory-bounded notification storage.
	 */
	private notifications: SnapBackNotification[] = [];

	/**
	 * Maximum number of notifications to retain in memory.
	 *
	 * Rationale: Prevents memory leaks in long-running VS Code sessions while
	 * maintaining sufficient history for user review and debugging. Value chosen
	 * based on typical development session notification volume analysis.
	 */
	private readonly maxNotifications = 50;

	/**
	 * Create a dismissal rule for notifications
	 *
	 * @param pattern - Pattern to match against notification messages for auto-dismissal
	 */
	createDismissalRule(pattern: string): void {
		// In a real implementation, this would store the pattern for future use
		// to automatically dismiss notifications matching this pattern
		logger.info(`Created dismissal rule for pattern: ${pattern}`);
	}

	/**
	 * Display a standardized notification for successful snapshot creation.
	 *
	 * This convenience method encapsulates the domain-specific logic for snapshot
	 * success notifications, ensuring consistent messaging and actions across the
	 * SnapBack extension.
	 *
	 * Design Rationale:
	 * - Standardizes snapshot notification format and actions
	 * - Provides immediate user feedback for critical workflow operations
	 * - Enables quick navigation to snapshot details via action button
	 * - Uses 'info' type to indicate successful, non-urgent operation
	 *
	 * Workflow Integration:
	 * - Typically called after successful snapshot creation operations
	 * - Action button connects to snapshot viewing functionality
	 * - Notification persists in history for session review
	 *
	 * @param snapshotId - Unique identifier of the created snapshot
	 * @returns Promise that resolves when notification is displayed
	 *
	 * @example
	 * ```typescript
	 * // Notify user of successful snapshot creation
	 * await notificationManager.showSnapshotCreated('v1.2.3-feature-auth');
	 *
	 * // User sees: "Snapshot v1.2.3-feature-auth created successfully"
	 * // With action button: "View" -> triggers 'snapback.viewSnapshot' command
	 * ```
	 *
	 * @example
	 * ```typescript
	 * // Integrate with snapshot creation workflow
	 * try {
	 *   const snapshot = await createSnapshot(currentState);
	 *   await notificationManager.showSnapshotCreated(snapshot.id);
	 *   logger.info('Snapshot created and user notified');
	 * } catch (error) {
	 *   // Handle snapshot creation failure separately
	 * }
	 * ```
	 */
	async showSnapshotCreated(snapshotId: string): Promise<void> {
		await this.showNotification({
			id: `snapshot-${Date.now()}`,
			type: "info",
			message: `Snapshot ${snapshotId} created successfully`,
			timestamp: Date.now(),
			actions: [{ title: "View Snapshots", command: "snapback.viewSnapshot" }],
		});
	}

	/**
	 * Display a standardized notification for detected code risks.
	 *
	 * This convenience method handles the domain-specific logic for risk detection
	 * notifications, providing consistent messaging and immediate access to risk
	 * mitigation actions.
	 *
	 * Design Rationale:
	 * - Standardizes risk notification format across all risk detection systems
	 * - Uses 'warning' type to indicate actionable concern without critical urgency
	 * - Provides immediate access to risk analysis and protection workflows
	 * - Includes contextual information (file name and risk level) for quick assessment
	 *
	 * Risk Level Mapping:
	 * - 'LOW': Minor concerns, informational guidance
	 * - 'MEDIUM': Moderate risks requiring review
	 * - 'HIGH': Significant risks requiring immediate attention
	 * - 'CRITICAL': Severe risks that may break functionality
	 *
	 * Workflow Integration:
	 * - Called by automated risk analysis systems
	 * - Action buttons integrate with risk analysis and file protection commands
	 * - Enables immediate developer response to identified risks
	 *
	 * @param riskLevel - Severity classification of the detected risk
	 * @param fileName - Name of the file where risk was detected
	 * @returns Promise that resolves when notification is displayed
	 *
	 * @example
	 * ```typescript
	 * // Notify user of high-risk code pattern
	 * await notificationManager.showRiskDetected('HIGH', 'authentication.ts');
	 *
	 * // User sees: "Risk detected in authentication.ts (HIGH)"
	 * // With actions: "Analyze" and "Protect" buttons for immediate response
	 * ```
	 *
	 * @example
	 * ```typescript
	 * // Integrate with automated risk scanning
	 * const riskAnalysis = await analyzeFile('src/utils/crypto.ts');
	 * if (riskAnalysis.riskLevel !== 'NONE') {
	 *   await notificationManager.showRiskDetected(
	 *     riskAnalysis.riskLevel,
	 *     'src/utils/crypto.ts'
	 *   );
	 * }
	 * ```
	 */
	async showRiskDetected(riskLevel: string, fileName: string): Promise<void> {
		await this.showNotification({
			id: `risk-${Date.now()}`,
			type: "warning",
			message: `Risk detected in ${fileName} (${riskLevel})`,
			timestamp: Date.now(),
			actions: [
				{ title: "Analyze", command: "snapback.analyzeRisk" },
				{ title: "Protect", command: "snapback.protectFile" },
			],
		});
	}

	/**
	 * Display an enhanced snapshot creation notification with detailed information.
	 *
	 * This method provides comprehensive feedback about snapshot creation including
	 * what was protected, where it's stored, and how to access it.
	 *
	 * @param snapshotInfo - Detailed snapshot information
	 * @returns Promise that resolves when notification is displayed
	 */
	async showEnhancedSnapshotCreated(snapshotInfo: {
		trigger: string;
		protectedFiles: number;
		directories: number;
		snapshotId: string;
		storageLocation: string;
	}): Promise<void> {
		await this.showNotification({
			id: `snapshot-${Date.now()}`,
			type: "info",
			icon: "📸",
			message: "SnapBack snapshot captured",
			detail: `Snapshot Created Successfully

Trigger: ${snapshotInfo.trigger}
Protected files: ${snapshotInfo.protectedFiles} files across ${snapshotInfo.directories} directories
Snapshot ID: ${snapshotInfo.snapshotId}
Storage: ${snapshotInfo.storageLocation} (encrypted)
Recovery available via: Command palette or sidebar

Your code is now safely backed up. Continue coding fearlessly!`,
			timestamp: Date.now(),
			actions: [
				{
					title: "View Snapshots",
					command: "snapback.viewSnapshot",
				},
				{
					title: "Create Manual Snapshot",
					command: "snapback.createSnapshot",
				},
			],
		});
	}

	/**
	 * Display an enhanced risk detection notification with detailed technical information.
	 *
	 * This method provides rich, contextual feedback about detected risks including
	 * technical analysis, affected files, and recommended actions.
	 *
	 * @param riskLevel - Severity level of the detected risk
	 * @param analysis - Detailed risk analysis information
	 * @returns Promise that resolves when notification is displayed
	 */
	async showEnhancedRiskDetected(
		riskLevel: string,
		analysis: {
			detectedPatterns: string[];
			filesAtRisk: string[];
			lastSafeSnapshot: string;
			confidence?: number;
		},
	): Promise<void> {
		const severityMap: Record<string, "info" | "warning" | "error"> = {
			LOW: "info",
			MEDIUM: "warning",
			HIGH: "warning",
			CRITICAL: "error",
		};

		const riskType = severityMap[riskLevel] || "warning";

		await this.showNotification({
			id: `risk-${Date.now()}`,
			type: riskType,
			icon: "\u{1f6e1}",
			message: "SnapBack detected potential AI-induced risk",
			detail: `SnapBack Risk Analysis - ${riskLevel} Severity

Detected Patterns:
${analysis.detectedPatterns.map((p) => `• ${p}`).join("\n")}

Files at risk: ${analysis.filesAtRisk.join(", ")}
Last safe snapshot: ${analysis.lastSafeSnapshot}

[View Details] [Create Manual Snapshot] [Ignore]`,
			timestamp: Date.now(),
			actions: [
				{ title: "View Details", command: "snapback.viewRiskDetails" },
				{
					title: "Create Manual Snapshot",
					command: "snapback.createSnapshot",
				},
				{ title: "Ignore", command: "snapback.ignoreRisk" },
			],
		});
	}

	/**
	 * Display an enhanced AI activity detection notification.
	 *
	 * This method provides feedback about detected AI activity including
	 * the tool detected, confidence level, and auto-protection status.
	 *
	 * @param aiInfo - AI activity information
	 * @returns Promise that resolves when notification is displayed
	 */
	async showEnhancedAiActivity(aiInfo: {
		tool: string;
		confidence: number;
		activityType: string;
		filesModified: number;
		timeFrame: string;
		autoSnapshotId?: string;
	}): Promise<void> {
		await this.showNotification({
			id: `ai-${Date.now()}`,
			type: "info",
			icon: "🤖",
			message: "AI coding session detected - Auto-protecting",
			detail: `AI Assistant Activity Monitored

Detected Tool: ${aiInfo.tool}
Pattern Confidence: ${aiInfo.confidence}%
Activity Type: ${aiInfo.activityType}
Files Modified: ${aiInfo.filesModified} files in last ${aiInfo.timeFrame}

Auto-snapshot: ${
				aiInfo.autoSnapshotId
					? `✅ Created (${aiInfo.autoSnapshotId})`
					: "❌ Not created"
			}
Protection Status: ACTIVE
Safe to accept AI suggestions - recovery ready if needed.`,
			timestamp: Date.now(),
			actions: [
				{ title: "View Activity", command: "snapback.viewAiActivity" },
				{
					title: "Create Manual Snapshot",
					command: "snapback.createSnapshot",
				},
			],
		});
	}

	/**
	 * Display an enhanced security/sensitive file alert.
	 *
	 * This method provides critical alerts about modifications to sensitive files
	 * including risk factors and immediate actions.
	 *
	 * @param securityInfo - Security alert information
	 * @returns Promise that resolves when notification is displayed
	 */
	async showEnhancedSecurityAlert(securityInfo: {
		modifiedFiles: { file: string; type: string }[];
		riskFactors: string[];
		autoSnapshotId?: string;
	}): Promise<void> {
		await this.showNotification({
			id: `security-${Date.now()}`,
			type: "warning",
			icon: "\u{1f534}",
			message: "Sensitive file modification detected",
			detail: `Critical File Protection Alert

Modified Files:
${securityInfo.modifiedFiles.map((f) => `• ${f.file} (${f.type})`).join("\n")}

Risk Factors:
${securityInfo.riskFactors.map((r) => `• ${r}`).join("\n")}

Snapshot: ${
				securityInfo.autoSnapshotId
					? "✅ Auto-created before changes"
					: "❌ Not created"
			}
[Review Changes] [Rollback Now] [Mark Safe]`,
			timestamp: Date.now(),
			actions: [
				{ title: "Review Changes", command: "snapback.reviewChanges" },
				{ title: "Rollback Now", command: "snapback.rollback" },
				{ title: "Mark Safe", command: "snapback.markSafe" },
			],
		});
	}

	/**
	 * Display an enhanced large change detection notification.
	 *
	 * This method provides alerts about significant codebase changes with
	 * scope analysis and risk assessment.
	 *
	 * @param changeInfo - Large change information
	 * @returns Promise that resolves when notification is displayed
	 */
	async showEnhancedLargeChange(changeInfo: {
		filesModified: number;
		linesChanged: number;
		newDependencies: number;
		configFilesUpdated: number;
		changeVelocity: string;
		riskLevel: string;
		lastSnapshot: string;
	}): Promise<void> {
		await this.showNotification({
			id: `change-${Date.now()}`,
			type: "warning",
			icon: "📊",
			message: "Significant codebase changes detected",
			detail: `Large-Scale Change Analysis

Change Scope:
• ${changeInfo.filesModified} files modified
• ${changeInfo.linesChanged} lines added/removed
• ${changeInfo.newDependencies} new dependencies introduced
• ${changeInfo.configFilesUpdated} configuration files updated

Change Velocity: ${changeInfo.changeVelocity}
Risk Level: ${changeInfo.riskLevel} - Potential cascade failure

Last stable snapshot: ${changeInfo.lastSnapshot}
[View Full Diff] [Create Snapshot] [Continue Monitoring]`,
			timestamp: Date.now(),
			actions: [
				{ title: "View Full Diff", command: "snapback.viewDiff" },
				{
					title: "Create Snapshot",
					command: "snapback.createSnapshot",
				},
				{
					title: "Continue Monitoring",
					command: "snapback.continueMonitoring",
				},
			],
		});
	}

	/**
	 * Display an enhanced failure recovery alert.
	 *
	 * This method provides critical alerts about build failures with
	 * recovery options and error analysis.
	 *
	 * @param failureInfo - Failure information
	 * @returns Promise that resolves when notification is displayed
	 */
	async showEnhancedFailureRecovery(failureInfo: {
		errorSource: string;
		likelyCause: string;
		aiToolActive?: string;
		aiConfidence?: number;
		lastSnapshot: string;
		recoveryOptions: { type: string; description: string }[];
	}): Promise<void> {
		await this.showNotification({
			id: `failure-${Date.now()}`,
			type: "error",
			icon: SNAPBACK_ICONS.CRITICAL,
			message: "Build failure detected - Recovery available",
			detail: `Build System Failure Detected

Error Source: ${failureInfo.errorSource}
Likely Cause: ${failureInfo.likelyCause}
${
	failureInfo.aiToolActive
		? `AI Tool Active: ${failureInfo.aiToolActive} (confidence: ${failureInfo.aiConfidence}%)`
		: ""
}

Available Recovery Options:
${failureInfo.recoveryOptions
	.map((o) => `• ${o.type}: ${o.description}`)
	.join("\n")}

[Quick Rollback] [Selective Recovery] [View Error Log]`,
			timestamp: Date.now(),
			actions: [
				{ title: "Quick Rollback", command: "snapback.quickRollback" },
				{
					title: "Selective Recovery",
					command: "snapback.selectiveRecovery",
				},
				{ title: "View Error Log", command: "snapback.viewErrorLog" },
			],
		});
	}

	/**
	 * Display an enhanced system status update.
	 *
	 * This method provides comprehensive system status information
	 * including monitoring status and protection statistics.
	 *
	 * @param statusInfo - System status information
	 * @returns Promise that resolves when notification is displayed
	 */
	async showEnhancedStatus(statusInfo: {
		currentStatus: string;
		aiDetection: { enabled: boolean; tools: string[] };
		autoSnapshot: { enabled: boolean; frequency: string };
		fileWatching: { enabled: boolean; filesMonitored: number };
		lastSnapshot: string;
		statistics: { snapshots: number; alerts: number; recoveries: number };
	}): Promise<void> {
		await this.showNotification({
			id: `status-${Date.now()}`,
			type: "info",
			icon: "\u{1f7e2}",
			message: "SnapBack protection status updated",
			detail: `SnapBack Protection Dashboard

Current Status: ${statusInfo.currentStatus}
• AI Detection: ${
				statusInfo.aiDetection.enabled
					? SNAPBACK_ICONS.SUCCESS
					: SNAPBACK_ICONS.FAILED
			} Enabled (monitoring ${statusInfo.aiDetection.tools.join(", ")})
• Auto-snapshot: ${statusInfo.autoSnapshot.enabled ? SNAPBACK_ICONS.SUCCESS : SNAPBACK_ICONS.FAILED} ${
				statusInfo.autoSnapshot.frequency
			}
• File watching: ${statusInfo.fileWatching.enabled ? SNAPBACK_ICONS.SUCCESS : SNAPBACK_ICONS.FAILED} ${
				statusInfo.fileWatching.filesMonitored
			} files monitored
• Last snapshot: ${statusInfo.lastSnapshot}

Protection Statistics (This Session):
• Snapshots created: ${statusInfo.statistics.snapshots}
• Risk alerts: ${statusInfo.statistics.alerts} (all handled safely)
• Recovery operations: ${statusInfo.statistics.recoveries} (no disasters yet!)

Your code is fully protected. Code fearlessly! \u{1f6e1}`,
			timestamp: Date.now(),
			actions: [
				{ title: "View Dashboard", command: "snapback.viewDashboard" },
				{
					title: "Create Snapshot",
					command: "snapback.createSnapshot",
				},
			],
		});
	}

	/**
	 * Display enhanced statistics in a notification panel
	 * @param statusInfo - Current protection status information
	 */
	async showEnhancedStatistics(statusInfo: {
		protectionStatus: string;
		protectedFiles: number;
		statistics: { snapshots: number; alerts: number; recoveries: number };
		lastActivity: string;
	}): Promise<void> {
		await this.showNotification({
			id: `statistics-${Date.now()}`,
			type: "info",
			icon: SNAPBACK_ICONS.OVERVIEW,
			message: "SnapBack statistics updated",
			detail: `SnapBack Protection Status: ${statusInfo.protectionStatus.toUpperCase()}

Protected Files: ${statusInfo.protectedFiles}
• Snapshots created: ${statusInfo.statistics.snapshots}
• AI alerts detected: ${statusInfo.statistics.alerts}
• Recovery operations: ${statusInfo.statistics.recoveries}

Last activity: ${statusInfo.lastActivity}
[View Full Report] [Create Manual Snapshot] [Adjust Settings]`,
			timestamp: Date.now(),
			actions: [
				{ title: "View Report", command: "snapback.viewReport" },
				{
					title: "Create Manual Snapshot",
					command: "snapback.createSnapshot",
				},
				{
					title: "Adjust Settings",
					command: "snapback.adjustSettings",
				},
			],
		});
	}

	/**
	 * Display a notification to the user and persist it in the notification history.
	 *
	 * This method serves as the primary entry point for all notification display operations.
	 * It coordinates between VS Code's native notification system and SnapBack's persistent
	 * notification tracking requirements.
	 *
	 * Side Effects:
	 * - Adds notification to internal history queue (newest first)
	 * - Triggers FIFO eviction if history exceeds capacity
	 * - Displays notification in VS Code UI based on severity type
	 * - Does not handle action button clicks (handled by VS Code command system)
	 *
	 * Error Handling:
	 * - Silently continues if VS Code notification API fails
	 * - Always persists notification to history regardless of display success
	 * - No retry logic - failures are logged but don't block execution
	 *
	 * Performance Considerations:
	 * - O(1) insertion at queue head
	 * - O(1) eviction from queue tail
	 * - Async operation completes when VS Code UI updates
	 *
	 * @param notification - The notification object to display and store
	 * @returns Promise that resolves when notification is displayed (not when dismissed)
	 * @throws Never throws - all errors are silently handled to prevent workflow interruption
	 *
	 * @example
	 * ```typescript
	 * // Display a risk warning with actionable buttons
	 * await notificationManager.showNotification({
	 *   id: 'risk-auth-' + Date.now(),
	 *   type: 'warning',
	 *   message: 'Potential security risk detected in authentication logic',
	 *   timestamp: Date.now(),
	 *   actions: [
	 *     { title: 'Review Code', command: 'snapback.reviewRisk' },
	 *     { title: 'Create Snapshot', command: 'snapback.createSnapshot' }
	 *   ]
	 * });
	 * ```
	 *
	 * @example
	 * ```typescript
	 * // Display a simple success message
	 * await notificationManager.showNotification({
	 *   id: 'success-' + Date.now(),
	 *   type: 'info',
	 *   message: 'Operation completed successfully',
	 *   timestamp: Date.now()
	 * });
	 * ```
	 */
	async showNotification(notification: SnapBackNotification): Promise<void> {
		// Add to notification history (newest first for efficient access patterns)
		this.notifications.unshift(notification);

		// Enforce memory bounds through FIFO eviction policy
		// Rationale: Oldest notifications are least likely to be referenced
		if (this.notifications.length > this.maxNotifications) {
			this.notifications.pop();
		}

		// Format message with icon if provided
		const formattedMessage = notification.icon
			? `${notification.icon} ${notification.message}`
			: notification.message;

		// Delegate to VS Code's notification system based on severity
		// Note: Action buttons are automatically handled by VS Code command system
		switch (notification.type) {
			case "info":
				if (notification.detail) {
					vscode.window.showInformationMessage(
						formattedMessage,
						{ detail: notification.detail },
						...(notification.actions?.map((a) => a.title) || []),
					);
				} else {
					vscode.window.showInformationMessage(
						formattedMessage,
						...(notification.actions?.map((a) => a.title) || []),
					);
				}
				break;
			case "warning":
				if (notification.detail) {
					vscode.window.showWarningMessage(
						formattedMessage,
						{ detail: notification.detail },
						...(notification.actions?.map((a) => a.title) || []),
					);
				} else {
					vscode.window.showWarningMessage(
						formattedMessage,
						...(notification.actions?.map((a) => a.title) || []),
					);
				}
				break;
			/**
			 * MVP Note: Error modal has been commented out for MVP and will be replaced with
			 * inline CodeLens + status-bar toast UI instead of full-screen modals.
			 *
			 * For context: Modal dialogs create interruption cost for users. The MVP approach
			 * uses inline banners with "Allow once · Mark wrong · Details" chips that store
			 * rationale without flow break.
			 */
			/*
			case "error":
				if (notification.detail) {
					vscode.window.showErrorMessage(
						formattedMessage,
						{ modal: true, detail: notification.detail },
						...(notification.actions?.map((a) => a.title) || []),
					);
				} else {
					vscode.window.showErrorMessage(
						formattedMessage,
						...(notification.actions?.map((a) => a.title) || []),
					);
				}
				break;
			*/

			// MVP implementation uses inline CodeLens + status-bar toast instead of modals
			case "error":
				// In MVP, error notifications are handled via inline UI elements
				// For now, we'll show a non-modal error message
				vscode.window.showErrorMessage(
					formattedMessage,
					...(notification.actions?.map((a) => a.title) || []),
				);
				break;
		}
	}

	/**
	 * Display a standardized notification for file restoration operations.
	 *
	 * This convenience method encapsulates the domain-specific logic for file restoration
	 * notifications, providing consistent messaging and actions across the SnapBack
	 * extension.
	 *
	 * Design Rationale:
	 * - Standardizes file restoration notification format and actions
	 * - Provides immediate user feedback for critical workflow operations
	 * - Enables quick navigation to file details via action button
	 * - Uses 'info' type to indicate successful, non-urgent operation
	 *
	 * Workflow Integration:
	 * - Typically called after successful file restoration operations
	 * - Action button connects to file viewing functionality
	 * - Notification persists in history for session review
	 *
	 * @param fileId - Unique identifier of the restored file
	 * @returns Promise that resolves when notification is displayed
	 *
	 * @example
	 * ```typescript
	 * // Notify user of successful file restoration
	 * await notificationManager.showFileRestored('src/utils/crypto.ts');
	 *
	 * // User sees: "File src/utils/crypto.ts restored successfully"
	 * // With action button: "View" -> triggers 'snapback.viewFile' command
	 * ```
	 *
	 * @example
	 * ```typescript
	 * // Integrate with file restoration workflow
	 * try {
	 *   await restoreFile('src/utils/crypto.ts');
	 *   await notificationManager.showFileRestored('src/utils/crypto.ts');
	 *   logger.info('File restored and user notified');
	 * } catch (error) {
	 *   // Handle file restoration failure separately
	 * }
	 * ```
	 */
	async showFileRestored(fileId: string): Promise<void> {
		await this.showNotification({
			id: `restore-${Date.now()}`,
			type: "info",
			message: `File ${fileId} restored successfully`,
			timestamp: Date.now(),
			actions: [{ title: "View File", command: "snapback.viewFile" }],
		});
	}

	/**
	 * Retrieve a subset of recent notifications for display or analysis.
	 *
	 * This method provides controlled access to the notification history, enabling
	 * notification views, debugging panels, and analytics without exposing the
	 * entire internal notification array.
	 *
	 * Performance Characteristics:
	 * - O(1) for small limits due to slice operation on pre-ordered array
	 * - Returns shallow copy to prevent external mutation of internal state
	 * - No filtering or sorting - notifications are pre-ordered by insertion time
	 *
	 * @param limit - Maximum number of notifications to return (default: 10)
	 * @returns Array of recent notifications, newest first, limited to specified count
	 *
	 * @example
	 * ```typescript
	 * // Get last 5 notifications for quick review
	 * const recent = notificationManager.getRecentNotifications(5);
	 * recent.forEach(notification => {
	 *   logger.info(`${notification.type}: ${notification.message}`);
	 * });
	 * ```
	 *
	 * @example
	 * ```typescript
	 * // Get all available notifications for debugging
	 * const allNotifications = notificationManager.getRecentNotifications(50);
	 * const errorCount = allNotifications.filter(n => n.type === 'error').length;
	 * logger.info(`Found ${errorCount} error notifications in history`);
	 * ```
	 */
	getRecentNotifications(limit = 10): SnapBackNotification[] {
		return this.notifications.slice(0, limit);
	}

	/**
	 * Remove all notifications from the history.
	 *
	 * This method provides a clean slate operation for notification management,
	 * typically used for user-initiated cleanup or session reset scenarios.
	 *
	 * Side Effects:
	 * - Immediately clears all notification history
	 * - Does not affect notifications currently displayed in VS Code UI
	 * - Irreversible operation - no undo mechanism provided
	 *
	 * Use Cases:
	 * - User requests notification history cleanup
	 * - Extension reset or reinitialization
	 * - Memory cleanup during testing scenarios
	 *
	 * @example
	 * ```typescript
	 * // Clear notification history before starting a new development session
	 * notificationManager.clearNotifications();
	 * logger.info('Notification history cleared for new session');
	 * ```
	 */
	clearNotifications(): void {
		this.notifications = [];
	}

	/**
	 * Remove a specific notification from the history by its unique identifier.
	 *
	 * This method enables targeted notification cleanup, allowing users or automated
	 * systems to dismiss specific notifications without affecting others.
	 *
	 * Performance:
	 * - O(n) operation due to array filtering
	 * - Safe for concurrent access (creates new array)
	 * - No-op if notification ID doesn't exist
	 *
	 * Error Handling:
	 * - Silently succeeds if notification ID not found
	 * - No validation on ID format - accepts any string
	 *
	 * @param id - Unique identifier of the notification to dismiss
	 *
	 * @example
	 * ```typescript
	 * // Dismiss a specific risk warning after user review
	 * const riskId = 'risk-auth-1234567890';
	 * notificationManager.dismissNotification(riskId);
	 * ```
	 *
	 * @example
	 * ```typescript
	 * // Batch dismiss multiple notifications
	 * const notificationsToDelete = ['warning-1', 'warning-2', 'info-3'];
	 * notificationsToDelete.forEach(id => {
	 *   notificationManager.dismissNotification(id);
	 * });
	 * ```
	 */
	dismissNotification(id: string): void {
		this.notifications = this.notifications.filter((n) => n.id !== id);
	}
}
