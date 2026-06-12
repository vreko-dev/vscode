/**
 * SetupGateMonitor
 *
 * Evaluates the 5 setup preconditions (CLI installed, daemon running,
 * authenticated, workspace initialized, MCP configured) and raises or clears
 * the corresponding StatusFlagManager flags. Each gate is evaluated
 * independently via Promise.allSettled so a failure in one never blocks others.
 *
 * Evaluation runs:
 * - Once on activate()
 * - On every DaemonBridge state change
 * - On workspace folder changes
 *
 * @module signals/SetupGateMonitor
 */

import * as vscode from "vscode";
import { CLIResolver } from "../cli/CLIResolver";
import type { DaemonBridge } from "../services/DaemonBridge";
import type { StatusFlagManager } from "./StatusFlagManager";

export class SetupGateMonitor implements vscode.Disposable {
	private readonly disposables: vscode.Disposable[] = [];
	private readonly cliResolver = new CLIResolver();

	constructor(
		private readonly flagManager: StatusFlagManager,
		private readonly daemonBridge: DaemonBridge,
		private readonly context: vscode.ExtensionContext,
	) {
		/* intentionally empty */
	}

	activate(): void {
		void this.evaluateAll();
		this.disposables.push(
			this.daemonBridge.onStateChange(() => void this.evaluateAll()),
			vscode.workspace.onDidChangeWorkspaceFolders(() => void this.evaluateAll()),
		);
	}

	async evaluateAll(): Promise<void> {
		// CLI gate runs first  -  daemon gate depends on its result
		await this.evaluateCLIGate();
		await Promise.allSettled([
			this.evaluateDaemonGate(),
			this.evaluateAuthGate(),
			this.evaluateWorkspaceGate(),
			this.evaluateMCPGate(),
		]);
	}

	private async evaluateCLIGate(): Promise<void> {
		try {
			const result = await this.cliResolver.resolve();
			if (result.status !== "found") {
				this.flagManager.setFlag("CLI_NOT_INSTALLED");
			} else {
				this.flagManager.clearFlag("CLI_NOT_INSTALLED");
			}
		} catch {
			this.flagManager.setFlag("CLI_NOT_INSTALLED");
		}
	}

	private async evaluateDaemonGate(): Promise<void> {
		try {
			const state = this.daemonBridge.getState();
			const daemonDown = state === "disconnected" || state === "cli_missing";
			const cliPresent = !this.flagManager.hasFlag("CLI_NOT_INSTALLED");
			if (daemonDown && cliPresent) {
				this.flagManager.setFlag("DAEMON_NOT_RUNNING");
			} else {
				this.flagManager.clearFlag("DAEMON_NOT_RUNNING");
			}
		} catch {
			this.flagManager.clearFlag("DAEMON_NOT_RUNNING");
		}
	}

	private async evaluateAuthGate(): Promise<void> {
		try {
			const apiKey = await this.context.secrets.get("vreko.apiKey");
			const isAuthenticated = !!(apiKey && apiKey.trim().length > 0);
			if (!isAuthenticated) {
				this.flagManager.setFlag("NOT_AUTHENTICATED");
			} else {
				this.flagManager.clearFlag("NOT_AUTHENTICATED");
			}
		} catch {
			// Secrets failure  -  do not block the user
			this.flagManager.clearFlag("NOT_AUTHENTICATED");
		}
	}

	private async evaluateWorkspaceGate(): Promise<void> {
		try {
			const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
			if (!workspaceRoot) {
				this.flagManager.clearFlag("WORKSPACE_NOT_INIT");
				return;
			}
			const status = await this.daemonBridge.getOnboardingStatus(workspaceRoot);
			if (status?.phase !== "ready") {
				this.flagManager.setFlag("WORKSPACE_NOT_INIT");
			} else {
				this.flagManager.clearFlag("WORKSPACE_NOT_INIT");
			}
		} catch {
			// RPC failure  -  do not block the user
			this.flagManager.clearFlag("WORKSPACE_NOT_INIT");
		}
	}

	private async evaluateMCPGate(): Promise<void> {
		try {
			// Check both the new key (written by vreko.configureMCP) and the
			// legacy key (written by auto-configure.ts) so existing users are not
			// shown a false-positive gate after upgrading.
			const configured =
				this.context.globalState.get<boolean>("vreko.mcpConfigured", false) ||
				this.context.globalState.get<boolean>("mcp.configured", false);
			if (!configured) {
				this.flagManager.setFlag("MCP_NOT_CONFIGURED");
			} else {
				this.flagManager.clearFlag("MCP_NOT_CONFIGURED");
			}
		} catch {
			this.flagManager.clearFlag("MCP_NOT_CONFIGURED");
		}
	}

	dispose(): void {
		this.disposables.forEach((d) => d.dispose());
	}
}
