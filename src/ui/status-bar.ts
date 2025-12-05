import * as vscode from "vscode";
import type { ProtectedFileRegistry } from "../services/protectedFileRegistry.js";
import { BRAND_SIGNAGE, getProtectionLevelSignage } from "../signage/index.js";
import type { ProtectedFileEntry } from "../views/types.js";

export interface ProtectionState {
	watched: number;
	warnings: number;
	protected: number;
}

/**
 * Status bar controller for SnapBack protection status
 *
 * Features:
 * - Minimal idle state: 🧢 SnapBack
 * - Active state with breakdown: 🧢 SnapBack │ 7•6•2
 * - Rich tooltip with protection level details
 * - Brand green aesthetic with intelligent display
 * - Offline mode indicator
 * - Pause functionality with auto-resume
 * - Scanning and blocked state indicators
 */
export class StatusBarController {
	private statusBarItem: vscode.StatusBarItem;
	private _registry?: ProtectedFileRegistry;
	private offlineMode: boolean = false;
	private disposables: vscode.Disposable[] = [];
	private isScanning: boolean = false;
	private isBlocked: boolean = false;
	private isPaused: boolean = false;
	private pauseTimeout?: NodeJS.Timeout;

	constructor(registry?: ProtectedFileRegistry) {
		// Left alignment, high priority to appear near file info
		this.statusBarItem = vscode.window.createStatusBarItem(
			vscode.StatusBarAlignment.Left,
			100,
		);
		this.statusBarItem.command = "snapback.showStatus";
		this.statusBarItem.name = "SnapBack Protection Status";
		this._registry = registry;

		// Listen to registry changes if provided
		if (registry) {
			this.disposables.push(
				registry.onDidChangeProtectedFiles(() => {
					this.updateFromRegistry();
				}),
			);
		}

		this.statusBarItem.show();
		this.updateFromRegistry();
	}

	/**
	 * Set offline mode status
	 */
	public setOfflineMode(enabled: boolean): void {
		this.offlineMode = enabled;
		this.updateFromRegistry();
	}

	/**
	 * Update status bar from registry
	 */
	private async updateFromRegistry(): Promise<void> {
		if (!this._registry) {
			// No registry - show idle state
			this.updateIdle();
			return;
		}

		const files = await this._registry.list();
		const count = files.length;
		// this.lastUpdateTime = Date.now();

		if (count === 0) {
			this.updateIdle();
		} else {
			this.updateActive(files);
		}
	}

	/**
	 * Update to idle state - minimal branding
	 */
	private updateIdle(): void {
		// Build status text with indicators
		let statusText = `${BRAND_SIGNAGE.logoEmoji} ${BRAND_SIGNAGE.shortLabel}`;

		// Add state indicators (order matters: scanning, blocked, paused)
		if (this.isScanning) {
			statusText = `🔍 ${statusText}`;
		}
		if (this.isBlocked) {
			statusText = `🚫 ${statusText}`;
		}
		if (this.isPaused) {
			statusText = `⏸️ ${statusText}`;
		}

		// Show offline mode indicator if enabled
		const offlineIndicator = this.offlineMode ? " 🌐" : "";
		this.statusBarItem.text = `${statusText}${offlineIndicator}`;

		// Create tooltip
		const tooltip = new vscode.MarkdownString();
		tooltip.appendMarkdown(`**${BRAND_SIGNAGE.fullLabel}**\n\n`);
		tooltip.appendMarkdown("No files protected yet\n\n");

		// Add state indicators to tooltip
		if (this.isScanning) {
			tooltip.appendMarkdown("**🔍 Scanning:** Active\n\n");
		}
		if (this.isBlocked) {
			tooltip.appendMarkdown("**🚫 Blocked:** Save operation blocked\n\n");
		}
		if (this.isPaused) {
			tooltip.appendMarkdown("**⏸️ Paused:** Background scans halted\n\n");
			tooltip.appendMarkdown("### Resume Options\n\n");
			tooltip.appendMarkdown("- [Resume now](command:snapback.resumeNow)\n");
			tooltip.appendMarkdown(
				"- [Resume in 15m](command:snapback.resumeIn15m)\n",
			);
			tooltip.appendMarkdown(
				"- [Resume in 30m](command:snapback.resumeIn30m)\n",
			);
			tooltip.appendMarkdown(
				"- [Resume in 60m](command:snapback.resumeIn60m)\n\n",
			);
		}

		if (this.offlineMode) {
			tooltip.appendMarkdown("**Offline Mode:** Enabled\n\n");
		}

		tooltip.appendMarkdown(
			"💡 *Tip: Right-click any file → SnapBack: Protect File*",
		);

		this.statusBarItem.tooltip = tooltip;
		this.statusBarItem.backgroundColor =
			this.offlineMode || this.isBlocked
				? new vscode.ThemeColor("statusBarItem.warningBackground")
				: undefined;
		this.statusBarItem.show();
	}

	/**
	 * Update to active state - show breakdown with dot notation
	 */
	private updateActive(files: ProtectedFileEntry[]): void {
		const levels = this.getProtectionLevelCounts(files);
		const count = files.length;

		const breakdown = `${levels.watch}${getProtectionLevelSignage("watch").emoji}${levels.warn}${getProtectionLevelSignage("warn").emoji}${levels.block}${getProtectionLevelSignage("block").emoji}`;

		// Build status text with indicators
		let statusText = `${BRAND_SIGNAGE.logoEmoji} ${BRAND_SIGNAGE.shortLabel} │ ${breakdown}`;

		// Add state indicators (order matters: scanning, blocked, paused)
		if (this.isScanning) {
			statusText = `🔍 ${statusText}`;
		}
		if (this.isBlocked) {
			statusText = `🚫 ${statusText}`;
		}
		if (this.isPaused) {
			statusText = `⏸️ ${statusText}`;
		}

		// Show offline mode indicator if enabled
		const offlineIndicator = this.offlineMode ? " 🌐" : "";

		this.statusBarItem.text = `${statusText}${offlineIndicator}`;

		// Rich tooltip with detailed protection breakdown
		this.statusBarItem.tooltip = this.createDetailedTooltip(count, levels);

		// Brand green accent for critical state (Block level files) or offline mode
		if (this.offlineMode || this.isBlocked) {
			// Offline mode or blocked - warning background
			this.statusBarItem.backgroundColor = new vscode.ThemeColor(
				"statusBarItem.warningBackground",
			);
		} else if (levels.block > 0) {
			// Subtle warning state - files need attention
			this.statusBarItem.backgroundColor = new vscode.ThemeColor(
				"statusBarItem.warningBackground",
			);
		} else {
			// All good - clear background
			this.statusBarItem.backgroundColor = undefined;
		}

		this.statusBarItem.show();
	}

	/**
	 * Create detailed tooltip with protection breakdown
	 */
	private createDetailedTooltip(
		count: number,
		levels: { watch: number; warn: number; block: number },
	): vscode.MarkdownString {
		const tooltip = new vscode.MarkdownString(undefined, true);
		tooltip.supportHtml = true;
		tooltip.isTrusted = true;

		// Protection status overview
		tooltip.appendMarkdown(
			`## ${BRAND_SIGNAGE.logoEmoji} ${BRAND_SIGNAGE.fullLabel}\n\n`,
		);
		tooltip.appendMarkdown("---\n\n");

		// Show state indicators
		if (this.isScanning) {
			tooltip.appendMarkdown("**🔍 Scanning:** Active\n\n");
		}
		if (this.isBlocked) {
			tooltip.appendMarkdown("**🚫 Blocked:** Save operation blocked\n\n");
		}
		if (this.isPaused) {
			tooltip.appendMarkdown("**⏸️ Paused:** Background scans halted\n\n");
			tooltip.appendMarkdown("### Resume Options\n\n");
			tooltip.appendMarkdown("- [Resume now](command:snapback.resumeNow)\n");
			tooltip.appendMarkdown(
				"- [Resume in 15m](command:snapback.resumeIn15m)\n",
			);
			tooltip.appendMarkdown(
				"- [Resume in 30m](command:snapback.resumeIn30m)\n",
			);
			tooltip.appendMarkdown(
				"- [Resume in 60m](command:snapback.resumeIn60m)\n\n",
			);
		}

		// Show offline mode status
		if (this.offlineMode) {
			tooltip.appendMarkdown("**Offline Mode:** `Enabled`\n\n");
			tooltip.appendMarkdown("---\n\n");
		}

		tooltip.appendMarkdown(
			`**Total Protected:** \`${count}\` ${count === 1 ? "file" : "files"}\n\n`,
		);

		// Level breakdown with descriptions
		tooltip.appendMarkdown("### Protection Levels\n\n");
		tooltip.appendMarkdown(
			`${getProtectionLevelSignage("watch").codicon ? `$(${getProtectionLevelSignage("watch").codicon}) ` : ""}**${getProtectionLevelSignage("watch").label}** (Silent): \`${levels.watch}\` files\n`,
		);
		tooltip.appendMarkdown("> *Auto-snapshot on save, no interruptions*\n\n");

		tooltip.appendMarkdown(
			`${getProtectionLevelSignage("warn").codicon ? `$(${getProtectionLevelSignage("warn").codicon}) ` : ""}**${getProtectionLevelSignage("warn").label}** (Notify): \`${levels.warn}\` files\n`,
		);
		tooltip.appendMarkdown("> *Confirmation prompt before saving*\n\n");

		tooltip.appendMarkdown(
			`${getProtectionLevelSignage("block").codicon ? `$(${getProtectionLevelSignage("block").codicon}) ` : ""}**${getProtectionLevelSignage("block").label}** (Required): \`${levels.block}\` files\n`,
		);
		tooltip.appendMarkdown("> *Snapshot required before any changes*\n\n");

		tooltip.appendMarkdown("---\n\n");
		tooltip.appendMarkdown("*Click for detailed status and actions*");

		return tooltip;
	}

	/**
	 * Get protection level counts
	 */
	private getProtectionLevelCounts(files: ProtectedFileEntry[]): {
		watch: number;
		warn: number;
		block: number;
	} {
		return {
			watch: files.filter(
				(f) => f.protectionLevel === "Watched" || !f.protectionLevel,
			).length,
			warn: files.filter((f) => f.protectionLevel === "Warning").length,
			block: files.filter((f) => f.protectionLevel === "Protected").length,
		};
	}

	/**
	 * Backward compatibility: Set protection status (old API)
	 */
	public setProtectionStatus(
		status: "protected" | "atRisk" | "analyzing",
	): void {
		// Map old status to new design
		if (status === "protected" && this._registry) {
			// Update from registry to show accurate counts
			this.updateFromRegistry();
		} else {
			// Fallback for old statuses
			this.statusBarItem.text = "🧢 SnapBack";
			this.statusBarItem.show();
		}
	}

	/**
	 * Legacy method for backward compatibility
	 */
	static formatStatusBar(state: ProtectionState): string {
		// Use brand signage for legacy format
		return `${BRAND_SIGNAGE.shortLabel}: ${
			state.watched + state.warnings + state.protected
		} protected files (${state.watched} ${getProtectionLevelSignage("watch").emoji}, ${state.warnings} ${getProtectionLevelSignage("warn").emoji}, ${
			state.protected
		} ${getProtectionLevelSignage("block").emoji})`;
	}

	/**
	 * Legacy method for backward compatibility
	 */
	update(state: ProtectionState): void {
		if (!this._registry) {
			// If no registry, just show a simple status
			const total = state.watched + state.warnings + state.protected;
			if (total === 0) {
				this.updateIdle();
			} else {
				this.statusBarItem.text = `🧢 SnapBack │ ${state.watched}•${state.warnings}•${state.protected}`;
				this.statusBarItem.tooltip = this.getDetailedTooltipLegacy(state);
				this.statusBarItem.backgroundColor = this.getStatusColor(state);
				this.statusBarItem.show();
			}
		} else {
			// Use registry-based update
			this.updateFromRegistry();
		}
	}

	/**
	 * Legacy method for backward compatibility
	 */
	private getDetailedTooltipLegacy(state: ProtectionState): string {
		const lines = [
			`${BRAND_SIGNAGE.logoEmoji} ${BRAND_SIGNAGE.fullLabel}`,
			"",
			`${getProtectionLevelSignage("watch").emoji} ${state.watched} files watched`,
		];

		if (state.warnings > 0) {
			lines.push(
				`${getProtectionLevelSignage("warn").emoji} ${state.warnings} warnings (high-risk changes)`,
			);
		}

		if (state.protected > 0) {
			lines.push(
				`${getProtectionLevelSignage("block").emoji} ${state.protected} protected (requires approval)`,
			);
		}

		return lines.join("\n");
	}

	/**
	 * Legacy method for backward compatibility
	 */
	private getStatusColor(
		state: ProtectionState,
	): vscode.ThemeColor | undefined {
		if (state.protected > 0) {
			return new vscode.ThemeColor("statusBarItem.warningBackground");
		}
		if (state.warnings > 0) {
			return undefined;
		}
		return undefined;
	}

	/**
	 * Show the status bar item
	 */
	public show(): void {
		this.statusBarItem.show();
	}

	/**
	 * Hide the status bar item
	 */
	public hide(): void {
		this.statusBarItem.hide();
	}

	dispose(): void {
		if (this.pauseTimeout) {
			clearTimeout(this.pauseTimeout);
		}
		this.statusBarItem.dispose();
		for (const disposable of this.disposables) {
			disposable.dispose();
		}
	}
}
