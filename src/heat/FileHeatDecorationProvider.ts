/**
 * FileHeatDecorationProvider - VS Code File Decoration Integration
 *
 * Provides visual indicators (badges, colors) for file heat levels
 * in the file explorer and editor tabs.
 */

import { type Disposable, EventEmitter, FileDecoration, type FileDecorationProvider, Uri } from "vscode";
import { logger } from "../utils/logger";
import { AI_BADGE, getHeatDecorationConfig } from "./constants";
import type { HeatTracker } from "./HeatTracker";

/**
 * FileHeatDecorationProvider renders heat indicators on files.
 *
 * Features:
 * - Debounced updates to prevent UI thrashing
 * - AI badge prefix when AI tools are involved
 * - Propagation to parent folders for critical files
 * - Proper disposal of resources
 */
export class FileHeatDecorationProvider implements FileDecorationProvider, Disposable {
	private readonly _onDidChangeFileDecorations = new EventEmitter<Uri | Uri[]>();
	readonly onDidChangeFileDecorations = this._onDidChangeFileDecorations.event;

	private disposables: Disposable[] = [];
	private debounceTimer: NodeJS.Timeout | null = null;
	private pendingUpdates = new Set<string>();

	private readonly DEBOUNCE_DELAY = 100; // 100ms debounce

	constructor(private heatTracker: HeatTracker) {
		// Subscribe to heat changes
		this.disposables.push(
			heatTracker.onHeatChanged((filePaths) => {
				this.queueUpdate(filePaths);
			}),
		);

		logger.debug("FileHeatDecorationProvider initialized");
	}

	/**
	 * Provide decoration for a file URI.
	 * Called by VS Code when rendering files.
	 */
	provideFileDecoration(uri: Uri): FileDecoration | undefined {
		// Only decorate file:// URIs
		if (uri.scheme !== "file") {
			return undefined;
		}

		const assessment = this.heatTracker.assess(uri.fsPath);

		if (assessment.level === "none") {
			return undefined;
		}

		const config = getHeatDecorationConfig(assessment.level);
		if (!config) {
			return undefined;
		}

		// Build badge: AI prefix + heat indicator
		const badge = assessment.aiInvolved ? `${AI_BADGE}${config.badge}` : config.badge;

		// Build tooltip with reasons
		const tooltip = this.buildTooltip(assessment, config.tooltip);

		const decoration = new FileDecoration(badge, tooltip, config.color);
		decoration.propagate = config.propagate;

		return decoration;
	}

	/**
	 * Build tooltip from assessment reasons.
	 */
	private buildTooltip(
		assessment: { level: string; reasons: string[]; aiInvolved: boolean },
		_baseTooltip: string,
	): string {
		const lines = ["SnapBack: File Heat Detected", ""];

		if (assessment.aiInvolved) {
			lines.push("\u2699\uFE0F AI-assisted edits");
		}

		for (const reason of assessment.reasons) {
			if (!reason.includes("AI") && !reason.includes("assisted")) {
				lines.push(`\u2022 ${reason}`);
			}
		}

		lines.push("");
		lines.push(`Heat level: ${assessment.level.toUpperCase()}`);
		lines.push("");
		lines.push("\uD83D\uDCA1 Consider creating a checkpoint");

		return lines.join("\n");
	}

	/**
	 * Queue files for decoration update with debouncing.
	 */
	private queueUpdate(filePaths: string[]): void {
		for (const fp of filePaths) {
			this.pendingUpdates.add(fp);
		}

		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
		}

		this.debounceTimer = setTimeout(() => {
			this.flushUpdates();
		}, this.DEBOUNCE_DELAY);
	}

	/**
	 * Flush pending updates to VS Code.
	 */
	private flushUpdates(): void {
		if (this.pendingUpdates.size === 0) {
			return;
		}

		const uris = Array.from(this.pendingUpdates).map((fp) => Uri.file(fp));
		this.pendingUpdates.clear();

		if (uris.length === 1) {
			this._onDidChangeFileDecorations.fire(uris[0]);
		} else {
			this._onDidChangeFileDecorations.fire(uris);
		}

		logger.debug("Heat decorations updated", { count: uris.length });
	}

	/**
	 * Force immediate update for specific files.
	 */
	forceUpdate(filePaths: string[]): void {
		const uris = filePaths.map((fp) => Uri.file(fp));
		this._onDidChangeFileDecorations.fire(uris);
	}

	/**
	 * Cleanup resources.
	 */
	dispose(): void {
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
			this.debounceTimer = null;
		}
		this._onDidChangeFileDecorations.dispose();
		for (const d of this.disposables) {
			d.dispose();
		}
		this.pendingUpdates.clear();
		logger.debug("FileHeatDecorationProvider disposed");
	}
}
