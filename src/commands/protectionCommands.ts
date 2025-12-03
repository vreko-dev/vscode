/**
 * Protection Command Handlers - VS Code command implementations for file protection management
 *
 * This module provides command handlers for file protection features,
 * integrating protection registry with VS Code's command palette and context menus.
 *
 * Commands:
 * - snapback.protectCurrentFile: Protect the currently active file
 * - snapback.unprotectFile: Unprotect a file
 * - snapback.setProtectionLevel: Set protection level for a file
 * - snapback.setWatchLevel: Quick set to Watched level
 * - snapback.setWarnLevel: Quick set to Warning level
 * - snapback.setBlockLevel: Quick set to Protected level
 * - snapback.showAllProtectedFiles: Show all protected files
 * - snapback.protectEntireRepo: Protect the entire repository
 *
 * @module commands/protectionCommands
 */

import * as vscode from "vscode";
import { ProtectionNotifications } from "../notifications/protectionNotifications.js";
import type { SnapBackRCLoader } from "../protection/SnapBackRCLoader.js";
import type { ProtectedFileRegistry } from "../services/protectedFileRegistry.js";
import { logger } from "../utils/logger.js";
import type { ProtectionLevel } from "../views/types.js";
import { PROTECTION_LEVELS } from "../views/types.js";
import type { CommandContext } from "./index.js";

/**
 * Module-level ProtectionNotifications instance
 * Initialized by extension.ts during activation
 */
let protectionNotifications: ProtectionNotifications | null = null;

/**
 * Initialize ProtectionNotifications for this module
 * Called from extension.ts during activation
 */
export function initializeProtectionNotifications(
	globalState: vscode.Memento,
): void {
	protectionNotifications = new ProtectionNotifications(globalState);
}

/**
 * Register all protection management commands.
 *
 * Provides command handlers for the 3-level file protection system (Watch/Warn/Block).
 * Integrates with ProtectedFileRegistry to manage protection states and syncs with
 * SnapBackRC policies for team-wide rules.
 *
 * @param context - VS Code extension context for managing extension lifecycle
 * @param ctx - Command context containing all required services
 *   - protectedFileRegistry: For managing file protection states
 *   - refreshViews: Callback to update tree views after changes
 *   - featureFlagService: For feature flag checks on deep analysis
 *
 * @returns Array of disposables for all registered commands
 *
 * @throws Registration errors if VS Code API is unavailable
 *
 * @example
 * ```typescript
 * const disposables = registerProtectionCommands(context, commandContext);
 * // disposables are pushed to context.subscriptions for automatic cleanup
 * ```
 *
 * @see {@link ProtectionLevel} for Watch (green), Warn (yellow), Block (red)
 * @see {@link ProtectedFileRegistry} for state management
 * @see {@link PROTECTION_LEVELS} for level metadata
 */
export function registerProtectionCommands(
	_context: vscode.ExtensionContext,
	ctx: CommandContext,
): vscode.Disposable[] {
	const disposables: vscode.Disposable[] = [];

	// Extract needed services from context
	const { protectedFileRegistry, refreshViews, snapbackrcLoader } = ctx;

	/**
	 * Extract URI from VS Code command arguments.
	 *
	 * When commands are invoked from tree view context menus, they receive TreeItem objects
	 * which may contain URIs in different properties. This helper normalizes extraction
	 * and falls back to the active editor if no explicit URI is provided.
	 *
	 * @param arg - Optional URI or TreeItem-like object from command invocation
	 *
	 * @returns Extracted URI or undefined if no URI can be determined
	 *
	 * @throws No errors; returns undefined on any extraction failure
	 *
	 * @example
	 * ```typescript
	 * const fileUri = getUriFromArg(uriOrItem);
	 * if (!fileUri) {
	 *   vscode.window.showWarningMessage("No file selected");
	 *   return;
	 * }
	 * ```
	 */
	interface TreeItemLike {
		command?: {
			arguments?: unknown[];
		};
		resourceUri?: vscode.Uri;
	}

	function getUriFromArg(
		arg?: vscode.Uri | TreeItemLike,
	): vscode.Uri | undefined {
		if (!arg) {
			return vscode.window.activeTextEditor?.document.uri;
		}
		if (arg instanceof vscode.Uri) {
			return arg;
		}
		// Handle TreeItem - try to get Uri from command arguments
		if (arg.command?.arguments?.[0] instanceof vscode.Uri) {
			return arg.command.arguments[0];
		}
		// Handle object with resourceUri property
		if (arg.resourceUri instanceof vscode.Uri) {
			return arg.resourceUri;
		}
		// Fallback to active editor
		return vscode.window.activeTextEditor?.document.uri;
	}

	/**
	 * Command: Protect File
	 *
	 * Adds a file to the protection registry with user-selected protection level.
	 * If file is already protected, shows the current protection level. Supports
	 * invocation from file explorer context menu or command palette.
	 *
	 * @command snapback.protectFile
	 *
	 * @param uriOrItem - Optional URI or TreeItem from context menu; falls back to active editor
	 *
	 * @returns void (all feedback is provided through UI notifications)
	 *
	 * @throws Shows error message if:
	 * - No file can be determined
	 * - Protection registry update fails
	 * - User cancels the protection level selection
	 *
	 * @example
	 * ```typescript
	 * // From file explorer context menu
	 * // Shows quick pick with canonical protection levels from signage
	 * // On selection: Adds file with chosen level and refreshes views
	 * ```
	 *
	 * @see {@link setProtectionLevelQuick} for quick protection commands
	 * @see {@link ProtectedFileRegistry.add} for implementation
	 */
	disposables.push(
		vscode.commands.registerCommand(
			"snapback.protectFile",
			async (uriOrItem?: vscode.Uri | TreeItemLike) => {
				const fileUri = getUriFromArg(uriOrItem);
				if (!fileUri) {
					vscode.window.showWarningMessage("No file selected");
					return;
				}

				// Check if file is already protected
				const isProtected = protectedFileRegistry.isProtected(fileUri.fsPath);
				if (!isProtected) {
					// Show quick pick for protection level selection
					const items: {
						label: string;
						description: string;
						level: ProtectionLevel;
					}[] = Object.entries(PROTECTION_LEVELS).map(([level, metadata]) => ({
						label: `${metadata.icon} ${metadata.label}`,
						description: metadata.description,
						level: level as ProtectionLevel,
					}));

					const selected = await vscode.window.showQuickPick(items, {
						placeHolder: "Select protection level",
					});

					if (selected) {
						try {
							if (snapbackrcLoader) {
								// Add rule to .snapbackrc (source of truth)
								await snapbackrcLoader.addProtectionRule(
									fileUri.fsPath,
									selected.level,
								);
								// Note: SnapBackRCLoader watcher will trigger registry update and view refresh
							} else {
								// Fallback to local registry if loader not available (shouldn't happen in normal operation)
								await protectedFileRegistry.add(fileUri.fsPath, {
									protectionLevel: selected.level,
								});
								refreshViews();
							}

							const levelMetadata = PROTECTION_LEVELS[selected.level];
							if (protectionNotifications) {
								await protectionNotifications.showProtectionLevelNotification(
									fileUri.fsPath,
									selected.level,
									true, // isNewProtection
								);
							} else {
								// Fallback if not initialized
								vscode.window.showInformationMessage(
									`Protection level set to ${levelMetadata.label} ${
										levelMetadata.icon
									} for ${vscode.workspace.asRelativePath(fileUri.fsPath)}`,
								);
							}
						} catch (error) {
							vscode.window.showErrorMessage(
								`Failed to protect file: ${(error as Error).message}`,
							);
						}
					}
				} else {
					// File is already protected, show message
					const currentLevel = protectedFileRegistry.getProtectionLevel(
						fileUri.fsPath,
					);
					if (currentLevel) {
						const levelMetadata = PROTECTION_LEVELS[currentLevel];
						if (protectionNotifications) {
							await protectionNotifications.showProtectionLevelNotification(
								fileUri.fsPath,
								currentLevel,
								false, // isExistingProtection
							);
						} else {
							// Fallback if not initialized
							vscode.window.showInformationMessage(
								`File is already protected at ${levelMetadata.label} ${levelMetadata.icon} level`,
							);
						}
					}
				}
			},
		),
	);

	/**
	 * Command: Protect Current File
	 *
	 * Immediately protects the current file with the default protection level
	 * without prompting for level selection. Use for quick protection of active editor file.
	 *
	 * @command snapback.protectCurrentFile
	 *
	 * @param uriOrItem - Optional URI or TreeItem from context menu; falls back to active editor
	 *
	 * @returns void (all feedback is provided through UI notifications)
	 *
	 * @throws Shows error message if:
	 * - No file can be determined
	 * - Protection registry update fails
	 *
	 * @example
	 * ```typescript
	 * // From keyboard shortcut or command palette
	 * // Immediately protects active editor file with default level
	 * // Shows: "Protected: relative/path/to/file.ts"
	 * ```
	 *
	 * @see {@link protectFile} for full protection level selection
	 * @see {@link ProtectedFileRegistry.add} for implementation
	 */
	disposables.push(
		vscode.commands.registerCommand(
			"snapback.protectCurrentFile",
			async (uriOrItem?: vscode.Uri | TreeItemLike) => {
				const fileUri = getUriFromArg(uriOrItem);
				if (!fileUri) {
					vscode.window.showWarningMessage("No file selected");
					return;
				}

				try {
					if (snapbackrcLoader) {
						// Add rule to .snapbackrc (source of truth) - defaults to Watched if not specified,
						// but here we want to be explicit about the default behavior if needed,
						// though addProtectionRule might need a level.
						// Let's check the registry.add behavior - it defaulted to Watched?
						// Registry.add defaults to Watched. We should do the same.
						await snapbackrcLoader.addProtectionRule(fileUri.fsPath, "Watched");
					} else {
						await protectedFileRegistry.add(fileUri.fsPath);
						refreshViews();
					}

					// Show notification through infrastructure with "Don't show again" support
					if (protectionNotifications) {
						await protectionNotifications.showProtectionLevelNotification(
							fileUri.fsPath,
							"Watched", // Default protection level for protectCurrentFile
							true, // isNewProtection
						);
					} else {
						// Fallback if not initialized
						vscode.window.showInformationMessage(
							`Protected: ${vscode.workspace.asRelativePath(fileUri.fsPath)}`,
						);
					}

					// 🟢 TDD GREEN: Invalidate audit cache and refresh after applying protections
					if (ctx.protectionService) {
						ctx.protectionService.invalidateAuditCache();
						await ctx.protectionService.auditRepo(true);
					}
				} catch (error) {
					vscode.window.showErrorMessage(
						`Failed to protect file: ${(error as Error).message}`,
					);
				}
			},
		),
	);

	/**
	 * Command: Unprotect File
	 *
	 * Removes a file from the protection registry, reverting it to unprotected state.
	 * Unprotected files will no longer trigger snapshot creation on save.
	 *
	 * @command snapback.unprotectFile
	 *
	 * @param uriOrItem - Optional URI or TreeItem from context menu; falls back to active editor
	 *
	 * @returns void (all feedback is provided through UI notifications)
	 *
	 * @throws Shows error message if:
	 * - No file can be determined
	 * - Protection registry removal fails
	 *
	 * @example
	 * ```typescript
	 * // From file explorer context menu on protected file
	 * // Shows: "Unprotected: relative/path/to/file.ts"
	 * // File will no longer appear in protected files view
	 * ```
	 *
	 * @see {@link protectFile} for adding protection
	 * @see {@link ProtectedFileRegistry.remove} for implementation
	 */
	disposables.push(
		vscode.commands.registerCommand(
			"snapback.unprotectFile",
			async (uriOrItem?: vscode.Uri | TreeItemLike) => {
				const fileUri = getUriFromArg(uriOrItem);
				if (!fileUri) {
					vscode.window.showWarningMessage("No file selected");
					return;
				}

				try {
					if (snapbackrcLoader) {
						await snapbackrcLoader.removeProtectionRule(fileUri.fsPath);
					} else {
						await protectedFileRegistry.remove(fileUri.fsPath);
						refreshViews();
					}

					vscode.window.showInformationMessage(
						`Unprotected: ${vscode.workspace.asRelativePath(fileUri.fsPath)}`,
					);
				} catch (error) {
					vscode.window.showErrorMessage(
						`Failed to unprotect file: ${(error as Error).message}`,
					);
				}
			},
		),
	);

	// Command: Set Protection Level
	disposables.push(
		vscode.commands.registerCommand(
			"snapback.setProtectionLevel",
			async (uriOrItem?: vscode.Uri | TreeItemLike) => {
				const fileUri = getUriFromArg(uriOrItem);
				if (!fileUri) {
					vscode.window.showWarningMessage("No file selected");
					return;
				}

				// Check if file is already protected
				const isProtected = protectedFileRegistry.isProtected(fileUri.fsPath);
				if (!isProtected) {
					const choice = await vscode.window.showWarningMessage(
						"File is not currently protected. Protect it first?",
						"Protect and Set Level",
						"Cancel",
					);

					if (choice !== "Protect and Set Level") {
						return;
					}
				}

				// Show quick pick for protection level selection
				const items: {
					label: string;
					description: string;
					level: ProtectionLevel;
				}[] = Object.entries(PROTECTION_LEVELS).map(([level, metadata]) => ({
					label: `${metadata.icon} ${metadata.label}`,
					description: metadata.description,
					level: level as ProtectionLevel,
				}));

				const selected = await vscode.window.showQuickPick(items, {
					placeHolder: "Select protection level",
				});

				if (selected) {
					try {
						if (snapbackrcLoader) {
							// Update rule in .snapbackrc
							await snapbackrcLoader.addProtectionRule(
								fileUri.fsPath,
								selected.level,
							);
						} else {
							if (!isProtected) {
								await protectedFileRegistry.add(fileUri.fsPath, {
									protectionLevel: selected.level,
								});
							} else {
								await protectedFileRegistry.updateProtectionLevel(
									fileUri.fsPath,
									selected.level,
								);
							}
							refreshViews();
						}

						const levelMetadata = PROTECTION_LEVELS[selected.level];
						if (protectionNotifications) {
							await protectionNotifications.showProtectionLevelNotification(
								fileUri.fsPath,
								selected.level,
								false, // isProtectionLevelChange for existing file
							);
						} else {
							// Fallback if not initialized
							vscode.window.showInformationMessage(
								`Protection level set to ${levelMetadata.label} ${
									levelMetadata.icon
								} for ${vscode.workspace.asRelativePath(fileUri.fsPath)}`,
							);
						}
					} catch (error) {
						vscode.window.showErrorMessage(
							`Failed to set protection level: ${(error as Error).message}`,
						);
					}
				}
			},
		),
	);

	// Command: Set Watch Level (Quick)
	disposables.push(
		vscode.commands.registerCommand(
			"snapback.setWatchLevel",
			async (uriOrItem?: vscode.Uri | TreeItemLike) => {
				await setProtectionLevelQuick(
					getUriFromArg(uriOrItem),
					"Watched",
					protectedFileRegistry,
					refreshViews,
					snapbackrcLoader,
				);
			},
		),
	);

	// Command: Set Warn Level (Quick)
	disposables.push(
		vscode.commands.registerCommand(
			"snapback.setWarnLevel",
			async (uriOrItem?: vscode.Uri | TreeItemLike) => {
				await setProtectionLevelQuick(
					getUriFromArg(uriOrItem),
					"Warning",
					protectedFileRegistry,
					refreshViews,
					snapbackrcLoader,
				);
			},
		),
	);

	// Command: Set Block Level (Quick)
	disposables.push(
		vscode.commands.registerCommand(
			"snapback.setBlockLevel",
			async (uriOrItem?: vscode.Uri | vscode.Uri) => {
				await setProtectionLevelQuick(
					getUriFromArg(uriOrItem),
					"Protected",
					protectedFileRegistry,
					refreshViews,
					snapbackrcLoader,
				);
			},
		),
	);

	// Command: Change Protection Level (shows protection level selection)
	disposables.push(
		vscode.commands.registerCommand(
			"snapback.changeProtectionLevel",
			async (uriOrItem?: vscode.Uri | vscode.Uri) => {
				const fileUri = getUriFromArg(uriOrItem);
				if (!fileUri) {
					vscode.window.showWarningMessage("No file selected");
					return;
				}

				// Check if file is already protected
				const isProtected = protectedFileRegistry.isProtected(fileUri.fsPath);
				if (!isProtected) {
					vscode.window.showWarningMessage("File is not currently protected");
					return;
				}

				// Show quick pick for protection level selection
				const items: {
					label: string;
					description: string;
					level: ProtectionLevel;
				}[] = Object.entries(PROTECTION_LEVELS).map(([level, metadata]) => ({
					label: `${metadata.icon} ${metadata.label}`,
					description: metadata.description,
					level: level as ProtectionLevel,
				}));

				const selected = await vscode.window.showQuickPick(items, {
					placeHolder: "Select new protection level",
				});

				if (selected) {
					try {
						if (snapbackrcLoader) {
							// Update rule in .snapbackrc
							await snapbackrcLoader.addProtectionRule(
								fileUri.fsPath,
								selected.level,
							);
						} else {
							// Update existing file's protection level
							await protectedFileRegistry.updateProtectionLevel(
								fileUri.fsPath,
								selected.level,
							);
							refreshViews();
						}

						const levelMetadata = PROTECTION_LEVELS[selected.level];
						if (protectionNotifications) {
							await protectionNotifications.showProtectionLevelNotification(
								fileUri.fsPath,
								selected.level,
								true, // isProtectionLevelChange
							);
						} else {
							// Fallback if not initialized
							vscode.window.showInformationMessage(
								`Protection level changed to ${levelMetadata.label} ${
									levelMetadata.icon
								} for ${vscode.workspace.asRelativePath(fileUri.fsPath)}`,
							);
						}
					} catch (error) {
						vscode.window.showErrorMessage(
							`Failed to change protection level: ${(error as Error).message}`,
						);
					}
				}
			},
		),
	);

	// Command: Show All Protected Files
	disposables.push(
		vscode.commands.registerCommand(
			"snapback.showAllProtectedFiles",
			async () => {
				const entries = await protectedFileRegistry.list();
				if (entries.length === 0) {
					vscode.window.setStatusBarMessage("No protected files yet", 3000);
					return;
				}

				const pick = await vscode.window.showQuickPick<{
					label: string;
					description?: string;
					entry: { path: string; label: string };
				}>(
					entries.map((entry) => ({
						label: entry.label,
						description: vscode.workspace.asRelativePath(entry.path, false),
						entry,
					})),
					{ placeHolder: "Select a protected file to open" },
				);

				if (pick?.entry) {
					await vscode.commands.executeCommand(
						"vscode.open",
						vscode.Uri.file(pick.entry.path),
					);
				}
			},
		),
	);

	// Command: Protect Entire Repository
	disposables.push(
		vscode.commands.registerCommand("snapback.protectEntireRepo", async () => {
			try {
				if (!snapbackrcLoader) {
					vscode.window.showErrorMessage(
						"SnapBack configuration loader not available.",
					);
					return;
				}

				// Check if config already exists
				// Note: getMergedConfig returns defaults if no file exists, so we need to check if the file actually exists
				// But SnapBackRCLoader doesn't expose file existence directly.
				// However, initializeWithDefaults handles the check.

				// We can just call initializeWithDefaults. If it exists, it might skip or we can ask user.
				// Let's ask user if they want to overwrite if it exists?
				// Actually, the requirement is "Apply Protection Defaults".

				// Let's try to initialize. If it fails because it exists (we can check via FS or just try), we ask.
				// But initializeWithDefaults(false) returns void if exists.

				// Let's prompt the user first about what this will do.
				const choice = await vscode.window.showInformationMessage(
					"This will create a .snapbackrc file with default protection rules for your repository. If one exists, it can be overwritten.",
					"Apply Defaults",
					"Cancel",
				);

				if (choice !== "Apply Defaults") {
					return;
				}

				// Try to initialize
				// We might want to know if it existed to show "Overwritten" vs "Created".
				// For now, let's just force overwrite if they said "Apply Defaults" implies they want the defaults.
				// Wait, "Apply Defaults" might mean "Merge defaults".
				// The user request was "creation should happen... have it enable protection for those defaults".
				// Let's assume they want to ensure defaults are present.

				// Let's use overwrite=true to ensure defaults are applied as requested.
				// Or maybe we should be safer.
				// Let's stick to the plan: "If .snapbackrc exists, ask to merge defaults or overwrite."

				// Since we don't have a "merge" method exposed easily yet (mergeConfigs is private/internal logic),
				// let's just offer Overwrite for now as a simple start, or just "Ensure Defaults".
				// initializeWithDefaults(true) overwrites.

				await snapbackrcLoader.initializeWithDefaults(true);

				// Apply protection
				await snapbackrcLoader.applyProtections(true);

				// Update context
				await vscode.commands.executeCommand(
					"setContext",
					"snapback.protectionStatus",
					"protected",
				);

				refreshViews();

				vscode.window
					.showInformationMessage(
						"✅ SnapBack: Repository protection defaults applied successfully.",
						"View Protected Files",
					)
					.then((choice) => {
						if (choice === "View Protected Files") {
							vscode.commands.executeCommand("snapback.showAllProtectedFiles");
						}
					});
			} catch (error) {
				logger.error("Failed to protect entire repository", error as Error);
				vscode.window.showErrorMessage(
					`⚠️ SnapBack: Failed to apply protection defaults: ${(error as Error).message}`,
				);
			}
		}),
	);

	/**
	 * Command: Reset Notification Preferences
	 *
	 * Clears all "Don't show again" acknowledgments for protection level notifications.
	 * Useful when user wants to re-see notifications they previously dismissed.
	 *
	 * @command snapback.resetNotificationPreferences
	 */
	disposables.push(
		vscode.commands.registerCommand(
			"snapback.resetNotificationPreferences",
			async () => {
				if (!protectionNotifications) {
					vscode.window.showWarningMessage(
						"SnapBack: Notification system not initialized",
					);
					return;
				}

				try {
					// Reset all acknowledgments
					await protectionNotifications.resetAcknowledgment("", undefined);

					vscode.window.showInformationMessage(
						"✅ SnapBack notification preferences have been reset. All protection level notifications will appear again.",
					);
				} catch (error) {
					vscode.window.showErrorMessage(
						`Failed to reset notification preferences: ${(error as Error).message}`,
					);
				}
			},
		),
	);

	return disposables;
}

/**
 * Set file protection level with quick or update operation.
 *
 * Helper function that handles both initial protection (add) and level changes (update)
 * in a single operation. Automatically detects whether the file is already protected
 * and chooses the appropriate operation.
 *
 * @param uri - File URI to protect; uses active editor if not provided
 * @param level - Target protection level (Watched, Warning, Protected, or Unprotected)
 * @param protectedFileRegistry - Registry for managing protection states
 * @param refreshViews - Callback to update UI after changes
 *
 * @returns Promise resolving when operation completes
 *
 * @throws No exceptions thrown; errors are shown via VS Code message dialogs
 *
 * @example
 * ```typescript
 * // Quick protect at Watched level
 * await setProtectionLevelQuick(fileUri, "Watched", registry, refresh);
 * // Shows: "Protection level set to 🟢 Watched"
 * ```
 *
 * @see {@link setWatchLevel} for quick Watched command
 * @see {@link setWarnLevel} for quick Warn command
 * @see {@link setBlockLevel} for quick Block command
 *
 * @since 1.2.0
 */
async function setProtectionLevelQuick(
	uri: vscode.Uri | undefined,
	level: ProtectionLevel,
	protectedFileRegistry: ProtectedFileRegistry,
	refreshViews: () => void,
	snapbackrcLoader?: SnapBackRCLoader,
) {
	const fileUri = uri || vscode.window.activeTextEditor?.document.uri;
	if (!fileUri) {
		vscode.window.showWarningMessage("No file selected");
		return;
	}

	// Check if file is already protected
	const isProtected = protectedFileRegistry.isProtected(fileUri.fsPath);

	try {
		if (snapbackrcLoader) {
			// Add/Update rule in .snapbackrc
			await snapbackrcLoader.addProtectionRule(fileUri.fsPath, level);
		} else {
			if (!isProtected) {
				// Add file with correct protection level immediately (atomic operation)
				await protectedFileRegistry.add(fileUri.fsPath, {
					protectionLevel: level,
				});
			} else {
				// Update existing file's protection level
				await protectedFileRegistry.updateProtectionLevel(
					fileUri.fsPath,
					level,
				);
			}
			refreshViews();
		}

		const levelMetadata = PROTECTION_LEVELS[level];
		if (protectionNotifications) {
			await protectionNotifications.showProtectionLevelNotification(
				fileUri.fsPath,
				level,
				!isProtected, // isNewProtection if it wasn't protected before
			);
		} else {
			// Fallback if not initialized (shouldn't happen)
			vscode.window.showInformationMessage(
				`Protection level set to ${levelMetadata.label} ${levelMetadata.icon}`,
			);
		}
	} catch (error) {
		vscode.window.showErrorMessage(
			`Failed to set protection level: ${(error as Error).message}`,
		);
	}
}
