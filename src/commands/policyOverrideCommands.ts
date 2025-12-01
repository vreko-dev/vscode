/**
 * Policy Override Command Handlers - VS Code command implementations for protection policy exceptions
 *
 * This module provides command handlers for creating temporary exceptions to protection
 * policies. Overrides are time-limited and require audit rationale for compliance tracking.
 *
 * Commands:
 * - snapback.createPolicyOverride: Create temporary protection policy exception
 *
 * @module commands/policyOverrideCommands
 */

import * as vscode from "vscode";
import { PolicyManager } from "../policy/PolicyManager.js";
import { getProtectionLevelSignage } from "../signage/index.js";
import type { OverrideRationale } from "../types/policy.types.js";
import { logger } from "../utils/logger.js";
import type { CommandContext } from "./index.js";

/**
 * Register all policy override management commands.
 *
 * Provides command handlers for creating temporary exceptions to protection policies.
 * Overrides require explicit rationale and expiration times for audit compliance.
 * Useful for one-off scenarios that don't warrant permanent policy changes.
 *
 * @param _context - VS Code extension context (unused in current implementation)
 * @param _commandContext - Command context (unused in current implementation)
 *
 * @returns Array of disposables for all registered commands
 *
 * @throws Registration errors if VS Code API is unavailable
 *
 * @example
 * ```typescript
 * const disposables = registerPolicyOverrideCommands(context, commandContext);
 * // disposables are pushed to context.subscriptions for automatic cleanup
 * ```
 *
 * @see {@link PolicyManager} for override management
 * @see {@link OverrideRationale} for allowed rationale types
 */
export function registerPolicyOverrideCommands(
	_context: vscode.ExtensionContext,
	_commandContext: CommandContext,
): vscode.Disposable[] {
	const disposables: vscode.Disposable[] = [];

	/**
	 * Command: Create Policy Override
	 *
	 * Creates a temporary exception to protection policies for a specific file.
	 * Requires user to select: new protection level, rationale, and expiration time.
	 * Useful for one-off scenarios (e.g., testing, temporary fixes) that need special handling.
	 *
	 * @command snapback.createPolicyOverride
	 *
	 * @param uri - Optional file URI; prompts user to select file if not provided
	 *
	 * @returns void (all feedback is provided through UI notifications and logging)
	 *
	 * @throws Shows error message if:
	 * - No file can be determined
	 * - No workspace folder is found
	 * - User cancels any step of the override creation flow
	 * - PolicyManager initialization fails
	 * - Override cannot be persisted
	 *
	 * @example
	 * ```typescript
	 * // User right-clicks file and selects "Create Policy Override"
	 * // Prompted for: protection level (Watch/Warn/Block/Unprotected)
	 * // Prompted for: rationale (Testing/Temporary Fix/Legacy/Performance)
	 * // Prompted for: expiration (7 days/30 days/Permanent)
	 * // Shows: 'Policy override created for "file" with level "Watch" (7 days)'
	 * ```
	 *
	 * @see {@link PolicyManager.createOverride} for implementation
	 * @see {@link OverrideRationale} for allowed rationale values
	 *
	 * @since 1.3.0
	 */
	const createPolicyOverrideCommand = vscode.commands.registerCommand(
		"snapback.createPolicyOverride",
		async (uri: vscode.Uri | undefined) => {
			try {
				// Get the file path
				let filePath: string | undefined;

				if (uri) {
					// Command was invoked from context menu
					filePath = uri.fsPath;
				} else {
					// Command was invoked from command palette
					const activeEditor = vscode.window.activeTextEditor;
					if (activeEditor) {
						filePath = activeEditor.document.uri.fsPath;
					}
				}

				if (!filePath) {
					vscode.window.showErrorMessage("No file selected for override");
					return;
				}

				// Get workspace root
				const workspaceRoot =
					vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
				if (!workspaceRoot) {
					vscode.window.showErrorMessage("No workspace folder found");
					return;
				}

				// Create PolicyManager instance
				const policyManager = new PolicyManager(workspaceRoot);

				// Initialize the policy manager
				await policyManager.initialize();

				const currentLevel = policyManager.getProtectionLevel(filePath);

				// Show quick pick for new protection level
				const watchSignage = getProtectionLevelSignage("watch");
				const warnSignage = getProtectionLevelSignage("warn");
				const blockSignage = getProtectionLevelSignage("block");

				const newLevel = await vscode.window.showQuickPick(
					[
						{
							label: `${watchSignage.emoji} ${watchSignage.label}`,
							description:
								watchSignage.description || "Silent auto-snapshotting",
							value: "watch",
						},
						{
							label: `${warnSignage.emoji} ${warnSignage.label}`,
							description: warnSignage.description || "Confirm before save",
							value: "warn",
						},
						{
							label: `${blockSignage.emoji} ${blockSignage.label}`,
							description:
								blockSignage.description ||
								"Require snapshot or explicit override",
							value: "block",
						},
						{
							label: "🔓 Unprotected",
							description: "No protection",
							value: "unprotected",
						},
					],
					{
						placeHolder: `Current level: ${currentLevel || "Unprotected"}. Select new protection level`,
					},
				);

				if (!newLevel) {
					return; // User cancelled
				}

				// Show quick pick for rationale
				const rationale = await vscode.window.showQuickPick(
					[
						{ label: "Testing", value: "testing" as OverrideRationale },
						{
							label: "Temporary Fix",
							value: "temporary_fix" as OverrideRationale,
						},
						{
							label: "Legacy Compatibility",
							value: "legacy_compat" as OverrideRationale,
						},
						{
							label: "Performance Optimization",
							value: "performance" as OverrideRationale,
						},
					],
					{
						placeHolder: "Select rationale for this override",
					},
				);

				if (!rationale) {
					return; // User cancelled
				}

				// Show quick pick for TTL
				const ttl = await vscode.window.showQuickPick(
					[
						{ label: "7 days", value: "7d" },
						{ label: "30 days", value: "30d" },
						{ label: "Permanent", value: "permanent" },
					],
					{
						placeHolder: "Select expiration time for this override",
					},
				);

				if (!ttl) {
					return; // User cancelled
				}

				// Create the override
				await policyManager.createOverride(
					filePath,
					newLevel.value as "watch" | "warn" | "block" | "unprotected",
					rationale.value,
					ttl.value,
				);

				// Show success message
				vscode.window.showInformationMessage(
					`Policy override created for "${filePath}" with level "${newLevel.label}" (${ttl.label})`,
				);
			} catch (error) {
				vscode.window.showErrorMessage(
					`Failed to create policy override: ${(error as Error).message}`,
				);
				logger.error(
					"Failed to create policy override",
					error instanceof Error ? error : undefined,
					{ error },
				);
			}
		},
	);

	disposables.push(createPolicyOverrideCommand);

	return disposables;
}
