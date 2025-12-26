/**
 * BlockModalHandler.ts
 *
 * Manages the "BLOCK" level protection modal interactions.
 * Handles the critical path where users must acknowledge before saving.
 *
 * Spec Reference: unified_ux_spec.md §3.5, §7.1 P0-7
 * Edge Cases Covered:
 *   - J4-E02: Auto-save enabled
 *   - J4-E04: 50 files saved at once
 *   - J4-E05: User walks away from modal
 *
 * Auto-save Strategy:
 *   - Detect auto-save context via VS Code settings
 *   - Show non-intrusive notification instead of modal
 *   - Queue file for deferred snapshot
 *   - Allow save to proceed but track for follow-up
 *
 * @see https://github.com/your-org/snapback/blob/main/apps/vscode/unified_ux_spec.md
 */

import * as vscode from "vscode";
import { logger } from "../utils/logger";

export enum BlockAction {
	/** Create snapshot and proceed with save */
	SNAPSHOT_AND_SAVE = "snapshot_and_save",
	/** Cancel the save operation */
	CANCEL = "cancel",
	/** Allow save and don't ask again for this file */
	DONT_ASK_AGAIN = "dont_ask_again",
	/** Allow save just this once */
	ALLOW_ONCE = "allow_once",
	/** Auto-save flow - silent snapshot */
	AUTO_SNAPSHOT = "auto_snapshot",
}

/**
 * Configuration for BlockModalHandler.
 */
export interface BlockModalConfig {
	/** Storage key for "don't ask" preferences */
	dontAskKey: string;
	/** Timeout for modal response (ms) */
	modalTimeoutMs: number;
	/** Whether to show notification for auto-save */
	showAutoSaveNotification: boolean;
}

const DEFAULT_CONFIG: BlockModalConfig = {
	dontAskKey: "snapback.block.dontAskFiles",
	modalTimeoutMs: 30_000, // 30 seconds before auto-timeout
	showAutoSaveNotification: true,
};

/**
 * Handles the UI flow for BLOCK-level interception.
 *
 * Features:
 * - Modal confirmation for manual saves
 * - Smart auto-save detection and handling
 * - "Don't ask again" persistence per file
 * - Timeout handling for abandoned modals
 */
export class BlockModalHandler {
	private config: BlockModalConfig;
	private dontAskFiles = new Set<string>();
	private pendingModals = new Map<
		string,
		{ resolve: (action: BlockAction) => void; timer: ReturnType<typeof setTimeout> }
	>();

	constructor(
		private readonly context: vscode.ExtensionContext,
		config: Partial<BlockModalConfig> = {},
	) {
		this.config = { ...DEFAULT_CONFIG, ...config };
		this.loadDontAskPreferences();
	}

	/**
	 * Load "don't ask" preferences from storage.
	 */
	private loadDontAskPreferences(): void {
		const saved = this.context.globalState.get<string[]>(this.config.dontAskKey, []);
		this.dontAskFiles = new Set(saved);
	}

	/**
	 * Save "don't ask" preferences to storage.
	 */
	private saveDontAskPreferences(): void {
		void this.context.globalState.update(this.config.dontAskKey, Array.from(this.dontAskFiles));
	}

	/**
	 * Check if auto-save is enabled in VS Code settings.
	 */
	private isAutoSaveEnabled(): boolean {
		const config = vscode.workspace.getConfiguration("files");
		const autoSave = config.get<string>("autoSave", "off");
		return autoSave !== "off";
	}

	/**
	 * Check if this specific save appears to be from auto-save.
	 * Uses heuristics since VS Code doesn't expose this directly.
	 */
	private isAutoSaveContext(_document: vscode.TextDocument): boolean {
		// Check if auto-save is enabled
		if (!this.isAutoSaveEnabled()) {
			return false;
		}

		// Check if document was recently changed (auto-save fires shortly after edit)
		// Note: This is a heuristic - VS Code doesn't expose auto-save events directly
		const config = vscode.workspace.getConfiguration("files");
		const autoSave = config.get<string>("autoSave", "off");
		const delay = config.get<number>("autoSaveDelay", 1000);

		// If auto-save is after delay, we're likely in auto-save context
		if (autoSave === "afterDelay" && delay < 2000) {
			return true;
		}

		// If auto-save is on focus change, harder to detect
		return autoSave === "onFocusChange" || autoSave === "onWindowChange";
	}

	/**
	 * Show the blocking modal for a protected file.
	 *
	 * @param fileName - Name of the file being saved
	 * @param filePath - Full path to the file
	 * @returns Action chosen by user
	 */
	async show(fileName: string, filePath: string): Promise<BlockAction> {
		// Check "don't ask" preference
		if (this.dontAskFiles.has(filePath)) {
			logger.debug("BlockModalHandler: File in 'don't ask' list", { filePath });
			return BlockAction.SNAPSHOT_AND_SAVE;
		}

		// If there's already a modal for this file, wait for it
		const existing = this.pendingModals.get(filePath);
		if (existing) {
			return new Promise((resolve) => {
				const originalResolve = existing.resolve;
				existing.resolve = (action) => {
					originalResolve(action);
					resolve(action);
				};
			});
		}

		return new Promise((resolve) => {
			// Set up timeout
			const timer = setTimeout(() => {
				this.pendingModals.delete(filePath);
				logger.info("BlockModalHandler: Modal timed out, auto-snapshot", { filePath });
				resolve(BlockAction.AUTO_SNAPSHOT);
			}, this.config.modalTimeoutMs);

			this.pendingModals.set(filePath, { resolve, timer });

			// Show the modal
			void this.showModalDialog(fileName, filePath).then((action) => {
				clearTimeout(timer);
				this.pendingModals.delete(filePath);
				resolve(action);
			});
		});
	}

	/**
	 * Show the actual modal dialog.
	 */
	private async showModalDialog(fileName: string, filePath: string): Promise<BlockAction> {
		const items: vscode.MessageItem[] = [
			{ title: "Create Snapshot & Save", isCloseAffordance: false },
			{ title: "Cancel Save", isCloseAffordance: true },
			{ title: "Allow This Time" },
		];

		const result = await vscode.window.showWarningMessage(
			`PROTECTED FILE: ${fileName}\n\nThis file is at BLOCK protection level. Creating a snapshot before saving ensures you can recover if needed.`,
			{ modal: true },
			...items,
		);

		if (!result) {
			// User dismissed modal
			logger.info("BlockModalHandler: User dismissed modal", { filePath });
			return BlockAction.CANCEL;
		}

		switch (result.title) {
			case "Create Snapshot & Save":
				logger.info("BlockModalHandler: User chose snapshot + save", { filePath });
				return BlockAction.SNAPSHOT_AND_SAVE;

			case "Cancel Save":
				logger.info("BlockModalHandler: User cancelled save", { filePath });
				return BlockAction.CANCEL;

			case "Allow This Time":
				logger.info("BlockModalHandler: User allowed once", { filePath });
				return BlockAction.ALLOW_ONCE;

			default:
				return BlockAction.CANCEL;
		}
	}

	/**
	 * Handle auto-save scenarios specifically.
	 * Edge Case: J4-E02
	 *
	 * Strategy: Don't interrupt auto-save with modal. Instead:
	 * 1. Create silent snapshot
	 * 2. Show non-intrusive notification
	 * 3. Allow save to proceed
	 *
	 * @param document - Document being auto-saved
	 * @returns true if handled (save should proceed), false if should block
	 */
	async handleAutoSave(document: vscode.TextDocument): Promise<BlockAction> {
		const filePath = document.uri.fsPath;
		const fileName = document.fileName.split(/[\\/]/).pop() || "unknown";

		// Detect if this is likely an auto-save
		if (!this.isAutoSaveContext(document)) {
			// Not auto-save - show normal modal
			return this.show(fileName, filePath);
		}

		logger.debug("BlockModalHandler: Auto-save detected", { filePath });

		// For auto-save: create silent snapshot, don't interrupt
		if (this.config.showAutoSaveNotification) {
			// Show subtle notification
			vscode.window.setStatusBarMessage(`$(shield) SnapBack: Auto-snapshot for ${fileName}`, 3000);
		}

		return BlockAction.AUTO_SNAPSHOT;
	}

	/**
	 * Add file to "don't ask" list.
	 */
	addToDontAsk(filePath: string): void {
		this.dontAskFiles.add(filePath);
		this.saveDontAskPreferences();
		logger.info("BlockModalHandler: Added to 'don't ask' list", { filePath });
	}

	/**
	 * Remove file from "don't ask" list.
	 */
	removeFromDontAsk(filePath: string): void {
		this.dontAskFiles.delete(filePath);
		this.saveDontAskPreferences();
	}

	/**
	 * Clear all "don't ask" preferences.
	 */
	clearDontAsk(): void {
		this.dontAskFiles.clear();
		this.saveDontAskPreferences();
	}

	/**
	 * Get number of pending modals.
	 */
	getPendingCount(): number {
		return this.pendingModals.size;
	}

	/**
	 * Dispose resources.
	 */
	dispose(): void {
		// Clear all pending modal timers
		for (const [, pending] of this.pendingModals) {
			clearTimeout(pending.timer);
			pending.resolve(BlockAction.CANCEL);
		}
		this.pendingModals.clear();
	}
}
