/**
 * AIProvenanceDecorations - Editor Gutter + Inline Decorations for AI Provenance
 *
 * This is the #2 ROI surface from the branding playbook - "the jaw-dropper".
 * Shows AI provenance markers in the editor gutter and inline annotations.
 *
 * Features:
 * - Gutter icons for AI-modified lines (different icons per tool)
 * - Risk bands in the gutter (color-coded)
 * - Inline provenance annotations (fade-in after line text)
 * - Overview ruler markers (minimap margin)
 *
 * @module decorations/AIProvenanceDecorations
 * @see docs/brand/extension-branding-playbook.md Section 2
 */

import * as vscode from "vscode";
import type { SignalState } from "../signals/SignalState";

/**
 * AI tool configuration for decoration icons
 */
interface AIToolConfig {
	icon: string;
	color: string;
	lightColor: string;
	name: string;
}

/**
 * AI tool configurations with icons
 */
const AI_TOOL_CONFIGS: Record<string, AIToolConfig> = {
	Cursor: {
		icon: "🔵",
		color: "#60A5FA",
		lightColor: "#2563EB",
		name: "Cursor",
	},
	Copilot: {
		icon: "🟣",
		color: "#A78BFA",
		lightColor: "#7C3AED",
		name: "Copilot",
	},
	Claude: {
		icon: "🟠",
		color: "#FB923C",
		lightColor: "#EA580C",
		name: "Claude",
	},
	Windsurf: {
		icon: "🟢",
		color: "#4ADE80",
		lightColor: "#16A34A",
		name: "Windsurf",
	},
	default: {
		icon: "⚙️",
		color: "#60A5FA",
		lightColor: "#2563EB",
		name: "AI",
	},
};

/**
 * AIProvenanceDecorations
 *
 * Provides gutter and inline decorations for AI-modified code.
 * This is the "intelligence made visible" feature that makes Vreko
 * stand out from other extensions.
 */
export class AIProvenanceDecorations implements vscode.Disposable {
	private disposables: vscode.Disposable[] = [];

	// Decoration types
	private gutterDecorationType: vscode.TextEditorDecorationType;
	private inlineDecorationType: vscode.TextEditorDecorationType;
	private riskBandDecorationType: vscode.TextEditorDecorationType;
	private overviewRulerDecorationType: vscode.TextEditorDecorationType;

	private signalState: SignalState;

	// Throttle for updates
	private updateTimer: NodeJS.Timeout | null = null;
	private readonly UPDATE_THROTTLE_MS = 250;

	constructor(signalState: SignalState) {
		this.signalState = signalState;

		// Create gutter decoration type (left margin icon)
		this.gutterDecorationType = vscode.window.createTextEditorDecorationType({
			gutterIconPath: this.createGutterIcon("default"),
			gutterIconSize: "contain",
			overviewRulerColor: new vscode.ThemeColor("vreko.aiModifiedGutter"),
			overviewRulerLane: vscode.OverviewRulerLane.Left,
		});

		// Create inline decoration type (after line text)
		this.inlineDecorationType = vscode.window.createTextEditorDecorationType({
			after: {
				color: new vscode.ThemeColor("editorCodeLens.foreground"),
				fontStyle: "italic",
				margin: "0 0 0 1em",
			},
			isWholeLine: true,
		});

		// Create risk band decoration type (vertical strip in gutter)
		this.riskBandDecorationType = vscode.window.createTextEditorDecorationType({
			backgroundColor: new vscode.ThemeColor("vreko.fragileFileHighlight"),
			isWholeLine: true,
			overviewRulerColor: new vscode.ThemeColor("vreko.riskMedium"),
			overviewRulerLane: vscode.OverviewRulerLane.Left,
		});

		// Create overview ruler decoration type (minimap markers)
		this.overviewRulerDecorationType = vscode.window.createTextEditorDecorationType({
			overviewRulerColor: new vscode.ThemeColor("vreko.snapshotCoverage"),
			overviewRulerLane: vscode.OverviewRulerLane.Right,
		});

		this.disposables.push(
			this.gutterDecorationType,
			this.inlineDecorationType,
			this.riskBandDecorationType,
			this.overviewRulerDecorationType,
		);

		// Subscribe to state changes
		signalState.onChanged(() => {
			this.scheduleUpdate();
		});

		// Subscribe to editor changes
		this.disposables.push(
			vscode.window.onDidChangeActiveTextEditor((editor) => {
				if (editor) {
					this.updateDecorations(editor);
				}
			}),
		);

		this.disposables.push(
			vscode.workspace.onDidChangeTextDocument((event) => {
				const editor = vscode.window.activeTextEditor;
				if (editor && event.document === editor.document) {
					this.scheduleUpdate();
				}
			}),
		);

		// Initial update
		if (vscode.window.activeTextEditor) {
			this.updateDecorations(vscode.window.activeTextEditor);
		}
	}

	/**
	 * Schedule a throttled update
	 */
	private scheduleUpdate(): void {
		if (this.updateTimer) {
			clearTimeout(this.updateTimer);
		}

		this.updateTimer = setTimeout(() => {
			this.updateTimer = null;
			if (vscode.window.activeTextEditor) {
				this.updateDecorations(vscode.window.activeTextEditor);
			}
		}, this.UPDATE_THROTTLE_MS);
	}

	/**
	 * Update decorations for an editor
	 */
	private updateDecorations(editor: vscode.TextEditor): void {
		const document = editor.document;
		const filePath = document.uri.fsPath;
		const state = this.signalState;

		// Clear all decorations first
		editor.setDecorations(this.gutterDecorationType, []);
		editor.setDecorations(this.inlineDecorationType, []);
		editor.setDecorations(this.riskBandDecorationType, []);
		editor.setDecorations(this.overviewRulerDecorationType, []);

		// Check if file has AI modifications
		const isAI = state.aiModifiedFiles.has(filePath);
		const isFragile = state.fragileFiles.has(filePath);
		const heat = state.getFileHeat(filePath);

		// Apply risk band for fragile files
		if (isFragile) {
			const fullRange = new vscode.Range(
				new vscode.Position(0, 0),
				new vscode.Position(document.lineCount - 1, 0),
			);
			editor.setDecorations(this.riskBandDecorationType, [fullRange]);
		}

		// Apply gutter and inline decorations for AI-modified files
		if (isAI) {
			// Get the AI tool that modified this file
			const tool = state.aiToolsDetected[0] ?? "default";
			const toolConfig = AI_TOOL_CONFIGS[tool] ?? AI_TOOL_CONFIGS.default;

			// For now, apply to the entire document
			// In a full implementation, this would be line-specific based on daemon data
			const fullRange = new vscode.Range(
				new vscode.Position(0, 0),
				new vscode.Position(document.lineCount - 1, 0),
			);

			// Apply gutter decoration
			editor.setDecorations(this.gutterDecorationType, [fullRange]);

			// Apply inline annotation on first line
			const firstLineRange = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 0));
			const inlineOptions: vscode.DecorationOptions = {
				range: firstLineRange,
				renderOptions: {
					after: {
						contentText: `← ${toolConfig.icon} ${toolConfig.name} · AI-modified`,
						color: new vscode.ThemeColor("editorCodeLens.foreground"),
						fontStyle: "italic",
					},
				},
			};
			editor.setDecorations(this.inlineDecorationType, [inlineOptions]);

			// Apply overview ruler marker
			editor.setDecorations(this.overviewRulerDecorationType, [fullRange]);
		}

		// Apply heat indicators
		if (heat === "hot" || heat === "warm") {
			const _count = state.fileChangeCounts.get(filePath) ?? 0;
			const colorTheme = heat === "hot" ? "vreko.fileHeatHot" : "vreko.fileHeatWarm";

			// Create a temporary decoration for heat
			const heatDecorationType = vscode.window.createTextEditorDecorationType({
				overviewRulerColor: new vscode.ThemeColor(colorTheme),
				overviewRulerLane: vscode.OverviewRulerLane.Right,
			});

			const fullRange = new vscode.Range(
				new vscode.Position(0, 0),
				new vscode.Position(document.lineCount - 1, 0),
			);

			editor.setDecorations(heatDecorationType, [fullRange]);

			// Schedule cleanup of temporary decoration
			setTimeout(() => {
				heatDecorationType.dispose();
			}, 100);
		}
	}

	/**
	 * Create a gutter icon SVG data URI
	 */
	private createGutterIcon(tool: string): vscode.Uri {
		const config = AI_TOOL_CONFIGS[tool] ?? AI_TOOL_CONFIGS.default;
		const svg = `
			<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
				<circle cx="8" cy="8" r="6" fill="${config.color}" opacity="0.8"/>
				<circle cx="8" cy="8" r="3" fill="white" opacity="0.9"/>
			</svg>
		`;
		const encoded = Buffer.from(svg).toString("base64");
		return vscode.Uri.parse(`data:image/svg+xml;base64,${encoded}`);
	}

	/**
	 * Refresh all decorations
	 */
	refresh(): void {
		for (const editor of vscode.window.visibleTextEditors) {
			this.updateDecorations(editor);
		}
	}

	/**
	 * Dispose resources
	 */
	dispose(): void {
		if (this.updateTimer) {
			clearTimeout(this.updateTimer);
		}
		for (const d of this.disposables) {
			d.dispose();
		}
		this.disposables = [];
	}
}

/**
 * Factory function to create AI provenance decorations
 */
export function createAIProvenanceDecorations(signalState: SignalState): AIProvenanceDecorations {
	return new AIProvenanceDecorations(signalState);
}
