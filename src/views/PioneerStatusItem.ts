import * as vscode from "vscode";
import { PIONEER_DASHBOARD_URL } from "../constants";
import type { PioneerGatekeeper } from "../pioneer/PioneerGatekeeper";
import type { StatusBarManager } from "../ui/StatusBarManager";

/**
 * Pioneer Status Item
 *
 * REFACTORED: Now delegates to StatusBarManager's message queue
 * instead of creating a separate status bar item.
 *
 * This reduces status bar clutter by sharing the single SnapBack status bar.
 */
export class PioneerStatusItem implements vscode.Disposable {
	private disposables: vscode.Disposable[] = [];
	private currentMessageId: string | undefined;

	/** Unique ID prefix for this component's messages */
	private static readonly MESSAGE_PREFIX = "pioneer";

	constructor(
		_context: vscode.ExtensionContext,
		private readonly gatekeeper: PioneerGatekeeper,
		private readonly statusBarManager: StatusBarManager,
	) {
		// Register command for click action (used by queued message)
		const commandId = "snapback.pioneer.statusBarClick";
		this.disposables.push(vscode.commands.registerCommand(commandId, this.handleClick.bind(this)));

		// Listen for status changes
		this.disposables.push(this.gatekeeper.onDidChangeStatus(() => this.update()));

		// Initial update - show pioneer status with low priority
		this.update();
	}

	private update() {
		const profile = this.gatekeeper.getProfile();

		// Remove existing message if any
		if (this.currentMessageId) {
			this.statusBarManager.dequeueMessage(this.currentMessageId);
			this.currentMessageId = undefined;
		}

		// Build message based on profile status
		if (profile) {
			const emoji = this.gatekeeper.getTierEmoji(profile.tier);
			const tierName = profile.tier.charAt(0).toUpperCase() + profile.tier.slice(1);

			// Logged in pioneers: show points briefly, then let other messages take over
			this.currentMessageId = this.statusBarManager.enqueueMessage({
				id: `${PioneerStatusItem.MESSAGE_PREFIX}-points`,
				priority: "low",
				text: `${emoji} ${profile.totalPoints} pts`,
				tooltip: `**Pioneer: ${tierName} tier**\n${profile.totalPoints} points\n\n*Click to open dashboard*`,
				duration: 8000, // Show for 8 seconds, then cycle to next message
				command: "snapback.pioneer.statusBarClick",
			});
		} else {
			// Non-pioneers: show join prompt occasionally
			this.currentMessageId = this.statusBarManager.enqueueMessage({
				id: `${PioneerStatusItem.MESSAGE_PREFIX}-join`,
				priority: "low",
				text: "$(rocket) Join Pioneers",
				tooltip: "**Pioneer Program**\nUnlock exclusive features!\n\n*Click to join*",
				duration: 10000, // Show for 10 seconds
				command: "snapback.pioneer.statusBarClick",
			});
		}
	}

	private async handleClick() {
		const profile = this.gatekeeper.getProfile();
		if (profile) {
			// Open Pioneer dashboard in browser
			vscode.env.openExternal(vscode.Uri.parse(PIONEER_DASHBOARD_URL));
		} else {
			const selection = await vscode.window.showInformationMessage(
				"Join the Pioneer Program to unlock features!",
				"Login with GitHub",
			);
			if (selection === "Login with GitHub") {
				vscode.commands.executeCommand("snapback.pioneer.login");
			}
		}
	}

	dispose() {
		// Remove queued message
		if (this.currentMessageId) {
			this.statusBarManager.dequeueMessage(this.currentMessageId);
		}
		for (const d of this.disposables) {
			d.dispose();
		}
	}
}
