import * as path from "node:path";
import * as vscode from "vscode";
import type { ProtectionLevel } from "../types/protection.js";

type HatLevel = ProtectionLevel;

export class SnapBackRCDecorator
	implements vscode.FileDecorationProvider, vscode.Disposable
{
	private readonly emitter = new vscode.EventEmitter<
		vscode.Uri | vscode.Uri[] | undefined
	>();
	readonly onDidChangeFileDecorations = this.emitter.event;

	private protectionLevel: HatLevel = "Warning";

	provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
		const fileName = path.basename(uri.fsPath);
		if (fileName !== ".snapbackrc") {
			return undefined;
		}

		return {
			badge: "\u{1f7e1}",
			tooltip: `SnapBack Configuration\n• Auto-protected at ${this.protectionLevel} level\n• Click to edit configuration`,
			color: this.getColorForLevel(this.protectionLevel),
			propagate: false,
		};
	}

	updateProtectionLevel(level: HatLevel): void {
		this.protectionLevel = level;
		this.refresh();
	}

	refresh(uri?: vscode.Uri): void {
		this.emitter.fire(uri);
	}

	private getColorForLevel(level: HatLevel): vscode.ThemeColor {
		const colorMap: Record<HatLevel, string> = {
			Watched: "charts.green",
			Warning: "charts.orange",
			Protected: "charts.red",
		};
		return new vscode.ThemeColor(colorMap[level]);
	}

	dispose(): void {
		this.emitter.dispose();
	}
}
