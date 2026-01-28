/**
 * MCPController - Unified MCP lifecycle, mode, and health management
 *
 * Consolidates:
 * - MCPLifecycleManager: Connection state machine
 * - MCPModeManager: Mode detection (LOCAL_CLI, REMOTE_API, UNCONFIGURED)
 * - MCPHealthGuardian: Proactive health monitoring
 * - HealthStateManager: Health state transitions
 *
 * This is the single entry point for all MCP connection management.
 *
 * @module mcp/MCPController
 */

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { detectAIClients, detectWorkspaceConfig } from "@snapback/mcp-config";
import * as vscode from "vscode";
import { type DaemonBridge, getCurrentWorkspaceId, getDaemonBridge } from "../services/DaemonBridge";
import type { RemoteMCPClient } from "../services/RemoteMCPClient";
import { logger } from "../utils/logger";

// =============================================================================
// TYPES
// =============================================================================

/**
 * MCP operation modes - mutually exclusive
 */
export enum MCPMode {
	/** CLI installed & configured - full functionality via local daemon */
	LOCAL_CLI = "local_cli",
	/** No CLI, use API only for auth/licensing (degraded experience) */
	REMOTE_API = "remote_api",
	/** First run, needs setup */
	UNCONFIGURED = "unconfigured",
}

/**
 * MCP connection state
 */
export type MCPConnectionState = "connected" | "disconnected" | "reconnecting" | "disabled";

/**
 * Health state of the MCP server
 */
export type HealthState = "healthy" | "degraded" | "unhealthy" | "unknown";

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
 * Mode change event
 */
export interface MCPModeChangeEvent {
	previousMode: MCPMode;
	newMode: MCPMode;
	reason: string;
}

/**
 * Health change event
 */
export interface HealthChangeEvent {
	from: HealthState;
	to: HealthState;
	timestamp: number;
	latencyMs?: number;
	reason?: string;
}

/**
 * Latency metrics for trending
 */
export interface LatencyMetrics {
	current: number;
	p50: number;
	p95: number;
	p99: number;
	jitter: number;
	trend: "improving" | "stable" | "degrading";
}

/**
 * Controller status for diagnostics
 */
export interface MCPControllerStatus {
	mode: MCPMode;
	connectionState: MCPConnectionState;
	healthState: HealthState;
	isReady: boolean;
	serverVersion?: string;
	latency: LatencyMetrics;
	daemonConnected: boolean;
	configured: boolean;
	configuredClients: string[];
}

/**
 * Configuration for MCPController
 */
export interface MCPControllerConfig {
	extensionPath?: string;
	dbPath?: string;
	remoteServerUrl?: string;
	remoteAuthToken?: string;
	remoteAuthType?: "bearer" | "apikey";
	remoteApiKey?: string;
	/** Latency threshold for degraded state (ms) */
	degradedLatencyThreshold?: number;
	/** Latency threshold for unhealthy state (ms) */
	unhealthyLatencyThreshold?: number;
	/** Number of consecutive healthy checks needed to recover */
	recoveryThreshold?: number;
}

// =============================================================================
// DEFAULT CONFIGURATION
// =============================================================================

const DEFAULT_CONFIG: Required<
	Omit<
		MCPControllerConfig,
		"extensionPath" | "dbPath" | "remoteServerUrl" | "remoteAuthToken" | "remoteAuthType" | "remoteApiKey"
	>
> = {
	degradedLatencyThreshold: 500,
	unhealthyLatencyThreshold: 2000,
	recoveryThreshold: 3,
};

// =============================================================================
// MCP CONTROLLER
// =============================================================================

/**
 * Singleton instance
 */
let controllerInstance: MCPController | null = null;

/**
 * MCPController - Unified MCP management
 *
 * Single class that handles:
 * - Mode detection (LOCAL_CLI vs REMOTE_API vs UNCONFIGURED)
 * - Connection lifecycle (start, stop, reconnect)
 * - Health monitoring (shallow/deep checks, state machine)
 * - Event broadcasting
 */
export class MCPController implements vscode.Disposable {
	private readonly config: MCPControllerConfig;

	// Mode state
	private currentMode: MCPMode = MCPMode.UNCONFIGURED;

	// Connection state
	private connectionState: MCPConnectionState = "disconnected";
	private serverVersion?: string;
	private daemonBridge: DaemonBridge | null = null;
	private remoteClient: RemoteMCPClient | null = null;
	private daemonConnectionSubscription: vscode.Disposable | null = null;

	// Health state
	private healthState: HealthState = "unknown";
	private consecutiveSuccesses = 0;
	// biome-ignore lint/correctness/noUnusedPrivateClassMembers: Used in processHealthFailure
	private consecutiveFailures = 0;
	// biome-ignore lint/correctness/noUnusedPrivateClassMembers: Tracks health degradation start time
	private unhealthySince: number | null = null;
	private latencyHistory: number[] = [];
	private readonly maxHistorySize = 100;

	// Event emitters
	private readonly _onStateChange = new vscode.EventEmitter<MCPStateChangeEvent>();
	readonly onStateChange = this._onStateChange.event;

	private readonly _onModeChange = new vscode.EventEmitter<MCPModeChangeEvent>();
	readonly onModeChange = this._onModeChange.event;

	private readonly _onHealthChange = new vscode.EventEmitter<HealthChangeEvent>();
	readonly onHealthChange = this._onHealthChange.event;

	// Subscriptions
	private readonly disposables: vscode.Disposable[] = [];

	constructor(config: MCPControllerConfig = {}) {
		this.config = { ...DEFAULT_CONFIG, ...config };
	}

	// =========================================================================
	// PUBLIC API - Lifecycle
	// =========================================================================

	/**
	 * Start the MCP controller
	 * Detects mode and establishes appropriate connection
	 */
	async start(): Promise<void> {
		// Check if MCP is enabled in configuration
		const vsConfig = vscode.workspace.getConfiguration("snapback");
		const mcpEnabled = vsConfig.get<boolean>("mcp.enabled", true);

		if (!mcpEnabled) {
			logger.info("MCP integration is disabled in configuration");
			this.emitStateChange("disabled", { reason: "Disabled in settings" });
			return;
		}

		// Detect mode
		const mode = await this.detectMode();
		logger.info(`MCP mode detected: ${mode}`);

		switch (mode) {
			case MCPMode.LOCAL_CLI:
				return this.startLocalCLIMode();
			case MCPMode.REMOTE_API:
				return this.startRemoteAPIMode();
			default:
				this.emitStateChange("disconnected", { reason: "MCP not configured" });
				return;
		}
	}

	/**
	 * Stop the MCP controller
	 */
	async stop(): Promise<void> {
		if (this.remoteClient) {
			this.remoteClient.dispose();
			this.remoteClient = null;
		}

		if (this.daemonConnectionSubscription) {
			this.daemonConnectionSubscription.dispose();
			this.daemonConnectionSubscription = null;
		}

		this.emitStateChange("disconnected", { reason: "Controller stopped" });
	}

	/**
	 * Check if MCP is ready for use (instant check for LLM pre-flight)
	 */
	isReady(): boolean {
		if (this.connectionState !== "connected") {
			return false;
		}
		return this.healthState === "healthy" || this.healthState === "degraded";
	}

	/**
	 * Check if server is connected
	 */
	isConnected(): boolean {
		if (this.currentMode === MCPMode.LOCAL_CLI) {
			return this.daemonBridge?.isConnected() ?? false;
		}
		return this.remoteClient?.isServerReady() ?? false;
	}

	// =========================================================================
	// PUBLIC API - State Getters
	// =========================================================================

	getMode(): MCPMode {
		return this.currentMode;
	}

	getConnectionState(): MCPConnectionState {
		return this.connectionState;
	}

	getHealthState(): HealthState {
		return this.healthState;
	}

	getServerVersion(): string | undefined {
		return this.serverVersion;
	}

	/**
	 * Get comprehensive status for diagnostics
	 */
	getStatus(): MCPControllerStatus {
		const configStatus = this.checkConfigurationStatus();

		return {
			mode: this.currentMode,
			connectionState: this.connectionState,
			healthState: this.healthState,
			isReady: this.isReady(),
			serverVersion: this.serverVersion,
			latency: this.getLatencyMetrics(),
			daemonConnected: this.daemonBridge?.isConnected() ?? false,
			configured: configStatus.configured,
			configuredClients: configStatus.configuredClients,
		};
	}

	/**
	 * Get latency metrics
	 */
	getLatencyMetrics(): LatencyMetrics {
		if (this.latencyHistory.length === 0) {
			return { current: 0, p50: 0, p95: 0, p99: 0, jitter: 0, trend: "stable" };
		}

		const sorted = [...this.latencyHistory].sort((a, b) => a - b);
		const len = sorted.length;

		const p50 = sorted[Math.floor(len * 0.5)] || 0;
		const p95 = sorted[Math.floor(len * 0.95)] || 0;
		const p99 = sorted[Math.floor(len * 0.99)] || 0;
		const current = this.latencyHistory[len - 1] || 0;

		// Calculate jitter (standard deviation)
		const mean = this.latencyHistory.reduce((a, b) => a + b, 0) / len;
		const squaredDiffs = this.latencyHistory.map((v) => (v - mean) ** 2);
		const jitter = Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / len);

		// Determine trend
		const trend = this.calculateTrend();

		return { current, p50, p95, p99, jitter, trend };
	}

	// =========================================================================
	// PUBLIC API - Mode Helpers
	// =========================================================================

	isLocalCLIMode(): boolean {
		return this.currentMode === MCPMode.LOCAL_CLI;
	}

	isRemoteAPIMode(): boolean {
		return this.currentMode === MCPMode.REMOTE_API;
	}

	/**
	 * Check configuration status
	 */
	checkConfigurationStatus(): {
		daemonRunning: boolean;
		configured: boolean;
		configuredClients: string[];
		workspaceConfig: { path: string; type: string } | null;
	} {
		const daemonRunning = this.isCLIDaemonAvailable();
		const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
		const workspaceConfig = workspaceRoot ? detectWorkspaceConfig(workspaceRoot) : null;
		const detection = detectAIClients({ cwd: workspaceRoot });
		const configuredClients = detection.detected.filter((c) => c.hasSnapback).map((c) => c.displayName);
		const configured = configuredClients.length > 0 || workspaceConfig !== null;

		return { daemonRunning, configured, configuredClients, workspaceConfig };
	}

	// =========================================================================
	// PUBLIC API - Health Check
	// =========================================================================

	/**
	 * Force an immediate health check
	 */
	async forceHealthCheck(): Promise<HealthState> {
		const start = Date.now();

		try {
			// For LOCAL_CLI mode, check daemon connection
			if (this.currentMode === MCPMode.LOCAL_CLI && this.daemonBridge) {
				const connected = this.daemonBridge.isConnected();
				const latencyMs = Date.now() - start;
				this.recordLatency(latencyMs);

				if (connected) {
					this.processHealthSuccess(latencyMs);
				} else {
					this.processHealthFailure("Daemon not connected");
				}
			}
			// For REMOTE_API mode, check remote endpoint
			else if (this.currentMode === MCPMode.REMOTE_API && this.config.remoteServerUrl) {
				const response = await fetch(`${this.config.remoteServerUrl}/health`, {
					method: "GET",
					signal: AbortSignal.timeout(5000),
				});
				const latencyMs = Date.now() - start;
				this.recordLatency(latencyMs);

				if (response.ok) {
					this.processHealthSuccess(latencyMs);
				} else {
					this.processHealthFailure(`HTTP ${response.status}`);
				}
			} else {
				this.updateHealthState("unknown", "No health check target");
			}
		} catch (error) {
			const latencyMs = Date.now() - start;
			this.processHealthFailure(error instanceof Error ? error.message : String(error));
			this.recordLatency(latencyMs);
		}

		return this.healthState;
	}

	// =========================================================================
	// PRIVATE - Mode Detection
	// =========================================================================

	/**
	 * Detect and set the appropriate mode
	 */
	private async detectMode(): Promise<MCPMode> {
		// Check 1: Is CLI daemon running or configured?
		if (this.isCLIDaemonAvailable() || this.isCLIConfigured()) {
			this.setMode(MCPMode.LOCAL_CLI, "CLI daemon detected or configured");
			return this.currentMode;
		}

		// Check 2: Is there an API key?
		const config = vscode.workspace.getConfiguration("snapback");
		const apiKey = config.get<string>("apiKey", "") || process.env.SNAPBACK_API_KEY;

		if (apiKey?.trim()) {
			this.setMode(MCPMode.REMOTE_API, "API key configured, CLI not available");
			return this.currentMode;
		}

		// Check 3: Nothing configured
		this.setMode(MCPMode.UNCONFIGURED, "No CLI or API key configured");
		return this.currentMode;
	}

	private isCLIDaemonAvailable(): boolean {
		if (process.platform === "win32") {
			return false; // Windows named pipe harder to check
		}
		const socketPath = join(homedir(), ".snapback", "daemon", "daemon.sock");
		return existsSync(socketPath);
	}

	private isCLIConfigured(): boolean {
		const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

		// Check workspace-level configs
		if (workspaceRoot) {
			const workspaceConfig = detectWorkspaceConfig(workspaceRoot);
			if (workspaceConfig) {
				return true;
			}
		}

		// Check global configs
		const detection = detectAIClients({ cwd: workspaceRoot });
		if (detection.detected.some((c) => c.hasSnapback)) {
			return true;
		}

		// Check VS Code configuration
		const config = vscode.workspace.getConfiguration("snapback");
		const cliPath = config.get<string>("cliPath", "");
		return !!cliPath?.trim();
	}

	private setMode(newMode: MCPMode, reason: string): void {
		if (this.currentMode === newMode) {
			return;
		}

		const previousMode = this.currentMode;
		this.currentMode = newMode;

		logger.info(`MCP mode changed: ${previousMode} → ${newMode} (${reason})`);

		this._onModeChange.fire({ previousMode, newMode, reason });
	}

	// =========================================================================
	// PRIVATE - Connection Management
	// =========================================================================

	private async startLocalCLIMode(): Promise<void> {
		const workspaceId = getCurrentWorkspaceId();
		if (!workspaceId) {
			logger.warn("No workspace available for local CLI mode");
			this.emitStateChange("disconnected", { reason: "No workspace folder" });
			return;
		}
		this.daemonBridge = getDaemonBridge(workspaceId);

		// Subscribe to daemon connection changes
		this.daemonConnectionSubscription = this.daemonBridge.onStateChange((event) => {
			const connected = event.state === "connected";
			if (connected) {
				this.emitStateChange("connected", { reason: "Daemon connected" });
				this.processHealthSuccess(0);
			} else {
				const attempt = this.daemonBridge?.getReconnectAttempt() ?? 0;
				const maxAttempts = this.daemonBridge?.getMaxReconnectAttempts() ?? 5;

				if (attempt > 0) {
					this.emitStateChange("reconnecting", { reason: "Daemon reconnecting", attempt, maxAttempts });
				} else {
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
				this.emitStateChange("reconnecting", { reason: "Daemon connecting", attempt: 1, maxAttempts: 5 });
			}
		} catch (error) {
			logger.warn("LOCAL_CLI mode: Initial daemon connection failed", {
				error: error instanceof Error ? error.message : String(error),
			});
			this.emitStateChange("reconnecting", { reason: "Daemon connecting", attempt: 1, maxAttempts: 5 });
		}
	}

	private async startRemoteAPIMode(): Promise<void> {
		const config = vscode.workspace.getConfiguration("snapback");
		const apiKey = config.get<string>("apiKey", "") || process.env.SNAPBACK_API_KEY;

		if (!apiKey) {
			this.emitStateChange("disconnected", { reason: "No API key for remote API" });
			return;
		}

		logger.info("Remote API mode: API key present, auth features available");
		this.emitStateChange("connected", { reason: "Remote API mode (auth only)" });

		// Show notification prompting CLI installation
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

	// =========================================================================
	// PRIVATE - Health State Machine
	// =========================================================================

	private processHealthSuccess(latencyMs: number): void {
		this.consecutiveFailures = 0;
		this.consecutiveSuccesses++;

		const threshold = this.config.degradedLatencyThreshold ?? DEFAULT_CONFIG.degradedLatencyThreshold;
		const unhealthyThreshold = this.config.unhealthyLatencyThreshold ?? DEFAULT_CONFIG.unhealthyLatencyThreshold;
		const recoveryThreshold = this.config.recoveryThreshold ?? DEFAULT_CONFIG.recoveryThreshold;

		// Check recovery from unhealthy
		if (this.healthState === "unhealthy") {
			if (this.consecutiveSuccesses >= recoveryThreshold) {
				this.updateHealthState("healthy", `Recovered after ${this.consecutiveSuccesses} successes`);
				this.unhealthySince = null;
			}
			return;
		}

		// Determine state based on latency
		if (latencyMs >= unhealthyThreshold) {
			this.updateHealthState("unhealthy", `Latency ${latencyMs}ms exceeds threshold`);
		} else if (latencyMs >= threshold) {
			this.updateHealthState("degraded", `Latency ${latencyMs}ms elevated`);
		} else {
			this.updateHealthState("healthy", `Latency ${latencyMs}ms normal`);
		}
	}

	private processHealthFailure(reason: string): void {
		this.consecutiveSuccesses = 0;
		this.consecutiveFailures++;

		if (this.healthState !== "unhealthy") {
			this.unhealthySince = Date.now();
		}

		this.updateHealthState("unhealthy", reason);
	}

	private updateHealthState(newState: HealthState, reason?: string): void {
		if (this.healthState === newState) {
			return;
		}

		const from = this.healthState;
		this.healthState = newState;

		logger.info("Health state changed", { from, to: newState, reason });

		this._onHealthChange.fire({
			from,
			to: newState,
			timestamp: Date.now(),
			reason,
		});
	}

	private recordLatency(latencyMs: number): void {
		this.latencyHistory.push(latencyMs);
		if (this.latencyHistory.length > this.maxHistorySize) {
			this.latencyHistory.shift();
		}
	}

	private calculateTrend(): "improving" | "stable" | "degrading" {
		if (this.latencyHistory.length < 10) {
			return "stable";
		}

		const recentCount = Math.min(10, Math.floor(this.latencyHistory.length / 2));
		const recent = this.latencyHistory.slice(-recentCount);
		const older = this.latencyHistory.slice(-recentCount * 2, -recentCount);

		const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
		const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;

		const changePercent = ((recentAvg - olderAvg) / olderAvg) * 100;

		if (changePercent > 20) {
			return "degrading";
		}
		if (changePercent < -20) {
			return "improving";
		}
		return "stable";
	}

	// =========================================================================
	// PRIVATE - Event Emission
	// =========================================================================

	private emitStateChange(
		newState: MCPConnectionState,
		options?: { reason?: string; attempt?: number; maxAttempts?: number },
	): void {
		const previousState = this.connectionState;
		this.connectionState = newState;

		const event: MCPStateChangeEvent = {
			state: newState,
			previousState,
			reason: options?.reason,
			attempt: options?.attempt,
			maxAttempts: options?.maxAttempts,
		};

		this._onStateChange.fire(event);

		logger.debug("MCP state changed", { from: previousState, to: newState });
	}

	// =========================================================================
	// DISPOSAL
	// =========================================================================

	dispose(): void {
		this.stop().catch((error) => {
			logger.error("Error stopping MCP controller", error as Error);
		});

		if (this.daemonConnectionSubscription) {
			this.daemonConnectionSubscription.dispose();
			this.daemonConnectionSubscription = null;
		}

		for (const disposable of this.disposables) {
			disposable.dispose();
		}
		this.disposables.length = 0;

		this._onStateChange.dispose();
		this._onModeChange.dispose();
		this._onHealthChange.dispose();

		controllerInstance = null;
	}
}

// =============================================================================
// SINGLETON ACCESS
// =============================================================================

/**
 * Get or create the MCPController singleton
 */
export function getMCPController(config?: MCPControllerConfig): MCPController {
	if (!controllerInstance) {
		controllerInstance = new MCPController(config);
	}
	return controllerInstance;
}

/**
 * Dispose the MCPController singleton
 */
export function disposeMCPController(): void {
	if (controllerInstance) {
		controllerInstance.dispose();
		controllerInstance = null;
	}
}
