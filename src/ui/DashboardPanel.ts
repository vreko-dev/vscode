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
import type { HeatTracker } from "../heat/HeatTracker";
import type { OperationCoordinator } from "../operationCoordinator";
import { logger } from "../utils/logger";
import { BRANDING } from "./branding";
import { type ActivityData, type DashboardDataService, getDashboardDataService } from "./DashboardDataService";

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
 */
interface DashboardMessage {
	command:
		| "switchTab"
		| "installCLI"
		| "injectPrompt"
		| "configureMCP"
		| "showMCPStatus"
		| "copyCommand"
		| "createSnapshot"
		| "openSettings"
		| "exportDebugInfo"
		| "refresh";
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

	private currentTab: DashboardTab = "home";
	private userTier: UserTier = "explorer";
	private stats: DashboardStats = {
		snapshotsToday: 0,
		totalSnapshots: 0,
		restoresToday: 0,
		linesProtected: 0,
		tokensSaved: 0,
		restoresThisWeek: 0,
		efficiencyPercentile: 0,
	};
	private activityData: ActivityData | null = null;

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
			(msg) => this.handleMessage(msg as DashboardMessage),
			null,
			this.disposables,
		);

		// Handle panel disposal
		this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

		// Handle visibility changes
		this.panel.onDidChangeViewState(
			() => {
				if (this.panel.visible) {
					void this.loadAllData().then(() => this.updateContent());
				}
			},
			null,
			this.disposables,
		);

		// Listen for data changes
		this.disposables.push(
			this.dataService.onDataChange(() => {
				void this.loadAllData().then(() => this.updateContent());
			}),
		);

		// Load user tier FIRST, then load data (fixes race condition)
		void this.loadUserTier().then(() => {
			void this.loadAllData().then(() => this.updateContent());
		});
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

			// Load activity data (only for intermediate+ users)
			if (this.userTier !== "explorer") {
				this.activityData = await this.dataService.getActivityData();
			}
		} catch (error) {
			logger.error("Failed to load dashboard data", error as Error);
		}
	}

	/**
	 * Switch to a different tab
	 */
	private switchTab(tab: DashboardTab): void {
		this.currentTab = tab;
		this.updateContent();
	}

	/**
	 * Handle messages from the webview
	 */
	private async handleMessage(message: DashboardMessage): Promise<void> {
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
	}

	/**
	 * Generate the HTML content
	 */
	private getHtmlContent(): string {
		const nonce = this.getNonce();
		const cspSource = this.panel.webview.cspSource;

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${cspSource};">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>SnapBack Dashboard</title>
	<style>${this.getStyles()}</style>
</head>
<body>
	<div class="dashboard">
		<!-- Tab Navigation -->
		<nav class="tabs">
			<button class="tab ${this.currentTab === "home" ? "active" : ""}" data-tab="home">
				${BRANDING.ui.home} Home
			</button>
			<button class="tab ${this.currentTab === "activity" ? "active" : ""}" data-tab="activity"
				${this.userTier === "explorer" ? 'style="opacity: 0.5"' : ""}>
				${BRANDING.ui.activity} Activity
			</button>
		</nav>

		<!-- Tab Content -->
		<div class="tab-content">
			${this.getTabContent()}
		</div>
	</div>

	<script nonce="${nonce}">${this.getScript()}</script>
</body>
</html>`;
	}

	/**
	 * Get content for the current tab
	 */
	private getTabContent(): string {
		switch (this.currentTab) {
			case "home":
				return this.getHomeTabContent();
			case "activity":
				return this.getActivityTabContent();
		}
	}

	/**
	 * Home tab content
	 */
	private getHomeTabContent(): string {
		const {
			snapshotsToday,
			totalSnapshots,
			restoresToday,
			linesProtected,
			tokensSaved,
			restoresThisWeek,
			efficiencyPercentile,
		} = this.stats;
		const logoUri = this.panel.webview.asWebviewUri(
			vscode.Uri.joinPath(this.extensionUri, "media", "snapback-logo.png"),
		);

		// Calculate token cost estimates
		const gpt4Cost = ((tokensSaved / 1000) * 0.03).toFixed(2);
		const gpt35Cost = ((tokensSaved / 1000) * 0.002).toFixed(2);

		return `
		<div class="home-tab">
			<!-- Status Card -->
			<div class="status-card protected">
				<div class="status-icon"><img src="${logoUri}" alt="SnapBack" /></div>
				<div class="status-text">
					<h2>Protected</h2>
					<p>${totalSnapshots} snapshot${totalSnapshots !== 1 ? "s" : ""} stored</p>
				</div>
			</div>

			<!-- Today's Stats -->
			<div class="stats-section">
				<h3>TODAY</h3>
				<div class="stats-row">
					<span>${BRANDING.ui.snapshot} ${snapshotsToday} snapshot${snapshotsToday !== 1 ? "s" : ""} today</span>
					<span>${BRANDING.ui.restore} ${restoresToday} restore${restoresToday !== 1 ? "s" : ""}</span>
					<span>${BRANDING.ui.protected} ${linesProtected.toLocaleString()} lines protected</span>
				</div>
			</div>

			<!-- Token Savings -->
			${
				restoresThisWeek > 0
					? `
			<div class="savings-section">
				<h3>TOKEN SAVINGS THIS WEEK</h3>
				<div class="savings-details">
					<p>${BRANDING.ui.restore} ${restoresThisWeek} restores - ~${tokensSaved.toLocaleString()} tokens saved</p>
					<p>${BRANDING.ui.money} Estimated: $${gpt4Cost} (GPT-4) / $${gpt35Cost} (3.5)</p>
					<p>${BRANDING.ui.growth} You're in top ${efficiencyPercentile}% efficiency</p>
				</div>
			</div>
			`
					: ""
			}

			<!-- Quick Actions -->
			<div class="actions-section">
				<h3>QUICK ACTIONS</h3>
				<div class="action-buttons">
					<button class="action-btn primary" id="configure-mcp-btn">
						${BRANDING.ui.inject} Configure MCP
					</button>
					<button class="action-btn" id="create-snapshot-btn">
						${BRANDING.ui.snapshot} Create Snapshot
					</button>
					<button class="action-btn" id="settings-btn">
						${BRANDING.ui.settings} VS Code Settings
					</button>
				</div>
			</div>
		</div>
		`;
	}

	/**
	 * Activity tab content (power users)
	 */
	private getActivityTabContent(): string {
		if (this.userTier === "explorer") {
			return `
			<div class="activity-tab empty">
				<p>Activity tracking becomes available after 5 snapshots.</p>
				<p>Keep using SnapBack to unlock this feature!</p>
			</div>
			`;
		}

		const activity = this.activityData;
		const todayEvents =
			activity?.timeline.filter((e) => {
				const todayStart = new Date().setHours(0, 0, 0, 0);
				return e.timestamp >= todayStart;
			}) || [];
		const yesterdayEvents =
			activity?.timeline.filter((e) => {
				const todayStart = new Date().setHours(0, 0, 0, 0);
				const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;
				return e.timestamp >= yesterdayStart && e.timestamp < todayStart;
			}) || [];
		const olderEvents =
			activity?.timeline.filter((e) => {
				const yesterdayStart = new Date().setHours(0, 0, 0, 0) - 24 * 60 * 60 * 1000;
				return e.timestamp < yesterdayStart;
			}) || [];

		// Format time ago
		const formatTimeAgo = (timestamp: number): string => {
			const diff = Date.now() - timestamp;
			const minutes = Math.floor(diff / 60000);
			const hours = Math.floor(diff / 3600000);
			const days = Math.floor(diff / 86400000);

			if (minutes < 60) {
				return `${minutes}m`;
			}
			if (hours < 24) {
				return `${hours}h ago`;
			}
			return `${days}d ago`;
		};

		// Get event icon
		const getEventIcon = (type: string): string => {
			switch (type) {
				case "ai-edit":
					return BRANDING.ui.aiEdit;
				case "manual-snapshot":
					return BRANDING.ui.manualSnapshot;
				case "auto-snapshot":
					return BRANDING.ui.autoSnapshot;
				case "restore":
					return BRANDING.ui.restore;
				default:
					return BRANDING.ui.snapshot ?? "📸";
			}
		};

		// Generate timeline items
		const renderTimelineItems = (events: typeof todayEvents): string => {
			if (events.length === 0) {
				return `<div class="timeline-item"><span class="event-text">No events</span></div>`;
			}
			return events
				.slice(0, 10)
				.map(
					(event) => `
				<div class="timeline-item">
					<span class="event-icon">${getEventIcon(event.type)}</span>
					<span class="event-text">${event.aiTool ? `${event.type === "ai-edit" ? "AI Edit" : event.type} (${event.aiTool})` : event.type} - ${event.file}</span>
					<span class="event-time">${formatTimeAgo(event.timestamp)}</span>
				</div>
			`,
				)
				.join("");
		};

		// Generate AI detection log rows
		const detectionLogHtml =
			(activity?.aiDetectionLog || [])
				.map(
					(entry) => `
			<tr>
				<td>${entry.tool}</td>
				<td>${entry.sessions}</td>
				<td>${entry.accuracy}%</td>
			</tr>
		`,
				)
				.join("") ||
			`
			<tr>
				<td colspan="3" style="text-align: center; color: var(--text-secondary);">No AI tools detected yet</td>
			</tr>
		`;

		return `
		<div class="activity-tab">
			<!-- Session Timeline -->
			<section class="activity-section">
				<h3>SESSION TIMELINE</h3>
				<div class="timeline">
					<div class="timeline-group">
						<button class="timeline-header expanded">
							<span class="arrow">▼</span> Today (${todayEvents.length} events)
						</button>
						<div class="timeline-items">
							${renderTimelineItems(todayEvents)}
						</div>
					</div>
					${
						yesterdayEvents.length > 0
							? `
					<div class="timeline-group">
						<button class="timeline-header">
							<span class="arrow">▶</span> Yesterday (${yesterdayEvents.length} events)
						</button>
						<div class="timeline-items" style="display: none;">
							${renderTimelineItems(yesterdayEvents)}
						</div>
					</div>
					`
							: ""
					}
					${
						olderEvents.length > 0
							? `
					<div class="timeline-group">
						<button class="timeline-header">
							<span class="arrow">▶</span> This Week (${olderEvents.length} events)
						</button>
						<div class="timeline-items" style="display: none;">
							${renderTimelineItems(olderEvents)}
						</div>
					</div>
					`
							: ""
					}
				</div>
			</section>

			<!-- AI Detection Log -->
			<section class="activity-section">
				<h3>AI DETECTION LOG</h3>
				<table class="detection-table">
					<thead>
						<tr>
							<th>Tool</th>
							<th>Sessions</th>
							<th>Accuracy</th>
						</tr>
					</thead>
					<tbody>
						${detectionLogHtml}
					</tbody>
				</table>
			</section>

			<!-- Export -->
			<button class="action-btn" id="export-btn">
				${BRANDING.ui.export} Export Debug Info
			</button>
		</div>
		`;
	}

	/**
	 * Get CSS styles
	 */
	private getStyles(): string {
		return `
		:root {
			--bg-primary: var(--vscode-editor-background);
			--bg-secondary: var(--vscode-sideBar-background);
			--text-primary: var(--vscode-foreground);
			--text-secondary: var(--vscode-descriptionForeground);
			--accent: var(--vscode-button-background);
			--accent-hover: var(--vscode-button-hoverBackground);
			--border: var(--vscode-panel-border);
			--success: #22c55e;
			--warning: #eab308;
			--error: #ef4444;
		}

		* {
			box-sizing: border-box;
			margin: 0;
			padding: 0;
		}

		body {
			font-family: var(--vscode-font-family);
			background: var(--bg-primary);
			color: var(--text-primary);
			padding: 16px;
		}

		.dashboard {
			max-width: 800px;
			margin: 0 auto;
		}

		/* Tabs */
		.tabs {
			display: flex;
			gap: 4px;
			border-bottom: 1px solid var(--border);
			margin-bottom: 20px;
		}

		.tab {
			background: none;
			border: none;
			padding: 12px 20px;
			color: var(--text-secondary);
			cursor: pointer;
			font-size: 14px;
			border-bottom: 2px solid transparent;
			transition: all 0.2s;
		}

		.tab:hover {
			color: var(--text-primary);
		}

		.tab.active {
			color: var(--text-primary);
			border-bottom-color: var(--accent);
		}

		/* Status Card */
		.status-card {
			display: flex;
			align-items: center;
			gap: 16px;
			padding: 24px;
			border-radius: 12px;
			background: var(--bg-secondary);
			margin-bottom: 24px;
		}

		.status-card.protected {
			border-left: 4px solid var(--success);
		}

		.status-icon {
			width: 48px;
			height: 48px;
		}
		.status-icon img {
			width: 100%;
			height: 100%;
			object-fit: contain;
		}

		.status-text h2 {
			font-size: 24px;
			margin-bottom: 4px;
		}

		.status-text p {
			color: var(--text-secondary);
		}

		/* Stats Section */
		.stats-section, .savings-section, .actions-section {
			margin-bottom: 24px;
		}

		.stats-section h3, .savings-section h3, .actions-section h3 {
			font-size: 12px;
			text-transform: uppercase;
			color: var(--text-secondary);
			margin-bottom: 12px;
			letter-spacing: 0.5px;
		}

		.stats-row {
			display: flex;
			gap: 24px;
			flex-wrap: wrap;
		}

		.stats-row span {
			display: flex;
			align-items: center;
			gap: 6px;
		}

		.savings-details p {
			margin: 8px 0;
			display: flex;
			align-items: center;
			gap: 8px;
		}

		/* Action Buttons */
		.action-buttons {
			display: flex;
			gap: 12px;
			flex-wrap: wrap;
		}

		.action-btn {
			padding: 10px 16px;
			border: 1px solid var(--border);
			border-radius: 6px;
			background: var(--bg-secondary);
			color: var(--text-primary);
			cursor: pointer;
			font-size: 13px;
			display: flex;
			align-items: center;
			gap: 6px;
			transition: all 0.2s;
		}

		.action-btn:hover {
			background: var(--accent);
			border-color: var(--accent);
		}

		.action-btn.primary {
			background: var(--accent);
			border-color: var(--accent);
		}

		/* Settings Tab */
		.settings-section {
			margin-bottom: 32px;
			padding-bottom: 24px;
			border-bottom: 1px solid var(--border);
		}

		.settings-section:last-child {
			border-bottom: none;
		}

		.settings-section h3 {
			font-size: 12px;
			text-transform: uppercase;
			color: var(--text-secondary);
			margin-bottom: 16px;
		}

		.setting-row {
			display: flex;
			align-items: center;
			gap: 12px;
			margin-bottom: 12px;
		}

		.setting-help {
			font-size: 12px;
			color: var(--text-secondary);
			margin-top: 8px;
		}

		.command-box {
			display: flex;
			align-items: center;
			gap: 8px;
			padding: 12px;
			background: var(--bg-secondary);
			border-radius: 6px;
			font-family: var(--vscode-editor-font-family);
		}

		.command-box code {
			flex: 1;
			font-size: 13px;
		}

		.copy-btn {
			padding: 6px 12px;
			border: none;
			border-radius: 4px;
			background: var(--accent);
			color: var(--text-primary);
			cursor: pointer;
			font-size: 12px;
		}

		.checkbox-list {
			display: flex;
			flex-direction: column;
			gap: 8px;
		}

		.checkbox-item {
			display: flex;
			align-items: center;
			gap: 8px;
			cursor: pointer;
		}

		.setting-select, .setting-input {
			padding: 8px 12px;
			border: 1px solid var(--border);
			border-radius: 4px;
			background: var(--bg-secondary);
			color: var(--text-primary);
			font-size: 13px;
		}

		/* Activity Tab */
		.activity-section {
			margin-bottom: 32px;
		}

		.activity-section h3 {
			font-size: 12px;
			text-transform: uppercase;
			color: var(--text-secondary);
			margin-bottom: 16px;
		}

		.timeline-group {
			margin-bottom: 4px;
		}

		.timeline-header {
			width: 100%;
			padding: 12px;
			border: none;
			background: var(--bg-secondary);
			color: var(--text-primary);
			cursor: pointer;
			text-align: left;
			font-size: 14px;
			border-radius: 4px;
			display: flex;
			align-items: center;
			gap: 8px;
		}

		.timeline-header .arrow {
			font-size: 10px;
		}

		.timeline-items {
			padding-left: 20px;
		}

		.timeline-item {
			display: flex;
			align-items: center;
			gap: 12px;
			padding: 10px 12px;
			border-left: 2px solid var(--border);
			margin-left: 6px;
		}

		.event-icon {
			width: 24px;
			text-align: center;
		}

		.event-text {
			flex: 1;
		}

		.event-time {
			color: var(--text-secondary);
			font-size: 12px;
		}

		.detection-table {
			width: 100%;
			border-collapse: collapse;
		}

		.detection-table th,
		.detection-table td {
			padding: 12px;
			text-align: left;
			border-bottom: 1px solid var(--border);
		}

		.detection-table th {
			font-size: 12px;
			text-transform: uppercase;
			color: var(--text-secondary);
		}

		.activity-tab.empty {
			text-align: center;
			padding: 48px;
			color: var(--text-secondary);
		}
		`;
	}

	/**
	 * Get JavaScript for interactivity
	 */
	private getScript(): string {
		return `
		const vscode = acquireVsCodeApi();

		// Tab switching
		document.querySelectorAll('.tab').forEach(tab => {
			tab.addEventListener('click', () => {
				const tabName = tab.dataset.tab;
				vscode.postMessage({ command: 'switchTab', data: { tab: tabName } });
			});
		});

		// Action buttons
		document.getElementById('configure-mcp-btn')?.addEventListener('click', () => {
			vscode.postMessage({ command: 'configureMCP' });
		});

		document.getElementById('create-snapshot-btn')?.addEventListener('click', () => {
			vscode.postMessage({ command: 'createSnapshot' });
		});

		document.getElementById('inject-btn')?.addEventListener('click', () => {
			vscode.postMessage({ command: 'injectPrompt' });
		});

		document.getElementById('auto-config-btn')?.addEventListener('click', () => {
			vscode.postMessage({ command: 'injectPrompt' });
		});

		document.getElementById('manual-setup-btn')?.addEventListener('click', () => {
			vscode.postMessage({ command: 'showMCPStatus' });
		});

		document.getElementById('settings-btn')?.addEventListener('click', () => {
			vscode.postMessage({ command: 'openSettings' });
		});

		document.getElementById('export-btn')?.addEventListener('click', () => {
			vscode.postMessage({ command: 'exportDebugInfo' });
		});

		// Copy buttons
		document.querySelectorAll('.copy-btn').forEach(btn => {
			btn.addEventListener('click', () => {
				const command = btn.dataset.command;
				vscode.postMessage({ command: 'copyCommand', data: { command } });
			});
		});

		// Timeline expansion
		document.querySelectorAll('.timeline-header').forEach(header => {
			header.addEventListener('click', () => {
				const items = header.nextElementSibling;
				const arrow = header.querySelector('.arrow');
				if (items) {
					const isExpanded = items.style.display !== 'none';
					items.style.display = isExpanded ? 'none' : 'block';
					if (arrow) {
						arrow.textContent = isExpanded ? '▶' : '▼';
					}
				}
			});
		});
		`;
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
