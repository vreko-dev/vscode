import * as vscode from "vscode";
import { logger } from "../utils/logger";
import { type DaemonBridge, getDaemonBridge } from "./DaemonBridge";
import { getMCPModeManager, MCPMode } from "./MCPModeManager";
import { getMCPTelemetry } from "./MCPTelemetry";
import type { RemoteMCPClient } from "./RemoteMCPClient";

/**
 * MCP connection state
 */
export type MCPConnectionState = "connected" | "disconnected" | "reconnecting" | "disabled";

/**
 * State change event payload
 */
export interface MCPStateChangeEvent {
	state: MCPConnectionState;
	previousState: MCPConnectionState;
	reason?: string;
	attempt?: number;
	maxAttempts?: number;
}

/**
 * State change listener type
 */
export type MCPStateChangeListener = (event: MCPStateChangeEvent) => void;

export interface MCPStartOptions {
	extensionPath: string;
	dbPath: string;
	timeout?: number;

	// Remote MCP options
	remoteServerUrl?: string;
	remoteAuthToken?: string;

	// New authentication options
	remoteAuthType?: "bearer" | "apikey";
	remoteApiKey?: string;
}

export class MCPLifecycleManager implements vscode.Disposable {
	private remoteClient: RemoteMCPClient | null = null;
	private remoteServerUrl?: string;
	private remoteAuthToken?: string;
	private remoteAuthType?: "bearer" | "apikey";
	private remoteApiKey?: string;

	/** Current connection state */
	private connectionState: MCPConnectionState = "disconnected";

	/** Server version from last successful connection */
	private serverVersion?: string;

	/** State change listeners */
	private readonly stateChangeListeners: MCPStateChangeListener[] = [];

	/** Event emitter for VS Code integration */
	private readonly _onStateChange = new vscode.EventEmitter<MCPStateChangeEvent>();
	readonly onStateChange = this._onStateChange.event;

	/** Current MCP mode */
	private currentMode: MCPMode = MCPMode.UNCONFIGURED;

	/** DaemonBridge connection subscription */
	private daemonConnectionSubscription: vscode.Disposable | null = null;

	/** DaemonBridge reference for LOCAL_CLI mode */
	private daemonBridge: DaemonBridge | null = null;

	constructor(options: MCPStartOptions) {
		this.remoteServerUrl = options.remoteServerUrl;
		this.remoteAuthToken = options.remoteAuthToken;
		this.remoteAuthType = options.remoteAuthType;
		this.remoteApiKey = options.remoteApiKey;
	}

	/**
	 * Get current connection state
	 */
	getConnectionState(): MCPConnectionState {
		return this.connectionState;
	}

	/**
	 * Add state change listener
	 */
	addStateChangeListener(listener: MCPStateChangeListener): void {
		this.stateChangeListeners.push(listener);
	}

	/**
	 * Remove state change listener
	 */
	removeStateChangeListener(listener: MCPStateChangeListener): void {
		const index = this.stateChangeListeners.indexOf(listener);
		if (index >= 0) {
			this.stateChangeListeners.splice(index, 1);
		}
	}

	/**
	 * Emit state change event
	 */
	private emitStateChange(
		newState: MCPConnectionState,
		options?: { reason?: string; attempt?: number; maxAttempts?: number },
	): void {
		const previousState = this.connectionState;
		const event: MCPStateChangeEvent = {
			state: newState,
			previousState,
			reason: options?.reason,
			attempt: options?.attempt,
			maxAttempts: options?.maxAttempts,
		};

		this.connectionState = newState;

		// Track telemetry (G10: MCP metrics)
		getMCPTelemetry().trackConnectionStateChange(newState, {
			previousState,
			reason: options?.reason,
			serverVersion: this.serverVersion,
			attempt: options?.attempt,
			maxAttempts: options?.maxAttempts,
		});

		// Notify all listeners
		for (const listener of this.stateChangeListeners) {
			try {
				listener(event);
			} catch (err) {
				logger.warn("MCP state change listener error", { error: err });
			}
		}

		// Emit VS Code event
		this._onStateChange.fire(event);

		logger.debug("MCP state changed", { from: previousState, to: newState });
	}

	/**
	 * Start the MCP server based on detected mode
	 *
	 * Key principle: LOCAL_CLI and REMOTE modes are mutually exclusive.
	 * - LOCAL_CLI: Uses DaemonBridge for full MCP functionality
	 * - REMOTE_API: Uses Remote API for auth only (degraded)
	 */
	async start(): Promise<void> {
		// Check if MCP is enabled in configuration
		const config = vscode.workspace.getConfiguration("snapback");
		const mcpEnabled = config.get<boolean>("mcp.enabled", true);

		if (!mcpEnabled) {
			logger.info("MCP integration is disabled in configuration");
			this.emitStateChange("disabled", { reason: "Disabled in settings" });
			return;
		}

		// Detect mode using MCPModeManager
		const modeManager = getMCPModeManager();
		const mode = await modeManager.detectMode();

		logger.info(`MCP mode detected: ${mode}`);

		switch (mode) {
			case MCPMode.LOCAL_CLI:
				// LOCAL_CLI mode: Do NOT start remote MCP client
				// DaemonBridge handles all MCP communication via local CLI
				logger.info("LOCAL_CLI mode: Remote MCP disabled, using DaemonBridge");
				this.currentMode = MCPMode.LOCAL_CLI;
				return this.startLocalCLIMode();

			case MCPMode.REMOTE_API:
				// REMOTE_API mode: Connect to remote for auth/licensing only
				// No full MCP tool calls - just API verification
				logger.info("REMOTE_API mode: Limited remote API for auth only");
				return this.startRemoteAPIOnly();

			default:
				logger.info("UNCONFIGURED mode: No MCP connection");
				this.emitStateChange("disconnected", { reason: "MCP not configured" });
				return;
		}
	}

	/**
	 * Start LOCAL_CLI mode with DaemonBridge
	 * Tracks daemon connection state and forwards to MCPStatusItem
	 */
	private async startLocalCLIMode(): Promise<void> {
		this.daemonBridge = getDaemonBridge();

		// Subscribe to daemon connection changes
		this.daemonConnectionSubscription = this.daemonBridge.onConnectionChanged((connected) => {
			if (connected) {
				this.emitStateChange("connected", { reason: "Daemon connected" });
			} else {
				// Get reconnection attempt count from DaemonBridge
				const attempt = this.daemonBridge?.getReconnectAttempt() ?? 0;
				const maxAttempts = this.daemonBridge?.getMaxReconnectAttempts() ?? 5;

				if (attempt > 0) {
					// Actively reconnecting
					this.emitStateChange("reconnecting", {
						reason: "Daemon reconnecting",
						attempt,
						maxAttempts,
					});
				} else {
					// First disconnect (before any reconnect attempts)
					this.emitStateChange("disconnected", { reason: "Daemon disconnected" });
				}
			}
		});

		// Initial connection attempt
		try {
			const connected = await this.daemonBridge.connect();
			if (connected) {
				this.emitStateChange("connected", { reason: "Local CLI mode active" });
				logger.info("LOCAL_CLI mode: DaemonBridge connected");
			} else {
				// Daemon not connected yet - DaemonBridge will auto-reconnect
				this.emitStateChange("reconnecting", { reason: "Daemon connecting", attempt: 1, maxAttempts: 5 });
				logger.debug("LOCAL_CLI mode: DaemonBridge connecting...");
			}
		} catch (error) {
			logger.warn("LOCAL_CLI mode: Initial daemon connection failed", {
				error: error instanceof Error ? error.message : String(error),
			});
			// DaemonBridge will auto-reconnect with exponential backoff
			this.emitStateChange("reconnecting", { reason: "Daemon connecting", attempt: 1, maxAttempts: 5 });
		}
	}

	/**
	 * Start remote API connection for auth/licensing only (not full MCP)
	 * This is the degraded experience for users without CLI
	 */
	private async startRemoteAPIOnly(): Promise<void> {
		// Only check API key validity, don't start full MCP client
		const config = vscode.workspace.getConfiguration("snapback");
		const apiKey = config.get<string>("apiKey", "") || process.env.SNAPBACK_API_KEY;

		if (!apiKey) {
			this.emitStateChange("disconnected", { reason: "No API key for remote API" });
			return;
		}

		// In REMOTE_API mode, we don't start a full RemoteMCPClient
		// We just verify the API key is valid via a simple health check
		logger.info("Remote API mode: API key present, auth features available");
		this.emitStateChange("connected", { reason: "Remote API mode (auth only)" });

		// Show notification prompting CLI installation for full features
		vscode.window
			.showInformationMessage(
				"SnapBack running in limited mode. Install CLI for full MCP features.",
				"Install CLI",
				"Configure MCP",
			)
			.then((choice) => {
				if (choice === "Install CLI") {
					vscode.env.openExternal(vscode.Uri.parse("https://docs.snapback.dev/cli/install"));
				} else if (choice === "Configure MCP") {
					vscode.commands.executeCommand("snapback.configureMCP");
				}
			});
	}

	/**
	 * Get the connected MCP server version
	 *
	 * @returns Server version string or undefined if not connected
	 */
	getServerVersion(): string | undefined {
		return this.serverVersion;
	}

	/**
	 * Stop the MCP server
	 */
	async stop(): Promise<void> {
		return this.stopRemote();
	}

	/**
	 * Disconnect from remote MCP server
	 */
	private async stopRemote(): Promise<void> {
		if (this.remoteClient) {
			this.remoteClient.dispose();
			this.remoteClient = null;
		}
	}

	/**
	 * Dispose of the MCP lifecycle manager
	 */
	dispose(): void {
		this.stop().catch((error) => {
			logger.error("Error stopping MCP server", error as Error);
		});

		// Clean up daemon connection subscription
		if (this.daemonConnectionSubscription) {
			this.daemonConnectionSubscription.dispose();
			this.daemonConnectionSubscription = null;
		}

		// Clean up event emitter
		this._onStateChange.dispose();

		// Clear listeners
		this.stateChangeListeners.length = 0;
	}

	/**
	 * Check if MCP server is ready
	 * In LOCAL_CLI mode, checks DaemonBridge connection
	 * In REMOTE_API mode, checks RemoteMCPClient
	 */
	isServerReady(): boolean {
		// LOCAL_CLI mode: check DaemonBridge connection
		if (this.currentMode === MCPMode.LOCAL_CLI) {
			return this.daemonBridge?.isConnected() ?? false;
		}
		// REMOTE_API mode: check RemoteMCPClient
		return this.remoteClient ? this.remoteClient.isServerReady() : false;
	}

	/**
	 * Get the remote MCP client for health monitoring
	 * Returns null if not connected or using local mode
	 */
	getRemoteClient(): RemoteMCPClient | null {
		return this.remoteClient;
	}

	/**
	 * Get the configured server URL
	 * Returns undefined if not configured
	 */
	getServerUrl(): string | undefined {
		return this.remoteServerUrl;
	}

	/**
	 * Send a request to the MCP server
	 */
	async sendRequest(endpoint: string, data?: unknown): Promise<unknown> {
		if (this.remoteClient) {
			return this.remoteClient.sendRequest(endpoint, data);
		}
		throw new Error("Remote MCP client not initialized");
	}
}
