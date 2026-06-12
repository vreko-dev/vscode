/**
 * @fileoverview RecoveryTreeProvider - Phase 1.4 Implementation
 *
 * Three-level hierarchy for recovery timeline:
 * 1. Time groups (Today, Yesterday, This Week, Older)
 * 2. File groups (grouped by anchor file)
 * 3. Snapshot items (individual snapshots)
 *
 * @packageDocumentation
 */

import * as vscode from "vscode";
import type { IRecoveryService, RecoverySnapshot } from "../../services/recovery/interfaces";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Time group for recovery timeline
 */
type TimeGroup = "Today" | "Yesterday" | "This Week" | "Older";

/**
 * Tree item types
 */
type TreeItemType = "time-group" | "file-group" | "snapshot";

/**
 * Base tree item data
 */
interface TreeItemData {
	type: TreeItemType;
	timeGroup?: TimeGroup;
	filePath?: string;
	snapshot?: RecoverySnapshot;
}

/**
 * Recovery tree item
 */
class RecoveryTreeItem extends vscode.TreeItem {
	constructor(
		label: string,
		public readonly data: TreeItemData,
		collapsibleState?: vscode.TreeItemCollapsibleState,
	) {
		super(label, collapsibleState);
	}
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Group snapshots by time period
 */
function groupSnapshotsByTime(snapshots: RecoverySnapshot[]): Record<TimeGroup, RecoverySnapshot[]> {
	const _now = Date.now();
	const todayStart = new Date().setHours(0, 0, 0, 0);
	const yesterdayStart = todayStart - 86400000;
	const weekAgoStart = todayStart - 7 * 86400000;

	const groups: Record<TimeGroup, RecoverySnapshot[]> = {
		Today: [],
		Yesterday: [],
		"This Week": [],
		Older: [],
	};

	for (const snapshot of snapshots) {
		if (snapshot.timestamp >= todayStart) {
			groups.Today.push(snapshot);
		} else if (snapshot.timestamp >= yesterdayStart) {
			groups.Yesterday.push(snapshot);
		} else if (snapshot.timestamp >= weekAgoStart) {
			groups["This Week"].push(snapshot);
		} else {
			groups.Older.push(snapshot);
		}
	}

	return groups;
}

/**
 * Group snapshots by anchor file
 */
function groupSnapshotsByFile(snapshots: RecoverySnapshot[]): Map<string, RecoverySnapshot[]> {
	const fileGroups = new Map<string, RecoverySnapshot[]>();

	for (const snapshot of snapshots) {
		const filePath = snapshot.anchorFile;
		if (!fileGroups.has(filePath)) {
			fileGroups.set(filePath, []);
		}
		fileGroups.get(filePath)?.push(snapshot);
	}

	return fileGroups;
}

/**
 * Format relative time (e.g., "5m ago", "2h ago")
 */
function formatRelativeTime(timestamp: number): string {
	const now = Date.now();
	const diffMs = now - timestamp;
	const diffMinutes = Math.floor(diffMs / 60000);
	const diffHours = Math.floor(diffMs / 3600000);
	const diffDays = Math.floor(diffMs / 86400000);

	if (diffMinutes < 60) {
		return `${diffMinutes}m ago`;
	}
	if (diffHours < 24) {
		return `${diffHours}h ago`;
	}
	return `${diffDays}d ago`;
}

// =============================================================================
// RECOVERY TREE PROVIDER
// =============================================================================

/**
 * RecoveryTreeProvider - Three-level hierarchy for recovery timeline
 *
 * Hierarchy:
 * - Time Group (Today, Yesterday, This Week, Older)
 *   - File Group (grouped by anchor file)
 *     - Snapshot Item (individual snapshot)
 *
 * Example:
 * ```
 * ▾ Today (5 snapshots)
 *   ▸ api.ts (3)
 *     📸 Pre-refactor checkpoint (5m ago)
 *     📸 Post-refactor checkpoint (10m ago)
 *     📸 Fix validation bug (15m ago)
 *   ▸ utils.ts (2)
 *     📸 Add helper function (20m ago)
 *     📸 Fix edge case (25m ago)
 * ▸ Yesterday (8 snapshots)
 * ▸ This Week (12 snapshots)
 * ```
 */
export interface RecoveryFilterOptions {
	/** Filter scope: 'all', 'recent', 'session', or 'file' */
	scope?: "all" | "recent" | "session" | "file";
	/** Time window in milliseconds (e.g., 15 * 60 * 1000 for 15 minutes) */
	timeWindow?: number;
	/** Specific file path to filter by */
	filePath?: string;
}

export class RecoveryTreeProvider implements vscode.TreeDataProvider<RecoveryTreeItem>, vscode.Disposable {
	private readonly _onDidChangeTreeData = new vscode.EventEmitter<RecoveryTreeItem | undefined>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	private snapshotSubscription: vscode.Disposable | null = null;
	private snapshots: RecoverySnapshot[] = [];
	private filterOptions: RecoveryFilterOptions = {};

	constructor(private readonly recoveryService: IRecoveryService) {
		// Subscribe to snapshot creation events
		this.snapshotSubscription = this.recoveryService.onSnapshotCreated(() => {
			this.refresh();
		});

		// Load initial snapshots
		this.loadSnapshots();
	}

	/**
	 * Refresh the tree view
	 */
	async refresh(): Promise<void> {
		await this.loadSnapshots();
		this._onDidChangeTreeData.fire(undefined);
	}

	/**
	 * Load snapshots from recovery service
	 */
	private async loadSnapshots(): Promise<void> {
		try {
			this.snapshots = await this.recoveryService.getAll();
		} catch (_error) {
			this.snapshots = [];
		}
	}

	/**
	 * Get TreeItem representation
	 */
	getTreeItem(element: RecoveryTreeItem): vscode.TreeItem {
		return element;
	}

	/**
	 * Get children of an element (or root)
	 */
	async getChildren(element?: RecoveryTreeItem): Promise<RecoveryTreeItem[]> {
		// Ensure snapshots are loaded
		if (this.snapshots.length === 0 && !element) {
			await this.loadSnapshots();
		}

		// Root level: return time groups
		if (!element) {
			return this.getTimeGroups();
		}

		// Time group level: return file groups
		if (element.data.type === "time-group") {
			return this.getFileGroups(element.data.timeGroup!);
		}

		// File group level: return snapshot items
		if (element.data.type === "file-group") {
			return this.getSnapshotItems(element.data.timeGroup!, element.data.filePath!);
		}

		// Snapshot items have no children
		return [];
	}

	/**
	 * Get time group items
	 */
	private getTimeGroups(): RecoveryTreeItem[] {
		const filteredSnapshots = this.applyFilters(this.snapshots);

		if (filteredSnapshots.length === 0) {
			return [];
		}

		const grouped = groupSnapshotsByTime(filteredSnapshots);
		const items: RecoveryTreeItem[] = [];

		const order: TimeGroup[] = ["Today", "Yesterday", "This Week", "Older"];

		for (const timeGroup of order) {
			const snapshots = grouped[timeGroup];
			if (snapshots.length === 0) {
				continue; // Hide empty groups
			}

			const item = new RecoveryTreeItem(
				timeGroup,
				{ type: "time-group", timeGroup },
				timeGroup === "Today"
					? vscode.TreeItemCollapsibleState.Expanded
					: vscode.TreeItemCollapsibleState.Collapsed,
			);

			item.description = `${snapshots.length} snapshot${snapshots.length !== 1 ? "s" : ""}`;
			item.contextValue = "vreko:time-group";
			item.iconPath = new vscode.ThemeIcon("history");

			items.push(item);
		}

		return items;
	}

	/**
	 * Get file group items for a time group
	 */
	private getFileGroups(timeGroup: TimeGroup): RecoveryTreeItem[] {
		const filteredSnapshots = this.applyFilters(this.snapshots);
		const grouped = groupSnapshotsByTime(filteredSnapshots);
		const timeGroupSnapshots = grouped[timeGroup];

		const fileGroups = groupSnapshotsByFile(timeGroupSnapshots);
		const items: RecoveryTreeItem[] = [];

		for (const [filePath, snapshots] of fileGroups.entries()) {
			const fileName = filePath.split("/").pop() || filePath;

			const item = new RecoveryTreeItem(
				fileName,
				{ type: "file-group", timeGroup, filePath },
				vscode.TreeItemCollapsibleState.Collapsed,
			);

			item.description = `${snapshots.length}`;
			item.tooltip = filePath;
			item.contextValue = "vreko:file-group";
			item.iconPath = new vscode.ThemeIcon("file");

			items.push(item);
		}

		return items;
	}

	/**
	 * Get snapshot items for a file group
	 */
	private getSnapshotItems(timeGroup: TimeGroup, filePath: string): RecoveryTreeItem[] {
		const grouped = groupSnapshotsByTime(this.snapshots);
		const timeGroupSnapshots = grouped[timeGroup];
		const fileGroups = groupSnapshotsByFile(timeGroupSnapshots);
		const snapshots = fileGroups.get(filePath) || [];

		const items: RecoveryTreeItem[] = [];

		for (const snapshot of snapshots) {
			const item = new RecoveryTreeItem(
				snapshot.name,
				{ type: "snapshot", snapshot },
				vscode.TreeItemCollapsibleState.None,
			);

			item.description = formatRelativeTime(snapshot.timestamp);
			item.tooltip = `${snapshot.name}\n${new Date(snapshot.timestamp).toLocaleString()}`;
			item.contextValue = "vreko:snapshot";
			item.iconPath = new vscode.ThemeIcon("versions");

			items.push(item);
		}

		return items;
	}

	/**
	 * Set filter for the recovery timeline
	 * @param options - Filter options for scope and time window
	 */
	setFilter(options: RecoveryFilterOptions): void {
		this.filterOptions = { ...this.filterOptions, ...options };
		void this.refresh();
	}

	/**
	 * Clear all filters and show all snapshots
	 */
	clearFilter(): void {
		this.filterOptions = {};
		void this.refresh();
	}

	/**
	 * Get current filter options
	 */
	getFilter(): RecoveryFilterOptions {
		return { ...this.filterOptions };
	}

	/**
	 * Apply filters to snapshots
	 */
	private applyFilters(snapshots: RecoverySnapshot[]): RecoverySnapshot[] {
		let filtered = [...snapshots];

		// Apply time window filter
		if (this.filterOptions.timeWindow && this.filterOptions.timeWindow > 0) {
			const cutoffTime = Date.now() - this.filterOptions.timeWindow;
			filtered = filtered.filter((s) => s.timestamp >= cutoffTime);
		}

		// Apply scope filter
		if (this.filterOptions.scope) {
			switch (this.filterOptions.scope) {
				case "recent": {
					// Show only snapshots from last hour
					const oneHourAgo = Date.now() - 60 * 60 * 1000;
					filtered = filtered.filter((s) => s.timestamp >= oneHourAgo);
					break;
				}
				case "file":
					// Will be handled by filePath filter
					break;
			}
		}

		// Apply file path filter
		if (this.filterOptions.filePath) {
			const targetPath = this.filterOptions.filePath.toLowerCase();
			filtered = filtered.filter(
				(s) =>
					s.anchorFile.toLowerCase().includes(targetPath) ||
					s.files.some((f) => f.path.toLowerCase().includes(targetPath)),
			);
		}

		return filtered;
	}

	/**
	 * Dispose resources
	 */
	dispose(): void {
		if (this.snapshotSubscription) {
			this.snapshotSubscription.dispose();
			this.snapshotSubscription = null;
		}
		if (this._onDidChangeTreeData?.dispose) {
			this._onDidChangeTreeData.dispose();
		}
	}
}
