/**
 * VrekoLivePanel  -  opt-in, lazy-loaded webview panel for session state and live event feed.
 *
 * Opens ONLY via vreko.openLive command or status bar click  -  never automatically.
 * Singleton: calling createOrReveal when a panel exists reveals the existing panel.
 *
 * Architecture fence: No @vreko/intelligence runtime imports. All data via daemonBridge IPC.
 */

import * as vscode from "vscode";
import type { DaemonBridge } from "../services/DaemonBridge";
import { logger } from "../utils/logger";

const LOG_PREFIX = "[VrekoLivePanel]";
const MAX_EVENTS = 20;

export class VrekoLivePanel {
	static currentPanel: VrekoLivePanel | undefined;

	private readonly panel: vscode.WebviewPanel;
	private readonly eventBuffer: string[] = [];
	private readonly disposables: vscode.Disposable[] = [];

	static createOrReveal(extensionUri: vscode.Uri, daemonBridge: DaemonBridge | null): void {
		if (VrekoLivePanel.currentPanel) {
			VrekoLivePanel.currentPanel.panel.reveal(vscode.ViewColumn.Beside);
			return;
		}
		const panel = vscode.window.createWebviewPanel("vreko-live", "Vreko Live", vscode.ViewColumn.Beside, {
			enableScripts: true,
			retainContextWhenHidden: true,
		});
		VrekoLivePanel.currentPanel = new VrekoLivePanel(panel, extensionUri, daemonBridge);
	}

	private constructor(
		panel: vscode.WebviewPanel,
		_extensionUri: vscode.Uri,
		private readonly daemonBridge: DaemonBridge | null,
	) {
		this.panel = panel;
		this.panel.webview.html = this.buildHtml();

		void this.refreshContent();

		if (daemonBridge) {
			this.disposables.push(
				daemonBridge.onSessionStarted(() => {
					this.addEvent("session.started");
					void this.refreshContent();
				}),
				daemonBridge.onSessionEnded(() => {
					this.addEvent("session.ended");
				}),
				daemonBridge.onMcpToolCalled((e) => {
					this.addEvent(`mcp.tool-called: ${e.toolName}`);
				}),
				daemonBridge.onMcpFileModified((e) => {
					this.addEvent(`mcp.file-modified: ${e.filePath}`);
				}),
			);
		}

		this.panel.onDidDispose(
			() => {
				VrekoLivePanel.currentPanel = undefined;
				this.dispose();
			},
			null,
			this.disposables,
		);
	}

	private addEvent(line: string): void {
		const ts = new Date().toISOString().substring(11, 19);
		this.eventBuffer.unshift(`[${ts}] ${line}`);
		if (this.eventBuffer.length > MAX_EVENTS) {
			this.eventBuffer.pop();
		}
		void this.panel.webview.postMessage({ type: "events", data: this.eventBuffer });
	}

	private async refreshContent(): Promise<void> {
		try {
			const [session, intelligence] = await Promise.allSettled([
				this.daemonBridge?.request<unknown>("session/current", {}),
				this.daemonBridge?.request<{ files?: { path: string }[] }>("intelligence/fragile-files", {}),
			]);
			void this.panel.webview.postMessage({
				type: "state",
				session: session.status === "fulfilled" ? session.value : null,
				fragileFiles:
					intelligence.status === "fulfilled"
						? ((intelligence.value as { files?: { path: string }[] } | undefined)?.files ?? [])
						: [],
			});
		} catch (err) {
			logger.debug(`${LOG_PREFIX} refreshContent failed`, { err });
		}
	}

	private buildHtml(): string {
		return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<title>Vreko Live</title>
<style>
  body { font-family: var(--vscode-editor-font-family, monospace); font-size: var(--vscode-editor-font-size, 12px); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 12px; margin: 0; }
  h2 { font-size: 1em; color: var(--vscode-foreground); margin: 0 0 8px; border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 4px; }
  section { margin-bottom: 16px; }
  #session-info, #fragile-info { color: var(--vscode-descriptionForeground); font-size: 0.9em; }
  #events { list-style: none; margin: 0; padding: 0; font-size: 0.85em; }
  #events li { padding: 2px 0; color: var(--vscode-terminal-foreground, var(--vscode-foreground)); border-bottom: 1px solid var(--vscode-panel-border); }
  details summary { cursor: pointer; color: var(--vscode-descriptionForeground); font-size: 0.85em; }
  #platform { font-size: 0.85em; color: var(--vscode-descriptionForeground); margin-top: 4px; }
</style>
</head>
<body>
<section>
  <h2>Session</h2>
  <div id="session-info">Loading…</div>
</section>
<section>
  <h2>Live Events</h2>
  <ul id="events"><li>Waiting for events…</li></ul>
</section>
<section>
  <h2>Intelligence</h2>
  <div id="fragile-info">Loading…</div>
</section>
<section>
  <details>
    <summary>Platform Data</summary>
    <div id="platform">No data yet.</div>
  </details>
</section>
<script>
  function clearChildren(el) {
    while (el.firstChild) { el.removeChild(el.firstChild); }
  }
  window.addEventListener('message', function(event) {
    var msg = event.data;
    if (msg.type === 'events') {
      var list = document.getElementById('events');
      clearChildren(list);
      msg.data.forEach(function(line) {
        var li = document.createElement('li');
        li.textContent = line;
        list.appendChild(li);
      });
    } else if (msg.type === 'state') {
      var sessionEl = document.getElementById('session-info');
      var fragileEl = document.getElementById('fragile-info');
      var platformEl = document.getElementById('platform');
      clearChildren(sessionEl);
      clearChildren(fragileEl);
      clearChildren(platformEl);
      if (msg.session) {
        var idSpan = document.createElement('span');
        idSpan.textContent = 'ID: ' + (msg.session.sessionId || 'unknown');
        sessionEl.appendChild(idSpan);
        var wsSpan = document.createElement('span');
        wsSpan.textContent = 'Workspace: ' + (msg.session.workspacePath || 'unknown');
        platformEl.appendChild(wsSpan);
      } else {
        sessionEl.textContent = 'No active session.';
      }
      if (msg.fragileFiles && msg.fragileFiles.length > 0) {
        var countSpan = document.createElement('span');
        countSpan.textContent = msg.fragileFiles.length + ' fragile file(s)';
        fragileEl.appendChild(countSpan);
      } else {
        fragileEl.textContent = 'No fragile files detected.';
      }
    }
  });
</script>
</body>
</html>`;
	}

	dispose(): void {
		for (const d of this.disposables) {
			d.dispose();
		}
	}
}
