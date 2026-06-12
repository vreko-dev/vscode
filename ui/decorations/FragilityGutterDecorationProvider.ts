/**
 * FragilityGutterDecorationProvider  -  VSUI-08
 *
 * Applies TextEditorDecorationType-based overview ruler decorations to the
 * active editor based on the file's fragility score from the service.
 *
 * Two decoration tiers:
 *   High (red)       -  fragilityScore >= 0.7  -  charts.red overview ruler
 *   Moderate (yellow)  -  fragilityScore >= 0.3 and < 0.7  -  charts.yellow overview ruler
 *
 * Design notes:
 * - Decoration is applied to Range(0,0,0,0)  -  line 1 only (file-level signal)
 * - 300ms debounce on onDidChangeActiveTextEditor prevents RPC storms
 * - Silent-catch error handling per PATTERNS.md error pattern
 * - TextEditorDecorationTypes MUST be disposed to prevent resource leaks (T-11-04-04)
 * - Guard: vreko.ui.fileDecorationsEnabled
 *
 * @module ui/decorations/FragilityGutterDecorationProvider
 */

import * as vscode from "vscode";
import type { DaemonBridge } from "../../services/DaemonBridge";
import { logger } from "../../utils/logger";

const LOG_PREFIX = "[FragilityGutterDecorationProvider]";

interface FragileFileInfo {
	path: string;
	fragilityScore: number;
	rollbackCount: number;
}

interface FragileFilesResponse {
	files?: FragileFileInfo[];
}

export class FragilityGutterDecorationProvider implements vscode.Disposable {
	/**
	 * Red overview ruler decoration  -  applied when fragilityScore >= 0.7
	 * MUST be disposed in dispose()  -  TextEditorDecorationType leaks if not disposed.
	 */
	private readonly highDecoration = vscode.window.createTextEditorDecorationType({
		overviewRulerColor: new vscode.ThemeColor("charts.red"),
		overviewRulerLane: vscode.OverviewRulerLane.Right,
	});

	/**
	 * Yellow overview ruler decoration  -  applied when fragilityScore >= 0.3 and < 0.7
	 * MUST be disposed in dispose()  -  TextEditorDecorationType leaks if not disposed.
	 */
	private readonly moderateDecoration = vscode.window.createTextEditorDecorationType({
		overviewRulerColor: new vscode.ThemeColor("charts.yellow"),
		overviewRulerLane: vscode.OverviewRulerLane.Right,
	});

	/** Map of absolute file paths → fragility scores (from most recent RPC response) */
	private fragilityMap = new Map<string, number>();

	/** All disposables owned by this provider */
	private readonly disposables: vscode.Disposable[] = [];

	/** Debounce timer handle  -  300ms debounce prevents RPC storms during rapid tab switching (T-11-04-02) */
	private _debounceTimer: ReturnType<typeof setTimeout> | undefined;

	constructor(private readonly serviceBridge: DaemonBridge) {
		this.disposables.push(
			vscode.window.onDidChangeActiveTextEditor(() => {
				clearTimeout(this._debounceTimer);
				this._debounceTimer = setTimeout(() => void this.refreshActiveEditor(), 300);
			}),
			this.serviceBridge.onSessionStarted(() => void this.refreshActiveEditor()),
		);
	}

	/**
	 * Fetches the latest fragile-files list from the service and applies decorations
	 * to the currently active editor.
	 *
	 * Error path: on any RPC failure, decorations are silently cleared (no toast).
	 * Config guard: if fileDecorationsEnabled = false, decorations are cleared without RPC call.
	 */
	private async refreshActiveEditor(): Promise<void> {
		const editor = vscode.window.activeTextEditor;
		if (!editor) return;

		if (!vscode.workspace.getConfiguration("vreko.ui").get("fileDecorationsEnabled", true)) {
			editor.setDecorations(this.highDecoration, []);
			editor.setDecorations(this.moderateDecoration, []);
			return;
		}

		try {
			const result = await this.serviceBridge.request<FragileFilesResponse>("intelligence/fragile-files", {});
			this.fragilityMap.clear();
			for (const f of result?.files ?? []) {
				this.fragilityMap.set(f.path, f.fragilityScore);
			}
			this._applyDecorations(editor);
		} catch (err) {
			logger.debug(`${LOG_PREFIX} Failed to refresh fragile files`, { err });
			editor.setDecorations(this.highDecoration, []);
			editor.setDecorations(this.moderateDecoration, []);
		}
	}

	/**
	 * Applies the correct decoration tier to line 1 of the given editor,
	 * based on the file's fragility score in fragilityMap.
	 *
	 * - score >= 0.7 → highDecoration (red), moderateDecoration cleared
	 * - score >= 0.3 → moderateDecoration (yellow), highDecoration cleared
	 * - score < 0.3 or not in map → both cleared
	 */
	private _applyDecorations(editor: vscode.TextEditor): void {
		const fsPath = editor.document.uri.fsPath;
		const score = this.fragilityMap.get(fsPath);
		const range = new vscode.Range(0, 0, 0, 0);

		if (score !== undefined && score >= 0.7) {
			editor.setDecorations(this.highDecoration, [{ range }]);
			editor.setDecorations(this.moderateDecoration, []);
		} else if (score !== undefined && score >= 0.3) {
			editor.setDecorations(this.moderateDecoration, [{ range }]);
			editor.setDecorations(this.highDecoration, []);
		} else {
			editor.setDecorations(this.highDecoration, []);
			editor.setDecorations(this.moderateDecoration, []);
		}
	}

	/**
	 * Disposes all owned resources.
	 *
	 * CRITICAL: TextEditorDecorationTypes MUST be explicitly disposed  -  VS Code
	 * does not automatically dispose them when the extension deactivates (T-11-04-04).
	 */
	dispose(): void {
		clearTimeout(this._debounceTimer);
		this.highDecoration.dispose();
		this.moderateDecoration.dispose();
		for (const d of this.disposables) {
			d.dispose();
		}
	}
}
