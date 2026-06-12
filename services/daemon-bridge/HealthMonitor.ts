/**
 * Health Monitor
 *
 * Minimal connection liveness monitor for the daemon IPC socket.
 * Only answers: "is the daemon process reachable?"
 *
 * Health STATE classification is now handled by the daemon's HealthAuthority
 * and consumed by DaemonHealthConsumer. This monitor only tracks whether
 * the IPC heartbeat succeeds or fails.
 *
 * @module daemon-bridge/HealthMonitor
 */

import { logger } from "../../utils/logger";

const HEALTH_CHECK_INTERVAL_MS = 30000;
const LOG_PREFIX = "[HealthMonitor]";

export interface HealthStatus {
	healthy: boolean;
	lastCheckTime: Date | null;
	consecutiveFailures: number;
}

export interface HealthMonitorConfig {
	checkIntervalMs?: number;
}

export class HealthMonitor {
	private checkIntervalMs: number;
	private healthCheckTimer: NodeJS.Timeout | null = null;
	private lastHealthCheckTime: Date | null = null;
	private lastHealthCheckSuccess = true;
	private consecutiveHealthFailures = 0;

	private _daemonVersion?: string;

	constructor(config: HealthMonitorConfig = {}) {
		this.checkIntervalMs = config.checkIntervalMs ?? HEALTH_CHECK_INTERVAL_MS;
	}

	getDaemonVersion(): string | undefined {
		return this._daemonVersion;
	}

	setDaemonVersion(version: string | undefined): void {
		this._daemonVersion = version;
	}

	isHealthy(): boolean {
		if (this.lastHealthCheckTime === null) {
			return true; // Assume healthy if no checks yet
		}
		return this.lastHealthCheckSuccess;
	}

	getLastHealthCheckTime(): Date | null {
		return this.lastHealthCheckTime;
	}

	getStatus(): HealthStatus {
		return {
			healthy: this.isHealthy(),
			lastCheckTime: this.lastHealthCheckTime,
			consecutiveFailures: this.consecutiveHealthFailures,
		};
	}

	recordSuccess(version?: string): void {
		this.lastHealthCheckTime = new Date();
		this.lastHealthCheckSuccess = true;
		this.consecutiveHealthFailures = 0;

		if (version) {
			this._daemonVersion = version;
		}
	}

	recordFailure(): boolean {
		this.lastHealthCheckTime = new Date();
		this.lastHealthCheckSuccess = false;
		this.consecutiveHealthFailures++;

		logger.warn(`${LOG_PREFIX} Health check failed`, {
			consecutiveFailures: this.consecutiveHealthFailures,
		});

		return this.consecutiveHealthFailures >= 3;
	}

	start(callback: () => Promise<{ version?: string; uptime?: number }>): void {
		this.stop();

		logger.info(`${LOG_PREFIX} Starting health checks`, {
			intervalMs: this.checkIntervalMs,
		});

		this.healthCheckTimer = setInterval(async () => {
			try {
				const result = await callback();
				this.recordSuccess(result.version);
			} catch (_error) {
				this.recordFailure();
			}
		}, this.checkIntervalMs);
	}

	stop(): void {
		if (this.healthCheckTimer) {
			clearInterval(this.healthCheckTimer);
			this.healthCheckTimer = null;
			logger.info(`${LOG_PREFIX} Health checks stopped`);
		}
	}

	reset(): void {
		this.lastHealthCheckTime = null;
		this.lastHealthCheckSuccess = true;
		this.consecutiveHealthFailures = 0;
	}

	dispose(): void {
		this.stop();
		this.reset();
		this._daemonVersion = undefined;
	}
}
