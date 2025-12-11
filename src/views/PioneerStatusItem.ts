import * as vscode from "vscode";
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

		// Listen for status changes
		this.gatekeeper.onDidChangePioneerStatus.on("change", () => this.update());

		// Initial update
		this.update();
		this.statusBarItem.show();
	}

	private update() {
		// We need to access the profile from gatekeeper.
		// Assuming gatekeeper exposes specific getters or we cast/access public state if available.
		// For now, let's assume we can get tierRank or check features.
		// Ideally Gatekeeper should expose `currentProfile` getter.

		// Check if gatekeeper has a profile exposed?
		// In previous step I implemented `private currentProfile`. I should strictly add a getter if needed.
		// Or I can use `canUseFeature` as a proxy, or `tierRank` if I make it public.
		// Let's modify Gatekeeper to expose profile or `isPioneer` boolean.

		// Let's use `canUseFeature('clusters')` which returns true for all pioneers (if profile exists).
		const isPioneer = this.gatekeeper.canUseFeature("clusters");

		if (isPioneer) {
			// How to get points? Gatekeeper needs access to points?
			// Profile has totalPoints.
			// I need to update Gatekeeper to expose profile or points.
			// Let's assume for now I'll fix Gatekeeper in a moment.
			this.statusBarItem.text = "$(sprout) Pioneer";
			this.statusBarItem.tooltip = "Click to open Pioneer Dashboard";
		} else {
			this.statusBarItem.text = "$(rocket) Join Pioneers";
			this.statusBarItem.tooltip = "Click to join the Pioneer program";
		}
	}

	private async handleClick() {
		const isPioneer = this.gatekeeper.canUseFeature("clusters");
		if (isPioneer) {
			vscode.window.showInformationMessage("Opening Pioneer Dashboard... (Stub)");
		} else {
			const selection = await vscode.window.showInformationMessage(
				"Join the Pioneer Program to unlock features!",
				"Login with GitHub",
			);
			if (selection === "Login with GitHub") {
				// Trigger login via PioneerAuth (which should be accessible, or Gatekeeper triggers it?)
				// Ideally this should call a command that uses PioneerAuth.
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
