import * as vscode from "vscode";
import { PIONEER_DASHBOARD_URL } from "../constants";
import type { PioneerGatekeeper } from "../pioneer/PioneerGatekeeper";

export class PioneerStatusItem implements vscode.Disposable {
	private statusBarItem: vscode.StatusBarItem;
	private disposables: vscode.Disposable[] = [];

	constructor(
		_context: vscode.ExtensionContext,
		private readonly gatekeeper: PioneerGatekeeper,
	) {
		this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
		this.disposables.push(this.statusBarItem);

		// Register command for click action
		const commandId = "snapback.pioneer.statusBarClick";
		this.disposables.push(vscode.commands.registerCommand(commandId, this.handleClick.bind(this)));
		this.statusBarItem.command = commandId;

		// Listen for status changes - VS Code EventEmitter returns disposable
		this.disposables.push(this.gatekeeper.onDidChangeStatus(() => this.update()));

		// Initial update
		this.update();
		this.statusBarItem.show();
	}

	private update() {
		const profile = this.gatekeeper.getProfile();

		if (profile) {
			const emoji = this.gatekeeper.getTierEmoji(profile.tier);
			const tierName = profile.tier.charAt(0).toUpperCase() + profile.tier.slice(1);
			this.statusBarItem.text = `${emoji} ${profile.totalPoints} pts`;
			this.statusBarItem.tooltip = `Pioneer: ${tierName} tier\n${profile.totalPoints} points\nClick to open dashboard`;
		} else {
			this.statusBarItem.text = "$(rocket) Join Pioneers";
			this.statusBarItem.tooltip = "Click to join the Pioneer program";
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
		for (const d of this.disposables) {
			d.dispose();
		}
	}
}
