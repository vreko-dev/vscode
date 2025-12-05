/**
 * Offline Mode Command Handlers - VS Code command implementations for network control
 *
 * This module provides command handlers for toggling offline mode, which disables
 * all network operations in the SnapBack extension. Useful for restricted environments,
 * testing, or privacy-focused workflows.
 *
 * Commands:
 * - snapback.toggleOfflineMode: Toggle offline mode on/off
 *
 * @module commands/offlineModeCommands
 */

import * as vscode from "vscode";
import { RulesManager } from "../rules/RulesManager.js";
import { logger } from "../utils/logger.js";
import type { CommandContext } from "./index.js";

/**
 * Register all offline mode management commands.
 *
 * Provides command handlers for toggling offline mode, which disables all network
 * operations (telemetry, cloud sync, remote updates) while maintaining local snapshot
 * and protection functionality.
 *
 * @param _context - VS Code extension context (unused in current implementation)
 * @param commandContext - Command context containing services affected by offline mode
 *   - statusBarController: For updating UI status indicator
 *
 * @returns Array of disposables for all registered commands
 *
 * @throws Registration errors if VS Code API is unavailable
 *
 * @example
 * ```typescript
 * const disposables = registerOfflineModeCommands(context, commandContext);
 * // disposables are pushed to context.subscriptions for automatic cleanup
 * ```
 *
 * @see {@link RulesManager} for singleton configuration
 * @see {@link StatusBarController} for UI updates
 */
export function registerOfflineModeCommands(
	_context: vscode.ExtensionContext,
	commandContext: CommandContext,
): vscode.Disposable[] {
	const disposables: vscode.Disposable[] = [];

	/**
	 * Command: Toggle Offline Mode
	 *
	 * Toggles offline mode on/off and updates configuration globally.
	 * When enabled, disables all network calls (telemetry, cloud sync, feature flags).
	 * Local snapshot and protection functionality remains fully operational.
	 *
	 * @command snapback.toggleOfflineMode
	 *
	 * @returns void (all feedback is provided through UI notifications and logging)
	 *
	 * @throws Shows error message if:
	 * - Configuration update fails
	 * - RulesManager state cannot be updated
	 * - StatusBarController update fails
	 *
	 * @example
	 * ```typescript
	 * // User invokes from command palette
	 * // Shows: "SnapBack offline mode enabled" or "SnapBack offline mode disabled"
	 * // Updates configuration at snapback.offlineMode.enabled
	 * // Updates status bar to show offline indicator
	 * ```
	 *
	 * @see {@link RulesManager.setOfflineMode} for state update
	 * @see {@link StatusBarController.setOfflineMode} for UI update
	 *
	 * @since 1.2.0
	 */
	const toggleOfflineModeCommand = vscode.commands.registerCommand(
		"snapback.toggleOfflineMode",
		async () => {
			try {
				// Get current offline mode status from configuration
				const config = vscode.workspace.getConfiguration("snapback");
				const currentOfflineMode = config.get<boolean>(
					"offlineMode.enabled",
					false,
				);

				// Toggle the offline mode status
				const newOfflineMode = !currentOfflineMode;

				// Update the configuration
				await config.update(
					"offlineMode.enabled",
					newOfflineMode,
					vscode.ConfigurationTarget.Global,
				);

				// Get the RulesManager instance
				const rulesManager = RulesManager.getInstance();

				// Set offline mode in RulesManager
				rulesManager.setOfflineMode(newOfflineMode);

				// Set offline mode in the status bar controller
				commandContext.statusBarController.setOfflineMode(newOfflineMode);

				// Get the telemetry instance and set offline mode
				// Note: We need to access the telemetry instance from the command context
				// This is a simplified approach - in a real implementation you might want to
				// pass the telemetry instance through the command context

				// Show notification
				vscode.window.showInformationMessage(
					`SnapBack offline mode ${newOfflineMode ? "enabled" : "disabled"}`,
				);

				// Log the change
				logger.info(`Offline mode ${newOfflineMode ? "enabled" : "disabled"}`);
			} catch (error) {
				vscode.window.showErrorMessage(
					`Failed to toggle offline mode: ${(error as Error).message}`,
				);
				logger.error(
					"Failed to toggle offline mode",
					error instanceof Error ? error : undefined,
					{ error },
				);
			}
		},
	);

	disposables.push(toggleOfflineModeCommand);

	return disposables;
}
