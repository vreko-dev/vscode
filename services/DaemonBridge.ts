/**
 * Daemon Bridge for VS Code Extension
 *
 * Facade that delegates to ConnectionManager, HealthMonitor, DaemonOperations, and DaemonEvents.
 * Provides communication between the VS Code extension and the Vreko daemon.
 *
 * ## Architecture
 *
 * ```
 * VS Code Extension
 *         ↓
 * DaemonBridge (facade - thin orchestration layer)
 *         ↓
 * ConnectionManager + HealthMonitor + DaemonOperations + DaemonEvents
 *         ↓ (Unix socket / Named pipe)
 * Vreko Daemon
 *         ↓
 * Intelligence + File Watcher
 * ```
 *
 * ## Module Responsibilities
 *
 * - **ConnectionManager**: Socket connection, daemon spawning, reconnection logic
 * - **HealthMonitor**: Health state tracking, failure detection
 * - **DaemonOperations**: Type-safe IPC method wrappers (30+ operations)
 * - **DaemonEvents**: Event emitters and notification dispatch
 * - **DaemonBridge**: State machine, orchestration, VS Code integration
 *
 * @module services/DaemonBridge
 */

import { existsSync } from "node:fs";
import type { LocalServiceMethod } from "@vreko/local-service-client";
import { VrekoLocalClient } from "@vreko/local-service-client";
import * as vscode from "vscode";
import { getActivationFunnel } from "../telemetry/ActivationFunnelIntegration";
import { logger } from "../utils/logger";
import {
	ConnectionManager,
	circuitBreaker,
	DaemonEvents,
	DaemonOperations,
	getSocketPath,
	HealthMonitor,
	normalizeMethod,
	resetCircuitBreaker,
} from "./daemon-bridge/index.js";
// Import shared event types (single source of truth)
import type { IpcMethodName, IpcMethodParams, IpcMethodResult } from "./daemon-ipc-schema";

// =============================================================================
// CONFIGURATION
// =============================================================================

/** Request timeout in ms - increased to 60s to accommodate long-running checks (tsc, biome, madge) */
const REQUEST_TIMEOUT_MS = 60000;

/** Health check timeout in ms - shorter than request timeout for faster failure detection */
const HEALTH_CHECK_TIMEOUT_MS = 5000;

/** Log prefix for easy filtering */
const LOG_PREFIX = "[DaemonBridge]";

// Re-export for backward compatibility
export { resetCircuitBreaker as resetDaemonCircuitBreaker };

// =============================================================================
// TYPES
// =============================================================================

// Re-export types from extracted modules
export type { DaemonStatus, SessionStatusResult } from "./daemon-bridge/index.js";

// Re-export event types from daemon-ipc-schema (single source of truth)
export type {
	ComponentHealthDegradedEvent,
	ComponentHealthRecoveredEvent,
	GuardChangedEvent,
	LearningAddedEvent,
	ProtectionChangedEvent,
	RiskDetectedEvent,
	RiskUpdatedEvent,
	SessionEndedEvent,
	SessionStartedEvent,
	SnapshotCreatedEvent,
	SyncCompletedEvent,
	ViolationReportedEvent,
	WorkspaceHealthEvent,
} from "./daemon-ipc-schema";

/**
 * Connection states for the simplified MCP architecture.
 */
export type ConnectionState = "connected" | "disconnected" | "reconnecting" | "cli_missing" | "degraded";

export interface StateChangeEvent {
	state: ConnectionState;
	previousState: ConnectionState;
	attempt?: number;
	maxAttempts?: number;
	healthy?: boolean;
	lastHealthCheck?: Date;
	nextRetryMs?: number;
	reason?: string;
	daemonVersion?: string;
}

// =============================================================================
// DAEMON BRIDGE CLASS (Facade)
// =============================================================================

export class DaemonBridge extends vscode.Disposable {
	private client: InstanceType<typeof VrekoLocalClient>;
	private connectionManager: ConnectionManager;
	private healthMonitor: HealthMonitor;
	private daemonEvents: DaemonEvents;
	private daemonOperations: DaemonOperations;

	/** Instance-specific client identifier for multi-client debugging */
	readonly clientId: string;

	private _state: ConnectionState = "disconnected";
	private _daemonVersion?: string;
	private isConnecting = false;
	private subscriptions: Set<string> = new Set();

	// Shared connection promise  -  all concurrent connect() callers wait on the same attempt
	private connectPromise: Promise<boolean> | null = null;

	// Connection state events (daemon-level, not operation-level)
	private _onConnectionChanged = new vscode.EventEmitter<boolean>();
	public readonly onConnectionChanged = this._onConnectionChanged.event;

	private _onStateChange = new vscode.EventEmitter<StateChangeEvent>();
	public readonly onStateChange = this._onStateChange.event;

	/** Performance telemetry */
	private responseTimeSamples: number[] = [];
	private readonly MAX_SAMPLES = 100;

	/** Timer handle for backup health checks */
	private healthCheckTimer: ReturnType<typeof setInterval> | null = null;

	constructor() {
		super(() => this.dispose());

		// Generate instance-specific client ID for debugging
		this.clientId = `vscode-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

		this.connectionManager = new ConnectionManager();
		this.healthMonitor = new HealthMonitor({
			checkIntervalMs: 60_000,
		});
		this.daemonEvents = new DaemonEvents();

		this.client = new VrekoLocalClient({
			socketPath: getSocketPath(),
			timeout: REQUEST_TIMEOUT_MS,
			autoReconnect: false,
		});

		// Wire up client events to DaemonEvents
		this.client.on("notification", (method: string, params: unknown) => {
			this.daemonEvents.handleNotification(method, params as Record<string, unknown>);
		});

		this.client.on("disconnected", () => {
			this.stopHealthCheck();
			this.scheduleReconnect();
		});

		// Initialize DaemonOperations with request function
		this.daemonOperations = new DaemonOperations(this.request.bind(this), () => this.isConnected());

		logger.debug(`${LOG_PREFIX} DaemonBridge instance created`, { clientId: this.clientId });
	}

	// =========================================================================
	// STATE MACHINE
	// =========================================================================

	getState(): ConnectionState {
		return this._state;
	}

	getDaemonVersion(): string | undefined {
		return this._daemonVersion;
	}

	isHealthy(): boolean {
		if (!this.healthMonitor.getLastHealthCheckTime()) {
			return this._state === "connected" || this._state === "degraded";
		}
		return this.healthMonitor.isHealthy();
	}

	getLastHealthCheckTime(): Date | null {
		return this.healthMonitor.getLastHealthCheckTime();
	}

	resetAndRetry(): void {
		resetCircuitBreaker();
		this.connectionManager.resetReconnectState();
		void this.connect();
	}

	private transitionTo(
		newState: ConnectionState,
		details: Partial<Omit<StateChangeEvent, "state" | "previousState">> = {},
	): void {
		const previousState = this._state;
		if (previousState === newState && newState !== "reconnecting") {
			return;
		}

		this._state = newState;

		const event: StateChangeEvent = {
			state: newState,
			previousState,
			...details,
		};

		if (newState === "reconnecting") {
			event.attempt = this.connectionManager.getReconnectAttempt();
			event.maxAttempts = this.connectionManager.getMaxReconnectAttempts();
		}

		if (newState === "connected" && this._daemonVersion) {
			event.daemonVersion = this._daemonVersion;
		}

		logger.info(`${LOG_PREFIX} State transition`, {
			clientId: this.clientId,
			from: previousState,
			to: newState,
			...details,
		});

		this._onStateChange.fire(event);
		this._onConnectionChanged.fire(newState === "connected");
	}

	// =========================================================================
	// CONNECTION MANAGEMENT (Delegates to ConnectionManager)
	// =========================================================================

	isDaemonRunning(): boolean {
		return this.connectionManager.isDaemonRunning();
	}

	getDaemonSpawnStatus(): {
		attempts: number;
		maxAttempts: number;
		isSpawning: boolean;
		cooldownRemaining: number;
		exhausted: boolean;
	} {
		return this.connectionManager.getDaemonSpawnStatus();
	}

	resetDaemonSpawnAttempts(): void {
		this.connectionManager.resetDaemonSpawnAttempts();
	}

	isConnected(): boolean {
		return this.client.isConnected();
	}

	getReconnectAttempt(): number {
		return this.connectionManager.getReconnectAttempt();
	}

	getMaxReconnectAttempts(): number {
		return this.connectionManager.getMaxReconnectAttempts();
	}

	async connect(): Promise<boolean> {
		logger.info(`${LOG_PREFIX} [CONNECT] connect() called`, {
			currentState: this._state,
			isConnected: this.isConnected(),
			isConnecting: this.isConnecting,
			hasConnectPromise: this.connectPromise !== null,
			clientId: this.clientId,
		});

		if (this.isConnected()) {
			logger.debug(`${LOG_PREFIX} [CONNECT] Already connected, returning true`);
			return true;
		}

		if (this.connectPromise !== null) {
			logger.info(`${LOG_PREFIX} [CONNECT] Connection already in progress, waiting on existing promise`);
			return this.connectPromise;
		}

		logger.info(`${LOG_PREFIX} [CONNECT] Starting new connection attempt`);
		this.connectPromise = this._doConnect().finally(() => {
			this.connectPromise = null;
			logger.debug(`${LOG_PREFIX} [CONNECT] Connection promise cleared`);
		});

		return this.connectPromise;
	}

	private async _doConnect(): Promise<boolean> {
		const socketPath = getSocketPath();
		const daemonRunning = this.isDaemonRunning();
		const socketExists = existsSync(socketPath);

		logger.info(`${LOG_PREFIX} [_doConnect] Starting connection sequence`, {
			socketPath,
			socketExists,
			daemonRunning,
			circuitBreakerState: {
				cliNotFound: circuitBreaker.cliNotFound,
				spawnFailed: circuitBreaker.spawnFailed,
				spawnFailCount: circuitBreaker.spawnFailCount,
				lastError: circuitBreaker.lastError,
			},
		});

		// Auto-start daemon if not running
		if (!daemonRunning) {
			logger.info(`${LOG_PREFIX} [_doConnect] Daemon not running, attempting auto-start`);
			const started = await this.connectionManager.autoStartDaemon(() => this.probeDaemonStartup());
			if (!started) {
				logger.warn(`${LOG_PREFIX} [_doConnect] Auto-start daemon FAILED`);
				return false;
			}
			logger.info(`${LOG_PREFIX} [_doConnect] Auto-start daemon succeeded`);
		} else {
			logger.debug(`${LOG_PREFIX} [_doConnect] Daemon running (PID exists), checking socket`, {
				socketPath,
				socketExists,
			});
			if (!socketExists) {
				logger.warn(`${LOG_PREFIX} [_doConnect] PID exists but socket missing, waiting 500ms...`);
				await new Promise((r) => setTimeout(r, 500));
				const socketExistsAfterWait = existsSync(socketPath);
				if (!socketExistsAfterWait) {
					logger.warn(
						`${LOG_PREFIX} [_doConnect] Socket still missing after wait, killing stale daemon and restarting`,
					);
					await this.connectionManager.killDaemon();
					const restarted = await this.connectionManager.autoStartDaemon(() => this.probeDaemonStartup());
					if (!restarted) {
						logger.error(`${LOG_PREFIX} [_doConnect] Daemon restart FAILED`);
						return false;
					}
					logger.info(`${LOG_PREFIX} [_doConnect] Daemon restart succeeded`);
				}
			}
		}

		this.isConnecting = true;
		logger.info(`${LOG_PREFIX} [_doConnect] Attempting client.connect() to socket`);

		try {
			await this.client.connect();
			logger.info(`${LOG_PREFIX} [_doConnect] client.connect() succeeded, initializing...`);

			await this.client.initialize({
				protocolVersion: "1.0.0",
				clientInfo: { name: "vscode-extension", version: "1.7.0" },
				capabilities: { notifications: true, binaryContent: false },
			});
			logger.info(`${LOG_PREFIX} [_doConnect] client.initialize() succeeded`);

			this.connectionManager.resetReconnectState();

			try {
				logger.debug(`${LOG_PREFIX} [_doConnect] Sending ping to get daemon version...`);
				const pingResult = await this.daemonOperations.ping();
				this._daemonVersion = pingResult.version;
				logger.info(`${LOG_PREFIX} [_doConnect] Connection fully established`, {
					daemonVersion: pingResult.version,
				});
				this.transitionTo("connected", { daemonVersion: pingResult.version });
			} catch (pingError) {
				logger.warn(`${LOG_PREFIX} [_doConnect] Post-connect ping failed, still marking connected`, {
					error: pingError instanceof Error ? pingError.message : String(pingError),
				});
				this.transitionTo("connected");
			}

			this.startHealthCheck();
			logger.info(`${LOG_PREFIX} [_doConnect] Health check started, returning true`);
			return true;
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error);
			const errorStack = error instanceof Error ? error.stack : undefined;
			logger.error(`${LOG_PREFIX} [_doConnect] Connection FAILED`, {
				error: errorMsg,
				stack: errorStack,
				socketPath,
				socketExists: existsSync(socketPath),
			});

			// Stale socket: PID check passed but socket refused the connection.
			// The PID may belong to a recycled process, not the daemon. Kill and
			// restart so the next reconnect attempt finds a live socket.
			const isStaleSocket = daemonRunning && (errorMsg.includes("ECONNREFUSED") || errorMsg.includes("ENOENT"));
			if (isStaleSocket) {
				logger.warn(`${LOG_PREFIX} [_doConnect] Stale socket detected  -  killing and restarting daemon`);
				await this.connectionManager.killDaemon();
				await this.connectionManager.autoStartDaemon(() => this.probeDaemonStartup());
			}

			this.scheduleReconnect();
			return false;
		} finally {
			this.isConnecting = false;
		}
	}

	private async probeDaemonStartup(): Promise<boolean> {
		logger.debug(`${LOG_PREFIX} [_doConnect] Verifying daemon startup with isolated probe client...`);
		const probeClient = new VrekoLocalClient({
			socketPath: getSocketPath(),
			timeout: HEALTH_CHECK_TIMEOUT_MS,
			autoReconnect: false,
		});

		try {
			await probeClient.connect();
			await probeClient.initialize({
				protocolVersion: "1.0.0",
				clientInfo: { name: "vscode-startup-probe", version: "1.7.0" },
				capabilities: { notifications: false, binaryContent: false },
			});
			await probeClient.daemon.ping();
			logger.debug(`${LOG_PREFIX} [_doConnect] Startup probe ping succeeded`);
			return true;
		} catch (pingError) {
			logger.debug(`${LOG_PREFIX} [_doConnect] Startup probe ping failed`, {
				error: pingError instanceof Error ? pingError.message : String(pingError),
			});
			return false;
		} finally {
			probeClient.close();
		}
	}

	disconnect(): void {
		this.connectionManager.resetReconnectState();
		this.stopHealthCheck();
		this.healthMonitor.reset();
		this.client.close();
		this.transitionTo("disconnected", { reason: "Manual disconnect" });
	}

	private scheduleReconnect(): void {
		if (circuitBreaker.cliNotFound) {
			this.transitionTo("cli_missing", { reason: "CLI not found" });
			return;
		}

		this.connectionManager.scheduleReconnect(async () => {
			await this.connect();
		});

		this.transitionTo("reconnecting");
	}

	// =========================================================================
	// HEALTH MONITORING (state delegated to HealthMonitor)
	// =========================================================================

	/**
	 * Start health check monitoring
	 *
	 * Primary health monitoring is handled by DaemonHealthConsumer (Phase 4b)
	 * which uses push notifications with 30s heartbeat fallback.
	 *
	 * This method maintains a minimal backup health check for graceful degradation.
	 */
	private startHealthCheck(): void {
		this.stopHealthCheck();

		logger.debug(`${LOG_PREFIX} [HEALTH] Starting backup health check (60s fallback)`);

		this.healthCheckTimer = setInterval(async () => {
			if (this._state !== "connected" && this._state !== "degraded") {
				return;
			}

			try {
				const timeoutPromise = new Promise<never>((_, reject) => {
					setTimeout(() => reject(new Error("Health check timeout")), HEALTH_CHECK_TIMEOUT_MS);
				});
				const pingResult = await Promise.race([this.daemonOperations.ping(), timeoutPromise]);

				this.healthMonitor.recordSuccess(pingResult.version);

				if (pingResult.version) {
					this._daemonVersion = pingResult.version;
				}

				if (this._state === "degraded") {
					logger.info(`${LOG_PREFIX} [HEALTH] Recovering from degraded state`);
					this.transitionTo("connected", { daemonVersion: pingResult.version });
				}
			} catch (_error) {
				const shouldTransitionToDegraded = this.healthMonitor.recordFailure();

				const errorMsg = _error instanceof Error ? _error.message : String(_error);
				logger.warn(`${LOG_PREFIX} [HEALTH] Backup health check failed`, {
					error: errorMsg,
					status: this.healthMonitor.getStatus(),
				});

				if (shouldTransitionToDegraded && this._state === "connected") {
					logger.error(`${LOG_PREFIX} [HEALTH] Threshold reached, transitioning to degraded`);
					this.transitionTo("degraded", {
						reason: "Daemon not responding to health checks (backup monitor)",
						healthy: false,
						lastHealthCheck: this.healthMonitor.getLastHealthCheckTime() ?? undefined,
					});
				}
			}
		}, 60000);
	}

	private stopHealthCheck(): void {
		if (this.healthCheckTimer !== null) {
			clearInterval(this.healthCheckTimer);
			this.healthCheckTimer = null;
		}
		this.healthMonitor.stop();
	}

	// =========================================================================
	// JSON-RPC REQUESTS
	// =========================================================================

	getAverageDaemonResponseTime(): { averageMs: number; samples: number; p95Ms: number } {
		if (this.responseTimeSamples.length === 0) {
			return { averageMs: 0, samples: 0, p95Ms: 0 };
		}

		const sorted = [...this.responseTimeSamples].sort((a, b) => a - b);
		const sum = sorted.reduce((a, b) => a + b, 0);
		const average = sum / sorted.length;
		const p95Index = Math.floor(sorted.length * 0.95);
		const p95 = sorted[p95Index] || sorted[sorted.length - 1];

		return {
			averageMs: Math.round(average),
			samples: sorted.length,
			p95Ms: Math.round(p95),
		};
	}

	/** Type-safe overload for registered IPC methods  -  params and result are fully inferred. */
	async request<M extends IpcMethodName>(method: M, params: IpcMethodParams<M>): Promise<IpcMethodResult<M>>;
	/** Escape hatch for unregistered methods  -  callers must manually specify the result type T. */
	async request<T>(method: string, params: Record<string, unknown>): Promise<T>;
	async request<T>(method: string, params: Record<string, unknown>): Promise<T> {
		if (!this.isConnected()) {
			const connected = await this.connect();
			if (!connected) {
				throw new Error("Not connected to daemon");
			}
		}

		const requestStartTime = Date.now();
		const normalizedMethod = normalizeMethod(method);

		try {
			const result = await this.client.call<T>(normalizedMethod as LocalServiceMethod, params);
			const responseTime = Date.now() - requestStartTime;
			this.responseTimeSamples.push(responseTime);
			if (this.responseTimeSamples.length > this.MAX_SAMPLES) {
				this.responseTimeSamples.shift();
			}
			return result;
		} catch (error) {
			const responseTime = Date.now() - requestStartTime;
			this.responseTimeSamples.push(responseTime);
			if (this.responseTimeSamples.length > this.MAX_SAMPLES) {
				this.responseTimeSamples.shift();
			}
			throw error;
		}
	}

	// =========================================================================
	// EVENT ACCESSORS (forward from DaemonEvents)
	// =========================================================================

	// Core events
	get onRiskDetected() {
		return this.daemonEvents.onRiskDetected;
	}
	get onSnapshotCreated() {
		return this.daemonEvents.onSnapshotCreated;
	}
	get onDaemonShuttingDown() {
		return this.daemonEvents.onDaemonShuttingDown;
	}

	// Session events
	get onSessionStarted() {
		return this.daemonEvents.onSessionStarted;
	}
	get onSessionEnded() {
		return this.daemonEvents.onSessionEnded;
	}

	// Learning and protection events
	get onLearningAdded() {
		return this.daemonEvents.onLearningAdded;
	}
	get onLearningPruned() {
		return this.daemonEvents.onLearningPruned;
	}
	get onProtectionChanged() {
		return this.daemonEvents.onProtectionChanged;
	}
	get onViolationReported() {
		return this.daemonEvents.onViolationReported;
	}
	get onSyncCompleted() {
		return this.daemonEvents.onSyncCompleted;
	}

	// Layer 3 events
	get onRiskUpdated() {
		return this.daemonEvents.onRiskUpdated;
	}
	get onDaemonStarted() {
		return this.daemonEvents.onDaemonStarted;
	}
	get onWorkspaceHealth() {
		return this.daemonEvents.onWorkspaceHealth;
	}

	// SB-HEALTH-001 guard events
	get onGuardChanged() {
		return this.daemonEvents.onGuardChanged;
	}
	get onComponentHealthDegraded() {
		return this.daemonEvents.onComponentHealthDegraded;
	}
	get onComponentHealthRecovered() {
		return this.daemonEvents.onComponentHealthRecovered;
	}
	get onMomentumScoreUpdated() {
		return this.daemonEvents.onMomentumScoreUpdated;
	}
	get onHealthChanged() {
		return this.daemonEvents.onHealthChanged;
	}
	get onMcpToolCalled() {
		return this.daemonEvents.onMcpToolCalled;
	}
	get onMcpFileModified() {
		return this.daemonEvents.onMcpFileModified;
	}

	// Daemon handoff events (Plan 05 Task 05-5)
	get onDaemonUpdatePending() {
		return this.daemonEvents.onDaemonUpdatePending;
	}
	get onDaemonHandoffComplete() {
		return this.daemonEvents.onDaemonHandoffComplete;
	}

	// =========================================================================
	// DAEMON OPERATIONS (delegate to DaemonOperations)
	// =========================================================================

	// Daemon lifecycle
	ping() {
		return this.daemonOperations.ping();
	}
	getStatus() {
		return this.daemonOperations.getStatus();
	}
	getSessionStatus(workspacePath: string) {
		return this.daemonOperations.getSessionStatus(workspacePath);
	}

	// File watching
	async subscribeToFileWatching(workspacePath: string): Promise<boolean> {
		if (!this.isConnected()) {
			const connected = await this.connect();
			if (!connected) {
				return false;
			}
		}
		const result = await this.daemonOperations.subscribeToFileWatching(workspacePath);
		if (result) {
			this.subscriptions.add(workspacePath);
		}
		return result;
	}

	async unsubscribeFromFileWatching(workspacePath: string): Promise<boolean> {
		const result = await this.daemonOperations.unsubscribeFromFileWatching(workspacePath);
		if (result) {
			this.subscriptions.delete(workspacePath);
		}
		return result;
	}

	recordFileModification(
		workspacePath: string,
		filePath: string,
		linesChanged: number,
		aiAttributed: boolean,
		aiTool?: string,
	) {
		return this.daemonOperations.recordFileModification(
			workspacePath,
			filePath,
			linesChanged,
			aiAttributed,
			aiTool,
		);
	}

	// Snapshot operations
	async createSnapshot(
		workspacePath: string,
		files: string[],
		options?: { reason?: string; trigger?: "manual" | "mcp" | "ai_assist" | "session_end" },
	) {
		const result = await this.daemonOperations.createSnapshot(workspacePath, files, options);
		if (result?.snapshotId && files.length > 0) {
			const fileExt = files[0].split(".").pop() || "unknown";
			getActivationFunnel()?.trackFirstFileProtected(fileExt);
		}
		return result;
	}

	listSnapshots(workspacePath: string, options?: { limit?: number; since?: string }) {
		return this.daemonOperations.listSnapshots(workspacePath, options);
	}

	deleteSnapshot(workspacePath: string, snapshotId: string) {
		return this.daemonOperations.deleteSnapshot(workspacePath, snapshotId);
	}

	restoreSnapshot(workspacePath: string, snapshotId: string, options?: { files?: string[]; dryRun?: boolean }) {
		return this.daemonOperations.restoreSnapshot(workspacePath, snapshotId, options);
	}

	bulkDeleteSnapshots(workspacePath: string, options: { olderThanDays?: number; keepProtected?: boolean }) {
		return this.daemonOperations.bulkDeleteSnapshots(workspacePath, options);
	}

	protectSnapshot(workspacePath: string, snapshotId: string) {
		return this.daemonOperations.protectSnapshot(workspacePath, snapshotId);
	}

	unprotectSnapshot(workspacePath: string, snapshotId: string) {
		return this.daemonOperations.unprotectSnapshot(workspacePath, snapshotId);
	}

	renameSnapshot(workspacePath: string, snapshotId: string, newName: string) {
		return this.daemonOperations.renameSnapshot(workspacePath, snapshotId, newName);
	}

	// Session operations
	beginSession(workspacePath: string, task: string, files?: string[], keywords?: string[]) {
		return this.daemonOperations.beginSession(workspacePath, task, files, keywords);
	}

	endSession(
		workspacePath: string,
		outcome: "completed" | "abandoned" | "blocked",
		createSnapshot?: boolean,
		notes?: string,
	) {
		return this.daemonOperations.endSession(workspacePath, outcome, createSnapshot, notes);
	}

	getSessionChanges(workspacePath: string, includeDiff?: boolean) {
		return this.daemonOperations.getSessionChanges(workspacePath, includeDiff);
	}

	getClosingCeremony(workspacePath: string, sessionId: string) {
		return this.daemonOperations.getClosingCeremony(workspacePath, sessionId);
	}

	listSessionCeremonies(workspacePath: string, options?: { limit?: number; cursor?: string }) {
		return this.daemonOperations.listSessionCeremonies(workspacePath, options);
	}

	/** Report detected AI tool to daemon (spec 5.4: ai.presence processor wiring) */
	reportAiTool(workspacePath: string, sessionId: string, tool: string) {
		return this.daemonOperations.reportAiTool(workspacePath, sessionId, tool);
	}

	// Learning operations
	addLearning(
		workspacePath: string,
		learning: {
			trigger: string;
			action: string;
			type?: "pattern" | "pitfall" | "efficiency" | "discovery" | "workflow";
			source?: string;
		},
	) {
		return this.daemonOperations.addLearning(workspacePath, learning);
	}

	searchLearnings(workspacePath: string, keywords: string[], limit?: number) {
		return this.daemonOperations.searchLearnings(workspacePath, keywords, limit);
	}

	listLearnings(workspacePath: string, limit?: number) {
		return this.daemonOperations.listLearnings(workspacePath, limit);
	}

	// Context & validation
	getBaseline(workspacePath: string) {
		return this.daemonOperations.getBaseline(workspacePath);
	}
	getContext(workspacePath: string, task?: string, keywords?: string[]) {
		return this.daemonOperations.getContext(workspacePath, task, keywords);
	}
	validateQuick(workspacePath: string, files?: string[]) {
		return this.daemonOperations.validateQuick(workspacePath, files);
	}

	// Protection operations
	getProtectionLevel(workspacePath: string, filePath: string) {
		return this.daemonOperations.getProtectionLevel(workspacePath, filePath);
	}

	setProtectionLevel(workspacePath: string, filePath: string, level: "watch" | "warn" | "block", reason?: string) {
		return this.daemonOperations.setProtectionLevel(workspacePath, filePath, level, reason);
	}

	listProtectedFiles(workspacePath: string, options?: { level?: "watch" | "warn" | "block"; limit?: number }) {
		return this.daemonOperations.listProtectedFiles(workspacePath, options);
	}

	// Extended validation
	validateComprehensive(workspacePath: string, code: string, filePath: string) {
		return this.daemonOperations.validateComprehensive(workspacePath, code, filePath);
	}

	checkPatterns(workspacePath: string, code: string, filePath: string) {
		return this.daemonOperations.checkPatterns(workspacePath, code, filePath);
	}

	// Violation operations
	reportViolation(
		workspacePath: string,
		violation: { type: string; file: string; whatHappened: string; whyItHappened: string; prevention: string },
	) {
		return this.daemonOperations.reportViolation(workspacePath, violation);
	}

	listViolations(workspacePath: string) {
		return this.daemonOperations.listViolations(workspacePath);
	}

	// Health operations
	getWorkspaceHealth(workspacePath: string, profile?: "fast" | "full") {
		return this.daemonOperations.getWorkspaceHealth(workspacePath, profile);
	}

	// Workspace onboarding operations
	fingerprintWorkspace(workspacePath: string) {
		return this.daemonOperations.fingerprintWorkspace(workspacePath);
	}

	hydrateWorkspace(workspacePath: string, profile: "virgin" | "new" | "cold" | "warm" | "hot") {
		return this.daemonOperations.hydrateWorkspace(workspacePath, profile);
	}

	analyzeWorkspace(workspacePath: string) {
		return this.daemonOperations.analyzeWorkspace(workspacePath);
	}

	getOnboardingStatus(workspacePath: string) {
		return this.daemonOperations.getOnboardingStatus(workspacePath);
	}

	resolveWorkspaceId(workspacePath: string, fallbackUserId?: string, autoPersist?: boolean) {
		return this.daemonOperations.resolveWorkspaceId(workspacePath, fallbackUserId, autoPersist);
	}

	initializeWorkspaceDirectory(workspacePath: string) {
		return this.daemonOperations.initializeWorkspaceDirectory(workspacePath);
	}

	// =========================================================================
	// LIFECYCLE
	// =========================================================================

	async initialize(): Promise<void> {
		await this.connect();

		vscode.workspace.onDidChangeWorkspaceFolders(async (event) => {
			await Promise.all(event.removed.map((folder) => this.unsubscribeFromFileWatching(folder.uri.fsPath)));
			await Promise.all(event.added.map((folder) => this.subscribeToFileWatching(folder.uri.fsPath)));
		});

		const folders = vscode.workspace.workspaceFolders || [];
		await Promise.all(folders.map((folder) => this.subscribeToFileWatching(folder.uri.fsPath)));
	}

	dispose(): void {
		this.disconnect();
		this.connectionManager.dispose();
		this.healthMonitor.dispose();
		this.daemonEvents.dispose();
		this._onConnectionChanged.dispose();
		this._onStateChange.dispose();
	}
}

// =============================================================================
// WORKSPACE-KEYED REGISTRY
// =============================================================================

const bridgeRegistry = new Map<string, DaemonBridge>();

export function getDaemonBridge(workspaceId: string): DaemonBridge {
	logger.debug("[DaemonBridge] getDaemonBridge called", { workspaceId });
	let bridge = bridgeRegistry.get(workspaceId);
	if (!bridge) {
		bridge = new DaemonBridge();
		bridgeRegistry.set(workspaceId, bridge);
		logger.debug("DaemonBridge created for workspace", {
			workspaceId,
			clientId: bridge.clientId,
			registrySize: bridgeRegistry.size,
		});
	} else {
		logger.debug("DaemonBridge reused from registry", {
			workspaceId,
			clientId: bridge.clientId,
			registrySize: bridgeRegistry.size,
		});
	}
	return bridge;
}

export function disposeDaemonBridge(workspaceId: string): void {
	const bridge = bridgeRegistry.get(workspaceId);
	if (bridge) {
		bridge.dispose();
		bridgeRegistry.delete(workspaceId);
		logger.debug("DaemonBridge disposed for workspace", { workspaceId });
	}
}

export function disposeAllDaemonBridges(): void {
	for (const [workspaceId, bridge] of bridgeRegistry.entries()) {
		bridge.dispose();
		logger.debug("DaemonBridge disposed (shutdown)", { workspaceId });
	}
	bridgeRegistry.clear();
}

export function getActiveWorkspaces(): string[] {
	return Array.from(bridgeRegistry.keys());
}

export function getCurrentWorkspaceId(): string | null {
	const activeEditor = vscode.window.activeTextEditor;
	if (activeEditor) {
		const workspaceFolder = vscode.workspace.getWorkspaceFolder(activeEditor.document.uri);
		if (workspaceFolder) {
			return workspaceFolder.uri.fsPath;
		}
	}

	const folders = vscode.workspace.workspaceFolders;
	if (folders && folders.length > 0) {
		return folders[0].uri.fsPath;
	}

	return null;
}
