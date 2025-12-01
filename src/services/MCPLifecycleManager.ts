import * as vscode from "vscode";
import { logger } from "../utils/logger.js";
import { RemoteMCPClient, type RemoteMCPOptions } from "./RemoteMCPClient.js";

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
	private readonly maxRestarts = 3;
	private timeout: number;
	private remoteServerUrl?: string;
	private remoteAuthToken?: string;
	private remoteAuthType?: "bearer" | "apikey";
	private remoteApiKey?: string;

	constructor(options: MCPStartOptions) {
		this.timeout = options.timeout || 3000;
		this.remoteServerUrl = options.remoteServerUrl;
		this.remoteAuthToken = options.remoteAuthToken;
		this.remoteAuthType = options.remoteAuthType;
		this.remoteApiKey = options.remoteApiKey;
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
		} else {
			logger.info(
				"No remote MCP server configured, skipping MCP initialization",
			);
			return;
		}
	}

	/**
	 * Start connection to remote MCP server
	 */
	private async startRemote(
		serverUrl: string,
		authToken?: string,
		authType?: "bearer" | "apikey",
		apiKey?: string,
	): Promise<void> {
		try {
			const config = vscode.workspace.getConfiguration("snapback");
			const timeout = config.get<number>("mcp.timeout", this.timeout);
			const maxRetries = this.maxRestarts;

			const remoteOptions: RemoteMCPOptions = {
				serverUrl,
				authToken,
				timeout,
				maxRetries,
				authType,
				apiKey,
			};

			this.remoteClient = new RemoteMCPClient(remoteOptions);
			await this.remoteClient.connect();

			logger.info("Connected to remote MCP server successfully");
		} catch (error) {
			logger.error("Failed to connect to remote MCP server", error as Error);
			throw error;
		}
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
		} else {
			throw new Error("Remote MCP client not initialized");
		}
	}
}
