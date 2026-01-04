/**
 * MCP Telemetry - Lightweight telemetry for MCP operations
 *
 * Tracks MCP connection lifecycle, circuit breaker events, and performance metrics.
 * Uses the TelemetryProxy for event emission with deduplication and offline support.
 *
 * Events tracked:
 * - mcp.connection.state_changed: Connection state transitions
 * - mcp.connection.retry: Retry attempts
 * - mcp.connection.version_mismatch: Version compatibility warnings
 * - mcp.bridge.circuit_changed: Circuit breaker state changes
 * - mcp.bridge.push: Push success/failure metrics
 *
 * @module services/MCPTelemetry
 */

import type * as vscode from "vscode";
import { logger } from "../utils/logger";
import { TelemetryProxy } from "./telemetry-proxy";

/**
 * MCP connection state for telemetry
 */
type MCPConnectionState = "connected" | "disconnected" | "reconnecting" | "disabled";

/**
 * Circuit breaker state for telemetry
 */
type CircuitState = "closed" | "open" | "half-open";

/**
 * Singleton MCP telemetry instance
 */
let mcpTelemetry: MCPTelemetry | null = null;

/**
 * MCP Telemetry class
 *
 * Provides methods for tracking MCP-related events with deduplication
 * to prevent event spam during rapid state changes.
 */
export class MCPTelemetry {
	private telemetryProxy: TelemetryProxy | null = null;
	private lastConnectionState: MCPConnectionState | null = null;
	private lastCircuitState: CircuitState | null = null;
	private lastEventTime: Map<string, number> = new Map();
	private readonly dedupeWindowMs = 5000; // 5 second dedup window

	constructor(context?: vscode.ExtensionContext) {
		if (context) {
			this.telemetryProxy = new TelemetryProxy(context);
		}
	}

	/**
	 * Set the telemetry proxy (for lazy initialization)
	 */
	setProxy(proxy: TelemetryProxy): void {
		this.telemetryProxy = proxy;
	}

	/**
	 * Check if event should be deduplicated
	 */
	private shouldDedupe(eventKey: string): boolean {
		const lastTime = this.lastEventTime.get(eventKey);
		if (!lastTime) {
			return false;
		}
		return Date.now() - lastTime < this.dedupeWindowMs;
	}

	/**
	 * Record event time for deduplication
	 */
	private recordEvent(eventKey: string): void {
		this.lastEventTime.set(eventKey, Date.now());
	}

	/**
	 * Track MCP connection state change
	 */
	trackConnectionStateChange(
		newState: MCPConnectionState,
		options?: {
			previousState?: MCPConnectionState;
			reason?: string;
			serverVersion?: string;
			attempt?: number;
			maxAttempts?: number;
		},
	): void {
		// Skip if same state (dedup)
		if (newState === this.lastConnectionState) {
			return;
		}

		const eventKey = `connection.${newState}`;
		if (this.shouldDedupe(eventKey)) {
			return;
		}

		this.lastConnectionState = newState;
		this.recordEvent(eventKey);

		const properties = {
			state: newState,
			previousState: options?.previousState || "unknown",
			reason: options?.reason,
			serverVersion: options?.serverVersion,
			attempt: options?.attempt,
			maxAttempts: options?.maxAttempts,
		};

		logger.info("MCP connection state changed", properties);

		if (this.telemetryProxy) {
			this.telemetryProxy.trackEvent("mcp.connection.state_changed", properties);
		}
	}

	/**
	 * Track MCP connection retry attempt
	 */
	trackConnectionRetry(attempt: number, maxAttempts: number, delayMs: number): void {
		const properties = {
			attempt,
			maxAttempts,
			delayMs,
		};

		logger.debug("MCP connection retry", properties);

		if (this.telemetryProxy) {
			this.telemetryProxy.trackEvent("mcp.connection.retry", properties);
		}
	}

	/**
	 * Track MCP version mismatch warning
	 */
	trackVersionMismatch(serverVersion: string, minRequired: string): void {
		const eventKey = `version.${serverVersion}`;
		if (this.shouldDedupe(eventKey)) {
			return;
		}
		this.recordEvent(eventKey);

		const properties = {
			serverVersion,
			minRequired,
		};

		logger.warn("MCP version mismatch detected", properties);

		if (this.telemetryProxy) {
			this.telemetryProxy.trackEvent("mcp.connection.version_mismatch", properties);
		}
	}

	/**
	 * Track circuit breaker state change
	 */
	trackCircuitBreakerChange(
		newState: CircuitState,
		options?: {
			previousState?: CircuitState;
			consecutiveFailures?: number;
			threshold?: number;
		},
	): void {
		// Skip if same state
		if (newState === this.lastCircuitState) {
			return;
		}

		const eventKey = `circuit.${newState}`;
		if (this.shouldDedupe(eventKey)) {
			return;
		}

		this.lastCircuitState = newState;
		this.recordEvent(eventKey);

		const properties = {
			state: newState,
			previousState: options?.previousState || "unknown",
			consecutiveFailures: options?.consecutiveFailures,
			threshold: options?.threshold,
		};

		logger.info("MCP bridge circuit breaker state changed", properties);

		if (this.telemetryProxy) {
			this.telemetryProxy.trackEvent("mcp.bridge.circuit_changed", properties);
		}
	}

	/**
	 * Track bridge push metrics (batched, not every push)
	 */
	trackBridgePushMetrics(metrics: {
		pushCount: number;
		failureCount: number;
		queueDepth: number;
		circuitState: CircuitState;
	}): void {
		// Only track every 10th push or on failure
		if (metrics.pushCount % 10 !== 0 && metrics.failureCount === 0) {
			return;
		}

		const properties = {
			pushCount: metrics.pushCount,
			failureCount: metrics.failureCount,
			queueDepth: metrics.queueDepth,
			circuitState: metrics.circuitState,
		};

		if (this.telemetryProxy) {
			this.telemetryProxy.trackEvent("mcp.bridge.metrics", properties);
		}
	}

	/**
	 * Track diagnose command execution
	 */
	trackDiagnoseExecuted(results: {
		mcpEnabled: boolean;
		serverReady: boolean;
		circuitState: CircuitState;
		queueDepth: number;
	}): void {
		const properties = {
			mcpEnabled: results.mcpEnabled,
			serverReady: results.serverReady,
			circuitState: results.circuitState,
			queueDepth: results.queueDepth,
		};

		if (this.telemetryProxy) {
			this.telemetryProxy.trackEvent("mcp.diagnose.executed", properties);
		}
	}
}

/**
 * Get or create the singleton MCPTelemetry instance
 */
export function getMCPTelemetry(context?: vscode.ExtensionContext): MCPTelemetry {
	if (!mcpTelemetry) {
		mcpTelemetry = new MCPTelemetry(context);
	}
	return mcpTelemetry;
}

/**
 * Dispose the MCPTelemetry singleton
 */
export function disposeMCPTelemetry(): void {
	mcpTelemetry = null;
}
