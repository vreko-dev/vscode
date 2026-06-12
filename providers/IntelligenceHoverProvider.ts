/**
 * IntelligenceHoverProvider - Rich Tooltips for AI-Modified Lines
 *
 * Provides depth-on-demand hover information for:
 * - AI-modified lines (tool, timestamp, blast radius)
 * - Fragile file indicators (rollbacks, co-change relationships)
 * - Session context (coherence, snapshots, risk)
 *
 * Per playbook Section 10: "Hovers are the natural 'tell me more' gesture"
 *
 * @module providers/IntelligenceHoverProvider
 * @see docs/brand/extension-branding-playbook.md Section 10
 */

import * as vscode from "vscode";
import type { SignalState } from "../signals/SignalState";
import { formatDuration } from "../utils/format";

/**
 * IntelligenceHoverProvider
 *
 * Shows rich Markdown tooltips when hovering over code that Vreko
 * has intelligence data for.
 */
export class IntelligenceHoverProvider implements vscode.HoverProvider {
	private signalState: SignalState;

	constructor(signalState: SignalState) {
		this.signalState = signalState;
	}

	provideHover(
		document: vscode.TextDocument,
		position: vscode.Position,
		_token: vscode.CancellationToken,
	): vscode.Hover | undefined {
		const filePath = document.uri.fsPath;
		const state = this.signalState;

		// Check if this file has any intelligence data
		const isAI = state.aiModifiedFiles.has(filePath);
		const isFragile = state.fragileFiles.has(filePath);
		const heat = state.getFileHeat(filePath);

		// If no intelligence data, no hover
		if (!isAI && !isFragile && heat === "normal") {
			return undefined;
		}

		// Build hover content
		const md = new vscode.MarkdownString("", true);
		md.isTrusted = true;

		// AI-modified hover
		if (isAI) {
			this.appendAIHoverContent(md, state);
		}

		// Fragile file hover
		if (isFragile) {
			this.appendFragileHoverContent(md, filePath, state);
		}

		// Heat indicator
		if (heat !== "normal") {
			this.appendHeatHoverContent(md, filePath, state);
		}

		// Session context
		if (state.currentSessionId) {
			this.appendSessionContext(md, state);
		}

		// Only return hover if we have content
		if (md.value.length === 0) {
			return undefined;
		}

		// Create range for the hover (current line)
		const range = new vscode.Range(
			new vscode.Position(position.line, 0),
			new vscode.Position(position.line, Number.MAX_VALUE),
		);

		return new vscode.Hover(md, range);
	}

	/**
	 * Append AI-modified hover content
	 */
	private appendAIHoverContent(md: vscode.MarkdownString, state: SignalState): void {
		const tools = state.aiToolsDetected;
		const toolText = tools.length > 0 ? tools.join(", ") : "AI tool";

		md.appendMarkdown(`**⚡ AI-Modified** · ${toolText}\n\n`);

		// Blast radius (placeholder - would come from daemon in full implementation)
		md.appendMarkdown("**Blast radius**: Analysis in progress...\n\n");

		// Command links
		md.appendMarkdown("[View Diff](command:vreko.showQuickPicker) · ");
		md.appendMarkdown("[View Session](command:vreko.showSessionBrowser)\n\n");
	}

	/**
	 * Append fragile file hover content
	 */
	private appendFragileHoverContent(md: vscode.MarkdownString, filePath: string, state: SignalState): void {
		const reason = state.fragileFiles.get(filePath) ?? "Historical patterns detected";

		md.appendMarkdown(`**⚠ Fragile File** · ${reason}\n\n`);

		// Co-change relationships (placeholder - would come from daemon)
		md.appendMarkdown("**Co-change relationships**:\n");
		md.appendMarkdown("- Analysis pending...\n\n");

		// Learnings
		if (state.learningCount > 0) {
			md.appendMarkdown(`**Learnings**: ${state.learningCount} patterns captured\n\n`);
		}

		// Command link
		md.appendMarkdown("[View History](command:vreko.showFullHistory)\n\n");
	}

	/**
	 * Append file heat hover content
	 */
	private appendHeatHoverContent(md: vscode.MarkdownString, filePath: string, state: SignalState): void {
		const count = state.fileChangeCounts.get(filePath) ?? 0;
		const heat = state.getFileHeat(filePath);

		if (heat === "hot") {
			md.appendMarkdown(`**🔥 High Activity** · ${count} changes this session\n\n`);
			md.appendMarkdown("*Consider creating a named snapshot before major changes*\n\n");
		} else if (heat === "warm") {
			md.appendMarkdown(`**· Warm** · ${count} changes this session\n\n`);
		}
	}

	/**
	 * Append session context to hover
	 */
	private appendSessionContext(md: vscode.MarkdownString, state: SignalState): void {
		const duration = formatDuration(state.sessionDuration);
		const snapshots = state.snapshotCountSession;

		md.appendMarkdown("---\n\n");
		md.appendMarkdown("**Session Context**:\n");
		md.appendMarkdown(`- **Duration**: ${duration}\n`);
		md.appendMarkdown(`- **Snapshots**: ${snapshots} this session\n`);

		// Risk level
		if (state.currentRiskLevel !== "normal") {
			md.appendMarkdown(`- **Risk**: ${state.currentRiskLevel}  -  ${state.riskReason}\n`);
		} else {
			md.appendMarkdown("- **Risk**: Normal\n");
		}

		// Intelligence stats
		md.appendMarkdown(
			`- **Intelligence**: ${state.learningCount} learnings · ${state.fragileFileCount} fragile files\n`,
		);
		md.appendMarkdown("\n");
	}

	/**
	 * Format duration in human-readable form
	 */
}

/**
 * Factory function to create and register the hover provider
 */
export function createIntelligenceHoverProvider(signalState: SignalState): vscode.Disposable {
	const provider = new IntelligenceHoverProvider(signalState);

	// Register for all file types
	const disposable = vscode.languages.registerHoverProvider("*", provider);

	return disposable;
}
