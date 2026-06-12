/**
 * MCPStatusItem - MCP connection status indicator
 *
 * @deprecated - Status now integrated into main StatusBarManager
 * This class kept for API compatibility but does NOT create its own status bar item
 *
 * @packageDocumentation
 */

import * as vscode from "vscode";
import type { ConnectionState, StateChangeEvent } from "../services/DaemonBridge";
import { getDaemonBridge } from "../services/DaemonBridge";
import { logger } from "../utils/logger";

/**
 * MCPStatusItem - DEPRECATED: Status integrated into StatusBarManager
 *
 * This class no longer creates its own status bar item.
 * MCP status is now shown in the main StatusBarManager tooltip.
 */
export class MCPStatusItem implements vscode.Disposable {
	private readonly disposables: vscode.Disposable[] = [];
	private currentWorkspaceId: string | null = null;
	private stateChangeSubscription: vscode.Disposable | null = null;

	constructor() {
		// NO LONGER CREATES STATUS BAR ITEM
		// MCP status is now integrated into StatusBarManager
		logger.debug("MCPStatusItem: deprecated - status integrated into StatusBarManager");

		// Track active workspace for API compatibility
		this.updateActiveWorkspace();

		this.disposables.push(
			vscode.workspace.onDidChangeWorkspaceFolders(() => {
				this.updateActiveWorkspace();
			}),
		);
		this.disposables.push(
			vscode.window.onDidChangeActiveTextEditor(() => {
				this.updateActiveWorkspace();
			}),
		);

		logger.debug("MCPStatusItem initialized (workspace-aware)");
	}

	/**
	 * Update active workspace tracking and re-subscribe to service events
	 */
	private updateActiveWorkspace(): void {
		// Determine active workspace (prefer active editor's workspace)
		let workspaceId: string | null = null;

		const activeEditor = vscode.window.activeTextEditor;
		if (activeEditor) {
			const workspaceFolder = vscode.workspace.getWorkspaceFolder(activeEditor.document.uri);
			workspaceId = workspaceFolder?.uri.fsPath || null;
		}

		// Fallback to first workspace folder
		if (!workspaceId && vscode.workspace.workspaceFolders?.length) {
			workspaceId = vscode.workspace.workspaceFolders[0].uri.fsPath;
		}

		// No change, skip
		if (workspaceId === this.currentWorkspaceId) {
			return;
		}

		logger.debug("Active workspace changed", {
			previous: this.currentWorkspaceId,
			current: workspaceId,
		});

		// Unsubscribe from previous workspace's service
		if (this.stateChangeSubscription) {
			this.stateChangeSubscription.dispose();
			this.stateChangeSubscription = null;
		}

		this.currentWorkspaceId = workspaceId;

		// Subscribe to new workspace's service (if workspace exists)
		if (workspaceId) {
			const bridge = getDaemonBridge(workspaceId);

			// Subscribe to DaemonBridge state changes
			this.stateChangeSubscription = bridge.onStateChange((event) => this.render(event));

			// Initial render
			this.render({
				state: bridge.getState(),
				previousState: "disconnected",
				daemonVersion: bridge.getDaemonVersion(),
			});
		} else {
			// No workspace - show disconnected
			this.render({
				state: "disconnected",
				previousState: "disconnected",
				reason: "No workspace open",
			});
		}
	}

	/**
	 * Render status bar based on service state - DEPRECATED
	 * @deprecated Status integrated into StatusBarManager - this is now a no-op
	 */
	private render(event: StateChangeEvent): void {
		// NO-OP: Status bar item removed
		// MCP status is now shown in StatusBarManager tooltip
		logger.debug("MCPStatusItem.render (deprecated)", { state: event.state });
	}

	/**
	 * Get current state (for external queries)
	 */
	getState(): ConnectionState {
		if (!this.currentWorkspaceId) {
			return "disconnected";
		}
		const bridge = getDaemonBridge(this.currentWorkspaceId);
		return bridge.getState();
	}

	/**
	 * Check if connected
	 */
	isConnected(): boolean {
		if (!this.currentWorkspaceId) {
			return false;
		}
		const bridge = getDaemonBridge(this.currentWorkspaceId);
		return bridge.isConnected();
	}

	/**
	 * Dispose resources
	 */
	dispose(): void {
		if (this.stateChangeSubscription) {
			this.stateChangeSubscription.dispose();
		}
		for (const d of this.disposables) {
			d.dispose();
		}
	}
}
