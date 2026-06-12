/**
 * Tree View Items
 *
 * Factory functions for creating tree items with consistent styling.
 * Follows VS Code 2026 UX guidelines and compound state pattern.
 *
 * Reference: docs/implementation/extension/treeview.md
 *
 * @packageDocumentation
 */

import * as vscode from "vscode";
import { getFileActivityBadge } from "../ux-types";
import { CONTEXT_VALUES, TREE_ICONS } from "./types";

// =============================================================================
// STATE ITEMS
// =============================================================================

/**
 * Create a loading state tree item
 *
 * Uses animated spinner icon per VS Code guidelines
 */
export function createLoadingItem(message = "Loading..."): vscode.TreeItem {
	const item = new vscode.TreeItem(message, vscode.TreeItemCollapsibleState.None);
	item.iconPath = new vscode.ThemeIcon(TREE_ICONS.loading);
	item.contextValue = CONTEXT_VALUES.loading;
	return item;
}

/**
 * Create an error state tree item with retry command
 *
 * Shows error icon and "Click to retry" in description
 */
export function createErrorItem(message: string, retryCommand?: string): vscode.TreeItem {
	const item = new vscode.TreeItem(message, vscode.TreeItemCollapsibleState.None);
	item.iconPath = new vscode.ThemeIcon(TREE_ICONS.error);
	item.contextValue = CONTEXT_VALUES.error;
	item.description = "Click to retry";

	if (retryCommand) {
		item.command = {
			command: retryCommand,
			title: "Retry",
		};
	}

	return item;
}

/**
 * Create an empty state tree item
 *
 * NOTE: For true empty states, use viewsWelcome in package.json.
 * This is for inline empty indicators within expandable sections.
 */
export function createEmptyItem(message: string): vscode.TreeItem {
	const item = new vscode.TreeItem(message, vscode.TreeItemCollapsibleState.None);
	item.iconPath = new vscode.ThemeIcon(TREE_ICONS.empty);
	item.contextValue = CONTEXT_VALUES.empty;
	return item;
}

/**
 * Create a "Load more" item for pagination
 */
export function createLoadMoreItem(loadCommand: string, remaining?: number): vscode.TreeItem {
	const label = remaining ? `Load ${remaining} more...` : "Load more...";
	const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
	item.iconPath = new vscode.ThemeIcon(TREE_ICONS.loadMore);
	item.contextValue = CONTEXT_VALUES.loadMore;
	item.command = {
		command: loadCommand,
		title: "Load More",
	};
	return item;
}

// =============================================================================
// GROUP ITEMS
// =============================================================================

/**
 * Create a date group header item
 *
 * Format: "Today (5)" with expanded state for Today, collapsed for others
 */
export function createDateGroupItem(
	group: string,
	count: number,
	options: { expanded?: boolean; contextValue?: string } = {},
): vscode.TreeItem {
	const item = new vscode.TreeItem(
		`${group} (${count})`,
		(options.expanded ?? group === "Today")
			? vscode.TreeItemCollapsibleState.Expanded
			: vscode.TreeItemCollapsibleState.Collapsed,
	);

	item.contextValue = options.contextValue ?? CONTEXT_VALUES.activityGroup;

	return item;
}

/**
 * Create a protection level group header
 *
 * Format: "🛑 BLOCK (2)" with appropriate icon color
 */
export function createProtectionGroupItem(level: "BLOCK" | "WARN" | "WATCH", count: number): vscode.TreeItem {
	const configs = {
		BLOCK: { icon: TREE_ICONS.block, color: "charts.red", badge: "🛑" },
		WARN: { icon: TREE_ICONS.warn, color: "charts.yellow", badge: "⚠️" },
		WATCH: { icon: TREE_ICONS.watch, color: "charts.blue", badge: "👁️" },
	};

	const config = configs[level];
	const item = new vscode.TreeItem(`${config.badge} ${level} (${count})`, vscode.TreeItemCollapsibleState.Expanded);

	item.iconPath = new vscode.ThemeIcon(config.icon, new vscode.ThemeColor(config.color));
	item.contextValue = CONTEXT_VALUES.protectionGroup;

	return item;
}

// =============================================================================
// ACTIVITY ITEMS
// =============================================================================

/**
 * Activity event type to icon mapping
 */
const EVENT_TYPE_ICONS: Record<string, string> = {
	"ai-edit": TREE_ICONS.aiEdit,
	"manual-snapshot": TREE_ICONS.manualSnapshot,
	"auto-snapshot": TREE_ICONS.autoSnapshot,
	restore: TREE_ICONS.restore,
	"config-change": TREE_ICONS.configChange,
};

/**
 * Activity event type to label mapping
 */
const EVENT_TYPE_LABELS: Record<string, string> = {
	"ai-edit": "AI Edit",
	"manual-snapshot": "Snapshot",
	"auto-snapshot": "Auto",
	restore: "Restored",
	"config-change": "Config updated",
};

/**
 * Create an activity event tree item
 *
 * Format: "$(sparkle) AI Edit  -  Button.tsx • 2h"
 *
 * GOTCHA: Use em dash ( - ) not hyphen (-) per spec
 */
export function createActivityEventItem(event: {
	id: string;
	type: string;
	timestamp: number;
	file?: string;
	fileCount?: number;
	source?: string;
	linesChanged?: number;
}): vscode.TreeItem {
	const icon = EVENT_TYPE_ICONS[event.type] ?? TREE_ICONS.file;
	const label = EVENT_TYPE_LABELS[event.type] ?? event.type;
	const target = event.file ? truncateFileName(event.file) : `${event.fileCount} files`;
	const time = formatCompactTime(event.timestamp);

	const item = new vscode.TreeItem(`${label}  -  ${target} • ${time}`, vscode.TreeItemCollapsibleState.None);

	item.iconPath = new vscode.ThemeIcon(icon);
	item.contextValue = event.type === "ai-edit" ? CONTEXT_VALUES.activityEventAI : CONTEXT_VALUES.activityEvent;

	// Rich tooltip with source info (not in label per spec)
	item.tooltip = createActivityTooltip(event);

	return item;
}

/**
 * Create tooltip for activity event
 */
function createActivityTooltip(event: {
	type: string;
	timestamp: number;
	file?: string;
	fileCount?: number;
	source?: string;
	linesChanged?: number;
}): vscode.MarkdownString {
	const md = new vscode.MarkdownString();
	md.isTrusted = true;

	const label = EVENT_TYPE_LABELS[event.type] ?? event.type;
	md.appendMarkdown(`**${label}**\n\n`);

	if (event.file) {
		md.appendMarkdown(`File: \`${event.file}\`\n`);
	}
	if (event.fileCount && event.fileCount > 1) {
		md.appendMarkdown(`Files: ${event.fileCount}\n`);
	}
	if (event.source) {
		md.appendMarkdown(`Source: ${event.source}\n`);
	}
	if (event.linesChanged) {
		md.appendMarkdown(`Lines changed: ${event.linesChanged}\n`);
	}

	const date = new Date(event.timestamp);
	md.appendMarkdown(`\nTime: ${date.toLocaleString()}`);

	return md;
}

// =============================================================================
// PROTECTED FILE ITEMS
// =============================================================================

/**
 * Create a protected file tree item
 *
 * Per spec: Show HOT/WARM badges only for files modified within last 30 minutes
 */
export function createProtectedFileItem(file: {
	path: string;
	absolutePath: string;
	level: "BLOCK" | "WARN" | "WATCH";
	isInherited: boolean;
	anchorFile?: string;
	snapshotCount: number;
	lastModified?: number;
}): vscode.TreeItem {
	const filename = file.path.split(/[/\\]/).pop() ?? file.path;

	// Get activity badge for recently modified files
	const badge = file.lastModified ? getFileActivityBadge(file.lastModified) : undefined;

	const item = new vscode.TreeItem(filename, vscode.TreeItemCollapsibleState.None);

	// CRITICAL: resourceUri must be set for ThemeIcon.File to render properly
	// This enables VS Code's file icon theme to show the correct icon
	item.resourceUri = vscode.Uri.file(file.absolutePath);

	// Description: show badge first, then inherited info
	const descriptionParts: string[] = [];
	if (badge) {
		descriptionParts.push(badge); // "HOT" or "WARM"
	}
	if (file.isInherited && file.anchorFile) {
		const anchorName = file.anchorFile.split(/[/\\]/).pop();
		descriptionParts.push(`(from ${anchorName})`);
	}
	if (descriptionParts.length > 0) {
		item.description = descriptionParts.join(" ");
	}

	// Icon with color based on protection level
	const colors = {
		BLOCK: "charts.red",
		WARN: "charts.yellow",
		WATCH: "charts.blue",
	};
	item.iconPath = new vscode.ThemeIcon(TREE_ICONS.file, new vscode.ThemeColor(colors[file.level]));

	// Context value includes level for menu filtering
	const contextValues = {
		BLOCK: CONTEXT_VALUES.protectedFileBlock,
		WARN: CONTEXT_VALUES.protectedFileWarn,
		WATCH: CONTEXT_VALUES.protectedFileWatch,
	};
	item.contextValue = contextValues[file.level];

	// Command to open file
	item.command = {
		command: "vscode.open",
		title: "Open File",
		arguments: [vscode.Uri.file(file.absolutePath)],
	};

	// Rich tooltip
	item.tooltip = createProtectedFileTooltip(file);

	return item;
}

/**
 * Create tooltip for protected file
 */
function createProtectedFileTooltip(file: {
	path: string;
	level: "BLOCK" | "WARN" | "WATCH";
	isInherited: boolean;
	anchorFile?: string;
	snapshotCount: number;
}): vscode.MarkdownString {
	const md = new vscode.MarkdownString();
	md.isTrusted = true;

	md.appendMarkdown(`**${file.level}** protection\n\n`);
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
// SESSION/HISTORY ITEMS
// =============================================================================

/**
 * Create a session tree item
 *
 * Format: "5:52 AM • 1 file • 53s • ↩️"
 */
export function createSessionItem(session: {
	id: string;
	timestamp: number;
	duration: number;
	fileCount: number;
	canRestore: boolean;
	aiTool?: string;
}): vscode.TreeItem {
	const time = formatSessionTime(session.timestamp);
	const files = `${session.fileCount} file${session.fileCount !== 1 ? "s" : ""}`;
	const duration = formatDuration(session.duration);
	const undoable = session.canRestore ? " • ↩️" : "";

	const item = new vscode.TreeItem(
		`${time} • ${files} • ${duration}${undoable}`,
		vscode.TreeItemCollapsibleState.Collapsed,
	);

	// Different context for restorable vs non-restorable
	item.contextValue = session.canRestore ? CONTEXT_VALUES.sessionRestorable : CONTEXT_VALUES.session;

	// Icon based on AI detection
	item.iconPath = new vscode.ThemeIcon(session.aiTool ? TREE_ICONS.aiEdit : "history");

	item.tooltip = createSessionTooltip(session);

	return item;
}

/**
 * Create a session file tree item
 */
export function createSessionFileItem(file: {
	path: string;
	snapshotId: string;
	linesAdded: number;
	linesRemoved: number;
}): vscode.TreeItem {
	const filename = file.path.split(/[/\\]/).pop() ?? file.path;
	const changes = `(+${file.linesAdded}, -${file.linesRemoved})`;

	const item = new vscode.TreeItem(`${filename} ${changes}`, vscode.TreeItemCollapsibleState.None);

	// CRITICAL: resourceUri must be set for ThemeIcon.File to render properly
	// This enables VS Code's file icon theme to show the correct icon
	item.resourceUri = vscode.Uri.file(file.path);
	item.iconPath = new vscode.ThemeIcon(TREE_ICONS.file);
	item.contextValue = CONTEXT_VALUES.sessionFile;
	item.tooltip = `Full path: ${file.path}`;

	// Command to show diff
	item.command = {
		command: "vreko.snapshot.showFileDiff",
		title: "Compare with Current",
		arguments: [file.snapshotId, file.path],
	};

	return item;
}

/**
 * Create tooltip for session
 */
function createSessionTooltip(session: {
	timestamp: number;
	duration: number;
	fileCount: number;
	canRestore: boolean;
	aiTool?: string;
}): vscode.MarkdownString {
	const md = new vscode.MarkdownString();
	md.isTrusted = true;

	const date = new Date(session.timestamp);
	md.appendMarkdown(`**Session** - ${date.toLocaleString()}\n\n`);
	md.appendMarkdown(`Files: ${session.fileCount}\n`);
	md.appendMarkdown(`Duration: ${formatDuration(session.duration)}\n`);

	if (session.aiTool) {
		md.appendMarkdown(`AI Tool: ${session.aiTool}\n`);
	}

	if (session.canRestore) {
		md.appendMarkdown("\n*Click to expand, right-click to restore*");
	}

	return md;
}

// =============================================================================
// FORMATTING HELPERS
// =============================================================================

/**
 * Format timestamp as compact relative time
 *
 * Format: "2h", "5m", "3d"
 *
 * GOTCHA: Keep format stable to avoid tree item jumping
 */
function formatCompactTime(timestamp: number): string {
	const now = Date.now();
	const diff = now - timestamp;

	const minutes = Math.floor(diff / 60000);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);

	if (days > 0) {
		return `${days}d`;
	}
	if (hours > 0) {
		return `${hours}h`;
	}
	if (minutes > 0) {
		return `${minutes}m`;
	}
	return "now";
}

/**
 * Format timestamp for session time display
 *
 * Format: "5:52 AM"
 */
function formatSessionTime(timestamp: number): string {
	const date = new Date(timestamp);
	return date.toLocaleTimeString("en-US", {
		hour: "numeric",
		minute: "2-digit",
		hour12: true,
	});
}

/**
 * Format duration in seconds to human-readable
 *
 * Examples: "53s", "2m 30s", "1h 5m"
 */
function formatDuration(seconds: number): string {
	if (seconds < 60) {
		return `${seconds}s`;
	}

	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = seconds % 60;

	if (minutes < 60) {
		return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
	}

	const hours = Math.floor(minutes / 60);
	const remainingMinutes = minutes % 60;

	return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

/**
 * Truncate file path to just the filename
 */
function truncateFileName(path: string): string {
	const parts = path.split(/[/\\]/);
	return parts[parts.length - 1];
}

// =============================================================================
// HEALTH ITEMS (SB-HEALTH-001)
// =============================================================================

/**
 * Guard status display configuration
 */
const GUARD_STATUS_CONFIG = {
	pass: {
		icon: TREE_ICONS.healthPass,
		color: "charts.green",
		badge: "✅",
		label: "PASS",
	},
	warn: {
		icon: TREE_ICONS.healthWarn,
		color: "charts.yellow",
		badge: "⚠️",
		label: "WARN",
	},
	fail: {
		icon: TREE_ICONS.healthFail,
		color: "charts.red",
		badge: "❌",
		label: "FAIL",
	},
} as const;

/**
 * Create a health section header tree item
 *
 * Format: "$(heart) Health" with collapsible state
 */
export function createHealthHeaderItem(options: {
	passCount: number;
	warnCount: number;
	failCount: number;
	refreshing: boolean;
	staleMs: number;
}): vscode.TreeItem {
	const { passCount, warnCount, failCount, refreshing, staleMs } = options;
	const total = passCount + warnCount + failCount;

	// Determine overall health icon
	let overallIcon: string = TREE_ICONS.healthPass;
	let overallColor = "charts.green";
	if (failCount > 0) {
		overallIcon = TREE_ICONS.healthFail;
		overallColor = "charts.red";
	} else if (warnCount > 0) {
		overallIcon = TREE_ICONS.healthWarn;
		overallColor = "charts.yellow";
	}

	// Use refreshing spinner if background refresh in progress
	if (refreshing) {
		overallIcon = TREE_ICONS.healthRefreshing;
	}

	const item = new vscode.TreeItem("Health", vscode.TreeItemCollapsibleState.Expanded);
	item.iconPath = new vscode.ThemeIcon(overallIcon, new vscode.ThemeColor(overallColor));
	item.contextValue = CONTEXT_VALUES.healthHeader;

	// Description shows summary
	const summaryParts: string[] = [];
	if (failCount > 0) {
		summaryParts.push(`${failCount} fail`);
	}
	if (warnCount > 0) {
		summaryParts.push(`${warnCount} warn`);
	}
	if (passCount > 0 && failCount === 0 && warnCount === 0) {
		summaryParts.push("all passing");
	}
	item.description = summaryParts.join(", ");

	// Rich tooltip
	item.tooltip = createHealthHeaderTooltip({ passCount, warnCount, failCount, refreshing, staleMs, total });

	return item;
}

/**
 * Create tooltip for health header
 */
function createHealthHeaderTooltip(options: {
	passCount: number;
	warnCount: number;
	failCount: number;
	refreshing: boolean;
	staleMs: number;
	total: number;
}): vscode.MarkdownString {
	const { passCount, warnCount, failCount, refreshing, staleMs, total } = options;
	const md = new vscode.MarkdownString();
	md.isTrusted = true;

	md.appendMarkdown("**Workspace Health**\n\n");
	md.appendMarkdown(`Guards checked: ${total}\n\n`);

	if (passCount > 0) {
		md.appendMarkdown(`✅ Pass: ${passCount}\n`);
	}
	if (warnCount > 0) {
		md.appendMarkdown(`⚠️ Warn: ${warnCount}\n`);
	}
	if (failCount > 0) {
		md.appendMarkdown(`❌ Fail: ${failCount}\n`);
	}

	md.appendMarkdown("\n");

	if (refreshing) {
		md.appendMarkdown("*Refreshing...*\n");
	} else if (staleMs > 0) {
		const staleMin = Math.floor(staleMs / 60000);
		if (staleMin > 0) {
			md.appendMarkdown(`*Last checked: ${staleMin}m ago*\n`);
		} else {
			md.appendMarkdown("*Checked now*\n");
		}
	}

	md.appendMarkdown("\n*Click to refresh*");

	return md;
}

/**
 * Create a guard result tree item
 *
 * Format: "✅ console-logs  -  245ms" or "❌ type-drift  -  3 files"
 */
export function createGuardItem(guard: {
	guard: string;
	status: "pass" | "warn" | "fail";
	files: Array<{ path: string; line?: number; message: string }>;
	durationMs: number;
}): vscode.TreeItem {
	const config = GUARD_STATUS_CONFIG[guard.status];
	const hasFiles = guard.files.length > 0;

	// Label format: "guard-name"
	// Description: duration or file count
	const description =
		hasFiles && guard.status !== "pass"
			? `${guard.files.length} file${guard.files.length > 1 ? "s" : ""}`
			: `${guard.durationMs}ms`;

	const item = new vscode.TreeItem(
		guard.guard,
		hasFiles && guard.status !== "pass"
			? vscode.TreeItemCollapsibleState.Collapsed
			: vscode.TreeItemCollapsibleState.None,
	);

	item.iconPath = new vscode.ThemeIcon(config.icon, new vscode.ThemeColor(config.color));
	item.description = description;

	// Context value includes status for menu filtering
	const contextValues = {
		pass: CONTEXT_VALUES.healthGuardPass,
		warn: CONTEXT_VALUES.healthGuardWarn,
		fail: CONTEXT_VALUES.healthGuardFail,
	};
	item.contextValue = contextValues[guard.status];

	// Rich tooltip
	item.tooltip = createGuardTooltip(guard);

	return item;
}

/**
 * Create tooltip for guard result
 */
function createGuardTooltip(guard: {
	guard: string;
	status: "pass" | "warn" | "fail";
	files: Array<{ path: string; line?: number; message: string }>;
	durationMs: number;
}): vscode.MarkdownString {
	const md = new vscode.MarkdownString();
	md.isTrusted = true;

	const config = GUARD_STATUS_CONFIG[guard.status];
	md.appendMarkdown(`**${guard.guard}**  -  ${config.badge} ${config.label}\n\n`);
	md.appendMarkdown(`Duration: ${guard.durationMs}ms\n`);

	if (guard.files.length > 0) {
		md.appendMarkdown(`\nFiles with issues (${guard.files.length}):\n`);
		// Show first 5 files
		const displayFiles = guard.files.slice(0, 5);
		for (const file of displayFiles) {
			const lineInfo = file.line ? `:${file.line}` : "";
			md.appendMarkdown(`- \`${file.path}${lineInfo}\`: ${file.message}\n`);
		}
		if (guard.files.length > 5) {
			md.appendMarkdown(`- *...and ${guard.files.length - 5} more*\n`);
		}
	}

	return md;
}

/**
 * Create a guard file issue tree item
 *
 * Format: "Button.tsx:42" with message in description
 */
export function createGuardFileItem(file: { path: string; line?: number; message: string }): vscode.TreeItem {
	const filename = truncateFileName(file.path);
	const label = file.line ? `${filename}:${file.line}` : filename;

	const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
	item.iconPath = new vscode.ThemeIcon(TREE_ICONS.file);
	item.contextValue = CONTEXT_VALUES.healthFile;
	item.description = file.message;
	item.tooltip = `${file.path}${file.line ? `:${file.line}` : ""}\n\n${file.message}`;

	// Command to open file at line
	item.command = {
		command: "vscode.open",
		title: "Open File",
		arguments: [
			vscode.Uri.file(file.path),
			file.line ? { selection: new vscode.Range(file.line - 1, 0, file.line - 1, 0) } : undefined,
		],
	};

	return item;
}
