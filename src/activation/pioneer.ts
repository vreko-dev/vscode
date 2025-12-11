import * as vscode from "vscode";
import { PioneerAuth } from "../pioneer/PioneerAuth";
import { PioneerGatekeeper } from "../pioneer/PioneerGatekeeper";
import { PointsTracker } from "../pioneer/PointsTracker";
import { PioneerStatusItem } from "../views/PioneerStatusItem";

export async function initializePioneerInfrastructure(context: vscode.ExtensionContext) {
	const auth = new PioneerAuth();
	const gatekeeper = PioneerGatekeeper.getInstance();
	const pointsTracker = new PointsTracker();
	const statusItem = new PioneerStatusItem(context, gatekeeper);

	// Initial check (maybe fetch profile if session exists?)
	try {
		const profile = await auth.getProfile();
		gatekeeper.setProfile(profile);
	} catch (e) {
		console.error("Failed to fetch initial profile", e);
	}

	// Register login command
	context.subscriptions.push(
		vscode.commands.registerCommand("snapback.pioneer.login", async () => {
			try {
				const session = await auth.login();
				if (session) {
					const profile = await auth.getProfile();
					gatekeeper.setProfile(profile);
					vscode.window.showInformationMessage(`Welcome back, Pioneer ${profile?.username || "User"}!`);
				}
			} catch (e) {
				vscode.window.showErrorMessage(`Login failed: ${e instanceof Error ? e.message : String(e)}`);
			}
		}),
	);

	// Register resources
	context.subscriptions.push(statusItem);

	// Potentially sync points on activation?
	// pointsTracker.syncWithServer();

	return {
		auth,
		gatekeeper,
		pointsTracker,
	};
}
