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

import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createConnection, type Socket } from "node:net";
import { homedir, platform } from "node:os";
import { isAbsolute, join, relative } from "node:path";
import * as vscode from "vscode";
import { getActivationFunnel } from "../telemetry/ActivationFunnelIntegration";
import { logger } from "../utils/logger";
import { getNotificationManager } from "./NotificationManager";

// =============================================================================
// CONFIGURATION
// =============================================================================

const IS_WINDOWS = platform() === "win32";

/** Socket path for Unix or named pipe for Windows */
function getSocketPath(): string {
	if (IS_WINDOWS) {
		return "\\\\.\\pipe\\snapback-daemon";
	}
	// Must match CLI's daemon/platform.ts: ~/.snapback/daemon/daemon.sock
	return join(homedir(), ".snapback", "daemon", "daemon.sock");
}

/** PID file path */
function getPidPath(): string {
	// Must match CLI's daemon/platform.ts: ~/.snapback/daemon/daemon.pid
	return join(homedir(), ".snapback", "daemon", "daemon.pid");
}

/** Connection timeout in ms */
const CONNECTION_TIMEOUT_MS = 5000;

/** Request timeout in ms - increased to 60s to accommodate long-running checks (tsc, biome, madge) */
const REQUEST_TIMEOUT_MS = 60000;

/** Minimum time between reconnection attempts */
const MIN_RECONNECT_INTERVAL_MS = 1000;

/** Maximum time between reconnection attempts */
const MAX_RECONNECT_INTERVAL_MS = 30000;

/** Daemon auto-start timeout in ms */
const DAEMON_START_TIMEOUT_MS = 10000;

/** Delay before considering daemon started */
const DAEMON_START_WAIT_MS = 500;

/** Client identifier for multi-client debugging */
const CLIENT_ID = `vscode-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

/** Log prefix for easy filtering */
const LOG_PREFIX = "[MCP-Bridge]";

// =============================================================================
// CIRCUIT BREAKER STATE (P1 UX Improvement)
// =============================================================================

/**
 * Circuit breaker to prevent retry spam when CLI is not installed.
 * When spawn fails with ENOENT, we mark this and stop retrying automatically.
 * User must explicitly trigger "Retry Daemon" or fix CLI path to reset.
 */
interface CircuitBreakerState {
	/** Whether we've attempted spawn and got ENOENT */
	cliNotFound: boolean;
	/** The last ENOENT error message */
	lastError: string | null;
	/** Whether we've shown the notification for this session */
	notificationShown: boolean;
}

const circuitBreaker: CircuitBreakerState = {
	cliNotFound: false,
	lastError: null,
	notificationShown: false,
};

/**
 * Reset circuit breaker (called when user explicitly retries or changes settings)
 */
export function resetDaemonCircuitBreaker(): void {
	circuitBreaker.cliNotFound = false;
	circuitBreaker.lastError = null;
	circuitBreaker.notificationShown = false;
	logger.info("Daemon circuit breaker reset - will attempt spawn on next request");
}

/**
 * Find the snapback CLI executable path.
 *
 * Priority order:
 * 1. Local development CLI (apps/cli/dist/index.js) - for developers working on SnapBack
 * 2. Workspace-relative CLI - for mono-repo setups
 * 3. Global npm/pnpm installs - for production users
 * 4. PATH resolution - fallback
 *
 * This ensures developers working on SnapBack itself use the local dev CLI,
 * avoiding issues with outdated or broken published versions.
 */
function getCliPath(): string | null {
	try {
		// Priority 1: Check for local development CLI in SnapBack workspace
		// This is critical for developers working on SnapBack itself
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (workspaceFolders && workspaceFolders.length > 0) {
			for (const folder of workspaceFolders) {
				const localCliPath = join(folder.uri.fsPath, "apps", "cli", "dist", "index.js");
				if (existsSync(localCliPath)) {
					logger.info("Using local development CLI", { path: localCliPath });
					return localCliPath;
				}
			}
		}

		// Priority 2: Look for snapback in common global locations
		const possiblePaths = [
			// Global npm install
			join(homedir(), ".npm-global", "bin", IS_WINDOWS ? "snapback.cmd" : "snapback"),
			// npx location
			join(homedir(), ".npm", "_npx", "*", "node_modules", ".bin", IS_WINDOWS ? "snapback.cmd" : "snapback"),
			// pnpm global
			join(homedir(), ".local", "share", "pnpm", IS_WINDOWS ? "snapback.cmd" : "snapback"),
			// Homebrew (macOS)
			"/usr/local/bin/snapback",
			"/opt/homebrew/bin/snapback",
		];

		for (const p of possiblePaths) {
			if (existsSync(p)) {
				return p;
			}
		}

		// Priority 3: Fall back to PATH resolution (will use shell to find it)
		return IS_WINDOWS ? "snapback.cmd" : "snapback";
	} catch {
		return null;
	}
}

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

export interface SnapshotCreatedEvent {
	snapshotId: string;
	filePath: string;
	trigger: "manual" | "auto" | "mcp" | "ai-detection";
	source: "extension" | "mcp" | "cli";
	/** Workspace ID (URI string) for multi-workspace isolation */
	workspaceId?: string;
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
// CONNECTION STATE MACHINE (MCP Architecture Simplification)
// =============================================================================

/**
 * Connection states for the simplified MCP architecture.
 * DaemonBridge is now the single source of truth for connection state.
 */
export type ConnectionState =
	| "connected" // Socket connected, daemon responding
	| "disconnected" // Not connected, not trying
	| "reconnecting" // Actively trying to reconnect
	| "cli_missing"; // CLI not installed (circuit breaker)

/**
 * State change event with all relevant details.
 * Consumers subscribe to this for real-time UI updates.
 */
export interface StateChangeEvent {
	state: ConnectionState;
	previousState: ConnectionState;

	/** Reconnection details (when state === "reconnecting") */
	attempt?: number;
	maxAttempts?: number;
	nextRetryMs?: number;

	/** Error details (when transitioning to disconnected/cli_missing) */
	reason?: string;

	/** Version info (when state === "connected") */
	daemonVersion?: string;
}

// =============================================================================
// DAEMON BRIDGE CLASS
// =============================================================================

export class DaemonBridge extends vscode.Disposable {
	private socket: Socket | null = null;

	// State machine for simplified MCP architecture
	private _state: ConnectionState = "disconnected";
	private _daemonVersion?: string;
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
	private reconnectAttempts = 0;
	private maxReconnectAttempts = 5;
	private subscriptions: Set<string> = new Set();

	// Event emitters
	private _onRiskDetected = new vscode.EventEmitter<RiskDetectedEvent>();
	public readonly onRiskDetected = this._onRiskDetected.event;

	private _onConnectionChanged = new vscode.EventEmitter<boolean>();
	public readonly onConnectionChanged = this._onConnectionChanged.event;

	private _onDaemonShuttingDown = new vscode.EventEmitter<void>();
	public readonly onDaemonShuttingDown = this._onDaemonShuttingDown.event;

	private _onSnapshotCreated = new vscode.EventEmitter<SnapshotCreatedEvent>();
	public readonly onSnapshotCreated = this._onSnapshotCreated.event;

	// State machine event emitter (MCP Architecture Simplification)
	private _onStateChange = new vscode.EventEmitter<StateChangeEvent>();
	public readonly onStateChange = this._onStateChange.event;

	constructor() {
		super(() => this.dispose());
	}

	// =========================================================================
	// STATE MACHINE (MCP Architecture Simplification)
	// =========================================================================

	/**
	 * Get current connection state.
	 * This is the single source of truth for connection status.
	 */
	getState(): ConnectionState {
		return this._state;
	}

	/**
	 * Get daemon version (if connected).
	 */
	getDaemonVersion(): string | undefined {
		return this._daemonVersion;
	}

	/**
	 * Reset circuit breaker and retry connection.
	 * Called when user clicks "Retry" after CLI missing.
	 */
	resetAndRetry(): void {
		resetDaemonCircuitBreaker();
		this.reconnectAttempts = 0;
		this.reconnectDelay = MIN_RECONNECT_INTERVAL_MS;
		void this.connect();
	}

	/**
	 * Transition to a new state with event emission.
	 * Single method for all state transitions ensures events always fire with complete information.
	 */
	private transitionTo(
		newState: ConnectionState,
		details: Partial<Omit<StateChangeEvent, "state" | "previousState">> = {},
	): void {
		const previousState = this._state;

		// No-op if same state (except reconnecting which updates attempt count)
		if (previousState === newState && newState !== "reconnecting") {
			return;
		}

		this._state = newState;

		// Build complete event
		const event: StateChangeEvent = {
			state: newState,
			previousState,
			...details,
		};

		// Add reconnection details if applicable
		if (newState === "reconnecting") {
			event.attempt = this.reconnectAttempts;
			event.maxAttempts = this.maxReconnectAttempts;
			event.nextRetryMs = this.reconnectDelay;
		}

		// Add version if connected
		if (newState === "connected" && this._daemonVersion) {
			event.daemonVersion = this._daemonVersion;
		}

		logger.info(`${LOG_PREFIX} State transition`, {
			clientId: CLIENT_ID,
			from: previousState,
			to: newState,
			timestamp: new Date().toISOString(),
			...details,
		});

		// Fire new state change event
		this._onStateChange.fire(event);

		// Legacy event for backward compatibility
		this._onConnectionChanged.fire(newState === "connected");
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
			if (Number.isNaN(pid)) {
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
	 * Get current reconnection attempt count
	 */
	getReconnectAttempt(): number {
		return this.reconnectAttempts;
	}

	/**
	 * Get maximum reconnection attempts
	 */
	getMaxReconnectAttempts(): number {
		return this.maxReconnectAttempts;
	}

	/**
	 * Auto-start the daemon if not running.
	 * Per ARCHITECTURE_REFACTOR_SPEC.md Phase 1: Verify daemon auto-starts on activation.
	 *
	 * Spawns `snapback daemon start --detach` and waits for it to be ready.
	 *
	 * P1 UX: Uses circuit breaker to prevent retry spam when CLI is not installed.
	 * Shows one clear notification with remediation actions.
	 *
	 * @returns true if daemon started successfully or was already running
	 */
	private async autoStartDaemon(): Promise<boolean> {
		if (this.isDaemonRunning()) {
			return true;
		}

		// P1 UX: Check circuit breaker - if CLI was not found, don't retry automatically
		if (circuitBreaker.cliNotFound) {
			logger.debug("Daemon auto-start skipped: CLI not found (circuit breaker active)");
			return false;
		}

		const cliPath = getCliPath();
		if (!cliPath) {
			logger.warn("Cannot auto-start daemon: snapback CLI not found");
			this.showCliNotFoundNotification("CLI path resolution failed");
			return false;
		}

		logger.info("Auto-starting SnapBack daemon...", { cliPath });

		return new Promise((resolve) => {
			const startTime = Date.now();
			let resolved = false; // Flag to stop polling when error occurs

			try {
				// Determine spawn command and args based on CLI path type
				// If it's a .js file (local dev), run with node; otherwise run directly
				const isJsFile = cliPath.endsWith(".js");
				const spawnCommand = isJsFile ? process.execPath : cliPath;
				const spawnArgs = isJsFile ? [cliPath, "daemon", "start", "--detach"] : ["daemon", "start", "--detach"];

				logger.debug("Spawning daemon", { command: spawnCommand, args: spawnArgs });

				// Spawn daemon in detached mode
				const child: ChildProcess = spawn(spawnCommand, spawnArgs, {
					detached: true,
					stdio: "ignore",
					shell: IS_WINDOWS && !isJsFile, // Only use shell for non-.js paths on Windows
				});

				child.unref();

				// 🆕 P0 FIX: Log daemon startup details for transparency
				const daemonPid = child.pid;
				logger.info("Daemon process spawned", {
					pid: daemonPid,
					command: spawnCommand,
					args: spawnArgs,
					socketPath: getSocketPath(),
					detached: true,
				});

				child.on("error", (err) => {
					if (resolved) {
						return;
					}
					resolved = true;

					const errorMsg = err.message;

					// P1 UX: Detect ENOENT and activate circuit breaker
					if ((err as NodeJS.ErrnoException).code === "ENOENT" || errorMsg.includes("ENOENT")) {
						circuitBreaker.cliNotFound = true;
						circuitBreaker.lastError = errorMsg;
						logger.warn("Daemon spawn failed: CLI not found (ENOENT)", { cliPath });
						this.transitionTo("cli_missing", { reason: errorMsg });
						this.showCliNotFoundNotification(errorMsg);
					} else {
						logger.warn("Failed to spawn daemon process", { error: errorMsg });
					}

					resolve(false);
				});

				// Poll for daemon to be ready
				const checkDaemon = () => {
					// Stop polling if already resolved (e.g., from error handler)
					if (resolved) {
						return;
					}

					const elapsed = Date.now() - startTime;

					if (elapsed > DAEMON_START_TIMEOUT_MS) {
						if (resolved) {
							return;
						}
						resolved = true;
						logger.warn("Daemon auto-start timed out");
						resolve(false);
						return;
					}

					if (this.isDaemonRunning()) {
						if (resolved) {
							return;
						}
						resolved = true;
						logger.info("SnapBack daemon auto-started successfully", {
							elapsedMs: elapsed,
						});
						// Give daemon a moment to set up socket
						setTimeout(() => resolve(true), DAEMON_START_WAIT_MS);
						return;
					}

					// Check again after delay
					setTimeout(checkDaemon, 200);
				};

				// Start checking after initial delay
				setTimeout(checkDaemon, DAEMON_START_WAIT_MS);
			} catch (err) {
				const errorMsg = err instanceof Error ? err.message : String(err);

				// P1 UX: Detect ENOENT in catch block
				if (errorMsg.includes("ENOENT")) {
					circuitBreaker.cliNotFound = true;
					circuitBreaker.lastError = errorMsg;
					logger.warn("Daemon spawn exception: CLI not found (ENOENT)", { cliPath });
					this.transitionTo("cli_missing", { reason: errorMsg });
					this.showCliNotFoundNotification(errorMsg);
				} else {
					logger.warn("Exception during daemon auto-start", { error: errorMsg });
				}

				resolve(false);
			}
		});
	}

	/**
	 * P1 UX: Show user-friendly notification when CLI is not found.
	 * Uses NotificationManager for consistent cooldown and deduplication.
	 */
	private showCliNotFoundNotification(_errorDetails: string): void {
		// NotificationManager handles cooldown/deduplication via notification ID
		// We still track notificationShown to prevent circuit breaker reset spam
		if (circuitBreaker.notificationShown) {
			return;
		}
		circuitBreaker.notificationShown = true;

		logger.info("Showing CLI not found notification to user");

		// Use NotificationManager for consistent notification handling
		getNotificationManager()
			.show({
				id: "daemon-cli-not-found",
				priority: "high",
				message: "SnapBack CLI not found. Some features (daemon mode, advanced sync) are unavailable.",
				actions: ["Configure CLI Path", "Install CLI", "Retry"],
				cooldownMs: 300000, // 5 minutes - don't spam if user dismisses
			})
			.then((result) => {
				switch (result.action) {
					case "Configure CLI Path":
						vscode.commands.executeCommand("workbench.action.openSettings", "snapback.cliPath");
						// Reset circuit breaker when user goes to settings
						resetDaemonCircuitBreaker();
						break;
					case "Install CLI":
						vscode.env.openExternal(vscode.Uri.parse("https://docs.snapback.dev/cli/install"));
						break;
					case "Retry":
						// Reset circuit breaker and try again
						resetDaemonCircuitBreaker();
						void this.connect();
						break;
				}
			});
	}

	/**
	 * Connect to daemon, auto-starting if necessary.
	 * Per ARCHITECTURE_REFACTOR_SPEC.md Phase 1: Verify daemon auto-starts on activation.
	 */
	async connect(): Promise<boolean> {
		const connectStartTime = Date.now();
		logger.info(`${LOG_PREFIX} Connection attempt starting`, {
			clientId: CLIENT_ID,
			attempt: this.reconnectAttempts + 1,
			maxAttempts: this.maxReconnectAttempts,
			socketPath: getSocketPath(),
			alreadyConnected: this.isConnected(),
			isConnecting: this.isConnecting,
			circuitBreakerActive: circuitBreaker.cliNotFound,
		});

		if (this.isConnected()) {
			logger.debug(`${LOG_PREFIX} Already connected, skipping`);
			return true;
		}

		if (this.isConnecting) {
			logger.debug(`${LOG_PREFIX} Connection already in progress, skipping duplicate`);
			return false;
		}

		// Auto-start daemon if not running
		// Per ARCHITECTURE_REFACTOR_SPEC.md Phase 1: Verify daemon auto-starts on activation
		if (!this.isDaemonRunning()) {
			logger.info(`${LOG_PREFIX} Daemon not running, attempting auto-start...`, {
				clientId: CLIENT_ID,
				pidPath: getPidPath(),
			});
			const started = await this.autoStartDaemon();
			if (!started) {
				logger.warn(`${LOG_PREFIX} Daemon auto-start failed`, {
					clientId: CLIENT_ID,
					elapsedMs: Date.now() - connectStartTime,
					circuitBreakerActive: circuitBreaker.cliNotFound,
				});
				return false;
			}
		}

		this.isConnecting = true;

		try {
			const connectionStart = Date.now();
			logger.debug(`${LOG_PREFIX} Establishing socket connection...`, {
				clientId: CLIENT_ID,
				socketPath: getSocketPath(),
			});
			await this.establishConnection();
			const socketConnectTime = Date.now() - connectionStart;
			logger.info(`${LOG_PREFIX} Socket connected`, {
				clientId: CLIENT_ID,
				socketConnectMs: socketConnectTime,
			});

			this.reconnectDelay = MIN_RECONNECT_INTERVAL_MS;
			this.reconnectAttempts = 0; // Reset on successful connection

			// Verify daemon health immediately after connection
			try {
				const healthStart = Date.now();
				const pingResult = await this.ping();
				const healthLatency = Date.now() - healthStart;

				// Store daemon version for state events
				this._daemonVersion = pingResult.version;

				logger.info(`${LOG_PREFIX} Connected to SnapBack daemon`, {
					clientId: CLIENT_ID,
					socketPath: getSocketPath(),
					connectionLatency: Date.now() - connectionStart,
					socketConnectMs: socketConnectTime,
					daemonVersion: pingResult.version,
					daemonUptime: pingResult.uptime,
					healthCheckLatency: healthLatency,
					healthy: true,
					totalConnectTimeMs: Date.now() - connectStartTime,
				});

				// Transition to connected state with version info
				this.transitionTo("connected", { daemonVersion: pingResult.version });
			} catch (pingError) {
				// Connection succeeded but ping failed - still transition to connected
				logger.warn(`${LOG_PREFIX} Daemon connection succeeded but health check failed`, {
					clientId: CLIENT_ID,
					error: pingError instanceof Error ? pingError.message : String(pingError),
				});
				this.transitionTo("connected");
			}

			return true;
		} catch (error) {
			const reason = error instanceof Error ? error.message : String(error);
			logger.warn(`${LOG_PREFIX} Failed to connect to daemon`, {
				clientId: CLIENT_ID,
				error: reason,
				elapsedMs: Date.now() - connectStartTime,
				attempt: this.reconnectAttempts + 1,
				willRetry: this.reconnectAttempts < this.maxReconnectAttempts,
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

		// Transition to disconnected state
		this.transitionTo("disconnected", { reason: "Manual disconnect" });
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
		const socketSetupTime = Date.now();
		logger.debug(`${LOG_PREFIX} Setting up socket handlers`, { clientId: CLIENT_ID });

		socket.on("data", (data) => {
			this.handleData(data.toString());
		});

		socket.on("close", (hadError) => {
			const connectionDuration = Date.now() - socketSetupTime;
			logger.warn(`${LOG_PREFIX} Daemon connection closed`, {
				clientId: CLIENT_ID,
				hadError,
				connectionDurationMs: connectionDuration,
				reconnectAttempts: this.reconnectAttempts,
				nextReconnectDelayMs: this.reconnectDelay,
				timestamp: new Date().toISOString(),
			});
			this.socket = null;
			this.scheduleReconnect();
		});

		socket.on("error", (error) => {
			logger.error(`${LOG_PREFIX} Daemon socket error`, {
				clientId: CLIENT_ID,
				error: error instanceof Error ? error.message : String(error),
				errorCode: (error as NodeJS.ErrnoException).code,
				connectionDurationMs: Date.now() - socketSetupTime,
				timestamp: new Date().toISOString(),
			});
		});

		socket.on("timeout", () => {
			logger.warn(`${LOG_PREFIX} Daemon socket timeout`, {
				clientId: CLIENT_ID,
				connectionDurationMs: Date.now() - socketSetupTime,
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
			if (!line.trim()) {
				continue;
			}

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

			case "snapshot.created":
				// MCP or CLI created a snapshot - notify Extension
				// This enables vitals pressure reset across all snapshot sources
				logger.debug("Snapshot created notification from daemon", {
					snapshotId: data.snapshotId,
					source: data.source,
				});
				this._onSnapshotCreated.fire({
					snapshotId: data.snapshotId as string,
					filePath: data.filePath as string,
					trigger: data.trigger as "manual" | "auto" | "mcp" | "ai-detection",
					source: data.source as "extension" | "mcp" | "cli",
					workspaceId: data.workspaceId as string | undefined,
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
		// Don't schedule if circuit breaker is active
		if (circuitBreaker.cliNotFound) {
			logger.debug(`${LOG_PREFIX} Reconnect skipped: circuit breaker active (CLI not found)`, {
				clientId: CLIENT_ID,
			});
			return;
		}

		if (this.reconnectTimer) {
			logger.debug(`${LOG_PREFIX} Reconnect already scheduled, skipping duplicate`, {
				clientId: CLIENT_ID,
			});
			return;
		}

		this.reconnectAttempts++;

		// Give up after max attempts
		if (this.reconnectAttempts > this.maxReconnectAttempts) {
			logger.error(`${LOG_PREFIX} Max reconnection attempts reached, giving up`, {
				clientId: CLIENT_ID,
				attempts: this.reconnectAttempts,
				maxAttempts: this.maxReconnectAttempts,
				totalBackoffMs: this.reconnectDelay,
				timestamp: new Date().toISOString(),
			});
			this.transitionTo("disconnected", {
				reason: `Failed after ${this.maxReconnectAttempts} attempts`,
			});
			return;
		}

		// Add jitter to prevent thundering herd (multiple clients reconnecting simultaneously)
		const jitter = Math.floor(Math.random() * 500);
		const delayWithJitter = this.reconnectDelay + jitter;

		logger.info(`${LOG_PREFIX} Scheduling reconnect`, {
			clientId: CLIENT_ID,
			attempt: this.reconnectAttempts,
			maxAttempts: this.maxReconnectAttempts,
			baseDelayMs: this.reconnectDelay,
			jitterMs: jitter,
			totalDelayMs: delayWithJitter,
			nextAttemptAt: new Date(Date.now() + delayWithJitter).toISOString(),
		});

		// Transition to reconnecting state with details
		this.transitionTo("reconnecting");

		this.reconnectTimer = setTimeout(async () => {
			this.reconnectTimer = null;
			logger.debug(`${LOG_PREFIX} Reconnect timer fired, attempting connection`, {
				clientId: CLIENT_ID,
				attempt: this.reconnectAttempts,
			});
			await this.connect();
		}, delayWithJitter);

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

	/** Performance telemetry: Track average daemon response time */
	private responseTimeSamples: number[] = [];
	private readonly MAX_SAMPLES = 100;

	/**
	 * Get average daemon response time (for performance monitoring)
	 * Per ARCHITECTURE_REFACTOR_SPEC.md Phase 5: Performance validation target < 100ms
	 */
	getAverageDaemonResponseTime(): { averageMs: number; samples: number; p95Ms: number } {
		if (this.responseTimeSamples.length === 0) {
			return { averageMs: 0, samples: 0, p95Ms: 0 };
		}

		const sorted = [...this.responseTimeSamples].sort((a, b) => a - b);
		const sum = sorted.reduce((a, b) => a + b, 0);
		const average = sum / sorted.length;

		// Calculate P95 (95th percentile)
		const p95Index = Math.floor(sorted.length * 0.95);
		const p95 = sorted[p95Index] || sorted[sorted.length - 1];

		return {
			averageMs: Math.round(average),
			samples: sorted.length,
			p95Ms: Math.round(p95),
		};
	}

	/**
	 * Send a request to the daemon with performance telemetry
	 * Per ARCHITECTURE_REFACTOR_SPEC.md Phase 5: Performance validation
	 */
	async request<T>(method: string, params: Record<string, unknown>): Promise<T> {
		if (!this.isConnected()) {
			const connected = await this.connect();
			if (!connected) {
				throw new Error("Not connected to daemon");
			}
		}

		const requestStartTime = Date.now();
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
				resolve: ((value: unknown) => {
					// Record response time for performance telemetry
					const responseTime = Date.now() - requestStartTime;
					this.responseTimeSamples.push(responseTime);

					// Keep only last MAX_SAMPLES samples
					if (this.responseTimeSamples.length > this.MAX_SAMPLES) {
						this.responseTimeSamples.shift();
					}

					// Log slow requests (> 100ms target)
					if (responseTime > 100) {
						logger.debug(`Slow daemon request: ${method} took ${responseTime}ms`, {
							method,
							responseTime,
						});
					}

					resolve(value as T);
				}) as (value: unknown) => void,
				reject,
				timeout,
			});

			this.socket?.write(`${JSON.stringify(request)}\n`);
		});
	}

	// =========================================================================
	// DAEMON API
	// =========================================================================

	// =========================================================================
	// PATH CONVERSION UTILITIES (P0 Fix: Absolute paths not allowed)
	// =========================================================================

	/**
	 * Convert absolute file path to workspace-relative path for daemon protocol.
	 * The daemon expects workspace-relative paths to prevent path traversal attacks.
	 *
	 * @param workspacePath - Absolute workspace root path
	 * @param filePath - File path (can be absolute or already relative)
	 * @returns Workspace-relative path
	 */
	private toRelativePath(workspacePath: string, filePath: string): string {
		if (isAbsolute(filePath) && filePath.startsWith(workspacePath)) {
			return relative(workspacePath, filePath);
		}
		return filePath;
	}

	/**
	 * Convert array of absolute file paths to workspace-relative paths.
	 *
	 * @param workspacePath - Absolute workspace root path
	 * @param filePaths - Array of file paths (can be absolute or already relative)
	 * @returns Array of workspace-relative paths
	 */
	private toRelativePaths(workspacePath: string, filePaths: string[]): string[] {
		return filePaths.map((fp) => this.toRelativePath(workspacePath, fp));
	}

	// =========================================================================
	// DAEMON OPERATIONS
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
	 * Subscribe to file watching for a workspace.
	 *
	 * If daemon file watching fails, the extension falls back to VS Code's built-in
	 * FileSystemWatcher API (see UnifiedDataService, WorkspaceDataService).
	 */
	async subscribeToFileWatching(workspacePath: string): Promise<boolean> {
		if (!this.isConnected()) {
			const connected = await this.connect();
			if (!connected) {
				logger.warn("File watching fallback", {
					reason: "daemon not connected",
					fallback: "VS Code FileSystemWatcher",
					impact: "file changes detected via VS Code API polling",
				});
				return false;
			}
		}

		try {
			await this.request("watch.subscribe", {
				workspace: workspacePath,
			});
			this.subscriptions.add(workspacePath);
			logger.info("File watching setup", {
				workspace: workspacePath,
				watcher: "daemon",
				subscribed: true,
			});
			return true;
		} catch (error) {
			logger.warn("File watching fallback", {
				workspace: workspacePath,
				reason: error instanceof Error ? error.message : String(error),
				fallback: "VS Code FileSystemWatcher",
				impact: "file changes detected via VS Code API polling",
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
			// P0 FIX: Convert absolute path to workspace-relative
			const relativePath = this.toRelativePath(workspacePath, filePath);

			await this.request("file.modified", {
				workspace: workspacePath,
				path: relativePath,
				linesChanged,
				aiAttributed,
			});
			return true;
		} catch {
			return false;
		}
	}

	// =========================================================================
	// SNAPSHOT OPERATIONS (ARCHITECTURE_REFACTOR_SPEC.md Phase 6A)
	// =========================================================================

	/**
	 * Create a snapshot via the daemon.
	 *
	 * Per ARCHITECTURE_REFACTOR_SPEC.md Phase 3: Extension should route snapshot
	 * operations through the CLI daemon which uses @snapback/sdk SnapshotManager.
	 *
	 * @param workspacePath - Workspace root path (absolute)
	 * @param files - Array of file paths to snapshot (can be absolute or relative)
	 * @param options - Snapshot creation options
	 * @returns Snapshot creation result with snapshotId
	 *
	 * @example
	 * ```typescript
	 * const bridge = getDaemonBridge();
	 * const result = await bridge.createSnapshot(
	 *   '/workspace/path',
	 *   ['src/file.ts'],
	 *   { reason: 'Manual snapshot', trigger: 'manual' }
	 * );
	 * console.log(`Snapshot created: ${result.snapshotId}`);
	 * ```
	 */
	async createSnapshot(
		workspacePath: string,
		files: string[],
		options?: {
			reason?: string;
			trigger?: "manual" | "mcp" | "ai_assist" | "session_end";
		},
	): Promise<{ snapshotId: string; createdAt: string }> {
		// 🐛 P0 FIX: Convert absolute file paths to workspace-relative
		// The daemon expects workspace-relative paths, but extension commands provide absolute paths
		// This was causing "Absolute paths not allowed" errors in createSnapshot, file watching, etc.
		const relativePaths = this.toRelativePaths(workspacePath, files);

		logger.debug("Creating snapshot via daemon", {
			workspace: workspacePath,
			filesCount: files.length,
			pathsConverted: files.some((f, i) => f !== relativePaths[i]),
		});

		const result = await this.request<{ snapshotId: string; createdAt: string }>("snapshot.create", {
			workspace: workspacePath,
			files: relativePaths,
			...options,
		});

		// 🆕 Track first file protected in activation funnel
		// The funnel tracks this only once per user lifecycle
		if (result?.snapshotId && files.length > 0) {
			const fileExt = files[0].split(".").pop() || "unknown";
			getActivationFunnel()?.trackFirstFileProtected(fileExt);
		}

		return result;
	}

	/**
	 * List snapshots for a workspace via the daemon.
	 *
	 * @param workspacePath - Workspace root path
	 * @param options - List options (limit, since timestamp)
	 * @returns Array of snapshots
	 *
	 * @example
	 * ```typescript
	 * const bridge = getDaemonBridge();
	 * const snapshots = await bridge.listSnapshots('/workspace/path', { limit: 10 });
	 * ```
	 */
	async listSnapshots(
		workspacePath: string,
		options?: {
			limit?: number;
			since?: string;
		},
	): Promise<Array<{ snapshotId: string; createdAt: string; files: string[] }>> {
		return this.request("snapshot.list", {
			workspace: workspacePath,
			...options,
		});
	}

	/**
	 * Delete a snapshot via the daemon.
	 *
	 * @param workspacePath - Workspace root path
	 * @param snapshotId - Snapshot ID to delete
	 * @returns Success boolean
	 *
	 * @example
	 * ```typescript
	 * const bridge = getDaemonBridge();
	 * await bridge.deleteSnapshot('/workspace/path', 'snapshot-123');
	 * ```
	 */
	async deleteSnapshot(workspacePath: string, snapshotId: string): Promise<void> {
		return this.request("snapshot.delete", {
			workspace: workspacePath,
			snapshotId,
		});
	}

	/**
	 * Restore a snapshot via the daemon.
	 *
	 * @param workspacePath - Workspace root path
	 * @param snapshotId - Snapshot ID to restore
	 * @param options - Restore options
	 * @returns Restore result
	 *
	 * @example
	 * ```typescript
	 * const bridge = getDaemonBridge();
	 * await bridge.restoreSnapshot('/workspace/path', 'snapshot-123', { dryRun: true });
	 * ```
	 */
	async restoreSnapshot(
		workspacePath: string,
		snapshotId: string,
		options?: {
			files?: string[];
			dryRun?: boolean;
		},
	): Promise<{ restored: string[]; skipped: string[] }> {
		// P0 FIX: Convert absolute file paths to workspace-relative
		const relativeFiles = options?.files ? this.toRelativePaths(workspacePath, options.files) : undefined;

		return this.request("snapshot.restore", {
			workspace: workspacePath,
			snapshotId,
			...(relativeFiles ? { files: relativeFiles, dryRun: options?.dryRun } : options),
		});
	}

	/**
	 * Bulk delete snapshots by age via the daemon.
	 * ARCHITECTURE_REFACTOR_SPEC.md Sprint 3: Remaining snapshot operations
	 *
	 * @param workspacePath - Workspace root path
	 * @param options - Deletion options
	 * @param options.olderThanDays - Delete snapshots older than N days (default: 30)
	 * @param options.keepProtected - Skip protected snapshots (default: true)
	 * @returns Bulk delete result with count
	 *
	 * @example
	 * ```typescript
	 * const bridge = getDaemonBridge();
	 * const result = await bridge.bulkDeleteSnapshots('/workspace/path', {
	 *   olderThanDays: 30,
	 *   keepProtected: true
	 * });
	 * console.log(`Deleted ${result.deletedCount} snapshots`);
	 * ```
	 */
	async bulkDeleteSnapshots(
		workspacePath: string,
		options: {
			olderThanDays?: number;
			keepProtected?: boolean;
		},
	): Promise<{ success: boolean; deletedCount: number }> {
		return this.request("snapshot.bulkDelete", {
			workspace: workspacePath,
			...options,
		});
	}

	/**
	 * Protect a snapshot from deletion via the daemon.
	 * ARCHITECTURE_REFACTOR_SPEC.md Sprint 3: Remaining snapshot operations
	 *
	 * @param workspacePath - Workspace root path
	 * @param snapshotId - Snapshot ID to protect
	 * @returns Success result
	 *
	 * @example
	 * ```typescript
	 * const bridge = getDaemonBridge();
	 * await bridge.protectSnapshot('/workspace/path', 'snapshot-123');
	 * ```
	 */
	async protectSnapshot(
		workspacePath: string,
		snapshotId: string,
	): Promise<{ success: boolean; snapshotId: string }> {
		return this.request("snapshot.protect", {
			workspace: workspacePath,
			snapshotId,
		});
	}

	/**
	 * Unprotect a snapshot allowing deletion via the daemon.
	 * ARCHITECTURE_REFACTOR_SPEC.md Sprint 3: Remaining snapshot operations
	 *
	 * @param workspacePath - Workspace root path
	 * @param snapshotId - Snapshot ID to unprotect
	 * @returns Success result
	 *
	 * @example
	 * ```typescript
	 * const bridge = getDaemonBridge();
	 * await bridge.unprotectSnapshot('/workspace/path', 'snapshot-123');
	 * ```
	 */
	async unprotectSnapshot(
		workspacePath: string,
		snapshotId: string,
	): Promise<{ success: boolean; snapshotId: string }> {
		return this.request("snapshot.unprotect", {
			workspace: workspacePath,
			snapshotId,
		});
	}

	/**
	 * Rename a snapshot via the daemon.
	 * ARCHITECTURE_REFACTOR_SPEC.md Sprint 3: Remaining snapshot operations
	 *
	 * @param workspacePath - Workspace root path
	 * @param snapshotId - Snapshot ID to rename
	 * @param newName - New name for the snapshot
	 * @returns Success result with new name
	 *
	 * @example
	 * ```typescript
	 * const bridge = getDaemonBridge();
	 * await bridge.renameSnapshot('/workspace/path', 'snapshot-123', 'New Name');
	 * ```
	 */
	async renameSnapshot(
		workspacePath: string,
		snapshotId: string,
		newName: string,
	): Promise<{ success: boolean; snapshotId: string; newName: string }> {
		return this.request("snapshot.rename", {
			workspace: workspacePath,
			snapshotId,
			newName,
		});
	}

	// =========================================================================
	// SESSION OPERATIONS
	// =========================================================================

	/**
	 * Begin a new session in the daemon
	 * @param workspacePath Workspace root path
	 * @param task Task description/summary
	 * @param files Optional array of initial files
	 * @param keywords Optional keywords for context
	 * @returns Session information with task ID, patterns, and learnings
	 */
	async beginSession(
		workspacePath: string,
		task: string,
		files?: string[],
		keywords?: string[],
	): Promise<{
		taskId: string;
		patterns: Array<{ name: string; description: string }>;
		constraints: Array<{ domain: string; name: string; value: string | number; description: string }>;
		learnings: Array<{ type: string; trigger: string; action: string; relevanceScore: number }>;
		risk: { level: string; factors: string[] };
		nextActions: string[];
	}> {
		// P0 FIX: Convert absolute file paths to workspace-relative
		const relativeFiles = files ? this.toRelativePaths(workspacePath, files) : undefined;

		return this.request("session.begin", {
			workspace: workspacePath,
			task,
			files: relativeFiles,
			keywords,
		});
	}

	/**
	 * End the current session in the daemon
	 * @param workspacePath Workspace root path
	 * @param outcome Session outcome: 'completed', 'abandoned', 'blocked'
	 * @param createSnapshot Whether to create a final snapshot
	 * @param notes Optional notes about session completion
	 * @returns Session finalization result
	 */
	async endSession(
		workspacePath: string,
		outcome: "completed" | "abandoned" | "blocked",
		createSnapshot = true,
		notes?: string,
	): Promise<{
		finalized: boolean;
		sessionId: string;
		filesModified: number;
		snapshotId?: string;
	}> {
		return this.request("session.end", {
			workspace: workspacePath,
			outcome,
			createSnapshot,
			notes,
		});
	}

	/**
	 * Get changes from the current session
	 * @param workspacePath Workspace root path
	 * @param includeDiff Whether to include full diff
	 * @returns Session changes with file list and optional diffs
	 */
	async getSessionChanges(
		workspacePath: string,
		includeDiff = false,
	): Promise<{
		files: Array<{ path: string; action: "add" | "change" | "delete"; linesChanged?: number }>;
		diff?: string;
	}> {
		return this.request("session.changes", {
			workspace: workspacePath,
			includeDiff,
		});
	}

	// =========================================================================
	// LEARNING OPERATIONS
	// =========================================================================

	/**
	 * Add a learning to the daemon's knowledge base
	 * @param workspacePath Workspace root path
	 * @param learning Learning object with trigger, action, and type
	 * @returns Confirmation with learning ID
	 */
	async addLearning(
		workspacePath: string,
		learning: {
			trigger: string;
			action: string;
			type?: "pattern" | "pitfall" | "efficiency" | "discovery" | "workflow";
			source?: string;
		},
	): Promise<{ id: string; recorded: boolean }> {
		return this.request("learning.add", {
			workspace: workspacePath,
			...learning,
		});
	}

	/**
	 * Search learnings by keywords
	 * @param workspacePath Workspace root path
	 * @param keywords Keywords to search for
	 * @param limit Maximum number of results (default: 10)
	 * @returns Array of relevant learnings
	 */
	async searchLearnings(
		workspacePath: string,
		keywords: string[],
		limit = 10,
	): Promise<Array<{ type: string; trigger: string; action: string; usageCount: number; relevanceScore: number }>> {
		return this.request("learning.search", {
			workspace: workspacePath,
			keywords,
			limit,
		});
	}

	/**
	 * List all learnings in the workspace.
	 * ARCHITECTURE_REFACTOR_SPEC.md Sprint 1: Learning operations delegation
	 *
	 * @param workspacePath Workspace root path
	 * @param limit Maximum number of results (default: 50)
	 * @returns Array of learnings with metadata
	 */
	async listLearnings(
		workspacePath: string,
		limit = 50,
	): Promise<{
		learnings: Array<{
			type: string;
			trigger: string;
			action: string;
			source?: string;
			timestamp?: string;
		}>;
		total: number;
	}> {
		return this.request("learning.list", {
			workspace: workspacePath,
			limit,
		});
	}

	// =========================================================================
	// CONTEXT & VALIDATION OPERATIONS
	// =========================================================================

	/**
	 * Get context from the daemon (patterns, constraints, learnings)
	 * @param workspacePath Workspace root path
	 * @param task Optional task description for context filtering
	 * @param keywords Optional keywords for context filtering
	 * @returns Context object with patterns and learnings
	 */
	async getContext(
		workspacePath: string,
		task?: string,
		keywords?: string[],
	): Promise<{
		patterns: string;
		constraints: Array<{ domain: string; name: string; value: string | number; description: string }>;
		learnings: Array<{ type: string; trigger: string; action: string }>;
	}> {
		return this.request("context.get", {
			workspace: workspacePath,
			task,
			keywords,
		});
	}

	/**
	 * Run quick validation (TypeScript + Biome)
	 * @param workspacePath Workspace root path
	 * @param files Optional array of files to validate (defaults to changed files)
	 * @returns Validation result with errors and warnings
	 */
	async validateQuick(
		workspacePath: string,
		files?: string[],
	): Promise<{
		passed: boolean;
		errors: Array<{ file: string; line: number; message: string }>;
		warnings: Array<{ file: string; line: number; message: string }>;
	}> {
		// P0 FIX: Convert absolute file paths to workspace-relative
		const relativeFiles = files ? this.toRelativePaths(workspacePath, files) : undefined;

		return this.request("validate.quick", {
			workspace: workspacePath,
			files: relativeFiles,
		});
	}

	// =========================================================================
	// PROTECTION OPERATIONS (ARCHITECTURE_REFACTOR_SPEC.md Sprint 1)
	// =========================================================================

	/**
	 * Get protection level for a file via the daemon.
	 *
	 * Per ARCHITECTURE_REFACTOR_SPEC.md Phase 3: Protection decisions should
	 * route through the CLI daemon which uses @snapback/sdk ProtectionManager.
	 *
	 * @param workspacePath - Workspace root path
	 * @param filePath - Absolute or relative file path
	 * @returns Protection level or null if not protected
	 */
	async getProtectionLevel(
		workspacePath: string,
		filePath: string,
	): Promise<{ level: "watch" | "warn" | "block" | null; reason?: string; pattern?: string }> {
		// P0 FIX: Convert absolute path to workspace-relative
		const relativePath = this.toRelativePath(workspacePath, filePath);

		return this.request("protection.getLevel", {
			workspace: workspacePath,
			filePath: relativePath,
		});
	}

	/**
	 * Set protection level for a file via the daemon.
	 *
	 * @param workspacePath - Workspace root path
	 * @param filePath - Absolute or relative file path
	 * @param level - Protection level to set
	 * @param reason - Optional reason for the protection
	 * @returns Success status and previous level
	 */
	async setProtectionLevel(
		workspacePath: string,
		filePath: string,
		level: "watch" | "warn" | "block",
		reason?: string,
	): Promise<{ success: boolean; previousLevel?: "watch" | "warn" | "block" }> {
		// P0 FIX: Convert absolute path to workspace-relative
		const relativePath = this.toRelativePath(workspacePath, filePath);

		return this.request("protection.setLevel", {
			workspace: workspacePath,
			filePath: relativePath,
			level,
			reason,
		});
	}

	/**
	 * List all protected files in a workspace via the daemon.
	 *
	 * @param workspacePath - Workspace root path
	 * @param options - Optional filters (level, limit)
	 * @returns Array of protected files with metadata
	 */
	async listProtectedFiles(
		workspacePath: string,
		options?: {
			level?: "watch" | "warn" | "block";
			limit?: number;
		},
	): Promise<{
		files: Array<{
			path: string;
			level: "watch" | "warn" | "block";
			pattern?: string;
			reason?: string;
			protectedAt?: string;
		}>;
		total: number;
	}> {
		return this.request("protection.list", {
			workspace: workspacePath,
			...options,
		});
	}

	// =========================================================================
	// VALIDATION OPERATIONS (Extended)
	// =========================================================================

	/**
	 * Run comprehensive validation via the daemon.
	 * Includes TypeScript, linting, and pattern checking.
	 *
	 * @param workspacePath - Workspace root path
	 * @param code - Code content to validate
	 * @param filePath - File path for context
	 * @returns Comprehensive validation result
	 */
	async validateComprehensive(
		workspacePath: string,
		code: string,
		filePath: string,
	): Promise<{
		passed: boolean;
		patternViolations: Array<{ pattern: string; file: string; line?: number; message: string }>;
		typescriptErrors: Array<{ file: string; line: number; message: string }>;
		lintErrors: Array<{ file: string; line: number; message: string; rule?: string }>;
	}> {
		// P0 FIX: Convert absolute path to workspace-relative
		const relativePath = this.toRelativePath(workspacePath, filePath);

		return this.request("validate.comprehensive", {
			workspace: workspacePath,
			code,
			filePath: relativePath,
		});
	}

	/**
	 * Check code patterns via the daemon.
	 *
	 * @param workspacePath - Workspace root path
	 * @param code - Code content to check
	 * @param filePath - File path for context
	 * @returns Pattern check result with violations and suggestions
	 */
	async checkPatterns(
		workspacePath: string,
		code: string,
		filePath: string,
	): Promise<{
		passed: boolean;
		violations: Array<{ pattern: string; line?: number; message: string }>;
		suggestions: string[];
	}> {
		// P0 FIX: Convert absolute path to workspace-relative
		const relativePath = this.toRelativePath(workspacePath, filePath);

		return this.request("context.check_patterns", {
			workspace: workspacePath,
			code,
			filePath: relativePath,
		});
	}

	// =========================================================================
	// VIOLATION OPERATIONS
	// =========================================================================

	/**
	 * Report a violation to the daemon for tracking.
	 *
	 * @param workspacePath - Workspace root path
	 * @param violation - Violation details
	 * @returns Violation tracking result
	 */
	async reportViolation(
		workspacePath: string,
		violation: {
			type: string;
			file: string;
			whatHappened: string;
			whyItHappened: string;
			prevention: string;
		},
	): Promise<{
		violationId: string;
		count: number;
		promoted: boolean;
		promotedTo?: "pattern" | "automation";
	}> {
		return this.request("violation.report", {
			workspace: workspacePath,
			...violation,
		});
	}

	/**
	 * List tracked violations from the daemon.
	 *
	 * @param workspacePath - Workspace root path
	 * @returns Array of tracked violations
	 */
	async listViolations(workspacePath: string): Promise<{
		violations: Array<{
			id: string;
			type: string;
			file: string;
			whatHappened: string;
			whyItHappened: string;
			prevention: string;
			occurrences: number;
			createdAt: string;
		}>;
		total: number;
	}> {
		return this.request("violation.list", {
			workspace: workspacePath,
		});
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
		this._onSnapshotCreated.dispose();
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
