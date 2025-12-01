import type * as vscode from "vscode";
import { QueuedNetworkAdapter } from "../network/QueuedNetworkAdapter.js";
import { logger } from "../utils/logger.js";

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
	 * Maximum number of reconnection attempts
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
}

export interface MCPStatus {
	ready: boolean;
	version?: string;
	uptime?: number;
	lastPing?: Date;
}

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
	private isReady: boolean = false;
	private reconnectAttempts: number = 0;
	private heartbeatInterval?: NodeJS.Timeout;
	private status: MCPStatus = { ready: false };
	private authType: "bearer" | "apikey";
	private apiKey?: string;

	constructor(options: RemoteMCPOptions) {
		this.serverUrl = options.serverUrl.replace(/\/$/, ""); // Remove trailing slash
		this.authToken = options.authToken;
		this.maxRetries = options.maxRetries || 3;
		this.authType = options.authType || "bearer";
		this.apiKey = options.apiKey;
	}

	/**
	 * Connect to the remote MCP server
	 */
	async connect(): Promise<void> {
		try {
			logger.info(`Connecting to remote MCP server at ${this.serverUrl}`);

			// Test connection with health check
			await this.healthCheck();

			this.isReady = true;
			this.reconnectAttempts = 0;
			this.status.ready = true;

			// Start heartbeat monitoring
			this.startHeartbeat();

			logger.info("Successfully connected to remote MCP server");
		} catch (error) {
			logger.error("Failed to connect to remote MCP server", error as Error);

			// Attempt reconnection if within retry limits
			if (this.reconnectAttempts < this.maxRetries) {
				this.reconnectAttempts++;
				const delay = 2 ** this.reconnectAttempts * 1000; // Exponential backoff

				logger.info(
					`Retrying connection in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxRetries})`,
				);

				await new Promise((resolve) => setTimeout(resolve, delay));
				return this.connect();
			}

			throw new Error(
				`Failed to connect to remote MCP server after ${this.maxRetries} attempts: ${(error as Error).message}`,
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
		const response = await networkAdapter.get(
			`${this.serverUrl}/health`,
			headers,
		);

		if (!response.ok) {
			throw new Error(
				`Health check failed with status ${response.status}: ${response.statusText}`,
			);
		}

		const data: unknown = response.data;

		this.status = {
			ready: true,
			version: (data as { version?: string }).version,
			uptime: (data as { uptime?: number }).uptime,
			lastPing: new Date(),
		};

		return this.status;
	}

	/**
	 * Start heartbeat monitoring to ensure continuous connection
	 */
	private startHeartbeat(): void {
		// Clear any existing heartbeat
		if (this.heartbeatInterval) {
			clearInterval(this.heartbeatInterval);
		}

		// Set up periodic health checks
		this.heartbeatInterval = setInterval(async () => {
			try {
				await this.healthCheck();
			} catch (error) {
				logger.warn(
					"Heartbeat failed, MCP server may be unreachable",
					error as Error,
				);
				this.isReady = false;
				this.status.ready = false;

				// Attempt to reconnect
				try {
					await this.connect();
				} catch (reconnectError) {
					logger.error(
						"Failed to reconnect to MCP server",
						reconnectError as Error,
					);
				}
			}
		}, 30000); // Check every 30 seconds
	}

	/**
	 * Send a request to the MCP server
	 */
	async sendRequest(endpoint: string, data?: unknown): Promise<unknown> {
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
		const response = await networkAdapter.post(
			`${this.serverUrl}${endpoint}`,
			data,
			headers,
		);

		if (!response.ok) {
			throw new Error(
				`Request failed with status ${response.status}: ${response.statusText}`,
			);
		}

		return response.data;
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

		this.isReady = false;
		this.status.ready = false;
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
