import * as vscode from "vscode";
import type { StorageManager } from "../services/StorageManager.js";
import type { SessionCoordinator } from "../snapshot/SessionCoordinator.js";
import type { SessionManifest } from "../snapshot/sessionTypes.js";
import { SessionFileTreeItem, SessionTreeItem } from "./sessionTypes.js";

/**
 * Tree provider for displaying sessions in the SnapBack view
 *
 * This provider displays sessions and their associated files in a hierarchical
 * tree structure. Each session is shown as a top-level item with its files
 * as child items.
 */
export class SessionsTreeProvider
	implements vscode.TreeDataProvider<vscode.TreeItem>, vscode.Disposable
{
	private _onDidChangeTreeData = new vscode.EventEmitter<
		vscode.TreeItem | undefined
	>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	// Local cache of sessions
	private sessions: SessionManifest[] = [];
	private disposables: vscode.Disposable[] = [];

	constructor(
		private sessionCoordinator: SessionCoordinator,
		private storageManager: StorageManager,
	) {
		// Load persisted sessions
		this.loadSessions();

		// Listen for session finalization events
		this.disposables.push(
			this.sessionCoordinator.onSessionFinalized((session) => {
				this.sessions.push(session);
				this.storageManager.storeSessionManifest(session);
				this.refresh();
			}),
		);
	}

	private async loadSessions(): Promise<void> {
		this.sessions = await this.storageManager.listSessionManifests();
		this.refresh();
	}

	refresh(): void {
		this._onDidChangeTreeData.fire(undefined);
	}

	getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
		return element;
	}

	async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
		if (!element) {
			// Root level - show sessions
			// Root level - show sessions
			return this.sessions
				.sort((a, b) => b.startedAt - a.startedAt) // Sort by most recent first
				.map(
					(session) =>
						new SessionTreeItem(
							session,
							session.files.length > 0
								? vscode.TreeItemCollapsibleState.Collapsed
								: vscode.TreeItemCollapsibleState.None,
						),
				);
		}

		if (element instanceof SessionTreeItem) {
			// Show files in session
			return element.session.files.map(
				(fileEntry) => new SessionFileTreeItem(fileEntry),
			);
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
