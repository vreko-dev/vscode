/**
 * MCPStatusItem - MCP connection status indicator
 *
 * Provides visibility into MCP server connection state via the StatusBarManager
 * message queue system. Shows connection status and provides troubleshooting actions.
 *
 * States:
 * - Connected: 🔌 MCP (green, low priority - hidden when healthy)
 * - Disconnected: 🔌 MCP ⚠ (warning background, high priority)
 * - Reconnecting: 🔄 MCP (medium priority, shows attempt count)
 *
 * @packageDocumentation
 */

import * as vscode from "vscode";
import type { MCPLifecycleManager } from "../services/MCPLifecycleManager";
import { logger } from "../utils/logger";
import type { StatusBarManager } from "./StatusBarManager";

/**
 * MCP connection states
 */
export type MCPConnectionState = "connected" | "disconnected" | "reconnecting" | "disabled";

/**
 * MCPStatusItem configuration
 */
export interface MCPStatusItemOptions {
	/** StatusBarManager for message queue integration */
	statusBarManager: StatusBarManager;
	/** MCPLifecycleManager to observe */
	mcpManager: MCPLifecycleManager;
}

/**
 * MCPStatusItem - Displays MCP connection status in status bar
 *
 * Design:
 * - Uses StatusBarManager's message queue (no separate status bar item)
 * - Only shows when disconnected or reconnecting (invisible when healthy)
 * - Provides click action to open MCP status/diagnose command
 * - Auto-updates on connection state changes
 */
export class MCPStatusItem implements vscode.Disposable {
	private readonly statusBarManager: StatusBarManager;
	private readonly mcpManager: MCPLifecycleManager;
	private readonly disposables: vscode.Disposable[] = [];

	/** Message ID for queue management */
	private readonly MESSAGE_ID = "mcp-status";

	/** Current connection state */
	private state: MCPConnectionState = "disconnected";

	/** Reconnection attempt counter */
	private reconnectAttempt = 0;

	/** Polling interval for health checks */
	private healthCheckInterval?: NodeJS.Timeout;

	constructor(options: MCPStatusItemOptions) {
		this.statusBarManager = options.statusBarManager;
		this.mcpManager = options.mcpManager;

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
				this.notifyReconnecting(event.attempt ?? 1, event.maxAttempts ?? 3);
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
		this.setState("reconnecting");
		this.updateStatusBar();

		// Log for debugging
		logger.info(`MCP reconnecting (${attempt}/${maxAttempts})`);
	}

	/**
	 * Notify that connection succeeded
	 */
	notifyConnected(): void {
		this.reconnectAttempt = 0;
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
		// First, remove any existing MCP message
		this.statusBarManager.dequeueMessage(this.MESSAGE_ID);

		switch (this.state) {
			case "connected":
				// Don't show anything when connected (invisible success)
				// Could optionally show a low-priority "connected" message
				break;

			case "disconnected":
				this.statusBarManager.enqueueMessage({
					id: this.MESSAGE_ID,
					priority: "high",
					text: "🔌 MCP ⚠",
					tooltip: "MCP server disconnected. Click to diagnose.",
					backgroundColor: "statusBarItem.warningBackground",
					command: "snapback.mcp.status",
					duration: 0, // Persistent until state changes
				});
				break;

			case "reconnecting":
				this.statusBarManager.enqueueMessage({
					id: this.MESSAGE_ID,
					priority: "medium",
					text: `🔄 MCP (${this.reconnectAttempt}/3)`,
					tooltip: "Reconnecting to MCP server...",
					command: "snapback.mcp.status",
					duration: 0, // Persistent until state changes
				});
				break;

			case "disabled":
				// Don't show anything when disabled (user choice)
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

		// Remove status bar message
		this.statusBarManager.dequeueMessage(this.MESSAGE_ID);

		// Dispose all subscriptions
		for (const disposable of this.disposables) {
			disposable.dispose();
		}
	}
}
