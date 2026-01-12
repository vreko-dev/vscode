/**
 * @module package-manager
 * @description Utilities for detecting and working with package managers
 *
 * NOTE: This module provides a simplified sync API for the dashboard CLI install flow.
 * For full environment probing (runtime detection, execution strategy), use host-probe.ts instead.
 *
 * @see host-probe.ts for comprehensive environment probing with getPreferredPackageManager()
 */

import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";

export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

/**
 * Detect the preferred package manager for the current workspace
 * Priority: workspace lockfile > global availability
 */
export function detectPackageManager(): PackageManager {
	const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

	if (workspaceRoot) {
		// Check for lockfiles in workspace (most reliable indicator)
		if (fs.existsSync(path.join(workspaceRoot, "pnpm-lock.yaml"))) return "pnpm";
		if (fs.existsSync(path.join(workspaceRoot, "yarn.lock"))) return "yarn";
		if (fs.existsSync(path.join(workspaceRoot, "bun.lockb"))) return "bun";
		if (fs.existsSync(path.join(workspaceRoot, "package-lock.json"))) return "npm";
	}

	// Check global availability (prefer faster tools)
	try {
		execSync("pnpm --version", { stdio: "pipe" });
		return "pnpm";
	} catch {
		// pnpm not available
	}

	try {
		execSync("yarn --version", { stdio: "pipe" });
		return "yarn";
	} catch {
		// yarn not available
	}

	try {
		execSync("bun --version", { stdio: "pipe" });
		return "bun";
	} catch {
		// bun not available
	}

	// Fallback - npm is always available with Node.js
	return "npm";
}

/**
 * Get the global install command for a given package manager
 */
export function getInstallCommand(pm: PackageManager, packageName: string): string {
	const commands: Record<PackageManager, string> = {
		npm: `npm install -g ${packageName}`,
		pnpm: `pnpm add -g ${packageName}`,
		yarn: `yarn global add ${packageName}`,
		bun: `bun add -g ${packageName}`,
	};
	return commands[pm];
}

/**
 * Get the display name for a package manager
 */
export function getPackageManagerDisplayName(pm: PackageManager): string {
	const names: Record<PackageManager, string> = {
		npm: "npm",
		pnpm: "pnpm",
		yarn: "Yarn",
		bun: "Bun",
	};
	return names[pm];
}

/**
 * Check if a specific package manager is available globally
 */
export function isPackageManagerAvailable(pm: PackageManager): boolean {
	try {
		execSync(`${pm} --version`, { stdio: "pipe" });
		return true;
	} catch {
		return false;
	}
}
