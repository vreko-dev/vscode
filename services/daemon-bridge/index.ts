/**
 * Daemon Bridge Services
 *
 * Extracted services from DaemonBridge for better testability
 * and separation of concerns.
 *
 * @module daemon-bridge
 */

export {
	type CircuitBreakerState,
	ConnectionManager,
	type ConnectionManagerConfig,
	circuitBreaker,
	getCliPath,
	getPidPath,
	getSocketPath,
	resetCircuitBreaker,
} from "./ConnectionManager.js";
// Daemon Events - event handling and notification dispatch
export {
	type DaemonEventMap,
	type DaemonEventName,
	DaemonEvents,
} from "./DaemonEvents.js";

// Daemon Operations - type-safe IPC method wrappers
export {
	type ConnectionChecker,
	DaemonOperations,
	type DaemonStatus,
	normalizeMethod,
	type RequestFunction,
	type SessionStatusResult,
	toRelativePath,
	toRelativePaths,
} from "./DaemonOperations.js";
export {
	HealthMonitor,
	type HealthMonitorConfig,
	type HealthStatus,
} from "./HealthMonitor.js";
