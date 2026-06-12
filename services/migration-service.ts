import * as vscode from "vscode";

/**
 * One-time VS Code settings migration: vreko.* → vreko.*
 * Runs on first activation after the rebrand upgrade.
 * Uses globalState semaphore key to run exactly once per installation.
 */
export async function migrateSettingsPrefix(context: vscode.ExtensionContext): Promise<void> {
	const MIGRATED_KEY = "vreko.settings.migrated.v1";

	// Already migrated  -  skip
	if (context.globalState.get(MIGRATED_KEY)) return;

	// Check if user has any existing vreko.* settings
	const config = vscode.workspace.getConfiguration();
	const snapshot = config.inspect("vreko");

	if (snapshot?.globalValue !== undefined || snapshot?.workspaceValue !== undefined) {
		// User has old settings  -  show migration prompt
		const choice = await vscode.window.showInformationMessage(
			"Vreko has been renamed to Vreko. Your settings use the old 'vreko.' prefix. " +
				"Please update to the new 'vreko.' prefix in your settings.json.",
			{ modal: false },
			"Open Settings",
			"Dismiss",
		);
		if (choice === "Open Settings") {
			await vscode.commands.executeCommand("workbench.action.openSettings", "vreko.");
		}
	}

	// Mark as migrated regardless of user action (don't show again)
	await context.globalState.update(MIGRATED_KEY, true);
}
