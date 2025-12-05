import type { ProtectedFileRegistry } from "../services/protectedFileRegistry.js";
import { logger } from "../utils/logger.js";
import type { ProtectionLevel } from "../views/types.js";

/**
 * Handles audit trail logging for protection-related events.
 * Wraps the registry's audit logging functionality with a cleaner API.
 *
 * Responsibilities:
 * - Record save attempts and decisions
 * - Track snapshot creation events
 * - Log protection level changes
 * - Capture user overrides and cancellations
 * - Provide structured audit data for compliance
 *
 * All audit entries are persisted to the registry's audit storage
 * for later retrieval, analysis, and compliance reporting.
 */
export class AuditLogger {
	constructor(private registry: ProtectedFileRegistry) {}

	/**
	 * Record an audit entry for a protection-related event.
	 *
	 * @param filePath - Absolute path to the file
	 * @param protectionLevel - Protection level at time of event
	 * @param action - Type of action performed
	 * @param metadata - Additional context for the event
	 * @param snapshotId - Optional snapshot ID if snapshot was created
	 * @returns Promise that resolves when audit entry is recorded
	 */
	async recordAudit(
		filePath: string,
		protectionLevel: ProtectionLevel,
		action: "save_allowed" | "save_blocked" | "snapshot_created",
		metadata?: Record<string, unknown>,
		snapshotId?: string,
	): Promise<void> {
		try {
			await this.registry.recordAudit(
				filePath,
				protectionLevel,
				action,
				metadata,
				snapshotId,
			);

			logger.debug("Audit entry recorded", {
				filePath,
				protectionLevel,
				action,
				snapshotId,
			});
		} catch (error) {
			// Log warning but don't throw - audit failure shouldn't break save flow
			logger.warn("Failed to record audit entry", {
				filePath,
				protectionLevel,
				action,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	/**
	 * Record a save allowed event.
	 * Used when a save proceeds without creating a snapshot.
	 *
	 * @param filePath - Absolute path to the file
	 * @param protectionLevel - Protection level at time of event
	 * @param reason - Reason save was allowed (e.g., "cooldown_bypass", "temporary_allowance")
	 */
	async recordSaveAllowed(
		filePath: string,
		protectionLevel: ProtectionLevel,
		reason: string,
	): Promise<void> {
		await this.recordAudit(filePath, protectionLevel, "save_allowed", {
			reason,
		});
	}

	/**
	 * Record a save blocked event.
	 * Used when a save is cancelled or blocked.
	 *
	 * @param filePath - Absolute path to the file
	 * @param protectionLevel - Protection level at time of event
	 * @param reason - Reason save was blocked (e.g., "protection_level_block", "critical_security_issues")
	 * @param metadata - Additional context (e.g., risk factors, risk score)
	 */
	async recordSaveBlocked(
		filePath: string,
		protectionLevel: ProtectionLevel,
		reason: string,
		metadata?: Record<string, unknown>,
	): Promise<void> {
		await this.recordAudit(filePath, protectionLevel, "save_blocked", {
			reason,
			...metadata,
		});
	}

	/**
	 * Record a snapshot created event.
	 * Used when a snapshot is successfully created.
	 *
	 * @param filePath - Absolute path to the file
	 * @param protectionLevel - Protection level at time of event
	 * @param snapshotId - ID of the created snapshot
	 * @param reason - Reason snapshot was created (e.g., "watch_level", "warning_level")
	 */
	async recordSnapshotCreated(
		filePath: string,
		protectionLevel: ProtectionLevel,
		snapshotId: string,
		reason: string,
	): Promise<void> {
		await this.recordAudit(
			filePath,
			protectionLevel,
			"snapshot_created",
			{ reason },
			snapshotId,
		);
	}

	/**
	 * Record a snapshot creation failure.
	 * Used when snapshot creation fails but save proceeds.
	 *
	 * @param filePath - Absolute path to the file
	 * @param protectionLevel - Protection level at time of event
	 * @param error - Error that caused the failure
	 */
	async recordSnapshotFailed(
		filePath: string,
		protectionLevel: ProtectionLevel,
		error: Error | string,
	): Promise<void> {
		await this.recordAudit(filePath, protectionLevel, "save_allowed", {
			reason: "snapshot_creation_failed",
			error: error instanceof Error ? error.message : String(error),
		});
	}

	/**
	 * Record a user override event.
	 * Used when user chooses to save despite warnings or blocks.
	 *
	 * @param filePath - Absolute path to the file
	 * @param protectionLevel - Protection level at time of event
	 * @param overrideType - Type of override (e.g., "critical_security", "protection_block")
	 * @param metadata - Additional context (e.g., risk factors, risk score)
	 */
	async recordUserOverride(
		filePath: string,
		protectionLevel: ProtectionLevel,
		overrideType: string,
		metadata?: Record<string, unknown>,
	): Promise<void> {
		await this.recordAudit(filePath, protectionLevel, "save_allowed", {
			reason: `user_override_${overrideType}`,
			...metadata,
		});
	}
}
