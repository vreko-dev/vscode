/**
 * Session Commands - VS Code command handlers for session operations
 *
 * Commands:
 * - snapback.session.finalize: Manually finalize active session
 * - snapback.session.rollback: Rollback to a specific session
 * - snapback.session.reveal: Show session details in output panel
 */

import type { SessionSummary } from "@snapback/contracts/session";
import { logger } from "@snapback/infrastructure";
import type { SessionManager } from "@snapback/sdk";
import * as vscode from "vscode";
import type { SessionsTreeDataProvider } from "../../views/SessionsTreeDataProvider";
import { registerCommandSafely } from "../index.js";

/**
 * Register all session commands with safe duplicate handling.
 *
 * Uses registerCommandSafely to prevent "command already exists" errors
 * when the extension reactivates (e.g., during reload or hot reload).
 */
export function registerSessionCommands(
	context: vscode.ExtensionContext,
	sessionManager: SessionManager,
	treeProvider: SessionsTreeDataProvider,
): void {
	// Command: Finalize active session
	context.subscriptions.push(
		registerCommandSafely("snapback.session.finalize", async () => {
			await finalizeSession(sessionManager, treeProvider);
		}),
	);

	// Command: Rollback session
	context.subscriptions.push(
		registerCommandSafely(
			"snapback.session.rollback",
			async (sessionId?: string) => {
				await rollbackSession(sessionManager, treeProvider, sessionId);
			},
		),
	);

	// Command: Reveal session details
	context.subscriptions.push(
		registerCommandSafely(
			"snapback.session.reveal",
			async (sessionId?: string) => {
				await revealSession(sessionManager, sessionId);
			},
		),
	);
}

/**
 * Finalize active session
 */
async function finalizeSession(
	sessionManager: SessionManager,
	treeProvider: SessionsTreeDataProvider,
): Promise<void> {
	try {
		// Check if there's an active session
		const current = await sessionManager.current();

		if (!current.sessionId) {
			vscode.window.showWarningMessage("No active session to finalize");
			return;
		}

		// Show progress
		await vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.Notification,
				title: "Finalizing session...",
				cancellable: false,
			},
			async (_progress) => {
				const result = await sessionManager.finalize();
				const { sessionId, changeCount } = result;

				logger.info("Session finalized", { sessionId, changeCount });

				vscode.window.showInformationMessage(
					`Session finalized: ${changeCount} file changes recorded`,
				);

				// Refresh tree view
				treeProvider.refresh();
			},
		);
	} catch (error) {
		logger.error("Session finalization failed", error as Error);
		vscode.window.showErrorMessage(
			`Failed to finalize session: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

/**
 * Rollback to a session
 */
async function rollbackSession(
	sessionManager: SessionManager,
	treeProvider: SessionsTreeDataProvider,
	sessionId?: string,
): Promise<void> {
	try {
		// If no sessionId provided, show quick pick
		if (!sessionId) {
			const sessions = await sessionManager.list(20);

			if (sessions.length === 0) {
				vscode.window.showWarningMessage("No sessions available for rollback");
				return;
			}

			const items = sessions.map((session: SessionSummary) => ({
				label:
					session.name ||
					`Session ${new Date(session.startedAt).toLocaleString()}`,
				description: `${session.changeCount} files`,
				detail: `Session ID: ${session.sessionId}`,
				sessionId: session.sessionId,
			}));

			const selected = await vscode.window.showQuickPick(items, {
				placeHolder: "Select session to rollback to",
			});

			if (!selected) {
				return; // User cancelled
			}

			sessionId = selected.sessionId;
		}

		// Confirm rollback
		const confirmation = await vscode.window.showWarningMessage(
			`Rolling back will restore all files from session ${sessionId}. This action cannot be undone.`,
			{ modal: true },
			"Rollback",
			"Cancel",
		);

		if (confirmation !== "Rollback") {
			return;
		}

		// Show progress
		await vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.Notification,
				title: "Rolling back session...",
				cancellable: false,
			},
			async (_progress) => {
				const result = await sessionManager.rollback(sessionId!, {
					dryRun: false,
				});

				if (!result.success) {
					const errorMsg =
						result.errors && result.errors.length > 0
							? result.errors[0].error
							: "Rollback failed";
					throw new Error(errorMsg);
				}

				const filesRestored = result.filesReverted.length;
				const skipped = result.filesSkipped.length;

				logger.info("Session rollback complete", {
					sessionId,
					filesRestored,
					skipped,
				});

				vscode.window.showInformationMessage(
					`Rollback complete: ${filesRestored} files restored, ${skipped} skipped`,
				);

				// Refresh tree view
				treeProvider.refresh();
			},
		);
	} catch (error) {
		logger.error("Session rollback failed", error as Error);
		vscode.window.showErrorMessage(
			`Failed to rollback session: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

/**
 * Reveal session details in output panel
 */
async function revealSession(
	sessionManager: SessionManager,
	sessionId?: string,
): Promise<void> {
	try {
		// If no sessionId provided, use current session
		if (!sessionId) {
			const current = await sessionManager.current();

			if (!current.sessionId) {
				vscode.window.showWarningMessage("No active session");
				return;
			}

			sessionId = current.sessionId;
		}

		// Get session manifest
		const manifest = await sessionManager.getManifest(sessionId);

		// Create output channel
		const outputChannel = vscode.window.createOutputChannel(
			"SnapBack Session Details",
		);
		outputChannel.clear();

		// Write session details
		outputChannel.appendLine("=== Session Details ===");
		outputChannel.appendLine(`Session ID: ${manifest.sessionId}`);
		outputChannel.appendLine(`Name: ${manifest.name || "(unnamed)"}`);
		outputChannel.appendLine(
			`Started: ${new Date(manifest.startedAt).toLocaleString()}`,
		);

		if (manifest.endedAt) {
			outputChannel.appendLine(
				`Ended: ${new Date(manifest.endedAt).toLocaleString()}`,
			);

			const duration =
				new Date(manifest.endedAt).getTime() -
				new Date(manifest.startedAt).getTime();
			const minutes = Math.floor(duration / 60000);
			outputChannel.appendLine(`Duration: ${minutes} minutes`);
		} else {
			outputChannel.appendLine("Status: Active");
		}

		outputChannel.appendLine(`Triggers: ${manifest.triggers.join(", ")}`);
		outputChannel.appendLine(
			`Total file changes: ${manifest.filesChanged.length}`,
		);
		outputChannel.appendLine("");

		// List file changes (limited to 100)
		outputChannel.appendLine("=== File Changes ===");

		const displayLimit = 100;
		const filesToShow = manifest.filesChanged.slice(0, displayLimit);

		for (const change of filesToShow) {
			const op = change.op.toUpperCase().padEnd(10);
			let line = `${op} ${change.p}`;

			if (change.from) {
				line += ` (renamed from ${change.from})`;
			}

			outputChannel.appendLine(line);
		}

		if (manifest.filesChanged.length > displayLimit) {
			outputChannel.appendLine(
				`\n... and ${manifest.filesChanged.length - displayLimit} more files`,
			);
		}

		// Show output channel
		outputChannel.show(true);

		logger.info("Session details revealed", { sessionId });
	} catch (error) {
		logger.error("Failed to reveal session", error as Error);
		vscode.window.showErrorMessage(
			`Failed to show session details: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}
