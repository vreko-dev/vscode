/**
 * Recovery Command Handlers - VS Code command implementations for recovery operations
 *
 * This module provides command handlers for the recovery UI system per
 * Extension_UI_Refactor_Plan_6ac9a36c.md Phase 1.
 *
 * Commands:
 * - vreko.showRecentChanges: Opens recovery timeline with recent scope
 * - vreko.showQuickActions: Opens Quick Actions panel (QuickPick)
 * - vreko.openRecoveryTimeline: Opens full recovery timeline tree
 * - vreko.compareWithSnapshot: Opens diff view with snapshot
 * - vreko.restoreFromSnapshot: Restores file from snapshot
 * - vreko.restoreAllRecent: Batch restores recent changes
 *
 * @module commands/recoveryCommands
 */

import * as path from "node:path";
import * as vscode from "vscode";
import type { IRecoveryService, ISessionStatsProvider, RecoverySnapshot } from "../services/recovery/interfaces";
import { formatRelativeTime } from "../ui/snapshot-display/formatting";
import { logger } from "../utils/logger";
import type { CommandContext } from "./types";

/**
 * Quick action item interface for recovery QuickPick
 */
interface QuickActionItem extends vscode.QuickPickItem {
	action?: "undo" | "timeline" | "dashboard" | "file";
	filePath?: string;
	snapshotId?: string;
}

/**
 * Recovery timeline filter options
 */
interface RecoveryTimelineOptions {
	scope?: "recent" | "session" | "all";
	timeWindow?: number;
	filePath?: string;
}

/**
 * Compare/restore command arguments
 */
interface SnapshotOperationArgs {
	filePath: string;
	snapshotId: string;
}

/**
 * Default time window for recent changes (15 minutes)
 */
const DEFAULT_RECENT_TIME_WINDOW = 15 * 60 * 1000;

/**
 * Register all recovery commands.
 *
 * Provides command handlers for recovery operations including:
 * - Quick actions panel for fast recovery access
 * - Recovery timeline for browsing snapshots
 * - Snapshot comparison and restoration
 *
 * @param context - VS Code extension context for managing extension lifecycle
 * @param commandContext - Shared context containing all required services
 *
 * @returns Array of disposables for all registered commands
 */
export function registerRecoveryCommands(
	_context: vscode.ExtensionContext,
	commandContext: CommandContext,
): vscode.Disposable[] {
	const disposables: vscode.Disposable[] = [];

	// Get services from context (with fallback for backwards compatibility)
	const recoveryService = commandContext.recoveryService;
	const sessionStatsProvider = commandContext.sessionStatsProvider;

	if (!recoveryService) {
		logger.warn("[Recovery] IRecoveryService not available - recovery commands will have limited functionality");
	}

	// ==========================================================================
	// Command: showRecentChanges
	// ==========================================================================
	disposables.push(
		vscode.commands.registerCommand("vreko.showRecentChanges", async () => {
			logger.debug("[Recovery] showRecentChanges invoked");

			// Delegate to openRecoveryTimeline with recent scope
			await vscode.commands.executeCommand("vreko.openRecoveryTimeline", {
				scope: "recent",
				timeWindow: DEFAULT_RECENT_TIME_WINDOW,
			} satisfies RecoveryTimelineOptions);
		}),
	);

	// ==========================================================================
	// Command: showQuickActions
	// ==========================================================================
	disposables.push(
		vscode.commands.registerCommand("vreko.showQuickActions", async () => {
			logger.debug("[Recovery] showQuickActions invoked");

			const quickPick = vscode.window.createQuickPick<QuickActionItem>();
			quickPick.title = "$(vreko-cap) 🦎 Vreko Quick Actions";
			quickPick.placeholder = "Select an action or recent file to compare...";
			quickPick.matchOnDescription = true;
			quickPick.matchOnDetail = true;
			quickPick.busy = true;

			// Show immediately, populate async
			quickPick.show();

			try {
				const items = await buildQuickActionItems(recoveryService, sessionStatsProvider);
				quickPick.items = items;
				quickPick.busy = false;
			} catch (error) {
				logger.error("[Recovery] Failed to build quick action items", error as Error);
				quickPick.items = [
					{
						label: "$(error) Failed to load actions",
						description: "Check the output panel for details",
					},
				];
				quickPick.busy = false;
			}

			// Handle selection
			const acceptDisposable = quickPick.onDidAccept(async () => {
				const selected = quickPick.selectedItems[0];
				quickPick.hide();

				if (!selected?.action) {
					return;
				}

				await handleQuickAction(selected);
			});

			// Handle hide (cleanup)
			const hideDisposable = quickPick.onDidHide(() => {
				quickPick.dispose();
				acceptDisposable.dispose();
				hideDisposable.dispose();
			});
		}),
	);

	// ==========================================================================
	// Command: openRecoveryTimeline
	// ==========================================================================
	disposables.push(
		vscode.commands.registerCommand("vreko.openRecoveryTimeline", async (options?: RecoveryTimelineOptions) => {
			logger.debug("[Recovery] openRecoveryTimeline invoked", { options });

			// Focus the recovery tree view
			await vscode.commands.executeCommand("vreko-recovery.focus");

			// Apply filter if provided
			if (options && commandContext.recoveryTreeProvider) {
				commandContext.recoveryTreeProvider.setFilter(options);
			}
		}),
	);

	// ==========================================================================
	// Command: compareWithSnapshot
	// NOTE: This command delegates to the existing implementation in viewCommands.ts
	// but provides a structured args interface for programmatic use
	// ==========================================================================
	disposables.push(
		vscode.commands.registerCommand("vreko.recovery.compare", async (args: SnapshotOperationArgs) => {
			logger.debug("[Recovery] recovery.compare invoked", { args });

			if (!args?.filePath || !args?.snapshotId) {
				vscode.window.showErrorMessage("Missing file path or snapshot ID for comparison");
				return;
			}

			// Use vreko:// URI scheme (consolidated per Phase 0.5 decision)
			// Format: vreko://<snapshotId>/<encodedPath>
			const encodedPath = encodeURIComponent(args.filePath);
			const snapshotUri = vscode.Uri.parse(`vreko://${args.snapshotId}/${encodedPath}`);

			// Current file URI
			const currentUri = vscode.Uri.file(args.filePath);

			// Open diff
			const fileName = path.basename(args.filePath);
			await vscode.commands.executeCommand(
				"vscode.diff",
				snapshotUri,
				currentUri,
				`${fileName} (Snapshot ↔ Current)`,
			);
		}),
	);

	// ==========================================================================
	// Command: restoreFromSnapshot
	// ==========================================================================
	disposables.push(
		vscode.commands.registerCommand("vreko.restoreFromSnapshot", async (args: SnapshotOperationArgs) => {
			logger.debug("[Recovery] restoreFromSnapshot invoked", { args });

			if (!args?.filePath || !args?.snapshotId) {
				vscode.window.showErrorMessage("Missing file path or snapshot ID for restore");
				return;
			}

			if (!recoveryService) {
				vscode.window.showErrorMessage("Recovery service not available. Please try again.");
				return;
			}

			const fileName = path.basename(args.filePath);

			// Show confirmation with Compare option
			const selection = await vscode.window.showWarningMessage(
				`Restore ${fileName} from snapshot?`,
				{ modal: false },
				"Restore",
				"Compare First",
			);

			if (!selection) {
				return; // User cancelled
			}

			if (selection === "Compare First") {
				// Open diff instead
				await vscode.commands.executeCommand("vreko.recovery.compare", args);
				return;
			}

			// Restore
			try {
				await recoveryService.restore(args.snapshotId, args.filePath);

				// Show success with Undo option
				const undoSelection = await vscode.window.showInformationMessage(
					`$(check) Restored ${fileName}`,
					"Undo",
				);

				if (undoSelection === "Undo") {
					await vscode.commands.executeCommand("vreko.undoLastRestore");
				}
			} catch (error) {
				logger.error("[Recovery] Restore failed", error as Error);
				vscode.window.showErrorMessage(`Failed to restore ${fileName}: ${(error as Error).message}`);
			}
		}),
	);

	// ==========================================================================
	// Command: undoLastRestore
	// ==========================================================================
	disposables.push(
		vscode.commands.registerCommand("vreko.undoLastRestore", async () => {
			logger.debug("[Recovery] undoLastRestore invoked");

			const storage = commandContext.storage;
			if (!storage || !storage.getPRWSnapshotStore) {
				void vscode.window.showErrorMessage(
					"Undo last restore is not available: snapshot storage does not support PRE_ROLLBACK checkpoints.",
				);
				return;
			}

			try {
				type PRWStore = {
					listV2?: (opts: { limit: number }) => Promise<Array<{ type: string; id: string }>>;
					getWithContentV2?: (id: string) => Promise<{ contents?: Record<string, string> } | null>;
				};
				const snapshotStore = storage.getPRWSnapshotStore() as PRWStore | null | undefined;
				if (!snapshotStore || typeof snapshotStore.listV2 !== "function") {
					void vscode.window.showErrorMessage(
						"Undo last restore is not available: underlying snapshot store does not expose V2 checkpoints.",
					);
					return;
				}

				const manifests = await snapshotStore.listV2?.({ limit: 200 });
				const preRollback = manifests.find((m) => m.type === "PRE_ROLLBACK");

				if (!preRollback) {
					void vscode.window.showInformationMessage("No restore operation found to undo.");
					return;
				}

				if (typeof snapshotStore.getWithContentV2 !== "function") {
					void vscode.window.showErrorMessage(
						"Undo last restore is not available: snapshot content resolution is not supported.",
					);
					return;
				}

				const resolved = await snapshotStore.getWithContentV2(preRollback.id);
				if (!resolved || !resolved.contents) {
					void vscode.window.showErrorMessage("Failed to load pre-restore snapshot contents for undo.");
					return;
				}

				const contents: Record<string, string> = resolved.contents as Record<string, string>;
				const edit = new vscode.WorkspaceEdit();
				const updatedFiles: string[] = [];

				for (const [filePath, content] of Object.entries(contents)) {
					const isAbsolute = path.isAbsolute(filePath);
					const fsPath = isAbsolute ? filePath : path.join(commandContext.workspaceRoot, filePath);

					// Safety: only apply edits within the current workspace
					if (!fsPath.startsWith(commandContext.workspaceRoot)) {
						continue;
					}

					const uri = vscode.Uri.file(fsPath);
					edit.deleteFile(uri, { ignoreIfNotExists: true });
					edit.createFile(uri, { overwrite: true });
					edit.insert(uri, new vscode.Position(0, 0), content);
					updatedFiles.push(fsPath);
				}

				const success = await vscode.workspace.applyEdit(edit);
				if (!success) {
					void vscode.window.showErrorMessage("Failed to apply undo edits for last restore.");
					return;
				}

				logger.info("[Recovery] Undo last restore applied", {
					checkpointId: preRollback.id,
					fileCount: updatedFiles.length,
				});

				void vscode.window.showInformationMessage(
					`$(check) Undo complete - restored ${updatedFiles.length} file${
						updatedFiles.length === 1 ? "" : "s"
					} to their pre-restore state`,
				);
			} catch (error) {
				logger.error("[Recovery] Undo last restore failed", error as Error);
				void vscode.window.showErrorMessage(`Failed to undo last restore: ${(error as Error).message}`);
			}
		}),
	);

	// ==========================================================================
	// Command: restoreAllRecent
	// ==========================================================================
	disposables.push(
		vscode.commands.registerCommand("vreko.restoreAllRecent", async () => {
			logger.debug("[Recovery] restoreAllRecent invoked");

			if (!recoveryService) {
				vscode.window.showErrorMessage("Recovery service not available. Please try again.");
				return;
			}

			try {
				// Get recent snapshots
				const recentSnapshots = await recoveryService.getRecent(10);

				if (recentSnapshots.length === 0) {
					vscode.window.showInformationMessage("No recent snapshots available to restore.");
					return;
				}

				// Get unique files
				const uniqueFilePaths = [...new Set(recentSnapshots.map((s: RecoverySnapshot) => s.anchorFile))];
				const fileCount = uniqueFilePaths.length;

				// Show MODAL confirmation for batch operation
				const selection = await vscode.window.showWarningMessage(
					`Restore ${fileCount} file${fileCount !== 1 ? "s" : ""} to their state before recent AI changes?`,
					{ modal: true },
					"Restore All",
					"Review First",
				);

				if (!selection) {
					return; // User cancelled
				}

				if (selection === "Review First") {
					// Open recent changes view
					await vscode.commands.executeCommand("vreko.showRecentChanges");
					return;
				}

				// Batch restore
				await recoveryService.restoreBatch(recentSnapshots);

				// Show success
				vscode.window.showInformationMessage(
					`$(check) Restored ${fileCount} file${fileCount !== 1 ? "s" : ""}`,
				);
			} catch (error) {
				logger.error("[Recovery] Batch restore failed", error as Error);
				vscode.window.showErrorMessage(`Failed to restore files: ${(error as Error).message}`);
			}
		}),
	);

	return disposables;
}

/**
 * Build QuickPick items for Quick Actions panel
 */
async function buildQuickActionItems(
	recoveryService?: IRecoveryService,
	sessionStatsProvider?: ISessionStatsProvider,
): Promise<QuickActionItem[]> {
	const items: QuickActionItem[] = [];

	// Wrap entire function in try-catch to prevent any unexpected errors from bubbling up
	try {
		// Get session stats
		let statsLabel = "Session: Active";
		if (sessionStatsProvider) {
			try {
				const stats = await sessionStatsProvider.getStats();
				const durationMins = Math.floor(stats.duration / 1000 / 60);
				const durationStr =
					durationMins >= 60 ? `${Math.floor(durationMins / 60)}h ${durationMins % 60}m` : `${durationMins}m`;
				statsLabel = `Session: ${durationStr} • ${stats.snapshotCount} snapshots`;
			} catch (error) {
				logger.warn("[Recovery] Failed to get session stats", error as Error);
			}
		}

		// Session stats header
		items.push({
			label: statsLabel,
			kind: vscode.QuickPickItemKind.Separator,
		});

		// Get recent snapshots
		let recentSnapshots: RecoverySnapshot[] = [];
		if (recoveryService) {
			try {
				recentSnapshots = await recoveryService.getRecent(5);
			} catch (error) {
				logger.warn("[Recovery] Failed to get recent snapshots", error as Error);
			}
		}

		// Recent files section
		items.push({
			label: "Recent Changes",
			kind: vscode.QuickPickItemKind.Separator,
		});

		if (recentSnapshots.length > 0) {
			for (const snapshot of recentSnapshots) {
				// Defensive: skip snapshots with missing required fields
				if (!snapshot.anchorFile || !snapshot.id) {
					logger.warn("[Recovery] Skipping snapshot with missing anchorFile or id", { snapshot });
					continue;
				}

				try {
					const fileName = path.basename(snapshot.anchorFile);
					const timeAgo = formatRelativeTime(snapshot.timestamp);
					const fileCount = snapshot.files?.length ?? 0;

					items.push({
						label: `$(file) ${fileName}`,
						description: timeAgo,
						detail: fileCount > 1 ? `${fileCount} files • ${snapshot.trigger}` : snapshot.trigger,
						action: "file",
						filePath: snapshot.anchorFile,
						snapshotId: snapshot.id,
					});
				} catch (error) {
					logger.warn("[Recovery] Failed to format snapshot item", { snapshot, error });
				}
			}
		} else {
			items.push({
				label: "$(info) No recent changes",
				description: "Snapshots appear here when AI makes changes",
			});
		}

		// Actions section
		items.push({
			label: "",
			kind: vscode.QuickPickItemKind.Separator,
		});

		items.push({
			label: "$(history) Undo Recent Changes",
			description: "Review and restore recent snapshots",
			action: "undo",
		});

		items.push({
			label: "$(list-tree) Open Recovery Timeline",
			description: "Browse all snapshots",
			action: "timeline",
		});

		items.push({
			label: "$(link-external) Open Dashboard",
			description: "View detailed analytics",
			action: "dashboard",
		});
	} catch (error) {
		// Log the unexpected error and return a minimal set of items
		logger.error("[Recovery] Unexpected error building quick action items", error as Error);

		// Return at least the navigation items so user can access features
		return [
			{
				label: "$(warning) Some features unavailable",
				description: "Check output panel for details",
			},
			{
				label: "$(list-tree) Open Recovery Timeline",
				description: "Browse all snapshots",
				action: "timeline" as const,
			},
			{
				label: "$(link-external) Open Dashboard",
				description: "View detailed analytics",
				action: "dashboard" as const,
			},
		];
	}

	return items;
}

/**
 * Handle Quick Action selection
 */
async function handleQuickAction(item: QuickActionItem): Promise<void> {
	switch (item.action) {
		case "file":
			if (item.filePath && item.snapshotId) {
				await vscode.commands.executeCommand("vreko.recovery.compare", {
					filePath: item.filePath,
					snapshotId: item.snapshotId,
				});
			}
			break;

		case "undo":
			await vscode.commands.executeCommand("vreko.showRecentChanges");
			break;

		case "timeline":
			await vscode.commands.executeCommand("vreko.openRecoveryTimeline");
			break;

		case "dashboard":
			await vscode.commands.executeCommand("vreko.openDashboard");
			break;
	}
}
