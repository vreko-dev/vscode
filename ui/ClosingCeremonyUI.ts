/**
 * Closing Ceremony UI
 *
 * TIER 1.6: Notification-based closing ceremony for session completion.
 * Shows a structured summary when sessions end with learnings, metrics, and achievements.
 *
 * DESIGN PRINCIPLES:
 * - Non-blocking toast notification
 * - Peak-end rule: end on a high note
 * - Progressive disclosure: summary first, details on demand
 *
 * @module ui/ClosingCeremonyUI
 */

import * as vscode from "vscode";
import type { AIInsights } from "../types/ai-insights";
import { logger } from "../utils/logger";

// =============================================================================
// Types
// =============================================================================

/**
 * Ceremony data from the local service's closing-ceremony handler
 */
export interface ClosingCeremonyData {
	sessionId: string;
	workspacePath: string;
	duration: number; // milliseconds
	learningsCaptured: number;
	fragileFilesInSession: Array<{ path: string; riskScore: number }>;
	tokensSaved: number;
	tokensSavedIsEstimate: boolean;
	coherenceScore: "high" | "medium" | "low" | "scattered";
	coherenceRationale: string;
	checkpointsCreated: number;
	pitfallsAvoided?: number;
	/** Cumulative risk score across fragile files touched in this session (CEREM-03) */
	fragilityExposure?: number;
	/** Signal metrics from the session (protection decisions, risk events, etc.) */
	signalMetrics?: {
		totalSignals: number;
		criticalEvents: number;
		riskSpikes: number;
		protectionDecisions: number;
	};
	healthDelta: number | null;
	concurrentSessions: Array<{
		clientType: string;
		overlapFiles: number;
		conflictResolved: boolean;
	}> | null;
	topLearnings: Array<{
		content: string;
		captureMethod: string;
		confidence: number;
	}>;
	/** AI-generated insights (Pro feature, pre-fired on session end) */
	insightsPromise?: Promise<AIInsights | null>;
}

/**
 * Simplified ceremony summary for notification
 */
export interface CeremonySummary {
	durationMin: number;
	filesModified: number;
	learningsCaptured: number;
	checkpointsCreated: number;
	tokensSaved: string;
	coherence: "high" | "medium" | "low" | "scattered";
	riskAreasTouched: number;
}

/**
 * Serialize ceremony data to canonical markdown format (CEREM-02/CEREM-05).
 * Every output line is ≤ 80 chars. Raw learning content is NOT included
 * (privacy: only counts per INV-PA-01/PA-02). Workspace is last-12 chars only
 * (T-11-03-01 mitigation).
 */
export function serializeToCeremonyMarkdown(data: ClosingCeremonyData): string {
	const row = (label: string, val: string | number) => `| ${label.padEnd(21)}| ${String(val).padEnd(15)}|`;

	const workspaceShort = (data.workspacePath ?? "").slice(-12);

	return [
		"## Vreko Session Summary",
		"",
		"| Metric              | Value         |",
		"|---------------------|---------------|",
		row("Duration", `${Math.round((data.duration ?? 0) / 60_000)} min`),
		row("Learnings captured", data.learningsCaptured ?? 0),
		row("Patterns surfaced", data.signalMetrics?.protectionDecisions ?? 0),
		row("Pitfalls avoided", data.pitfallsAvoided ?? 0),
		row("Fragility exposure", data.fragilityExposure != null ? data.fragilityExposure.toFixed(1) : " - "),
		row("Snapshots created", data.checkpointsCreated ?? 0),
		row("Token savings", `~${data.tokensSaved ?? 0}`),
		"",
		`Session ID: ${data.sessionId ?? ""}`,
		`Workspace:  ${workspaceShort}`,
		`Generated:  ${new Date().toISOString()}`,
	].join("\n");
}

/**
 * User action buttons
 */
const ACTIONS = {
	VIEW_DETAILS: "View Details",
	VIEW_LEARNINGS: "View Learnings",
	DISMISS: "Dismiss",
} as const;

// =============================================================================
// Closing Ceremony UI Class
// =============================================================================

/**
 * Manages closing ceremony notifications
 */
export class ClosingCeremonyUI implements vscode.Disposable {
	private disposables: vscode.Disposable[] = [];
	private lastCeremonySessionId: string | null = null;

	/**
	 * Show closing ceremony notification
	 */
	async showCeremony(data: ClosingCeremonyData): Promise<void> {
		// Prevent duplicate ceremonies for same session
		if (this.lastCeremonySessionId === data.sessionId) {
			logger.debug("Ceremony already shown for session", { sessionId: data.sessionId });
			return;
		}
		this.lastCeremonySessionId = data.sessionId;

		const summary = this.buildSummary(data);
		const message = this.formatMessage(summary);
		const detail = this.formatDetail(data);

		// Show notification with action buttons
		const selection = await vscode.window.showInformationMessage(
			message,
			{
				modal: false,
				detail,
			},
			ACTIONS.VIEW_DETAILS,
			ACTIONS.VIEW_LEARNINGS,
			ACTIONS.DISMISS,
		);

		// Handle user selection
		switch (selection) {
			case ACTIONS.VIEW_DETAILS:
				await this.showFullDetails(data);
				break;
			case ACTIONS.VIEW_LEARNINGS:
				await this.showLearnings(data);
				break;
			default:
				// User dismissed - no action needed
				break;
		}

		logger.info("Closing ceremony shown", {
			sessionId: data.sessionId,
			durationMin: summary.durationMin,
			learningsCaptured: summary.learningsCaptured,
			userAction: selection ?? "dismissed",
		});
	}

	/**
	 * Show ceremony from simplified summary (fallback when service unavailable)
	 */
	async showSimpleCeremony(summary: CeremonySummary): Promise<void> {
		const message = this.formatMessage(summary);
		const detail = `Duration: ${summary.durationMin} min | Files: ${summary.filesModified} | Learnings: ${summary.learningsCaptured}`;

		await vscode.window.showInformationMessage(message, { modal: false, detail }, ACTIONS.DISMISS);
	}

	/**
	 * Copy ceremony summary to clipboard in canonical markdown format (CEREM-05)
	 * Flashes "Copied!" in the status bar for 3 seconds then reverts.
	 */
	async copySummary(data: ClosingCeremonyData): Promise<void> {
		const markdown = serializeToCeremonyMarkdown(data);
		await vscode.env.clipboard.writeText(markdown);

		// Flash "Copied!" for 3 seconds then revert to nothing
		const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 1000);
		item.text = "$(check) Copied!";
		item.show();
		setTimeout(() => {
			item.hide();
			item.dispose();
		}, 3000);
	}

	// =========================================================================
	// Private Helpers
	// =========================================================================

	/**
	 * Build simplified summary from full ceremony data
	 */
	private buildSummary(data: ClosingCeremonyData): CeremonySummary {
		const durationMin = Math.round(data.duration / 60000);
		const tokensSaved = data.tokensSavedIsEstimate
			? `~${data.tokensSaved.toLocaleString()}`
			: data.tokensSaved.toLocaleString();

		return {
			durationMin,
			filesModified: data.fragileFilesInSession.length + data.checkpointsCreated,
			learningsCaptured: data.learningsCaptured,
			checkpointsCreated: data.checkpointsCreated,
			tokensSaved,
			coherence: data.coherenceScore,
			riskAreasTouched: data.fragileFilesInSession.length,
		};
	}

	/**
	 * Format main notification message
	 */
	private formatMessage(summary: CeremonySummary): string {
		const parts: string[] = [];

		// Main emoji and title
		parts.push("🎉 Session Complete");

		// Key metrics
		if (summary.learningsCaptured > 0) {
			parts.push(`${summary.learningsCaptured} learning${summary.learningsCaptured > 1 ? "s" : ""} captured`);
		}
		if (summary.durationMin > 0) {
			parts.push(`${summary.durationMin} min`);
		}

		// Coherence indicator
		const coherenceEmoji = {
			high: "🎯",
			medium: "📊",
			low: "🔀",
			scattered: "🌀",
		};
		parts.push(`${coherenceEmoji[summary.coherence]} ${summary.coherence} focus`);

		return parts.join("  -  ");
	}

	/**
	 * Format detail text for notification
	 */
	private formatDetail(data: ClosingCeremonyData): string {
		const lines: string[] = [];

		// Duration
		const min = Math.round(data.duration / 60000);
		lines.push(`⏱️ Duration: ${min} minute${min !== 1 ? "s" : ""}`);

		// Files and checkpoints
		lines.push(`📁 Files touched: ${data.fragileFilesInSession.length}`);
		if (data.checkpointsCreated > 0) {
			lines.push(`📸 Checkpoints: ${data.checkpointsCreated}`);
		}

		// Pitfalls avoided (replaces token savings)
		if ((data.pitfallsAvoided ?? 0) > 0) {
			lines.push(`🛡️ Pitfalls avoided: ${data.pitfallsAvoided}`);
		}

		// Risk areas
		if (data.fragileFilesInSession.length > 0) {
			lines.push(`⚠️ Risk areas touched: ${data.fragileFilesInSession.length}`);
		}

		return lines.join(" | ");
	}

	/**
	 * Show full details in output panel
	 */
	private async showFullDetails(data: ClosingCeremonyData): Promise<void> {
		const lines: string[] = [
			"# Vreko Session Summary",
			"",
			`**Session ID:** ${data.sessionId}`,
			`**Workspace:** ${data.workspacePath}`,
			`**Duration:** ${Math.round(data.duration / 60000)} minutes`,
			"",
			"## Metrics",
			`- **Learnings captured:** ${data.learningsCaptured}`,
			`- **Checkpoints created:** ${data.checkpointsCreated}`,
			`- **Tokens saved:** ${data.tokensSavedIsEstimate ? "~" : ""}${data.tokensSaved.toLocaleString()}`,
			`- **Coherence:** ${data.coherenceScore} (${data.coherenceRationale})`,
			"",
		];

		// Risk areas
		if (data.fragileFilesInSession.length > 0) {
			lines.push("## Risk Areas Touched");
			for (const file of data.fragileFilesInSession) {
				lines.push(`- ${file.path} (risk: ${file.riskScore?.toFixed(2) ?? "0.00"})`);
			}
			lines.push("");
		}

		// Top learnings
		if (data.topLearnings.length > 0) {
			lines.push("## Top Learnings");
			for (const learning of data.topLearnings) {
				lines.push(`- ${learning.content} (${Math.round(learning.confidence * 100)}% confidence)`);
			}
			lines.push("");
		}

		// Concurrent sessions
		if (data.concurrentSessions && data.concurrentSessions.length > 0) {
			lines.push("## Concurrent Sessions");
			for (const session of data.concurrentSessions) {
				lines.push(`- ${session.clientType}: ${session.overlapFiles} overlapping files`);
			}
			lines.push("");
		}

		// AI Insights (Pro feature, pre-fired)
		if (data.insightsPromise) {
			try {
				const insights = await data.insightsPromise;
				if (insights) {
					lines.push("## 🤖 AI Insights");
					lines.push("");
					lines.push(`**${insights.summary}**`);
					lines.push("");
					lines.push(insights.whyItMatters);
					lines.push("");

					if (insights.topRisks.length > 0) {
						lines.push("### Top Risks");
						for (const risk of insights.topRisks) {
							lines.push(`- ⚠️ ${risk}`);
						}
						lines.push("");
					}

					if (insights.insights.length > 0) {
						lines.push("### Detailed Insights");
						for (const insight of insights.insights) {
							const emoji = {
								warning: "⚠️",
								suggestion: "💡",
								synthesis: "🔗",
								prediction: "🔮",
							}[insight.type];
							lines.push(
								`- ${emoji} **${insight.title}** (${Math.round(insight.confidence * 100)}% confidence)`,
							);
							lines.push(`  ${insight.body}`);
						}
						lines.push("");
					}

					lines.push("### Recommended Next Step");
					lines.push(insights.nextAction);
					lines.push("");

					if (insights.cached) {
						lines.push(`_Insights generated from cached pattern (model: ${insights.model})_`);
					} else {
						lines.push(`_Insights generated by ${insights.model}_`);
					}
				}
			} catch (error) {
				logger.debug("AI insights not available", { error });
				// Graceful degradation - continue without insights
			}
		}

		// Show in new document
		const doc = await vscode.workspace.openTextDocument({
			content: lines.join("\n"),
			language: "markdown",
		});
		await vscode.window.showTextDocument(doc, { preview: true });
	}

	/**
	 * Show learnings in quick pick
	 */
	private async showLearnings(data: ClosingCeremonyData): Promise<void> {
		if (data.topLearnings.length === 0) {
			vscode.window.showInformationMessage("No learnings captured this session");
			return;
		}

		const items = data.topLearnings.map((learning, index) => ({
			label: learning.content,
			description: `${Math.round(learning.confidence * 100)}% confidence`,
			detail: `Captured via ${learning.captureMethod}`,
			index,
		}));

		const selected = await vscode.window.showQuickPick(items, {
			placeHolder: "Session learnings",
			matchOnDescription: true,
		});

		if (selected) {
			// Copy to clipboard
			await vscode.env.clipboard.writeText(selected.label);
			vscode.window.showInformationMessage("Learning copied to clipboard");
		}
	}

	/**
	 * Dispose resources
	 */
	dispose(): void {
		this.disposables.forEach((d) => d.dispose());
		this.disposables = [];
	}
}

// =============================================================================
// Singleton Instance
// =============================================================================

let _instance: ClosingCeremonyUI | null = null;

/**
 * Get the singleton ClosingCeremonyUI instance
 */
export function getClosingCeremonyUI(): ClosingCeremonyUI {
	if (!_instance) {
		_instance = new ClosingCeremonyUI();
	}
	return _instance;
}

/**
 * Show closing ceremony (convenience function)
 */
export async function showClosingCeremony(data: ClosingCeremonyData): Promise<void> {
	return getClosingCeremonyUI().showCeremony(data);
}

/**
 * Show simple ceremony (fallback when service unavailable)
 */
export async function showSimpleCeremony(summary: CeremonySummary): Promise<void> {
	return getClosingCeremonyUI().showSimpleCeremony(summary);
}
