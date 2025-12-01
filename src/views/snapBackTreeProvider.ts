import * as vscode from "vscode";
import { logger } from "../utils/logger.js";
import { createProtectedFileTreeItem } from "./ProtectedFilesTreeProvider.js";
import type {
	ProtectedFileProvider,
	SnapshotSummary,
	SnapshotSummaryProvider,
} from "./types";

const MAX_CHECKPOINT_ITEMS = 5;
const MAX_PROTECTED_ITEMS = 5;

export class SnapBackTreeProvider
	implements vscode.TreeDataProvider<vscode.TreeItem>, vscode.Disposable
{
	private readonly _onDidChangeTreeData = new vscode.EventEmitter<
		vscode.TreeItem | undefined
	>();

	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	constructor(
		private readonly snapshots: SnapshotSummaryProvider,
		private readonly protectedFiles: ProtectedFileProvider,
	) {}

	getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
		return element;
	}

	async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
		if (!element) {
			return this.getRootSections();
		}

		switch (element.contextValue) {
			case "snapback.section.snapshots":
				return this.getCheckpointItems();
			case "snapback.section.protected":
				return this.getProtectedFileItems();
			default:
				return [];
		}
	}

	refresh(): void {
		this._onDidChangeTreeData.fire(undefined);
	}

	private async getRootSections(): Promise<vscode.TreeItem[]> {
		const [snapshotTotal, protectedTotal] = await Promise.all([
			this.safeTotal(() => this.snapshots.total()),
			this.safeTotal(() => this.protectedFiles.total()),
		]);

		return [
			new SectionItem("Snapshots", snapshotTotal, "snapback.section.snapshots"),
			new SectionItem(
				"Protected Files",
				protectedTotal,
				"snapback.section.protected",
			),
		];
	}

	private async getCheckpointItems(): Promise<vscode.TreeItem[]> {
		const summaries = await this.safeList(() =>
			this.snapshots.listRecent(MAX_CHECKPOINT_ITEMS),
		);
		const total = await this.safeTotal(() => this.snapshots.total());

		const items = summaries
			.sort((a, b) => b.createdAt - a.createdAt)
			.map((summary) => new CheckpointItem(summary));

		if (total > MAX_CHECKPOINT_ITEMS) {
			items.push(
				new ShowMoreItem(
					`Show ${total - MAX_CHECKPOINT_ITEMS} more snapshots…`,
					"snapback.action.showMore.snapshots",
					"snapback.showAllSnapshots",
				),
			);
		}

		return items;
	}

	private async getProtectedFileItems(): Promise<vscode.TreeItem[]> {
		const files = await this.safeList(() => this.protectedFiles.list());
		const total = await this.safeTotal(() => this.protectedFiles.total());

		const items = files
			.sort((a, b) => (b.lastProtectedAt ?? 0) - (a.lastProtectedAt ?? 0))
			.slice(0, MAX_PROTECTED_ITEMS)
			.map((entry) => createProtectedFileTreeItem(entry));

		if (total > MAX_PROTECTED_ITEMS) {
			items.push(
				new ShowMoreItem(
					`Show ${total - MAX_PROTECTED_ITEMS} more…`,
					"snapback.action.showMore.protected",
					"snapback.showAllProtectedFiles",
				),
			);
		}

		return items;
	}

	private async safeList<T>(fn: () => Promise<T[]>): Promise<T[]> {
		try {
			return await fn();
		} catch (error) {
			logger.warn("SnapBackTreeProvider:list", error);
			return [];
		}
	}

	private async safeTotal(fn: () => Promise<number>): Promise<number> {
		try {
			return await fn();
		} catch (error) {
			logger.warn("SnapBackTreeProvider:total", error);
			return 0;
		}
	}

	dispose(): void {
		this._onDidChangeTreeData.dispose();
	}
}

class SectionItem extends vscode.TreeItem {
	constructor(label: string, total: number, contextValue: string) {
		super(label, vscode.TreeItemCollapsibleState.Expanded);
		this.contextValue = contextValue;
		this.description = `(${total})`;
	}
}

class CheckpointItem extends vscode.TreeItem {
	constructor(summary: SnapshotSummary) {
		super(summary.label, vscode.TreeItemCollapsibleState.None);
		this.id = summary.id;
		this.contextValue = "snapback.item.snapshot";
		this.description = formatRelative(summary.createdAt);
		this.tooltip = new Date(summary.createdAt).toLocaleString();
		this.iconPath = new vscode.ThemeIcon("history");
		this.command = {
			command: "snapback.restoreSnapshot",
			title: "Snap Back snapshot",
			arguments: [summary.id],
		};
	}
}

class ShowMoreItem extends vscode.TreeItem {
	constructor(label: string, contextValue: string, commandId: string) {
		super(label, vscode.TreeItemCollapsibleState.None);
		this.contextValue = contextValue;
		this.iconPath = new vscode.ThemeIcon("ellipsis");
		this.command = {
			command: commandId,
			title: label,
		};
	}
}

function formatRelative(timestamp: number): string {
	const diff = Date.now() - timestamp;
	const seconds = Math.round(diff / 1000);
	if (seconds < 60) {
		return `${seconds}s ago`;
	}
	const minutes = Math.round(seconds / 60);
	if (minutes < 60) {
		return `${minutes}m ago`;
	}
	const hours = Math.round(minutes / 60);
	if (hours < 24) {
		return `${hours}h ago`;
	}
	const days = Math.round(hours / 24);
	return `${days}d ago`;
}
