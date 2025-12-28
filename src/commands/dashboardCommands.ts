/**
 * Dashboard Commands
 *
 * Registers commands for the SnapBack Dashboard WebView.
 *
 * @packageDocumentation
 */

import * as vscode from "vscode";
import type { OperationCoordinator } from "../operationCoordinator";
import { createDashboardPanel } from "../ui/DashboardPanel";

/**
 * Register dashboard-related commands
 */
export function registerDashboardCommands(
	context: vscode.ExtensionContext,
	coordinator: OperationCoordinator,
): vscode.Disposable[] {
	const disposables: vscode.Disposable[] = [];

	// Command to open the main dashboard
	disposables.push(
		vscode.commands.registerCommand("snapback.openDashboard", () => {
			createDashboardPanel(context.extensionUri, coordinator);
		}),
	);

	// Command to open dashboard to specific tab
	disposables.push(
		vscode.commands.registerCommand("snapback.openDashboard.settings", () => {
			createDashboardPanel(context.extensionUri, coordinator, "settings");
		}),
	);

	disposables.push(
		vscode.commands.registerCommand("snapback.openDashboard.activity", () => {
			createDashboardPanel(context.extensionUri, coordinator, "activity");
		}),
	);

	// Session browser command (referenced by Quick Picker)
	disposables.push(
		vscode.commands.registerCommand("snapback.showSessionBrowser", async () => {
			// For now, open dashboard to activity tab
			createDashboardPanel(context.extensionUri, coordinator, "activity");
		}),
	);

	// Full history command (referenced by Quick Picker)
	disposables.push(
		vscode.commands.registerCommand("snapback.showFullHistory", async () => {
			// For now, trigger the existing snapBack command which shows full history
			await vscode.commands.executeCommand("snapback.snapBack");
		}),
	);

	return disposables;
}
