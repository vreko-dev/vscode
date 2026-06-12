import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import type { AnonymousIdManager } from "../auth/AnonymousIdManager";
import type { AuthState } from "../auth/AuthState";
import type { EventBridge } from "../bridges/EventBridge";
import type { SignalBridge } from "../bridges/SignalBridge";
import type { VrekoEventBus } from "../events";
import type { HeatIntegration } from "../heat";
import type { AIDetectionToast } from "../notifications/AIDetectionToast";
import { EditMonitorService } from "../services/EditMonitorService";
import type { PRWManager } from "../services/PRWManager";
import type { UserIdentityService } from "../services/UserIdentityService";
import type { WorkspaceManager } from "../services/WorkspaceManager";
import type { SignalSystem } from "../signals/integration";
import type { StatusFlagManager } from "../signals/StatusFlagManager";
import type { IStorageManager } from "../storage/types";
import type { initializeActivationFunnel } from "../telemetry/ActivationFunnelIntegration";
import { logger } from "../utils/logger";

export class ExtensionHost implements vscode.Disposable {
	private disposables: vscode.Disposable[] = [];

	// Services
	public storage: IStorageManager | null = null;
	public eventBus: VrekoEventBus | null = null;
	public workspaceManager: WorkspaceManager | null = null;
	public authState: AuthState | null = null;
	public anonymousIdManager: AnonymousIdManager | null = null;
	public userIdentityService: UserIdentityService | null = null;
	public activationFunnel: ReturnType<typeof initializeActivationFunnel> | null = null;
	public prwManager: PRWManager | null = null;
	public signalBridge: SignalBridge | null = null;
	public eventBridge: EventBridge | null = null;
	public statusFlagManager: StatusFlagManager | null = null;
	public aiDetectionToast: AIDetectionToast | null = null;
	public heatIntegration: HeatIntegration | null = null;
	public editMonitor: EditMonitorService | null = null;
	public signalSystem: SignalSystem | null = null;

	constructor(public readonly context: vscode.ExtensionContext) {
		/* intentionally empty */
	}

	/**
	 * Registers a disposable to be cleaned up on deactivation
	 */
	public register<T extends vscode.Disposable>(disposable: T): T {
		this.disposables.push(disposable);
		return disposable;
	}

	/**
	 * Initializes the edit monitor once required services are ready
	 */
	public initEditMonitor() {
		if (this.signalBridge) {
			this.editMonitor = new EditMonitorService({
				signalBridge: this.signalBridge,
				statusFlagManager: this.statusFlagManager,
				aiDetectionToast: this.aiDetectionToast,
				prwManager: this.prwManager,
			});
			this.disposables.push(this.editMonitor);
		}
	}

	/**
	 * Format a millisecond timestamp as a human-readable relative string.
	 * < 60s → "just now" | < 60m → "{n} minutes ago" | < 24h → "{n} hours ago" | ≥ 24h → "{n} days ago"
	 */
	private _formatTimeAgo(mtimeMs: number): string {
		const diffMs = Date.now() - mtimeMs;
		const diffSecs = Math.floor(diffMs / 1000);
		if (diffSecs < 60) return "just now";
		const diffMins = Math.floor(diffSecs / 60);
		if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? "" : "s"} ago`;
		const diffHours = Math.floor(diffMins / 60);
		if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
		const diffDays = Math.floor(diffHours / 24);
		return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
	}

	/**
	 * Wire a file system watcher for .agents/workspace.json.
	 * Refreshes the StatusWebViewProvider status card when the file is created, changed, or deleted.
	 * Call this after the statusWebViewProvider is initialized (Phase 4a / Phase 5 activation sequence).
	 */
	public initAgentsWorkspaceWatcher(statusWebViewProvider: {
		update: (partial: { agentsWorkspace: { exists: boolean; lastModified?: string } }) => void;
	}): void {
		const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
		if (!workspaceRoot) {
			logger.debug("initAgentsWorkspaceWatcher: no workspace root, skipping");
			return;
		}

		const agentsDir = path.join(workspaceRoot, ".agents");
		const agentsWatcher = vscode.workspace.createFileSystemWatcher(
			new vscode.RelativePattern(agentsDir, "workspace.json"),
		);

		const refreshAgentsStatus = () => {
			// Project from the canonical artifact ONLY (.agents/workspace.json).
			// R-FIX-2: the silent fallback to the legacy `agents.workspace.json` was
			// removed. The daemon deletes the legacy file on its first v0.3 write
			// (workspace-json-emitter.ts atomicWrite), so the fallback could only ever
			// serve a stale read - defect D4. The watcher itself is keyed solely to the
			// canonical `workspace.json` glob, so a legacy-only state never triggers a
			// refresh anyway. Projecting from the canonical path keeps freshness honest
			// (R-SEAM-10) and the thin-client boundary intact (file projection, not an
			// intelligence-layer reach).
			const filePath = path.join(agentsDir, "workspace.json");
			let stat: fs.Stats | null = null;
			try {
				stat = fs.statSync(filePath);
			} catch {
				logger.debug("workspace.json not found");
			}
			statusWebViewProvider.update({
				agentsWorkspace: {
					exists: stat !== null,
					lastModified: stat ? this._formatTimeAgo(stat.mtimeMs) : undefined,
				},
			});
		};

		agentsWatcher.onDidCreate(refreshAgentsStatus);
		agentsWatcher.onDidChange(refreshAgentsStatus);
		agentsWatcher.onDidDelete(refreshAgentsStatus);
		this.context.subscriptions.push(agentsWatcher);

		// Initial check on activation
		refreshAgentsStatus();
	}

	public dispose() {
		this.disposables.forEach((d) => {
			try {
				d.dispose();
			} catch (err) {
				logger.warn("Error during disposal", { error: err });
			}
		});
		this.disposables = [];
	}
}
