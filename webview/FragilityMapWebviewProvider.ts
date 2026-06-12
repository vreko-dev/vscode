/**
 * Fragility Map Webview Provider
 *
 * Renders the Visual Living Fragility Map as a VS Code webview panel.
 * Shows all fragile files with scores, sorted descending, with a
 * "Last updated" footer and empty-state handling.
 *
 * Architecture:
 * - Thin renderer  -  data comes from daemon via DaemonBridge.getBaseline()
 * - Matches the IPC pattern used by CockpitTreeProvider exactly
 * - Plain HTML template string (no React, no bundler)
 *
 * @see Phase 1  -  LFM Visual Rendering
 * @module webview/FragilityMapWebviewProvider
 */

import type * as vscode from "vscode";
import type { DaemonBridge } from "../services/DaemonBridge";
import { logger } from "../utils/logger";

// =============================================================================
// Types
// =============================================================================

interface FragileFileEntry {
	path: string;
	compositeScore: number;
	rank: number;
}

interface FragilityMapState {
	files: FragileFileEntry[];
	lastUpdatedAt: number | null;
	loading: boolean;
}

// =============================================================================
// Provider
// =============================================================================

export class FragilityMapWebviewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = "vreko.fragilityMap";

	private _view?: vscode.WebviewView;
	private readonly _disposables: vscode.Disposable[] = [];
	private _state: FragilityMapState = {
		files: [],
		lastUpdatedAt: null,
		loading: false,
	};

	constructor(
		private readonly _extensionUri: vscode.Uri,
		private readonly _daemonBridge: DaemonBridge | null,
		private readonly _workspaceRoot: string | null,
	) {}

	// ===========================================================================
	// WebviewViewProvider
	// ===========================================================================

	resolveWebviewView(
		webviewView: vscode.WebviewView,
		_context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	): void {
		this._view = webviewView;

		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this._extensionUri],
		};

		webviewView.webview.html = this._getHtml(webviewView.webview);

		webviewView.webview.onDidReceiveMessage(
			(message: { type: string }) => this._handleMessage(message),
			null,
			this._disposables,
		);

		webviewView.onDidDispose(
			() => {
				this._view = undefined;
				this._disposeListeners();
			},
			null,
			this._disposables,
		);

		// Load data immediately when view opens
		this._loadData();
	}

	// ===========================================================================
	// Public API
	// ===========================================================================

	public refresh(): void {
		this._loadData();
	}

	public dispose(): void {
		this._disposeListeners();
	}

	// ===========================================================================
	// Private
	// ===========================================================================

	private async _loadData(): Promise<void> {
		if (!this._daemonBridge || !this._workspaceRoot) {
			this._postState();
			return;
		}

		this._state = { ...this._state, loading: true };
		this._postState();

		try {
			const baseline = await this._daemonBridge.getBaseline(this._workspaceRoot);
			if (baseline?.fragileFiles) {
				const files = [...baseline.fragileFiles].sort((a, b) => b.compositeScore - a.compositeScore);
				this._state = {
					files,
					lastUpdatedAt: Date.now(),
					loading: false,
				};
			} else {
				this._state = {
					files: [],
					lastUpdatedAt: Date.now(),
					loading: false,
				};
			}
		} catch (err) {
			logger.error("FragilityMapWebviewProvider: failed to load baseline", { err });
			this._state = { files: [], lastUpdatedAt: null, loading: false };
		}

		this._postState();
	}

	private _postState(): void {
		if (!this._view) {
			return;
		}
		this._view.webview
			.postMessage({ type: "state-update", state: this._state })
			.then(undefined, (err) => logger.error("FragilityMapWebviewProvider: failed to post state", { err }));
	}

	private _handleMessage(message: { type: string }): void {
		if (message.type === "ready") {
			this._postState();
		} else if (message.type === "refresh") {
			this._loadData();
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
  <title>Vreko  -  Fragility Map</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: var(--vscode-font-family, 'Menlo', 'Consolas', monospace);
      font-size: 12px;
      color: var(--vscode-foreground, #cccccc);
      background: var(--vscode-sideBar-background, #1e1e1e);
      padding: 8px;
      overflow-y: auto;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
      padding-bottom: 6px;
      border-bottom: 1px solid var(--vscode-panel-border, #333333);
    }

    .title {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--vscode-foreground, #cccccc);
    }

    .refresh-btn {
      background: none;
      border: none;
      cursor: pointer;
      color: var(--vscode-descriptionForeground, #888888);
      font-size: 11px;
      padding: 2px 4px;
      border-radius: 2px;
      font-family: inherit;
    }

    .refresh-btn:hover {
      background: var(--vscode-list-hoverBackground, #2a2d2e);
      color: var(--vscode-foreground, #cccccc);
    }

    .file-row {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 0;
      border-bottom: 1px solid var(--vscode-panel-border, #2a2a2a);
    }

    .file-row:last-child {
      border-bottom: none;
    }

    .score-badge {
      flex-shrink: 0;
      width: 32px;
      text-align: right;
      font-size: 11px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }

    .score-bar-bg {
      flex-shrink: 0;
      width: 40px;
      height: 4px;
      background: var(--vscode-panel-border, #333333);
      border-radius: 2px;
      overflow: hidden;
    }

    .score-bar-fill {
      height: 100%;
      border-radius: 2px;
    }

    .file-path {
      flex: 1;
      font-size: 11px;
      color: var(--vscode-foreground, #cccccc);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      direction: rtl;
      text-align: left;
    }

    .empty-state {
      padding: 16px 8px;
      text-align: center;
      color: var(--vscode-descriptionForeground, #888888);
      font-size: 11px;
      font-style: italic;
    }

    .loading {
      padding: 12px 8px;
      text-align: center;
      color: var(--vscode-descriptionForeground, #888888);
      font-size: 11px;
    }

    .footer {
      margin-top: 8px;
      padding-top: 6px;
      border-top: 1px solid var(--vscode-panel-border, #333333);
      font-size: 10px;
      color: var(--vscode-descriptionForeground, #666666);
    }
  </style>
</head>
<body>
  <div class="header">
    <span class="title">fragility map</span>
    <button class="refresh-btn" onclick="requestRefresh()">↻</button>
  </div>
  <div id="root"></div>
  <div id="footer" class="footer"></div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    vscode.postMessage({ type: 'ready' });

    function scoreColor(score) {
      if (score <= 30) return '#4ADE80';
      if (score <= 60) return '#FACC15';
      if (score <= 80) return '#FB923C';
      return '#EF4444';
    }

    function esc(str) {
      return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function basename(p) {
      return p.replace(/.*[\\/]/, '');
    }

    function render(state) {
      const root = document.getElementById('root');
      const footer = document.getElementById('footer');
      if (!root || !footer) return;

      if (state.loading) {
        root.innerHTML = '<div class="loading">loading...</div>';
        footer.textContent = '';
        return;
      }

      if (!state.files || state.files.length === 0) {
        const msg = state.lastUpdatedAt
          ? 'No fragile files detected'
          : 'Connect to Vreko daemon to see fragility data. Run vr start in your terminal.';
        root.textContent = msg;
      } else {
        const rows = state.files.map(f => {
          const score = Math.round(f.compositeScore);
          const color = scoreColor(score);
          const name = basename(f.path);
          return \`
            <div class="file-row" title="\${esc(f.path)}">
              <span class="score-badge" style="color:\${color}">\${score}</span>
              <div class="score-bar-bg">
                <div class="score-bar-fill" style="width:\${score}%;background:\${color}"></div>
              </div>
              <span class="file-path">\${esc(name)}</span>
            </div>\`;
        }).join('');
        root.innerHTML = rows;
      }

      if (state.lastUpdatedAt) {
        const d = new Date(state.lastUpdatedAt);
        footer.textContent = 'Last updated: ' + d.toLocaleTimeString();
      } else {
        footer.textContent = '';
      }
    }

    function requestRefresh() {
      vscode.postMessage({ type: 'refresh' });
    }

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
