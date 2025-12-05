import { RiskAnalyzer } from "@snapback/core/risk";
import * as vscode from "vscode";
import { LazyLoader } from "./services/LazyLoader.js";
import { logger } from "./utils/logger.js";

export class EditorDecorations {
	private riskAnalyzerLoader: LazyLoader<typeof RiskAnalyzer>;
	private protectedDecorationType: vscode.TextEditorDecorationType;
	private riskyDecorationType: vscode.TextEditorDecorationType;
	private sensitiveDecorationType: vscode.TextEditorDecorationType;
	private disposables: vscode.Disposable[] = [];

	constructor() {
		// Lazy load RiskAnalyzer to optimize activation time
		this.riskAnalyzerLoader = new LazyLoader<typeof RiskAnalyzer>(async () => {
			logger.info("RiskAnalyzer loading (lazy)...");
			logger.info("RiskAnalyzer loaded successfully");
			return RiskAnalyzer;
		}, "RiskAnalyzer");

		// Create decoration types for different risk levels
		this.protectedDecorationType = vscode.window.createTextEditorDecorationType(
			{
				backgroundColor: new vscode.ThemeColor(
					"editor.wordHighlightBackground",
				),
				borderColor: new vscode.ThemeColor("editor.wordHighlightBorder"),
				borderStyle: "solid",
				borderWidth: "1px",
				overviewRulerColor: new vscode.ThemeColor(
					"editor.wordHighlightBackground",
				),
				overviewRulerLane: vscode.OverviewRulerLane.Right,
				light: {
					backgroundColor: "rgba(0, 128, 0, 0.1)",
					borderColor: "rgba(0, 128, 0, 0.3)",
				},
				dark: {
					backgroundColor: "rgba(0, 128, 0, 0.2)",
					borderColor: "rgba(0, 128, 0, 0.5)",
				},
			},
		);

		this.riskyDecorationType = vscode.window.createTextEditorDecorationType({
			backgroundColor: new vscode.ThemeColor(
				"editor.wordHighlightStrongBackground",
			),
			borderColor: new vscode.ThemeColor("editor.wordHighlightStrongBorder"),
			borderStyle: "solid",
			borderWidth: "1px",
			overviewRulerColor: new vscode.ThemeColor(
				"editor.wordHighlightStrongBackground",
			),
			overviewRulerLane: vscode.OverviewRulerLane.Right,
			light: {
				backgroundColor: "rgba(255, 165, 0, 0.1)",
				borderColor: "rgba(255, 165, 0, 0.3)",
			},
			dark: {
				backgroundColor: "rgba(255, 165, 0, 0.2)",
				borderColor: "rgba(255, 165, 0, 0.5)",
			},
		});

		this.sensitiveDecorationType = vscode.window.createTextEditorDecorationType(
			{
				backgroundColor: new vscode.ThemeColor("editor.findMatchBackground"),
				borderColor: new vscode.ThemeColor("editor.findMatchBorder"),
				borderStyle: "solid",
				borderWidth: "1px",
				overviewRulerColor: new vscode.ThemeColor("editor.findMatchBackground"),
				overviewRulerLane: vscode.OverviewRulerLane.Right,
				light: {
					backgroundColor: "rgba(255, 0, 0, 0.1)",
					borderColor: "rgba(255, 0, 0, 0.3)",
				},
				dark: {
					backgroundColor: "rgba(255, 0, 0, 0.2)",
					borderColor: "rgba(255, 0, 0, 0.5)",
				},
			},
		);

		// Track decoration types for disposal
		this.disposables.push(this.protectedDecorationType);
		this.disposables.push(this.riskyDecorationType);
		this.disposables.push(this.sensitiveDecorationType);
	}

	/**
	 * Activate editor decorations for the extension
	 */
	activate(context: vscode.ExtensionContext): void {
		// Register event listeners for when text editors change
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
					this.updateDecorations(editor);
				}
			}),
		);

		// Update decorations for the currently active editor
		const editor = vscode.window.activeTextEditor;
		if (editor) {
			this.updateDecorations(editor);
		}

		// Add disposables to extension context
		context.subscriptions.push(...this.disposables);
	}

	/**
	 * Deactivate editor decorations and clean up resources
	 */
	deactivate(): void {
		this.clearAllDecorations();
	}

	/**
	 * Update decorations for a specific editor
	 */
	private async updateDecorations(editor: vscode.TextEditor): Promise<void> {
		try {
			const document = editor.document;

			// Skip if document is too large
			if (document.lineCount > 10000) {
				return;
			}

			// Analyze the document for risks
			const fileChanges = [
				{
					filePath: document.fileName,
					lineCount: document.lineCount,
					content: document.getText(),
				},
			];

			// Get RiskAnalyzer (loads on first access)
			const RiskAnalyzerClass = await this.riskAnalyzerLoader.get();
			const riskAnalyzer = new RiskAnalyzerClass();
			const riskAnalysis = await riskAnalyzer.analyzeFileChanges(
				fileChanges,
				undefined,
			);

			// Collect decoration ranges
			const protectedRanges: vscode.Range[] = [];
			const riskyRanges: vscode.Range[] = [];
			const sensitiveRanges: vscode.Range[] = [];

			// Add decorations based on risk analysis
			if (riskAnalysis.score > 0.7) {
				// High risk - decorate the entire document
				const fullRange = new vscode.Range(
					new vscode.Position(0, 0),
					new vscode.Position(document.lineCount - 1, 0),
				);
				riskyRanges.push(fullRange);
			} else if (riskAnalysis.score > 0.4) {
				// Medium risk - decorate specific lines
				// For now, we'll just decorate the first 10 lines as an example
				const partialRange = new vscode.Range(
					new vscode.Position(0, 0),
					new vscode.Position(Math.min(10, document.lineCount - 1), 0),
				);
				riskyRanges.push(partialRange);
			}

			// Check for security threats
			if (riskAnalysis.threats.length > 0) {
				// Decorate lines with security threats
				// For now, we'll just decorate the first few lines as an example
				const threatRange = new vscode.Range(
					new vscode.Position(0, 0),
					new vscode.Position(Math.min(5, document.lineCount - 1), 0),
				);
				sensitiveRanges.push(threatRange);
			}

			// Apply decorations
			editor.setDecorations(this.protectedDecorationType, protectedRanges);
			editor.setDecorations(this.riskyDecorationType, riskyRanges);
			editor.setDecorations(this.sensitiveDecorationType, sensitiveRanges);
		} catch (error) {
			logger.error(
				"Error updating editor decorations:",
				error instanceof Error ? error : undefined,
			);
		}
	}

	/**
	 * Clear all decorations from all visible editors
	 */
	private clearAllDecorations(): void {
		const editors = vscode.window.visibleTextEditors;
		for (const editor of editors) {
			editor.setDecorations(this.protectedDecorationType, []);
			editor.setDecorations(this.riskyDecorationType, []);
			editor.setDecorations(this.sensitiveDecorationType, []);
		}
	}

	/**
	 * Update decorations for all visible editors
	 */
	async updateAllDecorations(): Promise<void> {
		const editors = vscode.window.visibleTextEditors;
		for (const editor of editors) {
			await this.updateDecorations(editor);
		}
	}
}
