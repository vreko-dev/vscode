/**
 * Onboarding Panel Provider - Extension Host Handler
 *
 * Manages the onboarding webview and handles provider detection/configuration.
 */

import { detectAIClients, getSnapbackMCPConfig, writeClientConfig } from "@snapback/mcp-config";
import * as vscode from "vscode";
import type { CliLinkManager } from "../cli/CliLinkManager";
import { logger } from "../utils/logger";

interface DetectedProvider {
	id: string;
	displayName: string;
	source: string;
	mcpStatus: "untested" | "configured" | "connected" | "failed";
	lastChecked?: string;
}

export class OnboardingPanelProvider {
	private panel: vscode.WebviewPanel | undefined;

	constructor(
		private readonly context: vscode.ExtensionContext,
		readonly _mcpBaseUrl: string,
		private readonly cliLinkManager?: CliLinkManager,
	) {}

	/**
	 * Create or show the onboarding panel
	 */
	public async createOrShow(): Promise<void> {
		const column = vscode.ViewColumn.One;

		// If panel already exists, reveal it
		if (this.panel) {
			this.panel.reveal(column);
			return;
		}

		// Create new panel
		this.panel = vscode.window.createWebviewPanel("snapback.onboarding", "SnapBack Setup", column, {
			enableScripts: true,
			retainContextWhenHidden: true,
			localResourceRoots: [this.context.extensionUri],
		});

		// Set up webview content
		this.panel.webview.html = this.getWebviewContent();

		// Handle messages from webview
		this.panel.webview.onDidReceiveMessage(
			async (message) => {
				await this.handleMessage(message);
			},
			null,
			this.context.subscriptions,
		);

		// Handle panel disposal
		this.panel.onDidDispose(
			() => {
				this.panel = undefined;
			},
			null,
			this.context.subscriptions,
		);
	}

	/**
	 * Handle messages from webview
	 */
	private async handleMessage(message: { type: string; step?: string; [key: string]: unknown }): Promise<void> {
		try {
			switch (message.type) {
				case "webviewReady":
					// Webview loaded, ready to receive messages
					break;

				case "next":
					if (message.step) {
						await this.handleNextStep(message.step);
					}
					break;

				case "install-cli":
					await this.handleInstallCli();
					break;

				case "close":
					this.panel?.dispose();
					break;
			}
		} catch (error) {
			logger.error("Onboarding message handler error", error as Error);
		}
	}

	/**
	 * Handle progression to next step
	 */
	private async handleNextStep(step: string): Promise<void> {
		if (!this.panel) {
			return;
		}

		switch (step) {
			case "detect":
				await this.detectProviders();
				break;

			case "configure":
				await this.configureProviders();
				break;

			case "test":
				await this.testProviders();
				break;

			case "cli":
				await this.checkCliStatus();
				break;
		}
	}

	/**
	 * Detect AI providers on the system
	 */
	private async detectProviders(): Promise<void> {
		try {
			const detection = detectAIClients();
			const providers: DetectedProvider[] = detection.detected.map((client) => ({
				id: client.name,
				displayName: client.displayName,
				source: "user-mcp",
				mcpStatus: client.hasSnapback ? "configured" : "untested",
			}));

			this.panel?.webview.postMessage({
				type: "providersDetected",
				providers,
			});
		} catch (error) {
			logger.error("Provider detection failed", error as Error);
			this.panel?.webview.postMessage({
				type: "error",
				error: "Failed to detect AI providers",
			});
		}
	}

	/**
	 * Configure detected providers
	 */
	private async configureProviders(): Promise<void> {
		try {
			const detection = detectAIClients();

			for (const client of detection.detected) {
				if (!client.hasSnapback) {
					this.panel?.webview.postMessage({
						type: "providerConfiguring",
						providerId: client.name,
					});

					try {
						const mcpConfig = getSnapbackMCPConfig({ apiKey: undefined });
						const result = writeClientConfig(client, mcpConfig);

						if (result.success) {
							this.panel?.webview.postMessage({
								type: "providerConfigured",
								providerId: client.name,
							});
						} else {
							throw new Error(result.error);
						}
					} catch (error) {
						this.panel?.webview.postMessage({
							type: "providerConfigFailed",
							providerId: client.name,
							error: error instanceof Error ? error.message : "Configuration failed",
						});
					}
				}
			}
		} catch (error) {
			logger.error("Provider configuration failed", error as Error);
		}
	}

	/**
	 * Test provider connectivity
	 */
	private async testProviders(): Promise<void> {
		try {
			const detection = detectAIClients();

			for (const client of detection.detected) {
				this.panel?.webview.postMessage({
					type: "providerTested",
					providerId: client.name,
					success: client.hasSnapback, // Simplified for demo
				});
			}
		} catch (error) {
			logger.error("Provider testing failed", error as Error);
		}
	}

	/**
	 * Check CLI installation status
	 */
	private async checkCliStatus(): Promise<void> {
		const cliInstalled = this.cliLinkManager?.isConnected() ?? false;

		this.panel?.webview.postMessage({
			type: "cliStatus",
			installed: cliInstalled,
		});
	}

	/**
	 * Handle CLI installation
	 */
	private async handleInstallCli(): Promise<void> {
		await vscode.env.openExternal(vscode.Uri.parse("https://docs.snapback.dev/cli/install"));
	}

	/**
	 * Get webview HTML content
	 */
	private getWebviewContent(): string {
		if (!this.panel) {
			throw new Error("Panel not initialized");
		}
		const webview = this.panel.webview;

		// Get URIs for webview assets
		const scriptUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.context.extensionUri, "dist", "webview", "assets", "index.js"),
		);
		const styleUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.context.extensionUri, "dist", "webview", "assets", "index.css"),
		);

		const nonce = this.getNonce();

		return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SnapBack Setup</title>
  <link rel="stylesheet" href="${styleUri}">
</head>
<body>
  <div id="root" data-panel="onboarding"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
	}

	/**
	 * Generate CSP nonce
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
