import * as vscode from "vscode";
import { logger } from "../utils/logger";
import { getMCPTelemetry } from "./MCPTelemetry";
import { RemoteMCPClient, type RemoteMCPOptions } from "./RemoteMCPClient";

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

/**
 * Minimum compatible MCP server version
 * Update this when breaking changes are introduced
 */
const MIN_MCP_VERSION = "1.0.0";

/**
 * Compare semver versions (simplified)
 * @returns -1 if a < b, 0 if a === b, 1 if a > b
 */
function compareVersions(a: string, b: string): number {
	const partsA = a.split(".").map(Number);
	const partsB = b.split(".").map(Number);

	for (let i = 0; i < 3; i++) {
		const numA = partsA[i] || 0;
		const numB = partsB[i] || 0;
		if (numA < numB) {
			return -1;
		}
		if (numA > numB) {
			return 1;
		}
	}
	return 0;
}

export class MCPLifecycleManager implements vscode.Disposable {
	private remoteClient: RemoteMCPClient | null = null;
	private readonly maxRestarts = 3;
	private timeout: number;
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

	constructor(options: MCPStartOptions) {
		this.timeout = options.timeout || 3000;
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
	 * Start the MCP server (remote only)
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

		// If remote server URL is not explicitly provided, check configuration
		let serverUrl = this.remoteServerUrl;
		let authToken = this.remoteAuthToken;
		let authType = this.remoteAuthType;
		let apiKey = this.remoteApiKey;

		if (!serverUrl) {
			serverUrl = config.get<string>("mcp.serverUrl", "");
			authToken = config.get<string>("mcp.authToken", "");
			authType = config.get<"bearer" | "apikey">("mcp.authType", "bearer");
			apiKey = config.get<string>("mcp.apiKey", "");
		}

		// Use remote MCP if server URL is configured
		if (serverUrl && serverUrl.trim() !== "") {
			return this.startRemote(serverUrl, authToken, authType, apiKey);
		}
		logger.info("No remote MCP server configured, skipping MCP initialization");
		this.emitStateChange("disconnected", { reason: "No server configured" });
		return;
	}

	/**
	 * Start connection to remote MCP server with retry and UI feedback
	 */
	private async startRemote(
		serverUrl: string,
		authToken?: string,
		authType?: "bearer" | "apikey",
		apiKey?: string,
	): Promise<void> {
		const config = vscode.workspace.getConfiguration("snapback");
		const timeout = config.get<number>("mcp.timeout", this.timeout);
		const maxRetries = this.maxRestarts;

		// Connection with retry loop for UI feedback
		for (let attempt = 1; attempt <= maxRetries; attempt++) {
			try {
				// Emit reconnecting state with attempt progress
				this.emitStateChange("reconnecting", { attempt, maxAttempts: maxRetries });

				const remoteOptions: RemoteMCPOptions = {
					serverUrl,
					authToken,
					timeout,
					maxRetries: 1, // Single attempt per iteration (we handle retries here)
					authType,
					apiKey,
				};

				this.remoteClient = new RemoteMCPClient(remoteOptions);
				await this.remoteClient.connect();

				// Check version compatibility
				const status = this.remoteClient.getStatus();
				this.serverVersion = status.version;

				if (status.version) {
					await this.checkVersionCompatibility(status.version);
				}

				// Emit connected state on success
				this.emitStateChange("connected");
				logger.info("Connected to remote MCP server successfully", { version: status.version });

				// Show success notification if we recovered from a failure
				if (attempt > 1) {
					vscode.window.showInformationMessage("SnapBack MCP: Reconnected successfully");
				}

				return; // Success, exit retry loop
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error);
				logger.warn(`MCP connection attempt ${attempt}/${maxRetries} failed`, { error: errorMessage });

				// Clean up failed client
				if (this.remoteClient) {
					this.remoteClient.dispose();
					this.remoteClient = null;
				}

				// If not last attempt, wait before retry
				if (attempt < maxRetries) {
					const delay = Math.min(2 ** attempt * 1000, 10000); // Exponential backoff, max 10s
					await new Promise((resolve) => setTimeout(resolve, delay));
				}
			}
		}

		// All attempts failed
		const finalError = `Failed to connect to remote MCP server after ${maxRetries} attempts`;
		this.emitStateChange("disconnected", { reason: finalError });
		logger.error(finalError);

		// Show user notification with actions
		const choice = await vscode.window.showErrorMessage(
			"SnapBack MCP: Failed to connect after multiple attempts",
			"Diagnose",
			"Retry",
			"Dismiss",
		);

		if (choice === "Diagnose") {
			vscode.commands.executeCommand("snapback.mcp.diagnose");
		} else if (choice === "Retry") {
			// Restart connection process
			this.start().catch((err) => {
				logger.error("MCP retry failed", err);
			});
		}

		throw new Error(finalError);
	}

	/**
	 * Check MCP server version compatibility
	 *
	 * Warns user if server version is below minimum required.
	 * Does not block connection - just provides guidance.
	 */
	private async checkVersionCompatibility(serverVersion: string): Promise<void> {
		if (compareVersions(serverVersion, MIN_MCP_VERSION) < 0) {
			logger.warn("MCP server version incompatibility detected", {
				serverVersion,
				minRequired: MIN_MCP_VERSION,
			});

			// Track version mismatch telemetry
			getMCPTelemetry().trackVersionMismatch(serverVersion, MIN_MCP_VERSION);

			const choice = await vscode.window.showWarningMessage(
				`SnapBack MCP server (v${serverVersion}) may be outdated. Minimum recommended: v${MIN_MCP_VERSION}`,
				"Learn More",
				"Dismiss",
			);

			if (choice === "Learn More") {
				vscode.env.openExternal(vscode.Uri.parse("https://docs.snapback.dev/mcp-upgrade"));
			}
		} else {
			logger.info("MCP server version compatible", { serverVersion, minRequired: MIN_MCP_VERSION });
		}
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

		// Clean up event emitter
		this._onStateChange.dispose();

		// Clear listeners
		this.stateChangeListeners.length = 0;
	}

	/**
	 * Check if MCP server is ready
	 */
	isServerReady(): boolean {
		return this.remoteClient ? this.remoteClient.isServerReady() : false;
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
