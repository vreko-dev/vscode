/**
 * MCPBridge - Workspace-keyed MCP client adapter
 *
 * Thin adapter over MCPClient that exposes the Bridge naming convention used
 * by workspace-isolation tests and callers predating the Jan 2026 MCPClient
 * consolidation. All logic lives in MCPClient; this file only maps names.
 *
 * @module bridges/MCPBridge
 */

import {
	disposeAllMCPClients,
	disposeMCPClient,
	getActiveMCPClientWorkspaces,
	getMCPClient,
	type MCPClient,
} from "../mcp/MCPClient";

export type { MCPClient as MCPBridge };

/** Get (or create) the workspace-keyed MCP bridge instance. */
export function getMCPBridge(workspaceId: string): MCPClient {
	return getMCPClient(workspaceId);
}

/** Dispose the bridge for a single workspace. */
export function disposeMCPBridgeForWorkspace(workspaceId: string): void {
	disposeMCPClient(workspaceId);
}

/** Dispose all active workspace bridges. */
export function disposeAllMCPBridges(): void {
	disposeAllMCPClients();
}

/** Return all currently active workspace IDs. */
export function getActiveMCPBridgeWorkspaces(): string[] {
	return getActiveMCPClientWorkspaces();
}
