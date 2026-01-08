/**
 * DashboardPanel - Settings-first WebView panel with tabs
 *
 * Reference: EXTENSION_UX_SPEC.md#dashboard-webview
 *
 * TAB STRUCTURE:
 * - Home: Status overview, today's stats, token savings, quick actions
 * - Settings: AI integration, CLI tool, language packs, protection settings
 * - Activity: Session timeline, AI detection log (power users)
 *
 * DESIGN PRINCIPLES:
 * - Settings-first to guide new users
 * - Progressive disclosure based on user tier
 * - Frictionless UX with copy buttons and guided instructions
 *
 * @packageDocumentation
 */

import * as vscode from "vscode";
import { getMCPBridge } from "../bridges/MCPBridge";
import type { HeatTracker } from "../heat/HeatTracker";
import type { OperationCoordinator } from "../operationCoordinator";
import { logger } from "../utils/logger";
import { type DashboardDataService, getDashboardDataService } from "./DashboardDataService";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Dashboard tab identifiers
 */
type DashboardTab = "home" | "activity";

/**
 * User experience tier for progressive disclosure
 */
type UserTier = "explorer" | "intermediate" | "power";

/**
 * Dashboard stats for display
 */
interface DashboardStats {
	snapshotsToday: number;
	totalSnapshots: number;
	restoresToday: number;
	linesProtected: number;
	tokensSaved: number;
	restoresThisWeek: number;
	efficiencyPercentile: number;
}

// Reserved for future use:
// interface AIToolInfo { name: string; detected: boolean; sessions: number; accuracy: number; }
// interface ActivityTimelineEvent { id: string; type: "ai-edit" | "manual" | "auto" | "restore"; file: string; timestamp: number; aiTool?: string; }

/**
 * Messages from webview to extension
 * Supports both 'command' (legacy) and 'type' (React webview) formats
 */
interface DashboardMessage {
	command?:
		| "switchTab"
		| "installCLI"
		| "injectPrompt"
		| "configureMCP"
		| "showMCPStatus"
		| "diagnoseMCP"
		| "copyCommand"
		| "createSnapshot"
		| "openSettings"
		| "exportDebugInfo"
		| "refresh";
	type?: "webviewReady" | "configureMCP" | "createSnapshot" | "openSettings";
	data?: {
		tab?: DashboardTab;
		command?: string;
	};
}

// =============================================================================
// DASHBOARD PANEL
// =============================================================================

export class DashboardPanel implements vscode.Disposable {
	public static readonly viewType = "snapback.dashboard";
	private static instance: DashboardPanel | undefined;

	private readonly panel: vscode.WebviewPanel;
	private readonly coordinator: OperationCoordinator;
	private readonly dataService: DashboardDataService;
	private readonly extensionUri: vscode.Uri;
	private disposables: vscode.Disposable[] = [];
	private userTier: UserTier = "explorer";
	private currentTab: DashboardTab = "home";
	private activityData: unknown[] = [];
	/** Debounce timer to prevent event cascade loops */
	private dataRefreshTimer: NodeJS.Timeout | null = null;
	/** Flag to prevent re-entrant data loading */
	private isLoadingData = false;
	private stats: DashboardStats = {
		snapshotsToday: 0,
		totalSnapshots: 0,
		restoresToday: 0,
		linesProtected: 0,
		tokensSaved: 0,
		restoresThisWeek: 0,
		efficiencyPercentile: 0,
	};

	private constructor(
		panel: vscode.WebviewPanel,
		extensionUri: vscode.Uri,
		coordinator: OperationCoordinator,
		heatTracker?: HeatTracker,
	) {
		this.panel = panel;
		this.extensionUri = extensionUri;
		this.coordinator = coordinator;
		this.dataService = getDashboardDataService(coordinator, heatTracker);

		// Handle messages from webview FIRST (before loading data)
		this.panel.webview.onDidReceiveMessage(
			(msg) => {
				this.handleMessage(msg as DashboardMessage);
			},
			null,
			this.disposables,
		);

		// Handle panel disposal
		this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

		// Handle visibility changes - only refresh data, HTML is already set
		this.panel.onDidChangeViewState(
			() => {
				if (this.panel.visible) {
					this.scheduleDataRefresh();
				}
			},
			null,
			this.disposables,
		);

		// Listen for data changes - debounced to prevent event cascade
		this.disposables.push(
			this.dataService.onDataChange(() => {
				this.scheduleDataRefresh();
			}),
		);

		// Set initial HTML IMMEDIATELY to avoid black screen
		// The React webview will show a loading state until data arrives via postMessage
		this.panel.webview.html = this.getHtmlContent();

		// Load user tier FIRST, then load data (fixes race condition)
		void this.loadUserTier().then(() => {
			this.scheduleDataRefresh();
		});
	}

	/**
	 * Schedule a debounced data refresh to prevent event cascade loops.
	 * Multiple calls within 300ms will be coalesced into a single refresh.
	 */
	private scheduleDataRefresh(): void {
		// Clear any pending refresh
		if (this.dataRefreshTimer) {
			clearTimeout(this.dataRefreshTimer);
		}

		// Schedule debounced refresh
		this.dataRefreshTimer = setTimeout(() => {
			this.dataRefreshTimer = null;
			void this.refreshData();
		}, 300);
	}

	/**
	 * Actually refresh data with re-entry guard.
	 */
	private async refreshData(): Promise<void> {
		// Prevent re-entrant calls
		if (this.isLoadingData) {
			logger.debug("DashboardPanel: Skipping refresh - already loading");
			return;
		}

		this.isLoadingData = true;
		try {
			await this.loadAllData();
			this.sendDataToWebview();
		} finally {
			this.isLoadingData = false;
		}
	}

	/**
	 * Create or reveal the dashboard panel
	 */
	public static createOrShow(
		extensionUri: vscode.Uri,
		coordinator: OperationCoordinator,
		initialTab?: DashboardTab,
		heatTracker?: HeatTracker,
	): DashboardPanel {
		// If panel exists, reveal it
		if (DashboardPanel.instance) {
			DashboardPanel.instance.panel.reveal(vscode.ViewColumn.One);
			if (initialTab) {
				DashboardPanel.instance.switchTab(initialTab);
			}
			return DashboardPanel.instance;
		}

		// Create new panel
		const panel = vscode.window.createWebviewPanel(
			DashboardPanel.viewType,
			"SnapBack Dashboard",
			vscode.ViewColumn.One,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: [extensionUri],
			},
		);

		panel.iconPath = {
			light: vscode.Uri.joinPath(extensionUri, "resources", "icon-light.svg"),
			dark: vscode.Uri.joinPath(extensionUri, "resources", "icon-dark.svg"),
		};

		DashboardPanel.instance = new DashboardPanel(panel, extensionUri, coordinator, heatTracker);

		if (initialTab) {
			DashboardPanel.instance.switchTab(initialTab);
		}

		return DashboardPanel.instance;
	}

	/**
	 * Kill the panel if it exists
	 */
	public static kill(): void {
		DashboardPanel.instance?.panel.dispose();
		DashboardPanel.instance = undefined;
	}

	/**
	 * Load user tier based on snapshot history
	 */
	private async loadUserTier(): Promise<void> {
		try {
			const snapshots = await this.coordinator.listSnapshots();
			const count = snapshots.length;

			if (count >= 50) {
				this.userTier = "power";
			} else if (count >= 5) {
				this.userTier = "intermediate";
			} else {
				this.userTier = "explorer";
			}
		} catch {
			this.userTier = "explorer";
		}
	}

	/**
	 * Load all data for dashboard tabs
	 */
	private async loadAllData(): Promise<void> {
		try {
			// Load stats from data service
			const serviceStats = await this.dataService.getStats();
			this.stats = {
				snapshotsToday: serviceStats.snapshotsToday,
				totalSnapshots: serviceStats.totalSnapshots,
				restoresToday: serviceStats.restoresToday,
				linesProtected: serviceStats.linesProtected,
				tokensSaved: serviceStats.tokensSaved,
				restoresThisWeek: serviceStats.restoresThisWeek,
				efficiencyPercentile: serviceStats.efficiencyPercentile,
			};
		} catch (error) {
			logger.error("Failed to load dashboard data", error as Error);
		}
	}

	/**
	 * Switch to a different tab
	 */
	public switchTab(tab: DashboardTab): void {
		this.currentTab = tab;
		this.updateContent();
	}

	/**
	 * Handle messages from the webview
	 * Supports both 'command' (legacy) and 'type' (React webview) formats
	 */
	private async handleMessage(message: DashboardMessage): Promise<void> {
		// Handle React webview 'type' messages first
		if (message.type) {
			switch (message.type) {
				case "webviewReady":
					// React webview is ready, send initial data
					this.sendDataToWebview();
					return;
				case "configureMCP":
					await this.injectSystemPrompt();
					return;
				case "createSnapshot":
					await vscode.commands.executeCommand("snapback.createSnapshot");
					this.sendDataToWebview();
					return;
				case "openSettings":
					await vscode.commands.executeCommand("workbench.action.openSettings", "snapback");
					return;
			}
		}

		// Handle legacy 'command' messages
		switch (message.command) {
			case "switchTab":
				if (message.data?.tab) {
					this.switchTab(message.data.tab);
				}
				break;

			case "installCLI":
				vscode.env.openExternal(vscode.Uri.parse("https://snapback.dev/cli"));
				break;

			case "showMCPStatus":
				await vscode.commands.executeCommand("snapback.mcp.status");
				break;

			case "diagnoseMCP":
				await vscode.commands.executeCommand("snapback.mcp.diagnose");
				break;

			case "injectPrompt":
			case "configureMCP":
				await this.injectSystemPrompt();
				break;

			case "copyCommand":
				if (message.data?.command) {
					await vscode.env.clipboard.writeText(message.data.command);
					vscode.window.showInformationMessage("Command copied to clipboard");
				}
				break;

			case "createSnapshot":
				await vscode.commands.executeCommand("snapback.createSnapshot");
				this.updateContent();
				break;

			case "openSettings":
				await vscode.commands.executeCommand("workbench.action.openSettings", "snapback");
				break;

			case "exportDebugInfo":
				await this.exportDebugInfo();
				break;

			case "refresh":
				await this.loadStats();
				this.updateContent();
				break;
		}
	}

	/**
	 * Inject system prompt / Configure MCP for AI tools
	 */
	private async injectSystemPrompt(): Promise<void> {
		// Use MCP auto-configure command (detects Cursor, Claude Desktop, etc.)
		await vscode.commands.executeCommand("snapback.mcp.configure");
	}

	/**
	 * Export debug information
	 */
	private async exportDebugInfo(): Promise<void> {
		const debugInfo = {
			version: vscode.extensions.getExtension("MarcelleLabs.snapback-vscode")?.packageJSON.version,
			tier: this.userTier,
			stats: this.stats,
			timestamp: new Date().toISOString(),
		};

		const content = JSON.stringify(debugInfo, null, 2);
		const doc = await vscode.workspace.openTextDocument({
			content,
			language: "json",
		});
		await vscode.window.showTextDocument(doc);
	}

	/**
	 * Load stats from data service
	 */
	private async loadStats(): Promise<void> {
		await this.loadAllData();
	}

	/**
	 * Update the webview content
	 */
	private updateContent(): void {
		this.panel.webview.html = this.getHtmlContent();
		// Send data to React webview after a brief delay to ensure webview is ready
		setTimeout(() => {
			this.sendDataToWebview();
		}, 100);
	}

	/**
	 * Send dashboard data to React webview via postMessage
	 */
	private sendDataToWebview(): void {
		// Get MCP status
		const config = vscode.workspace.getConfiguration("snapback");
		const mcpEnabled = config.get<boolean>("mcp.enabled", true);
		const serverUrl = config.get<string>("mcp.serverUrl", "");

		let queuedItems = 0;
		let pushCount = 0;
		try {
			const workspaceId = vscode.workspace.workspaceFolders?.[0]?.uri.toString() ?? "default";
			const bridge = getMCPBridge(workspaceId);
			const status = bridge.getStatus();
			queuedItems = status.pendingObservations + status.pendingChanges;
			pushCount = status.pushCount;
		} catch {
			// MCPBridge not initialized
		}

		const message = {
			type: "update",
			dashboardStats: this.stats,
			mcpStatus: {
				enabled: mcpEnabled,
				serverUrl,
				queuedItems,
				pushCount,
			},
		};
		this.panel.webview.postMessage(message);
	}

	/**
	 * Generate the HTML content - now uses React webview
	 */
	private getHtmlContent(): string {
		const webview = this.panel.webview;
		const nonce = this.getNonce();

		// Get URIs for React webview bundle
		const scriptUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.extensionUri, "dist", "webview", "assets", "index.js"),
		);
		const styleUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.extensionUri, "dist", "webview", "assets", "index.css"),
		);

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'nonce-${nonce}';">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>SnapBack Dashboard</title>
	<link rel="stylesheet" href="${styleUri}">
</head>
<body>
	<div id="root" data-panel="home">Loading SnapBack Dashboard...</div>
	<script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
	}

	/**
	 * Generate nonce for CSP
	 */
	private getNonce(): string {
		let text = "";
		const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
		for (let i = 0; i < 32; i++) {
			text += chars.charAt(Math.floor(Math.random() * chars.length));
		}
		return text;
	}

	/**
	 * Cleanup resources
	 */
	dispose(): void {
		DashboardPanel.instance = undefined;

		// Clear any pending refresh timer
		if (this.dataRefreshTimer) {
			clearTimeout(this.dataRefreshTimer);
			this.dataRefreshTimer = null;
		}

		while (this.disposables.length) {
			const d = this.disposables.pop();
			d?.dispose();
		}
	}
}

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create and show the dashboard panel
 */
export function createDashboardPanel(
	extensionUri: vscode.Uri,
	coordinator: OperationCoordinator,
	initialTab?: DashboardTab,
	heatTracker?: HeatTracker,
): DashboardPanel {
	return DashboardPanel.createOrShow(extensionUri, coordinator, initialTab, heatTracker);
}
