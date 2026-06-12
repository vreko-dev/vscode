/**
 * @module host-probe
 * @description Host environment probing utilities for detecting Node.js, Bun, package managers, and CLI installation
 *
 * This module probes the host system to determine the optimal execution strategy for the Vreko CLI.
 * It detects available runtimes (Node.js, Bun), package managers, workspace context, and global CLI installation.
 *
 * Strategy priority: global > bunx > npx > unavailable
 */

import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { logger } from "./logger";

// =============================================================================
// Types
// =============================================================================

export type ExecutionStrategy = "global" | "bunx" | "npx" | "unavailable";
export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";
export type LockfileType = "pnpm-lock.yaml" | "yarn.lock" | "bun.lockb" | "package-lock.json" | null;

export interface RuntimeInfo {
	available: boolean;
	version: string | null;
}

export interface PackageManagers {
	npm: boolean;
	pnpm: boolean;
	yarn: boolean;
	bun: boolean;
}

export interface HostEnvironment {
	node: RuntimeInfo;
	bun: RuntimeInfo;
	packageManagers: PackageManagers;
	workspaceLockfile: LockfileType;
	globalCli: RuntimeInfo & { installed: boolean };
	strategy: ExecutionStrategy;
	commandPrefix: string;
}

// =============================================================================
// Cache Management
// =============================================================================

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

let cachedEnvironment: HostEnvironment | null = null;
let cacheTimestamp = 0;

/**
 * Get cached environment if still valid
 */
export function getCachedEnvironment(): HostEnvironment | null {
	if (cachedEnvironment && Date.now() - cacheTimestamp < CACHE_TTL) {
		logger.info("[HostProbe] Returning cached environment", { age: Date.now() - cacheTimestamp });
		return cachedEnvironment;
	}
	return null;
}

/**
 * Clear cached environment (force re-probe)
 */
export function clearEnvironmentCache(): void {
	cachedEnvironment = null;
	cacheTimestamp = 0;
	logger.info("[HostProbe] Cache cleared");
}

// =============================================================================
// Individual Probe Functions
// =============================================================================

/**
 * Probe for Node.js runtime
 */
async function probeNode(): Promise<RuntimeInfo> {
	try {
		const output = execSync("node --version", {
			stdio: "pipe",
			encoding: "utf-8",
			timeout: 2000,
		}).trim();

		// Output format: "v20.11.0" or "20.11.0"
		const version = output.replace(/^v/, "");
		logger.info("[HostProbe] Node.js detected", { version });
		return { available: true, version };
	} catch (_error) {
		logger.info("[HostProbe] Node.js not detected");
		return { available: false, version: null };
	}
}

/**
 * Probe for Bun runtime
 */
async function probeBun(): Promise<RuntimeInfo> {
	try {
		const output = execSync("bun --version", {
			stdio: "pipe",
			encoding: "utf-8",
			timeout: 2000,
		}).trim();

		// Output format: "1.0.25" or "bun 1.0.25"
		const version = output.replace(/^bun\s+/, "");
		logger.info("[HostProbe] Bun detected", { version });
		return { available: true, version };
	} catch (_error) {
		logger.info("[HostProbe] Bun not detected");
		return { available: false, version: null };
	}
}

/**
 * Probe for global CLI installation
 */
async function probeGlobalCli(): Promise<RuntimeInfo & { installed: boolean }> {
	try {
		const output = execSync("vreko --version", {
			stdio: "pipe",
			encoding: "utf-8",
			timeout: 2000,
		}).trim();

		// Output format: "1.2.3" or "@vreko/cli/1.2.3" or "vreko/1.2.3"
		const version = output.replace(/^(@vreko\/cli\/|vreko\/)/, "");
		logger.info("[HostProbe] Global CLI detected", { version });
		return { available: true, installed: true, version };
	} catch (_error) {
		logger.info("[HostProbe] Global CLI not detected");
		return { available: false, installed: false, version: null };
	}
}

/**
 * Probe for available package managers
 */
async function probePackageManagers(): Promise<PackageManagers> {
	const managers: PackageManagers = {
		npm: false,
		pnpm: false,
		yarn: false,
		bun: false,
	};

	// Probe each package manager in parallel
	const probes = [
		{ name: "npm" as const, command: "npm --version" },
		{ name: "pnpm" as const, command: "pnpm --version" },
		{ name: "yarn" as const, command: "yarn --version" },
		{ name: "bun" as const, command: "bun --version" },
	];

	await Promise.all(
		probes.map(async ({ name, command }) => {
			try {
				execSync(command, {
					stdio: "pipe",
					encoding: "utf-8",
					timeout: 2000,
				});
				managers[name] = true;
				logger.info(`[HostProbe] ${name} detected`);
			} catch {
				logger.info(`[HostProbe] ${name} not detected`);
			}
		}),
	);

	return managers;
}

/**
 * Detect workspace lockfile to determine preferred package manager
 */
async function detectWorkspaceLockfile(): Promise<LockfileType> {
	const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
	if (!workspaceFolder) {
		logger.info("[HostProbe] No workspace folder, no lockfile detection");
		return null;
	}

	const lockfiles: Array<"pnpm-lock.yaml" | "yarn.lock" | "bun.lockb" | "package-lock.json"> = [
		"pnpm-lock.yaml",
		"yarn.lock",
		"bun.lockb",
		"package-lock.json",
	];

	for (const lockfile of lockfiles) {
		const lockfilePath = path.join(workspaceFolder, lockfile);
		if (fs.existsSync(lockfilePath)) {
			logger.info("[HostProbe] Lockfile detected", { lockfile });
			return lockfile;
		}
	}

	logger.info("[HostProbe] No lockfile detected");
	return null;
}

// =============================================================================
// Strategy Determination
// =============================================================================

/**
 * Determine optimal execution strategy based on detected environment
 * Priority: global > bunx > npx > unavailable
 */
function determineStrategy(env: { node: RuntimeInfo; bun: RuntimeInfo; globalCli: RuntimeInfo }): ExecutionStrategy {
	if (env.globalCli.available) {
		logger.info("[HostProbe] Strategy: global (CLI installed globally)");
		return "global";
	}
	if (env.bun.available) {
		logger.info("[HostProbe] Strategy: bunx (Bun available, fastest npx alternative)");
		return "bunx";
	}
	if (env.node.available) {
		logger.info("[HostProbe] Strategy: npx (Node.js available)");
		return "npx";
	}
	logger.info("[HostProbe] Strategy: unavailable (no runtime detected)");
	return "unavailable";
}

/**
 * Get command prefix for the given execution strategy
 */
function getCommandPrefix(strategy: ExecutionStrategy): string {
	switch (strategy) {
		case "global":
			return "vreko";
		case "bunx":
			return "bunx @vreko/cli";
		case "npx":
			return "npx @vreko/cli";
		case "unavailable":
			return "";
	}
}

// =============================================================================
// Main Probe Function
// =============================================================================

/**
 * Probe host environment and return complete environment information
 * Results are cached for 5 minutes to avoid repeated probing
 *
 * @param useCache - Whether to use cached result if available (default: true)
 * @returns Complete host environment information with execution strategy
 */
export async function probeHostEnvironment(useCache = true): Promise<HostEnvironment> {
	// Check cache first
	if (useCache) {
		const cached = getCachedEnvironment();
		if (cached) {
			return cached;
		}
	}

	logger.info("[HostProbe] Starting host environment probe");

	// Run all probes in parallel for performance
	const [node, bun, packageManagers, globalCli, lockfile] = await Promise.all([
		probeNode(),
		probeBun(),
		probePackageManagers(),
		probeGlobalCli(),
		detectWorkspaceLockfile(),
	]);

	// Derive execution strategy
	const strategy = determineStrategy({ node, bun, globalCli });
	const commandPrefix = getCommandPrefix(strategy);

	const environment: HostEnvironment = {
		node,
		bun,
		packageManagers,
		workspaceLockfile: lockfile,
		globalCli,
		strategy,
		commandPrefix,
	};

	// Cache the result
	cachedEnvironment = environment;
	cacheTimestamp = Date.now();

	logger.info("[HostProbe] Probe complete", {
		strategy,
		commandPrefix,
		node: node.available,
		bun: bun.available,
		globalCli: globalCli.installed,
	});

	return environment;
}

/**
 * Get preferred package manager based on workspace lockfile or global availability
 * Priority: lockfile match > pnpm > yarn > bun > npm
 */
export function getPreferredPackageManager(env: HostEnvironment): PackageManager {
	// Priority 1: Lockfile match
	if (env.workspaceLockfile === "pnpm-lock.yaml" && env.packageManagers.pnpm) {
		return "pnpm";
	}
	if (env.workspaceLockfile === "yarn.lock" && env.packageManagers.yarn) {
		return "yarn";
	}
	if (env.workspaceLockfile === "bun.lockb" && env.packageManagers.bun) {
		return "bun";
	}
	if (env.workspaceLockfile === "package-lock.json" && env.packageManagers.npm) {
		return "npm";
	}

	// Priority 2: Global availability (prefer faster tools)
	if (env.packageManagers.pnpm) {
		return "pnpm";
	}
	if (env.packageManagers.yarn) {
		return "yarn";
	}
	if (env.packageManagers.bun) {
		return "bun";
	}

	// Priority 3: npm fallback (always available with Node.js)
	return "npm";
}
