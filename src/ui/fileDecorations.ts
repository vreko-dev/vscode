import * as vscode from "vscode";
import { DesignTokens, type ProtectionLevel } from "../styles/designTokens";

export class FileDecorationProvider
	implements vscode.FileDecorationProvider, vscode.Disposable
{
	private _onDidChangeFileDecorations = new vscode.EventEmitter<
		vscode.Uri | vscode.Uri[] | undefined
	>();
	readonly onDidChangeFileDecorations = this._onDidChangeFileDecorations.event;

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
		if (!level) return undefined;

		return FileDecorationProvider.getDecoration(level);
	}

	private getProtectionLevel(_uri: vscode.Uri): ProtectionLevel | undefined {
		// TODO: Integrate with your ProtectedFileRegistry
		return undefined;
	}

	refresh(): void {
		this._onDidChangeFileDecorations.fire(undefined);
	}

	dispose(): void {
		this._onDidChangeFileDecorations.dispose();
	}
}
