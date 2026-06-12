/**
 * MCPController - Unified MCP lifecycle, mode, and health management
 *
 * Consolidates:
 * - MCPLifecycleManager: Connection state machine
 * - MCPModeManager: Mode detection (LOCAL_CLI, REMOTE_API, UNCONFIGURED)
 * - DaemonHealthConsumer: Push-based health monitoring from daemon
 *
 * This is the single entry point for all MCP connection management.
 *
 * @module mcp/MCPController
 */

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { getDefaultSocketPath } from "@vreko/local-service-client";
// Import shared types from MCP Client SDK (HealthMonitor class removed per HYGNE-03)
import {
	type HealthChangeEvent,
	type HealthState,
	type LatencyMetrics,
	type MCPConnectionState,
	type MCPControllerStatus,
	MCPMode,
	type MCPModeChangeEvent,
	type MCPStateChangeEvent,
} from "@vreko/mcp-client";
import * as vscode from "vscode";
import { type DaemonBridge, getCurrentWorkspaceId, getDaemonBridge } from "../services/DaemonBridge";
import type { RemoteMCPClient } from "../services/RemoteMCPClient";
import { detectAIClients, detectWorkspaceConfig } from "../types/mcp-config";
import { logger } from "../utils/logger";

// Re-export for backward compatibility
export { MCPMode };
export type {
	HealthChangeEvent,
	HealthState,
	LatencyMetrics,
	MCPConnectionState,
	MCPControllerStatus,
	MCPModeChangeEvent,
	MCPStateChangeEvent,
};

/**
 * Alias for backward compatibility with DaemonHealthConsumer
 */
export type ConnectionStateChange = MCPStateChangeEvent;

// =============================================================================
// LOCAL TYPES (VS Code-specific)
// =============================================================================

/**
 * Configuration for MCPController (VS Code-specific)
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

	// Health monitoring (inline  -  mcp-client HealthMonitor deleted per HYGNE-03)
	private _healthState: HealthState = "unknown";
	private _latencyHistory: number[] = [];
	private _healthChangeCallbacks: Array<(event: HealthChangeEvent) => void> = [];

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

		// Set up health change forwarding to VS Code event emitter
		this.setupHealthChangeForwarding();
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
		const vsConfig = vscode.workspace.getConfiguration("vreko");
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
		const healthState = this.getHealthState();
		return healthState === "healthy" || healthState === "degraded";
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
		return this._healthState;
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
			healthState: this.getHealthState(),
			isReady: this.isReady(),
			serverVersion: this.serverVersion,
			latency: this.getLatencyMetrics(),
			daemonConnected: this.daemonBridge?.isConnected() ?? false,
			configured: configStatus.configured,
			configuredClients: configStatus.configuredClients,
		};
	}

	/**
	 * Get latency metrics (inline implementation  -  mcp-client HealthMonitor deleted per HYGNE-03)
	 */
	getLatencyMetrics(): LatencyMetrics {
		const history = this._latencyHistory;
		if (history.length === 0) {
			return { current: 0, p50: 0, p95: 0, p99: 0, jitter: 0, trend: "stable" };
		}
		const sorted = [...history].sort((a, b) => a - b);
		const len = sorted.length;
		const p50 = sorted[Math.floor(len * 0.5)] ?? 0;
		const p95 = sorted[Math.floor(len * 0.95)] ?? 0;
		const p99 = sorted[Math.floor(len * 0.99)] ?? 0;
		const current = history[history.length - 1] ?? 0;
		const mean = history.reduce((s, v) => s + v, 0) / len;
		const jitter = Math.sqrt(history.map((v) => (v - mean) ** 2).reduce((a, b) => a + b, 0) / len);
		return { current, p50, p95, p99, jitter, trend: "stable" };
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
		workspaceConfig: { path?: string; type?: string; hasConfig: boolean } | null;
	} {
		const daemonRunning = this.isCLIDaemonAvailable();
		const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
		const workspaceConfig = workspaceRoot ? detectWorkspaceConfig(workspaceRoot) : null;
		const detection = detectAIClients({ cwd: workspaceRoot });
		const configuredClients = detection.detected.filter((c) => c.hasVreko).map((c) => c.displayName);
		const configured = configuredClients.length > 0 || (workspaceConfig?.hasConfig ?? false);

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

				if (connected) {
					this.recordHealthSuccess(latencyMs);
				} else {
					this.recordHealthFailure("Daemon not connected");
				}
			}
			// For REMOTE_API mode, check remote endpoint
			else if (this.currentMode === MCPMode.REMOTE_API && this.config.remoteServerUrl) {
				const response = await fetch(`${this.config.remoteServerUrl}/health`, {
					method: "GET",
					signal: AbortSignal.timeout(5000),
				});
				const latencyMs = Date.now() - start;

				if (response.ok) {
					this.recordHealthSuccess(latencyMs);
				} else {
					this.recordHealthFailure(`HTTP ${response.status}`);
				}
			}
			// No health check target available  -  reset inline state to unknown
			else {
				this._healthState = "unknown";
				this._latencyHistory = [];
			}
		} catch (error) {
			const _latencyMs = Date.now() - start;
			this.recordHealthFailure(error instanceof Error ? error.message : String(error));
		}

		return this.getHealthState();
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
		const config = vscode.workspace.getConfiguration("vreko");
		const apiKey = config.get<string>("apiKey", "") || process.env.VREKO_API_KEY;

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
		// Check both the new location and legacy location (daemon/daemon.sock)
		const serviceSocketPath = getDefaultSocketPath();
		const legacySocketPath = join(homedir(), ".vreko", "daemon", "daemon.sock");
		return existsSync(serviceSocketPath) || existsSync(legacySocketPath);
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
		if (detection.detected.some((c) => c.hasVreko)) {
			return true;
		}

		// Check VS Code configuration
		const config = vscode.workspace.getConfiguration("vreko");
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
				this.recordHealthSuccess(0);
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

		// FIX: Check if already connected (from phase 2 initialization)
		// This prevents redundant connect() calls that race with RecoveryService
		if (this.daemonBridge.isConnected()) {
			this.emitStateChange("connected", { reason: "Local CLI mode active (already connected)" });
			logger.info("LOCAL_CLI mode: DaemonBridge already connected from phase 2");
			return;
		}

		// Initial connection attempt (only if not already connected)
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
		const config = vscode.workspace.getConfiguration("vreko");
		const apiKey = config.get<string>("apiKey", "") || process.env.VREKO_API_KEY;

		if (!apiKey) {
			this.emitStateChange("disconnected", { reason: "No API key for remote API" });
			return;
		}

		logger.info("Remote API mode: API key present, auth features available");
		this.emitStateChange("connected", { reason: "Remote API mode (auth only)" });

		// Show notification prompting CLI installation
		vscode.window
			.showInformationMessage(
				"Vreko running in limited mode. Install CLI for full MCP features.",
				"Install CLI",
				"Configure MCP",
			)
			.then((choice) => {
				if (choice === "Install CLI") {
					vscode.env.openExternal(vscode.Uri.parse("https://docs.vreko.dev/cli/install"));
				} else if (choice === "Configure MCP") {
					vscode.commands.executeCommand("vreko.mcp.configure");
				}
			});
	}

	// =========================================================================
	// PRIVATE - Health Event Forwarding
	// =========================================================================

	/**
	 * Set up forwarding of health state changes to VS Code event emitter
	 * (inline  -  mcp-client HealthMonitor deleted per HYGNE-03)
	 */
	private setupHealthChangeForwarding(): void {
		this._healthChangeCallbacks.push((event: HealthChangeEvent) => {
			logger.info("Health state changed", { from: event.from, to: event.to, reason: event.reason });
			this._onHealthChange.fire(event);
		});
	}

	private recordHealthSuccess(latencyMs: number): void {
		this._latencyHistory.push(latencyMs);
		if (this._latencyHistory.length > 100) this._latencyHistory.shift();
		const prev = this._healthState;
		const degradedThreshold = this.config.degradedLatencyThreshold ?? 500;
		const unhealthyThreshold = this.config.unhealthyLatencyThreshold ?? 2000;
		const next: HealthState =
			latencyMs > unhealthyThreshold ? "unhealthy" : latencyMs > degradedThreshold ? "degraded" : "healthy";
		this._healthState = next;
		if (prev !== next) {
			this.emitHealthChange(prev, next, `latency ${latencyMs}ms`);
		}
	}

	private recordHealthFailure(reason: string): void {
		const prev = this._healthState;
		this._healthState = "unhealthy";
		if (prev !== this._healthState) {
			this.emitHealthChange(prev, "unhealthy", reason);
		}
	}

	private emitHealthChange(from: HealthState, to: HealthState, reason: string): void {
		const event: HealthChangeEvent = { from, to, reason, timestamp: Date.now() };
		for (const cb of this._healthChangeCallbacks) {
			cb(event);
		}
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

		// Clear inline health change callbacks
		this._healthChangeCallbacks = [];

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
