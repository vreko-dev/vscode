import * as vscode from "vscode";
import { COMMANDS } from "../constants/index.js";
import type { ProtectedFileRegistry } from "../services/protectedFileRegistry.js";
import {
	BRAND_SIGNAGE,
	getProtectionLevelSignage,
	legacyProtectionLevelToCanonical,
} from "../signage/index.js";
import type { CommandContext } from "./index.js";

interface EnhancedQuickPickItem extends vscode.QuickPickItem {
	action?: () => void | Promise<void>;
	isHeader?: boolean;
}

/**
 * QuickPick command for SnapBack protection status
 *
 * Shows comprehensive protection breakdown with actions:
 * - Protection level statistics
 * - Drill-down into specific levels
 * - Common actions (protect, refresh, settings, docs)
 */
export function registerStatusBarCommands(
	_context: vscode.ExtensionContext,
	ctx: CommandContext,
): vscode.Disposable[] {
	return [
		vscode.commands.registerCommand(COMMANDS.UTILITY.SHOW_STATUS, async () => {
			await showProtectionStatus(ctx.protectedFileRegistry);
		}),
	];
}

/**
 * Show the protection status QuickPick with detailed breakdown
 */
async function showProtectionStatus(
	protectedFileRegistry: ProtectedFileRegistry,
): Promise<void> {
	const files = await protectedFileRegistry.list();

	if (files.length === 0) {
		const result = await vscode.window.showInformationMessage(
			`${BRAND_SIGNAGE.logoEmoji} No files are currently protected`,
			"Protect a File",
			"Learn More",
		);

		if (result === "Protect a File") {
			await vscode.commands.executeCommand("snapback.protectFile");
		} else if (result === "Learn More") {
			await vscode.commands.executeCommand("snapback.openWalkthrough");
		}
		return;
	}

	// Count by protection level
	const watchCount = files.filter(
		(f) => f.protectionLevel === "Watched" || !f.protectionLevel,
	).length;
	const warnCount = files.filter((f) => f.protectionLevel === "Warning").length;
	const blockCount = files.filter(
		(f) => f.protectionLevel === "Protected",
	).length;

	const items: EnhancedQuickPickItem[] = [
		// Header
		{
			label: "SnapBack Protection Status",
			kind: vscode.QuickPickItemKind.Separator,
			isHeader: true,
		},
		{
			label: `${files.length} Files Protected`,
			description: `${watchCount}•${warnCount}•${blockCount}`,
			detail: "All files under SnapBack protection",
		},

		// Separator
		{
			label: "Protection Level Breakdown",
			kind: vscode.QuickPickItemKind.Separator,
		},

		// Watch level
		{
			label: `${getProtectionLevelSignage("watch").emoji} ${getProtectionLevelSignage("watch").label} (Silent)`,
			description: `${watchCount} ${watchCount === 1 ? "file" : "files"}`,
			detail: "Auto-snapshot on save • No notifications • Zero friction",
			buttons:
				watchCount > 0
					? [
							{
								iconPath: new vscode.ThemeIcon("list-tree"),
								tooltip: "View Watch-level files",
							},
						]
					: undefined,
			action:
				watchCount > 0
					? async () => {
							await showFilesByLevel(protectedFileRegistry, "Watched");
						}
					: undefined,
		},

		// Warn level
		{
			label: `${getProtectionLevelSignage("warn").emoji} ${getProtectionLevelSignage("warn").label} (Notify)`,
			description: `${warnCount} ${warnCount === 1 ? "file" : "files"}`,
			detail:
				"Confirmation prompt before save • Review changes • Stay informed",
			buttons:
				warnCount > 0
					? [
							{
								iconPath: new vscode.ThemeIcon("list-tree"),
								tooltip: "View Warn-level files",
							},
						]
					: undefined,
			action:
				warnCount > 0
					? async () => {
							await showFilesByLevel(protectedFileRegistry, "Warning");
						}
					: undefined,
		},

		// Block level
		{
			label: `${getProtectionLevelSignage("block").emoji} ${getProtectionLevelSignage("block").label} (Required)`,
			description: `${blockCount} ${blockCount === 1 ? "file" : "files"}`,
			detail: "Snapshot required • Maximum protection • Critical files",
			buttons:
				blockCount > 0
					? [
							{
								iconPath: new vscode.ThemeIcon("list-tree"),
								tooltip: "View Block-level files",
							},
						]
					: undefined,
			action:
				blockCount > 0
					? async () => {
							await showFilesByLevel(protectedFileRegistry, "Protected");
						}
					: undefined,
		},

		// Actions separator
		{
			label: "Actions",
			kind: vscode.QuickPickItemKind.Separator,
		},

		// View all files
		{
			label: "$(list-tree) View All Protected Files",
			description: "Open protection sidebar",
			detail: "Browse all protected files in tree view",
			action: async () => {
				await vscode.commands.executeCommand("snapbackProtectedFiles.focus");
			},
		},

		// Refresh
		{
			label: "$(refresh) Refresh Protection Status",
			description: "Reload from storage",
			detail: "Sync protection state across all views",
			action: async () => {
				await vscode.commands.executeCommand("snapback.refreshViews");
			},
		},

		// Quick protect
		{
			label: "$(shield) Protect Current File",
			description: "Add active file to protection",
			detail: "Quickly protect the file you're currently editing",
			action: async () => {
				await vscode.commands.executeCommand("snapback.protectCurrentFile");
			},
		},

		// Settings
		{
			label: "$(gear) Configure SnapBack",
			description: "Extension settings",
			detail: "Customize protection behavior and preferences",
			action: async () => {
				await vscode.commands.executeCommand(
					"workbench.action.openSettings",
					"@ext:MarcelleLabs.snapback-vscode",
				);
			},
		},

		// Documentation
		{
			label: "$(book) Documentation",
			description: "Learn more about SnapBack",
			detail: "View guides, tips, and best practices",
			action: async () => {
				await vscode.commands.executeCommand("snapback.openDocumentation");
			},
		},
	];

	// Create QuickPick with brand styling
	const quickPick = vscode.window.createQuickPick<EnhancedQuickPickItem>();
	quickPick.title = `${BRAND_SIGNAGE.logoEmoji} ${BRAND_SIGNAGE.shortLabel} Protection Status`;
	quickPick.placeholder = "Select an action or press Escape to close";
	quickPick.items = items;
	quickPick.matchOnDescription = true;
	quickPick.matchOnDetail = true;

	// Handle selection
	quickPick.onDidAccept(async () => {
		const selected = quickPick.selectedItems[0];
		if (selected?.action) {
			quickPick.hide();
			await selected.action();
		}
	});

	// Handle button clicks (the tree view icons next to each level)
	quickPick.onDidTriggerItemButton(async (e) => {
		const item = e.item as EnhancedQuickPickItem;
		if (item.action) {
			quickPick.hide();
			await item.action();
		}
	});

	quickPick.show();
}

/**
 * Show files filtered by protection level
 */
async function showFilesByLevel(
	protectedFileRegistry: ProtectedFileRegistry,
	level: "Watched" | "Warning" | "Protected",
): Promise<void> {
	const allFiles = await protectedFileRegistry.list();
	const filteredFiles = allFiles.filter(
		(f) =>
			f.protectionLevel === level ||
			(level === "Watched" && !f.protectionLevel),
	);

	if (filteredFiles.length === 0) {
		void vscode.window.showInformationMessage(`No files at ${level} level`);
		return;
	}

	// Map legacy level to canonical and get signage
	const canonical = legacyProtectionLevelToCanonical(level);
	const signage = getProtectionLevelSignage(canonical);
	const info = { name: signage.label, emoji: signage.emoji || "" };

	// Create file selection QuickPick
	const items = filteredFiles.map((file) => ({
		label: `$(file) ${file.label}`,
		description: file.path,
		detail: `Last protected: ${new Date(
			file.lastProtectedAt || Date.now(),
		).toLocaleString()}`,
		file: file,
	}));

	const selected = await vscode.window.showQuickPick(items, {
		title: `${info.emoji} ${info.name} Level Files (${filteredFiles.length})`,
		placeHolder: "Select a file to open",
		matchOnDescription: true,
	});

	if (selected) {
		const uri = vscode.Uri.file(selected.file.path);
		await vscode.window.showTextDocument(uri);
	}
}
