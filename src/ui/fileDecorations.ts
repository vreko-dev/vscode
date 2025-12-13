import * as vscode from "vscode";
import type { ProtectedFileRegistry } from "../services/protectedFileRegistry";
import { DesignTokens, type ProtectionLevel } from "../styles/designTokens";
import { logger } from "../utils/logger";

export class FileDecorationProvider implements vscode.FileDecorationProvider, vscode.Disposable {
	private _onDidChangeFileDecorations = new vscode.EventEmitter<vscode.Uri | vscode.Uri[] | undefined>();
	readonly onDidChangeFileDecorations = this._onDidChangeFileDecorations.event;
	private readonly disposables: vscode.Disposable[] = [];

	constructor(private readonly protectedFileRegistry?: ProtectedFileRegistry) {
		// Subscribe to protection changes if registry provided
		if (this.protectedFileRegistry?.onProtectionChanged) {
			const subscription = this.protectedFileRegistry.onProtectionChanged((uris) => {
				logger.debug("[FileDecorationProvider] Protection changed, refreshing decorations", {
					uriCount: uris?.length,
				});
				this.refresh();
			});
			this.disposables.push(subscription);
		}
	}

	static getDecoration(level: ProtectionLevel): vscode.FileDecoration {
		const decorations = {
			watch: {
				badge: DesignTokens.icons.watch, // or Watched if legacy
				tooltip: "Watch - Baseline protection",
				color: new vscode.ThemeColor("charts.green"),
			},
			warn: {
				badge: DesignTokens.icons.warn, // or Warning
				tooltip: "Warning - High-risk changes detected",
				color: new vscode.ThemeColor("charts.orange"),
			},
			block: {
				badge: DesignTokens.icons.block, // or Protected
				tooltip: "Protected - Requires approval to modify",
				color: new vscode.ThemeColor("charts.red"),
			},
		};

		// Map legacy tokens if needed or use updated ones
		// Assuming DesignTokens might still have legacy keys, let's check
		// For now using safe access or anticipated keys
		return new vscode.FileDecoration(
			decorations[level]?.badge || "🟢",
			decorations[level]?.tooltip || "",
			decorations[level]?.color,
		);
	}

	provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
		// Integration with your protection registry
		const level = this.getProtectionLevel(uri);
		if (!level) {
			return undefined;
		}

		return FileDecorationProvider.getDecoration(level);
	}

	private getProtectionLevel(uri: vscode.Uri): ProtectionLevel | undefined {
		// Delegate to ProtectedFileRegistry if available
		if (!this.protectedFileRegistry) {
			return undefined;
		}

		try {
			const level = this.protectedFileRegistry.getProtectionLevel(uri.fsPath);
			return level;
		} catch (error) {
			logger.warn("[FileDecorationProvider] Failed to get protection level", {
				path: uri.fsPath,
				error: error instanceof Error ? error.message : String(error),
			});
			return undefined;
		}
	}

	refresh(): void {
		this._onDidChangeFileDecorations.fire(undefined);
	}

	dispose(): void {
		this._onDidChangeFileDecorations.dispose();
		for (const d of this.disposables) {
			d.dispose();
		}
		this.disposables.length = 0;
	}
}
