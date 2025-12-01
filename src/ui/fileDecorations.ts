import * as vscode from "vscode";
import { DesignTokens, type ProtectionLevel } from "../styles/designTokens.js";

export class FileDecorationProvider
	implements vscode.FileDecorationProvider, vscode.Disposable
{
	private _onDidChangeFileDecorations = new vscode.EventEmitter<
		vscode.Uri | vscode.Uri[] | undefined
	>();
	readonly onDidChangeFileDecorations = this._onDidChangeFileDecorations.event;

	static getDecoration(level: ProtectionLevel): vscode.FileDecoration {
		const decorations = {
			Watched: {
				badge: DesignTokens.icons.Watched,
				tooltip: "Watch - Baseline protection",
				color: new vscode.ThemeColor("charts.green"),
			},
			Warning: {
				badge: DesignTokens.icons.Warning,
				tooltip: "Warning - High-risk changes detected",
				color: new vscode.ThemeColor("charts.orange"),
			},
			Protected: {
				badge: DesignTokens.icons.Protected,
				tooltip: "Protected - Requires approval to modify",
				color: new vscode.ThemeColor("charts.red"),
			},
		};

		return new vscode.FileDecoration(
			decorations[level].badge,
			decorations[level].tooltip,
			decorations[level].color,
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
