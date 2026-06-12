/**
 * Recurrence Notification Manager (INTEL-13)
 *
 * Surfaces recurrence candidates to the user when they are editing a file
 * that matches a prior reverted pattern. All wording is confidence-bound
 * and sourced from the daemon's calibration layer - no causal language.
 *
 * Architecture: thin client only. All detection logic runs in the daemon;
 * this module only formats and displays what the daemon returns.
 *
 * Wording invariant: no causal attribution, no certainty claims (INTEL-08).
 * The daemon enforces this via the INTEL-08 confidence-to-language mapping.
 * This module passes daemon wording through verbatim.
 */

import * as vscode from "vscode";
import { logger } from "../utils/logger";

interface RecurrenceCandidate {
	file: string;
	confidence: number;
	wording: string;
	coChangePartners: string[];
}

interface RecurrenceCandidatesResult {
	candidates: RecurrenceCandidate[];
	total: number;
}

type DaemonClient = {
	request<T>(method: string, params: Record<string, unknown>): Promise<T>;
};

/** Minimum interval (ms) between notifications for the same file */
const NOTIFY_COOLDOWN_MS = 5 * 60 * 1000;

/**
 * RecurrenceNotificationManager
 *
 * Subscribes to file-open and file-save events. When the active file has a
 * recurrence candidate from the daemon, shows a non-blocking information
 * message with confidence-bound wording (INTEL-08).
 *
 * Extension code must not import @vreko/intelligence directly (ARCH-09).
 * All data comes from the daemon via request().
 */
export class RecurrenceNotificationManager {
	private readonly lastNotifiedAt = new Map<string, number>();
	private readonly subscriptions: vscode.Disposable[] = [];

	constructor(
		private readonly daemonRequest: DaemonClient["request"],
		private readonly workspace: string,
	) {}

	/**
	 * Register event subscriptions. Call once during phase 4b initialization.
	 * Returns a disposable that unregisters all subscriptions.
	 */
	register(context: vscode.ExtensionContext): vscode.Disposable {
		this.subscriptions.push(
			vscode.window.onDidChangeActiveTextEditor((editor) => {
				if (editor?.document.uri.scheme === "file") {
					this.checkFile(editor.document.uri.fsPath).catch((err) => {
						logger.warn("RecurrenceNotificationManager: checkFile error", { err });
					});
				}
			}),
		);

		const composite = vscode.Disposable.from(...this.subscriptions);
		context.subscriptions.push(composite);
		return composite;
	}

	private async checkFile(absolutePath: string): Promise<void> {
		// Cooldown: skip if we already notified about this file recently
		const lastNotified = this.lastNotifiedAt.get(absolutePath) ?? 0;
		if (Date.now() - lastNotified < NOTIFY_COOLDOWN_MS) return;

		// Derive workspace-relative path
		const relativePath = vscode.workspace.asRelativePath(absolutePath, false);
		if (!relativePath || relativePath === absolutePath) return;

		let result: RecurrenceCandidatesResult;
		try {
			result = await this.daemonRequest<RecurrenceCandidatesResult>("intelligence/recurrence-candidates", {
				workspace: this.workspace,
				files: [relativePath],
				window: "30d",
			});
		} catch (err) {
			// Non-fatal: daemon may not have aggregate data yet
			logger.debug("RecurrenceNotificationManager: daemon request failed", { relativePath, err });
			return;
		}

		const candidate = result?.candidates?.[0];
		if (!candidate) return;

		this.lastNotifiedAt.set(absolutePath, Date.now());

		// Use daemon-provided wording verbatim (confidence-bound, no causal language)
		const message = `Vreko: ${candidate.wording} (${relativePath})`;
		const detail = `Your agent is editing a pattern that resembles a prior reverted change in this file.`;

		void vscode.window.showInformationMessage(message, { detail }, "Dismiss");
		logger.info("RecurrenceNotificationManager: candidate surfaced", {
			file: relativePath,
			confidence: candidate.confidence,
		});
	}

	dispose(): void {
		for (const sub of this.subscriptions) {
			sub.dispose();
		}
		this.subscriptions.length = 0;
	}
}
