/**
 * @fileoverview Snapshot Restore UI - GitLens-level restore experience with diff previews
 *
 * This module provides a multi-step QuickPick flow for snapshot restoration
 * with rich diff previews, file selection, and visual change indicators.
 * Implements a GitLens-inspired UX for professional-grade snapshot management.
 */

import * as vscode from "vscode";
import type { OperationCoordinator } from "../operationCoordinator.js";
import type { SnapshotDocumentProvider } from "../providers/SnapshotDocumentProvider.js";
import {
	analyzeSnapshot,
	type FileChange,
} from "../utils/FileChangeAnalyzer.js";
import { logger } from "../utils/logger.js";

/**
 * Snapshot restore UI orchestrator
 *
 * Provides a multi-phase restoration workflow:
 * 1. Snapshot Selection - Choose which snapshot to restore
 * 2. File Selection - Choose which files to restore with change preview
 * 3. Diff Preview - View side-by-side diffs before committing
 * 4. Confirmation & Restoration - Execute the restore operation
 */
export class SnapshotRestoreUI {
	private statusBarItem: vscode.StatusBarItem | undefined;
	private openDiffTabs: vscode.Tab[] = [];
	private snapshotFiles: Set<string> = new Set();

	constructor(
		private coordinator: OperationCoordinator,
		private _snapshotDocumentProvider: SnapshotDocumentProvider,
		private workspaceRoot: string,
	) {}

	/**
	 * Main entry point - starts the multi-step restore workflow
	 *
	 * @returns true if restoration was completed, false if cancelled
	 */
	async showRestoreWorkflow(): Promise<boolean> {
		try {
			// Phase 1: Select snapshot
			const snapshot = await this.selectSnapshot();
			if (!snapshot) {
				return false; // User cancelled
			}

			// Phase 2: Analyze changes and select files
			const selectedFiles = await this.selectFilesWithPreview(snapshot);
			if (!selectedFiles || selectedFiles.length === 0) {
				return false; // User cancelled or no files selected
			}

			// Phase 3: Show diff previews
			const shouldRestore = await this.showDiffPreviews(
				snapshot,
				selectedFiles,
			);
			if (!shouldRestore) {
				await this.cleanupDiffTabs();
				return false; // User cancelled
			}

			// Phase 4: Execute restoration
			const success = await this.executeRestoration(snapshot.id, selectedFiles);

			// Cleanup
			await this.cleanupDiffTabs();
			this.disposeStatusBar();

			return success;
		} catch (error) {
			logger.error("Restore workflow failed", error as Error);
			vscode.window.showErrorMessage(
				`Restore workflow failed: ${
					error instanceof Error ? error.message : String(error)
				}`,
			);

			// Ensure cleanup on error
			await this.cleanupDiffTabs();
			this.disposeStatusBar();

			return false;
		}
	}

	/**
	 * Phase 1: Snapshot Selection
	 *
	 * Shows a rich QuickPick with snapshot metadata
	 */
	private async selectSnapshot(): Promise<SnapshotInfo | undefined> {
		return vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.Window,
				title: "Loading snapshots...",
				cancellable: false,
			},
			async () => {
				const snapshots = await this.coordinator.listSnapshots();

				if (snapshots.length === 0) {
					vscode.window.showInformationMessage(
						"No snapshots available to restore",
					);
					return undefined;
				}

				// Create rich QuickPick items
				const items: SnapshotQuickPickItem[] = snapshots
					.sort((a, b) => b.timestamp - a.timestamp)
					.map((cp) => ({
						label: `$(clock) ${cp.name}`,
						description: this.formatTimeAgo(cp.timestamp),
						detail: `Snapshot ID: ${cp.id.substring(0, 8)}... • ${
							Object.keys(cp.fileContents || {}).length
						} files`,
						id: cp.id,
						timestamp: cp.timestamp,
						fileContents: cp.fileContents || {},
						name: cp.name,
					}));

				const selected = await vscode.window.showQuickPick(items, {
					placeHolder: "Select snapshot to restore",
					matchOnDetail: true,
					matchOnDescription: true,
				});

				return selected
					? {
							id: selected.id,
							name: selected.name,
							timestamp: selected.timestamp,
							fileContents: selected.fileContents,
						}
					: undefined;
			},
		);
	}

	/**
	 * Phase 2: File Selection with Change Preview
	 *
	 * Shows files with change indicators and allows multi-selection
	 */
	private async selectFilesWithPreview(
		snapshot: SnapshotInfo,
	): Promise<FileChange[] | undefined> {
		return vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.Window,
				title: "Analyzing changes...",
				cancellable: false,
			},
			async () => {
				// Analyze all file changes
				const changes = await analyzeSnapshot(
					snapshot.fileContents,
					this.workspaceRoot,
				);

				if (changes.length === 0) {
					vscode.window.showInformationMessage("No files in snapshot");
					return undefined;
				}

				// Create QuickPick with file items
				const quickPick =
					vscode.window.createQuickPick<FileChangeQuickPickItem>();
				quickPick.title = `Restore from: ${snapshot.name}`;
				quickPick.placeholder =
					"Select files to restore (Space to toggle, Enter to preview diffs)";
				quickPick.canSelectMany = true;
				quickPick.matchOnDetail = true;
				quickPick.matchOnDescription = true;

				// Create items with change indicators
				quickPick.items = changes.map((change) => ({
					label: `$(${change.icon}) ${change.fileName}`,
					description: change.changeSummary,
					detail: change.relativePath,
					picked: change.changeType !== "unchanged", // Auto-select changed files
					change,
				}));

				// Auto-select all changed files by default
				quickPick.selectedItems = quickPick.items.filter((item) => item.picked);

				// Show the picker and wait for user selection
				return new Promise<FileChange[] | undefined>((resolve) => {
					quickPick.onDidAccept(() => {
						const selected = quickPick.selectedItems.map((item) => item.change);
						quickPick.dispose();
						resolve(selected);
					});

					quickPick.onDidHide(() => {
						quickPick.dispose();
						resolve(undefined);
					});

					quickPick.show();
				});
			},
		);
	}

	/**
	 * Phase 3: Show Diff Previews
	 *
	 * Opens side-by-side diffs for all selected files and shows action bar
	 */
	private async showDiffPreviews(
		snapshot: SnapshotInfo,
		selectedFiles: FileChange[],
	): Promise<boolean> {
		logger.info("Opening diff previews", {
			snapshotId: snapshot.id,
			fileCount: selectedFiles.length,
		});

		// Clear previous tracking
		this.openDiffTabs = [];
		this.snapshotFiles.clear();

		// Register snapshot content with provider
		for (const fileChange of selectedFiles) {
			this._snapshotDocumentProvider.setSnapshotContent(
				snapshot.id,
				fileChange.filePath,
				fileChange.snapshotContent,
			);
			// Track files for cleanup
			this.snapshotFiles.add(fileChange.filePath);
		}

		// Open diffs for all files and track them properly
		const openedTabs: vscode.Tab[] = [];
		for (const fileChange of selectedFiles) {
			try {
				// Skip unchanged files
				if (fileChange.changeType === "unchanged") {
					continue;
				}

				// Create URIs for diff editor
				// Format: snapback-snapshot:snapshot-id/file/path.ts
				const snapshotUri = vscode.Uri.parse(
					`snapback-snapshot:${snapshot.id}/${fileChange.filePath}`,
				);

				const currentUri = vscode.Uri.file(fileChange.filePath);

				// Open side-by-side diff
				await vscode.commands.executeCommand(
					"vscode.diff",
					snapshotUri,
					currentUri,
					`Snapshot ← ${fileChange.fileName} → Current`,
				);

				// Track the opened tab by looking for tabs that contain our diff
				// Wait a bit for the tab to be created
				await new Promise((resolve) => setTimeout(resolve, 100));

				const tabs = vscode.window.tabGroups.all
					.flatMap((group) => group.tabs)
					.filter((tab) => {
						// Use proper VS Code API for tab input detection
						if (tab.input instanceof vscode.TabInputTextDiff) {
							return (
								tab.input.original.toString() === snapshotUri.toString() &&
								tab.input.modified.toString() === currentUri.toString()
							);
						}
						return false;
					});

				if (tabs.length > 0) {
					openedTabs.push(...tabs);
				}
			} catch (error) {
				logger.error("Failed to open diff for file", error as Error, {
					filePath: fileChange.filePath,
				});
			}
		}

		// Set the tracked tabs
		this.openDiffTabs = openedTabs;

		// Show status bar with action buttons
		this.showRestoreStatusBar(snapshot.name, selectedFiles.length);

		// Wait for user decision
		return this.waitForRestoreDecision(snapshot.name, selectedFiles.length);
	}

	/**
	 * Shows status bar with Restore and Cancel actions
	 */
	private showRestoreStatusBar(snapshotName: string, fileCount: number): void {
		this.statusBarItem = vscode.window.createStatusBarItem(
			vscode.StatusBarAlignment.Left,
			1000,
		);

		this.statusBarItem.text = `$(repo) Reviewing: ${snapshotName} (${fileCount} files)`;
		this.statusBarItem.tooltip = "Click to choose: Restore or Cancel";
		// Wire the status bar item to the restore command
		this.statusBarItem.command = "snapback.internal.restoreFromPreview";
		this.statusBarItem.show();
	}

	/**
	 * Waits for user to click Restore or Cancel
	 */
	private async waitForRestoreDecision(
		_snapshotName: string,
		_fileCount: number,
	): Promise<boolean> {
		// Create a promise that resolves when the user makes a decision
		return new Promise<boolean>((resolve) => {
			// Set up command handlers for the status bar actions
			const restoreCommand = vscode.commands.registerCommand(
				"snapback.internal.restoreFromPreview",
				() => {
					// Clean up command handlers
					restoreCommand.dispose();
					cancelCommand.dispose();
					// Resolve with true (restore)
					resolve(true);
				},
			);

			const cancelCommand = vscode.commands.registerCommand(
				"snapback.internal.cancelRestore",
				() => {
					// Clean up command handlers
					restoreCommand.dispose();
					cancelCommand.dispose();
					// Resolve with false (cancel)
					resolve(false);
				},
			);

			/**
			 * MVP Note: Modal dialog has been commented out for MVP and will be replaced with
			 * inline CodeLens + status-bar toast UI instead of full-screen modals.
			 *
			 * For context: Modal dialogs create interruption cost for users. The MVP approach
			 * uses inline banners with "Allow once · Mark wrong · Details" chips that store
			 * rationale without flow break.
			 */
			/*
			// Also show the modal dialog as a fallback
			vscode.window
				.showInformationMessage(
					"Review the diffs. Restore these changes?",
					{ modal: true },
					"SnapBack to Snapshot",
					"Cancel",
				)
				.then((decision) => {
					// Clean up command handlers
					restoreCommand.dispose();
					cancelCommand.dispose();
					// Resolve based on user decision
					resolve(decision === "SnapBack to Snapshot");
				});
			*/

			// MVP implementation uses inline CodeLens + status-bar toast instead of modals
			// For now, we'll resolve with false to prevent restoration via modal
			resolve(false);
		});
	}

	/**
	 * Phase 4: Execute Restoration
	 */
	private async executeRestoration(
		snapshotId: string,
		selectedFiles: FileChange[],
	): Promise<boolean> {
		return vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.Notification,
				title: "Restoring snapshot...",
				cancellable: false,
			},
			async (progress) => {
				try {
					progress.report({ message: "Applying changes..." });

					// Extract file paths for restoration
					const filePaths = selectedFiles.map((f) => f.filePath);

					// Execute restoration through coordinator
					const result = await this.coordinator.restoreToSnapshot(snapshotId, {
						files: filePaths,
					});

					if (result) {
						vscode.window.showInformationMessage(
							`SnapBack complete - Restored ${selectedFiles.length} files successfully`,
						);
						return true;
					}

					vscode.window.showErrorMessage("Failed to restore snapshot");
					return false;
				} catch (error) {
					logger.error("Restoration failed", error as Error);
					vscode.window.showErrorMessage(
						`Restoration failed: ${
							error instanceof Error ? error.message : String(error)
						}`,
					);
					return false;
				}
			},
		);
	}

	/**
	 * Cleanup: Close all diff editors
	 */
	private async cleanupDiffTabs(): Promise<void> {
		// Close tracked diff tabs
		for (const tab of this.openDiffTabs) {
			try {
				await vscode.window.tabGroups.close(tab);
			} catch (error) {
				logger.warn("Failed to close diff tab", error as Error);
			}
		}

		// Clear all snapshot content to prevent memory leaks
		try {
			// @ts-expect-error - We need to access the contentMap to clear it
			this._snapshotDocumentProvider.contentMap?.clear();
		} catch (error) {
			logger.warn("Failed to clear snapshot content", error as Error);
		}

		// Clear tracking arrays
		this.openDiffTabs = [];
		this.snapshotFiles.clear();

		logger.info("Closed diff preview tabs and cleared snapshot content");
	}

	/**
	 * Cleanup: Dispose status bar
	 */
	private disposeStatusBar(): void {
		if (this.statusBarItem) {
			this.statusBarItem.dispose();
			this.statusBarItem = undefined;
		}
	}

	/**
	 * Formats a timestamp into a human-readable "time ago" string
	 */
	private formatTimeAgo(timestamp: number): string {
		const now = Date.now();
		const diffMs = now - timestamp;
		const diffSec = Math.floor(diffMs / 1000);
		const diffMin = Math.floor(diffSec / 60);
		const diffHours = Math.floor(diffMin / 60);
		const diffDays = Math.floor(diffHours / 24);

		if (diffSec < 60) {
			return `${diffSec}s ago`;
		}
		if (diffMin < 60) {
			return `${diffMin}m ago`;
		}
		if (diffHours < 24) {
			return `${diffHours}h ago`;
		}
		return `${diffDays}d ago`;
	}
}

/**
 * Snapshot information for UI
 */
interface SnapshotInfo {
	id: string;
	name: string;
	timestamp: number;
	fileContents: Record<string, string>;
}

/**
 * QuickPick item for snapshot selection
 */
interface SnapshotQuickPickItem extends vscode.QuickPickItem {
	id: string;
	timestamp: number;
	fileContents: Record<string, string>;
	name: string;
}

/**
 * QuickPick item for file selection
 */
interface FileChangeQuickPickItem extends vscode.QuickPickItem {
	change: FileChange;
	picked: boolean;
}
