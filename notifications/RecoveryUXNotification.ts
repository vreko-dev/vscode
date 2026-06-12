/**
 * RecoveryUXNotification - The Viral Moment Component
 *
 * Shows the notification that makes Pioneers tweet:
 * "AI tried to delete auth.ts  -  Vreko protected it"
 *
 * Responsibilities:
 * 1. Display protection alert with action buttons
 * 2. Execute user-selected action (View Diff, Restore, Share)
 * 3. Handle errors gracefully
 * 4. Support AI tool detection (Cursor, Copilot, etc)
 *
 * @package apps/vscode
 */

import * as path from "node:path";
import * as vscode from "vscode";
import { logger } from "../utils/logger";

export interface ProtectionEvent {
	filePath: string;
	snapshotId: string;
	aiTool?: string; // "Cursor" | "Copilot" | "Claude" | undefined
	operationType: string; // "delete" | "overwrite" | "bulk-change"
	linesAffected?: number;
}

/**
 * RecoveryUXNotification handles the user-facing notification when protection triggers.
 *
 * The viral moment: When an AI tries to delete/overwrite a file and Vreko stops it,
 * the user sees a toast notification with action buttons. This is what drives adoption.
 */
export class RecoveryUXNotification {
	/**
	 * Show protection alert notification with action buttons.
	 *
	 * Message format:
	 * - With AI tool: "{AI_TOOL} tried to {operation} {fileName}  -  Vreko protected it"
	 * - Without AI tool: "AI tried to {operation} {fileName}  -  Vreko protected it"
	 *
	 * @param event The protection event that triggered the notification
	 */
	async showProtectionAlert(event: ProtectionEvent): Promise<void> {
		logger.debug("showProtectionAlert called", { event });

		if (!event) {
			logger.warn("RecoveryUXNotification.showProtectionAlert called with null event");
			return;
		}

		try {
			const fileName = path.basename(event.filePath || "file");
			const action = event.operationType === "delete" ? "delete" : "overwrite";
			const aiLabel = event.aiTool || "AI";

			// The viral message
			const message = `${aiLabel} tried to ${action} ${fileName}  -  Vreko protected it`;

			logger.info("Showing recovery UX notification", {
				message,
				snapshotId: event.snapshotId,
			});

			// Show notification with action buttons + timeout wrapper (Bug #3 fix)
			const selection = await Promise.race([
				vscode.window.showInformationMessage(message, "View Diff", "Restore", "Share"),
				new Promise<undefined>((resolve) =>
					setTimeout(() => {
						logger.debug("Notification timed out after 30s - possible DND mode or modal conflict");
						resolve(undefined);
					}, 30000),
				),
			]);

			logger.debug("User responded to notification", { selection: selection || "dismissed/timeout" });

			// Handle user action
			switch (selection) {
				case "View Diff":
					await this.openDiffView(event);
					break;
				case "Restore":
					await this.triggerRestore(event);
					break;
				case "Share":
					await this.shareProtection(event);
					break;
				default:
					// User dismissed notification
					logger.debug("User dismissed recovery notification");
					break;
			}
		} catch (error) {
			logger.error("Error in showProtectionAlert", error instanceof Error ? error : undefined);
			// Fail gracefully - don't crash the extension
		}
	}

	/**
	 * Open VS Code diff viewer showing before/after snapshot.
	 *
	 * 🐛 FIX: Command expects a vscode.Uri, not a snapshotId string
	 * Previously: passed snapshotId which caused type mismatch and silent failure
	 * Now: pass the file URI so compareWithSnapshot can find the latest snapshot
	 *
	 * @param event The protection event with file path and snapshot ID
	 */
	private async openDiffView(event: ProtectionEvent): Promise<void> {
		if (!event.filePath) {
			logger.warn("Cannot open diff view without file path");
			return;
		}

		try {
			// 🐛 FIX: Pass file URI instead of snapshotId
			// The compareWithSnapshot command expects a vscode.Uri to find the file's latest snapshot
			const fileUri = vscode.Uri.file(event.filePath);
			await vscode.commands.executeCommand("vreko.compareWithSnapshot", fileUri);
			logger.info("Opened diff view", { filePath: event.filePath, snapshotId: event.snapshotId });
		} catch (error) {
			logger.error("Failed to open diff view", error instanceof Error ? error : undefined);
			vscode.window.showErrorMessage("Failed to open diff view. Please try from the Snapshots panel.");
		}
	}

	/**
	 * Trigger the restore flow to revert to snapshot.
	 *
	 * @param event The protection event with snapshot ID
	 */
	private async triggerRestore(event: ProtectionEvent): Promise<void> {
		if (!event.snapshotId) {
			logger.warn("Cannot restore without snapshot ID");
			return;
		}

		try {
			await vscode.commands.executeCommand("vreko.vreko", event.snapshotId);
			logger.info("Triggered restore", { snapshotId: event.snapshotId });
		} catch (error) {
			logger.error("Failed to trigger restore", error instanceof Error ? error : undefined);
		}
	}

	/**
	 * Generate shareable content and offer Twitter link.
	 *
	 * Copy pre-formatted tweet to clipboard with option to open Twitter.
	 * This is the viral growth engine - makes users want to share.
	 *
	 * @param event The protection event with file and AI tool info
	 */
	private async shareProtection(event: ProtectionEvent): Promise<void> {
		try {
			const fileName = path.basename(event.filePath || "file");

			// Generate tweet-ready text
			const shareText = `@VrekoDev caught an AI ${event.operationType || "modify"} on ${fileName} and protected it 🛡️`;

			// Copy to clipboard
			await vscode.env.clipboard.writeText(shareText);
			logger.info("Copied share text to clipboard");

			// Offer to open Twitter
			const selection = await vscode.window.showInformationMessage(
				"Share text copied to clipboard.",
				"Open Twitter",
			);

			if (selection === "Open Twitter") {
				const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;
				await vscode.env.openExternal(vscode.Uri.parse(twitterUrl));
				logger.info("Opened Twitter for sharing");
			}
		} catch (error) {
			logger.error("Error in shareProtection", error instanceof Error ? error : undefined);
			// Fail gracefully
		}
	}
}
