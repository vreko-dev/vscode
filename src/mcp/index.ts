/**
 * MCP Module - Unified MCP management
 *
 * This module consolidates the previously scattered MCP components:
 * - MCPController: Lifecycle, mode detection, health monitoring
 * - MCPClient: Communication, observations, telemetry
 *
 * @module mcp
 */

export {
	disposeAllMCPClients,
	disposeMCPClient,
	getMCPClient,
	MCPClient,
	type MCPClientConfig,
	type MCPClientStatus,
	type MCPFileChange,
	type MCPObservation,
} from "./MCPClient";
export {
	disposeMCPController,
	getMCPController,
	type HealthChangeEvent,
	type HealthState,
	type LatencyMetrics,
	type MCPConnectionState,
	MCPController,
	type MCPControllerConfig,
	type MCPControllerStatus,
	MCPMode,
	type MCPModeChangeEvent,
	type MCPStateChangeEvent,
} from "./MCPController";
