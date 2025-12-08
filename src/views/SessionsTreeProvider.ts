import * as vscode from "vscode";
import type { StorageManager } from "../services/StorageManager";
import type { SessionCoordinator } from "../snapshot/SessionCoordinator";
import type { SessionManifest } from "../snapshot/sessionTypes";
import { logger } from "../utils/logger";
import { SessionFileTreeItem, SessionTreeItem } from "./sessionTypes";

/**
 * Tree provider for displaying sessions in the SnapBack view
 *
 * This provider displays sessions and their associated files in a hierarchical
 * tree structure. Each session is shown as a top-level item with its files
 * as child items.
 */
export class SessionsTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem>, vscode.Disposable {
	private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	// Local cache of sessions
	private sessions: SessionManifest[] = [];
	private disposables: vscode.Disposable[] = [];

	constructor(
		private sessionCoordinator: SessionCoordinator,
		private storageManager: StorageManager,
	) {
		logger.debug("SessionsTreeProvider constructor called");
		// Load persisted sessions
		this.loadSessions();

		// Listen for session finalization events
		this.disposables.push(
			this.sessionCoordinator.onSessionFinalized((session) => {
				logger.debug("SessionsTreeProvider session finalized", { sessionId: session.id });
				this.sessions.push(session);
				this.storageManager.storeSessionManifest(session);
				this.refresh();
			}),
		);
	}

	private async loadSessions(): Promise<void> {
		logger.debug("SessionsTreeProvider loading sessions");
		this.sessions = await this.storageManager.listSessionManifests();
		logger.debug("SessionsTreeProvider sessions loaded", { count: this.sessions.length });
		this.refresh();
	}

	refresh(): void {
		logger.debug("SessionsTreeProvider refresh triggered");
		this._onDidChangeTreeData.fire(undefined);
	}

	getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
		return element;
	}

	async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
		logger.debug("SessionsTreeProvider getChildren", {
			hasElement: !!element,
			sessionsCount: this.sessions.length,
		});
		if (!element) {
			// Root level - show sessions
			// Root level - show sessions
			const items = this.sessions
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
			logger.debug("SessionsTreeProvider returning items", { count: items.length });
			return items;
		}

		if (element instanceof SessionTreeItem) {
			// Show files in session
			return element.session.files.map((fileEntry) => new SessionFileTreeItem(fileEntry));
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
