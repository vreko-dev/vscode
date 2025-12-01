/**
 * SessionsTreeDataProvider - VS Code TreeView for active and recent sessions
 *
 * Features:
 * - Shows active session with file count and duration
 * - Lists recent finalized sessions (last 10)
 * - Session expansion shows file changes
 * - Context menu: Finalize, Rollback, Reveal
 *
 * Performance:
 * - Lazy loading of session details
 * - Refresh only on session events
 */

import type { SessionChange } from "@snapback/contracts/session";
import { logger } from "@snapback/infrastructure";
import type { SessionManager } from "@snapback/sdk";
import * as vscode from "vscode";

/**
 * Tree item types
 */
type SessionTreeItem =
	| ActiveSessionItem
	| FinishedSessionItem
	| SessionFileItem;

interface ActiveSessionItem {
	type: "active";
	sessionId: string;
	fileCount: number;
	startedAt: number;
}

interface FinishedSessionItem {
	type: "finished";
	sessionId: string;
	name?: string;
	changeCount: number;
	startedAt: number;
	endedAt: number;
}

interface SessionFileItem {
	type: "file";
	sessionId: string;
	path: string;
	operation: "created" | "modified" | "deleted" | "renamed";
	fromPath?: string;
}

/**
 * VS Code TreeDataProvider for sessions
 */
export class SessionsTreeDataProvider
	implements vscode.TreeDataProvider<SessionTreeItem>
{
	private _onDidChangeTreeData = new vscode.EventEmitter<
		SessionTreeItem | undefined | undefined
	>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	constructor(private readonly sessionManager: SessionManager) {}

	/**
	 * Refresh the tree view
	 */
	refresh(): void {
		this._onDidChangeTreeData.fire(undefined);
	}

	/**
	 * Get tree item representation
	 */
	getTreeItem(element: SessionTreeItem): vscode.TreeItem {
		if (element.type === "active") {
			return this.getActiveSessionTreeItem(element);
		}

		if (element.type === "finished") {
			return this.getFinishedSessionTreeItem(element);
		}

		// SessionFileItem
		return this.getFileTreeItem(element);
	}

	/**
	 * Get children for a tree item
	 */
	async getChildren(element?: SessionTreeItem): Promise<SessionTreeItem[]> {
		// Root level: Active session + recent finalized sessions
		if (!element) {
			const items: SessionTreeItem[] = [];

			// Check for active session
			const current = await this.sessionManager.current();

			if (current.sessionId) {
				const { sessionId, changeCount } = current;
				const startedAt = Date.now(); // In a real app, track this properly

				items.push({
					type: "active",
					sessionId,
					fileCount: changeCount,
					startedAt,
				});
			}

			// Get recent finalized sessions
			const sessions = await this.sessionManager.list(10);

			if (sessions.length > 0) {
				for (const summary of sessions) {
					items.push({
						type: "finished",
						sessionId: summary.sessionId,
						name: summary.name,
						changeCount: summary.changeCount,
						startedAt: new Date(summary.startedAt).getTime(),
						endedAt: summary.endedAt
							? new Date(summary.endedAt).getTime()
							: Date.now(),
					});
				}
			}

			return items;
		}

		// Session children: File changes
		if (element.type === "active" || element.type === "finished") {
			return this.getSessionFileChildren(element.sessionId);
		}

		// Files have no children
		return [];
	}

	/**
	 * Get file changes for a session
	 */
	private async getSessionFileChildren(
		sessionId: string,
	): Promise<SessionFileItem[]> {
		try {
			const manifest = await this.sessionManager.getManifest(sessionId);

			// Convert SessionChange to SessionFileItem
			return manifest.filesChanged
				.slice(0, 100)
				.map((change: SessionChange) => ({
					type: "file" as const,
					sessionId,
					path: change.p,
					operation: change.op,
					fromPath: change.from,
				}));
		} catch (error) {
			logger.error("Failed to load session manifest", {
				sessionId,
				error: error instanceof Error ? error.message : String(error),
			});
			return [];
		}
	}

	/**
	 * Create tree item for active session
	 */
	private getActiveSessionTreeItem(
		element: ActiveSessionItem,
	): vscode.TreeItem {
		const duration = this.formatDuration(Date.now() - element.startedAt);
		const label = `● Recording (${element.fileCount} files, ${duration})`;

		const item = new vscode.TreeItem(
			label,
			vscode.TreeItemCollapsibleState.Collapsed,
		);

		item.iconPath = new vscode.ThemeIcon(
			"record",
			new vscode.ThemeColor("charts.red"),
		);
		item.contextValue = "activeSession";
		item.tooltip = `Active session ${element.sessionId}\nStarted: ${new Date(element.startedAt).toLocaleString()}`;

		// Command to reveal session details
		item.command = {
			command: "snapback.session.reveal",
			title: "Reveal Session",
			arguments: [element.sessionId],
		};

		return item;
	}

	/**
	 * Create tree item for finalized session
	 */
	private getFinishedSessionTreeItem(
		element: FinishedSessionItem,
	): vscode.TreeItem {
		const label =
			element.name || `Session ${new Date(element.startedAt).toLocaleString()}`;

		const item = new vscode.TreeItem(
			label,
			vscode.TreeItemCollapsibleState.Collapsed,
		);

		const duration = this.formatDuration(element.endedAt - element.startedAt);

		item.description = `${element.changeCount} files, ${duration}`;
		item.iconPath = new vscode.ThemeIcon("archive");
		item.contextValue = "finishedSession";
		item.tooltip = `Session ${element.sessionId}\nStarted: ${new Date(element.startedAt).toLocaleString()}\nEnded: ${new Date(element.endedAt).toLocaleString()}`;

		// Command to reveal session details
		item.command = {
			command: "snapback.session.reveal",
			title: "Reveal Session",
			arguments: [element.sessionId],
		};

		return item;
	}

	/**
	 * Create tree item for file change
	 */
	private getFileTreeItem(element: SessionFileItem): vscode.TreeItem {
		const label = element.path;
		const item = new vscode.TreeItem(label);

		// Set icon based on operation
		const iconMap = {
			created: "diff-added",
			modified: "diff-modified",
			deleted: "diff-removed",
			renamed: "diff-renamed",
		};

		item.iconPath = new vscode.ThemeIcon(iconMap[element.operation]);
		item.contextValue = "sessionFile";

		// Tooltip with operation details
		let tooltip = `${element.operation.toUpperCase()}: ${element.path}`;
		if (element.fromPath) {
			tooltip += `\nFrom: ${element.fromPath}`;
		}
		item.tooltip = tooltip;

		return item;
	}

	/**
	 * Format duration in human-readable format
	 */
	private formatDuration(ms: number): string {
		const seconds = Math.floor(ms / 1000);
		const minutes = Math.floor(seconds / 60);
		const hours = Math.floor(minutes / 60);

		if (hours > 0) {
			return `${hours}h ${minutes % 60}m`;
		}

		if (minutes > 0) {
			return `${minutes}m`;
		}

		return `${seconds}s`;
	}
}
