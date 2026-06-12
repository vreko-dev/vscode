/**
 * FragileFileCodeLensProvider  -  line-1 CodeLens on fragile and agent-touched files.
 *
 * Shows a single lens at line 0 for files that are either:
 *   - Flagged fragile by service (IPC poll on session start + mcp.file-modified)
 *   - Touched by the agent in the current session
 *
 * DO NOT share state with IntelligenceCodeLensProvider  -  different data source (service IPC vs SignalState).
 * Guard: respects `vreko.ui.codeLensEnabled` setting.
 */

import { PIONEER_EVENTS } from "@vreko/contracts/pioneer";
import * as vscode from "vscode";
import type { DaemonBridge } from "../services/DaemonBridge";
import { getActivationFunnel } from "../telemetry/ActivationFunnelIntegration";
import { FunnelType } from "../telemetry/TelemetryFunnel";
import { logger } from "../utils/logger";

const LOG_PREFIX = "[FragileFileCodeLensProvider]";

export class FragileFileCodeLensProvider implements vscode.CodeLensProvider, vscode.Disposable {
	private fragileFiles = new Set<string>();
	private agentTouchedFiles = new Map<string, number>(); // path → timestamp
	private readonly disposables: vscode.Disposable[] = [];
	private readonly _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
	readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

	constructor(
		private readonly daemonBridge: DaemonBridge,
		private readonly globalState: vscode.Memento,
	) {
		this.disposables.push(
			this.daemonBridge.onSessionStarted(() => {
				void this.refreshFragileFiles();
			}),
			this.daemonBridge.onSessionEnded(() => {
				this.agentTouchedFiles.clear();
				this._onDidChangeCodeLenses.fire();
			}),
			this.daemonBridge.onMcpFileModified((event) => {
				this.agentTouchedFiles.set(event.filePath, Date.now());
				void this.refreshFragileFiles();
				this._onDidChangeCodeLenses.fire();
			}),
		);
	}

	provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
		if (!vscode.workspace.getConfiguration("vreko.ui").get("codeLensEnabled", true)) {
			return [];
		}

		const fsPath = document.uri.fsPath;
		const isFragile = this.fragileFiles.has(fsPath);
		const touchedAt = this.agentTouchedFiles.get(fsPath);

		if (!isFragile && touchedAt === undefined) {
			return [];
		}

		const range = new vscode.Range(0, 0, 0, 0);
		let title: string;

		if (isFragile && touchedAt !== undefined) {
			const ago = this.formatTimeAgo(touchedAt);
			title = `⚠ Fragile · agent edited ${ago} · [View history]`;
		} else if (isFragile) {
			title = "⚠ Fragile · [View history]";
		} else {
			const ago = this.formatTimeAgo(touchedAt ?? 0);
			title = `● Agent edited ${ago} · [View history]`;
		}

		return [
			new vscode.CodeLens(range, {
				title,
				command: "vreko.showFileHistory",
				arguments: [document.uri],
			}),
		];
	}

	private async refreshFragileFiles(): Promise<void> {
		try {
			const result = await this.daemonBridge.request<{ files?: { path: string }[] }>(
				"intelligence/fragile-files",
				{},
			);
			if (result?.files) {
				this.fragileFiles = new Set(result.files.map((f) => f.path));
				this._onDidChangeCodeLenses.fire();
				if (result.files.length > 0) {
					if (!this.globalState.get<boolean>("vreko.pioneer.firstIntelligenceFileCard", false)) {
						void this.globalState.update("vreko.pioneer.firstIntelligenceFileCard", true);
						getActivationFunnel()?.trackStep(
							FunnelType.ACTIVATION,
							PIONEER_EVENTS.FIRST_INTELLIGENCE_FILE_CARD,
							{
								step: 7,
								timestamp: Date.now(),
							},
						);
					}
				}
			}
		} catch (err) {
			logger.debug(`${LOG_PREFIX} Failed to refresh fragile files`, { err });
		}
	}

	private formatTimeAgo(timestamp: number): string {
		const diff = Date.now() - timestamp;
		const minutes = Math.floor(diff / 60_000);
		if (minutes < 1) {
			return "just now";
		}
		if (minutes === 1) {
			return "1m ago";
		}
		return `${minutes}m ago`;
	}

	dispose(): void {
		this._onDidChangeCodeLenses.dispose();
		for (const d of this.disposables) {
			d.dispose();
		}
	}
}
