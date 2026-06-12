/**
 * CooldownIndicator - Shows cooldown status (DEPRECATED)
 *
 * @deprecated Status integrated into main StatusBarManager
 * This class kept for API compatibility but does NOT create its own status bar item
 */

import type { ProtectedFileRegistry } from "../services/protectedFileRegistry";
import type { ProtectionLevel } from "../views/types";

/**
 * Interface for cooldown entry
 */
interface CooldownEntry {
	level: ProtectionLevel;
	expiresAt: number;
}

/**
 * CooldownIndicator - DEPRECATED: Status integrated into StatusBarManager
 *
 * This class no longer creates its own status bar item.
 * Cooldown status is now shown in the main StatusBarManager tooltip.
 */
export class CooldownIndicator {
	private protectedFileRegistry: ProtectedFileRegistry;
	private cooldownTimers: Map<string, NodeJS.Timeout> = new Map();
	private activeCooldowns: Map<string, CooldownEntry> = new Map();

	constructor(protectedFileRegistry: ProtectedFileRegistry) {
		this.protectedFileRegistry = protectedFileRegistry;

		// NO LONGER CREATES STATUS BAR ITEM
		// Cooldown status is now integrated into StatusBarManager
	}

	/**
	 * Set a file in cooldown state
	 * Per arch_remediation.md Task 2.3: CooldownCache is single source (via StorageManager)
	 * This UI component maintains its own map for status bar display only.
	 * @param filePath The file path
	 * @param protectionLevel The protection level
	 * @param durationMs Cooldown duration in milliseconds
	 */
	public setCooldown(filePath: string, protectionLevel: ProtectionLevel, durationMs: number): void {
		const expiresAt = Date.now() + durationMs;

		// Store the cooldown information in memory for UI display
		this.activeCooldowns.set(filePath, { level: protectionLevel, expiresAt });

		// Set a timer to clear the UI cooldown when it expires
		const timer = setTimeout(() => {
			this.clearCooldown(filePath);
		}, durationMs);

		// Store the timer so we can clear it if needed
		this.cooldownTimers.set(filePath, timer);

		// Note: Actual cooldown storage is handled by StorageManager.CooldownCache
		// via ProtectedFileRegistry.setCooldown() - this is UI-only

		// Update the status bar
		this.updateStatusBar();
	}

	/**
	 * Clear a file from cooldown state
	 * @param filePath The file path
	 */
	public clearCooldown(filePath: string): void {
		// Clear any existing timer
		const timer = this.cooldownTimers.get(filePath);
		if (timer) {
			clearTimeout(timer);
			this.cooldownTimers.delete(filePath);
		}

		// Remove from active cooldowns
		this.activeCooldowns.delete(filePath);

		// Update the status bar
		this.updateStatusBar();
	}

	/**
	 * Check if a file is currently in cooldown
	 * Per arch_remediation.md Task 2.3: Uses registry which delegates to StorageManager.CooldownCache
	 * @param filePath The file path
	 * @returns True if the file is in cooldown, false otherwise
	 */
	public isInCooldown(filePath: string): boolean {
		// First check local UI cache
		const cooldown = this.activeCooldowns.get(filePath);
		if (cooldown) {
			// Check if cooldown has expired
			if (Date.now() > cooldown.expiresAt) {
				this.clearCooldown(filePath);
				return false;
			}
			return true;
		}

		// Fall back to registry (which uses StorageManager.CooldownCache)
		// Check all protection levels since we don't know which one was used
		return (
			this.protectedFileRegistry.isInCooldown(filePath, "watch") ||
			this.protectedFileRegistry.isInCooldown(filePath, "warn") ||
			this.protectedFileRegistry.isInCooldown(filePath, "block")
		);
	}

	/**
	 * Get the protection level of a file in cooldown
	 * @param filePath The file path
	 * @returns The protection level or undefined if not in cooldown
	 */
	public getCooldownLevel(filePath: string): ProtectionLevel | undefined {
		const cooldown = this.activeCooldowns.get(filePath);
		return cooldown ? cooldown.level : undefined;
	}

	/**
	 * Update the status bar - DEPRECATED
	 * @deprecated No-op since status bar removed
	 */
	private updateStatusBar(): void {
		// NO-OP: Status bar removed - cooldown shown in StatusBarManager tooltip
	}

	/**
	 * Clear all cooldowns
	 */
	public clearAllCooldowns(): void {
		// Clear all timers
		for (const timer of this.cooldownTimers.values()) {
			clearTimeout(timer);
		}
		this.cooldownTimers.clear();

		// Clear all cooldowns
		this.activeCooldowns.clear();

		// Update the status bar
		this.updateStatusBar();
	}

	/**
	 * Show - DEPRECATED
	 * @deprecated No-op since status bar removed
	 */
	public show(): void {
		// NO-OP
	}

	/**
	 * Hide - DEPRECATED
	 * @deprecated No-op since status bar removed
	 */
	public hide(): void {
		// NO-OP
	}

	/**
	 * Dispose of the cooldown indicator
	 */
	public dispose(): void {
		this.clearAllCooldowns();
		// Status bar item no longer exists
	}
}
