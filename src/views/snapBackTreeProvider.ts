/**
 * SnapBack TreeView Provider - Redesigned UX/IA
 *
 * Philosophy:
 * - Lead with value, not status ("232 files protected" not "Protection Status: Active")
 * - No news is good news (removed "All good!" placeholders)
 * - Hide empty states (only show groups with content)
 * - Snapshots are the product (make them prominent)
 * - Respect attention (minimal root items, problems only when needed)
 */

import * as path from "node:path";
import { logger } from "@snapback/infrastructure";
import * as vscode from "vscode";
import { COMMANDS } from "../constants/commands";
import { SNAPBACK_ICONS } from "../constants/icons";
import type { IStorageManager, SnapshotManifest } from "../storage/types";
import { createTreeItemBadgeProvider, type TreeItemBadgeProvider } from "../utils/treeItemBadgeProvider";
import { TimeGroupingStrategy } from "./grouping/TimeGroupingStrategy";
import type { GroupingMode, ProblemItem, SnapshotDisplayItem, TimeGroup, TreeViewConfig } from "./types";
import { DEFAULT_TREE_CONFIG } from "./types";

// ============================================
// MINIMAL SERVICE INTERFACES
// ============================================

/**
 * Minimal config manager interface
 */
interface IConfigManager {
	getProtectionCounts(): Promise<{
		block: number;
		warn: number;
		watch: number;
	}>;
}

// ============================================
// TREE ITEM TYPES
// ============================================

type TreeItemType =
	| "header"
	| "header-detail"
	| "activity-header"
	| "time-group"
	| "snapshot"
	| "snapshot-file"
	| "more-snapshots"
	| "problems-header"
	| "problem"
	| "cloud-cta"
	| "cloud-status";

interface SnapBackTreeItemData {
	type: TreeItemType;
	id?: string;
	groupKey?: string;
	count?: number;
	filePath?: string;
}

class SnapBackTreeItem extends vscode.TreeItem {
	constructor(
		label: string,
		public readonly data: SnapBackTreeItemData,
		collapsibleState?: vscode.TreeItemCollapsibleState,
	) {
		super(label, collapsibleState);
	}
}

// ============================================
// PROVIDER
// ============================================

export class SnapBackTreeProvider implements vscode.TreeDataProvider<SnapBackTreeItem>, vscode.Disposable {
	private _onDidChangeTreeData = new vscode.EventEmitter<SnapBackTreeItem | undefined>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	private problems: ProblemItem[] = [];
	private config: TreeViewConfig;
	private cachedSnapshots: SnapshotDisplayItem[] = [];
	private readonly badgeProvider: TreeItemBadgeProvider;

	constructor(
		_context: vscode.ExtensionContext,
		private storageManager: IStorageManager,
		private configManager: IConfigManager,
	) {
		this.config = { ...DEFAULT_TREE_CONFIG };

		// Initialize badge provider with auto-refresh callback
		this.badgeProvider = createTreeItemBadgeProvider({
			onRefreshNeeded: () => this.refresh(),
		});

		// NOTE: VS Code automatically persists expansion state via stable TreeItem.id
		// No manual globalState tracking needed
	}

	/**
	 * Dispose resources (badge provider timers)
	 */
	dispose(): void {
		this.badgeProvider.dispose();
		this._onDidChangeTreeData.dispose();
	}

	// ============================================
	// PUBLIC API
	// ============================================

	refresh(): void {
		logger.debug("TreeView refresh triggered", {
			groupingMode: this.config.groupBy,
			cachedSnapshotCount: this.cachedSnapshots.length,
			problemCount: this.problems.length,
		});
		this._onDidChangeTreeData.fire(undefined);
	}

	/**
	 * Set problems to display in TreeView
	 * Problems section only shown when problems exist ("No news is good news" principle)
	 * @param problems Array of problem items to display
	 */
	setProblems(problems: ProblemItem[]): void {
		this.problems = problems;
		this.refresh();
	}

	/**
	 * Change grouping mode (time/system/file)
	 * Currently only 'time' is fully implemented
	 * @param mode Grouping mode to use
	 */
	setGroupingMode(mode: GroupingMode): void {
		if (mode !== "time") {
			vscode.window.showInformationMessage(`${mode} grouping coming soon! Using time grouping for now.`);
			return;
		}
		this.config.groupBy = mode;
		this.refresh();
	}

	/**
	 * Get current grouping mode
	 * @returns Current grouping mode
	 */
	getGroupingMode(): GroupingMode {
		return this.config.groupBy;
	}

	// ============================================
	// TREE DATA PROVIDER IMPLEMENTATION
	// ============================================

	getTreeItem(element: SnapBackTreeItem): vscode.TreeItem {
		return element;
	}

	async getChildren(element?: SnapBackTreeItem): Promise<SnapBackTreeItem[]> {
		if (!element) {
			return this.getRootItems();
		}

		switch (element.data.type) {
			case "header":
				return this.getProtectionBreakdown();
			case "time-group":
				return this.getSnapshotsForTimeGroup(element.data.groupKey as TimeGroup);
			case "snapshot":
				return this.getSnapshotFiles(element.data.id!);
			case "activity-header":
				return this.getActivityTimeGroups();
			case "problems-header":
				return this.getProblemItems();
			default:
				return [];
		}
	}

	// ============================================
	// ROOT LEVEL
	// ============================================

	private async getRootItems(): Promise<SnapBackTreeItem[]> {
		const items: SnapBackTreeItem[] = [];

		try {
			// 1. HEADER - Always show (the confidence builder)
			items.push(await this.createHeader());

			// 2. PROBLEMS - Only if there are problems (respect attention)
			if (this.problems.length > 0) {
				items.push(this.createProblemsSection());
			}

			// 3. SNAPSHOT GROUPS - Based on current grouping mode
			const snapshotGroups = await this.createSnapshotGroups();
			items.push(...snapshotGroups);

			// 4. CLOUD - Connection status
			items.push(this.createCloudSection());
		} catch (error) {
			logger.error("Error loading SnapBack tree", error as Error);
			items.push(this.createErrorItem());
		}

		return items;
	}

	// ============================================
	// HEADER (Protected Files Count)
	// ============================================

	private async createHeader(): Promise<SnapBackTreeItem> {
		const totalProtected = await this.getTotalProtectedCount();

		const item = new SnapBackTreeItem(
			`${SNAPBACK_ICONS.SHIELD} ${totalProtected} files protected`,
			{ type: "header" },
			vscode.TreeItemCollapsibleState.Collapsed,
		);

		// Stable ID for automatic expansion persistence by VS Code
		item.id = "snapback:root:header";
		item.tooltip = "Click to see protection breakdown";
		item.contextValue = "header";

		return item;
	}

	private async getProtectionBreakdown(): Promise<SnapBackTreeItem[]> {
		try {
			const counts = await this.configManager.getProtectionCounts();
			const items: SnapBackTreeItem[] = [];

			// Only show non-zero counts (hide empty states)
			if (counts.block > 0) {
				items.push(this.createDetailItem("Block", counts.block, SNAPBACK_ICONS.BLOCK));
			}
			if (counts.warn > 0) {
				items.push(this.createDetailItem("Warn", counts.warn, SNAPBACK_ICONS.WARN));
			}
			if (counts.watch > 0) {
				items.push(this.createDetailItem("Watch", counts.watch, SNAPBACK_ICONS.WATCH));
			}

			return items;
		} catch (error) {
			logger.error("Error getting protection breakdown", error as Error);
			return [];
		}
	}

	private createDetailItem(level: string, count: number, icon: string): SnapBackTreeItem {
		const item = new SnapBackTreeItem(
			`${icon} ${level}: ${count}`,
			{ type: "header-detail", count },
			vscode.TreeItemCollapsibleState.None,
		);
		item.command = {
			command: COMMANDS.PROTECTION.SHOW_ALL,
			title: `Show ${level} files`,
			arguments: [level.toLowerCase()],
		};
		return item;
	}

	private async getTotalProtectedCount(): Promise<number> {
		try {
			const counts = await this.configManager.getProtectionCounts();
			return counts.block + counts.warn + counts.watch;
		} catch (error) {
			logger.error("Error getting total protected count", error as Error);
			return 0;
		}
	}

	// ============================================
	// SNAPSHOT GROUPS (Strategy Pattern)
	// ============================================

	/**
	 * Create the unified ACTIVITY section with snapshot count
	 *
	 * NOTE: VS Code automatically persists expansion state via stable TreeItem.id.
	 * Default to expanded for first-time visibility.
	 */
	private async createSnapshotGroups(): Promise<SnapBackTreeItem[]> {
		try {
			// Load snapshots
			await this.loadSnapshots();

			// Only show ACTIVITY section if there are snapshots
			if (this.cachedSnapshots.length === 0) {
				return [];
			}

			// Create unified ACTIVITY header
			// Default to Expanded - VS Code will remember user's preference via stable ID
			const activityItem = new SnapBackTreeItem(
				`ACTIVITY (${this.cachedSnapshots.length})`,
				{ type: "activity-header", count: this.cachedSnapshots.length },
				vscode.TreeItemCollapsibleState.Expanded,
			);
			// Stable ID for automatic expansion persistence by VS Code
			activityItem.id = "snapback:activity:header";
			activityItem.contextValue = "activityHeader";

			return [activityItem];
		} catch (error) {
			logger.error("Error creating snapshot groups", error as Error);
			return [];
		}
	}

	private async loadSnapshots(): Promise<void> {
		const startTime = Date.now();
		try {
			const manifests = await this.storageManager.listSnapshots({ limit: 100 });
			this.cachedSnapshots = manifests.map((m) => this.toDisplayItem(m));

			// Count NEW badges for telemetry
			const newBadgeCount = this.cachedSnapshots.filter(
				(s) => this.badgeProvider.getBadge(s.timestamp.getTime())?.type === "new",
			).length;

			logger.debug("Snapshots loaded for TreeView", {
				count: this.cachedSnapshots.length,
				newBadgeCount,
				hasAI: this.cachedSnapshots.some((s) => s.trigger === "ai-detected"),
				hasManual: this.cachedSnapshots.some((s) => s.trigger === "manual"),
				duration: Date.now() - startTime,
			});
		} catch (error) {
			logger.error("Error loading snapshots", error as Error);
			this.cachedSnapshots = [];
		}
	}

	// ============================================
	// TIME GROUPING (Removed - replaced by getActivityTimeGroups)
	// ============================================

	private async getSnapshotsForTimeGroup(groupKey: TimeGroup): Promise<SnapBackTreeItem[]> {
		const strategy = new TimeGroupingStrategy();
		const grouped = strategy.group(this.cachedSnapshots);

		const snapshots = grouped[groupKey === "this-week" ? "thisWeek" : groupKey];
		return this.createSnapshotItems(snapshots);
	}

	/**
	 * Get files for a specific snapshot
	 * Called when user expands a snapshot node
	 */
	private async getSnapshotFiles(snapshotId: string): Promise<SnapBackTreeItem[]> {
		try {
			const manifest = await this.storageManager.getSnapshotManifest(snapshotId);
			if (!manifest) return [];

			return Object.keys(manifest.files).map((filePath) => {
				const fileName = path.basename(filePath);
				const dirName = path.dirname(filePath);

				const item = new SnapBackTreeItem(
					fileName,
					{ type: "snapshot-file", id: snapshotId, filePath },
					vscode.TreeItemCollapsibleState.None,
				);

				// Stable ID for automatic expansion persistence by VS Code
				item.id = `snapback:activity:file:${snapshotId}:${filePath}`;
				// Use iconPath for file icons (codicon syntax doesn't work in labels)
				item.iconPath = this.getFileIcon(filePath);
				// Show directory path only if not root
				item.description = dirName === "." ? "" : dirName;
				item.tooltip = `Click to compare with current file\n${filePath}`;
				item.contextValue = "activityFile";
				item.command = {
					command: "snapback.snapshot.showFileDiff",
					title: "Compare with Current",
					arguments: [snapshotId, filePath],
				};

				return item;
			});
		} catch (error) {
			logger.error("Error loading snapshot files", error as Error);
			return [];
		}
	}

	/**
	 * Get appropriate file icon based on extension
	 */
	private getFileIcon(filePath: string): vscode.ThemeIcon {
		const ext = path.extname(filePath).toLowerCase();
		switch (ext) {
			case ".ts":
			case ".tsx":
			case ".js":
			case ".jsx":
			case ".mjs":
			case ".cjs":
				return new vscode.ThemeIcon("file-code");
			case ".json":
				return new vscode.ThemeIcon("json");
			case ".md":
				return new vscode.ThemeIcon("markdown");
			case ".css":
			case ".scss":
			case ".less":
				return new vscode.ThemeIcon("file-code");
			case ".html":
			case ".htm":
				return new vscode.ThemeIcon("file-code");
			case ".yml":
			case ".yaml":
				return new vscode.ThemeIcon("file-code");
			case ".env":
				return new vscode.ThemeIcon("key");
			case ".png":
			case ".jpg":
			case ".jpeg":
			case ".gif":
			case ".svg":
				return new vscode.ThemeIcon("file-media");
			default:
				return new vscode.ThemeIcon("file");
		}
	}

	// ============================================
	// SNAPSHOT ITEMS
	// ============================================

	private createSnapshotItems(snapshots: SnapshotDisplayItem[]): SnapBackTreeItem[] {
		const maxVisible = this.config.maxPerGroup;
		const items = snapshots.slice(0, maxVisible).map((snap) => this.createSnapshotItem(snap));

		if (snapshots.length > maxVisible) {
			items.push(this.createMoreItem(snapshots.length - maxVisible));
		}

		return items;
	}

	/**
	 * Get event type label for display
	 * Event-first format: "AI Edit", "Manual", "Auto", "Pre-save"
	 */
	private getEventTypeLabel(trigger: SnapshotDisplayItem["trigger"]): string {
		switch (trigger) {
			case "ai-detected":
				return "AI Edit";
			case "manual":
				return "Manual";
			case "pre-save":
				return "Pre-save";
			case "auto":
			default:
				return "Auto";
		}
	}

	/**
	 * Get event icon using new event-first icons
	 */
	private getEventIcon(trigger: SnapshotDisplayItem["trigger"]): string {
		switch (trigger) {
			case "ai-detected":
				return SNAPBACK_ICONS.EVENT_AI;
			case "manual":
				return SNAPBACK_ICONS.EVENT_MANUAL;
			case "pre-save":
				return SNAPBACK_ICONS.EVENT_PRE_SAVE;
			case "auto":
			default:
				return SNAPBACK_ICONS.EVENT_AUTO;
		}
	}

	/**
	 * Create snapshot item with event-first label format
	 * Format: "{icon} {type} — {filename} • {time}"
	 * Examples:
	 * - "✨ AI Edit — Button.tsx • 19m"
	 * - "💾 Manual — useAuth.ts • 2h"
	 */
	private createSnapshotItem(snapshot: SnapshotDisplayItem): SnapBackTreeItem {
		const icon = this.getEventIcon(snapshot.trigger);
		const typeLabel = this.getEventTypeLabel(snapshot.trigger);
		const fileName = path.basename(snapshot.primaryFile);
		const createdAt = snapshot.timestamp.getTime();

		// Get badge state for this snapshot
		const badge = this.badgeProvider.getBadge(createdAt);

		// Track snapshot for auto-refresh when badge expires
		this.badgeProvider.trackSnapshot(snapshot.id, createdAt);

		// Build label with optional badge (event-first format)
		const badgeText = badge?.type === "new" ? " NEW" : "";

		// Determine collapsibility: multi-file expands, single-file opens diff
		const isMultiFile = snapshot.fileCount > 1;
		const collapsibleState = isMultiFile
			? vscode.TreeItemCollapsibleState.Collapsed
			: vscode.TreeItemCollapsibleState.None;

		const item = new SnapBackTreeItem(
			`${icon} ${typeLabel}${badgeText}`,
			{ type: "snapshot", id: snapshot.id },
			collapsibleState,
		);

		// Stable ID for automatic expansion persistence by VS Code
		item.id = `snapback:activity:snapshot:${snapshot.id}`;
		// Description: "— {filename} • {time}"
		const staleIndicator = badge?.type === "stale" ? " (old)" : "";
		item.description = `— ${fileName} • ${snapshot.description}${staleIndicator}`;
		item.tooltip = this.getSnapshotTooltip(snapshot);

		// Context value based on single/multi file for interaction model
		item.contextValue = isMultiFile ? "activityEventMulti" : "activityEventSingle";

		// Single-file events: click opens diff
		if (!isMultiFile) {
			item.command = {
				command: "snapback.snapshot.showFileDiff",
				title: "Compare with Current",
				arguments: [snapshot.id, snapshot.primaryFile],
			};
		}

		return item;
	}

	private getSnapshotTooltip(snapshot: SnapshotDisplayItem): string {
		const lines = [snapshot.name, `Files: ${snapshot.fileCount}`, `Trigger: ${snapshot.trigger}`];
		if (snapshot.aiTool) {
			lines.push(`AI Tool: ${snapshot.aiTool}`);
		}
		if (snapshot.detectedSystem) {
			lines.push(`System: ${snapshot.detectedSystem}`);
		}
		lines.push(`Time: ${snapshot.timestamp.toLocaleString()}`);
		return lines.join("\n");
	}

	private createMoreItem(remaining: number): SnapBackTreeItem {
		const item = new SnapBackTreeItem(
			`⋯ ${remaining} more snapshots`,
			{ type: "more-snapshots", count: remaining },
			vscode.TreeItemCollapsibleState.None,
		);
		item.command = {
			command: COMMANDS.SNAPSHOT.SHOW_ALL,
			title: "Search Snapshots",
		};
		return item;
	}

	// ============================================
	// ACTIVITY TIME GROUPS
	// ============================================

	/**
	 * Get time-based sub-groups for the unified ACTIVITY section
	 */
	private getActivityTimeGroups(): SnapBackTreeItem[] {
		const strategy = new TimeGroupingStrategy();
		const grouped = strategy.group(this.cachedSnapshots);
		const items: SnapBackTreeItem[] = [];

		const groups: Array<{ key: TimeGroup; data: SnapshotDisplayItem[] }> = [
			{ key: "recent", data: grouped.recent },
			{ key: "yesterday", data: grouped.yesterday },
			{ key: "this-week", data: grouped.thisWeek },
			{ key: "older", data: grouped.older },
		];

		for (const { key, data } of groups) {
			// HIDE EMPTY STATES - Only show groups with content
			if (data.length > 0) {
				const item = new SnapBackTreeItem(
					strategy.getGroupLabel(key),
					{ type: "time-group", groupKey: key, count: data.length },
					strategy.isExpandedByDefault(key)
						? vscode.TreeItemCollapsibleState.Expanded
						: vscode.TreeItemCollapsibleState.Collapsed,
				);
				// Stable ID for automatic expansion persistence by VS Code
				item.id = `snapback:activity:time-group:${key}`;
				item.description = `${data.length}`;
				items.push(item);
			}
		}

		return items;
	}

	// ============================================
	// PROBLEMS SECTION
	// ============================================

	private createProblemsSection(): SnapBackTreeItem {
		const item = new SnapBackTreeItem(
			`${SNAPBACK_ICONS.WARNING} PROBLEMS (${this.problems.length})`,
			{ type: "problems-header", count: this.problems.length },
			vscode.TreeItemCollapsibleState.Expanded,
		);
		// Stable ID for automatic expansion persistence by VS Code
		item.id = "snapback:root:problems";
		item.contextValue = "problems-header";
		return item;
	}

	private getProblemItems(): SnapBackTreeItem[] {
		return this.problems.map((problem) => {
			const icon = problem.severity === "error" ? SNAPBACK_ICONS.ERROR : SNAPBACK_ICONS.WARNING;
			const item = new SnapBackTreeItem(
				`${icon} ${problem.title}`,
				{ type: "problem", id: problem.id },
				vscode.TreeItemCollapsibleState.None,
			);
			// Stable ID for automatic expansion persistence by VS Code
			item.id = `snapback:problems:item:${problem.id}`;
			item.description = problem.action?.label;
			item.tooltip = problem.description;

			if (problem.action) {
				item.command = {
					command: problem.action.command,
					title: problem.action.label,
					arguments: [problem.id],
				};
			}

			return item;
		});
	}

	// ============================================
	// HELPERS
	// ============================================

	private toDisplayItem(manifest: SnapshotManifest): SnapshotDisplayItem {
		return {
			id: manifest.id,
			name: manifest.name,
			timestamp: new Date(manifest.timestamp),
			trigger: manifest.trigger,
			fileCount: Object.keys(manifest.files).length,
			primaryFile: Object.keys(manifest.files)[0] || "unknown",
			aiTool: manifest.metadata?.aiDetection?.tool,
			description: this.formatRelativeTime(manifest.timestamp),
			detectedSystem: undefined, // Future: manifest.metadata?.detectedSystem
		};
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

	// ============================================
	// CLOUD SECTION
	// ============================================

	/**
	 * Create cloud status section
	 * Shows connection CTA or status when connected
	 */
	private createCloudSection(): SnapBackTreeItem {
		// TODO: Integrate with actual auth state from CredentialsManager
		// For now, show CTA to connect
		const isConnected = false; // Will be replaced with actual auth check

		if (isConnected) {
			const item = new SnapBackTreeItem(
				`${SNAPBACK_ICONS.CLOUD_CONNECTED} CLOUD`,
				{ type: "cloud-status" },
				vscode.TreeItemCollapsibleState.None,
			);
			// Stable ID for automatic expansion persistence by VS Code
			item.id = "snapback:root:cloud:connected";
			item.description = "Connected";
			item.tooltip = "SnapBack Cloud is connected. Your snapshots are synced.";
			item.contextValue = "cloudConnected";
			return item;
		}

		const item = new SnapBackTreeItem(
			`${SNAPBACK_ICONS.CLOUD_DISCONNECTED} CLOUD`,
			{ type: "cloud-cta" },
			vscode.TreeItemCollapsibleState.None,
		);
		// Stable ID for automatic expansion persistence by VS Code
		item.id = "snapback:root:cloud:cta";
		item.description = "Connect to sync snapshots";
		item.tooltip = "Connect your SnapBack account to sync snapshots across devices";
		item.contextValue = "cloudCta";
		item.command = {
			command: "snapback.connect",
			title: "Connect Account",
		};
		return item;
	}

	private createErrorItem(): SnapBackTreeItem {
		const item = new SnapBackTreeItem(
			`${SNAPBACK_ICONS.ERROR} Error loading tree view`,
			{ type: "header" },
			vscode.TreeItemCollapsibleState.None,
		);
		item.tooltip = "Check Output panel for details";
		return item;
	}

	/**
	 * Static factory method for easy registration
	 */
	static register(
		context: vscode.ExtensionContext,
		storageManager: IStorageManager,
		configManager: IConfigManager,
		viewId = "snapback.dashboard",
	): {
		provider: SnapBackTreeProvider;
		view: vscode.TreeView<SnapBackTreeItem>;
	} {
		const provider = new SnapBackTreeProvider(context, storageManager, configManager);

		const view = vscode.window.createTreeView(viewId, {
			treeDataProvider: provider,
			showCollapseAll: true,
		});

		context.subscriptions.push(view);

		return { provider, view };
	}
}
