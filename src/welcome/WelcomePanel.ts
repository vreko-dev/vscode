/**
 * @fileoverview Welcome Panel - Fallback onboarding for 3rd party IDEs
 *
 * This webview panel provides a welcome/onboarding experience for IDEs
 * that don't support VS Code's native walkthrough API (Cursor, Qoder, etc.)
 */

import * as vscode from "vscode";

export class WelcomePanel {
	public static readonly viewType = "snapback.welcomePanel";
	private static instance: WelcomePanel | undefined;

	private readonly panel: vscode.WebviewPanel;
	private disposables: vscode.Disposable[] = [];

	private constructor(panel: vscode.WebviewPanel, _extensionUri: vscode.Uri) {
		this.panel = panel;

		// Set HTML content
		this.panel.webview.html = this.getHtmlContent();

		// Handle messages from webview
		this.panel.webview.onDidReceiveMessage((message) => this.handleMessage(message), null, this.disposables);

		// Handle panel disposal
		this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
	}

	/**
	 * Create or reveal the welcome panel
	 */
	public static createOrShow(extensionUri: vscode.Uri): void {
		// Validate input
		if (!extensionUri) {
			vscode.window.showErrorMessage("Failed to open welcome panel: missing extension URI");
			return;
		}

		try {
			// If panel already exists, reveal it
			if (WelcomePanel.instance) {
				WelcomePanel.instance.panel.reveal(vscode.ViewColumn.One);
				return;
			}

			// Create new panel
			const panel = vscode.window.createWebviewPanel(
				WelcomePanel.viewType,
				"Welcome to SnapBack",
				vscode.ViewColumn.One,
				{
					enableScripts: true,
					retainContextWhenHidden: true,
					localResourceRoots: [extensionUri],
				},
			);

			WelcomePanel.instance = new WelcomePanel(panel, extensionUri);
		} catch (error) {
			vscode.window.showErrorMessage(
				`Failed to open welcome panel: ${error instanceof Error ? error.message : "unknown error"}`,
			);
		}
	}

	/**
	 * Kill the panel if it exists
	 */
	public static kill(): void {
		WelcomePanel.instance?.panel.dispose();
		WelcomePanel.instance = undefined;
	}

	/**
	 * Handle messages from the webview
	 */
	private handleMessage(message: unknown): void {
		if (!message || typeof message !== "object") {
			return;
		}

		const msg = message as { command?: string };

		switch (msg.command) {
			case "protectFile":
				// Use void to handle Thenable without .catch()
				void Promise.resolve(vscode.commands.executeCommand("snapback.protectFile")).catch(() => {
					// Silently handle command failure
				});
				break;

			case "openDocs":
				void Promise.resolve(vscode.env.openExternal(vscode.Uri.parse("https://docs.snapback.dev"))).catch(
					() => {
						// Silently handle failure
					},
				);
				break;

			case "dismiss":
				this.panel.dispose();
				break;

			default:
				// Unknown command - ignore
				break;
		}
	}

	/**
	 * Clean up resources
	 */
	private dispose(): void {
		WelcomePanel.instance = undefined;

		// Dispose all disposables
		while (this.disposables.length) {
			const disposable = this.disposables.pop();
			disposable?.dispose();
		}
	}

	/**
	 * Generate HTML content for the webview
	 */
	private getHtmlContent(): string {
		const nonce = this.getNonce();
		const cspSource = this.panel.webview.cspSource;

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Welcome to SnapBack</title>
	<style>
		body {
			font-family: var(--vscode-font-family);
			color: var(--vscode-foreground);
			background-color: var(--vscode-editor-background);
			padding: 20px;
			max-width: 600px;
			margin: 0 auto;
		}
		h1 {
			color: var(--vscode-textLink-foreground);
			margin-bottom: 10px;
		}
		.subtitle {
			color: var(--vscode-descriptionForeground);
			margin-bottom: 30px;
		}
		.levels {
			display: flex;
			flex-direction: column;
			gap: 15px;
			margin-bottom: 30px;
		}
		.level {
			padding: 15px;
			border-radius: 6px;
			border: 1px solid var(--vscode-panel-border);
			background: var(--vscode-editor-inactiveSelectionBackground);
		}
		.level-header {
			display: flex;
			align-items: center;
			gap: 10px;
			margin-bottom: 8px;
		}
		.level-icon {
			font-size: 20px;
		}
		.level-name {
			font-weight: bold;
		}
		.level-desc {
			color: var(--vscode-descriptionForeground);
			font-size: 13px;
		}
		.watch { border-left: 3px solid #4caf50; }
		.warn { border-left: 3px solid #ff9800; }
		.block { border-left: 3px solid #f44336; }
		.actions {
			display: flex;
			gap: 10px;
			flex-wrap: wrap;
		}
		button {
			padding: 10px 20px;
			border: none;
			border-radius: 4px;
			cursor: pointer;
			font-size: 14px;
		}
		.primary {
			background: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
		}
		.primary:hover {
			background: var(--vscode-button-hoverBackground);
		}
		.secondary {
			background: var(--vscode-button-secondaryBackground);
			color: var(--vscode-button-secondaryForeground);
		}
		.secondary:hover {
			background: var(--vscode-button-secondaryHoverBackground);
		}
		.link-btn {
			background: transparent;
			color: var(--vscode-textLink-foreground);
			text-decoration: underline;
		}
	</style>
</head>
<body>
	<h1>🛡️ Welcome to SnapBack</h1>
	<p class="subtitle">Protect your code with intelligent snapshots. Choose your protection level:</p>

	<div class="levels">
		<div class="level watch">
			<div class="level-header">
				<span class="level-icon">🟢</span>
				<span class="level-name">Watch</span>
			</div>
			<p class="level-desc">Silent auto-snapshotting. No interruptions, automatic safety net.</p>
		</div>

		<div class="level warn">
			<div class="level-header">
				<span class="level-icon">🟡</span>
				<span class="level-name">Warn</span>
			</div>
			<p class="level-desc">Confirm before saving. Add optional notes to track changes.</p>
		</div>

		<div class="level block">
			<div class="level-header">
				<span class="level-icon">🔴</span>
				<span class="level-name">Block</span>
			</div>
			<p class="level-desc">Require a note before saving. Maximum protection for critical files.</p>
		</div>
	</div>

	<div class="actions">
		<button class="primary" id="protect-btn">Protect Your First File</button>
		<button class="secondary" id="docs-btn">Read Documentation</button>
		<button class="link-btn" id="dismiss-btn">Dismiss</button>
	</div>

	<script nonce="${nonce}">
		const vscode = acquireVsCodeApi();

		document.getElementById('protect-btn').addEventListener('click', () => {
			vscode.postMessage({ command: 'protectFile' });
		});

		document.getElementById('docs-btn').addEventListener('click', () => {
			vscode.postMessage({ command: 'openDocs' });
		});

		document.getElementById('dismiss-btn').addEventListener('click', () => {
			vscode.postMessage({ command: 'dismiss' });
		});
	</script>
</body>
</html>`;
	}

	/**
	 * Generate a nonce for CSP
	 */
	private getNonce(): string {
		let text = "";
		const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
		for (let i = 0; i < 32; i++) {
			text += possible.charAt(Math.floor(Math.random() * possible.length));
		}
		return text;
	}
}
