/**
 * Protection CodeLens Provider
 *
 * Shows inline protection level indicators at the top of files:
 * - Watch (Silent auto-snapshot)
 * - Warn (Confirmation required)
 * - Block (Note required)
 *
 * Clicking the CodeLens allows changing protection level.
 */

import * as vscode from "vscode";
import type { ProtectedFileRegistry } from "../services/protectedFileRegistry";
import { getProtectionLevelSignage } from "../signage/index";

export class ProtectionCodeLensProvider implements vscode.CodeLensProvider {
	private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
	public readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

	constructor(private readonly protectedFileRegistry: ProtectedFileRegistry) {
		// Listen for protection level changes
		this.protectedFileRegistry.onProtectionChanged(() => {
			this._onDidChangeCodeLenses.fire();
		});
	}

	provideCodeLenses(
		document: vscode.TextDocument,
		_token: vscode.CancellationToken,
	): vscode.CodeLens[] | Thenable<vscode.CodeLens[]> {
		const codeLenses: vscode.CodeLens[] = [];

		// Only show CodeLens for workspace files
		if (document.uri.scheme !== "file") {
			return codeLenses;
		}

		// Get protection level for this file
		const filePath = document.uri.fsPath;
		const protectionLevel =
			this.protectedFileRegistry.getProtectionLevel(filePath);

		if (!protectionLevel) {
			// No protection - show option to protect
			codeLenses.push(
				new vscode.CodeLens(new vscode.Range(0, 0, 0, 0), {
					title: "🔓 Unprotected - Click to protect",
					command: "snapback.protectCurrentFile",
					arguments: [document.uri],
				}),
			);
		} else {
			// Show current protection level
			const icon = this.getProtectionIcon(protectionLevel);
			const label = this.getProtectionLabel(protectionLevel);

			codeLenses.push(
				new vscode.CodeLens(new vscode.Range(0, 0, 0, 0), {
					title: `${icon} Protected: ${label} - Click to change`,
					command: "snapback.changeProtectionLevel",
					arguments: [document.uri],
				}),
			);
		}

		return codeLenses;
	}

	resolveCodeLens(
		codeLens: vscode.CodeLens,
		_token: vscode.CancellationToken,
	): vscode.CodeLens | Thenable<vscode.CodeLens> {
		// CodeLens is already resolved
		return codeLens;
	}

	/**
	 * Get icon for protection level using canonical signage
	 */
	private getProtectionIcon(
		level: "watch" | "warn" | "block" | undefined,
	): string {
		switch (level) {
			case "watch":
				return getProtectionLevelSignage("watch").emoji || "🟢";
			case "warn":
				return getProtectionLevelSignage("warn").emoji || "🟡";
			case "block":
				return getProtectionLevelSignage("block").emoji || "🔴";
			default:
				return "🔓";
		}
	}

	/**
	 * Get human-readable label for protection level using canonical signage
	 */
	private getProtectionLabel(
		level: "watch" | "warn" | "block" | undefined,
	): string {
		switch (level) {
			case "watch":
				return `${getProtectionLevelSignage("watch").label} (Silent)`;
			case "warn":
				return `${getProtectionLevelSignage("warn").label} (Confirm)`;
			case "block":
				return `${getProtectionLevelSignage("block").label} (Required)`;
			default:
				return "None";
		}
	}

	/**
	 * Refresh CodeLens display
	 */
	public refresh(): void {
		this._onDidChangeCodeLenses.fire();
	}

	/**
	 * Dispose of resources
	 */
	public dispose(): void {
		this._onDidChangeCodeLenses.dispose();
	}
}
