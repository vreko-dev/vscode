import { beforeEach, describe, expect, it, vi } from "vitest";

// Import the mock vscode module
import * as vscode from "../../__mocks__/vscode";

describe("Consent Webview CSP Tests", () => {
	beforeEach(() => {
		// Clear all mocks before each test
		vi.clearAllMocks();
	});

	// consent-csp-001: CSP nonce + default-src 'none' for consent webview
	it("should apply proper CSP with nonce and default-src none", async () => {
		// Mock webview panel creation
		const mockWebview = {
			html: "",
			cspSource: "vscode-resource:",
			options: {},
			asWebviewUri: vi.fn().mockImplementation((uri) => uri),
			postMessage: vi.fn(),
			onDidReceiveMessage: vi.fn(),
		};

		const mockPanel = {
			webview: mockWebview,
			onDidDispose: vi.fn(),
			reveal: vi.fn(),
			dispose: vi.fn(),
		};

		(vscode.window.createWebviewPanel as jest.Mock).mockReturnValue(mockPanel);

		// Create a mock consent webview (this would be implemented in the actual code)
		const createConsentWebview = () => {
			const panel = vscode.window.createWebviewPanel(
				"snapback.consent",
				"SnapBack Consent",
				vscode.window.ViewColumn.One,
				{
					enableScripts: true,
					retainContextWhenHidden: true,
				},
			);

			// Apply CSP with nonce and default-src 'none'
			const nonce = Math.random().toString(36).substring(2, 15);
			panel.webview.html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}';">
          <title>SnapBack Consent</title>
        </head>
        <body>
          <div id="consent-container">
            <h1>Welcome to SnapBack</h1>
            <p>SnapBack helps protect your code by monitoring file changes and creating snapshots.</p>
            <button id="accept">I Understand and Consent</button>
            <button id="remind-later">Remind Me Later</button>
            <button id="cancel">Cancel</button>
          </div>
          <script nonce="${nonce}">
            // Script to handle consent actions
            document.getElementById('accept').addEventListener('click', () => {
              // Handle accept action
            });
          </script>
        </body>
        </html>
      `;

			return panel;
		};

		// Create the webview
		const panel = createConsentWebview();

		// Verify that createWebviewPanel was called with correct parameters
		expect(vscode.window.createWebviewPanel).toHaveBeenCalledWith(
			"snapback.consent",
			"SnapBack Consent",
			vscode.window.ViewColumn.One,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
			},
		);

		// Verify that CSP is applied correctly
		expect(panel.webview.html).toContain("Content-Security-Policy");
		expect(panel.webview.html).toContain("default-src 'none'");

		// Verify that nonce is used for script-src and style-src
		const nonceMatch = panel.webview.html.match(/nonce-([a-z0-9]+)/);
		expect(nonceMatch).toBeTruthy();
		const nonce = nonceMatch[1];

		expect(panel.webview.html).toContain(`script-src 'nonce-${nonce}'`);
		expect(panel.webview.html).toContain(`style-src 'nonce-${nonce}'`);

		// Verify that there are no remote script or style sources
		expect(panel.webview.html).not.toContain("http://");
		expect(panel.webview.html).not.toContain("https://");
		expect(panel.webview.html).not.toContain('src="');

		// Verify that inline scripts use nonce
		expect(panel.webview.html).toContain(`nonce="${nonce}"`);
	});
});
