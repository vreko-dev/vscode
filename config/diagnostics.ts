/**
 * Diagnostics Mode Configuration
 *
 * Controls probe emission and verbose diagnostics for Path Attribution Gates.
 *
 * Enable via:
 * - Environment variable: CI=1 or VREKO_DIAGNOSTICS=1
 * - VS Code setting: vreko.diagnosticsEnabled
 *
 * @module config/diagnostics
 */

import * as vscode from "vscode";

// Declare globalThis extension for run ID caching
declare global {
	// eslint-disable-next-line no-var
	var __VREKO_RUN_ID: string | undefined;
}

/**
 * Check if diagnostics mode is enabled
 *
 * Checks in order:
 * 1. CI environment variable
 * 2. VREKO_DIAGNOSTICS environment variable
 * 3. VS Code configuration setting
 */
export function isDiagnosticsEnabled(): boolean {
	// Check environment variables first (CI override)
	if (process.env.CI === "1" || process.env.VREKO_DIAGNOSTICS === "1") {
		return true;
	}

	// Check VS Code configuration
	try {
		const config = vscode.workspace.getConfiguration("vreko");
		return config.get<boolean>("diagnosticsEnabled", false) ?? false;
	} catch {
		// Not in VS Code context
		return false;
	}
}

/**
 * Get the current run ID for probe storage
 * Computed once and cached in globalThis
 */
export function getRunId(): string {
	if (globalThis.__VREKO_RUN_ID) {
		return globalThis.__VREKO_RUN_ID;
	}

	const runId = process.env.CI_RUN_ID || `local-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
	globalThis.__VREKO_RUN_ID = runId;
	return runId;
}

/**
 * Get the probe log directory path
 */
export function getProbeLogDir(): string {
	return "probe-logs";
}
