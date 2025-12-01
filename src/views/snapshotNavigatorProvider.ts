import type { Snapshot } from "@snapback/contracts";
import * as vscode from "vscode";
import type { SnapshotStorage } from "../storage/types";
import { logger } from "../utils/logger.js";

/**
 * SnapshotFileNode represents a file in a snapshot in the tree view
 */
export class SnapshotFileNode extends vscode.TreeItem {
	constructor(
		public readonly filePath: string,
		public readonly snapshotId: string,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState = vscode
			.TreeItemCollapsibleState.None,
	) {
		super(filePath, collapsibleState);
		this.contextValue = "snapshotFile";
		this.iconPath = new vscode.ThemeIcon("file");
		this.command = {
			command: "snapback.openSnapshotFileDiff",
			title: "Open Diff",
			arguments: [this],
		};
	}
}

/**
 * SnapshotNode represents a snapshot in the tree view
 */
export class SnapshotNode extends vscode.TreeItem {
	constructor(
		public readonly snapshot: Snapshot,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState = vscode
			.TreeItemCollapsibleState.Collapsed,
	) {
		super(
			`Snapshot ${new Date(snapshot.timestamp).toLocaleString()}`,
			collapsibleState,
		);
		this.contextValue = "snapshot";
		this.iconPath = new vscode.ThemeIcon("history");
		this.description = snapshot.id.substring(0, 8);
		this.tooltip = `ID: ${snapshot.id}\nCaptured: ${new Date(
			snapshot.timestamp,
		).toLocaleString()}`;
	}
}

/**
 * SnapshotNavigatorProvider provides a tree view of snapshots and their files
 */
export class SnapshotNavigatorProvider
	implements vscode.TreeDataProvider<vscode.TreeItem>, vscode.Disposable
{
	private _onDidChangeTreeData: vscode.EventEmitter<
		vscode.TreeItem | undefined | null | undefined
	> = new vscode.EventEmitter<vscode.TreeItem | undefined | null | undefined>();
	readonly onDidChangeTreeData: vscode.Event<
		vscode.TreeItem | undefined | null | undefined
	> = this._onDidChangeTreeData.event;

	constructor(private storage?: SnapshotStorage) {}

	/**
	 * Refresh the tree view
	 */
	refresh(): void {
		this._onDidChangeTreeData.fire(undefined);
	}

	/**
	 * Get the tree item for an element
	 */
	getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
		return element;
	}

	/**
	 * Get the children of an element
	 */
	async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
		// If no element is provided, we're at the root level - show snapshots
		if (!element) {
			return await this.getSnapshots();
		}

		// If the element is a SnapshotNode, show its files
		if (element instanceof SnapshotNode) {
			return await this.getSnapshotFiles(element.snapshot);
		}

		// For other elements, return empty array
		return [];
	}

	/**
	 * Get all snapshots
	 */
	private async getSnapshots(): Promise<SnapshotNode[]> {
		if (!this.storage) {
			return [];
		}

		try {
			const snapshots = await this.storage.listSnapshots();
			// Sort by timestamp, newest first
			return snapshots
				.sort((a, b) => b.timestamp - a.timestamp)
				.map((snapshot) => new SnapshotNode(snapshot as unknown as Snapshot));
		} catch (error) {
			logger.error(
				"Error loading snapshots:",
				error instanceof Error ? error : undefined,
			);
			return [];
		}
	}

	/**
	 * Get files for a specific snapshot
	 */
	private async getSnapshotFiles(
		snapshot: Snapshot,
	): Promise<SnapshotFileNode[]> {
		// Use fileContents instead of files array
		if (!snapshot.fileContents) {
			return [];
		}

		return Object.keys(snapshot.fileContents).map(
			(filePath) => new SnapshotFileNode(filePath, snapshot.id),
		);
	}

	dispose(): void {
		this._onDidChangeTreeData.dispose();
	}
}
