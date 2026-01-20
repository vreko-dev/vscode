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
import { logger } from "../utils/logger";

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
			try {
				logger.info("Opening dashboard...");
				createUnifiedDashboardPanel(context.extensionUri, coordinator);
			} catch (error) {
				logger.error("Failed to open dashboard", error as Error);
				vscode.window.showErrorMessage(
					`Failed to open dashboard: ${error instanceof Error ? error.message : "unknown error"}`,
				);
			}
		}),
	);

	// Command to open dashboard to home tab (previously settings)
	disposables.push(
		vscode.commands.registerCommand("snapback.openDashboard.settings", () => {
			try {
				// Settings tab removed - open home tab which now has Configure MCP button
				createUnifiedDashboardPanel(context.extensionUri, coordinator, "home");
			} catch (error) {
				logger.error("Failed to open dashboard settings", error as Error);
				vscode.window.showErrorMessage(
					`Failed to open dashboard: ${error instanceof Error ? error.message : "unknown error"}`,
				);
			}
		}),
	);

	disposables.push(
		vscode.commands.registerCommand("snapback.openDashboard.activity", () => {
			try {
				createUnifiedDashboardPanel(context.extensionUri, coordinator, "activity");
			} catch (error) {
				logger.error("Failed to open dashboard activity", error as Error);
				vscode.window.showErrorMessage(
					`Failed to open dashboard: ${error instanceof Error ? error.message : "unknown error"}`,
				);
			}
		}),
	);

	// Command to open dashboard to vitals tab (consolidates VitalsDashboardPanel)
	disposables.push(
		vscode.commands.registerCommand("snapback.openDashboard.vitals", () => {
			try {
				createUnifiedDashboardPanel(context.extensionUri, coordinator, "vitals");
			} catch (error) {
				logger.error("Failed to open dashboard vitals", error as Error);
				vscode.window.showErrorMessage(
					`Failed to open dashboard: ${error instanceof Error ? error.message : "unknown error"}`,
				);
			}
		}),
	);

	// Command to open dashboard to setup tab (consolidates OnboardingPanelProvider)
	disposables.push(
		vscode.commands.registerCommand("snapback.openDashboard.setup", () => {
			try {
				createUnifiedDashboardPanel(context.extensionUri, coordinator, "setup");
			} catch (error) {
				logger.error("Failed to open dashboard setup", error as Error);
				vscode.window.showErrorMessage(
					`Failed to open dashboard: ${error instanceof Error ? error.message : "unknown error"}`,
				);
			}
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
