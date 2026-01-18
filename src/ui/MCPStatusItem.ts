/**
 * MCPStatusItem - MCP connection status indicator
 *
 * Displays MCP status in its own status bar item positioned RIGHT NEXT TO
 * the main SnapBack item (priority 998 vs 999) so they travel together.
 *
 * States:
 * - Connected: SB·MCP ✓ (green text)
 * - Disconnected: SB·MCP ⚠ (warning background)
 * - Reconnecting: SB·MCP $(sync~spin) (1/5)
 *
 * Branding: Always shows "SB·MCP" prefix for consistency and clarity
 *
 * @packageDocumentation
 */

import * as vscode from "vscode";
import type { MCPLifecycleManager } from "../services/MCPLifecycleManager";
import { logger } from "../utils/logger";

/**
 * MCP connection states
 */
export type MCPConnectionState = "connected" | "disconnected" | "reconnecting" | "disabled";

/**
 * MCPStatusItem configuration
 */
export interface MCPStatusItemOptions {
	/** MCPLifecycleManager to observe */
	mcpManager: MCPLifecycleManager;
}

/**
 * MCPStatusItem - Displays MCP connection status next to main SnapBack item
 *
 * Design:
 * - Uses its own dedicated status bar item at priority 998
 * - Main SnapBack item is at priority 999
 * - They sit side-by-side: "🧢 SnapBack" | "SB·MCP ✓"
 * - Consistent branding: "SB·MCP" prefix always visible
 * - Status indicator follows the label (standard UX pattern)
 * - 30-second auto-give-up timer prevents stuck UI
 */
export class MCPStatusItem implements vscode.Disposable {
	private readonly mcpManager: MCPLifecycleManager;
	private readonly disposables: vscode.Disposable[] = [];

	/** Dedicated status bar item for MCP status (travels with main item) */
	private readonly statusBarItem: vscode.StatusBarItem;

	/** Current connection state */
	private state: MCPConnectionState = "disconnected";

	/** Reconnection attempt counter */
	private reconnectAttempt = 0;

	/** Timer for auto-giving up on reconnection */
	private reconnectGiveUpTimer?: NodeJS.Timeout;

	/** How long to wait in reconnecting state before giving up (30 seconds) */
	private readonly reconnectGiveUpTimeoutMs = 30000;

	/** Polling interval for health checks */
	private healthCheckInterval?: NodeJS.Timeout;

	constructor(options: MCPStatusItemOptions) {
		this.mcpManager = options.mcpManager;

		// Create dedicated status bar item
		// Priority 998 positions it right after main SnapBack item (999)
		this.statusBarItem = vscode.window.createStatusBarItem(
			"snapback.mcp-status",
			vscode.StatusBarAlignment.Left,
			998,
		);
		this.statusBarItem.command = "snapback.mcp.status";
		this.disposables.push(this.statusBarItem);

		// Initial state check
		this.updateState();

		// Subscribe to MCPLifecycleManager state changes for real-time updates
		this.disposables.push(
			this.mcpManager.onStateChange((event) => {
				this.handleStateChange(event);
			}),
		);

		// Start health monitoring (backup polling)
		this.startHealthMonitoring();

		logger.debug("MCPStatusItem initialized");
	}

	/**
	 * Handle state change events from MCPLifecycleManager
	 *
	 * Provides real-time UI updates when connection state changes.
	 */
	private handleStateChange(event: {
		state: MCPConnectionState;
		previousState: MCPConnectionState;
		reason?: string;
		attempt?: number;
		maxAttempts?: number;
	}): void {
		logger.debug("MCP state change event received", event);

		switch (event.state) {
			case "connected":
				this.notifyConnected();
				break;

			case "reconnecting":
				this.notifyReconnecting(event.attempt ?? 1, event.maxAttempts ?? 5);
				break;

			case "disconnected":
				this.notifyDisconnected(event.reason);
				break;

			case "disabled":
				this.setState("disabled");
				break;
		}
	}

	/**
	 * Start periodic health monitoring
	 *
	 * Polls MCPLifecycleManager every 10 seconds to detect state changes.
	 * This is in addition to any event-based updates.
	 */
	private startHealthMonitoring(): void {
		// Initial check
		this.checkHealth();

		// Periodic check every 10 seconds
		this.healthCheckInterval = setInterval(() => {
			this.checkHealth();
		}, 10000);
	}

	/**
	 * Check MCP health and update state
	 */
	private checkHealth(): void {
		const wasReady = this.state === "connected";
		const isReady = this.mcpManager.isServerReady();

		// Check if MCP is disabled in config
		const config = vscode.workspace.getConfiguration("snapback");
		const mcpEnabled = config.get<boolean>("mcp.enabled", true);

		if (!mcpEnabled) {
			this.setState("disabled");
			return;
		}

		if (isReady) {
			this.setState("connected");
			this.reconnectAttempt = 0;
		} else if (wasReady) {
			// Was connected, now disconnected - trigger reconnecting state briefly
			this.setState("reconnecting");
		} else if (this.state !== "reconnecting") {
			// Was already disconnected
			this.setState("disconnected");
		}
	}

	/**
	 * Update connection state and status bar display
	 */
	private setState(newState: MCPConnectionState): void {
		if (this.state === newState) {
			return;
		}

		const previousState = this.state;
		this.state = newState;

		logger.debug("MCP status changed", { from: previousState, to: newState });

		this.updateStatusBar();
	}

	/**
	 * Update state from external notification
	 *
	 * Called by MCPLifecycleManager when connection state changes.
	 */
	updateState(): void {
		this.checkHealth();
	}

	/**
	 * Notify that reconnection is in progress
	 *
	 * @param attempt - Current attempt number
	 * @param maxAttempts - Maximum attempts before giving up
	 */
	notifyReconnecting(attempt: number, maxAttempts: number): void {
		this.reconnectAttempt = attempt;

		// If we've exceeded max attempts, give up and show disconnected
		if (attempt >= maxAttempts) {
			logger.info(`MCP reconnection gave up after ${attempt} attempts`);
			this.clearReconnectGiveUpTimer();
			this.setState("disconnected");
			return;
		}

		this.setState("reconnecting");
		this.updateStatusBar();

		// Start give-up timer if not already running
		this.startReconnectGiveUpTimer();

		// Log for debugging
		logger.info(`MCP reconnecting (${attempt}/${maxAttempts})`);
	}

	/**
	 * Start a timer to automatically give up on reconnection
	 * This prevents the UI from being stuck in "reconnecting" state forever
	 */
	private startReconnectGiveUpTimer(): void {
		// Clear any existing timer
		this.clearReconnectGiveUpTimer();

		this.reconnectGiveUpTimer = setTimeout(() => {
			if (this.state === "reconnecting") {
				logger.info("MCP reconnection timed out, showing disconnected state");
				this.setState("disconnected");
				// Don't show notification - let the UI speak for itself
			}
		}, this.reconnectGiveUpTimeoutMs);
	}

	/**
	 * Clear the reconnection give-up timer
	 */
	private clearReconnectGiveUpTimer(): void {
		if (this.reconnectGiveUpTimer) {
			clearTimeout(this.reconnectGiveUpTimer);
			this.reconnectGiveUpTimer = undefined;
		}
	}

	/**
	 * Notify that connection succeeded
	 */
	notifyConnected(): void {
		this.reconnectAttempt = 0;
		this.clearReconnectGiveUpTimer();
		this.setState("connected");

		// Show brief success notification if we were disconnected
		vscode.window.setStatusBarMessage("✅ MCP connected", 3000);
	}

	/**
	 * Notify that connection failed
	 */
	notifyDisconnected(reason?: string): void {
		this.setState("disconnected");

		// Show user notification with action
		this.showDisconnectedNotification(reason);
	}

	/**
	 * Update status bar based on current state
	 */
	private updateStatusBar(): void {
		switch (this.state) {
			case "connected":
				// Show SB·MCP with green checkmark
				this.statusBarItem.text = "SB·MCP ✓";
				this.statusBarItem.tooltip = "MCP connected";
				this.statusBarItem.backgroundColor = undefined;
				this.statusBarItem.color = new vscode.ThemeColor("testing.iconPassed"); // Green
				this.statusBarItem.show();
				break;

			case "disconnected":
				this.statusBarItem.text = "SB·MCP ⚠";
				this.statusBarItem.tooltip = "MCP server disconnected. Click to diagnose.";
				this.statusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
				this.statusBarItem.color = undefined;
				this.statusBarItem.show();
				break;

			case "reconnecting":
				this.statusBarItem.text = `SB·MCP $(sync~spin) (${this.reconnectAttempt}/5)`;
				this.statusBarItem.tooltip = "Reconnecting to MCP server...";
				this.statusBarItem.backgroundColor = undefined;
				this.statusBarItem.color = undefined;
				this.statusBarItem.show();
				break;

			case "disabled":
				// Hide when disabled (user choice)
				this.statusBarItem.hide();
				break;
		}
	}

	/**
	 * Show user notification when MCP disconnects
	 */
	private showDisconnectedNotification(reason?: string): void {
		const message = reason
			? `SnapBack MCP: Connection lost - ${reason}`
			: "SnapBack MCP: Connection lost - AI assistant features limited";

		vscode.window.showWarningMessage(message, "Diagnose", "Retry", "Dismiss").then((choice) => {
			if (choice === "Diagnose") {
				vscode.commands.executeCommand("snapback.mcp.status");
			} else if (choice === "Retry") {
				// Trigger reconnection
				this.mcpManager.start().catch((err) => {
					logger.error("MCP retry failed", err);
				});
			}
		});
	}

	/**
	 * Get current connection state
	 */
	getState(): MCPConnectionState {
		return this.state;
	}

	/**
	 * Check if MCP is currently connected
	 */
	isConnected(): boolean {
		return this.state === "connected";
	}

	/**
	 * Dispose resources
	 */
	dispose(): void {
		if (this.healthCheckInterval) {
			clearInterval(this.healthCheckInterval);
		}

		this.clearReconnectGiveUpTimer();

		// Dispose all subscriptions (includes statusBarItem)
		for (const disposable of this.disposables) {
			disposable.dispose();
		}
	}
}
