/**
 * MCPStatusItem - MCP connection status indicator (Workspace-Aware)
 *
 * Displays MCP status in its own status bar item positioned RIGHT NEXT TO
 * the main SnapBack item (priority 998 vs 999) so they travel together.
 *
 * ## Workspace Isolation Architecture
 *
 * This component tracks the active workspace folder and subscribes to that
 * workspace's DaemonBridge.onStateChange for real-time UI updates.
 *
 * Key fix: Removed global MCP process detection (detectMCPProcesses) which
 * checked ALL system processes instead of current workspace daemon state.
 *
 * States:
 * - Connected: SB·MCP ✓ (green text)
 * - Disconnected: SB·MCP ✗ (error background)
 * - Reconnecting: SB·MCP $(sync~spin) (1/5)
 * - CLI Missing: SB·MCP ⚠ (warning background)
 *
 * Branding: Always shows "SB·MCP" prefix for consistency and clarity
 *
 * @packageDocumentation
 */

import { detectAIClients, detectWorkspaceConfig } from "@snapback/mcp-config";
import * as vscode from "vscode";
import type { ConnectionState, StateChangeEvent } from "../services/DaemonBridge";
import { getDaemonBridge } from "../services/DaemonBridge";
import { logger } from "../utils/logger";

/**
 * MCPStatusItem - Displays MCP connection status next to main SnapBack item
 *
 * WORKSPACE-AWARE: Tracks active workspace and shows that workspace's daemon status.
 * No global checks. No polling. Just event-driven updates from workspace daemon.
 *
 * Design:
 * - Uses its own dedicated status bar item at priority 998
 * - Main SnapBack item is at priority 999
 * - They sit side-by-side: "🧢 SnapBack" | "SB·MCP ✓"
 * - Consistent branding: "SB·MCP" prefix always visible
 * - Status indicator follows the label (standard UX pattern)
 */
export class MCPStatusItem implements vscode.Disposable {
	private readonly disposables: vscode.Disposable[] = [];
	private currentWorkspaceId: string | null = null;
	private stateChangeSubscription: vscode.Disposable | null = null;

	/** Dedicated status bar item for MCP status (travels with main item) */
	private readonly statusBarItem: vscode.StatusBarItem;

	constructor() {
		// Create dedicated status bar item
		// Priority 998 positions it right after main SnapBack item (999)
		this.statusBarItem = vscode.window.createStatusBarItem(
			"snapback.mcp-status",
			vscode.StatusBarAlignment.Left,
			998,
		);
		this.statusBarItem.command = "snapback.mcp.status";
		this.disposables.push(this.statusBarItem);

		// Track active workspace and subscribe to its daemon
		this.updateActiveWorkspace();

		// Listen for workspace folder changes
		this.disposables.push(
			vscode.workspace.onDidChangeWorkspaceFolders(() => {
				this.updateActiveWorkspace();
			}),
		);

		// Listen for active editor changes (indicates workspace switch in multi-root)
		this.disposables.push(
			vscode.window.onDidChangeActiveTextEditor(() => {
				this.updateActiveWorkspace();
			}),
		);

		logger.debug("MCPStatusItem initialized (workspace-aware)");
	}

	/**
	 * Update active workspace tracking and re-subscribe to daemon events
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

		// Unsubscribe from previous workspace's daemon
		if (this.stateChangeSubscription) {
			this.stateChangeSubscription.dispose();
			this.stateChangeSubscription = null;
		}

		this.currentWorkspaceId = workspaceId;

		// Subscribe to new workspace's daemon (if workspace exists)
		if (workspaceId) {
			const bridge = getDaemonBridge(workspaceId);

			// Subscribe to state changes
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
	 * Render status bar based on daemon state (synchronous, event-driven)
	 */
	private render(event: StateChangeEvent): void {
		const { state, attempt, maxAttempts, daemonVersion, reason } = event;

		switch (state) {
			case "connected":
				this.statusBarItem.text = "SB·MCP ✓";
				this.statusBarItem.tooltip = this.buildTooltip("connected", daemonVersion);
				this.statusBarItem.backgroundColor = undefined;
				this.statusBarItem.color = new vscode.ThemeColor("testing.iconPassed");
				this.statusBarItem.show();
				break;

			case "degraded":
				this.statusBarItem.text = "SB·MCP ~";
				this.statusBarItem.tooltip = this.buildTooltip("degraded", daemonVersion, undefined, undefined, reason);
				this.statusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
				this.statusBarItem.color = undefined;
				this.statusBarItem.show();
				break;

			case "reconnecting":
				this.statusBarItem.text = `SB·MCP $(sync~spin) (${attempt ?? 1}/${maxAttempts ?? 5})`;
				this.statusBarItem.tooltip = this.buildTooltip("reconnecting", undefined, attempt, maxAttempts);
				this.statusBarItem.backgroundColor = undefined;
				this.statusBarItem.color = undefined;
				this.statusBarItem.show();
				break;

			case "disconnected":
				this.statusBarItem.text = "SB·MCP ✗";
				this.statusBarItem.tooltip = this.buildTooltip("disconnected", undefined, undefined, undefined, reason);
				this.statusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.errorBackground");
				this.statusBarItem.color = undefined;
				this.statusBarItem.show();
				break;

			case "cli_missing":
				this.statusBarItem.text = "SB·MCP ⚠";
				this.statusBarItem.tooltip = this.buildTooltip("cli_missing");
				this.statusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
				this.statusBarItem.color = undefined;
				this.statusBarItem.show();
				break;
		}
	}

	/**
	 * Build rich tooltip with server details (workspace-aware)
	 */
	private buildTooltip(
		state: ConnectionState,
		daemonVersion?: string,
		attempt?: number,
		maxAttempts?: number,
		reason?: string,
	): vscode.MarkdownString {
		const md = new vscode.MarkdownString();
		md.isTrusted = true;

		// Header based on state
		switch (state) {
			case "connected":
				md.appendMarkdown(`**MCP Status:** ✅ Connected${daemonVersion ? ` (v${daemonVersion})` : ""}\n\n`);
				break;
			case "degraded":
				md.appendMarkdown(`**MCP Status:** ⚠️ Degraded${daemonVersion ? ` (v${daemonVersion})` : ""}\n\n`);
				md.appendMarkdown("*Socket connected but daemon not responding to health checks*\n\n");
				if (reason) {
					md.appendMarkdown(`*${reason}*\n\n`);
				}
				break;
			case "reconnecting":
				md.appendMarkdown(`**MCP Status:** 🔄 Reconnecting (${attempt ?? 1}/${maxAttempts ?? 5})\n\n`);
				break;
			case "disconnected":
				md.appendMarkdown("**MCP Status:** ❌ Disconnected\n\n");
				if (reason) {
					md.appendMarkdown(`*${reason}*\n\n`);
				}
				break;
			case "cli_missing":
				md.appendMarkdown("**MCP Status:** ⚠️ CLI Not Installed\n\n");
				break;
		}

		// Show configured AI clients (use current workspace, not hardcoded first)
		const workspaceRoot = this.currentWorkspaceId;
		const detection = detectAIClients({ cwd: workspaceRoot || undefined });
		const configuredClients = detection.detected.filter((c) => c.hasSnapback);
		const unconfiguredClients = detection.detected.filter((c) => !c.hasSnapback);

		if (configuredClients.length > 0) {
			md.appendMarkdown("**Configured Clients:**\n");
			for (const client of configuredClients) {
				md.appendMarkdown(`- ✅ ${client.displayName}\n`);
			}
			md.appendMarkdown("\n");
		}

		if (unconfiguredClients.length > 0) {
			md.appendMarkdown("**Detected (not configured):**\n");
			for (const client of unconfiguredClients) {
				md.appendMarkdown(`- ⚪ ${client.displayName}\n`);
			}
			md.appendMarkdown("\n");
		}

		// Show workspace config if present
		if (workspaceRoot) {
			const workspaceConfig = detectWorkspaceConfig(workspaceRoot);
			if (workspaceConfig) {
				md.appendMarkdown(`**Workspace Config:** \`${workspaceConfig.type}\`\n\n`);
			}
		}

		// Action hint
		md.appendMarkdown("---\n\n");
		switch (state) {
			case "connected":
				md.appendMarkdown("*Click to view MCP status details*");
				break;
			case "degraded":
				md.appendMarkdown("*Click to reconnect or diagnose*");
				break;
			case "disconnected":
				md.appendMarkdown("*Click to diagnose connection*");
				break;
			case "cli_missing":
				md.appendMarkdown("*Click to install CLI*");
				break;
			default:
				md.appendMarkdown("*Click for options*");
		}

		return md;
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
