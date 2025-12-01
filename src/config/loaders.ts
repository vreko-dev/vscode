import * as fs from "node:fs/promises";
import JSON5 from "json5";
import * as vscode from "vscode";
import type { SnapBackRC } from "../types/snapbackrc.types";
import {
	executeSandboxedScriptWrapper,
	SandboxError,
} from "./secureChildProcess";

// Try to import yaml, but handle if it's not available
let yaml: { parse: (content: string) => unknown } | null;
try {
	yaml = require("yaml");
} catch (_e) {
	// yaml not available, that's fine
	yaml = null;
}

/**
 * Load JSON configuration file
 */
export async function loadJsonConfig(filePath: string): Promise<SnapBackRC> {
	const content = await fs.readFile(filePath, "utf8");
	return JSON.parse(content);
}

/**
 * Load JSON5 configuration file (with comments support)
 */
export async function loadJson5Config(filePath: string): Promise<SnapBackRC> {
	const content = await fs.readFile(filePath, "utf8");
	return JSON5.parse(content);
}

/**
 * Load YAML configuration file
 */
export async function loadYamlConfig(filePath: string): Promise<SnapBackRC> {
	if (!yaml) {
		throw new Error(
			"YAML support not available. Please install the yaml package.",
		);
	}

	const content = await fs.readFile(filePath, "utf8");
	return yaml.parse(content) as SnapBackRC;
}

/**
 * Load configuration from package.json
 */
export async function loadPackageJsonConfig(
	filePath: string,
): Promise<SnapBackRC> {
	const content = await fs.readFile(filePath, "utf8");
	const packageJson = JSON.parse(content);
	return packageJson.snapback || {};
}

/**
 * Check if executable configs are enabled
 * OFF by default for security - must be explicitly enabled
 */
function isExecutableConfigsEnabled(): boolean {
	const config = vscode.workspace.getConfiguration("snapback");
	const enabled = config.get<boolean>("config.enableExecutableConfigs", false);

	// Additional check for remote environments where we should enforce OFF
	const env = vscode.env;
	if (env.remoteName) {
		// In remote environments, executable configs should be OFF by default
		// unless explicitly overridden
		return (
			config.get<boolean>(
				"config.enableExecutableConfigs.remoteOverride",
				false,
			) && enabled
		);
	}

	return enabled;
}

/**
 * Load CJS configuration file in a secure sandboxed environment
 * Uses a child process with strict limits to prevent security issues
 * OFF by default - must be explicitly enabled
 */
export async function loadCjsConfig(filePath: string): Promise<SnapBackRC> {
	// Check if executable configs are enabled
	if (!isExecutableConfigsEnabled()) {
		throw new Error(
			"CJS configuration loading is disabled by default. Enable with snapback.config.enableExecutableConfigs setting.",
		);
	}

	try {
		const result = await executeSandboxedScriptWrapper(filePath);
		return result.result as SnapBackRC;
	} catch (error) {
		if (error instanceof SandboxError) {
			throw new Error(`Sandbox error: ${error.message}`);
		}
		throw error;
	}
}

/**
 * Load MJS configuration file (disabled by default for security)
 * OFF by default - must be explicitly enabled
 */
export async function loadMjsConfig(filePath: string): Promise<SnapBackRC> {
	// Check if executable configs are enabled
	if (!isExecutableConfigsEnabled()) {
		throw new Error(
			"MJS configuration loading is disabled by default. Enable with snapback.config.enableExecutableConfigs setting.",
		);
	}

	try {
		const result = await executeSandboxedScriptWrapper(filePath);
		return result.result as SnapBackRC;
	} catch (error) {
		if (error instanceof SandboxError) {
			throw new Error(`Sandbox error: ${error.message}`);
		}
		throw error;
	}
}
