/**
 * HeatIntegration - Wires Heat System to VS Code Events and Intelligence
 *
 * Connects document changes to HeatTracker via SignalBridge for AI detection.
 * Provides clean integration point for extension activation.
 */

import * as vscode from "vscode";

import { SignalBridge } from "../bridges/SignalBridge";
import { recordFileModification } from "../services/IntelligenceService";
import { logger } from "../utils/logger";
import { FileHeatDecorationProvider } from "./FileHeatDecorationProvider";
import { HeatTracker } from "./HeatTracker";
import type { AITool, HeatConfig, HeatSummary } from "./types";

/**
 * HeatIntegration wires the heat tracking system to VS Code events.
 *
 * Responsibilities:
 * - Listen for document save events → recordSave
 * - Detect AI involvement via SignalBridge → recordAIEdit
 * - Track undo/redo commands → recordUndoRedo
 * - Register decoration provider with VS Code
 * - Expose getVitalsSummary for integration with IntelligenceService
 */
export class HeatIntegration implements vscode.Disposable {
	private readonly heatTracker: HeatTracker;
	private readonly decorationProvider: FileHeatDecorationProvider;
	private readonly signalBridge: SignalBridge;
	private readonly disposables: vscode.Disposable[] = [];

	// Track recent document changes for AI detection on save
	private recentChanges = new Map<string, vscode.TextDocumentContentChangeEvent[]>();
	private recentDocuments = new Map<string, vscode.TextDocument>();

	constructor(config: Partial<HeatConfig> = {}) {
		this.heatTracker = new HeatTracker(config);
		this.decorationProvider = new FileHeatDecorationProvider(this.heatTracker);
		this.signalBridge = new SignalBridge();

		this.setupEventListeners();
		this.registerDecorationProvider();

		logger.debug("HeatIntegration initialized");
	}

	// ─────────────────────────────────────────────────────────────────
	// Public API
	// ─────────────────────────────────────────────────────────────────

	/**
	 * Get heat summary for vitals integration.
	 */
	getSummary(): HeatSummary {
		return this.heatTracker.getSummary();
	}

	/**
	 * Reset heat for a file (e.g., after snapshot created).
	 */
	resetFile(filePath: string): void {
		this.heatTracker.resetFile(filePath);
	}

	/**
	 * Force decoration update for specific files.
	 */
	refreshDecorations(filePaths: string[]): void {
		this.decorationProvider.forceUpdate(filePaths);
	}

	/**
	 * Access the underlying heat tracker (for testing/advanced use).
	 */
	get tracker(): HeatTracker {
		return this.heatTracker;
	}

	// ─────────────────────────────────────────────────────────────────
	// Event Handlers
	// ─────────────────────────────────────────────────────────────────

	private setupEventListeners(): void {
		// Track document changes for AI detection
		this.disposables.push(
			vscode.workspace.onDidChangeTextDocument((event) => {
				this.handleDocumentChange(event);
			}),
		);

		// Record save events
		this.disposables.push(
			vscode.workspace.onDidSaveTextDocument((document) => {
				this.handleDocumentSave(document);
			}),
		);

		// Track undo/redo commands
		this.disposables.push(
			vscode.commands.registerCommand("snapback.heat.trackUndo", () => {
				const editor = vscode.window.activeTextEditor;
				if (editor) {
					this.heatTracker.recordUndoRedo(editor.document.uri.fsPath);
				}
			}),
		);

		// Listen for undo/redo via command execution
		// Note: VS Code doesn't expose native undo/redo events, so we use a workaround
		this.setupUndoRedoTracking();
	}

	private handleDocumentChange(event: vscode.TextDocumentChangeEvent): void {
		const filePath = event.document.uri.fsPath;

		// Skip non-file schemes
		if (event.document.uri.scheme !== "file") {
			return;
		}

		// Store changes for AI detection on save
		const existing = this.recentChanges.get(filePath) || [];
		existing.push(...event.contentChanges);
		this.recentChanges.set(filePath, existing);
		this.recentDocuments.set(filePath, event.document);

		// Detect AI immediately on change (for burst detection)
		if (event.contentChanges.length > 0) {
			const aiResult = this.signalBridge.detectAI(event.document, event.contentChanges);

			if (aiResult.tool && aiResult.confidence >= 0.7) {
				const aiTool = this.mapAITool(aiResult.tool);
				this.heatTracker.recordAIEdit(filePath, aiTool, aiResult.confidence);

				logger.debug("AI detected during edit", {
					filePath,
					tool: aiResult.tool,
					confidence: aiResult.confidence,
				});
			}
		}
	}

	private handleDocumentSave(document: vscode.TextDocument): void {
		const filePath = document.uri.fsPath;

		// Skip non-file schemes
		if (document.uri.scheme !== "file") {
			return;
		}

		// Get accumulated changes since last save
		const changes = this.recentChanges.get(filePath) || [];
		const diffSize = changes.reduce((sum, change) => sum + change.text.length, 0);

		// Record save with diff size
		this.heatTracker.recordSave(filePath, { diffSize });

		// Record to Intelligence layer
		void recordFileModification(filePath, "update", {
			linesChanged: diffSize,
		});

		// Clear accumulated changes
		this.recentChanges.delete(filePath);
		this.recentDocuments.delete(filePath);

		logger.debug("Heat recorded on save", {
			filePath,
			diffSize,
			changesCount: changes.length,
		});
	}

	private setupUndoRedoTracking(): void {
		// Note: VS Code doesn't expose native undo/redo events.
		// We can't directly intercept undo/redo without user keybinding changes.
		// Instead, we detect rapid changes which often indicate undo/redo patterns.
		// The undo/redo count in HeatTracker serves as a secondary signal.
		//
		// A future enhancement could add keybinding contributions to wrap
		// the default undo/redo commands and track them explicitly.
	}

	private registerDecorationProvider(): void {
		this.disposables.push(vscode.window.registerFileDecorationProvider(this.decorationProvider));

		logger.debug("Heat decoration provider registered");
	}

	private mapAITool(tool: string): AITool {
		const toolMap: Record<string, AITool> = {
			copilot: "copilot",
			"github.copilot": "copilot",
			cursor: "cursor",
			claude: "claude",
			tabnine: "tabnine",
			codeium: "codeium",
		};

		return toolMap[tool.toLowerCase()] || "unknown";
	}

	// ─────────────────────────────────────────────────────────────────
	// Disposal
	// ─────────────────────────────────────────────────────────────────

	dispose(): void {
		for (const d of this.disposables) {
			d.dispose();
		}
		this.decorationProvider.dispose();
		this.heatTracker.dispose();
		this.recentChanges.clear();
		this.recentDocuments.clear();

		logger.debug("HeatIntegration disposed");
	}
}

// ─────────────────────────────────────────────────────────────────
// Factory Function
// ─────────────────────────────────────────────────────────────────

let heatIntegrationInstance: HeatIntegration | null = null;

/**
 * Initialize the heat integration system.
 * Call during extension activation.
 */
export function initializeHeatIntegration(config?: Partial<HeatConfig>): HeatIntegration {
	if (heatIntegrationInstance) {
		logger.warn("HeatIntegration already initialized, returning existing instance");
		return heatIntegrationInstance;
	}

	heatIntegrationInstance = new HeatIntegration(config);
	return heatIntegrationInstance;
}

/**
 * Get the current heat integration instance.
 * Returns undefined if not initialized.
 */
export function getHeatIntegration(): HeatIntegration | undefined {
	return heatIntegrationInstance ?? undefined;
}

/**
 * Dispose the heat integration system.
 * Call during extension deactivation.
 */
export function disposeHeatIntegration(): void {
	if (heatIntegrationInstance) {
		heatIntegrationInstance.dispose();
		heatIntegrationInstance = null;
	}
}
