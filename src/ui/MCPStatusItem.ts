/**
 * MCPStatusItem - MCP connection status indicator (Simplified)
 *
 * Displays MCP status in its own status bar item positioned RIGHT NEXT TO
 * the main SnapBack item (priority 998 vs 999) so they travel together.
 *
 * ## Simplified Architecture (MCP Architecture Simplification)
 *
 * This component subscribes directly to DaemonBridge.onStateChange for
 * real-time UI updates. No polling. No caching. Just renders what it's told.
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

import { detectAIClients, detectMCPProcesses, detectWorkspaceConfig } from "@snapback/mcp-config";
import * as vscode from "vscode";
import type { ConnectionState, DaemonBridge, StateChangeEvent } from "../services/DaemonBridge";
import { logger } from "../utils/logger";

/**
 * MCPStatusItem configuration
 */
export interface MCPStatusItemOptions {
	/** DaemonBridge instance to observe for state changes */
	bridge: DaemonBridge;
}

/**
 * MCPStatusItem - Displays MCP connection status next to main SnapBack item
 *
 * SIMPLIFIED: No polling. No caching. Just renders what DaemonBridge tells it.
 *
 * Design:
 * - Uses its own dedicated status bar item at priority 998
 * - Main SnapBack item is at priority 999
 * - They sit side-by-side: "🧢 SnapBack" | "SB·MCP ✓"
 * - Consistent branding: "SB·MCP" prefix always visible
 * - Status indicator follows the label (standard UX pattern)
 */
export class MCPStatusItem implements vscode.Disposable {
	private readonly bridge: DaemonBridge;
	private readonly disposables: vscode.Disposable[] = [];

	/** Dedicated status bar item for MCP status (travels with main item) */
	private readonly statusBarItem: vscode.StatusBarItem;

	constructor(options: MCPStatusItemOptions) {
		this.bridge = options.bridge;

		// Create dedicated status bar item
		// Priority 998 positions it right after main SnapBack item (999)
		this.statusBarItem = vscode.window.createStatusBarItem(
			"snapback.mcp-status",
			vscode.StatusBarAlignment.Left,
			998,
		);
		this.statusBarItem.command = "snapback.mcp.status";
		this.disposables.push(this.statusBarItem);

		// Subscribe to state changes - THE ONLY DATA SOURCE
		this.disposables.push(this.bridge.onStateChange((event) => this.render(event)));

		// Initial render based on current state
		this.render({
			state: this.bridge.getState(),
			previousState: "disconnected",
			daemonVersion: this.bridge.getDaemonVersion(),
		});

		logger.debug("MCPStatusItem initialized (simplified)");
	}

	/**
	 * Cache for MCP process status to avoid excessive process checks
	 */
	private mcpProcessCache: { running: boolean; checkedAt: number } | null = null;
	private readonly MCP_PROCESS_CACHE_TTL_MS = 10000; // 10 second cache

	/**
	 * Check if MCP server process is running (with caching)
	 */
	private async checkMCPProcessRunning(): Promise<boolean> {
		const now = Date.now();
		if (this.mcpProcessCache && now - this.mcpProcessCache.checkedAt < this.MCP_PROCESS_CACHE_TTL_MS) {
			return this.mcpProcessCache.running;
		}

		try {
			const health = await detectMCPProcesses();
			const running = health.snapbackRunning;
			this.mcpProcessCache = { running, checkedAt: now };
			return running;
		} catch (err) {
			logger.debug("MCP process detection failed", { error: err instanceof Error ? err.message : String(err) });
			return false;
		}
	}

	/**
	 * Render status bar based on state
	 * Now includes MCP process detection for more accurate status
	 */
	private render(event: StateChangeEvent): void {
		const { state, attempt, maxAttempts, daemonVersion } = event;

		// For disconnected/cli_missing states, check if MCP process is running
		// to show a more accurate status
		if (state === "disconnected" || state === "cli_missing") {
			this.renderWithProcessCheck(event);
			return;
		}

		switch (state) {
			case "connected":
				this.statusBarItem.text = "SB·MCP ✓";
				this.statusBarItem.tooltip = this.buildTooltip("connected", daemonVersion);
				this.statusBarItem.backgroundColor = undefined;
				this.statusBarItem.color = new vscode.ThemeColor("testing.iconPassed");
				this.statusBarItem.show();
				break;

			case "reconnecting":
				this.statusBarItem.text = `SB·MCP $(sync~spin) (${attempt ?? 1}/${maxAttempts ?? 5})`;
				this.statusBarItem.tooltip = this.buildTooltip("reconnecting", undefined, attempt, maxAttempts);
				this.statusBarItem.backgroundColor = undefined;
				this.statusBarItem.color = undefined;
				this.statusBarItem.show();
				break;
		}
	}

	/**
	 * Render for disconnected/cli_missing states with MCP process check
	 * Shows "partial" status if MCP tools are working even without daemon
	 */
	private async renderWithProcessCheck(event: StateChangeEvent): Promise<void> {
		const { state, reason } = event;
		const mcpProcessRunning = await this.checkMCPProcessRunning();

		if (state === "disconnected") {
			if (mcpProcessRunning) {
				// MCP server is running, show "partial" status (tools work, daemon doesn't)
				this.statusBarItem.text = "SB·MCP ~";
				this.statusBarItem.tooltip = this.buildTooltip(
					"disconnected",
					undefined,
					undefined,
					undefined,
					reason,
					true,
				);
				this.statusBarItem.backgroundColor = undefined;
				this.statusBarItem.color = new vscode.ThemeColor("editorWarning.foreground");
			} else {
				this.statusBarItem.text = "SB·MCP ✗";
				this.statusBarItem.tooltip = this.buildTooltip(
					"disconnected",
					undefined,
					undefined,
					undefined,
					reason,
					false,
				);
				this.statusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.errorBackground");
				this.statusBarItem.color = undefined;
			}
		} else if (state === "cli_missing") {
			if (mcpProcessRunning) {
				// MCP server is running even without CLI - show partial status
				this.statusBarItem.text = "SB·MCP ~";
				this.statusBarItem.tooltip = this.buildTooltip(
					"cli_missing",
					undefined,
					undefined,
					undefined,
					undefined,
					true,
				);
				this.statusBarItem.backgroundColor = undefined;
				this.statusBarItem.color = new vscode.ThemeColor("editorWarning.foreground");
			} else {
				this.statusBarItem.text = "SB·MCP ⚠";
				this.statusBarItem.tooltip = this.buildTooltip(
					"cli_missing",
					undefined,
					undefined,
					undefined,
					undefined,
					false,
				);
				this.statusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
				this.statusBarItem.color = undefined;
			}
		}

		this.statusBarItem.show();
	}

	/**
	 * Build rich tooltip with server details
	 * Now includes MCP process detection for accurate status reporting
	 */
	private buildTooltip(
		state: ConnectionState,
		daemonVersion?: string,
		attempt?: number,
		maxAttempts?: number,
		reason?: string,
		mcpProcessRunning?: boolean,
	): vscode.MarkdownString {
		const md = new vscode.MarkdownString();
		md.isTrusted = true;

		// Header based on state
		switch (state) {
			case "connected":
				md.appendMarkdown(`**MCP Status:** ✅ Connected${daemonVersion ? ` (v${daemonVersion})` : ""}\n\n`);
				break;
			case "reconnecting":
				md.appendMarkdown(`**MCP Status:** 🔄 Reconnecting (${attempt ?? 1}/${maxAttempts ?? 5})\n\n`);
				break;
			case "disconnected":
				// Show different message if MCP server is running but daemon is not
				if (mcpProcessRunning) {
					md.appendMarkdown("**MCP Status:** 🟡 MCP Tools Active\n\n");
					md.appendMarkdown("*MCP server is running, but CLI daemon is not connected.*\n");
					md.appendMarkdown(
						"*Your AI tools work fine. Some advanced features (proactive protection) require the daemon.*\n\n",
					);
				} else {
					md.appendMarkdown("**MCP Status:** ❌ Disconnected\n\n");
					if (reason) {
						md.appendMarkdown(`*${reason}*\n\n`);
					}
				}
				break;
			case "cli_missing":
				md.appendMarkdown("**MCP Status:** ⚠️ CLI Not Installed\n\n");
				if (mcpProcessRunning) {
					md.appendMarkdown("*MCP server is running. Install CLI for enhanced features.*\n\n");
				}
				break;
		}

		// Show configured AI clients
		const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
		const detection = detectAIClients({ cwd: workspaceRoot });
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

		// Show MCP server process status
		if (mcpProcessRunning !== undefined) {
			const processIcon = mcpProcessRunning ? "✅" : "⚪";
			const processText = mcpProcessRunning ? "Running" : "Not detected";
			md.appendMarkdown(`**MCP Server Process:** ${processIcon} ${processText}\n\n`);
		}

		// Action hint
		md.appendMarkdown("---\n\n");
		switch (state) {
			case "connected":
				md.appendMarkdown("*Click to view MCP status details*");
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
		return this.bridge.getState();
	}

	/**
	 * Check if connected
	 */
	isConnected(): boolean {
		return this.bridge.isConnected();
	}

	/**
	 * Dispose resources
	 */
	dispose(): void {
		for (const d of this.disposables) {
			d.dispose();
		}
	}
}
