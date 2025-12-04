/**
 * SnapshotListProvider
 *
 * TreeDataProvider for VS Code's Explorer displaying persisted snapshots.
 * Shows list of snapshots with metadata (timestamp, file count, risk score).
 * Enables restore, diff, and delete operations via context menu.
 */

import * as vscode from "vscode";
import type { SnapshotOrchestrator } from "../domain/snapshotOrchestrator";
import type { PersistedSnapshot } from "../domain/snapshotOrchestrator";
import { logger } from "../utils/logger";

/**
 * Tree item for a snapshot
 */
class SnapshotTreeItem extends vscode.TreeItem {
	constructor(
		snapshot: PersistedSnapshot,
		collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState
			.None,
	) {
		const timestamp = new Date(snapshot.timestamp).toLocaleString();
		const label = snapshot.name;
		const description = `${snapshot.fileCount} files • ${(snapshot.totalSize / 1024).toFixed(1)} KB`;

		super(label, collapsibleState);

		this.description = description;
		this.tooltip = `Created: ${timestamp}\nRisk Score: ${snapshot.metadata.riskScore}${snapshot.metadata.aiDetected ? `\nAI Tool: ${snapshot.metadata.aiToolName || "Unknown"}` : ""}`;
		this.iconPath = this.getIcon(snapshot);
		this.contextValue = "snapshot";
		this.command = {
			title: "Show Snapshot Details",
			command: "snapback.showSnapshotDetails",
			arguments: [snapshot.id],
		};
	}

	private getIcon(snapshot: PersistedSnapshot): vscode.ThemeIcon {
		if (snapshot.metadata.aiDetected) {
			return new vscode.ThemeIcon("sparkles");
		}
		if (snapshot.metadata.riskScore >= 60) {
			return new vscode.ThemeIcon("warning");
		}
		return new vscode.ThemeIcon("archive");
	}
}

/**
 * TreeDataProvider for snapshots
 */
export class SnapshotListProvider
	implements vscode.TreeDataProvider<SnapshotTreeItem>
{
	private onDidChangeTreeDataEmitter = new vscode.EventEmitter<
		SnapshotTreeItem | undefined | null | undefined
	>();
	readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

	constructor(private orchestrator: SnapshotOrchestrator) {}

	/**
	 * Get root children (all snapshots)
	 */
	getChildren(
		element?: SnapshotTreeItem,
	): Thenable<SnapshotTreeItem[]> {
		if (element) {
			// No children for individual snapshot items
			return Promise.resolve([]);
		}

		// Return all recoverable snapshots, sorted by timestamp (newest first)
		const snapshots = this.orchestrator
			.getRecoverableSnapshots()
			.sort((a, b) => b.timestamp - a.timestamp);

		const items = snapshots.map((s) => new SnapshotTreeItem(s));
		return Promise.resolve(items);
	}

	/**
	 * Get tree item for snapshot
	 */
	getTreeItem(element: SnapshotTreeItem): vscode.TreeItem {
		return element;
	}

	/**
	 * Refresh tree view
	 */
	refresh(): void {
		this.onDidChangeTreeDataEmitter.fire();
		logger.debug("SnapshotListProvider refreshed");
	}

	/**
	 * Refresh specific snapshot in tree
	 */
	refreshSnapshot(_snapshotId: string): void {
		// Would update single node if found
		this.onDidChangeTreeDataEmitter.fire();
	}

	/**
	 * Get snapshot details for display
	 */
	getSnapshotDetails(snapshotId: string): SnapshotDetails | null {
		const snapshot = this.orchestrator.getSnapshot(snapshotId);
		if (!snapshot) {
			return null;
		}

		return {
			id: snapshot.id,
			name: snapshot.name,
			timestamp: new Date(snapshot.timestamp).toLocaleString(),
			fileCount: snapshot.fileCount,
			totalSize: (snapshot.totalSize / 1024).toFixed(2),
			riskScore: snapshot.metadata.riskScore,
			aiDetected: snapshot.metadata.aiDetected,
			aiToolName: snapshot.metadata.aiToolName,
			recoverable: snapshot.recoverable,
		};
	}

	/**
	 * Check if snapshot can be restored
	 */
	canRestore(snapshotId: string): boolean {
		const snapshot = this.orchestrator.getSnapshot(snapshotId);
		return snapshot ? snapshot.recoverable : false;
	}

	/**
	 * Get all snapshots
	 */
	getSnapshots(): PersistedSnapshot[] {
		return this.orchestrator.getRecoverableSnapshots();
	}

	/**
	 * Dispose provider
	 */
	dispose(): void {
		this.onDidChangeTreeDataEmitter.dispose();
	}
}

export interface SnapshotDetails {
	id: string;
	name: string;
	timestamp: string;
	fileCount: number;
	totalSize: string;
	riskScore: number;
	aiDetected: boolean;
	aiToolName?: string;
	recoverable: boolean;
}
