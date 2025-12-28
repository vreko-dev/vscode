/**
 * Daemon Bridge for VS Code Extension
 *
 * Provides communication between the VS Code extension and the SnapBack daemon.
 * Enables unified session tracking and file watching across Extension, CLI, and MCP.
 *
 * ## Architecture
 *
 * ```
 * VS Code Extension
 *         ↓
 * DaemonBridge (this file)
 *         ↓ (Unix socket / Named pipe)
 * SnapBack Daemon
 *         ↓
 * Intelligence + File Watcher
 * ```
 *
 * ## Features
 *
 * - Lazy connection (connects on first request)
 * - Auto-reconnect with exponential backoff
 * - File watching subscription for proactive protection
 * - Session status synchronization
 * - Risk event notifications
 *
 * @module services/DaemonBridge
 */

import { existsSync, readFileSync } from "node:fs";
import { createConnection, type Socket } from "node:net";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import * as vscode from "vscode";
import { logger } from "../utils/logger";

// =============================================================================
// CONFIGURATION
// =============================================================================

const IS_WINDOWS = platform() === "win32";

/** Socket path for Unix or named pipe for Windows */
function getSocketPath(): string {
	if (IS_WINDOWS) {
		return "\\\\.\\pipe\\snapback-daemon";
	}
	return join(homedir(), ".snapback", "daemon.sock");
}

/** PID file path */
function getPidPath(): string {
	return join(homedir(), ".snapback", "daemon.pid");
}

/** Connection timeout in ms */
const CONNECTION_TIMEOUT_MS = 5000;

/** Request timeout in ms */
const REQUEST_TIMEOUT_MS = 10000;

/** Minimum time between reconnection attempts */
const MIN_RECONNECT_INTERVAL_MS = 1000;

/** Maximum time between reconnection attempts */
const MAX_RECONNECT_INTERVAL_MS = 30000;

// =============================================================================
// TYPES
// =============================================================================

interface JsonRpcRequest {
	jsonrpc: "2.0";
	id: number;
	method: string;
	params: Record<string, unknown>;
}

interface JsonRpcResponse {
	jsonrpc: "2.0";
	id?: number;
	method?: string;
	result?: unknown;
	error?: { code: number; message: string };
	params?: unknown;
}

export interface RiskDetectedEvent {
	file: string;
	changeType: "add" | "change" | "unlink";
	riskLevel: "low" | "medium" | "high";
	reason: string;
	suggestion?: string;
}

export interface SessionStatusResult {
	active: boolean;
	taskId?: string;
	task?: string;
	startedAt?: string;
	filesModified: number;
	snapshotCount: number;
}

export interface DaemonStatus {
	connected: boolean;
	pid?: number;
	version?: string;
	uptime?: number;
	workspaces?: number;
}

// =============================================================================
// DAEMON BRIDGE CLASS
// =============================================================================

export class DaemonBridge extends vscode.Disposable {
	private socket: Socket | null = null;
	private requestId = 0;
	private pendingRequests = new Map<
		number,
		{
			resolve: (value: unknown) => void;
			reject: (error: Error) => void;
			timeout: NodeJS.Timeout;
		}
	>();
	private buffer = "";
	private isConnecting = false;
	private reconnectTimer: NodeJS.Timeout | null = null;
	private reconnectDelay = MIN_RECONNECT_INTERVAL_MS;
	private subscriptions: Set<string> = new Set();

	// Event emitters
	private _onRiskDetected = new vscode.EventEmitter<RiskDetectedEvent>();
	public readonly onRiskDetected = this._onRiskDetected.event;

	private _onConnectionChanged = new vscode.EventEmitter<boolean>();
	public readonly onConnectionChanged = this._onConnectionChanged.event;

	private _onDaemonShuttingDown = new vscode.EventEmitter<void>();
	public readonly onDaemonShuttingDown = this._onDaemonShuttingDown.event;

	constructor() {
		super(() => this.dispose());
	}

	// =========================================================================
	// CONNECTION MANAGEMENT
	// =========================================================================

	/**
	 * Check if daemon process is running (without connecting)
	 */
	isDaemonRunning(): boolean {
		try {
			const pidPath = getPidPath();
			if (!existsSync(pidPath)) {
				return false;
			}

			const pid = Number.parseInt(readFileSync(pidPath, "utf8").trim(), 10);
			if (isNaN(pid)) {
				return false;
			}

			// Check if process exists (doesn't kill it)
			try {
				process.kill(pid, 0);
				return true;
			} catch {
				return false;
			}
		} catch {
			return false;
		}
	}

	/**
	 * Check if connected to daemon
	 */
	isConnected(): boolean {
		return this.socket?.writable === true;
	}

	/**
	 * Connect to daemon
	 */
	async connect(): Promise<boolean> {
		if (this.isConnected()) {
			return true;
		}

		if (this.isConnecting) {
			return false;
		}

		if (!this.isDaemonRunning()) {
			logger.debug("Daemon not running, skipping connection attempt");
			return false;
		}

		this.isConnecting = true;

		try {
			await this.establishConnection();
			this.reconnectDelay = MIN_RECONNECT_INTERVAL_MS;
			this._onConnectionChanged.fire(true);
			logger.info("Connected to SnapBack daemon");
			return true;
		} catch (error) {
			logger.debug("Failed to connect to daemon", {
				error: error instanceof Error ? error.message : String(error),
			});
			this.scheduleReconnect();
			return false;
		} finally {
			this.isConnecting = false;
		}
	}

	/**
	 * Disconnect from daemon
	 */
	disconnect(): void {
		this.cancelReconnect();

		if (this.socket) {
			this.socket.destroy();
			this.socket = null;
		}

		// Reject all pending requests
		for (const [id, pending] of this.pendingRequests) {
			clearTimeout(pending.timeout);
			pending.reject(new Error("Disconnected"));
			this.pendingRequests.delete(id);
		}

		this._onConnectionChanged.fire(false);
	}

	/**
	 * Establish socket connection
	 */
	private async establishConnection(): Promise<void> {
		return new Promise((resolve, reject) => {
			const socketPath = getSocketPath();
			const socket = createConnection(socketPath);

			const connectionTimeout = setTimeout(() => {
				socket.destroy();
				reject(new Error("Connection timeout"));
			}, CONNECTION_TIMEOUT_MS);

			socket.on("connect", () => {
				clearTimeout(connectionTimeout);
				this.socket = socket;
				this.setupSocketHandlers(socket);
				resolve();
			});

			socket.on("error", (err) => {
				clearTimeout(connectionTimeout);
				reject(err);
			});
		});
	}

	/**
	 * Set up socket event handlers
	 */
	private setupSocketHandlers(socket: Socket): void {
		socket.on("data", (data) => {
			this.handleData(data.toString());
		});

		socket.on("close", () => {
			this.socket = null;
			this._onConnectionChanged.fire(false);
			logger.debug("Daemon connection closed");
			this.scheduleReconnect();
		});

		socket.on("error", (error) => {
			logger.warn("Daemon socket error", {
				error: error instanceof Error ? error.message : String(error),
			});
		});
	}

	/**
	 * Handle incoming data (JSON-RPC messages)
	 */
	private handleData(data: string): void {
		this.buffer += data;

		// Process complete messages (newline-delimited JSON)
		const lines = this.buffer.split("\n");
		this.buffer = lines.pop() || "";

		for (const line of lines) {
			if (!line.trim()) continue;

			try {
				const message: JsonRpcResponse = JSON.parse(line);

				// Handle notifications (no id)
				if (message.method === "notification" && message.params) {
					this.handleNotification(message.params as Record<string, unknown>);
					continue;
				}

				// Handle responses (has id)
				if (message.id !== undefined) {
					const pending = this.pendingRequests.get(message.id);
					if (pending) {
						clearTimeout(pending.timeout);
						this.pendingRequests.delete(message.id);

						if (message.error) {
							pending.reject(new Error(message.error.message));
						} else {
							pending.resolve(message.result);
						}
					}
				}
			} catch {
				logger.debug("Malformed daemon message", { line: line.substring(0, 100) });
			}
		}
	}

	/**
	 * Handle daemon notifications
	 */
	private handleNotification(params: Record<string, unknown>): void {
		const type = params.type as string;
		const data = params.data as Record<string, unknown>;

		switch (type) {
			case "risk.detected":
				this._onRiskDetected.fire({
					file: data.file as string,
					changeType: data.changeType as "add" | "change" | "unlink",
					riskLevel: data.riskLevel as "low" | "medium" | "high",
					reason: data.reason as string,
					suggestion: data.suggestion as string | undefined,
				});
				break;

			case "daemon.shutting_down":
				this._onDaemonShuttingDown.fire();
				break;

			default:
				logger.debug("Unknown daemon notification", { type });
		}
	}

	/**
	 * Schedule reconnection with exponential backoff
	 */
	private scheduleReconnect(): void {
		if (this.reconnectTimer) {
			return;
		}

		this.reconnectTimer = setTimeout(async () => {
			this.reconnectTimer = null;
			await this.connect();
		}, this.reconnectDelay);

		// Exponential backoff
		this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_RECONNECT_INTERVAL_MS);
	}

	/**
	 * Cancel scheduled reconnection
	 */
	private cancelReconnect(): void {
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
	}

	// =========================================================================
	// JSON-RPC REQUESTS
	// =========================================================================

	/**
	 * Send a request to the daemon
	 */
	async request<T>(method: string, params: Record<string, unknown>): Promise<T> {
		if (!this.isConnected()) {
			const connected = await this.connect();
			if (!connected) {
				throw new Error("Not connected to daemon");
			}
		}

		const id = ++this.requestId;
		const request: JsonRpcRequest = {
			jsonrpc: "2.0",
			id,
			method,
			params,
		};

		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				this.pendingRequests.delete(id);
				reject(new Error(`Request timeout: ${method}`));
			}, REQUEST_TIMEOUT_MS);

			this.pendingRequests.set(id, {
				resolve: resolve as (value: unknown) => void,
				reject,
				timeout,
			});

			this.socket!.write(JSON.stringify(request) + "\n");
		});
	}

	// =========================================================================
	// DAEMON API
	// =========================================================================

	/**
	 * Ping the daemon
	 */
	async ping(): Promise<{ pong: true; uptime: number; version: string }> {
		return this.request("daemon.ping", {});
	}

	/**
	 * Get daemon status
	 */
	async getStatus(): Promise<DaemonStatus> {
		if (!this.isConnected()) {
			return { connected: false };
		}

		try {
			const result = await this.request<{
				pid: number;
				version: string;
				uptime: number;
				workspaces: number;
			}>("daemon.status", {});

			return {
				connected: true,
				pid: result.pid,
				version: result.version,
				uptime: result.uptime,
				workspaces: result.workspaces,
			};
		} catch {
			return { connected: false };
		}
	}

	/**
	 * Get session status for a workspace
	 */
	async getSessionStatus(workspacePath: string): Promise<SessionStatusResult | null> {
		if (!this.isConnected()) {
			return null;
		}

		try {
			return await this.request<SessionStatusResult>("session.status", {
				workspace: workspacePath,
			});
		} catch {
			return null;
		}
	}

	/**
	 * Subscribe to file watching for a workspace
	 */
	async subscribeToFileWatching(workspacePath: string): Promise<boolean> {
		if (!this.isConnected()) {
			const connected = await this.connect();
			if (!connected) {
				return false;
			}
		}

		try {
			await this.request("watch.subscribe", {
				workspace: workspacePath,
			});
			this.subscriptions.add(workspacePath);
			logger.debug("Subscribed to file watching", { workspace: workspacePath });
			return true;
		} catch (error) {
			logger.warn("Failed to subscribe to file watching", {
				workspace: workspacePath,
				error: error instanceof Error ? error.message : String(error),
			});
			return false;
		}
	}

	/**
	 * Unsubscribe from file watching
	 */
	async unsubscribeFromFileWatching(workspacePath: string): Promise<boolean> {
		if (!this.isConnected()) {
			return false;
		}

		try {
			await this.request("watch.unsubscribe", {
				workspace: workspacePath,
			});
			this.subscriptions.delete(workspacePath);
			logger.debug("Unsubscribed from file watching", { workspace: workspacePath });
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Record file modification (for AI attribution)
	 */
	async recordFileModification(
		workspacePath: string,
		filePath: string,
		linesChanged: number,
		aiAttributed: boolean,
	): Promise<boolean> {
		if (!this.isConnected()) {
			return false;
		}

		try {
			await this.request("file.modified", {
				workspace: workspacePath,
				path: filePath,
				linesChanged,
				aiAttributed,
			});
			return true;
		} catch {
			return false;
		}
	}

	// =========================================================================
	// LIFECYCLE
	// =========================================================================

	/**
	 * Initialize the bridge and connect to daemon
	 */
	async initialize(): Promise<void> {
		// Try to connect if daemon is available
		await this.connect();

		// Subscribe to workspace folder changes
		vscode.workspace.onDidChangeWorkspaceFolders(async (event) => {
			// Unsubscribe from removed folders (parallel)
			await Promise.all(event.removed.map((folder) => this.unsubscribeFromFileWatching(folder.uri.fsPath)));

			// Subscribe to added folders (parallel)
			await Promise.all(event.added.map((folder) => this.subscribeToFileWatching(folder.uri.fsPath)));
		});

		// Subscribe to current workspaces (parallel)
		const folders = vscode.workspace.workspaceFolders || [];
		await Promise.all(folders.map((folder) => this.subscribeToFileWatching(folder.uri.fsPath)));
	}

	/**
	 * Dispose the bridge
	 */
	dispose(): void {
		this.disconnect();
		this._onRiskDetected.dispose();
		this._onConnectionChanged.dispose();
		this._onDaemonShuttingDown.dispose();
	}
}

// =============================================================================
// SINGLETON
// =============================================================================

let bridgeInstance: DaemonBridge | null = null;

/**
 * Get the singleton DaemonBridge instance
 */
export function getDaemonBridge(): DaemonBridge {
	if (!bridgeInstance) {
		bridgeInstance = new DaemonBridge();
	}
	return bridgeInstance;
}

/**
 * Dispose the DaemonBridge
 */
export function disposeDaemonBridge(): void {
	if (bridgeInstance) {
		bridgeInstance.dispose();
		bridgeInstance = null;
	}
}
