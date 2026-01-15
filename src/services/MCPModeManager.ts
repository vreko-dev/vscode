/**
 * MCP Mode Manager
 *
 * Manages mutually exclusive MCP operation modes:
 * - LOCAL_CLI: CLI is installed and configured (full MCP functionality via local daemon)
 * - REMOTE_API: No CLI, use remote API for auth only (degraded experience)
 * - UNCONFIGURED: First run, needs setup wizard
 *
 * Key principle: Never both. Once CLI is configured, remote MCP is disabled entirely.
 *
 * @module services/MCPModeManager
 */

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import * as vscode from "vscode";
import { logger } from "../utils/logger";

// =============================================================================
// MODE ENUM
// =============================================================================

/**
 * MCP operation modes - mutually exclusive
 */
export enum MCPMode {
	/** CLI installed & configured - full functionality via local daemon */
	LOCAL_CLI = "local_cli",

	/** No CLI, use API only for auth/licensing (degraded experience) */
	REMOTE_API = "remote_api",

	/** First run, needs setup */
	UNCONFIGURED = "unconfigured",
}

// =============================================================================
// MODE MANAGER
// =============================================================================

/**
 * Mode change event
 */
export interface MCPModeChangeEvent {
	previousMode: MCPMode;
	newMode: MCPMode;
	reason: string;
}

/**
 * MCP Mode Manager - Singleton
 *
 * Detects and enforces mutually exclusive MCP modes.
 * Emits events when mode changes so components can react accordingly.
 */
export class MCPModeManager implements vscode.Disposable {
	private static instance: MCPModeManager | null = null;

	private currentMode: MCPMode = MCPMode.UNCONFIGURED;
	private readonly _onModeChange = new vscode.EventEmitter<MCPModeChangeEvent>();
	readonly onModeChange = this._onModeChange.event;

	private constructor() {}

	static getInstance(): MCPModeManager {
		if (!MCPModeManager.instance) {
			MCPModeManager.instance = new MCPModeManager();
		}
		return MCPModeManager.instance;
	}

	/**
	 * Get current MCP mode
	 */
	getMode(): MCPMode {
		return this.currentMode;
	}

	/**
	 * Check if currently in local CLI mode
	 */
	isLocalCLIMode(): boolean {
		return this.currentMode === MCPMode.LOCAL_CLI;
	}

	/**
	 * Check if currently in remote API mode
	 */
	isRemoteAPIMode(): boolean {
		return this.currentMode === MCPMode.REMOTE_API;
	}

	/**
	 * Detect and set the appropriate mode based on configuration
	 *
	 * Priority:
	 * 1. If CLI daemon socket exists or CLI is configured → LOCAL_CLI
	 * 2. If API key is configured but no CLI → REMOTE_API (degraded)
	 * 3. Otherwise → UNCONFIGURED
	 */
	async detectMode(): Promise<MCPMode> {
		// Check 1: Is CLI daemon running or configured?
		if (this.isCLIDaemonAvailable() || this.isCLIConfigured()) {
			this.setMode(MCPMode.LOCAL_CLI, "CLI daemon detected or configured");
			return this.currentMode;
		}

		// Check 2: Is there an API key (can use remote API for auth)?
		const config = vscode.workspace.getConfiguration("snapback");
		const apiKey = config.get<string>("apiKey", "") || process.env.SNAPBACK_API_KEY;

		if (apiKey && apiKey.trim() !== "") {
			this.setMode(MCPMode.REMOTE_API, "API key configured, CLI not available");
			return this.currentMode;
		}

		// Check 3: Nothing configured
		this.setMode(MCPMode.UNCONFIGURED, "No CLI or API key configured");
		return this.currentMode;
	}

	/**
	 * Force switch to LOCAL_CLI mode
	 * Called when user completes CLI setup
	 */
	switchToLocalCLI(reason = "CLI configured by user"): void {
		this.setMode(MCPMode.LOCAL_CLI, reason);
	}

	/**
	 * Force switch to REMOTE_API mode
	 * Called when CLI is unavailable but user has API key
	 */
	switchToRemoteAPI(reason = "Falling back to remote API"): void {
		this.setMode(MCPMode.REMOTE_API, reason);
	}

	/**
	 * Reset to unconfigured state
	 */
	reset(): void {
		this.setMode(MCPMode.UNCONFIGURED, "Mode reset");
	}

	// =========================================================================
	// PRIVATE METHODS
	// =========================================================================

	/**
	 * Set mode and emit change event if changed
	 */
	private setMode(newMode: MCPMode, reason: string): void {
		if (this.currentMode === newMode) {
			return;
		}

		const previousMode = this.currentMode;
		this.currentMode = newMode;

		logger.info(`MCP mode changed: ${previousMode} → ${newMode} (${reason})`);

		this._onModeChange.fire({
			previousMode,
			newMode,
			reason,
		});
	}

	/**
	 * Check if CLI daemon socket exists (daemon is running)
	 */
	private isCLIDaemonAvailable(): boolean {
		const IS_WINDOWS = process.platform === "win32";

		if (IS_WINDOWS) {
			// Windows named pipe - harder to check existence
			// For now, rely on configuration check
			return false;
		}

		// Unix socket path
		const socketPath = join(homedir(), ".snapback", "daemon.sock");
		return existsSync(socketPath);
	}

	/**
	 * Check if CLI is configured in user's MCP client config
	 * Looks for snapback entry in common MCP config locations
	 */
	private isCLIConfigured(): boolean {
		const configLocations = [
			// Cursor
			join(homedir(), ".cursor", "mcp.json"),
			// Claude Desktop
			join(homedir(), "Library", "Application Support", "Claude", "claude_desktop_config.json"),
			// VS Code settings (workspace or user)
		];

		for (const configPath of configLocations) {
			if (existsSync(configPath)) {
				try {
					const fs = require("node:fs");
					const content = fs.readFileSync(configPath, "utf8");
					// Check if snapback is mentioned in the config
					if (content.includes("snapback") || content.includes("@snapback/cli")) {
						logger.debug(`CLI configured in ${configPath}`);
						return true;
					}
				} catch {
					// Ignore read errors
				}
			}
		}

		// Also check VS Code configuration
		const config = vscode.workspace.getConfiguration("snapback");
		const cliPath = config.get<string>("cliPath", "");
		if (cliPath && cliPath.trim() !== "") {
			return true;
		}

		return false;
	}

	// =========================================================================
	// DISPOSE
	// =========================================================================

	dispose(): void {
		this._onModeChange.dispose();
		MCPModeManager.instance = null;
	}
}

// =============================================================================
// CONVENIENCE EXPORT
// =============================================================================

/**
 * Get the singleton MCPModeManager instance
 */
export function getMCPModeManager(): MCPModeManager {
	return MCPModeManager.getInstance();
}
