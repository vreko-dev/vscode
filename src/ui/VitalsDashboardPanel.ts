/**
 * VitalsDashboardPanel
 *
 * WebView panel for comprehensive workspace vitals visualization.
 * Displays real-time health metrics, recommendations, and CLI data.
 *
 * Features:
 * - Real-time vitals gauges (pulse, temperature, pressure, oxygen)
 * - Trajectory indicator with color coding
 * - Health score prominently displayed
 * - Snapshot recommendation with action button
 * - Learning and violation summaries
 * - Agent guidance for safe operations
 *
 * @see CLI_MCP_INTEGRATION_GAP_ANALYSIS.md for design rationale
 */

import type { VitalsSnapshot } from "@snapback/intelligence/vitals";
import * as vscode from "vscode";
import type {
	AgentGuidance,
	Learning,
	SessionHealth,
	SnapshotRecommendation,
	UnifiedDataService,
	Violation,
} from "../services/UnifiedDataService";
import {
	PULSE_LEVEL_SIGNAGE,
	SESSION_HEALTH_SIGNAGE,
	TEMPERATURE_LEVEL_SIGNAGE,
	TRAJECTORY_SIGNAGE,
} from "../signage/constants";

/**
 * Message types from webview to extension
 */
interface WebviewMessage {
	command: "createSnapshot" | "openLearnings" | "openViolations" | "refresh" | "dismiss";
}

/**
 * Data sent to webview for rendering
 */
interface VitalsDashboardData {
	vitals: VitalsSnapshot | null;
	health: SessionHealth;
	recommendation: SnapshotRecommendation;
	guidance: AgentGuidance;
	learnings: Learning[];
	violations: Violation[];
	stats: {
		totalLearnings: number;
		totalViolations: number;
		promotedPatterns: number;
		pendingPromotion: number;
	};
}

export class VitalsDashboardPanel {
	public static readonly viewType = "snapback.vitalsDashboard";
	private static instance: VitalsDashboardPanel | undefined;

	private readonly panel: vscode.WebviewPanel;
	private readonly dataService: UnifiedDataService;
	private readonly extensionUri: vscode.Uri;
	private disposables: vscode.Disposable[] = [];
	private updateInterval: NodeJS.Timeout | null = null;
	private useReactWebview = true; // Enable React WebView bundle

	private constructor(panel: vscode.WebviewPanel, dataService: UnifiedDataService, extensionUri: vscode.Uri) {
		this.panel = panel;
		this.dataService = dataService;
		this.extensionUri = extensionUri;

		// Set initial HTML content (React bundle or fallback)
		if (this.useReactWebview) {
			this.panel.webview.html = this.getReactWebviewHtml();
		}
		this.updateContent();

		// Handle messages from webview
		this.panel.webview.onDidReceiveMessage((message) => this.handleMessage(message), null, this.disposables);

		// Handle panel disposal
		this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

		// Subscribe to data changes
		this.disposables.push(this.dataService.onDataChange(() => this.updateContent()));

		// Periodic refresh for real-time feel (every 1s)
		this.updateInterval = setInterval(() => this.updateContent(), 1000);
	}

	/**
	 * Create or reveal the vitals dashboard panel
	 */
	public static createOrShow(extensionUri: vscode.Uri, dataService: UnifiedDataService): void {
		if (!extensionUri) {
			vscode.window.showErrorMessage("Failed to open vitals dashboard: missing extension URI");
			return;
		}

		try {
			// If panel already exists, reveal it
			if (VitalsDashboardPanel.instance) {
				VitalsDashboardPanel.instance.panel.reveal(vscode.ViewColumn.Two);
				return;
			}

			// Create new panel
			const panel = vscode.window.createWebviewPanel(
				VitalsDashboardPanel.viewType,
				"Workspace Vitals",
				vscode.ViewColumn.Two,
				{
					enableScripts: true,
					retainContextWhenHidden: true,
					localResourceRoots: [extensionUri],
				},
			);

			VitalsDashboardPanel.instance = new VitalsDashboardPanel(panel, dataService, extensionUri);
		} catch (error) {
			vscode.window.showErrorMessage(
				`Failed to open vitals dashboard: ${error instanceof Error ? error.message : "unknown error"}`,
			);
		}
	}

	/**
	 * Kill the panel if it exists
	 */
	public static kill(): void {
		VitalsDashboardPanel.instance?.panel.dispose();
		VitalsDashboardPanel.instance = undefined;
	}

	/**
	 * Update the webview content with latest data
	 */
	private updateContent(): void {
		const snapshot = this.dataService.getSnapshot();

		if (this.useReactWebview) {
			// Send data via postMessage to React WebView
			const vitals = snapshot.vitals;
			this.panel.webview.postMessage({
				type: "update",
				vitals: {
					pulse: vitals?.pulse.changesPerMinute || 0,
					temperature: vitals?.temperature.aiPercentage || 0,
					pressure: vitals?.pressure.value || 0,
					oxygen: vitals?.oxygen.value || 100,
					score: snapshot.sessionHealth.healthScore,
				},
				guidance: snapshot.guidance.suggestion ? { message: snapshot.guidance.suggestion } : undefined,
			});
			return;
		}

		// Fallback: Regenerate full HTML (legacy mode)
		const data: VitalsDashboardData = {
			vitals: snapshot.vitals,
			health: snapshot.sessionHealth,
			recommendation: snapshot.recommendation,
			guidance: snapshot.guidance,
			learnings: snapshot.learnings.slice(0, 5),
			violations: snapshot.violations.slice(0, 5),
			stats: snapshot.stats,
		};
		this.panel.webview.html = this.getHtmlContent(data);
	}

	/**
	 * Handle messages from the webview
	 */
	private handleMessage(message: unknown): void {
		if (!message || typeof message !== "object") {
			return;
		}

		const msg = message as WebviewMessage;

		switch (msg.command) {
			case "createSnapshot":
				vscode.commands.executeCommand("snapback.createSnapshot").then(
					() => {
						// Success
					},
					() => {
						// Silently handle error
					},
				);
				break;

			case "openLearnings":
				// TODO: Open learnings panel when implemented
				vscode.window.showInformationMessage("Learnings panel coming soon!");
				break;

			case "openViolations":
				// TODO: Open violations panel when implemented
				vscode.window.showInformationMessage("Violations panel coming soon!");
				break;

			case "refresh":
				this.updateContent();
				break;

			case "dismiss":
				this.panel.dispose();
				break;

			default:
				break;
		}
	}

	/**
	 * Clean up resources
	 */
	private dispose(): void {
		VitalsDashboardPanel.instance = undefined;

		if (this.updateInterval) {
			clearInterval(this.updateInterval);
			this.updateInterval = null;
		}

		while (this.disposables.length) {
			const disposable = this.disposables.pop();
			disposable?.dispose();
		}
	}

	/**
	 * Generate HTML that loads the React WebView bundle
	 */
	private getReactWebviewHtml(): string {
		const webview = this.panel.webview;

		// Get URIs for the built webview assets
		const scriptUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.extensionUri, "dist", "webview", "assets", "index.js"),
		);
		const styleUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.extensionUri, "dist", "webview", "assets", "index.css"),
		);

		const nonce = this.getNonce();

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Workspace Vitals</title>
	<link rel="stylesheet" href="${styleUri}">
</head>
<body>
	<div id="root"></div>
	<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
	}

	/**
	 * Generate HTML content for the webview
	 */
	private getHtmlContent(data: VitalsDashboardData): string {
		const nonce = this.getNonce();
		const cspSource = this.panel.webview.cspSource;

		const vitals = data.vitals;
		const health = data.health;
		const recommendation = data.recommendation;
		const guidance = data.guidance;

		// Build vitals display
		const pulseLevel = vitals?.pulse.level || "unknown";
		const pulseValue = vitals?.pulse.changesPerMinute || 0;
		const tempLevel = vitals?.temperature.level || "unknown";
		const tempPercent = vitals?.temperature.aiPercentage || 0;
		const pressure = vitals?.pressure.value || 0;
		const oxygen = vitals?.oxygen.value || 100;
		const trajectory = vitals?.trajectory || "stable";

		// Color mappings
		const pulseColor = this.getPulseColor(pulseLevel);
		const tempColor = this.getTempColor(tempLevel);
		const pressureColor = this.getPressureColor(pressure);
		const oxygenColor = this.getOxygenColor(oxygen);
		const trajectoryArrow = this.getTrajectoryArrow(trajectory);
		const healthColor = this.getHealthColor(health.healthScore);

		// Recommendations
		const recClass =
			recommendation.urgency === "now" ? "urgent" : recommendation.urgency === "soon" ? "warning" : "";

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Workspace Vitals</title>
	<style>
		:root {
			/* Colors from SnapBack signage system - single source of truth */
			--sb-healthy: ${SESSION_HEALTH_SIGNAGE.healthy.color};
			--sb-warning: ${SESSION_HEALTH_SIGNAGE.warning.color};
			--sb-critical: ${SESSION_HEALTH_SIGNAGE.critical.color};
			--sb-stable: ${TRAJECTORY_SIGNAGE.stable.color};
			--sb-cool: ${TEMPERATURE_LEVEL_SIGNAGE.cool.color};
			/* Fallback to VS Code theme colors */
			--green: var(--vscode-charts-green, ${SESSION_HEALTH_SIGNAGE.healthy.color});
			--yellow: var(--vscode-charts-yellow, ${SESSION_HEALTH_SIGNAGE.warning.color});
			--red: var(--vscode-charts-red, ${SESSION_HEALTH_SIGNAGE.critical.color});
			--blue: var(--vscode-charts-blue, ${TEMPERATURE_LEVEL_SIGNAGE.cool.color});
			--gray: var(--vscode-descriptionForeground, ${TRAJECTORY_SIGNAGE.stable.color});
		}
		body {
			font-family: var(--vscode-font-family);
			color: var(--vscode-foreground);
			background-color: var(--vscode-editor-background);
			padding: 16px;
			margin: 0;
		}
		.header {
			display: flex;
			justify-content: space-between;
			align-items: center;
			margin-bottom: 20px;
			padding-bottom: 12px;
			border-bottom: 1px solid var(--vscode-panel-border);
		}
		.header h1 {
			margin: 0;
			font-size: 18px;
			display: flex;
			align-items: center;
			gap: 8px;
		}
		.health-badge {
			padding: 6px 14px;
			border-radius: 20px;
			font-size: 16px;
			font-weight: bold;
			color: white;
		}
		.health-badge.good { background: ${SESSION_HEALTH_SIGNAGE.healthy.color}; }
		.health-badge.warning { background: ${SESSION_HEALTH_SIGNAGE.warning.color}; }
		.health-badge.critical { background: ${SESSION_HEALTH_SIGNAGE.critical.color}; }

		.trajectory {
			display: flex;
			align-items: center;
			gap: 6px;
			padding: 4px 10px;
			border-radius: 12px;
			background: var(--vscode-badge-background);
			font-size: 12px;
		}
		.trajectory-arrow {
			font-size: 16px;
		}

		.vitals-grid {
			display: grid;
			grid-template-columns: repeat(2, 1fr);
			gap: 12px;
			margin-bottom: 20px;
		}
		.vital-card {
			padding: 14px;
			border-radius: 8px;
			background: var(--vscode-editor-inactiveSelectionBackground);
			border: 1px solid var(--vscode-panel-border);
		}
		.vital-header {
			display: flex;
			justify-content: space-between;
			align-items: center;
			margin-bottom: 8px;
		}
		.vital-name {
			font-size: 12px;
			text-transform: uppercase;
			color: var(--vscode-descriptionForeground);
		}
		.vital-value {
			font-size: 24px;
			font-weight: bold;
		}
		.vital-bar {
			height: 6px;
			background: var(--vscode-progressBar-background);
			border-radius: 3px;
			overflow: hidden;
			margin-top: 8px;
		}
		.vital-bar-fill {
			height: 100%;
			border-radius: 3px;
			transition: width 0.3s ease;
		}
		.vital-label {
			font-size: 11px;
			color: var(--vscode-descriptionForeground);
			margin-top: 4px;
		}

		.recommendation {
			padding: 14px;
			border-radius: 8px;
			margin-bottom: 20px;
			border: 1px solid var(--vscode-panel-border);
			background: var(--vscode-editor-inactiveSelectionBackground);
		}
		.recommendation.urgent {
			border-color: ${SESSION_HEALTH_SIGNAGE.critical.color};
			background: var(--vscode-inputValidation-errorBackground, ${SESSION_HEALTH_SIGNAGE.critical.color}1a);
		}
		.recommendation.warning {
			border-color: ${SESSION_HEALTH_SIGNAGE.warning.color};
			background: var(--vscode-inputValidation-warningBackground, ${SESSION_HEALTH_SIGNAGE.warning.color}1a);
		}
		.recommendation h3 {
			margin: 0 0 8px 0;
			font-size: 14px;
			display: flex;
			align-items: center;
			gap: 8px;
		}
		.recommendation p {
			margin: 0 0 12px 0;
			font-size: 13px;
			color: var(--vscode-descriptionForeground);
		}

		.guidance {
			margin-bottom: 20px;
		}
		.guidance h3 {
			font-size: 13px;
			margin: 0 0 10px 0;
		}
		.ops-grid {
			display: grid;
			grid-template-columns: repeat(2, 1fr);
			gap: 8px;
		}
		.ops-list {
			padding: 10px;
			border-radius: 6px;
			background: var(--vscode-editor-inactiveSelectionBackground);
		}
		.ops-list.safe { border-left: 3px solid ${SESSION_HEALTH_SIGNAGE.healthy.color}; }
		.ops-list.blocked { border-left: 3px solid ${SESSION_HEALTH_SIGNAGE.critical.color}; }
		.ops-list h4 {
			margin: 0 0 6px 0;
			font-size: 11px;
			text-transform: uppercase;
			color: var(--vscode-descriptionForeground);
		}
		.ops-list ul {
			margin: 0;
			padding-left: 16px;
			font-size: 12px;
		}
		.ops-list li {
			margin: 2px 0;
		}

		.section {
			margin-bottom: 20px;
		}
		.section h3 {
			font-size: 13px;
			margin: 0 0 10px 0;
			display: flex;
			justify-content: space-between;
			align-items: center;
		}
		.section-badge {
			padding: 2px 8px;
			border-radius: 10px;
			font-size: 11px;
			background: var(--vscode-badge-background);
			color: var(--vscode-badge-foreground);
		}
		.item-list {
			list-style: none;
			padding: 0;
			margin: 0;
		}
		.item-list li {
			padding: 8px;
			margin-bottom: 4px;
			border-radius: 4px;
			background: var(--vscode-editor-inactiveSelectionBackground);
			font-size: 12px;
			display: flex;
			align-items: center;
			gap: 8px;
		}
		.item-type {
			padding: 2px 6px;
			border-radius: 4px;
			font-size: 10px;
			text-transform: uppercase;
			background: var(--vscode-badge-background);
		}
		.item-content {
			flex: 1;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}
		.promotion-bar {
			width: 40px;
			height: 4px;
			background: var(--gray);
			border-radius: 2px;
			overflow: hidden;
		}
		.promotion-fill {
			height: 100%;
			background: ${SESSION_HEALTH_SIGNAGE.healthy.color};
		}

		.warnings {
			padding: 10px;
			border-radius: 6px;
			margin-bottom: 16px;
			background: ${SESSION_HEALTH_SIGNAGE.warning.color}1a;
			border-left: 3px solid ${SESSION_HEALTH_SIGNAGE.warning.color};
		}
		.warnings h4 {
			margin: 0 0 6px 0;
			font-size: 12px;
			color: ${SESSION_HEALTH_SIGNAGE.warning.color};
		}
		.warnings ul {
			margin: 0;
			padding-left: 16px;
			font-size: 12px;
		}

		button {
			padding: 8px 16px;
			border: none;
			border-radius: 4px;
			cursor: pointer;
			font-size: 13px;
			background: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
		}
		button:hover {
			background: var(--vscode-button-hoverBackground);
		}
		button.urgent {
			background: ${SESSION_HEALTH_SIGNAGE.critical.color};
		}
		.btn-group {
			display: flex;
			gap: 8px;
		}

		.empty-state {
			text-align: center;
			padding: 30px;
			color: var(--vscode-descriptionForeground);
		}
		.empty-state p {
			margin: 8px 0;
		}
	</style>
</head>
<body>
	<div class="header">
		<h1>
			<span>Workspace Vitals</span>
			<span class="trajectory">
				<span class="trajectory-arrow">${trajectoryArrow}</span>
				<span>${trajectory}</span>
			</span>
		</h1>
		<div class="health-badge ${healthColor}">${health.healthScore}</div>
	</div>

	${
		health.activeWarnings.length > 0
			? `
	<div class="warnings">
		<h4>Active Warnings</h4>
		<ul>
			${health.activeWarnings.map((w) => `<li>${w}</li>`).join("")}
		</ul>
	</div>
	`
			: ""
	}

	<div class="vitals-grid">
		<div class="vital-card">
			<div class="vital-header">
				<span class="vital-name">Pulse</span>
				<span class="vital-value" style="color: ${pulseColor}">${pulseValue}</span>
			</div>
			<div class="vital-bar">
				<div class="vital-bar-fill" style="width: ${Math.min(pulseValue * 2, 100)}%; background: ${pulseColor}"></div>
			</div>
			<div class="vital-label">${pulseLevel} - changes/min</div>
		</div>

		<div class="vital-card">
			<div class="vital-header">
				<span class="vital-name">Temperature</span>
				<span class="vital-value" style="color: ${tempColor}">${tempPercent}%</span>
			</div>
			<div class="vital-bar">
				<div class="vital-bar-fill" style="width: ${tempPercent}%; background: ${tempColor}"></div>
			</div>
			<div class="vital-label">${tempLevel} - AI density</div>
		</div>

		<div class="vital-card">
			<div class="vital-header">
				<span class="vital-name">Pressure</span>
				<span class="vital-value" style="color: ${pressureColor}">${pressure}%</span>
			</div>
			<div class="vital-bar">
				<div class="vital-bar-fill" style="width: ${pressure}%; background: ${pressureColor}"></div>
			</div>
			<div class="vital-label">unsnapshot changes</div>
		</div>

		<div class="vital-card">
			<div class="vital-header">
				<span class="vital-name">Oxygen</span>
				<span class="vital-value" style="color: ${oxygenColor}">${oxygen}%</span>
			</div>
			<div class="vital-bar">
				<div class="vital-bar-fill" style="width: ${oxygen}%; background: ${oxygenColor}"></div>
			</div>
			<div class="vital-label">coverage health</div>
		</div>
	</div>

	<div class="recommendation ${recClass}">
		<h3>
			${recommendation.urgency === "now" ? "Snapshot Now" : recommendation.urgency === "soon" ? "Snapshot Recommended" : "Snapshot Status"}
		</h3>
		<p>${recommendation.reason}</p>
		${
			recommendation.should
				? `
		<button class="${recommendation.urgency === "now" ? "urgent" : ""}" id="snapshot-btn">
			Create Snapshot
		</button>
		`
				: ""
		}
	</div>

	<div class="guidance">
		<h3>Agent Guidance</h3>
		<div class="ops-grid">
			<div class="ops-list safe">
				<h4>Safe Operations</h4>
				<ul>
					${guidance.safeOperations.map((op) => `<li>${op}</li>`).join("")}
				</ul>
			</div>
			<div class="ops-list blocked">
				<h4>Blocked Operations</h4>
				<ul>
					${guidance.blockedOperations.length > 0 ? guidance.blockedOperations.map((op) => `<li>${op}</li>`).join("") : "<li>None</li>"}
				</ul>
			</div>
		</div>
		<p style="font-size: 12px; color: var(--vscode-descriptionForeground); margin-top: 8px;">
			${guidance.suggestion}
		</p>
	</div>

	${
		data.learnings.length > 0 || data.violations.length > 0
			? `
	<div class="section">
		<h3>
			Recent Activity
			<span class="section-badge">${data.stats.totalLearnings} learnings, ${data.stats.totalViolations} violations</span>
		</h3>

		${
			data.violations.length > 0
				? `
		<ul class="item-list">
			${data.violations
				.map(
					(v) => `
			<li>
				<span class="item-type" style="background: ${v.promotionStatus === "promoted" ? "var(--green)" : v.promotionStatus === "ready_for_promotion" ? "var(--yellow)" : "var(--gray)"}">${v.type}</span>
				<span class="item-content">${v.message || v.file}</span>
				<div class="promotion-bar">
					<div class="promotion-fill" style="width: ${Math.min((v.count / 3) * 100, 100)}%"></div>
				</div>
			</li>
			`,
				)
				.join("")}
		</ul>
		`
				: ""
		}

		${
			data.learnings.length > 0
				? `
		<ul class="item-list" style="margin-top: 8px;">
			${data.learnings
				.map(
					(l) => `
			<li>
				<span class="item-type">${l.type}</span>
				<span class="item-content">${l.trigger} → ${l.action}</span>
			</li>
			`,
				)
				.join("")}
		</ul>
		`
				: ""
		}
	</div>
	`
			: `
	<div class="empty-state">
		<p>No learnings or violations yet.</p>
		<p>Initialize with <code>snap init</code> in your terminal.</p>
	</div>
	`
	}

	<div class="btn-group">
		<button id="refresh-btn">Refresh</button>
	</div>

	<script nonce="${nonce}">
		const vscode = acquireVsCodeApi();

		document.getElementById('snapshot-btn')?.addEventListener('click', () => {
			vscode.postMessage({ command: 'createSnapshot' });
		});

		document.getElementById('refresh-btn')?.addEventListener('click', () => {
			vscode.postMessage({ command: 'refresh' });
		});
	</script>
</body>
</html>`;
	}

	// ============================================================================
	// COLOR HELPERS - Use signage system for consistency
	// All signage constants have color defined, so we use non-null assertion
	// ============================================================================

	/** Default fallback color from signage system */
	private readonly DEFAULT_COLOR = TRAJECTORY_SIGNAGE.stable.color!;

	private getPulseColor(level: string): string {
		// Use signage system colors - maps to PulseLevelCanonical
		const signage = PULSE_LEVEL_SIGNAGE[level as keyof typeof PULSE_LEVEL_SIGNAGE];
		return signage?.color ?? this.DEFAULT_COLOR;
	}

	private getTempColor(level: string): string {
		// Handle intelligence package "cold" → signage "cool" mapping
		const mappedLevel = level === "cold" ? "cool" : level;
		const signage = TEMPERATURE_LEVEL_SIGNAGE[mappedLevel as keyof typeof TEMPERATURE_LEVEL_SIGNAGE];
		return signage?.color ?? this.DEFAULT_COLOR;
	}

	private getPressureColor(value: number): string {
		// Derive from session health thresholds
		if (value > 75) {
			return SESSION_HEALTH_SIGNAGE.critical.color!;
		}
		if (value > 50) {
			return SESSION_HEALTH_SIGNAGE.warning.color!;
		}
		return SESSION_HEALTH_SIGNAGE.healthy.color!;
	}

	private getOxygenColor(value: number): string {
		// Inverse of pressure - low oxygen is critical
		if (value < 30) {
			return SESSION_HEALTH_SIGNAGE.critical.color!;
		}
		if (value < 60) {
			return SESSION_HEALTH_SIGNAGE.warning.color!;
		}
		return SESSION_HEALTH_SIGNAGE.healthy.color!;
	}

	private getTrajectoryArrow(trajectory: string): string {
		// Use signage system arrows - arrow is always defined in trajectory signage
		const signage = TRAJECTORY_SIGNAGE[trajectory as keyof typeof TRAJECTORY_SIGNAGE];
		return signage?.arrow ?? TRAJECTORY_SIGNAGE.stable.arrow;
	}

	private getHealthColor(score: number): string {
		// Return CSS class name for health badge
		if (score < 30) return "critical";
		if (score < 70) return "warning";
		return "good";
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

/**
 * Factory function to create the vitals dashboard panel
 */
export function createVitalsDashboardPanel(extensionUri: vscode.Uri, dataService: UnifiedDataService): void {
	VitalsDashboardPanel.createOrShow(extensionUri, dataService);
}
