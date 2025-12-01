import * as vscode from "vscode";
import type { ProtectedFileRegistry } from "./services/protectedFileRegistry.js";
import { BRAND_SIGNAGE, getProtectionLevelSignage } from "./signage/index.js";
import { toError } from "./utils/errorHelpers.js";
import { logger } from "./utils/logger.js";
import type { ProtectionLevel } from "./views/types.js";
import { PROTECTION_LEVELS } from "./views/types.js";

interface ProtectionStats {
	watched: number;
	warning: number;
	protected: number;
	total: number;
	highestLevel: ProtectionLevel | null;
}

export class SnapBackStatusBar {
	private statusBarItem: vscode.StatusBarItem;
	private registry: ProtectedFileRegistry | null = null;
	private updateTimeout?: NodeJS.Timeout;
	private readonly DEBOUNCE_MS = 150;

	constructor() {
		// Create the status bar item with high priority
		this.statusBarItem = vscode.window.createStatusBarItem(
			vscode.StatusBarAlignment.Left,
			100, // High priority
		);
		this.statusBarItem.command = "snapback.showAllProtectedFiles";
		this.updateStatusBar("No files protected", "none");
	}

	/**
	 * Initialize the status bar with the protected file registry
	 */
	public initialize(registry: ProtectedFileRegistry): void {
		this.registry = registry;
		this.update();
	}

	/**
	 * Update the status bar with current protection statistics
	 */
	public update(): void {
		// Clear existing timeout
		if (this.updateTimeout) {
			clearTimeout(this.updateTimeout);
		}

		// Schedule update
		this.updateTimeout = setTimeout(() => {
			this.performUpdate();
		}, this.DEBOUNCE_MS);
	}

	/**
	 * Perform the actual status bar update
	 */
	private async performUpdate(): Promise<void> {
		if (!this.registry) {
			this.updateStatusBar("Initializing...", "none");
			return;
		}

		try {
			const stats = await this.calculateStats();
			const text = this.formatText(stats);
			const color = this.getColor(stats);
			this.updateStatusBar(text, color);
			this.statusBarItem.tooltip = this.createTooltip(stats);
		} catch (error) {
			logger.error("[SnapBack] Error updating status bar:", toError(error));
			this.updateStatusBar("Error", "error");
		}
	}

	/**
	 * Calculate protection statistics
	 */
	private async calculateStats(): Promise<ProtectionStats> {
		if (!this.registry) {
			return {
				watched: 0,
				warning: 0,
				protected: 0,
				total: 0,
				highestLevel: null,
			};
		}

		const files = await this.registry.list();

		const stats: ProtectionStats = {
			watched: 0,
			warning: 0,
			protected: 0,
			total: files.length,
			highestLevel: null,
		};

		// Count files by protection level
		files.forEach((file) => {
			const level = file.protectionLevel || "Watched";
			stats[
				level.toLowerCase() as keyof Omit<
					ProtectionStats,
					"total" | "highestLevel"
				>
			]++;
		});

		// Determine highest protection level
		if (stats.protected > 0) {
			stats.highestLevel = "Protected";
		} else if (stats.warning > 0) {
			stats.highestLevel = "Warning";
		} else if (stats.watched > 0) {
			stats.highestLevel = "Watched";
		}

		return stats;
	}

	/**
	 * Format status bar text with protection level info
	 * Uses canonical signage for emojis and labels
	 */
	private formatText(stats: ProtectionStats): string {
		if (stats.total === 0) {
			return `${BRAND_SIGNAGE.logoEmoji} No files protected`;
		}

		// Get highest level info from canonical signage
		const highestLevel = stats.highestLevel;
		if (!highestLevel) {
			return `${BRAND_SIGNAGE.logoEmoji} ${stats.total} ${
				stats.total === 1 ? "file" : "files"
			} | Protected`;
		}

		const levelMetadata = PROTECTION_LEVELS[highestLevel];
		const fileText = stats.total === 1 ? "file" : "files";

		return `${BRAND_SIGNAGE.logoEmoji} ${stats.total} ${fileText} | ${levelMetadata.icon} ${highestLevel}`;
	}

	/**
	 * Get status bar color based on highest protection level
	 */
	private getColor(
		stats: ProtectionStats,
	): "none" | "warning" | "error" | "default" {
		if (stats.protected > 0) {
			return "error"; // Red background for protected files
		}
		if (stats.warning > 0) {
			return "warning"; // Orange background for warning files
		}
		if (stats.watched > 0) {
			return "default"; // Default background for watched files
		}
		return "none"; // No protection
	}

	/**
	 * Update status bar appearance
	 */
	private updateStatusBar(
		text: string,
		colorType: "none" | "warning" | "error" | "default",
	): void {
		this.statusBarItem.text = text;

		// Set background color based on protection level
		switch (colorType) {
			case "error":
				this.statusBarItem.backgroundColor = new vscode.ThemeColor(
					"statusBarItem.errorBackground",
				);
				break;
			case "warning":
				this.statusBarItem.backgroundColor = new vscode.ThemeColor(
					"statusBarItem.warningBackground",
				);
				break;
			case "default":
				this.statusBarItem.backgroundColor = new vscode.ThemeColor(
					"statusBarItem.background",
				);
				break;
			default:
				this.statusBarItem.backgroundColor = new vscode.ThemeColor(
					"statusBarItem.background",
				);
				break;
		}

		this.statusBarItem.show();
	}

	/**
	 * Create tooltip with detailed protection information
	 * Uses canonical signage for consistent emoji and labels
	 */
	private createTooltip(stats: ProtectionStats): vscode.MarkdownString {
		const tooltip = new vscode.MarkdownString();
		tooltip.supportHtml = false;
		tooltip.isTrusted = true;

		const watchSignage = getProtectionLevelSignage("watch");
		const warnSignage = getProtectionLevelSignage("warn");
		const blockSignage = getProtectionLevelSignage("block");

		tooltip.appendMarkdown("**SnapBack Protection Status**\n\n");
		tooltip.appendMarkdown(
			`${watchSignage.emoji} ${watchSignage.label}: ${stats.watched} file(s)\n`,
		);
		tooltip.appendMarkdown(
			`${warnSignage.emoji} ${warnSignage.label}: ${stats.warning} file(s)\n`,
		);
		tooltip.appendMarkdown(
			`${blockSignage.emoji} ${blockSignage.label}: ${stats.protected} file(s)\n\n`,
		);

		if (stats.highestLevel) {
			tooltip.appendMarkdown(`Highest level: **${stats.highestLevel}**\n`);
		} else {
			tooltip.appendMarkdown("Highest level: **None**\n");
		}

		tooltip.appendMarkdown("*Click to manage protection*");

		return tooltip;
	}

	/**
	 * Set protection status (deprecated - use update() instead)
	 */
	public setProtectionStatus(_status: "protected" | "atRisk"): void {
		// This method is kept for backward compatibility but is deprecated
		// The new implementation uses update() which automatically calculates the status
		logger.warn(
			"[SnapBack] setProtectionStatus is deprecated. Use update() instead.",
		);
		this.update();
	}

	public show(): void {
		this.statusBarItem.show();
	}

	public hide(): void {
		this.statusBarItem.hide();
	}

	public dispose(): void {
		if (this.updateTimeout) {
			clearTimeout(this.updateTimeout);
		}
		this.statusBarItem.dispose();
	}
}
