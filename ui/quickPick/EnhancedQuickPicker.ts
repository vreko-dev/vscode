/**
 * @fileoverview EnhancedQuickPicker - Phase 1.3 Implementation
 *
 * Enhances SnapshotQuickPicker with:
 * - ISessionStatsProvider integration (session progress display)
 * - Recovery actions (quick recovery, timeline, compare)
 * - Compact mode support
 *
 * @packageDocumentation
 */

import * as vscode from "vscode";
import type { ISessionStatsProvider, SessionStats } from "../../services/recovery/interfaces";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Enhanced QuickPick item with recovery actions
 */
export interface EnhancedQuickPickItem extends vscode.QuickPickItem {
	action?:
		| "quick-recovery"
		| "open-timeline"
		| "compare-recent"
		| "separator"
		| "restore"
		| "browse"
		| "dashboard"
		| "protection";
	snapshotId?: string;
	timestamp?: number;
}

/**
 * Configuration for EnhancedQuickPicker
 */
export interface EnhancedQuickPickerConfig {
	/** Session stats provider */
	statsProvider: ISessionStatsProvider;
	/** Compact mode (no stats header) */
	compact?: boolean;
	/** Telemetry tracker */
	telemetry?: {
		track: (event: string, properties?: Record<string, unknown>) => void;
	};
}

// =============================================================================
// DURATION FORMATTING
// =============================================================================

/**
 * Format session duration in compact format.
 *
 * @param durationMs - Duration in milliseconds
 * @returns Compact string like "2h", "1h 5m", "< 1m"
 *
 * @example
 * ```typescript
 * formatSessionDuration(7200000) // "2h"
 * formatSessionDuration(3900000) // "1h 5m"
 * formatSessionDuration(45000)   // "< 1m"
 * ```
 */
export function formatSessionDuration(durationMs: number): string {
	if (durationMs < 60000) {
		return "< 1m";
	}

	const hours = Math.floor(durationMs / 3600000);
	const minutes = Math.floor((durationMs % 3600000) / 60000);

	if (hours > 0 && minutes > 0) {
		return `${hours}h ${minutes}m`;
	}
	if (hours > 0) {
		return `${hours}h`;
	}
	return `${minutes}m`;
}

// =============================================================================
// ENHANCED QUICK PICKER
// =============================================================================

/**
 * EnhancedQuickPicker - QuickPicker with session stats and recovery actions
 *
 * Implements Phase 1.3 requirements:
 * - Session stats header (duration, snapshots, files)
 * - Recovery actions (quick recovery, timeline, compare)
 * - Compact mode support
 * - Telemetry tracking
 */
export class EnhancedQuickPicker implements vscode.Disposable {
	private disposables: vscode.Disposable[] = [];
	private statsSubscription: vscode.Disposable | null = null;

	constructor(private readonly config: EnhancedQuickPickerConfig) {
		// Subscribe to stats changes
		this.statsSubscription = this.config.statsProvider.onStatsChanged(async () => {
			await this.refreshStats();
		});
	}

	/**
	 * Show the enhanced QuickPicker
	 */
	async show(): Promise<void> {
		const quickPick = vscode.window.createQuickPick<EnhancedQuickPickItem>();
		quickPick.title = "🦎 Vreko Recovery";
		quickPick.placeholder = "Select a recovery action or recent snapshot...";
		quickPick.matchOnDescription = true;
		quickPick.matchOnDetail = true;
		quickPick.busy = true;

		quickPick.show();

		// Load items
		try {
			const items = await this.buildItems();
			quickPick.items = items;
			quickPick.busy = false;

			// Track telemetry
			if (this.config.telemetry) {
				const stats = await this.config.statsProvider.getStats();
				this.config.telemetry.track("quick_actions_shown", {
					snapshot_count: stats.snapshotCount,
					files_modified: stats.filesModified,
					duration_ms: stats.duration,
				});
			}
		} catch (_error) {
			quickPick.items = [
				{
					label: "❌ Failed to load recovery actions",
					description: "Check output panel for details",
				},
			];
			quickPick.busy = false;
		}

		// Handle selection
		quickPick.onDidAccept(async () => {
			const selected = quickPick.selectedItems[0];
			quickPick.hide();

			if (selected?.action) {
				await this.handleAction(selected.action);
			}
		});

		quickPick.onDidHide(() => {
			quickPick.dispose();
		});

		this.disposables.push(quickPick);
	}

	/**
	 * Build QuickPick items with stats header and recovery actions
	 */
	async buildItems(): Promise<EnhancedQuickPickItem[]> {
		const items: EnhancedQuickPickItem[] = [];
		const stats = await this.config.statsProvider.getStats();

		// Session stats header (unless compact mode)
		if (!this.config.compact) {
			items.push({
				label: "📊 Session Stats",
				description: this.formatStatsDescription(stats),
				kind: vscode.QuickPickItemKind.Separator,
			});
		}

		// Recovery actions section
		items.push({
			label: "Recovery",
			kind: vscode.QuickPickItemKind.Separator,
		});

		if (this.config.compact) {
			// Compact mode: only essential actions
			items.push({
				label: "↩️ Quick Recovery",
				description: "Restore recent changes",
				action: "quick-recovery",
			});

			items.push({
				label: "📜 Timeline",
				description: "Browse recovery timeline",
				action: "open-timeline",
			});
		} else {
			// Full mode: all recovery actions
			items.push({
				label: "↩️ Quick Recovery",
				description: "Restore most recent snapshot",
				action: "quick-recovery",
			});

			items.push({
				label: "📜 Open Recovery Timeline",
				description: "Browse full recovery history",
				action: "open-timeline",
			});

			items.push({
				label: "🔀 Compare Recent Changes",
				description: "View side-by-side diffs",
				action: "compare-recent",
			});
		}

		return items;
	}

	/**
	 * Format session stats description
	 */
	private formatStatsDescription(stats: SessionStats): string {
		const duration = formatSessionDuration(stats.duration);
		const snapshots = stats.snapshotCount === 1 ? "1 snapshot" : `${stats.snapshotCount} snapshots`;
		const files = `${stats.filesModified} files`;

		return `${duration} • ${snapshots} • ${files}`;
	}

	/**
	 * Handle action selection
	 */
	async handleAction(action: string): Promise<void> {
		// Track telemetry
		if (this.config.telemetry) {
			this.config.telemetry.track("recovery_action_selected", {
				action,
			});
		}

		// Execute command based on action
		switch (action) {
			case "quick-recovery":
				await vscode.commands.executeCommand("vreko.showQuickActions");
				break;

			case "open-timeline":
				await vscode.commands.executeCommand("vreko.openRecoveryTimeline");
				break;

			case "compare-recent":
				await vscode.commands.executeCommand("vreko.showRecentChanges");
				break;
		}
	}

	/**
	 * Refresh stats (called when stats change)
	 */
	async refreshStats(): Promise<void> {
		// Rebuild items with new stats
		await this.buildItems();
	}

	/**
	 * Dispose resources
	 */
	dispose(): void {
		if (this.statsSubscription) {
			this.statsSubscription.dispose();
			this.statsSubscription = null;
		}

		for (const disposable of this.disposables) {
			disposable.dispose();
		}
		this.disposables = [];
	}
}
