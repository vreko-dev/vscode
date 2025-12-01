import * as vscode from "vscode";

export class WelcomeView
	implements vscode.WebviewViewProvider, vscode.Disposable
{
	public static readonly viewType = "snapback.welcome";
	private readonly _disposables: vscode.Disposable[] = [];
	// private _view?: vscode.WebviewView;

	constructor(private readonly _extensionUri: vscode.Uri) {}

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		_context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	) {
		// this._view = webviewView;

		webviewView.webview.options = {
			// Allow scripts in the webview
			enableScripts: true,
			localResourceRoots: [this._extensionUri],
		};

		webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

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
				}
			},
		);
		this._disposables.push(messageDisposable);
	}

	public dispose(): void {
		while (this._disposables.length) {
			const disposable = this._disposables.pop();
			if (disposable) {
				disposable.dispose();
			}
		}
	}

	private _getHtmlForWebview(webview: vscode.Webview) {
		// Get the local path to main script run in the webview, then convert it to a uri we can use in the webview.
		// t; // @ts-expect-error - Reserved for future use

		// Do the same for the stylesheet.
		const styleResetUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this._extensionUri, "media", "reset.css"),
		);
		const styleVSCodeUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this._extensionUri, "media", "vscode.css"),
		);
		const styleMainUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this._extensionUri, "media", "welcome.css"),
		);

		// Use a nonce to only allow a specific script to be run.
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
            </head>
            <body>
                <div class="welcome-container">
                    <div class="header">
                        <div class="logo">\u{1f6e1}</div>
                        <h1>SnapBack</h1>
                        <p>Protect your code from unintended changes</p>

                        <div class="actions">
                            <button id="initialize-btn" class="primary">\u{1f7e2} Initialize SnapBack</button>
                            <button id="protect-repo-btn" class="primary">\u{1f6e1} Protect Entire Repository</button>
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
                                <li>\u{1f7e2} <strong>Watched</strong>: Silent auto-snapshot on save</li>
                                <li>\u{1f7e1} <strong>Warning</strong>: Notify before save with options</li>
                                <li>\u{1f6d1} <strong>Protected</strong>: Require snapshot or explicit override</li>
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
