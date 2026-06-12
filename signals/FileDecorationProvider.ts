/**
 * FileDecorationProvider - Explorer File Heat Decorations
 *
 * File decorations communicate codebase activity without attention cost.
 * They're just there when you look at the explorer.
 *
 * Decoration Types:
 * - Warm (5+ saves): Yellow dot
 * - Hot (10+ saves): Orange flame
 * - AI-modified: Gear icon
 * - Fragile: Diamond icon
 * - AI + Hot: Gear + Flame
 *
 * @module signals/FileDecorationProvider
 * @see docs/plans/vreko_signal_communicaton.md Section 1.3
 */

import * as vscode from "vscode";
import type { SignalState } from "./SignalState";

/**
 * File decoration data
 */
interface FileDecoration {
	badge?: string;
	tooltip?: string;
	propagate?: boolean;
}

/**
 * FileDecorationProvider - Provides heat and status decorations
 *
 * Implements vscode.FileDecorationProvider for native VS Code integration.
 */
export class SignalFileDecorationProvider implements vscode.FileDecorationProvider, vscode.Disposable {
	private signalState: SignalState;
	private _onDidChangeFileDecorations = new vscode.EventEmitter<vscode.Uri | vscode.Uri[]>();
	readonly onDidChangeFileDecorations = this._onDidChangeFileDecorations.event;

	private disposables: vscode.Disposable[] = [];
	private decorationCache = new Map<string, vscode.FileDecoration>();

	/**
	 * Create a new FileDecorationProvider
	 */
	constructor(signalState: SignalState) {
		this.signalState = signalState;

		// Listen for state changes to refresh decorations
		this.disposables.push(
			signalState.onChanged(() => {
				this.refresh();
			}),
		);
	}

	/**
	 * Provide decoration for a file
	 */
	provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
		// Only handle file scheme
		if (uri.scheme !== "file") {
			return undefined;
		}

		const filePath = uri.fsPath;

		// Check cache
		const cached = this.decorationCache.get(filePath);
		if (cached) {
			return cached;
		}

		// Build decoration
		const decoration = this.buildDecoration(filePath);

		if (decoration) {
			const fileDeco: vscode.FileDecoration = {
				badge: decoration.badge,
				tooltip: decoration.tooltip,
				propagate: decoration.propagate ?? false,
			};
			this.decorationCache.set(filePath, fileDeco);
			return fileDeco;
		}

		return undefined;
	}

	/**
	 * Build decoration for a file path
	 */
	private buildDecoration(filePath: string): FileDecoration | null {
		const state = this.signalState;

		const isAI = state.aiModifiedFiles.has(filePath);
		const isFragile = state.fragileFiles.has(filePath);
		const heat = state.getFileHeat(filePath);

		// AI + Hot combination
		if (isAI && heat === "hot") {
			return {
				badge: "⚙️🔥",
				tooltip: "AI + high activity",
			};
		}

		// AI modified
		if (isAI) {
			const tool = state.aiToolsDetected[0] ?? "AI";
			return {
				badge: "⚙️",
				tooltip: `Modified by ${tool}`,
			};
		}

		// Fragile file
		if (isFragile) {
			const reason = state.fragileFiles.get(filePath) ?? "fragile";
			return {
				badge: "◆",
				tooltip: `Fragile: ${reason}`,
			};
		}

		// Hot file (10+ changes)
		if (heat === "hot") {
			const count = state.fileChangeCounts.get(filePath) ?? 0;
			return {
				badge: "🔥",
				tooltip: `High activity: ${count} changes`,
			};
		}

		// Warm file (5+ changes)
		if (heat === "warm") {
			const count = state.fileChangeCounts.get(filePath) ?? 0;
			return {
				badge: "·",
				tooltip: `${count} changes this session`,
			};
		}

		return null;
	}

	/**
	 * Refresh all decorations
	 */
	refresh(): void {
		this.decorationCache.clear();
		this._onDidChangeFileDecorations.fire([]);
	}

	/**
	 * Refresh a specific file
	 */
	refreshFile(uri: vscode.Uri): void {
		this.decorationCache.delete(uri.fsPath);
		this._onDidChangeFileDecorations.fire(uri);
	}

	/**
	 * Dispose resources
	 */
	dispose(): void {
		this._onDidChangeFileDecorations.dispose();
		for (const d of this.disposables) {
			d.dispose();
		}
		this.disposables = [];
	}
}

/**
 * Register the file decoration provider
 */
export function registerFileDecorationProvider(
	context: vscode.ExtensionContext,
	signalState: SignalState,
): SignalFileDecorationProvider {
	const provider = new SignalFileDecorationProvider(signalState);

	// Register with VS Code
	const disposable = vscode.window.registerFileDecorationProvider(provider);
	context.subscriptions.push(disposable);

	return provider;
}
