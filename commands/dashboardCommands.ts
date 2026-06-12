/**
 * Dashboard Commands
 *
 * Per communication_matrix.md Section 7:
 * - Dashboard should open via openExternal to web dashboard
 * - The developer has stepped out of their IDE intentionally
 * - Give them the view that only makes sense at this scale
 *
 * @packageDocumentation
 */

import * as vscode from "vscode";
import type { OperationCoordinator } from "../operationCoordinator";
import { logger } from "../utils/logger";

/**
 * Base URL for the web dashboard
 * - Development: http://localhost:3002/dashboard
 * - Production: https://console.vreko.dev/dashboard
 *
 * Environment is determined at build time via esbuild define.
 */
const DASHBOARD_BASE_URL =
	process.env.NODE_ENV === "production" ? "https://console.vreko.dev/dashboard" : "http://localhost:3002/dashboard";

/**
 * Tab to URL path mapping
 */
const TAB_PATHS: Record<string, string> = {
	home: "",
	settings: "/settings",
	activity: "/sessions",
	vitals: "/vitals",
	setup: "/setup",
	welcome: "/welcome",
};

/**
 * Open the web dashboard in external browser
 * Per spec Section 7: Dashboard should be external URL
 */
function openExternalDashboard(tab?: string): void {
	const path = tab && TAB_PATHS[tab] ? TAB_PATHS[tab] : "";
	const url = `${DASHBOARD_BASE_URL}${path}`;

	logger.info("Opening external dashboard", { url });
	void vscode.env.openExternal(vscode.Uri.parse(url));
}

/**
 * Register dashboard-related commands
 */
export function registerDashboardCommands(
	_context: vscode.ExtensionContext,
	_coordinator: OperationCoordinator,
): vscode.Disposable[] {
	const disposables: vscode.Disposable[] = [];

	// Command to open the main dashboard (optionally to a specific tab)
	disposables.push(
		vscode.commands.registerCommand("vreko.openDashboard", (tab?: string) => {
			try {
				logger.info("Opening dashboard...", tab ? `to tab: ${tab}` : "");
				openExternalDashboard(tab);
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
		vscode.commands.registerCommand("vreko.openDashboard.settings", () => {
			try {
				openExternalDashboard("settings");
			} catch (error) {
				logger.error("Failed to open dashboard settings", error as Error);
				vscode.window.showErrorMessage(
					`Failed to open dashboard: ${error instanceof Error ? error.message : "unknown error"}`,
				);
			}
		}),
	);

	disposables.push(
		vscode.commands.registerCommand("vreko.openDashboard.activity", () => {
			try {
				openExternalDashboard("activity");
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
		vscode.commands.registerCommand("vreko.openDashboard.vitals", () => {
			try {
				openExternalDashboard("vitals");
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
		vscode.commands.registerCommand("vreko.openDashboard.setup", () => {
			try {
				openExternalDashboard("setup");
			} catch (error) {
				logger.error("Failed to open dashboard setup", error as Error);
				vscode.window.showErrorMessage(
					`Failed to open dashboard: ${error instanceof Error ? error.message : "unknown error"}`,
				);
			}
		}),
	);

	// Command to open dashboard to welcome tab (new onboarding experience)
	disposables.push(
		vscode.commands.registerCommand("vreko.openDashboard.welcome", () => {
			try {
				openExternalDashboard("welcome");
			} catch (error) {
				logger.error("Failed to open dashboard welcome", error as Error);
				vscode.window.showErrorMessage(
					`Failed to open dashboard: ${error instanceof Error ? error.message : "unknown error"}`,
				);
			}
		}),
	);

	// Session browser command (referenced by Quick Picker)
	disposables.push(
		vscode.commands.registerCommand("vreko.showSessionBrowser", async () => {
			// Open external dashboard to sessions
			openExternalDashboard("activity");
		}),
	);

	// Full history command (referenced by Quick Picker)
	disposables.push(
		vscode.commands.registerCommand("vreko.showFullHistory", async () => {
			// For now, trigger the existing vreko command which shows full history
			await vscode.commands.executeCommand("vreko.vreko");
		}),
	);

	// Open Closing Ceremonies view (opens as a panel in editor area)
	// Optional sessionId argument will auto-select that session
	disposables.push(
		vscode.commands.registerCommand("vreko.openCeremony", async (sessionId?: string) => {
			try {
				// Get the ceremony provider from global accessor
				const host = (
					globalThis as {
						vrekoHost?: {
							ceremonyWebViewProvider?: {
								show: () => void;
								showCeremony: (sessionId: string) => Promise<void>;
							};
						};
					}
				).vrekoHost;

				if (host?.ceremonyWebViewProvider) {
					host.ceremonyWebViewProvider.show();

					// If sessionId provided, select that specific session
					if (sessionId) {
						await host.ceremonyWebViewProvider.showCeremony(sessionId);
						logger.info(`Opened Closing Ceremonies panel for session: ${sessionId}`);
					} else {
						logger.info("Opened Closing Ceremonies panel");
					}
				} else {
					logger.warn("CeremonyWebViewProvider not available");
					vscode.window.showErrorMessage("Closing Ceremonies not available. Try reloading the window.");
				}
			} catch (error) {
				logger.error("Failed to open Closing Ceremonies", error as Error);
				vscode.window.showErrorMessage(
					`Failed to open Closing Ceremonies: ${error instanceof Error ? error.message : "unknown error"}`,
				);
			}
		}),
	);

	return disposables;
}
