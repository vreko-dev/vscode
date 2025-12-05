import * as vscode from "vscode";
import type { DiagnosticEventTracker } from "./telemetry/diagnostic-event-tracker.js";
import { SkipReasonTracker } from "./welcome/SkipReasonTracker.js";

export class WelcomeView
	implements vscode.WebviewViewProvider, vscode.Disposable
{
	public static readonly viewType = "snapback.welcome";
	private readonly _disposables: vscode.Disposable[] = [];
	private skipReasonTracker: SkipReasonTracker | null = null;

	constructor(
		private readonly _extensionUri: vscode.Uri,
		private readonly globalState: vscode.Memento,
		private readonly diagnosticTracker: DiagnosticEventTracker,
	) {}

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		_context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	) {
		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this._extensionUri],
		};

		webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

		// Initialize skip reason tracking
		this.skipReasonTracker = new SkipReasonTracker(
			this.globalState,
			this.diagnosticTracker,
		);
		this.skipReasonTracker.onPanelShown();

		const messageDisposable = webviewView.webview.onDidReceiveMessage(
			(data) => {
				switch (data.type) {
					case "initialize": {
						vscode.commands.executeCommand("snapback.initialize");
						break;
					}
					case "protectRepo": {
						vscode.commands.executeCommand("snapback.protectEntireRepo");
						break;
					}
					case "learnMore": {
						vscode.env.openExternal(vscode.Uri.parse("https://github.com"));
						break;
					}
					case "quickSkip": {
						this.skipReasonTracker?.onQuickSkip();
						this.dispose();
						break;
					}
					case "informedSkip": {
						this.skipReasonTracker?.onInformedSkip();
						this.dispose();
						break;
					}
					case "detailsExpanded": {
						this.skipReasonTracker?.onDetailsExpanded();
						break;
					}
					case "panelClosed": {
						this.skipReasonTracker?.onPanelClosed();
						break;
					}
				}
			},
		);
		this._disposables.push(messageDisposable);
	}

	public dispose(): void {
		if (this.skipReasonTracker) {
			this.skipReasonTracker.dispose();
		}

		while (this._disposables.length) {
			const disposable = this._disposables.pop();
			if (disposable) {
				disposable.dispose();
			}
		}
	}

	private _getHtmlForWebview(webview: vscode.Webview) {
		const styleResetUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this._extensionUri, "media", "reset.css"),
		);
		const styleVSCodeUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this._extensionUri, "media", "vscode.css"),
		);
		const styleMainUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this._extensionUri, "media", "welcome.css"),
		);

		const nonce = getNonce();

		return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link href="${styleResetUri}" rel="stylesheet">
                <link href="${styleVSCodeUri}" rel="stylesheet">
                <link href="${styleMainUri}" rel="stylesheet">
                <title>SnapBack Welcome</title>
                <style nonce="${nonce}">
                    .skip-section {
                        margin-top: 2rem;
                        padding-top: 2rem;
                        border-top: 1px solid var(--vscode-editorWidget-border);
                    }

                    .skip-section h2 {
                        margin-top: 0;
                    }

                    .skip-section p {
                        margin-bottom: 1rem;
                    }

                    #quick-skip-btn {
                        display: block;
                        width: 100%;
                        margin-bottom: 1rem;
                    }

                    .feature-comparison {
                        margin: 1rem 0;
                    }

                    .feature-comparison summary {
                        cursor: pointer;
                        padding: 0.5rem 0;
                        color: var(--vscode-textLink-foreground);
                        user-select: none;
                    }

                    .feature-comparison summary:hover {
                        text-decoration: underline;
                    }

                    .feature-matrix {
                        padding: 1rem;
                        background: var(--vscode-editor-background);
                        border-radius: 4px;
                        margin: 1rem 0;
                    }

                    .feature-group {
                        margin-bottom: 1.5rem;
                    }

                    .feature-group:last-child {
                        margin-bottom: 1rem;
                    }

                    .feature-group h3 {
                        margin: 0 0 0.5rem 0;
                        font-size: 0.95rem;
                        font-weight: 600;
                    }

                    .feature-group ul {
                        margin: 0;
                        padding-left: 1.5rem;
                        list-style: none;
                    }

                    .feature-group li {
                        margin-bottom: 0.4rem;
                        font-size: 0.9rem;
                        line-height: 1.4;
                    }

                    .feature-group.disabled {
                        opacity: 0.6;
                    }

                    .feature-group.disabled h3 {
                        color: var(--vscode-disabledForeground);
                    }

                    #informed-skip-btn {
                        display: block;
                        width: 100%;
                        margin-top: 1rem;
                    }

                    .secondary {
                        background: var(--vscode-button-secondaryBackground);
                        color: var(--vscode-button-secondaryForeground);
                    }

                    .secondary:hover {
                        background: var(--vscode-button-secondaryHoverBackground);
                    }
                </style>
            </head>
            <body>
                <div class="welcome-container">
                    <div class="header">
                        <div class="logo">🛡️</div>
                        <h1>SnapBack</h1>
                        <p>Protect your code from unintended changes</p>

                        <div class="actions">
                            <button id="initialize-btn" class="primary">🟢 Initialize SnapBack</button>
                            <button id="protect-repo-btn" class="primary">🛡️ Protect Entire Repository</button>
                        </div>
                    </div>

                    <div class="content">
                        <div class="section">
                            <h2>Get Started</h2>
                            <p>SnapBack protects your code by automatically creating snapshots and detecting potential risks.</p>
                            <button id="initialize-btn">Initialize Protection</button>
                        </div>

                        <div class="section highlight">
                            <h2>Protect Your Entire Repository</h2>
                            <p>Apply recommended protection levels to all critical files in your repository with one click.</p>
                            <button id="protect-repo-btn" class="primary">🛡️ Protect Entire Repository</button>
                            <p class="subtext">SnapBack will analyze your files and recommend appropriate protection levels</p>
                        </div>

                        <div class="section">
                            <h2>Protection Levels</h2>
                            <ul>
                                <li>🟢 <strong>Watched</strong>: Silent auto-snapshot on save</li>
                                <li>🟡 <strong>Warning</strong>: Notify before save with options</li>
                                <li>🛑 <strong>Protected</strong>: Require snapshot or explicit override</li>
                            </ul>
                        </div>

                        <div class="section">
                            <h2>Features</h2>
                            <ul>
                                <li>🔄 Git integration for branch protection</li>
                                <li>🧠 AI-powered threat detection</li>
                                <li>⏱️ Smart snapshot deduplication</li>
                                <li>📁 Bulk protection for entire repositories</li>
                            </ul>
                        </div>

                        <div class="section">
                            <h2>Learn More</h2>
                            <p>Check out our documentation to learn how to get the most out of SnapBack.</p>
                            <button id="learn-more-btn">Documentation</button>
                        </div>

                        <div class="section skip-section">
                            <h2>Getting Started</h2>
                            <p>Create an account to unlock cloud backup and cross-device sync, or start with local protection:</p>

                            <button id="quick-skip-btn" class="secondary">Skip for now</button>

                            <details id="feature-details" class="feature-comparison">
                                <summary>What do I get without signing in?</summary>
                                <div class="feature-matrix">
                                    <div class="feature-group">
                                        <h3>✓ Available Locally</h3>
                                        <ul>
                                            <li>🔄 Unlimited snapshots</li>
                                            <li>🛡️ All protection levels (watch, warn, blocked)</li>
                                            <li>🧠 AI-powered threat detection</li>
                                            <li>👁️ Watch mode for auto-snapshots on save</li>
                                        </ul>
                                    </div>

                                    <div class="feature-group disabled">
                                        <h3>✗ Requires Account</h3>
                                        <ul>
                                            <li>☁️ Cloud backup (recover snapshots online)</li>
                                            <li>🔗 Cross-device sync (snapshots across machines)</li>
                                            <li>👥 Team collaboration (share protected repos)</li>
                                            <li>📊 Advanced analytics (detailed funnel insights)</li>
                                        </ul>
                                    </div>
                                </div>

                                <button id="informed-skip-btn" class="primary">Continue without account</button>
                            </details>
                        </div>
                    </div>
                </div>

                <script nonce="${nonce}">
                    const vscode = acquireVsCodeApi();

                    document.getElementById('initialize-btn').addEventListener('click', () => {
                        vscode.postMessage({ type: 'initialize' });
                    });

                    document.getElementById('protect-repo-btn').addEventListener('click', () => {
                        vscode.postMessage({ type: 'protectRepo' });
                    });

                    document.getElementById('learn-more-btn').addEventListener('click', () => {
                        vscode.postMessage({ type: 'learnMore' });
                    });

                    // Skip flow tracking
                    document.getElementById('quick-skip-btn').addEventListener('click', () => {
                        vscode.postMessage({ type: 'quickSkip' });
                    });

                    document.getElementById('informed-skip-btn').addEventListener('click', () => {
                        vscode.postMessage({ type: 'informedSkip' });
                    });

                    // Track details expansion
                    const detailsElement = document.getElementById('feature-details');
                    if (detailsElement) {
                        detailsElement.addEventListener('toggle', (e) => {
                            if (e.target.open) {
                                vscode.postMessage({ type: 'detailsExpanded' });
                            }
                        });
                    }

                    // Track panel close
                    window.addEventListener('beforeunload', () => {
                        vscode.postMessage({ type: 'panelClosed' });
                    });
                </script>
            </body>
            </html>`;
	}
}

function getNonce() {
	let text = "";
	const possible =
		"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}
