/**
 * SnapshotQuickPick - Status bar click → Quick restore flow
 *
 * Primary entry point for snapshot restoration. Optimized for the
 * "oh shit" moment when user needs to restore NOW.
 *
 * Design Principles:
 * - Instant recognition: Icons + file names, not UUIDs
 * - Progressive disclosure: Essential info first
 * - Keyboard-first: Arrow keys, Enter, Escape
 *
 * Visual Format:
 * ┌──────────────────────────────────────────────────────────────┐
 * │  🤖  api.ts                                        5m ago    │
 * │      AI activity detected                                    │
 * └──────────────────────────────────────────────────────────────┘
 *
 * @packageDocumentation
 */

import { logger } from "../../utils/logger";
import * as vscode from "vscode";
import type { IStorageManager, SnapshotManifest } from "../../storage/types";
import {
	type AnySnapshotManifest,
	formatAnchorFile,
	formatReason,
	formatRelativeTime,
	getOriginIcon,
	isV2Manifest,
} from "./formatting";

// =============================================================================
// TYPES
// =============================================================================

/**
 * QuickPick item for snapshot selection
 */
export interface SnapshotQuickPickItem extends vscode.QuickPickItem {
	snapshotId?: string;
	action?: "browse" | "settings";
}

/**
 * Configuration for the SnapshotQuickPick
 */
export interface SnapshotQuickPickConfig {
	/** Maximum recent snapshots to show (default: 10) */
	maxRecent: number;
}

const DEFAULT_CONFIG: SnapshotQuickPickConfig = {
	maxRecent: 10,
};

// =============================================================================
// ITEM CREATION
// =============================================================================

/**
 * Get reasons from a snapshot manifest (V1 or V2)
 */
function getSnapshotReasons(snapshot: AnySnapshotManifest): string[] | undefined {
	if (isV2Manifest(snapshot)) {
		return snapshot.metadata?.reasons;
	}
	// V1 manifest - convert trigger to reason-like format
	const v1 = snapshot as SnapshotManifest;
	if (v1.metadata?.aiDetection?.detected) {
		return ["AI_DETECTED"];
	}
	switch (v1.trigger) {
		case "manual":
			return ["MANUAL_CHECKPOINT"];
		case "ai-detected":
			return ["AI_DETECTED"];
		case "auto":
			return ["RISK_BURST_START"]; // Default auto reason
		case "pre-save":
			return ["PRE_ROLLBACK"];
		default:
			return undefined;
	}
}

/**
 * Create a QuickPick item from a snapshot manifest.
 *
 * Works with both V1 and V2 manifests.
 *
 * Format:
 * - Label: "🤖  api.ts" or "📸  index.ts (+2)"
 * - Description: "5m ago"
 * - Detail: "    AI activity detected"
 *
 * @param snapshot - Snapshot manifest (V1 or V2)
 * @returns QuickPick item ready for display
 */
export function createSnapshotQuickPickItem(snapshot: AnySnapshotManifest): SnapshotQuickPickItem {
	const icon = getOriginIcon(snapshot);
	const file = formatAnchorFile(snapshot);
	const time = formatRelativeTime(snapshot.timestamp);
	const reasons = getSnapshotReasons(snapshot);
	const reason = formatReason(reasons as any);

	return {
		label: `${icon}  ${file}`,
		description: time,
		detail: `    ${reason}`,
		snapshotId: snapshot.id,
	};
}

// =============================================================================
// MAIN CLASS
// =============================================================================

/**
 * SnapshotQuickPick - Minimal restore UI via QuickPick
 *
 * Implements the "status bar → quick picker → restore" flow
 * as the primary restore experience.
 */
export class SnapshotQuickPick implements vscode.Disposable {
	private readonly config: SnapshotQuickPickConfig;
	private quickPick: vscode.QuickPick<SnapshotQuickPickItem> | null = null;
	private disposables: vscode.Disposable[] = [];

	constructor(
		private readonly storageManager: IStorageManager,
		config?: Partial<SnapshotQuickPickConfig>,
	) {
		this.config = { ...DEFAULT_CONFIG, ...config };
	}

	/**
	 * Show the main QuickPick for snapshot selection.
	 *
	 * This is the primary entry point, triggered by:
	 * - Status bar click
	 * - Keyboard shortcut (Cmd+Shift+R)
	 * - Command palette
	 */
	async show(): Promise<void> {
		this.quickPick = vscode.window.createQuickPick<SnapshotQuickPickItem>();
		this.quickPick.title = "Restore Snapshot";
		this.quickPick.placeholder = "Select a snapshot to restore...";
		this.quickPick.matchOnDescription = true;
		this.quickPick.matchOnDetail = true;
		this.quickPick.busy = true;

		// Show immediately, populate async
		this.quickPick.show();

		try {
			const items = await this.buildQuickPickItems();
			this.quickPick.items = items;
			this.quickPick.busy = false;
		} catch (error) {
			logger.error("Failed to load snapshots for QuickPick", error as Error);
			this.quickPick.items = [
				{
					label: "$(error) Failed to load snapshots",
					description: "Check the output panel for details",
				},
			];
			this.quickPick.busy = false;
		}

		// Handle selection
		const acceptDisposable = this.quickPick.onDidAccept(async () => {
			const selected = this.quickPick?.selectedItems[0];
			this.quickPick?.hide();

			if (!selected) {
				return;
			}

			await this.handleSelection(selected);
		});

		// Handle hide
		const hideDisposable = this.quickPick.onDidHide(() => {
			this.quickPick?.dispose();
			this.quickPick = null;
			acceptDisposable.dispose();
			hideDisposable.dispose();
		});
	}

	/**
	 * Build QuickPick items with recent snapshots and actions.
	 */
	private async buildQuickPickItems(): Promise<SnapshotQuickPickItem[]> {
		const items: SnapshotQuickPickItem[] = [];
		const snapshots = await this.loadRecentSnapshots();

		// Header: Recent snapshots
		items.push({
			label: "$(history) Recent Snapshots",
			kind: vscode.QuickPickItemKind.Separator,
		});

		if (snapshots.length > 0) {
			// Add snapshot items
			for (const snapshot of snapshots) {
				items.push(createSnapshotQuickPickItem(snapshot));
			}
		} else {
			items.push({
				label: "$(info) No snapshots yet",
				description: "Snapshots will appear here as you work",
			});
		}

		// Separator
		items.push({
			label: "",
			kind: vscode.QuickPickItemKind.Separator,
		});

		// Actions
		items.push({
			label: "$(folder) Browse all snapshots...",
			action: "browse",
		});

		items.push({
			label: "$(gear) Snapshot settings...",
			action: "settings",
		});

		return items;
	}

	/**
	 * Load recent snapshots from storage.
	 * Throws on error so caller can display error state.
	 */
	private async loadRecentSnapshots(): Promise<SnapshotManifest[]> {
		const manifests = await this.storageManager.listSnapshots({
			limit: this.config.maxRecent,
		});

		// Sort by timestamp (newest first)
		return manifests.sort((a, b) => b.timestamp - a.timestamp);
	}

	/**
	 * Handle QuickPick item selection.
	 */
	private async handleSelection(item: SnapshotQuickPickItem): Promise<void> {
		switch (item.action) {
			case "browse":
				await vscode.commands.executeCommand("snapback.browseSnapshots");
				break;

			case "settings":
				await vscode.commands.executeCommand("workbench.action.openSettings", "snapback.snapshot");
				break;

			default:
				if (item.snapshotId) {
					await this.confirmAndRestore(item.snapshotId);
				}
				break;
		}
	}

	/**
	 * Show confirmation dialog and restore if confirmed.
	 */
	private async confirmAndRestore(snapshotId: string): Promise<void> {
		const manifest = await this.storageManager.getSnapshotManifest(snapshotId);
		if (!manifest) {
			vscode.window.showErrorMessage("Snapshot not found");
			return;
		}

		const _fileCount = Object.keys(manifest.files).length;
		const fileLabel = formatAnchorFile(manifest);
		const timeLabel = formatRelativeTime(manifest.timestamp);

		const confirm = await vscode.window.showWarningMessage(
			`Restore ${fileLabel} to ${timeLabel}?`,
			{ modal: true },
			"Restore",
			"Preview First",
		);

		if (confirm === "Restore") {
			await vscode.commands.executeCommand("snapback.restoreSnapshot", snapshotId);
			vscode.window.showInformationMessage(`🧢 Restored ${fileLabel}`);
		} else if (confirm === "Preview First") {
			await vscode.commands.executeCommand("snapback.diffSnapshot", snapshotId);
		}
	}

	dispose(): void {
		this.quickPick?.dispose();
		this.quickPick = null;
		for (const d of this.disposables) {
			d.dispose();
		}
	}
}

// =============================================================================
// COMMAND REGISTRATION
// =============================================================================

/**
 * Register SnapshotQuickPick commands.
 */
export function registerSnapshotQuickPickCommands(
	_context: vscode.ExtensionContext,
	storageManager: IStorageManager,
): vscode.Disposable[] {
	const disposables: vscode.Disposable[] = [];

	// Main command: Show QuickPick (status bar click)
	disposables.push(
		vscode.commands.registerCommand("snapback.showSnapshotQuickPick", async () => {
			const picker = new SnapshotQuickPick(storageManager);
			await picker.show();
		}),
	);

	// Alias command for status bar
	disposables.push(
		vscode.commands.registerCommand("snapback.restoreQuickPick", async () => {
			const picker = new SnapshotQuickPick(storageManager);
			await picker.show();
		}),
	);

	return disposables;
}
