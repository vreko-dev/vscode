/**
 * IntelligenceCodeLensProvider - Proactive Intelligence CodeLens
 *
 * Shows contextual intelligence above code:
 * - AI modifications count
 * - Fragile file warnings
 * - Risk level indicators
 * - Session stats
 *
 * Per playbook Section 3: "CodeLens renders actionable intelligence *above the code*"
 *
 * @module providers/IntelligenceCodeLensProvider
 * @see docs/brand/extension-branding-playbook.md Section 3
 */

import * as vscode from "vscode";
import type { SignalState } from "../signals/SignalState";
import { formatDuration } from "../utils/format";

/**
 * IntelligenceCodeLensProvider
 *
 * Provides CodeLens items that show Vreko intelligence context
 * at function/class boundaries in the editor.
 */
export class IntelligenceCodeLensProvider implements vscode.CodeLensProvider {
	private readonly _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
	public readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

	private signalState: SignalState;

	constructor(signalState: SignalState) {
		this.signalState = signalState;

		// Listen for state changes
		signalState.onChanged(() => {
			this._onDidChangeCodeLenses.fire();
		});
	}

	provideCodeLenses(
		document: vscode.TextDocument,
		_token: vscode.CancellationToken,
	): vscode.CodeLens[] | Thenable<vscode.CodeLens[]> {
		const codeLenses: vscode.CodeLens[] = [];
		const state = this.signalState;

		// Only show for file scheme
		if (document.uri.scheme !== "file") {
			return codeLenses;
		}

		const filePath = document.uri.fsPath;

		// Check if this file has any intelligence data
		const isAI = state.aiModifiedFiles.has(filePath);
		const isFragile = state.fragileFiles.has(filePath);
		const heat = state.getFileHeat(filePath);

		// Don't show CodeLens if no intelligence data
		if (!isAI && !isFragile && heat === "normal") {
			return codeLenses;
		}

		// Find function/class boundaries for CodeLens placement
		const positions = this.findStructuralPositions(document);

		// Limit to 2 CodeLens items maximum (per playbook design constraint)
		let lensCount = 0;

		// AI modifications CodeLens
		if (isAI && lensCount < 2) {
			const toolCount = state.aiToolsDetected.length;
			const toolsText = toolCount > 0 ? state.aiToolsDetected.join(", ") : "AI";
			const modCount = state.filesModifiedSession.size;

			codeLenses.push(
				new vscode.CodeLens(new vscode.Range(positions[0], positions[0], positions[0], positions[0]), {
					title: `⚙️ ${modCount} AI modifications this session (${toolsText})`,
					command: "vreko.showAllSnapshots",
					tooltip: "View AI-modified files and snapshots",
				}),
			);
			lensCount++;
		}

		// Fragile file warning CodeLens
		if (isFragile && lensCount < 2) {
			const reason = state.fragileFiles.get(filePath) ?? "fragile";

			codeLenses.push(
				new vscode.CodeLens(new vscode.Range(positions[0], positions[0], positions[0], positions[0]), {
					title: `◆ Fragile file · ${reason}`,
					command: "vreko.showFileHealthStatus",
					arguments: [document.uri],
					tooltip: "This file has been flagged as fragile based on historical patterns",
				}),
			);
			lensCount++;
		}

		// Risk level CodeLens (Power tier only, per playbook)
		if (state.tier === "power" && state.currentRiskLevel !== "normal" && lensCount < 2) {
			codeLenses.push(
				new vscode.CodeLens(new vscode.Range(positions[0], positions[0], positions[0], positions[0]), {
					title: `⚠ Risk: ${state.currentRiskLevel} · ${state.riskReason}`,
					command: "vreko.showStatus",
					tooltip: "Current risk assessment for this workspace",
				}),
			);
			lensCount++;
		}

		// Session stats CodeLens (during active session)
		if (state.currentSessionId && lensCount < 2) {
			const duration = formatDuration(state.sessionDuration);
			const snapshotCount = state.snapshotCountSession;

			codeLenses.push(
				new vscode.CodeLens(new vscode.Range(positions[0], positions[0], positions[0], positions[0]), {
					title: `📊 Session: ${snapshotCount} snapshots · ${duration}`,
					command: "vreko.showSessionBrowser",
					tooltip: "View session details and snapshots",
				}),
			);
			lensCount++;
		}

		return codeLenses;
	}

	resolveCodeLens(
		codeLens: vscode.CodeLens,
		_token: vscode.CancellationToken,
	): vscode.CodeLens | Thenable<vscode.CodeLens> {
		return codeLens;
	}

	/**
	 * Find structural positions (function/class boundaries) for CodeLens placement
	 *
	 * Returns line numbers where structural elements begin.
	 * Falls back to line 0 if no structural elements found.
	 */
	private findStructuralPositions(document: vscode.TextDocument): number[] {
		const positions: number[] = [0]; // Always include document start

		const text = document.getText();
		const lines = text.split("\n");

		// Simple heuristic: find lines that look like function/class declarations
		for (let i = 0; i < Math.min(lines.length, 100); i++) {
			const line = lines[i];
			// Match function/class/export patterns
			if (/^\s*(function|class|export|public|private|async)\s/.test(line)) {
				positions.push(i);
				if (positions.length >= 5) {
					break; // Limit positions
				}
			}
		}

		return positions;
	}

	/**
	 * Format duration in human-readable form
	 */
	/**
	 * Refresh CodeLens display
	 */
	public refresh(): void {
		this._onDidChangeCodeLenses.fire();
	}

	/**
	 * Dispose resources
	 */
	public dispose(): void {
		this._onDidChangeCodeLenses.dispose();
	}
}

/**
 * Factory function to create and register the provider
 */
export function createIntelligenceCodeLensProvider(signalState: SignalState): IntelligenceCodeLensProvider {
	return new IntelligenceCodeLensProvider(signalState);
}
