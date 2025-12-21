/**
 * ProtectedSection - Protected files tree view section
 *
 * Reference: ai_dev_utils/resources/extension-ux/EXTENSION_UX_SPEC.md#section-2-protected
 *
 * DESIGN PRINCIPLES:
 * - Grouped by protection level: BLOCK > WARN > WATCH (severity order)
 * - Text badges for accessibility (not color-only)
 * - "All (N)" option for flat list view
 * - Hide empty groups (no "WARN (0)")
 *
 * GOTCHAS:
 * - Include inherited files with (from anchor) indicator
 * - Keep "All" count in sync with actual files
 * - Sort by severity, then by path
 *
 * @packageDocumentation
 */

import * as vscode from "vscode";
import type { ProtectedFileInfo, ProtectionLevel, TreeItemContextValue } from "../ux-types";
import { LEVEL_DECORATIONS } from "../ux-types";

// =============================================================================
// TREE ITEM CREATION
// =============================================================================

/**
 * Create tree item for a protected file
 *
 * @param file - Protected file info
 */
export function createProtectedFileItem(file: ProtectedFileInfo): vscode.TreeItem {
	const filename = file.path.split(/[/\\]/).pop() ?? file.path;

	const item = new vscode.TreeItem(filename, vscode.TreeItemCollapsibleState.None);

	// Show inheritance info in description
	if (file.isInherited && file.anchorFile) {
		const anchorName = file.anchorFile.split(/[/\\]/).pop();
		item.description = `(from ${anchorName})`;
	}

	// Set icon with color
	const decoration = LEVEL_DECORATIONS[file.level];
	item.iconPath = new vscode.ThemeIcon("file", new vscode.ThemeColor(decoration.color));

	item.contextValue = "protected-file" satisfies TreeItemContextValue;

	item.tooltip = createFileTooltip(file);

	// Command to open file
	item.command = {
		command: "vscode.open",
		title: "Open File",
		arguments: [vscode.Uri.file(file.absolutePath)],
	};

	return item;
}

/**
 * Create tree item for a protection level group header
 *
 * Format: "[Badge] [LEVEL] ([Count])"
 * Example: "🛑 BLOCK (2)"
 */
export function createLevelGroupItem(level: ProtectionLevel, count: number): vscode.TreeItem {
	const decoration = LEVEL_DECORATIONS[level];

	const item = new vscode.TreeItem(
		`${decoration.badge} ${decoration.text} (${count})`,
		vscode.TreeItemCollapsibleState.Expanded,
	);

	item.contextValue = "protection-level-group" satisfies TreeItemContextValue;

	return item;
}

/**
 * Create "All (N)" tree item for flat list view
 */
export function createAllFilesItem(count: number): vscode.TreeItem {
	const item = new vscode.TreeItem(`All (${count})`, vscode.TreeItemCollapsibleState.Collapsed);

	item.tooltip = "View all protected files in a flat list";

	return item;
}

// =============================================================================
// FORMATTING HELPERS
// =============================================================================

/**
 * Create tooltip for protected file
 */
function createFileTooltip(file: ProtectedFileInfo): vscode.MarkdownString {
	const md = new vscode.MarkdownString();
	md.isTrusted = true;

	const decoration = LEVEL_DECORATIONS[file.level];
	md.appendMarkdown(`**${decoration.text}** protection\n\n`);
	md.appendMarkdown(`Path: \`${file.path}\`\n`);

	if (file.isInherited && file.anchorFile) {
		md.appendMarkdown(`Inherited from: \`${file.anchorFile}\`\n`);
	}

	if (file.snapshotCount > 0) {
		md.appendMarkdown(`\nSnapshots: ${file.snapshotCount}`);
	}

	return md;
}

// =============================================================================
// FILE GROUPING
// =============================================================================

/**
 * Group files by protection level
 *
 * @param files - Files to group
 * @returns Map with levels in severity order (BLOCK > WARN > WATCH)
 *
 * HINT: Returns in correct display order, skip empty groups
 */
export function groupFilesByLevel(files: ProtectedFileInfo[]): Map<ProtectionLevel, ProtectedFileInfo[]> {
	const groups = new Map<ProtectionLevel, ProtectedFileInfo[]>();

	// Initialize in severity order
	const levels: ProtectionLevel[] = ["BLOCK", "WARN", "WATCH"];

	for (const level of levels) {
		const levelFiles = files.filter((f) => f.level === level);
		if (levelFiles.length > 0) {
			// Sort by path within each level
			levelFiles.sort((a, b) => a.path.localeCompare(b.path));
			groups.set(level, levelFiles);
		}
	}

	return groups;
}

/**
 * Sort files by severity, then path
 *
 * Use for "All" view
 */
export function sortFilesBySeverity(files: ProtectedFileInfo[]): ProtectedFileInfo[] {
	const severityOrder: Record<ProtectionLevel, number> = {
		BLOCK: 0,
		WARN: 1,
		WATCH: 2,
	};

	return [...files].sort((a, b) => {
		const severityDiff = severityOrder[a.level] - severityOrder[b.level];
		if (severityDiff !== 0) {
			return severityDiff;
		}
		return a.path.localeCompare(b.path);
	});
}

// =============================================================================
// PROTECTED SECTION PROVIDER
// =============================================================================

/**
 * Protected files section data source
 *
 * INTEGRATION POINTS:
 * - Subscribe to ProtectionConfigManager for changes
 * - Subscribe to ConfigFileManager for .snapbackrc changes
 *
 * TODO: Wire up to existing protection system
 */
export class ProtectedSection {
	private files: ProtectedFileInfo[] = [];
	private readonly _onDidChange = new vscode.EventEmitter<void>();
	readonly onDidChange = this._onDidChange.event;

	/**
	 * Set protected files
	 *
	 * Replaces entire file list (typically from full scan)
	 */
	setFiles(files: ProtectedFileInfo[]): void {
		this.files = files;
		this._onDidChange.fire();
	}

	/**
	 * Add or update a protected file
	 */
	setFile(file: ProtectedFileInfo): void {
		const index = this.files.findIndex((f) => f.path === file.path);
		if (index !== -1) {
			this.files[index] = file;
		} else {
			this.files.push(file);
		}
		this._onDidChange.fire();
	}

	/**
	 * Remove a protected file
	 */
	removeFile(path: string): void {
		const index = this.files.findIndex((f) => f.path === path);
		if (index !== -1) {
			this.files.splice(index, 1);
			this._onDidChange.fire();
		}
	}

	/**
	 * Get all files
	 */
	getFiles(): ProtectedFileInfo[] {
		return this.files;
	}

	/**
	 * Get files grouped by level
	 */
	getGroupedFiles(): Map<ProtectionLevel, ProtectedFileInfo[]> {
		return groupFilesByLevel(this.files);
	}

	/**
	 * Get files sorted for "All" view
	 */
	getSortedFiles(): ProtectedFileInfo[] {
		return sortFilesBySeverity(this.files);
	}

	/**
	 * Get count for each level
	 */
	getLevelCounts(): Record<ProtectionLevel, number> {
		return {
			BLOCK: this.files.filter((f) => f.level === "BLOCK").length,
			WARN: this.files.filter((f) => f.level === "WARN").length,
			WATCH: this.files.filter((f) => f.level === "WATCH").length,
		};
	}

	get totalCount(): number {
		return this.files.length;
	}

	/**
	 * Load from protection system
	 *
	 * TODO: Implement integration with ProtectionConfigManager
	 */
	async load(): Promise<void> {
		// TODO: Load from ProtectionConfigManager
		// const config = await this.protectionManager.getProtectedFiles();
		// this.files = config.map(toProtectedFileInfo);
		// this._onDidChange.fire();
	}

	dispose(): void {
		this._onDidChange.dispose();
	}
}

// =============================================================================
// MOCK DATA FOR DEVELOPMENT
// =============================================================================

/**
 * Create mock protected files for development
 *
 * TODO: Remove before production
 */
export function createMockProtectedFiles(): ProtectedFileInfo[] {
	return [
		{
			path: "src/components/Button.tsx",
			absolutePath: "/project/src/components/Button.tsx",
			level: "BLOCK",
			isInherited: false,
			snapshotCount: 5,
		},
		{
			path: "src/components/Form.tsx",
			absolutePath: "/project/src/components/Form.tsx",
			level: "BLOCK",
			isInherited: false,
			snapshotCount: 3,
		},
		{
			path: "src/hooks/useButton.ts",
			absolutePath: "/project/src/hooks/useButton.ts",
			level: "WARN",
			isInherited: true,
			anchorFile: "src/components/Button.tsx",
			snapshotCount: 2,
		},
		{
			path: "src/types/button.ts",
			absolutePath: "/project/src/types/button.ts",
			level: "WATCH",
			isInherited: true,
			anchorFile: "src/components/Button.tsx",
			snapshotCount: 1,
		},
		{
			path: "src/styles/button.css",
			absolutePath: "/project/src/styles/button.css",
			level: "WATCH",
			isInherited: true,
			anchorFile: "src/components/Button.tsx",
			snapshotCount: 0,
		},
	];
}
