/**
 * ProgressIndicator  -  withProgress wrapper for Vreko session lifecycle events.
 *
 *   onSessionStarted → Window-level "Opening Vreko session…" (1.5s)
 *   onSessionEnding  → Notification-level "Generating closing ceremony…" (3s)
 */

import * as vscode from "vscode";

export class ProgressIndicator {
	onSessionStarted(): void {
		void vscode.window.withProgress(
			{ location: vscode.ProgressLocation.Window, title: "Opening Vreko session…" },
			() => new Promise<void>((resolve) => setTimeout(resolve, 1500)),
		);
	}

	onSessionEnding(): void {
		void vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.Notification,
				title: "Generating closing ceremony…",
				cancellable: false,
			},
			() => new Promise<void>((resolve) => setTimeout(resolve, 3000)),
		);
	}
}
