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

import * as vscode from "vscode";
import { MCPStorageReader } from "../storage/bridge/MCPStorageReader";
import { type ExtensionStorageAdapter, SnapshotBridge } from "../storage/bridge/SnapshotBridge";
import type { UnifiedSnapshot } from "../storage/bridge/UnifiedSnapshot";
import { fromLegacyManifest } from "../storage/bridge/UnifiedSnapshot";
import type { IStorageManager } from "../storage/types";
import { logger } from "../utils/logger";
import { formatRelativeTime, getFileTypeIcon } from "./snapshot-display/formatting";

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
 *
 * Uses SnapshotBridge to show snapshots from BOTH:
 * - Extension storage (SQLite)
 * - MCP storage (.snapback/ directory)
 */
export class SnapshotQuickPicker implements vscode.Disposable {
	private config: SnapshotQuickPickerConfig;
	private disposables: vscode.Disposable[] = [];
	private readonly bridge: SnapshotBridge;

	constructor(
		private readonly storageManager: IStorageManager,
		workspaceRoot: string,
		config?: Partial<SnapshotQuickPickerConfig>,
	) {
		this.config = { ...DEFAULT_CONFIG, ...config };

		// Create adapter that wraps IStorageManager for the bridge
		const extensionAdapter: ExtensionStorageAdapter = {
			listSnapshots: async (): Promise<UnifiedSnapshot[]> => {
				const manifests = await this.storageManager.listSnapshots({});
				// Convert legacy SnapshotManifest to UnifiedSnapshot
				return manifests.map((m) => fromLegacyManifest(m));
			},
		};

		// Create MCP reader for .snapback/ directory
		const mcpReader = new MCPStorageReader(workspaceRoot);

		// Create bridge that merges both sources
		this.bridge = new SnapshotBridge(extensionAdapter, mcpReader);
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
		quickPick.title = "🧢 SnapBack";
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
					label: "❌ Failed to load snapshots",
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
				label: "ℹ️ No snapshots yet",
				description: "Snapshots are created automatically when you save protected files",
			});
		}

		// Actions section
		items.push({
			label: "Actions",
			kind: vscode.QuickPickItemKind.Separator,
		});

		items.push({
			label: "📁 Browse full history...",
			description: "View all snapshots grouped by session",
			action: "browse",
		});

		items.push({
			label: "📊 Open Dashboard",
			description: "Full snapshot management in browser",
			action: "dashboard",
		});

		return items;
	}

	/**
	 * Load recent snapshots from both extension and MCP storage via bridge
	 */
	private async loadRecentSnapshots(): Promise<UnifiedSnapshot[]> {
		try {
			// Bridge already merges and sorts by timestamp (newest first)
			const allSnapshots = await this.bridge.listAll();

			// Apply limit
			return allSnapshots.slice(0, this.config.maxRecent);
		} catch (error) {
			logger.error("Failed to load snapshots", error as Error);
			return [];
		}
	}

	/**
	 * Create a QuickPick item for a snapshot
	 *
	 * Uses shared formatting utilities for consistent display:
	 * - Emoji icons based on file type (e.g., ⚙️ for config, 📦 for package.json)
	 * - Source badge: 🔌 MCP, 📦 Extension
	 * - Relative time: "5m ago" format
	 */
	private createSnapshotItem(snapshot: UnifiedSnapshot): SnapshotQuickPickItem {
		// Get primary file from the snapshot
		const primaryFile = snapshot.files[0]?.path ?? "";
		const icon = primaryFile ? getFileTypeIcon(primaryFile) : "📄";

		// Format file display: "api.ts (+2)" if multiple files
		const fileName = primaryFile ? primaryFile.split("/").pop() : snapshot.name;
		const fileCount = snapshot.files.length;
		const fileDisplay = fileCount > 1 ? `${fileName} (+${fileCount - 1})` : fileName;

		const timeAgo = formatRelativeTime(snapshot.timestamp);

		// Source indicator: show if from MCP
		const sourceLabel = snapshot.source === "mcp" ? " 🔌" : "";

		return {
			label: `${icon}  ${fileDisplay}${sourceLabel}`,
			description: timeAgo,
			detail: fileCount > 1 ? `${fileCount} files • ${snapshot.name}` : snapshot.name,
			snapshotId: snapshot.id,
			timestamp: snapshot.timestamp,
			trigger: snapshot.trigger,
			fileCount,
			primaryFile,
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
		quickPick.title = `📜 Restore: ${snapshot.label}`;
		quickPick.placeholder = "Choose restore action...";

		if (!snapshot.snapshotId) {
			vscode.window.showErrorMessage("Invalid snapshot ID");
			return;
		}

		// Use the bridge to get snapshot from either storage
		const unifiedSnapshot = await this.bridge.getById(snapshot.snapshotId);
		if (!unifiedSnapshot) {
			vscode.window.showErrorMessage("Snapshot not found");
			return;
		}

		const fileCount = unifiedSnapshot.files.length;
		const items: SnapshotQuickPickItem[] = [];

		// Single file: show diff directly
		if (fileCount === 1) {
			items.push({
				label: "🔀 Compare with current",
				description: "View side-by-side diff before restoring",
				action: "restore",
				snapshotId: snapshot.snapshotId,
			});

			items.push({
				label: "↩️ Restore file",
				description: "Replace current file with snapshot version",
				action: "restore",
				snapshotId: snapshot.snapshotId,
			});
		} else {
			// Multiple files: offer selective restore
			items.push({
				label: "🔀 Preview all changes",
				description: `Compare ${fileCount} files with current versions`,
				action: "restore",
				snapshotId: snapshot.snapshotId,
			});

			items.push({
				label: "☑️ Select files to restore...",
				description: "Choose which files to restore",
				action: "restore",
				snapshotId: snapshot.snapshotId,
			});

			items.push({
				label: "↩️ Restore all files",
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
		quickPick.title = "📁 Browse Snapshot History";
		quickPick.placeholder = "Search snapshots...";
		quickPick.matchOnDescription = true;
		quickPick.matchOnDetail = true;
		quickPick.busy = true;
		quickPick.show();

		try {
			// Load all snapshots from both sources (up to 100)
			const allSnapshots = await this.bridge.listAll();
			const snapshots = allSnapshots.slice(0, 100);
			const grouped = this.groupByTime(snapshots);

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
			quickPick.items = [{ label: "❌ Failed to load history" }];
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
	private groupByTime(snapshots: UnifiedSnapshot[]): Record<string, UnifiedSnapshot[]> {
		const today = new Date().setHours(0, 0, 0, 0);
		const yesterday = today - 24 * 60 * 60 * 1000;
		const weekAgo = today - 7 * 24 * 60 * 60 * 1000;

		const groups: Record<string, UnifiedSnapshot[]> = {
			Today: [],
			Yesterday: [],
			"This Week": [],
			Older: [],
		};

		for (const snapshot of snapshots) {
			if (snapshot.timestamp >= today) {
				groups.Today.push(snapshot);
			} else if (snapshot.timestamp >= yesterday) {
				groups.Yesterday.push(snapshot);
			} else if (snapshot.timestamp >= weekAgo) {
				groups["This Week"].push(snapshot);
			} else {
				groups.Older.push(snapshot);
			}
		}

		// Sort each group by timestamp (newest first)
		for (const group of Object.values(groups)) {
			group.sort((a, b) => b.timestamp - a.timestamp);
		}

		return groups;
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
