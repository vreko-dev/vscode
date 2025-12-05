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

import { logger } from "@snapback/infrastructure";
import * as vscode from "vscode";
import { COMMANDS } from "../constants/commands.js";
import { SNAPBACK_ICONS } from "../constants/icons.js";
import type { IStorageManager, SnapshotManifest } from "../storage/types.js";
import { TimeGroupingStrategy } from "./grouping/TimeGroupingStrategy.js";
import type {
	GroupingMode,
	ProblemItem,
	QuickAction,
	SnapshotDisplayItem,
	TimeGroup,
	TreeViewConfig,
} from "./types.js";
import { DEFAULT_TREE_CONFIG } from "./types.js";

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
	| "time-group"
	| "snapshot"
	| "more-snapshots"
	| "action"
	| "actions-header"
	| "problems-header"
	| "problem";

interface SnapBackTreeItemData {
	type: TreeItemType;
	id?: string;
	groupKey?: string;
	count?: number;
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

export class SnapBackTreeProvider
	implements vscode.TreeDataProvider<SnapBackTreeItem>
{
	private _onDidChangeTreeData = new vscode.EventEmitter<
		SnapBackTreeItem | undefined
	>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	private problems: ProblemItem[] = [];
	private config: TreeViewConfig;
	private cachedSnapshots: SnapshotDisplayItem[] = [];

	constructor(
		private storageManager: IStorageManager,
		private configManager: IConfigManager,
	) {
		this.config = { ...DEFAULT_TREE_CONFIG };
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
			vscode.window.showInformationMessage(
				`${mode} grouping coming soon! Using time grouping for now.`,
			);
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
				return this.getSnapshotsForTimeGroup(
					element.data.groupKey as TimeGroup,
				);
			case "actions-header":
				return this.getActionItems();
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

			// 4. ACTIONS - Always available at bottom
			items.push(this.createActionsSection());
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
				items.push(
					this.createDetailItem("Block", counts.block, SNAPBACK_ICONS.BLOCK),
				);
			}
			if (counts.warn > 0) {
				items.push(
					this.createDetailItem("Warn", counts.warn, SNAPBACK_ICONS.WARN),
				);
			}
			if (counts.watch > 0) {
				items.push(
					this.createDetailItem("Watch", counts.watch, SNAPBACK_ICONS.WATCH),
				);
			}

			return items;
		} catch (error) {
			logger.error("Error getting protection breakdown", error as Error);
			return [];
		}
	}

	private createDetailItem(
		level: string,
		count: number,
		icon: string,
	): SnapBackTreeItem {
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

	private async createSnapshotGroups(): Promise<SnapBackTreeItem[]> {
		try {
			// Load snapshots
			await this.loadSnapshots();

			// Use time grouping (only implemented strategy)
			return this.createTimeGroups();
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

			logger.debug("Snapshots loaded for TreeView", {
				count: this.cachedSnapshots.length,
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
	// TIME GROUPING (Implemented)
	// ============================================

	private createTimeGroups(): SnapBackTreeItem[] {
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
				item.description = `${data.length}`;
				items.push(item);
			}
		}

		return items;
	}

	private async getSnapshotsForTimeGroup(
		groupKey: TimeGroup,
	): Promise<SnapBackTreeItem[]> {
		const strategy = new TimeGroupingStrategy();
		const grouped = strategy.group(this.cachedSnapshots);

		const snapshots = grouped[groupKey === "this-week" ? "thisWeek" : groupKey];
		return this.createSnapshotItems(snapshots);
	}

	// ============================================
	// SNAPSHOT ITEMS
	// ============================================

	private createSnapshotItems(
		snapshots: SnapshotDisplayItem[],
	): SnapBackTreeItem[] {
		const maxVisible = this.config.maxPerGroup;
		const items = snapshots
			.slice(0, maxVisible)
			.map((snap) => this.createSnapshotItem(snap));

		if (snapshots.length > maxVisible) {
			items.push(this.createMoreItem(snapshots.length - maxVisible));
		}

		return items;
	}

	private createSnapshotItem(snapshot: SnapshotDisplayItem): SnapBackTreeItem {
		const icon = this.getSnapshotIcon(snapshot);

		const item = new SnapBackTreeItem(
			`${icon} ${snapshot.name}`,
			{ type: "snapshot", id: snapshot.id },
			vscode.TreeItemCollapsibleState.None,
		);

		item.description = snapshot.description;
		item.tooltip = this.getSnapshotTooltip(snapshot);
		item.contextValue = "snapshot";

		item.command = {
			command: COMMANDS.SNAPSHOT.VIEW,
			title: "Show Snapshot Details",
			arguments: [snapshot.id],
		};

		return item;
	}

	private getSnapshotIcon(snapshot: SnapshotDisplayItem): string {
		if (!this.config.showAI) {
			return SNAPBACK_ICONS.CAMERA;
		}

		switch (snapshot.trigger) {
			case "ai-detected":
				return SNAPBACK_ICONS.AI;
			case "manual":
				return SNAPBACK_ICONS.MANUAL;
			case "pre-save":
				return SNAPBACK_ICONS.BLOCK;
			default:
				return SNAPBACK_ICONS.CAMERA;
		}
	}

	private getSnapshotTooltip(snapshot: SnapshotDisplayItem): string {
		const lines = [
			snapshot.name,
			`Files: ${snapshot.fileCount}`,
			`Trigger: ${snapshot.trigger}`,
		];
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
	// ACTIONS SECTION
	// ============================================

	private createActionsSection(): SnapBackTreeItem {
		const item = new SnapBackTreeItem(
			"ACTIONS",
			{ type: "actions-header" },
			vscode.TreeItemCollapsibleState.Expanded,
		);
		return item;
	}

	private getActionItems(): SnapBackTreeItem[] {
		const actions: QuickAction[] = [
			{
				id: "create",
				label: "Create Snapshot",
				icon: SNAPBACK_ICONS.CAMERA,
				command: COMMANDS.SNAPSHOT.CREATE,
			},
			{
				id: "restore",
				label: "Restore Last",
				icon: SNAPBACK_ICONS.RESTORE,
				command: COMMANDS.SNAPSHOT.RESTORE_LEGACY,
			},
			{
				id: "search",
				label: "Search Snapshots...",
				icon: SNAPBACK_ICONS.SEARCH,
				command: COMMANDS.SNAPSHOT.SHOW_ALL,
			},
			{
				id: "configure",
				label: "Configure Protection",
				icon: SNAPBACK_ICONS.SETTINGS,
				command: COMMANDS.PROTECTION.PROTECT_WORKSPACE,
			},
		];

		return actions.map((action) => {
			const item = new SnapBackTreeItem(
				`${action.icon} ${action.label}`,
				{ type: "action", id: action.id },
				vscode.TreeItemCollapsibleState.None,
			);
			item.command = {
				command: action.command,
				title: action.label,
			};
			return item;
		});
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
		item.contextValue = "problems-header";
		return item;
	}

	private getProblemItems(): SnapBackTreeItem[] {
		return this.problems.map((problem) => {
			const icon =
				problem.severity === "error"
					? SNAPBACK_ICONS.ERROR
					: SNAPBACK_ICONS.WARNING;
			const item = new SnapBackTreeItem(
				`${icon} ${problem.title}`,
				{ type: "problem", id: problem.id },
				vscode.TreeItemCollapsibleState.None,
			);
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

		if (minutes < 1) return "just now";
		if (minutes < 60) return `${minutes}m ago`;
		if (hours < 24) return `${hours}h ago`;
		if (days === 1) return "yesterday";
		return `${days}d ago`;
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
		const provider = new SnapBackTreeProvider(storageManager, configManager);

		const view = vscode.window.createTreeView(viewId, {
			treeDataProvider: provider,
			showCollapseAll: true,
		});

		context.subscriptions.push(view);

		return { provider, view };
	}
}
