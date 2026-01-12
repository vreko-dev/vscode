/**
 * @module useCliEnvironment
 * @description React hook for managing CLI execution environment state
 * 
 * This hook manages communication between the webview and extension host for CLI execution.
 * It automatically probes the host environment on mount and provides actions for executing CLI commands.
 */

import type { HostEnvironment } from "@snapback/contracts";
import { useCallback, useEffect, useState } from "react";
import { getVSCodeAPI } from "../vscode-api";

// =============================================================================
// Types
// =============================================================================

export type CliEnvironmentStatus = "unknown" | "probing" | "ready" | "unavailable" | "running";

export interface CliEnvironmentState {
	environment: HostEnvironment | null;
	status: CliEnvironmentStatus;
	error: string | null;
}

export interface UseCliEnvironmentReturn extends CliEnvironmentState {
	// Derived state
	canRunCli: boolean;
	strategy: "global" | "bunx" | "npx" | "unavailable";
	commandPrefix: string | null;

	// Actions
	probe: () => void;
	getEnvironment: () => void;
	runCommand: (command: string, args?: string[]) => void;
	clearError: () => void;
}

// =============================================================================
// Hook Implementation
// =============================================================================

/**
 * Hook for managing CLI environment state and execution
 */
export function useCliEnvironment(): UseCliEnvironmentReturn {
	const [state, setState] = useState<CliEnvironmentState>({
		environment: null,
		status: "unknown",
		error: null,
	});

	const vscode = getVSCodeAPI();

	// ==========================================================================
	// Message Listener
	// ==========================================================================

	useEffect(() => {
		const handler = (event: MessageEvent) => {
			const message = event.data;

			switch (message.type) {
				case "host:probing":
					setState((s) => ({ ...s, status: "probing", error: null }));
					break;

				case "host:environment": {
					const isAvailable = message.payload.strategy !== "unavailable";
					setState({
						environment: message.payload,
						status: isAvailable ? "ready" : "unavailable",
						error: null,
					});
					break;
				}

				case "cli:running":
					setState((s) => ({ ...s, status: "running", error: null }));
					break;

				case "cli:error":
					setState((s) => ({ ...s, status: "ready", error: message.payload.message }));
					break;

				// Handle legacy message types for backwards compatibility
				case "error":
					setState((s) => ({ ...s, status: "ready", error: message.payload.message }));
					break;

				default:
					// Ignore unrelated messages
					break;
			}
		};

		window.addEventListener("message", handler);
		return () => window.removeEventListener("message", handler);
	}, []);

	// ==========================================================================
	// Actions
	// ==========================================================================

	/**
	 * Force re-probe the host environment (ignores cache)
	 */
	const probe = useCallback(() => {
		vscode.postMessage({ type: "host:probe" });
	}, [vscode]);

	/**
	 * Get cached environment (or probe if cache expired)
	 */
	const getEnvironment = useCallback(() => {
		vscode.postMessage({ type: "host:getEnvironment" });
	}, [vscode]);

	/**
	 * Execute a CLI command
	 */
	const runCommand = useCallback(
		(command: string, args?: string[]) => {
			vscode.postMessage({
				type: "cli:run",
				payload: { command, args },
			});
		},
		[vscode],
	);

	/**
	 * Clear error state
	 */
	const clearError = useCallback(() => {
		setState((s) => ({ ...s, error: null }));
	}, []);

	// ==========================================================================
	// Auto-fetch environment on mount
	// ==========================================================================

	useEffect(() => {
		getEnvironment();
	}, [getEnvironment]);

	// ==========================================================================
	// Derived State
	// ==========================================================================

	const canRunCli = state.status === "ready" && state.environment?.strategy !== "unavailable";
	const strategy = state.environment?.strategy || "unavailable";
	const commandPrefix = state.environment?.commandPrefix || null;

	// ==========================================================================
	// Return
	// ==========================================================================

	return {
		// State
		environment: state.environment,
		status: state.status,
		error: state.error,

		// Derived
		canRunCli,
		strategy,
		commandPrefix,

		// Actions
		probe,
		getEnvironment,
		runCommand,
		clearError,
	};
}
