import * as vscode from "vscode";
import type { SnapshotService } from "../services/SnapshotService.js";
import type { Snapshot } from "../types/snapshot.js";

class SnapshotTreeItem extends vscode.TreeItem {
	constructor(
		public readonly snapshot: Snapshot,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState,
	) {
		// Use snapshot.name (from RichSnapshot) or fallback to meta.description or timestamp
		const label = (snapshot as any).name ||
			(snapshot.meta?.description as string) ||
			`Snapshot ${new Date(snapshot.timestamp).toLocaleTimeString()}`;
		super(label, collapsibleState);

		// Build description with file count, AI indicator, session, and time
		this.description = this.buildDescription(snapshot);
		this.tooltip = this.buildTooltip(snapshot);
		this.contextValue = "snapshot";
	}

	private buildDescription(snapshot: Snapshot): string {
		const parts: string[] = [];
		const timeStr = new Date(snapshot.timestamp).toLocaleString();

		// Get file count from different possible sources
		const fileCount = this.getFileCount(snapshot);
		if (fileCount > 0) {
			parts.push(`${fileCount} file${fileCount > 1 ? 's' : ''}`);
		}

		// Add AI indicator if detected
		const metadata = snapshot.meta as any;
		if (metadata?.aiDetected || metadata?.aiDetection?.detected) {
			parts.push('🤖 AI');
		}

		// Add session indicator if present
		if (metadata?.sessionId) {
			const sessionShort = (metadata.sessionId as string).slice(-6);
			parts.push(`Session: ${sessionShort}`);
		}

		// Add timestamp
		parts.push(timeStr);

		return parts.join(' • ');
	}

	private buildTooltip(snapshot: Snapshot): string {
		const lines: string[] = [];
		const label = (snapshot as any).name || 'Snapshot';
		lines.push(`Name: ${label}`);
		lines.push(`ID: ${snapshot.id}`);
		lines.push(`Created: ${new Date(snapshot.timestamp).toLocaleString()}`);

		const fileCount = this.getFileCount(snapshot);
		if (fileCount > 0) {
			lines.push(`Files: ${fileCount}`);
		}

		const metadata = snapshot.meta as any;
		if (metadata?.trigger) {
			lines.push(`Trigger: ${metadata.trigger}`);
		}

		return lines.join('\n');
	}

	private getFileCount(snapshot: Snapshot): number {
		// Try multiple sources for file count
		const metadata = snapshot.meta as any;
		if (metadata?.fileCount) return metadata.fileCount;
		if ((snapshot as any).fileStates?.length) return (snapshot as any).fileStates.length;
		if (snapshot.files?.length) return snapshot.files.length;
		if (metadata?.files?.length) return metadata.files.length;
		return 0;
	}
}

class FileTreeItem extends vscode.TreeItem {
	constructor(public readonly filePath: string) {
		super(filePath, vscode.TreeItemCollapsibleState.None);
		this.contextValue = "snapshotFile";
	}
}

export class SnapshotsTreeProvider
	implements vscode.TreeDataProvider<vscode.TreeItem>, vscode.Disposable
{
	private _onDidChangeTreeData = new vscode.EventEmitter<
		vscode.TreeItem | undefined
	>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
	private disposables: vscode.Disposable[] = [];

	constructor(private snapshotService: SnapshotService) {
		// Listen for new snapshots
		this.disposables.push(
			this.snapshotService.onSnapshotCreated(() => {
				this.refresh();
			}),
		);

		// TODO: Listen for other snapshot events (delete, restore)
		// this.snapshotService.on('snapshot-deleted', () => this.refresh());
		// this.snapshotService.on('snapshot-restored', () => this.refresh());
	}

	refresh(): void {
		this._onDidChangeTreeData.fire(undefined);
	}

	getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
		return element;
	}

	async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
		if (!element) {
			// Root level - show snapshots
			const snapshots = await this.snapshotService.listSnapshots();
			return snapshots.map(
				(s) =>
					new SnapshotTreeItem(s, vscode.TreeItemCollapsibleState.Collapsed),
			);
		}

			if (element instanceof SnapshotTreeItem) {
				// Show files in snapshot - try multiple sources
				let files: string[] = [];
				const snapshot = element.snapshot;
				const metadata = snapshot.meta as any;

				// Try fileStates first (from RichSnapshot)
				if ((snapshot as any).fileStates?.length > 0) {
					files = (snapshot as any).fileStates.map((fs: any) => fs.path);
				}
				// Fall back to files array
				else if (snapshot.files && snapshot.files.length > 0) {
					files = snapshot.files;
				}
				// Fall back to meta.files
				else if (metadata?.files && Array.isArray(metadata.files) && metadata.files.length > 0) {
					files = metadata.files;
				}

				return files.map((f: string) => new FileTreeItem(f));
			}

		return [];
	}

	dispose(): void {
		this._onDidChangeTreeData.dispose();
		for (const disposable of this.disposables) {
			disposable.dispose();
		}
	}
}
