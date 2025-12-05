/**
 * Notification Utilities - VS Code notification and status bar helpers
 *
 * Provides simple wrappers around VS Code's notification APIs with sensible
 * defaults for SnapBack extension usage.
 *
 * @module utils/notifications
 */

import * as vscode from "vscode";

/**
 * Show a temporary status bar message that auto-dismisses.
 *
 * Displays a non-modal message in the VS Code status bar for a limited duration.
 * Useful for brief user feedback that doesn't require interaction (e.g., operation
 * completion, status updates). Message automatically disappears after specified duration.
 *
 * @param message - Text to display in the status bar
 * @param icon - Optional VS Code icon name to display before message
 *   Icons: 'lock', 'unlock', 'check', 'error', 'warning', 'info', 'gear', etc.
 *   See: https://code.visualstudio.com/api/references/icons-in-labels
 * @param duration - Display duration in milliseconds (default: 1000ms)
 *   Set to 0 for permanent display until next status update
 *
 * @returns void (message is displayed as side effect)
 *
 * @throws No exceptions thrown; any VS Code API errors are silently ignored
 *
 * @example
 * ```typescript
 * // Show a success message
 * showStatusBarMessage("File protected", "lock", 3000);
 *
 * // Show an error icon with longer display
 * showStatusBarMessage("Snapshot creation failed", "error", 5000);
 *
 * // Show a check mark (default 1 second)
 * showStatusBarMessage("Snapshot saved", "check");
 * ```
 *
 * @see {@link vscode.window.showInformationMessage} for modal notifications
 * @see {@link vscode.window.showErrorMessage} for modal error dialogs
 *
 * @since 1.0.0
 */
export function showStatusBarMessage(
	message: string,
	icon?: string,
	duration = 1000,
): void {
	const iconPrefix = icon ? `$(${icon}) ` : "";
	vscode.window.setStatusBarMessage(`${iconPrefix}${message}`, duration);
}
