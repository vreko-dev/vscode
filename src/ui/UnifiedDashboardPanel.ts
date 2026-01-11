/**
 * UnifiedDashboardPanel - Consolidated Webview Panel
 *
 * Replaces:
 * - DashboardPanel (Home tab)
 * - VitalsDashboardPanel (Vitals tab)
 * - OnboardingPanelProvider (Setup tab)
 *
 * Single webview panel with tab navigation that loads the React bundle.
 * Uses WorkspaceDataService for all data aggregation.
 *
 * @packageDocumentation
 */

import { detectAIClients, getSnapbackMCPConfig, writeClientConfig } from "@snapback/mcp-config";
import * as vscode from "vscode";
import type { DaemonBridge, SnapshotCreatedEvent } from "../services/DaemonBridge";
import { type SnapshotCoordinator, WorkspaceDataService } from "../services/WorkspaceDataService";
import { logger } from "../utils/logger";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Valid dashboard tabs
 */
export type DashboardTab = "home" | "vitals" | "setup" | "activity";

/**
 * Messages from webview to extension
 */
interface WebviewMessage {
	type:
		| "webviewReady"
		| "createSnapshot"
		| "openSettings"
		| "refresh"
		| "restoreSnapshot"
		| "configureMCP"
		| "detectProviders"
		| "configureProvider"
		// Onboarding messages (from OnboardingPanel)
		| "next"
		| "install-cli"
		| "close";
	payload?: {
		snapshotId?: string;
		[key: string]: unknown;
	};
	step?: string; // For onboarding "next" messages
}

// =============================================================================
// UNIFIED DASHBOARD PANEL
// =============================================================================

/**
 * UnifiedDashboardPanel - Single consolidated webview for all dashboard functionality
 */
export class UnifiedDashboardPanel implements vscode.Disposable {
	/**
	 * View type identifier for the webview panel
	 */
	public static readonly viewType = "snapback.dashboard";

	/**
	 * Singleton instance
	 */
	private static instance: UnifiedDashboardPanel | undefined;

	/**
	 * Pending daemon bridge for future instances
	 */
	private static _pendingDaemonBridge?: DaemonBridge;

	/**
	 * The webview panel
	 */
	private readonly panel: vscode.WebviewPanel;

	/**
	 * Data service for aggregated workspace data
	 */
	private readonly dataService: WorkspaceDataService;

	/**
	 * Extension URI for resource loading
	 */
	private readonly extensionUri: vscode.Uri;

	/**
	 * Flag indicating webview is ready to receive messages
	 */
	private isWebviewReady = false;

	/**
	 * Disposables for cleanup
	 */
	private disposables: vscode.Disposable[] = [];

	/**
	 * Daemon event subscription
	 */
	private daemonEventDisposable?: vscode.Disposable;

	// ==========================================================================
	// STATIC METHODS
	// ==========================================================================

	/**
	 * Wire DaemonBridge to the singleton instance.
	 * Per ARCHITECTURE_REFACTOR_SPEC.md Phase 1: Wire DaemonBridge into UnifiedDashboardPanel.
	 *
	 * Call this during extension activation after DaemonBridge is initialized.
	 * If no instance exists yet, the bridge will be wired when dashboard is first opened.
	 *
	 * @param bridge - DaemonBridge instance from extension activation
	 */
	public static wireDaemonBridge(bridge: DaemonBridge): void {
		// Store for future instances
		UnifiedDashboardPanel._pendingDaemonBridge = bridge;

		// Wire to existing instance if present
		if (UnifiedDashboardPanel.instance) {
			UnifiedDashboardPanel.instance.setDaemonBridge(bridge);
		}
	}

	/**
	 * Create or show the unified dashboard panel
	 *
	 * @param extensionUri - Extension URI for resource loading
	 * @param coordinator - Snapshot coordinator for data access
	 * @param initialTab - Optional initial tab to display
	 * @returns The panel instance
	 */
	public static createOrShow(
		extensionUri: vscode.Uri,
		coordinator: SnapshotCoordinator,
		initialTab: DashboardTab = "home",
	): UnifiedDashboardPanel {
		// If panel exists, reveal and navigate
		if (UnifiedDashboardPanel.instance) {
			UnifiedDashboardPanel.instance.panel.reveal(vscode.ViewColumn.One);
			UnifiedDashboardPanel.instance.navigateTo(initialTab);
			return UnifiedDashboardPanel.instance;
		}

		// Create new panel
		const panel = vscode.window.createWebviewPanel(
			UnifiedDashboardPanel.viewType,
			"SnapBack Dashboard",
			vscode.ViewColumn.One,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: [extensionUri],
			},
		);

		// Get workspace info
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		const workspaceId = workspaceFolder?.name || "default";
		const workspacePath = workspaceFolder?.uri.fsPath || "/";

		// Create data service
		const dataService = WorkspaceDataService.for(workspaceId, workspacePath, coordinator);

		// Create instance
		UnifiedDashboardPanel.instance = new UnifiedDashboardPanel(panel, dataService, extensionUri, initialTab);

		return UnifiedDashboardPanel.instance;
	}

	/**
	 * Dispose all instances
	 */
	public static disposeAll(): void {
		UnifiedDashboardPanel.instance?.dispose();
		UnifiedDashboardPanel.instance = undefined;
	}

	// ==========================================================================
	// CONSTRUCTOR
	// ==========================================================================

	private constructor(
		panel: vscode.WebviewPanel,
		dataService: WorkspaceDataService,
		extensionUri: vscode.Uri,
		initialTab: DashboardTab,
	) {
		this.panel = panel;
		this.dataService = dataService;
		this.extensionUri = extensionUri;

		// Set up message handler FIRST (before setting HTML)
		this.panel.webview.onDidReceiveMessage(
			(message: WebviewMessage) => this.handleMessage(message),
			null,
			this.disposables,
		);

		// Set up panel dispose handler
		this.panel.onDidDispose(() => this.handlePanelDispose(), null, this.disposables);

		// Subscribe to data changes
		const dataSubscription = this.dataService.onDataChange(() => {
			if (this.isWebviewReady) {
				this.sendDataToWebview();
			}
		});
		this.disposables.push(dataSubscription);

		// Set HTML content (React loads and sends webviewReady)
		this.panel.webview.html = this.getHtmlContent(initialTab);

		// Wire pending daemon bridge if available
		if (UnifiedDashboardPanel._pendingDaemonBridge) {
			this.setDaemonBridge(UnifiedDashboardPanel._pendingDaemonBridge);
		}

		logger.debug("UnifiedDashboardPanel created", { initialTab });
	}

	// ==========================================================================
	// PUBLIC API
	// ==========================================================================

	/**
	 * Navigate to a specific tab
	 */
	public navigateTo(tab: DashboardTab): void {
		this.panel.webview.postMessage({ type: "navigate", tab });
	}

	/**
	 * Refresh the panel data
	 */
	public refresh(): void {
		if (this.isWebviewReady) {
			this.sendDataToWebview();
		}
	}

	/**
	 * Set the DaemonBridge for cross-surface coordination
	 *
	 * @param bridge - DaemonBridge instance
	 */
	public setDaemonBridge(bridge: DaemonBridge): void {
		// Clean up existing subscription
		this.daemonEventDisposable?.dispose();

		// Subscribe to snapshot created events from daemon
		this.daemonEventDisposable = bridge.onSnapshotCreated((event: SnapshotCreatedEvent) => {
			logger.debug("UnifiedDashboardPanel received snapshot created event from daemon", {
				snapshotId: event.snapshotId,
				source: event.source,
			});

			// Refresh dashboard data when snapshot is created from CLI/MCP
			if (this.isWebviewReady) {
				this.sendDataToWebview();
			}
		});

		this.disposables.push(this.daemonEventDisposable);
		logger.debug("UnifiedDashboardPanel wired to DaemonBridge");
	}

	/**
	 * Dispose the panel
	 */
	public dispose(): void {
		// Clear singleton reference
		if (UnifiedDashboardPanel.instance === this) {
			UnifiedDashboardPanel.instance = undefined;
		}

		// Dispose all subscriptions
		for (const disposable of this.disposables) {
			disposable.dispose();
		}
		this.disposables = [];

		// Dispose panel
		this.panel.dispose();

		logger.debug("UnifiedDashboardPanel disposed");
	}

	// ==========================================================================
	// MESSAGE HANDLING
	// ==========================================================================

	/**
	 * Handle messages from the webview
	 */
	private async handleMessage(message: WebviewMessage): Promise<void> {
		try {
			switch (message.type) {
				case "webviewReady":
					this.isWebviewReady = true;
					await this.sendDataToWebview();
					break;

				case "createSnapshot":
					await vscode.commands.executeCommand("snapback.createSnapshot");
					break;

				case "openSettings":
					await vscode.commands.executeCommand("workbench.action.openSettings", "@ext:snapback");
					break;

				case "refresh":
					await this.sendDataToWebview();
					break;

				case "restoreSnapshot":
					if (message.payload?.snapshotId) {
						await vscode.commands.executeCommand("snapback.restoreSnapshot", message.payload.snapshotId);
					}
					break;

				case "configureMCP":
					// Route to the actual MCP configure command
					await vscode.commands.executeCommand("snapback.mcp.configure");
					break;

				case "detectProviders":
					// Use internal detection method (more reliable than command)
					await this.detectProviders();
					break;

				case "configureProvider":
					// Use internal configuration method (more reliable than command)
					await this.configureProviders();
					break;

				// Onboarding messages (ported from OnboardingPanelProvider)
				case "next":
					if (message.step) {
						await this.handleOnboardingStep(message.step);
					}
					break;

				case "install-cli":
					await vscode.env.openExternal(vscode.Uri.parse("https://docs.snapback.dev/cli/install"));
					break;

				case "close":
					this.panel.dispose();
					break;

				default:
					// Unknown message type - ignore
					logger.debug("Unknown webview message type", { type: message.type });
					break;
			}
		} catch (error) {
			logger.error("Error handling webview message", error as Error);
			vscode.window.showErrorMessage(
				`Dashboard error: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	}

	/**
	 * Handle panel dispose event (user closed panel)
	 */
	private handlePanelDispose(): void {
		if (UnifiedDashboardPanel.instance === this) {
			UnifiedDashboardPanel.instance = undefined;
		}

		for (const disposable of this.disposables) {
			disposable.dispose();
		}
		this.disposables = [];

		logger.debug("UnifiedDashboardPanel panel disposed by user");
	}

	// ==========================================================================
	// ONBOARDING FLOW (ported from OnboardingPanelProvider)
	// ==========================================================================

	/**
	 * Handle onboarding step progression
	 */
	private async handleOnboardingStep(step: string): Promise<void> {
		logger.info("UnifiedDashboardPanel handling onboarding step", { step });

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

			default:
				logger.debug("Unknown onboarding step", { step });
				break;
		}
	}

	/**
	 * Detect AI providers on the system
	 */
	private async detectProviders(): Promise<void> {
		logger.info("UnifiedDashboardPanel starting provider detection");
		try {
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
			const detection = detectAIClients({ cwd: workspaceFolder });

			logger.info("UnifiedDashboardPanel detection result", {
				totalClients: detection.clients.length,
				detectedCount: detection.detected.length,
				needsSetupCount: detection.needsSetup.length,
			});

			const providers = detection.detected.map((client) => ({
				id: client.name,
				displayName: client.displayName,
				source: "user-mcp",
				mcpStatus: client.hasSnapback ? "configured" : "untested",
			}));

			await this.panel.webview.postMessage({
				type: "providersDetected",
				providers,
			});
		} catch (error) {
			logger.error("UnifiedDashboardPanel provider detection failed", error as Error);
			await this.panel.webview.postMessage({
				type: "error",
				error: "Failed to detect AI providers",
			});
		}
	}

	/**
	 * Configure detected providers with SnapBack MCP
	 */
	private async configureProviders(): Promise<void> {
		try {
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
			const detection = detectAIClients({ cwd: workspaceFolder });

			for (const client of detection.detected) {
				if (!client.hasSnapback) {
					await this.panel.webview.postMessage({
						type: "providerConfiguring",
						providerId: client.name,
					});

					try {
						const mcpConfig = getSnapbackMCPConfig({ apiKey: undefined });
						const result = writeClientConfig(client, mcpConfig);

						if (result.success) {
							await this.panel.webview.postMessage({
								type: "providerConfigured",
								providerId: client.name,
							});
						} else {
							throw new Error(result.error);
						}
					} catch (error) {
						await this.panel.webview.postMessage({
							type: "providerConfigFailed",
							providerId: client.name,
							error: error instanceof Error ? error.message : "Configuration failed",
						});
					}
				}
			}
		} catch (error) {
			logger.error("UnifiedDashboardPanel provider configuration failed", error as Error);
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
				await this.panel.webview.postMessage({
					type: "providerTested",
					providerId: client.name,
					success: client.hasSnapback,
				});
			}
		} catch (error) {
			logger.error("UnifiedDashboardPanel provider testing failed", error as Error);
		}
	}

	/**
	 * Check CLI installation status
	 */
	private async checkCliStatus(): Promise<void> {
		// TODO: Wire up CliLinkManager when available
		// For now, return false as CLI status check requires CliLinkManager
		await this.panel.webview.postMessage({
			type: "cliStatus",
			installed: false,
		});
	}

	// ==========================================================================
	// DATA FLOW
	// ==========================================================================

	/**
	 * Send data to the webview
	 */
	private async sendDataToWebview(): Promise<void> {
		try {
			const snapshot = await this.dataService.getSnapshot();

			await this.panel.webview.postMessage({
				type: "update",
				stats: snapshot.stats,
				activity: snapshot.activity,
				settings: snapshot.settings,
				vitals: snapshot.vitals,
				sessionHealth: snapshot.sessionHealth,
				recommendation: snapshot.recommendation,
				guidance: snapshot.guidance,
				learnings: snapshot.learnings,
				violations: snapshot.violations,
				patterns: snapshot.patterns,
			});
		} catch (error) {
			logger.error("Failed to send data to webview", error as Error);
			vscode.window.showErrorMessage(
				`Failed to load dashboard data: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	}

	// ==========================================================================
	// HTML GENERATION
	// ==========================================================================

	/**
	 * Generate HTML content for the webview
	 */
	private getHtmlContent(initialTab: DashboardTab): string {
		const webview = this.panel.webview;
		const nonce = this.getNonce();

		// Get URIs for resources (Vite outputs to dist/webview/assets/)
		const bundleUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.extensionUri, "dist", "webview", "assets", "index.js"),
		);
		const styleUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.extensionUri, "dist", "webview", "assets", "index.css"),
		);

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} https: data:; font-src ${webview.cspSource};">
	<title>SnapBack Dashboard</title>
	<style>
		html, body {
			margin: 0;
			padding: 0;
			height: 100%;
			width: 100%;
			overflow: hidden;
			background-color: var(--vscode-editor-background);
			color: var(--vscode-editor-foreground);
			font-family: var(--vscode-font-family);
			font-size: var(--vscode-font-size);
		}
		#root {
			height: 100%;
			width: 100%;
		}
		.loading {
			display: flex;
			align-items: center;
			justify-content: center;
			height: 100%;
			font-size: 14px;
			color: var(--vscode-descriptionForeground);
		}
	</style>
	<link rel="stylesheet" href="${styleUri}">
</head>
<body>
	<div id="root" data-panel="${initialTab}">
		<div class="loading">Loading SnapBack Dashboard...</div>
	</div>
	<script nonce="${nonce}" src="${bundleUri}"></script>
</body>
</html>`;
	}

	/**
	 * Generate a nonce for CSP
	 */
	private getNonce(): string {
		const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
		let nonce = "";
		for (let i = 0; i < 32; i++) {
			nonce += chars.charAt(Math.floor(Math.random() * chars.length));
		}
		return nonce;
	}
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create or show the unified dashboard panel
 */
export function createUnifiedDashboardPanel(
	extensionUri: vscode.Uri,
	coordinator: SnapshotCoordinator,
	initialTab: DashboardTab = "home",
): UnifiedDashboardPanel {
	return UnifiedDashboardPanel.createOrShow(extensionUri, coordinator, initialTab);
}
