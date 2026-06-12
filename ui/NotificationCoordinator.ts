/**
 * NotificationCoordinator  -  consolidates NotificationManager + NotificationQueue.
 *
 * Features:
 *   - 60s per-type dedup: same event type won't show twice within 60s
 *   - Notification level guard: "silent" suppresses all; "quiet" shows only ceremony-ready
 *   - Three ambient event types: agent-edited-fragile, agent-ignored-warning, ceremony-ready
 *
 * Usage:
 *   const coordinator = new NotificationCoordinator();
 *   coordinator.show('agent-edited-fragile', '⚠ Agent edited fragile file: auth.ts', 'View history');
 */

import * as vscode from "vscode";

export class NotificationCoordinator implements vscode.Disposable {
	private readonly dedupMap = new Map<string, number>();
	private readonly DEDUP_WINDOW_MS = 60_000;

	show(type: string, message: string, ...actions: string[]): void {
		const level = vscode.workspace.getConfiguration("vreko.ui").get<string>("notificationLevel", "normal");

		if (level === "silent") {
			return;
		}
		if (level === "quiet" && type !== "ceremony-ready") {
			return;
		}

		const lastShown = this.dedupMap.get(type) ?? 0;
		if (Date.now() - lastShown < this.DEDUP_WINDOW_MS) {
			return;
		}

		this.dedupMap.set(type, Date.now());
		void vscode.window.showInformationMessage(message, ...actions);
	}

	showWarning(type: string, message: string, ...actions: string[]): void {
		const level = vscode.workspace.getConfiguration("vreko.ui").get<string>("notificationLevel", "normal");

		if (level === "silent") {
			return;
		}
		if (level === "quiet" && type !== "ceremony-ready") {
			return;
		}

		const lastShown = this.dedupMap.get(type) ?? 0;
		if (Date.now() - lastShown < this.DEDUP_WINDOW_MS) {
			return;
		}

		this.dedupMap.set(type, Date.now());
		void vscode.window.showWarningMessage(message, ...actions);
	}

	showError(type: string, message: string, ...actions: string[]): void {
		const lastShown = this.dedupMap.get(type) ?? 0;
		if (Date.now() - lastShown < this.DEDUP_WINDOW_MS) {
			return;
		}

		this.dedupMap.set(type, Date.now());
		void vscode.window.showErrorMessage(message, ...actions);
	}

	dispose(): void {
		this.dedupMap.clear();
	}
}
