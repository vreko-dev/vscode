/**
 * Dashboard Commands
 *
 * Registers commands for the SnapBack Dashboard WebView.
 * Uses UnifiedDashboardPanel which consolidates Home, Vitals, Setup, and Activity tabs.
 *
 * @packageDocumentation
 */

import * as vscode from "vscode";
import type { OperationCoordinator } from "../operationCoordinator";
import { createUnifiedDashboardPanel } from "../ui/UnifiedDashboardPanel";

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
			createUnifiedDashboardPanel(context.extensionUri, coordinator);
		}),
	);

	// Command to open dashboard to home tab (previously settings)
	disposables.push(
		vscode.commands.registerCommand("snapback.openDashboard.settings", () => {
			// Settings tab removed - open home tab which now has Configure MCP button
			createUnifiedDashboardPanel(context.extensionUri, coordinator, "home");
		}),
	);

	disposables.push(
		vscode.commands.registerCommand("snapback.openDashboard.activity", () => {
			createUnifiedDashboardPanel(context.extensionUri, coordinator, "activity");
		}),
	);

	// Command to open dashboard to vitals tab (consolidates VitalsDashboardPanel)
	disposables.push(
		vscode.commands.registerCommand("snapback.openDashboard.vitals", () => {
			createUnifiedDashboardPanel(context.extensionUri, coordinator, "vitals");
		}),
	);

	// Command to open dashboard to setup tab (consolidates OnboardingPanelProvider)
	disposables.push(
		vscode.commands.registerCommand("snapback.openDashboard.setup", () => {
			createUnifiedDashboardPanel(context.extensionUri, coordinator, "setup");
		}),
	);

	// Session browser command (referenced by Quick Picker)
	disposables.push(
		vscode.commands.registerCommand("snapback.showSessionBrowser", async () => {
			// For now, open dashboard to activity tab
			createUnifiedDashboardPanel(context.extensionUri, coordinator, "activity");
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
