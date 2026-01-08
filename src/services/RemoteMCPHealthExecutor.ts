/**
 * RemoteMCPHealthExecutor - Health check executor for RemoteMCPClient
 *
 * Implements HealthCheckExecutor interface to perform actual health checks
 * against the remote MCP server:
 * - Shallow: HTTP GET /health endpoint
 * - Deep: Execute snap({m:"x"}) tool call
 *
 * @module services/RemoteMCPHealthExecutor
 */

import { logger } from "../utils/logger";
import type { DeepCheckResult, HealthCheckExecutor, ShallowCheckResult } from "./MCPHealthGuardian";
import type { RemoteMCPClient } from "./RemoteMCPClient";

// Timeout for health checks
const SHALLOW_CHECK_TIMEOUT = 2000; // 2s per spec
const DEEP_CHECK_TIMEOUT = 5000; // 5s per spec

/**
 * Health check executor using RemoteMCPClient
 */
export class RemoteMCPHealthExecutor implements HealthCheckExecutor {
	constructor(
		private readonly client: RemoteMCPClient,
		private readonly serverUrl: string,
	) {}

	/**
	 * Execute shallow health check (HTTP GET /health)
	 */
	async executeShallowCheck(): Promise<ShallowCheckResult> {
		const start = Date.now();

		try {
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), SHALLOW_CHECK_TIMEOUT);

			const response = await fetch(`${this.serverUrl}/health`, {
				method: "GET",
				signal: controller.signal,
				headers: {
					Accept: "application/json",
				},
			});

			clearTimeout(timeoutId);

			const latencyMs = Date.now() - start;

			if (!response.ok) {
				return {
					healthy: false,
					latencyMs,
					error: `HTTP ${response.status}: ${response.statusText}`,
				};
			}

			const data = (await response.json()) as { status?: string; version?: string };

			return {
				healthy: data.status === "ok" || data.status === "healthy",
				latencyMs,
				serverVersion: data.version,
			};
		} catch (error) {
			const latencyMs = Date.now() - start;

			if (error instanceof Error && error.name === "AbortError") {
				return {
					healthy: false,
					latencyMs,
					error: `Health check timeout after ${SHALLOW_CHECK_TIMEOUT}ms`,
				};
			}

			logger.debug("Shallow health check failed", { error });

			return {
				healthy: false,
				latencyMs,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	/**
	 * Execute deep health check (MCP tool call)
	 */
	async executeDeepCheck(): Promise<DeepCheckResult> {
		const start = Date.now();

		try {
			// Check if client is ready first
			if (!this.client.isServerReady()) {
				return {
					healthy: false,
					latencyMs: Date.now() - start,
					toolExecutionSuccess: false,
					error: "MCP client not ready",
				};
			}

			// Execute a lightweight tool call to verify full pipeline
			const result = await Promise.race([
				this.client.sendRequest("tools/call", {
					name: "snap",
					arguments: { m: "x" }, // Context mode - lightweight status check
				}),
				new Promise((_, reject) =>
					setTimeout(() => reject(new Error("Deep check timeout")), DEEP_CHECK_TIMEOUT),
				),
			]);

			const latencyMs = Date.now() - start;

			// Check if result indicates success
			const isSuccess = result !== null && result !== undefined;

			return {
				healthy: isSuccess,
				latencyMs,
				toolExecutionSuccess: isSuccess,
			};
		} catch (error) {
			const latencyMs = Date.now() - start;

			logger.debug("Deep health check failed", { error });

			return {
				healthy: false,
				latencyMs,
				toolExecutionSuccess: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}
}

/**
 * Create a health executor for a RemoteMCPClient
 */
export function createHealthExecutor(client: RemoteMCPClient, serverUrl: string): HealthCheckExecutor {
	return new RemoteMCPHealthExecutor(client, serverUrl);
}
