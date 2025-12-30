import * as vscode from "vscode";
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
 * CooldownIndicator - Shows cooldown status in the status bar
 *
 * This indicator provides visual feedback when files are in cooldown,
 * preventing repeated prompts for the same file within a certain time period.
 */
export class CooldownIndicator {
	private statusBarItem: vscode.StatusBarItem;
	private protectedFileRegistry: ProtectedFileRegistry;
	private cooldownTimers: Map<string, NodeJS.Timeout> = new Map();
	private activeCooldowns: Map<string, CooldownEntry> = new Map();

	constructor(protectedFileRegistry: ProtectedFileRegistry) {
		this.protectedFileRegistry = protectedFileRegistry;

		// Create status bar item for cooldown indicator
		// ID-based API with priority 998 (after primary=1000, secondary=999)
		// Keeps all SnapBack items together on the left side
		this.statusBarItem = vscode.window.createStatusBarItem(
			"snapback.cooldown",
			vscode.StatusBarAlignment.Left,
			998,
		);
		this.statusBarItem.name = "SnapBack Cooldown Indicator";
		this.statusBarItem.hide(); // Hidden by default
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
	 * Update the status bar with current cooldown information
	 */
	private updateStatusBar(): void {
		const cooldownCount = this.activeCooldowns.size;

		if (cooldownCount === 0) {
			// No files in cooldown, hide the indicator
			this.statusBarItem.hide();
			return;
		}

		// Show the cooldown indicator
		this.statusBarItem.text = `$(clock) ${cooldownCount}`;
		this.statusBarItem.tooltip = this.createCooldownTooltip();
		this.statusBarItem.show();
	}

	/**
	 * Create a detailed tooltip showing cooldown information
	 */
	private createCooldownTooltip(): string {
		const lines = ["## 🧢 SnapBack Cooldown Status", "", "**Files in cooldown:**"];

		// Add each file in cooldown
		for (const [filePath, cooldown] of this.activeCooldowns) {
			const timeLeft = Math.max(0, Math.ceil((cooldown.expiresAt - Date.now()) / 1000));
			const levelIcon = this.getLevelIcon(cooldown.level);
			const fileName = filePath.split("/").pop() || filePath;
			lines.push(`- ${levelIcon} ${fileName} (${timeLeft}s remaining)`);
		}

		lines.push("", "*Files in cooldown will not prompt for snapshots*");

		return lines.join("\n");
	}

	/**
	 * Get the icon for a protection level
	 */
	private getLevelIcon(level: ProtectionLevel): string {
		switch (level) {
			case "watch":
				return "🟢";
			case "warn":
				return "🟡";
			case "block":
				return "🔴";
			default:
				return "⚪";
		}
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
	 * Show the status bar item
	 */
	public show(): void {
		this.updateStatusBar();
	}

	/**
	 * Hide the status bar item
	 */
	public hide(): void {
		this.statusBarItem.hide();
	}

	/**
	 * Dispose of the cooldown indicator
	 */
	public dispose(): void {
		this.clearAllCooldowns();
		this.statusBarItem.dispose();
	}
}
