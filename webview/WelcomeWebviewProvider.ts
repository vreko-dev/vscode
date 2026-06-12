/**
 * Welcome Webview Provider  -  3-State Onboarding
 *
 * Shows the pioneer first-run experience with 3 states:
 * - SETUP: Steps checklist while daemon connects
 * - SCANNING: Real-time progress bars as workspace analysis runs
 * - COMPLETE: Recovery Risk Profile with all dimensions
 *
 * Architecture:
 * - Thin renderer  -  data comes from daemon via DaemonBridge
 * - Never computes intelligence  -  only renders state updates
 * - Auto-opens once per workspace (flag in globalState)
 *
 * @see spec B1
 * @module webview/WelcomeWebviewProvider
 */

import * as vscode from "vscode";
import type { DaemonBridge } from "../services/DaemonBridge";
import { logger } from "../utils/logger";

// =============================================================================
// Types
// =============================================================================

export interface SetupStep {
	label: string;
	status: "pending" | "active" | "complete" | "failed";
	detail?: string;
}

export interface ScanProgress {
	commitProgress: number; // 0-100
	reflogProgress: number; // 0-100
	stage: string; // "Analyzing commit history" etc.
}

export interface EarlyFinding {
	type: "warning" | "insight";
	text: string;
}

export interface RecoveryRiskProfile {
	dimensions: {
		recoveryRisk: number; // 0-100
		changeVolatility: number; // 0-100
		workflowFragility: number; // 0-100
	};
	secondary: {
		complexity: number;
		collaboration: number;
		aiExposure: number;
	};
	insights: Array<{
		type: "warning" | "locked";
		finding: string;
		action: string;
	}>;
	fragileHotspots: Array<{
		path: string;
		changes: number;
		reverts: number;
	}>;
}

type WelcomeState =
	| { phase: "setup"; steps: SetupStep[] }
	| { phase: "scanning"; progress: ScanProgress; earlyFindings: EarlyFinding[] }
	| { phase: "complete"; profile: RecoveryRiskProfile };

// Webview → Extension messages
type WebViewInMessage = { type: "connect-account" } | { type: "dismiss" } | { type: "ready" };

// =============================================================================
// Provider
// =============================================================================

export class WelcomeWebviewProvider {
	public static readonly viewType = "vreko.welcome";
	public static readonly AUTO_OPEN_KEY = "vreko.welcomeShown";

	private _panel?: vscode.WebviewPanel;
	private readonly _extensionUri: vscode.Uri;
	private readonly _daemonBridge: DaemonBridge | null;
	private readonly _disposables: vscode.Disposable[] = [];
	private _currentState: WelcomeState;

	constructor(extensionUri: vscode.Uri, daemonBridge: DaemonBridge | null) {
		this._extensionUri = extensionUri;
		this._daemonBridge = daemonBridge;
		this._currentState = {
			phase: "setup",
			steps: this._initialSetupSteps(),
		};
	}

	// ===========================================================================
	// Public API
	// ===========================================================================

	/**
	 * Show the welcome panel. Creates new panel or reveals existing.
	 */
	public show(): void {
		if (this._panel) {
			this._panel.reveal(vscode.ViewColumn.One);
			return;
		}

		this._panel = vscode.window.createWebviewPanel(
			WelcomeWebviewProvider.viewType,
			"Vreko  -  Workspace Analysis",
			vscode.ViewColumn.One,
			{
				enableScripts: true,
				localResourceRoots: [this._extensionUri],
				retainContextWhenHidden: true,
			},
		);

		this._panel.webview.html = this._getHtml(this._panel.webview);

		this._panel.webview.onDidReceiveMessage(
			(message: WebViewInMessage) => this._handleMessage(message),
			null,
			this._disposables,
		);

		this._panel.onDidDispose(
			() => {
				this._panel = undefined;
				this._disposeListeners();
			},
			null,
			this._disposables,
		);

		this._subscribeToDaemonEvents();
	}

	/**
	 * Auto-open once per workspace. Subsequent activations are no-ops.
	 */
	public static shouldAutoOpen(context: vscode.ExtensionContext, workspaceHash: string): boolean {
		const key = `${WelcomeWebviewProvider.AUTO_OPEN_KEY}.${workspaceHash}`;
		return !context.globalState.get<boolean>(key);
	}

	public static markAutoOpened(context: vscode.ExtensionContext, workspaceHash: string): void {
		const key = `${WelcomeWebviewProvider.AUTO_OPEN_KEY}.${workspaceHash}`;
		context.globalState.update(key, true).then(undefined, (err) => {
			logger.error("Failed to persist welcome auto-open flag", { err });
		});
	}

	/**
	 * Load scan profile directly (skip scanning if cache available).
	 */
	public showComplete(profile: RecoveryRiskProfile): void {
		this._currentState = { phase: "complete", profile };
		this._postState();
	}

	/**
	 * Advance a setup step.
	 */
	public updateSetupStep(label: string, status: SetupStep["status"], detail?: string): void {
		if (this._currentState.phase !== "setup") {
			return;
		}
		const steps = this._currentState.steps.map((s) =>
			s.label === label ? { ...s, status, detail: detail ?? s.detail } : s,
		);
		this._currentState = { phase: "setup", steps };
		this._postState();
	}

	/**
	 * Transition to SCANNING state.
	 */
	public startScanning(): void {
		this._currentState = {
			phase: "scanning",
			progress: { commitProgress: 0, reflogProgress: 0, stage: "Starting analysis..." },
			earlyFindings: [],
		};
		this._postState();
	}

	/**
	 * Update scan progress.
	 */
	public updateScanProgress(progress: Partial<ScanProgress>): void {
		if (this._currentState.phase !== "scanning") {
			return;
		}
		this._currentState = {
			...this._currentState,
			progress: { ...this._currentState.progress, ...progress },
		};
		this._postState();
	}

	/**
	 * Add an early finding during scan.
	 */
	public addEarlyFinding(finding: EarlyFinding): void {
		if (this._currentState.phase !== "scanning") {
			return;
		}
		this._currentState = {
			...this._currentState,
			earlyFindings: [...this._currentState.earlyFindings, finding],
		};
		this._postState();
	}

	public dispose(): void {
		this._panel?.dispose();
		this._disposeListeners();
	}

	// ===========================================================================
	// Private
	// ===========================================================================

	private _initialSetupSteps(): SetupStep[] {
		return [
			{ label: "Extension activated", status: "complete" },
			{ label: "CLI detected", status: "pending" },
			{ label: "Daemon starting", status: "pending" },
			{ label: "Daemon connected", status: "pending" },
		];
	}

	private _postState(): void {
		if (!this._panel) {
			return;
		}
		this._panel.webview
			.postMessage({ type: "state-update", state: this._currentState })
			.then(undefined, (err) => logger.error("Failed to post state to webview", { err }));
	}

	private _subscribeToDaemonEvents(): void {
		if (!this._daemonBridge) {
			return;
		}

		// Future: subscribe to scan.progress, scan.finding, scan.complete events
		// These will be added in C6 (scan pipeline event emission).
		// For now, we listen to connection state to advance setup steps.
		const connSub = this._daemonBridge.onConnectionChanged?.((connected) => {
			if (connected && this._currentState.phase === "setup") {
				this.updateSetupStep("Daemon starting", "complete");
				this.updateSetupStep("Daemon connected", "complete");
			} else if (!connected && this._currentState.phase === "setup") {
				this.updateSetupStep("Daemon starting", "active");
				this.updateSetupStep("Daemon connected", "pending");
			}
		});

		if (connSub) {
			this._disposables.push(connSub);
		}
	}

	private _handleMessage(message: WebViewInMessage): void {
		switch (message.type) {
			case "connect-account":
				vscode.commands.executeCommand("vreko.openExternal.auth").then(undefined, () => {
					// Auth flow not available  -  open dashboard
					vscode.env.openExternal(vscode.Uri.parse("https://vreko.dev/dashboard"));
				});
				break;

			case "dismiss":
				this._panel?.dispose();
				break;

			case "ready":
				// Webview is ready  -  send current state
				this._postState();
				break;
		}
	}

	private _disposeListeners(): void {
		for (const d of this._disposables) {
			d.dispose();
		}
		this._disposables.length = 0;
	}

	private _getNonce(): string {
		let text = "";
		const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
		for (let i = 0; i < 32; i++) {
			text += possible.charAt(Math.floor(Math.random() * possible.length));
		}
		return text;
	}

	// ===========================================================================
	// HTML
	// ===========================================================================

	private _getHtml(webview: vscode.Webview): string {
		const nonce = this._getNonce();
		const csp = `default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';`;

		return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <title>Vreko  -  Workspace Analysis</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: var(--vscode-font-family, 'Menlo', 'Consolas', monospace);
      font-size: 13px;
      color: var(--vscode-foreground, #cccccc);
      background: var(--vscode-editor-background, #1e1e1e);
      height: 100vh;
      overflow-y: auto;
      padding: 24px;
    }

    h1 { font-size: 14px; font-weight: 600; margin-bottom: 20px; letter-spacing: 0.05em; text-transform: uppercase; color: var(--vscode-foreground, #cccccc); }
    h2 { font-size: 12px; font-weight: 600; color: var(--vscode-foreground, #aaaaaa); margin: 20px 0 10px; text-transform: uppercase; letter-spacing: 0.05em; }

    /* ---- PRIVACY LINE ---- */
    .privacy-line {
      font-size: 11px;
      color: var(--vscode-descriptionForeground, #888888);
      margin-top: 24px;
      padding-top: 16px;
      border-top: 1px solid var(--vscode-panel-border, #333333);
    }

    /* ---- SETUP STATE ---- */
    .step-list { list-style: none; }
    .step-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 0;
      border-bottom: 1px solid var(--vscode-panel-border, #2a2a2a);
      font-size: 13px;
    }
    .step-icon { width: 16px; text-align: center; flex-shrink: 0; }
    .step-detail { font-size: 11px; color: var(--vscode-descriptionForeground, #888888); margin-top: 2px; }

    /* ---- SCANNING STATE ---- */
    .progress-group { margin-bottom: 16px; }
    .progress-label { font-size: 11px; color: var(--vscode-descriptionForeground, #888888); margin-bottom: 4px; display: flex; justify-content: space-between; }
    .progress-bar-bg { background: var(--vscode-panel-border, #333333); border-radius: 2px; height: 6px; overflow: hidden; }
    .progress-bar-fill { height: 100%; background: #4ADE80; border-radius: 2px; transition: width 0.3s ease; }
    .stage-label { font-size: 12px; color: var(--vscode-descriptionForeground, #888888); margin-top: 8px; font-style: italic; }

    .findings-list { list-style: none; margin-top: 12px; }
    .finding-item {
      display: flex;
      gap: 8px;
      padding: 4px 0;
      font-size: 12px;
      font-family: var(--vscode-editor-font-family, 'Menlo', monospace);
      animation: fadeIn 0.3s ease;
    }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    .finding-icon { flex-shrink: 0; }

    /* ---- COMPLETE STATE ---- */
    .dimension-row { margin-bottom: 14px; }
    .dimension-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
    .dimension-name { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--vscode-descriptionForeground, #888888); }
    .dimension-score { font-size: 18px; font-weight: 700; font-variant-numeric: tabular-nums; }

    .insight-table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 8px; }
    .insight-table th { text-align: left; padding: 6px 8px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--vscode-descriptionForeground, #888888); border-bottom: 1px solid var(--vscode-panel-border, #333333); }
    .insight-table td { padding: 8px; border-bottom: 1px solid var(--vscode-panel-border, #2a2a2a); vertical-align: top; }

    /* ---- CTAs ---- */
    .cta-row { display: flex; gap: 8px; margin-top: 20px; flex-wrap: wrap; }
    .btn {
      padding: 6px 14px;
      font-size: 12px;
      cursor: pointer;
      border-radius: 3px;
      border: 1px solid var(--vscode-button-border, transparent);
      font-family: inherit;
    }
    .btn-primary {
      background: var(--vscode-button-background, #0e639c);
      color: var(--vscode-button-foreground, #ffffff);
    }
    .btn-primary:hover { background: var(--vscode-button-hoverBackground, #1177bb); }
    .btn-secondary {
      background: transparent;
      color: var(--vscode-foreground, #cccccc);
      border-color: var(--vscode-panel-border, #444444);
    }
    .btn-secondary:hover { background: var(--vscode-list-hoverBackground, #2a2d2e); }
  </style>
</head>
<body>
  <h1>workspace analysis</h1>
  <div id="root"></div>
  <div class="privacy-line" id="privacy-line">
    no code content read &mdash; metadata only
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    // Notify extension that webview is ready
    vscode.postMessage({ type: 'ready' });

    function render(state) {
      const root = document.getElementById('root');
      if (!root) return;

      if (state.phase === 'setup') {
        root.innerHTML = renderSetup(state.steps);
      } else if (state.phase === 'scanning') {
        root.innerHTML = renderScanning(state.progress, state.earlyFindings);
      } else if (state.phase === 'complete') {
        root.innerHTML = renderComplete(state.profile);
      }
    }

    function stepIcon(status) {
      if (status === 'complete') return '<span style="color:#4ADE80">✓</span>';
      if (status === 'active')   return '<span style="color:#FACC15">◌</span>';
      if (status === 'failed')   return '<span style="color:#EF4444">✗</span>';
      return '<span style="color:#555555">◌</span>';
    }

    function renderSetup(steps) {
      const items = steps.map(s => \`
        <li class="step-item">
          <span class="step-icon">\${stepIcon(s.status)}</span>
          <div>
            <div>\${esc(s.label)}</div>
            \${s.detail ? '<div class="step-detail">' + esc(s.detail) + '</div>' : ''}
          </div>
        </li>\`).join('');
      return '<ul class="step-list">' + items + '</ul>';
    }

    function renderScanning(progress, findings) {
      const findingItems = findings.map(f => \`
        <li class="finding-item">
          <span class="finding-icon">\${f.type === 'warning' ? '⚠' : '⚡'}</span>
          <span>\${esc(f.text)}</span>
        </li>\`).join('');

      return \`
        <div class="progress-group">
          <div class="progress-label"><span>commit history</span><span>\${progress.commitProgress}%</span></div>
          <div class="progress-bar-bg"><div class="progress-bar-fill" style="width:\${progress.commitProgress}%"></div></div>
        </div>
        <div class="progress-group">
          <div class="progress-label"><span>reflog entries</span><span>\${progress.reflogProgress}%</span></div>
          <div class="progress-bar-bg"><div class="progress-bar-fill" style="width:\${progress.reflogProgress}%"></div></div>
        </div>
        <div class="stage-label">\${esc(progress.stage)}</div>
        \${findings.length > 0 ? '<h2>early findings</h2><ul class="findings-list">' + findingItems + '</ul>' : ''}
      \`;
    }

    function scoreColor(score) {
      if (score <= 30) return '#4ADE80';
      if (score <= 60) return '#FACC15';
      if (score <= 80) return '#FB923C';
      return '#EF4444';
    }

    function renderDimension(name, score) {
      const color = scoreColor(score);
      return \`
        <div class="dimension-row">
          <div class="dimension-header">
            <span class="dimension-name">\${esc(name)}</span>
            <span class="dimension-score" style="color:\${color}">\${score}</span>
          </div>
          <div class="progress-bar-bg">
            <div class="progress-bar-fill" style="width:\${score}%;background:\${color}"></div>
          </div>
        </div>\`;
    }

    function renderComplete(profile) {
      const dims = profile.dimensions;
      const insightRows = profile.insights.map(i => {
        const icon = i.type === 'locked' ? '🔒 ' : '';
        const action = i.type === 'locked' ? 'connect account to access' : esc(i.action);
        return \`<tr><td>\${icon}\${esc(i.finding)}</td><td>\${action}</td></tr>\`;
      }).join('');

      return \`
        \${renderDimension('recovery risk', dims.recoveryRisk)}
        \${renderDimension('change volatility', dims.changeVolatility)}
        \${renderDimension('workflow fragility', dims.workflowFragility)}
        <h2>insights</h2>
        <table class="insight-table">
          <thead><tr><th>what we found</th><th>what to do</th></tr></thead>
          <tbody>\${insightRows}</tbody>
        </table>
        <div class="cta-row">
          <button class="btn btn-primary" onclick="connectAccount()">connect account</button>
          <button class="btn btn-secondary" onclick="dismiss()">dismiss</button>
        </div>
      \`;
    }

    function esc(str) {
      return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function connectAccount() { vscode.postMessage({ type: 'connect-account' }); }
    function dismiss() { vscode.postMessage({ type: 'dismiss' }); }

    // Receive state updates from extension
    window.addEventListener('message', event => {
      const msg = event.data;
      if (msg.type === 'state-update') {
        render(msg.state);
      }
    });
  </script>
</body>
</html>`;
	}
}
