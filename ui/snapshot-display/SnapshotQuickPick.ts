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
 * - Session grouping: DBSCAN-clustered snapshots by logical work sessions
 *
 * Visual Format:
 * ┌──────────────────────────────────────────────────────────────┐
 * │  📍 Today 2:30 PM (3 snapshots)                  [Separator] │
 * │  🤖  api.ts                                        5m ago    │
 * │      AI activity detected                                    │
 * └──────────────────────────────────────────────────────────────┘
 *
 * @packageDocumentation
 */

import * as vscode from "vscode";
import { SessionClusterer } from "../../services/SessionClusterer";
import type { IStorageManager, ReasonCode, SnapshotManifest } from "../../storage/types";
import { logger } from "../../utils/logger";
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
	action?: "browse" | "settings" | "restore-session";
	sessionId?: string;
}

/**
 * Configuration for the SnapshotQuickPick
 */
export interface SnapshotQuickPickConfig {
	/** Maximum recent snapshots to show (default: 20) */
	maxRecent: number;
	/** Enable session grouping via DBSCAN (default: true) */
	enableSessionGrouping: boolean;
	/** Max time gap (minutes) between snapshots in same session (default: 30) */
	sessionGapMinutes: number;
}

const DEFAULT_CONFIG: SnapshotQuickPickConfig = {
	maxRecent: 20,
	enableSessionGrouping: true,
	sessionGapMinutes: 30,
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
	const reason = formatReason(reasons as ReasonCode[] | undefined);

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
	private readonly sessionClusterer: SessionClusterer;
	private quickPick: vscode.QuickPick<SnapshotQuickPickItem> | null = null;
	private disposables: vscode.Disposable[] = [];

	constructor(
		private readonly storageManager: IStorageManager,
		config?: Partial<SnapshotQuickPickConfig>,
	) {
		this.config = { ...DEFAULT_CONFIG, ...config };
		this.sessionClusterer = new SessionClusterer({
			maxGapMinutes: this.config.sessionGapMinutes,
			minSnapshotsPerSession: 2,
			includeNoise: true,
		});
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
					label: "❌ Failed to load snapshots",
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
	 * Build QuickPick items with session-grouped snapshots.
	 * Uses DBSCAN clustering to group snapshots by logical work sessions.
	 */
	private async buildQuickPickItems(): Promise<SnapshotQuickPickItem[]> {
		const items: SnapshotQuickPickItem[] = [];
		const snapshots = await this.loadRecentSnapshots();

		if (snapshots.length === 0) {
			items.push({
				label: "📜 Recent Snapshots",
				kind: vscode.QuickPickItemKind.Separator,
			});
			items.push({
				label: "ℹ️ No snapshots yet",
				description: "Snapshots will appear here as you work",
			});
		} else if (this.config.enableSessionGrouping && snapshots.length >= 3) {
			// Use session grouping for 3+ snapshots
			const sessions = this.sessionClusterer.clusterSnapshots(snapshots);
			logger.debug("Session clustering complete", {
				snapshots: snapshots.length,
				sessions: sessions.length,
			});

			for (const session of sessions) {
				// Session separator with label
				items.push({
					label: `📍 ${session.label}`,
					kind: vscode.QuickPickItemKind.Separator,
				});

				// Add "Restore entire session" option for multi-snapshot sessions
				if (session.snapshots.length > 1) {
					items.push({
						label: `    ↩️ Restore session (${session.snapshots.length} snapshots)`,
						description: `${session.files.length} files`,
						detail: "    Restore to start of this session",
						action: "restore-session",
						sessionId: session.id,
						snapshotId: session.snapshots[session.snapshots.length - 1].id, // Oldest in session
					});
				}

				// Add individual snapshots within session
				for (const snapshot of session.snapshots) {
					items.push(createSnapshotQuickPickItem(snapshot));
				}
			}
		} else {
			// Flat list for small snapshot counts
			items.push({
				label: "📜 Recent Snapshots",
				kind: vscode.QuickPickItemKind.Separator,
			});

			for (const snapshot of snapshots) {
				items.push(createSnapshotQuickPickItem(snapshot));
			}
		}

		// Separator
		items.push({
			label: "",
			kind: vscode.QuickPickItemKind.Separator,
		});

		// Actions
		items.push({
			label: "📁 Browse all snapshots...",
			action: "browse",
		});

		items.push({
			label: "⚙️ Snapshot settings...",
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
				await vscode.commands.executeCommand("vreko.browseSnapshots");
				break;

			case "settings":
				await vscode.commands.executeCommand("workbench.action.openSettings", "vreko.snapshot");
				break;

			case "restore-session":
				if (item.snapshotId) {
					await this.confirmAndRestoreSession(item.snapshotId, item.sessionId);
				}
				break;

			default:
				if (item.snapshotId) {
					await this.confirmAndRestore(item.snapshotId);
				}
				break;
		}
	}

	/**
	 * Show confirmation dialog and restore session if confirmed.
	 */
	private async confirmAndRestoreSession(snapshotId: string, sessionId?: string): Promise<void> {
		const manifest = await this.storageManager.getSnapshotManifest(snapshotId);
		if (!manifest) {
			vscode.window.showErrorMessage("Snapshot not found");
			return;
		}

		const timeLabel = formatRelativeTime(manifest.timestamp);

		const confirm = await vscode.window.showWarningMessage(
			`Restore to start of session (${timeLabel})?`,
			{
				modal: true,
				detail: "This will restore all files to their state at the beginning of this work session.",
			},
			"Restore Session",
			"Preview First",
		);

		if (confirm === "Restore Session") {
			await vscode.commands.executeCommand("vreko.restoreSnapshot", snapshotId);
			vscode.window.showInformationMessage("🦎 Session restored");
			logger.info("Session restored", { sessionId, snapshotId });
		} else if (confirm === "Preview First") {
			await vscode.commands.executeCommand("vreko.snapshot.showFileDiff", snapshotId);
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
			await vscode.commands.executeCommand("vreko.restoreSnapshot", snapshotId);
			vscode.window.showInformationMessage(`🦎 Restored ${fileLabel}`);
		} else if (confirm === "Preview First") {
			await vscode.commands.executeCommand("vreko.snapshot.showFileDiff", snapshotId);
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
		vscode.commands.registerCommand("vreko.showSnapshotQuickPick", async () => {
			const picker = new SnapshotQuickPick(storageManager);
			await picker.show();
		}),
	);

	// Alias command for status bar
	disposables.push(
		vscode.commands.registerCommand("vreko.restoreQuickPick", async () => {
			const picker = new SnapshotQuickPick(storageManager);
			await picker.show();
		}),
	);

	return disposables;
}
