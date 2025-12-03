import * as path from "node:path";
import * as vscode from "vscode";
import type { ProtectedFileRegistry } from "../services/protectedFileRegistry.js";
import {
	CORE_CONCEPT_SIGNAGE,
	PROTECTION_LEVEL_SIGNAGE,
} from "../signage/index.js";
import type { ProtectionLevelCanonical } from "../signage/types.js";
import { logger } from "../utils/logger.js";
import type { ProtectedFileEntry, ProtectionLevel } from "./types";

/**
 * Explorer-integrated tree provider for protected files
 *
 * This provider groups protected files by their protection level (Block, Warn, Watch)
 * to reduce visual clutter and improve organization. Files are shown under
 * collapsible sections with just their filename.
 *
 * DESIGN PRINCIPLES:
 * - Grouped by protection level (Block > Warn > Watch sections)
 * - Sections default to collapsed to reduce cognitive overload
 * - Simple filename labels (no emojis in file items)
 * - Rich tooltips with protection details
 * - Click to open file behavior
 *
 * VISUAL HIERARCHY:
 * - Section: Protection level name with emoji and file count
 * - File: Just the filename, no redundant level indicators
 * - Tooltip: Full details with path and protection metadata
 */
export class ProtectedFilesTreeProvider
	implements vscode.TreeDataProvider<vscode.TreeItem>, vscode.Disposable
{
	private readonly _onDidChangeTreeData = new vscode.EventEmitter<
		vscode.TreeItem | undefined
	>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
	private disposables: vscode.Disposable[] = [];

	constructor(private readonly protectedFiles: ProtectedFileRegistry) {
		// Subscribe to protection changes for automatic refresh
		this.disposables.push(
			this.protectedFiles.onDidChangeProtectedFiles(() => {
				this.refresh();
			}),
		);
	}

	getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
		return element;
	}

	async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
		// Root level: show protection level sections
		if (!element) {
			try {
				const files = await this.protectedFiles.list();

				// CRITICAL: Filter out any undefined/null entries before processing
				const validFiles = files.filter((file) => {
					if (!file) {
						logger.warn("⚠️ Skipping undefined protected file entry");
						return false;
					}
					if (!file.label) {
						logger.warn("⚠️ Skipping file with no label:", file);
						return false;
					}
					return true;
				});

				if (validFiles.length !== files.length) {
					logger.info(
						`📦 Found ${validFiles.length} valid protected files out of ${files.length} total`,
					);
				}

				// 🛡️ Verify state consistency for all files
				for (const file of validFiles) {
					await this.protectedFiles.verifyProtectionState(file.path);
				}

				// Group files by canonical protection level (block > warn > watch)
				const blockFiles = validFiles.filter(
					(f) => f.protectionLevel === "Protected",
				);
				const warnFiles = validFiles.filter(
					(f) => f.protectionLevel === "Warning",
				);
				const watchFiles = validFiles.filter(
					(f) => f.protectionLevel === "Watched" || !f.protectionLevel,
				);

				// Create section nodes (collapsed by default to reduce cognitive overload)
				const sections: vscode.TreeItem[] = [];

				if (blockFiles.length > 0) {
					sections.push(
						createProtectionLevelSection("block", blockFiles.length),
					);
				}

				if (warnFiles.length > 0) {
					sections.push(createProtectionLevelSection("warn", warnFiles.length));
				}

				if (watchFiles.length > 0) {
					sections.push(
						createProtectionLevelSection("watch", watchFiles.length),
					);
				}

				return sections;
			} catch (error) {
				logger.error(
					"Error loading protected files:",
					error instanceof Error ? error : undefined,
				);
				return [];
			}
		}

		// Section level: show files in that protection level
		if (element.contextValue?.startsWith("protectionLevel.")) {
			const canonicalLevel = element.contextValue.split(
				".",
			)[1] as ProtectionLevelCanonical;
			// Map canonical to legacy for filtering
			const levelMap: Record<ProtectionLevelCanonical, ProtectionLevel> = {
				block: "Protected",
				warn: "Warning",
				watch: "Watched",
			};
			const level = levelMap[canonicalLevel];
			try {
				const files = await this.protectedFiles.list();
				const validFiles = files.filter((file) => file?.label);

				// Filter files by protection level
				let levelFiles = validFiles.filter((f) => {
					if (level === "Watched") {
						// Watch includes files with no level set
						return f.protectionLevel === "Watched" || !f.protectionLevel;
					}
					return f.protectionLevel === level;
				});

				// Sort alphabetically by filename
				levelFiles = levelFiles.sort((a, b) => a.label.localeCompare(b.label));

				return levelFiles.map((entry) => createProtectedFileTreeItem(entry));
			} catch (error) {
				logger.error(
					"Error loading files for protection level:",
					error instanceof Error ? error : undefined,
				);
				return [];
			}
		}

		return [];
	}

	refresh(): void {
		this._onDidChangeTreeData.fire(undefined);
	}

	dispose(): void {
		this._onDidChangeTreeData.dispose();
		for (const disposable of this.disposables) {
			disposable.dispose();
		}
	}
}

/**
 * Create a section node for a protection level using canonical signage
 */
function createProtectionLevelSection(
	level: ProtectionLevelCanonical,
	count: number,
): vscode.TreeItem {
	const signage = PROTECTION_LEVEL_SIGNAGE[level];
	const item = new vscode.TreeItem(
		`${signage.emoji} ${signage.label}`,
		vscode.TreeItemCollapsibleState.Collapsed, // Default to collapsed
	);

	item.id = `protectionLevel.${level}`;
	item.contextValue = `protectionLevel.${level}`;
	item.description = `(${count})`;
	item.tooltip = `${signage.description} - ${count} file${count === 1 ? "" : "s"}`;

	return item;
}

/**
 * Tree item for protected file with integrated protection indicators
 *
 * Displays a protected file with:
 * - Filename only (no redundant level indicators when grouped)
 * - Workspace-relative path in description
 * - Colored shield icon
 * - Rich tooltip with protection metadata
 * - Click-to-open command
 */
export function createProtectedFileTreeItem(
	entry: ProtectedFileEntry,
): vscode.TreeItem {
	// Add defensive check to prevent crashes with invalid entries
	if (!entry || !entry.label) {
		logger.error("⚠️ Invalid entry in createProtectedFileTreeItem", undefined, {
			entry: JSON.stringify(entry),
		});
		return new vscode.TreeItem("Unknown File");
	}

	// Map legacy protection level to canonical for signage
	const levelMap: Record<ProtectionLevel, ProtectionLevelCanonical> = {
		Protected: "block",
		Warning: "warn",
		Watched: "watch",
	};
	const level = entry.protectionLevel || "Watched";
	const canonicalLevel = levelMap[level];
	const signage = PROTECTION_LEVEL_SIGNAGE[canonicalLevel];

	// Just show the filename - no need to repeat protection level since it's grouped
	const item = new vscode.TreeItem(
		entry.label,
		vscode.TreeItemCollapsibleState.None,
	);

	item.id = entry.id;
	item.contextValue = "snapback.item.protectedFile";
	// No iconPath set - using only the colored circle emoji in the label
	item.description = computeRelativePath(entry.path);
	item.tooltip = buildTooltip(entry, signage);
	item.command = {
		command: "snapback.openProtectedFile",
		title: "Open file",
		arguments: [vscode.Uri.file(entry.path)],
	};

	return item;
}

function computeRelativePath(filePath: string): string {
	const folders = vscode.workspace.workspaceFolders;
	if (!folders || folders.length === 0) {
		return "";
	}

	const workspacePath = folders[0].uri.fsPath;
	const relative = path.relative(workspacePath, filePath);

	const dir = path.dirname(relative);
	return dir === "." ? "" : dir;
}

function buildTooltip(
	entry: ProtectedFileEntry,
	signage: { label: string; description?: string; emoji?: string },
): vscode.MarkdownString {
	const tooltip = new vscode.MarkdownString();
	tooltip.supportHtml = false;
	tooltip.isTrusted = true;

	const lines = [
		`**${entry.label}**`,
		"",
		`${signage.emoji} **${signage.label}** protection`,
		signage.description || "",
		"",
		`${CORE_CONCEPT_SIGNAGE.protectedFiles.emoji} ${entry.path}`,
	];

	if (entry.lastProtectedAt) {
		const date = new Date(entry.lastProtectedAt).toLocaleString();
		lines.push("", `🕒 Last protected: ${date}`);
	}

	if (entry.lastSnapshotId) {
		lines.push(`📍 Latest snapshot: ${entry.lastSnapshotId}`);
	}

	tooltip.appendMarkdown(lines.join("\n"));
	return tooltip;
}
