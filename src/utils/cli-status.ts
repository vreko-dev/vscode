/**
 * @module cli-status
 * @description Utilities for detecting SnapBack CLI installation status
 *
 * NOTE: This module provides a simplified sync API for the dashboard CLI install flow.
 * For full environment probing (runtime detection, execution strategy), use host-probe.ts instead.
 *
 * @see host-probe.ts for comprehensive environment probing
 */

import { execSync } from "node:child_process";

export interface CliStatus {
	/** Whether the CLI is installed and accessible in PATH */
	installed: boolean;
	/** Version string if installed (e.g., "1.2.3") */
	version: string | null;
	/** Path to the CLI executable if found */
	path: string | null;
}

const CLI_COMMAND = "snapback";
const VERSION_FLAG = "--version";
const WHICH_COMMAND = process.platform === "win32" ? "where" : "which";

/**
 * Execute a command and return the trimmed output
 */
function execCommand(command: string, timeout = 5000): string | null {
	try {
		return execSync(command, {
			stdio: "pipe",
			encoding: "utf-8",
			timeout,
			windowsHide: true,
		}).trim();
	} catch {
		return null;
	}
}

/**
 * Get the path to the CLI executable
 */
function getCliPath(): string | null {
	return execCommand(`${WHICH_COMMAND} ${CLI_COMMAND}`);
}

/**
 * Get the CLI version string
 */
function getCliVersion(): string | null {
	const output = execCommand(`${CLI_COMMAND} ${VERSION_FLAG}`);
	if (!output) return null;

	// Parse version from output (handles various formats)
	// e.g., "snapback 1.2.3", "1.2.3", "v1.2.3"
	const versionMatch = output.match(/\d+\.\d+\.\d+(?:-[\w.]+)?/);
	return versionMatch ? versionMatch[0] : output;
}

/**
 * Check if the SnapBack CLI is installed
 *
 * @returns CliStatus object with installation details
 */
export async function getCliStatus(): Promise<CliStatus> {
	const cliPath = getCliPath();

	if (!cliPath) {
		return {
			installed: false,
			version: null,
			path: null,
		};
	}

	const version = getCliVersion();

	return {
		installed: true,
		version,
		path: cliPath,
	};
}

/**
 * Synchronous version of getCliStatus for use in synchronous contexts
 */
export function getCliStatusSync(): CliStatus {
	const cliPath = getCliPath();

	if (!cliPath) {
		return {
			installed: false,
			version: null,
			path: null,
		};
	}

	const version = getCliVersion();

	return {
		installed: true,
		version,
		path: cliPath,
	};
}

/**
 * Quick check if CLI is installed (without fetching version)
 */
export function isCliInstalled(): boolean {
	return getCliPath() !== null;
}

/**
 * Verify CLI installation by running a simple command
 * This is more thorough than just checking if the binary exists
 */
export async function verifyCliInstallation(): Promise<{
	valid: boolean;
	error?: string;
}> {
	try {
		const output = execCommand(`${CLI_COMMAND} ${VERSION_FLAG}`, 10000);
		if (!output) {
			return { valid: false, error: "CLI returned no output" };
		}
		return { valid: true };
	} catch (err) {
		const error = err instanceof Error ? err.message : "Unknown error";
		return { valid: false, error };
	}
}
