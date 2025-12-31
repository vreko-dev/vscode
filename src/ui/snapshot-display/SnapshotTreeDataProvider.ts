/**
 * SnapshotTreeDataProvider - Sidebar browse and manage
 *
 * Tree view for exploring snapshots organized by date groups.
 * Provides a "file explorer" style experience for snapshot browsing.
 *
 * Design Principles:
 * - Organized by time: Today, Yesterday, This Week, Older
 * - Expand/collapse for focus
 * - Rich context menu for actions
 *
 * Visual Format:
 * ┌──────────────────────────────────────────────────────────────┐
 * │ ▸ Today (3 snapshots)                                        │
 * │   🤖  api.ts                                      2:45 PM    │
 * │   📸  index.ts (+2)                              2:30 PM    │
 * │   ⚡  config.ts                                  1:15 PM    │
 * │ ▸ Yesterday (5 snapshots)                                    │
 * │ ▸ This Week (12 snapshots)                                   │
 * │ ▸ Older (45 snapshots)                                       │
 * └──────────────────────────────────────────────────────────────┘
 *
 * @packageDocumentation
 */

import { logger } from "@snapback/infrastructure";
import * as vscode from "vscode";
import type { IStorageManager, SnapshotManifest } from "../../storage/types";
import {
	type AnySnapshotManifest,
	type DateGroup,
	formatAbsoluteTime,
	formatAnchorFile,
	formatReason,
	getOriginIcon,
	groupByDate,
	isV2Manifest,
} from "./formatting";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Configuration for the SnapshotTreeDataProvider
 */
export interface SnapshotTreeConfig {
	/** Maximum items to show (default: 100) */
	maxItems: number;
}

const DEFAULT_CONFIG: SnapshotTreeConfig = {
	maxItems: 100,
};

// =============================================================================
// DATE GROUP TREE ITEM
// =============================================================================

/**
 * Tree item representing a date group (Today, Yesterday, etc.)
 */
export class DateGroupTreeItem extends vscode.TreeItem {
	public readonly dateGroup: DateGroup;
	public snapshots: SnapshotManifest[] = [];

	constructor(dateGroup: DateGroup, snapshotCount: number) {
		super(
			dateGroup,
			dateGroup === "Today"
				? vscode.TreeItemCollapsibleState.Expanded
				: vscode.TreeItemCollapsibleState.Collapsed,
		);

		this.dateGroup = dateGroup;
		this.description = `${snapshotCount} snapshot${snapshotCount === 1 ? "" : "s"}`;
		this.contextValue = "dateGroup";
	}
}

// =============================================================================
// SNAPSHOT TREE ITEM
// =============================================================================

/**
 * Get reasons from a snapshot manifest (V1 or V2)
 */
function getSnapshotReasonsForTree(snapshot: AnySnapshotManifest): string[] | undefined {
	if (isV2Manifest(snapshot)) {
		return snapshot.metadata?.reasons;
	}
	// V1 manifest - convert trigger to reason-like format
	const v1 = snapshot as SnapshotManifest;
	if (v1.metadata?.aiDetection?.detected) {
		return ["AI_DETECTED"];
	}
	switch (v1.trigger) {
		case "manual":
			return ["MANUAL_CHECKPOINT"];
		case "ai-detected":
			return ["AI_DETECTED"];
		case "auto":
			return ["RISK_BURST_START"];
		case "pre-save":
			return ["PRE_ROLLBACK"];
		default:
			return undefined;
	}
}

/**
 * Tree item representing a single snapshot
 */
export class SnapshotTreeItem extends vscode.TreeItem {
	public readonly snapshotId: string;

	constructor(snapshot: SnapshotManifest) {
		const icon = getOriginIcon(snapshot);
		const file = formatAnchorFile(snapshot);
		const label = `${icon}  ${file}`;

		super(label, vscode.TreeItemCollapsibleState.None);

		this.snapshotId = snapshot.id;
		this.description = formatAbsoluteTime(snapshot.timestamp);
		this.contextValue = "snapshot";

		// Tooltip with detailed info
		this.tooltip = this.buildTooltip(snapshot);

		// Command to show diff on click
		this.command = {
			command: "snapback.diffSnapshot",
			title: "Show Diff",
			arguments: [snapshot.id],
		};
	}

	private buildTooltip(snapshot: SnapshotManifest): vscode.MarkdownString {
		const md = new vscode.MarkdownString();
		md.appendMarkdown(`**${formatAnchorFile(snapshot)}**\n\n`);
		const reasons = getSnapshotReasonsForTree(snapshot);
		// biome-ignore lint/suspicious/noExplicitAny: formatReason expects ReasonCode[] but getSnapshotReasonsForTree returns string[]
		md.appendMarkdown(`${formatReason(reasons as any)}\n\n`);

		const fileCount = Object.keys(snapshot.files).length;
		if (fileCount > 1) {
			md.appendMarkdown(`Files: ${fileCount}\n`);
		}

		return md;
	}
}

// =============================================================================
// TREE ITEM TYPE UNION
// =============================================================================

type SnapshotTreeElement = DateGroupTreeItem | SnapshotTreeItem;

// =============================================================================
// MAIN CLASS
// =============================================================================

/**
 * SnapshotTreeDataProvider - Sidebar browse and manage
 *
 * Implements TreeDataProvider to show snapshots organized by date groups
 * in the VS Code sidebar.
 */
export class SnapshotTreeDataProvider implements vscode.TreeDataProvider<SnapshotTreeElement> {
	private readonly config: SnapshotTreeConfig;
	private readonly _onDidChangeTreeData = new vscode.EventEmitter<
		SnapshotTreeElement | undefined | null | undefined
	>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	constructor(
		private readonly storageManager: IStorageManager,
		config?: Partial<SnapshotTreeConfig>,
	) {
		this.config = { ...DEFAULT_CONFIG, ...config };
	}

	/**
	 * Refresh the tree view
	 */
	refresh(): void {
		this._onDidChangeTreeData.fire(undefined);
	}

	/**
	 * Get the TreeItem representation of an element
	 */
	getTreeItem(element: SnapshotTreeElement): vscode.TreeItem | Thenable<vscode.TreeItem> {
		return element;
	}

	/**
	 * Get children of an element (or root if no element)
	 */
	async getChildren(element?: SnapshotTreeElement): Promise<SnapshotTreeElement[]> {
		// If element is a SnapshotTreeItem, it has no children
		if (element instanceof SnapshotTreeItem) {
			return [];
		}

		// If element is a DateGroupTreeItem, return its snapshots
		if (element instanceof DateGroupTreeItem) {
			return element.snapshots.map((s) => new SnapshotTreeItem(s));
		}

		// Root level: return date groups
		return this.getDateGroups();
	}

	/**
	 * Get date group items with snapshots
	 */
	private async getDateGroups(): Promise<DateGroupTreeItem[]> {
		try {
			const manifests = await this.storageManager.listSnapshots({
				limit: this.config.maxItems,
			});

			if (manifests.length === 0) {
				return [];
			}

			// Group by date
			const groups = groupByDate(manifests);

			// Create tree items for non-empty groups
			const items: DateGroupTreeItem[] = [];
			const dateOrder: DateGroup[] = ["Today", "Yesterday", "This Week", "Older"];

			for (const dateGroup of dateOrder) {
				const snapshots = groups[dateGroup];
				if (snapshots.length > 0) {
					const item = new DateGroupTreeItem(dateGroup, snapshots.length);
					item.snapshots = snapshots;
					items.push(item);
				}
			}

			return items;
		} catch (error) {
			logger.error("Failed to load snapshots for tree view", error as Error);
			return [];
		}
	}

	/**
	 * Dispose of resources
	 */
	dispose(): void {
		this._onDidChangeTreeData.dispose();
	}
}

// =============================================================================
// COMMAND REGISTRATION
// =============================================================================

/**
 * Register SnapshotTreeDataProvider and associated commands
 */
export function registerSnapshotTreeView(
	_context: vscode.ExtensionContext,
	storageManager: IStorageManager,
): vscode.Disposable[] {
	const disposables: vscode.Disposable[] = [];

	const provider = new SnapshotTreeDataProvider(storageManager);

	// Register tree view
	const treeView = vscode.window.createTreeView("snapback.snapshotExplorer", {
		treeDataProvider: provider,
		showCollapseAll: true,
	});
	disposables.push(treeView);

	// Refresh command
	disposables.push(
		vscode.commands.registerCommand("snapback.refreshSnapshots", () => {
			provider.refresh();
		}),
	);

	// Delete snapshot command (context menu)
	disposables.push(
		vscode.commands.registerCommand("snapback.deleteSnapshot", async (item: SnapshotTreeItem) => {
			if (item?.snapshotId) {
				const confirm = await vscode.window.showWarningMessage(
					"Delete this snapshot?",
					{ modal: true },
					"Delete",
				);
				if (confirm === "Delete") {
					await vscode.commands.executeCommand("snapback.performDeleteSnapshot", item.snapshotId);
					provider.refresh();
				}
			}
		}),
	);

	return disposables;
}
