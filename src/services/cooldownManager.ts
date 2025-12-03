import { StorageBroker, THRESHOLDS } from "@snapback/sdk"; // Import StorageBroker directly from main export
import { logger } from "../utils/logger.js";
import type { ProtectionLevel } from "../views/types.js";

/**
 * Interface for cooldown entry in storage
 */
interface CooldownEntry {
	id: string;
	filePath: string;
	protectionLevel: ProtectionLevel;
	triggeredAt: number;
	expiresAt: number;
	actionTaken:
		| "snapshot_created"
		| "save_allowed"
		| "save_blocked"
		| "user_override";
	snapshotId?: string;
}

/**
 * Interface for audit entry in storage
 */
interface AuditEntry {
	id: string;
	filePath: string;
	protectionLevel: ProtectionLevel;
	action:
		| "save_attempt"
		| "save_blocked"
		| "snapshot_created"
		| "user_override";
	timestamp: number;
	details?: Record<string, unknown>;
	snapshotId?: string;
}

/**
 * CooldownManager - Manages cooldown periods for protected file operations and audit trails
 *
 * This manager provides:
 * 1. Cooldown periods to prevent repeated prompts for the same file
 * 2. Audit trails for all protection-related operations
 * 3. Storage of cooldown and audit data using StorageBroker
 *
 * Cooldown periods (from SDK centralized thresholds):
 * - Warning level: 5 minutes (THRESHOLDS.protection.otherCooldown)
 * - Protected level: 10 minutes (THRESHOLDS.protection.protectedCooldown)
 * - User override: 1 hour (THRESHOLDS.session.maxSessionDuration)
 * - Watched level: 5 minutes (THRESHOLDS.protection.otherCooldown)
 */
export class CooldownManager {
	private initialized = false;
	private storageBroker: StorageBroker | null = null; // Add StorageBroker reference

	// Default cooldown periods (from SDK centralized thresholds)
	private readonly DEFAULT_COOLDOWN_PERIODS = {
		Warning: THRESHOLDS.protection.otherCooldown,
		Protected: THRESHOLDS.protection.protectedCooldown,
		userOverride: THRESHOLDS.session.maxSessionDuration,
		Watched: THRESHOLDS.protection.otherCooldown,
	};

	constructor(dbPath: string) {
		// Initialize StorageBroker with the provided database path
		this.storageBroker = new StorageBroker(dbPath);
	}

	/**
	 * Initialize the cooldown manager and database connection
	 */
	async initialize(): Promise<void> {
		if (this.initialized) {
			return;
		}

		try {
			if (this.storageBroker) {
				await this.storageBroker.initialize();
			}
			this.initialized = true;
			logger.info("CooldownManager initialized successfully");
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);

			// Log the detailed error for debugging
			logger.error(
				"[StorageBroker] Failed to initialize CooldownManager",
				error as Error,
			);

			// Extract actionable information from the error
			if (message.includes("sql.js")) {
				logger.warn(
					"[WARN] CooldownManager unavailable: sql.js WASM initialization failed. Rate-limiting disabled.",
				);
			} else if (message.includes("better-sqlite3")) {
				logger.warn(
					"[WARN] CooldownManager unavailable: neither better-sqlite3 nor sql.js is available. Rate-limiting disabled.",
				);
			} else {
				logger.warn(
					"[WARN] CooldownManager unavailable: storage broker initialization failed. Rate-limiting disabled.",
				);
			}

			// Mark as initialized but unavailable - don't throw
			// This allows sessions/snapshots to work without cooldown features
			this.initialized = false;
		}
	}

	/**
	 * Set a cooldown for a file operation
	 * @param filePath The file path
	 * @param protectionLevel The protection level
	 * @param actionTaken The action that triggered the cooldown
	 * @param snapshotId Optional snapshot ID
	 * @param customDuration Optional custom cooldown duration in milliseconds
	 */
	async setCooldown(
		filePath: string,
		protectionLevel: ProtectionLevel,
		actionTaken: CooldownEntry["actionTaken"],
		snapshotId?: string,
		customDuration?: number,
	): Promise<void> {
		if (!this.initialized) {
			throw new Error("CooldownManager not initialized");
		}

		const now = Date.now();
		const duration =
			customDuration || this.getCooldownDuration(protectionLevel, actionTaken);
		const expiresAt = now + duration;

		// Generate a unique ID for the cooldown entry
		const id = `cooldown_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

		try {
			if (this.storageBroker) {
				// Use StorageBroker to store the cooldown entry
				await this.storageBroker.queueOperation("set_cooldown", async () => {
					const db = this.storageBroker?.getDatabase();
					if (!db) {
						throw new Error("Storage broker not properly initialized");
					}

					const stmt = db.prepare(`
						INSERT INTO cooldowns (id, file_path, protection_level, triggered_at, expires_at, action_taken, snapshot_id)
						VALUES (?, ?, ?, ?, ?, ?, ?)
					`);
					stmt.run(
						id,
						filePath,
						protectionLevel,
						now,
						expiresAt,
						actionTaken,
						snapshotId || null,
					);
				});
			}

			logger.debug("Cooldown set", { filePath, protectionLevel, expiresAt });
		} catch (error) {
			logger.error("Failed to set cooldown", error as Error, {
				filePath,
				protectionLevel,
			});
			throw error;
		}
	}

	/**
	 * Check if a file is currently in cooldown
	 * @param filePath The file path
	 * @param protectionLevel The protection level
	 * @returns True if the file is in cooldown, false otherwise
	 */
	async isInCooldown(
		filePath: string,
		protectionLevel: ProtectionLevel,
	): Promise<boolean> {
		if (!this.initialized) {
			throw new Error("CooldownManager not initialized");
		}

		const now = Date.now();

		try {
			if (this.storageBroker) {
				// Use StorageBroker to query the cooldown status
				return await this.storageBroker.queueOperation(
					"check_cooldown",
					async () => {
						const db = this.storageBroker?.getDatabase();
						if (!db) {
							throw new Error("Storage broker not properly initialized");
						}

						const stmt = db.prepare(`
						SELECT COUNT(*) as count FROM cooldowns
						WHERE file_path = ?
						AND protection_level = ?
						AND expires_at > ?
					`);
						const result = stmt.get(filePath, protectionLevel, now) as {
							count: number;
						};
						return result.count > 0;
					},
				);
			}
			return false;
		} catch (error) {
			logger.error("Failed to check cooldown status", error as Error, {
				filePath,
				protectionLevel,
			});
			return false; // Fail open - don't block operations due to cooldown check failure
		}
	}

	/**
	 * Get the cooldown duration for a protection level and action
	 * @param protectionLevel The protection level
	 * @param actionTaken The action taken
	 * @returns Cooldown duration in milliseconds
	 */
	private getCooldownDuration(
		protectionLevel: ProtectionLevel,
		actionTaken: CooldownEntry["actionTaken"],
	): number {
		// Special handling for user overrides
		if (actionTaken === "user_override") {
			return this.DEFAULT_COOLDOWN_PERIODS.userOverride;
		}

		// Return the default duration based on protection level
		return (
			this.DEFAULT_COOLDOWN_PERIODS[protectionLevel] ||
			this.DEFAULT_COOLDOWN_PERIODS.Warning
		);
	}

	/**
	 * Record an audit entry for a protection-related operation
	 * @param filePath The file path
	 * @param protectionLevel The protection level
	 * @param action The action taken
	 * @param details Optional details about the operation
	 * @param snapshotId Optional snapshot ID
	 */
	async recordAudit(
		filePath: string,
		protectionLevel: ProtectionLevel,
		action: AuditEntry["action"],
		details?: Record<string, unknown>,
		snapshotId?: string,
	): Promise<void> {
		if (!this.initialized) {
			throw new Error("CooldownManager not initialized");
		}

		const timestamp = Date.now();
		const id = `audit_${timestamp}_${Math.random().toString(36).substr(2, 9)}`;

		try {
			if (this.storageBroker) {
				// Use StorageBroker to store the audit entry
				await this.storageBroker.queueOperation("record_audit", async () => {
					const db = this.storageBroker?.getDatabase();
					if (!db) {
						throw new Error("Storage broker not properly initialized");
					}

					const stmt = db.prepare(`
						INSERT INTO audit_trail (id, file_path, protection_level, action, timestamp, details, snapshot_id)
						VALUES (?, ?, ?, ?, ?, ?, ?)
					`);
					const detailsJson = details ? JSON.stringify(details) : null;
					stmt.run(
						id,
						filePath,
						protectionLevel,
						action,
						timestamp,
						detailsJson,
						snapshotId || null,
					);
				});
			}

			logger.debug("Audit entry recorded", { filePath, action, timestamp });
		} catch (error) {
			logger.error("Failed to record audit entry", error as Error, {
				filePath,
				action,
			});
			// Don't throw - audit recording failures shouldn't block operations
		}
	}

	/**
	 * Get recent audit entries for a file
	 * @param filePath The file path
	 * @param limit Maximum number of entries to return
	 * @returns Array of audit entries
	 */
	async getAuditTrail(
		filePath: string,
		limit: number = 50,
	): Promise<AuditEntry[]> {
		if (!this.initialized) {
			throw new Error("CooldownManager not initialized");
		}

		try {
			if (this.storageBroker) {
				// Use StorageBroker to query the audit trail
				return await this.storageBroker.queueOperation(
					"get_audit_trail",
					async () => {
						const db = this.storageBroker?.getDatabase();
						if (!db) {
							throw new Error("Storage broker not properly initialized");
						}

						const stmt = db.prepare(`
						SELECT id, file_path, protection_level, action, timestamp, details, snapshot_id
						FROM audit_trail
						WHERE file_path = ?
						ORDER BY timestamp DESC
						LIMIT ?
					`);
						const rows = stmt.all(filePath, limit) as Array<{
							id: string;
							file_path: string;
							protection_level: string;
							action: string;
							timestamp: number;
							details: string | null;
							snapshot_id: string | null;
						}>;

						return rows.map((row) => ({
							id: row.id,
							filePath: row.file_path,
							protectionLevel: row.protection_level as ProtectionLevel,
							action: row.action as AuditEntry["action"],
							timestamp: row.timestamp,
							details: row.details ? JSON.parse(row.details) : undefined,
							snapshotId: row.snapshot_id || undefined,
						}));
					},
				);
			}
			return [];
		} catch (error) {
			logger.error("Failed to retrieve audit trail", error as Error, {
				filePath,
			});
			return []; // Return empty array on failure
		}
	}

	/**
	 * Clear expired cooldowns from storage
	 */
	async clearExpiredCooldowns(): Promise<void> {
		if (!this.initialized) {
			throw new Error("CooldownManager not initialized");
		}

		const now = Date.now();

		try {
			if (this.storageBroker) {
				// Use StorageBroker to delete expired cooldowns
				await this.storageBroker.queueOperation(
					"clear_expired_cooldowns",
					async () => {
						const db = this.storageBroker?.getDatabase();
						if (!db) {
							throw new Error("Storage broker not properly initialized");
						}

						const stmt = db.prepare(`
						DELETE FROM cooldowns WHERE expires_at < ?
					`);
						const result = stmt.run(now);
						logger.info(`Cleared ${result.changes} expired cooldowns`);
					},
				);
			}

			logger.debug("Expired cooldowns cleared");
		} catch (error) {
			logger.error("Failed to clear expired cooldowns", error as Error);
			// Don't throw - this is a maintenance operation
		}
	}

	/**
	 * Close the cooldown manager and database connection
	 */
	async close(): Promise<void> {
		if (this.initialized) {
			try {
				if (this.storageBroker) {
					await this.storageBroker.close();
				}
				this.initialized = false;
				logger.info("CooldownManager closed successfully");
			} catch (error) {
				logger.error("Failed to close CooldownManager", error as Error);
				throw error;
			}
		}
	}
}
