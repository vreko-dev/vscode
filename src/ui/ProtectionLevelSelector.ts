/**
 * Protection Level Selector - UI helpers for protection level selection
 *
 * Provides consistent UI components for protection level selection
 * using VS Code's native Quick Pick and modal dialogs for consistent UX.
 */

import * as vscode from "vscode";
import type { ProtectionLevel } from "../types/protection.js";
import { PROTECTION_LEVELS } from "../types/protection.js";

/**
 * Show quick pick to select protection level
 *
 * @param currentLevel - Currently selected level (will be pre-selected in UI)
 * @returns Selected level or undefined if cancelled
 */
export async function selectLevel(
	currentLevel?: ProtectionLevel,
): Promise<ProtectionLevel | undefined> {
	// Build quick pick items from protection level metadata
	const items = Object.values(PROTECTION_LEVELS).map((metadata) => ({
		label: `${metadata.icon} ${metadata.label}`,
		description: metadata.description,
		detail: currentLevel === metadata.level ? "✓ Current level" : undefined,
		level: metadata.level,
		picked: currentLevel === metadata.level, // Pre-select current level
	}));

	// Show quick pick with proper styling
	const selected = await vscode.window.showQuickPick(items, {
		placeHolder: "Select protection level for this file",
		title: "File Protection Level",
		matchOnDescription: true,
		matchOnDetail: true,
	});

	return selected?.level;
}

/**
 * Show confirmation dialog for block-level protection
 *
 * When a file with BLOCK protection is saved, this modal dialog
 * requires explicit user action before allowing the save.
 *
 * @param filename - Name of the file being saved
 * @returns User choice: 'snapshot' (create snapshot first), 'override' (save anyway), or 'cancel'
 */
/**
 * Show confirmation dialog for block-level protection - MVP MODAL REPLACEMENT
 *
 * MVP Note: This modal has been commented out for MVP and will be replaced with
 * inline CodeLens + status-bar toast UI instead of full-screen modals.
 *
 * For context: Modal dialogs create interruption cost for users. The MVP approach
 * uses inline banners with "Allow once · Mark wrong · Details" chips that store
 * rationale without flow break.
 *
 * See Lean architecture v0 (MVP-ready) specification for implementation details.
 */
/*
export async function showBlockConfirmation(
	filename: string,
): Promise<"snapshot" | "override" | "cancel"> {
	const blockMetadata = PROTECTION_LEVELS.Protected;

	const choice = await vscode.window.showWarningMessage(
		`${blockMetadata.icon} File "${filename}" requires snapshot before save`,
		{
			modal: true,
			detail:
				"This file has BLOCK protection enabled. You must create a snapshot or explicitly override protection to save changes.",
		},
		"Create Snapshot",
		"Override Protection",
		"Cancel",
	);

	switch (choice) {
		case "Create Snapshot":
			return "snapshot";
		case "Override Protection":
			return "override";
		default:
			return "cancel";
	}
}
*/

// MVP implementation uses inline CodeLens + status-bar toast instead of modals
export async function showBlockConfirmation(
	_filename: string,
): Promise<"snapshot" | "override" | "cancel"> {
	// In MVP, block confirmation is handled via inline UI elements
	// This function is a placeholder that will be replaced with inline implementation
	throw new Error("Block confirmation modal replaced with inline UI in MVP");
}

/**
 * Show warning dialog for warn-level protection
 *
 * When a file with WARN protection is saved, this notification
 * prompts the user to optionally create a snapshot.
 *
 * @param filename - Name of the file being saved
 * @returns User choice: 'snapshot' (create snapshot), 'skip' (save without snapshot), or 'cancel'
 */
export async function showWarnPrompt(
	filename: string,
): Promise<"snapshot" | "skip" | "cancel"> {
	const warnMetadata = PROTECTION_LEVELS.Warning;

	const choice = await vscode.window.showWarningMessage(
		`${warnMetadata.icon} Save "${filename}" with snapshot?`,
		{
			modal: false, // Non-modal for less intrusive experience
			detail:
				"This file has WARN protection. Creating a snapshot is recommended before saving.",
		},
		"Create Snapshot",
		"Skip Snapshot",
		"Cancel",
	);

	switch (choice) {
		case "Create Snapshot":
			return "snapshot";
		case "Skip Snapshot":
			return "skip";
		default:
			return "cancel";
	}
}

/**
 * Show success notification after setting protection level
 *
 * @param filename - Name of the protected file
 * @param level - Protection level that was set
 */
export function showLevelSetNotification(
	filename: string,
	level: ProtectionLevel,
): void {
	const metadata = PROTECTION_LEVELS[level];
	vscode.window.showInformationMessage(
		`${metadata.icon} Protection set to ${metadata.label} for "${filename}"`,
	);
}

/**
 * Show error notification for protection level operation failure
 *
 * @param operation - Description of the failed operation
 * @param error - Error that occurred
 */
export function showErrorNotification(operation: string, error: Error): void {
	vscode.window.showErrorMessage(`Failed to ${operation}: ${error.message}`);
}
