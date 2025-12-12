import { THRESHOLDS } from "@snapback/sdk";
import { TIMING_CONSTANTS } from "../constants";
import type { ProtectedFileRegistry } from "../services/protectedFileRegistry";
import type { CooldownIndicator } from "../ui/cooldownIndicator";
import { logger } from "../utils/logger";
import type { ProtectionLevel } from "../views/types";

/**
 * Manages cooldown periods and debouncing for protected file saves.
 * Tracks last snapshot times and determines when saves should be debounced.
 *
 * Responsibilities:
 * - Track last snapshot time per file
 * - Determine if a save should be debounced
 * - Set and check cooldown periods
 * - Coordinate with UI cooldown indicator
 * - Sync cooldown state with registry
 *
 * Cooldown prevents excessive snapshot creation by:
 * - Debouncing: Skip snapshots for saves within SNAPSHOT_DEBOUNCE_MS
 * - Cooldown periods: Set longer cooldowns after snapshot creation (5-10min)
 */
export class CooldownService {
	private lastSnapshotPerFile = new Map<string, number>();
	private readonly SNAPSHOT_DEBOUNCE_MS = TIMING_CONSTANTS.SNAPSHOT_DEBOUNCE_MS;
	private cooldownIndicator: CooldownIndicator | null = null;

	constructor(private registry: ProtectedFileRegistry) {}

	/**
	 * Set the cooldown indicator for UI updates.
	 * Should be called during extension activation.
	 *
	 * @param cooldownIndicator - UI component for cooldown display
	 */
	setCooldownIndicator(cooldownIndicator: CooldownIndicator): void {
		this.cooldownIndicator = cooldownIndicator;
	}

	/**
	 * Check if a file is currently in cooldown period.
	 * Uses cooldown indicator if available, otherwise returns false.
	 * Per arch_remediation.md Task 2.3: Now synchronous (CooldownCache is in-memory)
	 *
	 * @param filePath - Absolute path to the file
	 * @returns boolean - true if file is in cooldown
	 */
	isInCooldown(filePath: string): boolean {
		if (!this.cooldownIndicator) {
			const result = false;
			// 🔍 DIAGNOSTIC: Cooldown check
			console.log(`[Cooldown] isInCooldown(${filePath}): ${result}`);
			console.log("[Cooldown] Cooldown indicator not set");
			return result;
		}
		const result = this.cooldownIndicator.isInCooldown(filePath);

		// Enhanced expiration time logging (Bug #4 diagnosis)
		let expiresAt = "none";
		if (result) {
			// Note: CooldownIndicator may not expose getExpiration(), so we log what we can
			expiresAt = "active (check registry for exact time)";
		}

		// 🔍 DIAGNOSTIC: Cooldown check with enhanced timing
		console.log(`[Cooldown] isInCooldown(${filePath}): ${result}`);
		console.log(`[Cooldown] Cooldown status: ${expiresAt}`);
		console.log(`[Cooldown] Current time: ${Date.now()}`);

		return result;
	}

	/**
	 * Check if a save should be debounced based on last snapshot time.
	 * Returns true if the file was snapshotted recently (within SNAPSHOT_DEBOUNCE_MS).
	 *
	 * @param filePath - Absolute path to the file
	 * @returns boolean - true if save should be debounced
	 */
	shouldDebounce(filePath: string): boolean {
		const now = Date.now();
		const lastSnapshot = this.lastSnapshotPerFile.get(filePath) || 0;
		const timeSinceLastSnapshot = now - lastSnapshot;
		return timeSinceLastSnapshot < this.SNAPSHOT_DEBOUNCE_MS;
	}

	/**
	 * Get time since last snapshot for a file.
	 * Used for logging and diagnostics.
	 *
	 * @param filePath - Absolute path to the file
	 * @returns number - milliseconds since last snapshot, or Infinity if never snapshotted
	 */
	getTimeSinceLastSnapshot(filePath: string): number {
		const lastSnapshot = this.lastSnapshotPerFile.get(filePath);
		if (!lastSnapshot) {
			return Number.POSITIVE_INFINITY;
		}
		return Date.now() - lastSnapshot;
	}

	/**
	 * Record the current timestamp as the last snapshot time for a file.
	 * Called after successful snapshot creation.
	 *
	 * @param filePath - Absolute path to the file
	 */
	recordSnapshotTime(filePath: string): void {
		this.lastSnapshotPerFile.set(filePath, Date.now());
	}

	/**
	 * Set cooldown period for a file after a protection-related action.
	 * Cooldown duration depends on protection level (from SDK thresholds):
	 * - Protected: 10 minutes (THRESHOLDS.protection.protectedCooldown)
	 * - Warning/Watched: 5 minutes (THRESHOLDS.protection.otherCooldown)
	 *
	 * Updates both:
	 * 1. Cooldown indicator (UI component)
	 * 2. Registry (via StorageManager.CooldownCache - per Task 2.3)
	 *
	 * @param filePath - Absolute path to the file
	 * @param protectionLevel - Protection level of the file
	 * @param action - Type of action that triggered cooldown
	 * @param snapshotId - Optional snapshot ID if snapshot was created
	 */
	setCooldown(
		filePath: string,
		protectionLevel: ProtectionLevel,
		action: "snapshot_created" | "save_allowed" | "save_blocked" | "user_override",
		snapshotId?: string,
	): void {
		// Set cooldown duration based on protection level (from SDK centralized thresholds)
		const cooldownPeriod =
			protectionLevel === "block" ? THRESHOLDS.protection.protectedCooldown : THRESHOLDS.protection.otherCooldown;

		const expiresAt = Date.now() + cooldownPeriod;

		// 🔍 DIAGNOSTIC: Set cooldown
		console.log(`[Cooldown] setCooldown(${filePath}, ${protectionLevel})`);
		console.log(`[Cooldown] Cooldown set until: ${expiresAt} (${cooldownPeriod}ms from now)`);

		// Set cooldown in cooldown indicator (UI)
		if (this.cooldownIndicator) {
			this.cooldownIndicator.setCooldown(filePath, protectionLevel, cooldownPeriod);
		}

		// Set cooldown in registry (via StorageManager.CooldownCache)
		try {
			this.registry.setCooldown(filePath, protectionLevel, action, snapshotId);
		} catch (error) {
			logger.warn("Failed to set cooldown in registry", { error });
		}

		logger.info("Cooldown set for file", {
			filePath,
			protectionLevel,
			cooldownPeriod,
			action,
		});
	}

	/**
	 * Clear cooldown for a file.
	 * Useful for testing or manual cooldown reset.
	 *
	 * @param filePath - Absolute path to the file
	 */
	clearCooldown(filePath: string): void {
		this.lastSnapshotPerFile.delete(filePath);
		if (this.cooldownIndicator) {
			this.cooldownIndicator.clearCooldown(filePath);
		}
	}

	/**
	 * Clear all cooldown timers.
	 * Called during extension disposal.
	 */
	clearAll(): void {
		this.lastSnapshotPerFile.clear();
	}
}
