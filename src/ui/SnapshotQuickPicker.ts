/**
 * SnapshotQuickPicker - Status bar click → Quick restore flow
 *
 * Replaces tree view with a minimal, keyboard-first restore experience.
 * Designed for "invisible until needed" UX philosophy.
 *
 * Flow:
 * 1. Status bar click → Show QuickPick with recent snapshots
 * 2. Select snapshot → Preview diff or restore directly
 * 3. Keyboard shortcut: Cmd+Shift+R for instant access
 *
 * @packageDocumentation
 */

import * as path from "node:path";
import { logger } from "@snapback/infrastructure";
import * as vscode from "vscode";
import type { IStorageManager, SnapshotManifest } from "../storage/types";

// =============================================================================
// TYPES
// =============================================================================

/**
 * QuickPick item for snapshot selection
 */
interface SnapshotQuickPickItem extends vscode.QuickPickItem {
	snapshotId?: string;
	timestamp?: number;
	trigger?: string;
	fileCount?: number;
	primaryFile?: string;
	action?: "restore" | "browse" | "dashboard" | "separator";
}

/**
 * Configuration for the QuickPicker
 */
export interface SnapshotQuickPickerConfig {
	/** Maximum recent snapshots to show */
	maxRecent: number;
	/** Show AI detection badges */
	showAIBadges: boolean;
}

const DEFAULT_CONFIG: SnapshotQuickPickerConfig = {
	maxRecent: 10,
	showAIBadges: true,
};

// =============================================================================
// MAIN CLASS
// =============================================================================

/**
 * SnapshotQuickPicker - Minimal restore UI via QuickPick
 *
 * Implements the "status bar → quick picker → restore" flow
 * as an alternative to the tree view.
 */
export class SnapshotQuickPicker implements vscode.Disposable {
	private config: SnapshotQuickPickerConfig;
	private disposables: vscode.Disposable[] = [];

	constructor(
		private readonly storageManager: IStorageManager,
		_workspaceRoot: string, // Reserved for future relative path display
		config?: Partial<SnapshotQuickPickerConfig>,
	) {
		this.config = { ...DEFAULT_CONFIG, ...config };
	}

	/**
	 * Show the main QuickPick for snapshot selection
	 *
	 * This is the primary entry point, triggered by:
	 * - Status bar click
	 * - Keyboard shortcut (Cmd+Shift+R)
	 * - Command palette
	 */
	async show(): Promise<void> {
		const quickPick = vscode.window.createQuickPick<SnapshotQuickPickItem>();
		quickPick.title = "$(shield) SnapBack";
		quickPick.placeholder = "Select a snapshot to restore, or browse history...";
		quickPick.matchOnDescription = true;
		quickPick.matchOnDetail = true;
		quickPick.busy = true;

		// Show immediately, populate async
		quickPick.show();

		try {
			const items = await this.buildQuickPickItems();
			quickPick.items = items;
			quickPick.busy = false;
		} catch (error) {
			logger.error("Failed to load snapshots for QuickPicker", error as Error);
			quickPick.items = [
				{
					label: "$(error) Failed to load snapshots",
					description: "Check the output panel for details",
				},
			];
			quickPick.busy = false;
		}

		// Handle selection
		quickPick.onDidAccept(async () => {
			const selected = quickPick.selectedItems[0];
			quickPick.hide();

			if (!selected) {
				return;
			}

			await this.handleSelection(selected);
		});

		// Handle hide
		quickPick.onDidHide(() => {
			quickPick.dispose();
		});
	}

	/**
	 * Build QuickPick items with recent snapshots and actions
	 */
	private async buildQuickPickItems(): Promise<SnapshotQuickPickItem[]> {
		const items: SnapshotQuickPickItem[] = [];
		const snapshots = await this.loadRecentSnapshots();

		// Header: Recent snapshots
		if (snapshots.length > 0) {
			items.push({
				label: "Recent Snapshots",
				kind: vscode.QuickPickItemKind.Separator,
			});

			// Add snapshot items
			for (const snapshot of snapshots) {
				items.push(this.createSnapshotItem(snapshot));
			}
		} else {
			items.push({
				label: "$(info) No snapshots yet",
				description: "Snapshots are created automatically when you save protected files",
			});
		}

		// Actions section
		items.push({
			label: "Actions",
			kind: vscode.QuickPickItemKind.Separator,
		});

		items.push({
			label: "$(folder) Browse full history...",
			description: "View all snapshots grouped by session",
			action: "browse",
		});

		items.push({
			label: "$(dashboard) Open Dashboard",
			description: "Full snapshot management in browser",
			action: "dashboard",
		});

		return items;
	}

	/**
	 * Load recent snapshots from storage
	 */
	private async loadRecentSnapshots(): Promise<SnapshotManifest[]> {
		try {
			const manifests = await this.storageManager.listSnapshots({
				limit: this.config.maxRecent,
			});

			// Sort by timestamp (newest first)
			return manifests.sort((a, b) => b.timestamp - a.timestamp);
		} catch (error) {
			logger.error("Failed to load snapshots", error as Error);
			return [];
		}
	}

	/**
	 * Create a QuickPick item for a snapshot
	 */
	private createSnapshotItem(manifest: SnapshotManifest): SnapshotQuickPickItem {
		const icon = this.getSnapshotIcon(manifest.trigger);
		const fileName = this.getPrimaryFileName(manifest);
		const timeAgo = this.formatRelativeTime(manifest.timestamp);
		const fileCount = Object.keys(manifest.files).length;

		// Build label with optional AI badge
		let label = `${icon} ${manifest.name || fileName}`;
		if (this.config.showAIBadges && manifest.trigger === "ai-detected") {
			label = `$(sparkle) ${manifest.name || fileName}`;
		}

		return {
			label,
			description: timeAgo,
			detail: fileCount > 1 ? `${fileCount} files • ${fileName}` : fileName,
			snapshotId: manifest.id,
			timestamp: manifest.timestamp,
			trigger: manifest.trigger,
			fileCount,
			primaryFile: this.getPrimaryFilePath(manifest),
			action: "restore",
		};
	}

	/**
	 * Handle QuickPick item selection
	 */
	private async handleSelection(item: SnapshotQuickPickItem): Promise<void> {
		switch (item.action) {
			case "restore":
				if (item.snapshotId) {
					await this.showRestoreOptions(item);
				}
				break;

			case "browse":
				await this.showFullHistory();
				break;

			case "dashboard":
				try {
					// Try new Dashboard first, fallback to vitals
					await vscode.commands.executeCommand("snapback.openDashboard");
				} catch {
					// Fallback to vitals dashboard if new one not available
					try {
						await vscode.commands.executeCommand("snapback.openVitalsDashboard");
					} catch (error) {
						logger.error("Failed to open dashboard", error as Error);
						vscode.window.showErrorMessage(
							`Failed to open dashboard: ${error instanceof Error ? error.message : "unknown error"}`,
						);
					}
				}
				break;
		}
	}

	/**
	 * Show restore options for a selected snapshot
	 */
	private async showRestoreOptions(snapshot: SnapshotQuickPickItem): Promise<void> {
		const quickPick = vscode.window.createQuickPick<SnapshotQuickPickItem>();
		quickPick.title = `$(history) Restore: ${snapshot.label}`;
		quickPick.placeholder = "Choose restore action...";

		if (!snapshot.snapshotId) {
			vscode.window.showErrorMessage("Invalid snapshot ID");
			return;
		}

		const manifest = await this.storageManager.getSnapshotManifest(snapshot.snapshotId);
		if (!manifest) {
			vscode.window.showErrorMessage("Snapshot not found");
			return;
		}

		const fileCount = Object.keys(manifest.files).length;
		const items: SnapshotQuickPickItem[] = [];

		// Single file: show diff directly
		if (fileCount === 1) {
			items.push({
				label: "$(diff) Compare with current",
				description: "View side-by-side diff before restoring",
				action: "restore",
				snapshotId: snapshot.snapshotId,
			});

			items.push({
				label: "$(debug-step-back) Restore file",
				description: "Replace current file with snapshot version",
				action: "restore",
				snapshotId: snapshot.snapshotId,
			});
		} else {
			// Multiple files: offer selective restore
			items.push({
				label: "$(diff) Preview all changes",
				description: `Compare ${fileCount} files with current versions`,
				action: "restore",
				snapshotId: snapshot.snapshotId,
			});

			items.push({
				label: "$(checklist) Select files to restore...",
				description: "Choose which files to restore",
				action: "restore",
				snapshotId: snapshot.snapshotId,
			});

			items.push({
				label: "$(debug-step-back) Restore all files",
				description: `Replace all ${fileCount} files with snapshot versions`,
				action: "restore",
				snapshotId: snapshot.snapshotId,
			});
		}

		quickPick.items = items;
		quickPick.show();

		quickPick.onDidAccept(async () => {
			const selected = quickPick.selectedItems[0];
			quickPick.hide();

			if (selected?.snapshotId) {
				// Delegate to existing restore command
				await vscode.commands.executeCommand("snapback.restoreSnapshot", selected.snapshotId);
			}
		});

		quickPick.onDidHide(() => {
			quickPick.dispose();
		});
	}

	/**
	 * Show full history browser (grouped by session/time)
	 */
	private async showFullHistory(): Promise<void> {
		const quickPick = vscode.window.createQuickPick<SnapshotQuickPickItem>();
		quickPick.title = "$(folder) Browse Snapshot History";
		quickPick.placeholder = "Search snapshots...";
		quickPick.matchOnDescription = true;
		quickPick.matchOnDetail = true;
		quickPick.busy = true;
		quickPick.show();

		try {
			// Load all snapshots (up to 100)
			const manifests = await this.storageManager.listSnapshots({ limit: 100 });
			const grouped = this.groupByTime(manifests);

			const items: SnapshotQuickPickItem[] = [];

			for (const [group, snapshots] of Object.entries(grouped)) {
				if (snapshots.length === 0) {
					continue;
				}

				items.push({
					label: group,
					kind: vscode.QuickPickItemKind.Separator,
				});

				for (const snapshot of snapshots) {
					items.push(this.createSnapshotItem(snapshot));
				}
			}

			quickPick.items = items;
			quickPick.busy = false;
		} catch (error) {
			logger.error("Failed to load snapshot history", error as Error);
			quickPick.items = [{ label: "$(error) Failed to load history" }];
			quickPick.busy = false;
		}

		quickPick.onDidAccept(async () => {
			const selected = quickPick.selectedItems[0];
			quickPick.hide();

			if (selected?.snapshotId) {
				await this.showRestoreOptions(selected);
			}
		});

		quickPick.onDidHide(() => {
			quickPick.dispose();
		});
	}

	/**
	 * Group snapshots by time period
	 */
	private groupByTime(manifests: SnapshotManifest[]): Record<string, SnapshotManifest[]> {
		const today = new Date().setHours(0, 0, 0, 0);
		const yesterday = today - 24 * 60 * 60 * 1000;
		const weekAgo = today - 7 * 24 * 60 * 60 * 1000;

		const groups: Record<string, SnapshotManifest[]> = {
			Today: [],
			Yesterday: [],
			"This Week": [],
			Older: [],
		};

		for (const manifest of manifests) {
			if (manifest.timestamp >= today) {
				groups.Today.push(manifest);
			} else if (manifest.timestamp >= yesterday) {
				groups.Yesterday.push(manifest);
			} else if (manifest.timestamp >= weekAgo) {
				groups["This Week"].push(manifest);
			} else {
				groups.Older.push(manifest);
			}
		}

		// Sort each group by timestamp (newest first)
		for (const group of Object.values(groups)) {
			group.sort((a, b) => b.timestamp - a.timestamp);
		}

		return groups;
	}

	// =============================================================================
	// HELPERS
	// =============================================================================

	private getSnapshotIcon(trigger?: string): string {
		switch (trigger) {
			case "ai-detected":
				return "$(sparkle)";
			case "manual":
				return "$(save)";
			case "pre-save":
				return "$(arrow-up)";
			default:
				return "$(history)";
		}
	}

	private getPrimaryFileName(manifest: SnapshotManifest): string {
		const files = Object.keys(manifest.files);
		if (files.length === 0) {
			return "unknown";
		}
		return path.basename(files[0]);
	}

	private getPrimaryFilePath(manifest: SnapshotManifest): string {
		const files = Object.keys(manifest.files);
		if (files.length === 0) {
			return "";
		}
		return files[0];
	}

	private formatRelativeTime(timestamp: number): string {
		const diff = Date.now() - timestamp;
		const minutes = Math.floor(diff / 60000);
		const hours = Math.floor(diff / 3600000);
		const days = Math.floor(diff / 86400000);

		if (minutes < 1) {
			return "just now";
		}
		if (minutes < 60) {
			return `${minutes}m ago`;
		}
		if (hours < 24) {
			return `${hours}h ago`;
		}
		if (days === 1) {
			return "yesterday";
		}
		return `${days}d ago`;
	}

	dispose(): void {
		for (const d of this.disposables) {
			d.dispose();
		}
	}
}

// =============================================================================
// COMMAND REGISTRATION
// =============================================================================

/**
 * Register SnapshotQuickPicker commands
 */
export function registerSnapshotQuickPickerCommands(
	_context: vscode.ExtensionContext,
	storageManager: IStorageManager,
	workspaceRoot: string,
): vscode.Disposable[] {
	const picker = new SnapshotQuickPicker(storageManager, workspaceRoot);
	const disposables: vscode.Disposable[] = [picker];

	// Main command: Show QuickPicker (status bar click)
	disposables.push(
		vscode.commands.registerCommand("snapback.showQuickPicker", async () => {
			await picker.show();
		}),
	);

	// Keyboard shortcut command: Quick restore
	disposables.push(
		vscode.commands.registerCommand("snapback.quickRestore", async () => {
			await picker.show();
		}),
	);

	return disposables;
}
