import type * as vscode from "vscode";
import { QueuedNetworkAdapter } from "../network/QueuedNetworkAdapter";
import { logger } from "../utils/logger";

/**
 * Connection state change callback
 */
export type ConnectionStateCallback = (state: RemoteMCPConnectionState, attempt?: number, maxAttempts?: number) => void;

/**
 * Remote MCP connection states
 */
export type RemoteMCPConnectionState = "connected" | "disconnected" | "reconnecting";

export interface RemoteMCPOptions {
	/**
	 * The URL of the remote MCP server
	 */
	serverUrl: string;

	/**
	 * Authentication token for the remote MCP server
	 */
	authToken?: string;

	/**
	 * Timeout for connection attempts (in milliseconds)
	 */
	timeout?: number;

	/**
	 * Maximum number of reconnection attempts (default: 5)
	 */
	maxRetries?: number;

	/**
	 * Authentication type (bearer, apikey, etc.)
	 */
	authType?: "bearer" | "apikey";

	/**
	 * API key for API key authentication
	 */
	apiKey?: string;

	/**
	 * Callback for connection state changes
	 */
	onStateChange?: ConnectionStateCallback;
}

export interface MCPStatus {
	ready: boolean;
	version?: string;
	uptime?: number;
	lastPing?: Date;
}

/** Heartbeat interval in milliseconds (15 seconds for faster failure detection) */
const HEARTBEAT_INTERVAL_MS = 15000;

/** Maximum initial retry attempts before switching to background reconnection */
const MAX_INITIAL_RETRIES = 5;

/** Background reconnection interval in milliseconds (60 seconds) */
const BACKGROUND_RECONNECT_INTERVAL_MS = 60000;

/** Proactive health check threshold - check health if last ping was more than this long ago */
const PROACTIVE_HEALTH_CHECK_THRESHOLD_MS = 10000;

/** Maximum retries for individual tool/request calls */
const MAX_REQUEST_RETRIES = 3;

/** Base delay for request retry backoff (1 second) */
const REQUEST_RETRY_BASE_DELAY_MS = 1000;

/**
 * Remote MCP Client for connecting to MCP servers deployed on fly.io or other remote hosts
 *
 * This client handles:
 * - Secure connections to remote MCP servers
 * - Authentication with bearer tokens
 * - Health monitoring and reconnection logic
 * - Error handling for network issues
 */
export class RemoteMCPClient implements vscode.Disposable {
	private serverUrl: string;
	private authToken?: string;
	private maxRetries: number;
	private isReady = false;
	private reconnectAttempts = 0;
	private heartbeatInterval?: NodeJS.Timeout;
	private backgroundReconnectInterval?: NodeJS.Timeout;
	private status: MCPStatus = { ready: false };
	private authType: "bearer" | "apikey";
	private apiKey?: string;
	private onStateChange?: ConnectionStateCallback;
	private lastHealthCheckTime = 0;

	constructor(options: RemoteMCPOptions) {
		this.serverUrl = options.serverUrl.replace(/\/$/, ""); // Remove trailing slash
		this.authToken = options.authToken;
		this.maxRetries = options.maxRetries || MAX_INITIAL_RETRIES;
		this.authType = options.authType || "bearer";
		this.apiKey = options.apiKey;
		this.onStateChange = options.onStateChange;
	}

	/**
	 * Emit state change to callback
	 */
	private emitStateChange(state: RemoteMCPConnectionState, attempt?: number, maxAttempts?: number): void {
		if (this.onStateChange) {
			try {
				this.onStateChange(state, attempt, maxAttempts);
			} catch (err) {
				logger.warn("State change callback error", err as Error);
			}
		}
	}

	/**
	 * Connect to the remote MCP server
	 */
	async connect(): Promise<void> {
		// Stop background reconnection if running
		this.stopBackgroundReconnection();

		try {
			logger.info(`Connecting to remote MCP server at ${this.serverUrl}`);
			this.emitStateChange("reconnecting", this.reconnectAttempts + 1, this.maxRetries);

			// Test connection with health check
			await this.healthCheck();

			this.isReady = true;
			this.reconnectAttempts = 0;
			this.status.ready = true;

			// Start heartbeat monitoring
			this.startHeartbeat();

			logger.info("Successfully connected to remote MCP server");
			this.emitStateChange("connected");
		} catch (error) {
			logger.error("Failed to connect to remote MCP server", error as Error);

			// Attempt reconnection if within retry limits
			if (this.reconnectAttempts < this.maxRetries) {
				this.reconnectAttempts++;
				// Exponential backoff with jitter to prevent thundering herd
				const jitter = Math.random() * 1000;
				const delay = 2 ** this.reconnectAttempts * 1000 + jitter;

				logger.info(
					`Retrying connection in ${Math.round(delay)}ms (attempt ${this.reconnectAttempts}/${this.maxRetries})`,
				);
				this.emitStateChange("reconnecting", this.reconnectAttempts, this.maxRetries);

				await new Promise((resolve) => setTimeout(resolve, delay));
				return this.connect();
			}

			// Max retries exhausted - start background reconnection
			logger.warn(
				`Initial connection failed after ${this.maxRetries} attempts, starting background reconnection`,
			);
			this.emitStateChange("disconnected");
			this.startBackgroundReconnection();

			throw new Error(
				`MCP connection failed after ${this.maxRetries} attempts. Background reconnection started. Try: 1) Check network connectivity, 2) Run "SnapBack: Diagnose MCP" command, 3) Restart VS Code. Original error: ${(error as Error).message}`,
			);
		}
	}

	/**
	 * Perform health check on the remote MCP server
	 */
	private async healthCheck(): Promise<MCPStatus> {
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
		};

		// Add authentication headers based on auth type
		if (this.authType === "bearer" && this.authToken) {
			headers.Authorization = `Bearer ${this.authToken}`;
		} else if (this.authType === "apikey" && this.apiKey) {
			headers["X-API-Key"] = this.apiKey;
		}

		// Use queued network adapter for health checks
		const networkAdapter = new QueuedNetworkAdapter();
		const response = await networkAdapter.get(`${this.serverUrl}/health`, headers);

		if (!response.ok) {
			throw new Error(`Health check failed with status ${response.status}: ${response.statusText}`);
		}

		const data: unknown = response.data;

		this.status = {
			ready: true,
			version: (data as { version?: string }).version,
			uptime: (data as { uptime?: number }).uptime,
			lastPing: new Date(),
		};

		this.lastHealthCheckTime = Date.now();
		return this.status;
	}

	/**
	 * Start heartbeat monitoring to ensure continuous connection
	 * Uses 15-second interval for faster failure detection
	 */
	private startHeartbeat(): void {
		// Clear any existing heartbeat
		if (this.heartbeatInterval) {
			clearInterval(this.heartbeatInterval);
		}

		// Set up periodic health checks (15 seconds for faster failure detection)
		this.heartbeatInterval = setInterval(async () => {
			try {
				await this.healthCheck();
			} catch (error) {
				logger.warn("Heartbeat failed, MCP server may be unreachable", error as Error);
				this.isReady = false;
				this.status.ready = false;
				this.emitStateChange("disconnected");

				// Reset reconnect attempts for fresh retry sequence
				this.reconnectAttempts = 0;

				// Attempt to reconnect
				try {
					await this.connect();
				} catch (reconnectError) {
					logger.error("Failed to reconnect to MCP server", reconnectError as Error);
					// Background reconnection will be started by connect()
				}
			}
		}, HEARTBEAT_INTERVAL_MS);
	}

	/**
	 * Start background reconnection with slower interval (60s)
	 * Called after initial retry attempts are exhausted
	 */
	private startBackgroundReconnection(): void {
		// Clear any existing background reconnection
		this.stopBackgroundReconnection();

		logger.info("Starting background reconnection (every 60s)");

		this.backgroundReconnectInterval = setInterval(async () => {
			logger.debug("Background reconnection attempt...");
			try {
				// Reset retry counter for fresh attempt
				this.reconnectAttempts = 0;
				await this.healthCheck();

				// Success! Stop background reconnection and restore normal operation
				logger.info("Background reconnection succeeded!");
				this.stopBackgroundReconnection();
				this.isReady = true;
				this.status.ready = true;
				this.startHeartbeat();
				this.emitStateChange("connected");
			} catch (error) {
				logger.debug("Background reconnection failed, will retry in 60s", error as Error);
				// Continue trying - don't emit state change to avoid notification spam
			}
		}, BACKGROUND_RECONNECT_INTERVAL_MS);
	}

	/**
	 * Stop background reconnection
	 */
	private stopBackgroundReconnection(): void {
		if (this.backgroundReconnectInterval) {
			clearInterval(this.backgroundReconnectInterval);
			this.backgroundReconnectInterval = undefined;
		}
	}

	/**
	 * Ensure connection is healthy before critical operations
	 * Performs proactive health check if last check was too long ago
	 */
	async ensureConnected(): Promise<void> {
		const timeSinceLastCheck = Date.now() - this.lastHealthCheckTime;

		if (timeSinceLastCheck > PROACTIVE_HEALTH_CHECK_THRESHOLD_MS || !this.isReady) {
			logger.debug(`Proactive health check (last check ${timeSinceLastCheck}ms ago)`);
			try {
				await this.healthCheck();
				if (!this.isReady) {
					this.isReady = true;
					this.status.ready = true;
					this.emitStateChange("connected");
				}
			} catch (error) {
				this.isReady = false;
				this.status.ready = false;
				throw new Error(`MCP server not reachable: ${(error as Error).message}`);
			}
		}
	}

	/**
	 * Send a request to the MCP server with retry logic
	 * Includes proactive health check and automatic retries with exponential backoff
	 */
	async sendRequest(endpoint: string, data?: unknown): Promise<unknown> {
		let lastError: Error | null = null;

		for (let attempt = 1; attempt <= MAX_REQUEST_RETRIES; attempt++) {
			try {
				// Proactive health check before request
				await this.ensureConnected();

				if (!this.isReady) {
					throw new Error("MCP client is not connected");
				}

				const headers: Record<string, string> = {
					"Content-Type": "application/json",
				};

				// Add authentication headers based on auth type
				if (this.authType === "bearer" && this.authToken) {
					headers.Authorization = `Bearer ${this.authToken}`;
				} else if (this.authType === "apikey" && this.apiKey) {
					headers["X-API-Key"] = this.apiKey;
				}

				// Use queued network adapter for requests
				const networkAdapter = new QueuedNetworkAdapter();
				const response = await networkAdapter.post(`${this.serverUrl}${endpoint}`, data, headers);

				if (!response.ok) {
					throw new Error(`Request failed with status ${response.status}: ${response.statusText}`);
				}

				return response.data;
			} catch (error) {
				lastError = error as Error;
				const isLastAttempt = attempt === MAX_REQUEST_RETRIES;

				if (isLastAttempt) {
					logger.error(`Request to ${endpoint} failed after ${MAX_REQUEST_RETRIES} attempts`, lastError);
					break;
				}

				// Exponential backoff with jitter for retries
				const jitter = Math.random() * 500;
				const delay = REQUEST_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1) + jitter;
				logger.warn(
					`Request to ${endpoint} failed (attempt ${attempt}/${MAX_REQUEST_RETRIES}), retrying in ${Math.round(delay)}ms`,
					lastError,
				);

				await new Promise((resolve) => setTimeout(resolve, delay));
			}
		}

		throw new Error(
			`MCP request to ${endpoint} failed after ${MAX_REQUEST_RETRIES} retries: ${lastError?.message || "Unknown error"}`,
		);
	}

	/**
	 * Check if the MCP server is ready
	 */
	isServerReady(): boolean {
		return this.isReady;
	}

	/**
	 * Get current MCP server status
	 */
	getStatus(): MCPStatus {
		return { ...this.status };
	}

	/**
	 * Disconnect from the MCP server
	 */
	async disconnect(): Promise<void> {
		logger.info("Disconnecting from remote MCP server");

		// Clear heartbeat interval
		if (this.heartbeatInterval) {
			clearInterval(this.heartbeatInterval);
			this.heartbeatInterval = undefined;
		}

		// Clear background reconnection
		this.stopBackgroundReconnection();

		this.isReady = false;
		this.status.ready = false;
		this.emitStateChange("disconnected");
	}

	/**
	 * Dispose of the client
	 */
	dispose(): void {
		this.disconnect().catch((error) => {
			logger.error("Error disconnecting from MCP server", error as Error);
		});
	}
}
