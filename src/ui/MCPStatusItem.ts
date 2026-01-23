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
	 * Render status bar based on state
	 * Pure function: state in → UI out
	 */
	private render(event: StateChangeEvent): void {
		const { state, attempt, maxAttempts, reason, daemonVersion } = event;

		switch (state) {
			case "connected":
				this.statusBarItem.text = "SB·MCP ✓";
				this.statusBarItem.tooltip = daemonVersion ? `MCP connected (v${daemonVersion})` : "MCP connected";
				this.statusBarItem.backgroundColor = undefined;
				this.statusBarItem.color = new vscode.ThemeColor("testing.iconPassed");
				this.statusBarItem.show();
				break;

			case "reconnecting":
				this.statusBarItem.text = `SB·MCP $(sync~spin) (${attempt ?? 1}/${maxAttempts ?? 5})`;
				this.statusBarItem.tooltip = "Reconnecting to MCP server...";
				this.statusBarItem.backgroundColor = undefined;
				this.statusBarItem.color = undefined;
				this.statusBarItem.show();
				break;

			case "disconnected":
				this.statusBarItem.text = "SB·MCP ✗";
				this.statusBarItem.tooltip = reason
					? `Disconnected: ${reason}`
					: "Daemon not connected. Click to diagnose.";
				this.statusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.errorBackground");
				this.statusBarItem.color = undefined;
				this.statusBarItem.show();
				break;

			case "cli_missing":
				this.statusBarItem.text = "SB·MCP ⚠";
				this.statusBarItem.tooltip = "CLI not installed. Click to install.";
				this.statusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
				this.statusBarItem.color = undefined;
				this.statusBarItem.show();
				break;
		}
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
