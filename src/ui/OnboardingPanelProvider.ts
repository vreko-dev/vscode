/**
 * Onboarding Panel Provider - Extension Host Handler
 *
 * Manages the onboarding webview and handles provider detection/configuration.
 */

import { detectAIClients, getSnapbackMCPConfig, writeClientConfig } from "@snapback/mcp-config";
import * as vscode from "vscode";
import type { CliLinkManager } from "../cli/CliLinkManager";
import { executeCLICommand } from "../utils/cli-execution";
import type { HostEnvironment } from "../utils/host-probe";
import { clearEnvironmentCache, probeHostEnvironment } from "../utils/host-probe";
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
	private cachedEnvironment: HostEnvironment | null = null;
	private cacheTimestamp = 0;
	private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

	constructor(
		private readonly context: vscode.ExtensionContext,
		readonly _mcpBaseUrl: string,
		private readonly cliLinkManager?: CliLinkManager,
	) {}

	/**
	 * Create or show the onboarding panel
	 */
	public async createOrShow(): Promise<void> {
		logger.info("[Onboarding] createOrShow called");
		const column = vscode.ViewColumn.One;

		// If panel already exists, reveal it
		if (this.panel) {
			logger.info("[Onboarding] Panel already exists, revealing");
			this.panel.reveal(column);
			return;
		}

		// Create new panel
		logger.info("[Onboarding] Creating new onboarding panel");
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
	private async handleMessage(message: { type: string; step?: string; payload?: unknown; [key: string]: unknown }): Promise<void> {
		logger.info("[Onboarding] Message received from webview", { type: message.type, step: message.step });
		try {
			switch (message.type) {
				case "webviewReady":
					// Webview loaded, ready to receive messages
					logger.info("[Onboarding] Webview ready");
					break;

				case "next":
					if (message.step) {
						logger.info("[Onboarding] Next step requested", { step: message.step });
						await this.handleNextStep(message.step);
					}
					break;

				case "install-cli":
					await this.handleInstallCli();
					break;

				case "host:getEnvironment":
					await this.handleGetEnvironment();
					break;

				case "host:probe":
					await this.handleProbeHost();
					break;

				case "cli:run":
					await this.handleRunCli(message.payload as { command: string; args?: string[] });
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
		logger.info("[Onboarding] Starting provider detection");
		try {
			// Pass workspace folder as cwd - process.cwd() in VS Code extensions returns
			// the VS Code installation directory, NOT the workspace folder
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
			logger.info("[Onboarding] Detecting AI providers", { workspaceFolder });
			const detection = detectAIClients({ cwd: workspaceFolder });
			logger.info("[Onboarding] Detection result", {
				totalClients: detection.clients.length,
				detectedCount: detection.detected.length,
				needsSetupCount: detection.needsSetup.length,
				detected: detection.detected.map((c) => ({ name: c.name, hasSnapback: c.hasSnapback })),
			});
			const providers: DetectedProvider[] = detection.detected.map((client) => ({
				id: client.name,
				displayName: client.displayName,
				source: "user-mcp",
				mcpStatus: client.hasSnapback ? "configured" : "untested",
			}));

			logger.info("[Onboarding] Sending providersDetected to webview", { count: providers.length });
			this.panel?.webview.postMessage({
				type: "providersDetected",
				providers,
			});
		} catch (error) {
			logger.error("[Onboarding] Provider detection failed", error as Error);
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
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
			const detection = detectAIClients({ cwd: workspaceFolder });

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
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
			const detection = detectAIClients({ cwd: workspaceFolder });

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
	 * Handle host environment request (use cache if available)
	 */
	private async handleGetEnvironment(): Promise<void> {
		if (!this.panel) return;

		// Check cache
		if (this.cachedEnvironment && Date.now() - this.cacheTimestamp < this.CACHE_TTL) {
			logger.info("[Onboarding] Returning cached environment");
			this.panel.webview.postMessage({
				type: "host:environment",
				payload: this.cachedEnvironment,
			});
			return;
		}

		// Otherwise probe
		await this.handleProbeHost();
	}

	/**
	 * Handle host environment probe (force re-probe, ignore cache)
	 */
	private async handleProbeHost(): Promise<void> {
		if (!this.panel) return;

		logger.info("[Onboarding] Probing host environment");

		// Notify webview that probing started
		this.panel.webview.postMessage({ type: "host:probing" });

		try {
			// Clear cache and force re-probe
			clearEnvironmentCache();
			const environment = await probeHostEnvironment(false);

			// Update cache
			this.cachedEnvironment = environment;
			this.cacheTimestamp = Date.now();

			// Send result to webview
			logger.info("[Onboarding] Probe complete", { strategy: environment.strategy });
			this.panel.webview.postMessage({
				type: "host:environment",
				payload: environment,
			});
		} catch (error) {
			logger.error("[Onboarding] Host probe failed", error as Error);
			this.panel.webview.postMessage({
				type: "cli:error",
				payload: {
					message: "Failed to probe host environment",
					code: "EXECUTION_FAILED",
				},
			});
		}
	}

	/**
	 * Handle CLI command execution
	 */
	private async handleRunCli(payload: { command: string; args?: string[] }): Promise<void> {
		if (!this.panel) return;

		// Check if environment has been probed
		if (!this.cachedEnvironment) {
			logger.warn("[Onboarding] CLI execution requested but environment not probed");
			this.panel.webview.postMessage({
				type: "cli:error",
				payload: {
					message: "Environment not probed yet. Please wait...",
					code: "NO_ENVIRONMENT",
				},
			});
			return;
		}

		// Check if runtime is available
		if (this.cachedEnvironment.strategy === "unavailable") {
			logger.warn("[Onboarding] CLI execution requested but no runtime available");
			this.panel.webview.postMessage({
				type: "cli:error",
				payload: {
					message: "Node.js or Bun required to execute CLI commands",
					code: "RUNTIME_UNAVAILABLE",
				},
			});
			return;
		}

		// Execute command
		const { command, args } = payload;
		logger.info("[Onboarding] Executing CLI command", { command, args });

		// Notify webview that command is running
		this.panel.webview.postMessage({
			type: "cli:running",
			payload: { command },
		});

		try {
			await executeCLICommand(command, this.cachedEnvironment, args);
			logger.info("[Onboarding] CLI command executed successfully");
		} catch (error) {
			logger.error("[Onboarding] CLI execution failed", error as Error);
			this.panel.webview.postMessage({
				type: "cli:error",
				payload: {
					message: (error as Error).message || "CLI execution failed",
					code: "EXECUTION_FAILED",
				},
			});
		}
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
