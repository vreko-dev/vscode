import * as vscode from "vscode";
import { getAvailableGroupingModes } from "../views/grouping/index.js";
import type { SnapBackTreeProvider } from "../views/SnapBackTreeProvider.js";

export function registerToggleGroupingModeCommand(
	context: vscode.ExtensionContext,
	treeProvider: SnapBackTreeProvider,
): void {
	const command = vscode.commands.registerCommand(
		"snapback.toggleGroupingMode",
		async () => {
			const modes = getAvailableGroupingModes();
			const currentMode = treeProvider.getGroupingMode();

			const items = modes.map((m) => ({
				label: m.label,
				description: m.mode === currentMode ? "(current)" : "",
				detail: m.enabled ? undefined : "Coming soon",
				mode: m.mode,
				enabled: m.enabled,
			}));

			const selected = await vscode.window.showQuickPick(items, {
				placeHolder: "Select grouping mode",
				title: "Group Snapshots By",
			});

			if (selected?.enabled) {
				treeProvider.setGroupingMode(selected.mode);
			} else if (selected && !selected.enabled) {
				vscode.window.showInformationMessage(
					`${selected.label} grouping is coming soon!`,
				);
			}
		},
	);

	context.subscriptions.push(command);
}
