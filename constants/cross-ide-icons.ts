/**
 * Cross-IDE Icon System
 *
 * Provides consistent icon rendering across VS Code, other IDEs, and webviews.
 *
 * PROBLEM: The `$(iconName)` codicon syntax only works in VS Code tree labels.
 * In other contexts (webviews, Cursor, other IDEs), it renders as literal text.
 *
 * SOLUTION: Use iconPath with ThemeIcon for tree views, emoji fallback for webviews.
 *
 * @module
 */

import * as vscode from "vscode";

/**
 * Icon definition with both codicon name and emoji fallback
 */
export interface CrossIDEIcon {
	/** VS Code codicon name (without $()) */
	codicon: string;
	/** Emoji fallback for non-VS Code contexts */
	emoji: string;
	/** Optional color theme for the icon */
	color?: string;
}

/**
 * All icons used in the extension, mapped to both codicon and emoji
 *
 * Usage in tree views:
 * - Set `item.iconPath = getThemeIcon("warning")` instead of putting $(warning) in label
 * - Use plain text labels without any $(icon) syntax
 */
export const CROSS_IDE_ICONS = {
	// Status & Feedback
	info: { codicon: "info", emoji: "ℹ️" },
	warning: { codicon: "warning", emoji: "⚠️" },
	error: { codicon: "error", emoji: "❌" },
	check: { codicon: "check", emoji: "✅" },
	alert: { codicon: "alert", emoji: "🚨" },

	// Intelligence Section
	book: { codicon: "book", emoji: "📚" },
	bell: { codicon: "bell", emoji: "🔔" },
	graph: { codicon: "graph", emoji: "📊" },
	pulse: { codicon: "pulse", emoji: "💓" },
	clock: { codicon: "clock", emoji: "🕐" },

	// Learning Types
	symbolMethod: { codicon: "symbol-method", emoji: "🔄" },
	zap: { codicon: "zap", emoji: "⚡" },
	lightbulb: { codicon: "lightbulb", emoji: "💡" },
	gear: { codicon: "gear", emoji: "⚙️" },

	// Files & Actions
	file: { codicon: "file", emoji: "📄" },
	folder: { codicon: "folder", emoji: "📁" },
	fileCode: { codicon: "file-code", emoji: "📝" },
	history: { codicon: "history", emoji: "🕐" },
	discard: { codicon: "discard", emoji: "↩️" },
	save: { codicon: "save", emoji: "💾" },
	sync: { codicon: "sync", emoji: "🔄" },
	sparkle: { codicon: "sparkle", emoji: "✨" },

	// Protection & Safety
	shield: { codicon: "shield", emoji: "🛡️" },
	shieldCheck: { codicon: "shield-check", emoji: "✅" },
	shieldAlert: { codicon: "shield-alert", emoji: "⚠️" },
	shieldX: { codicon: "shield-x", emoji: "❌" },
	eye: { codicon: "eye", emoji: "👁️" },
	eyeClosed: { codicon: "eye-closed", emoji: "🙈" },
	lock: { codicon: "lock", emoji: "🔒" },

	// Navigation & UI
	chevronDown: { codicon: "chevron-down", emoji: "⬇️" },
	ellipsis: { codicon: "ellipsis", emoji: "..." },
	loading: { codicon: "loading~spin", emoji: "⏳" },
	refresh: { codicon: "refresh", emoji: "🔄" },
	listTree: { codicon: "list-tree", emoji: "📋" },
	linkExternal: { codicon: "link-external", emoji: "🔗" },

	// Status
	circleOutline: { codicon: "circle-outline", emoji: "⚪" },
	debugStart: { codicon: "debug-start", emoji: "▶️" },
	debugPause: { codicon: "debug-pause", emoji: "⏸️" },
	deviceCamera: { codicon: "device-camera", emoji: "📷" },
	robot: { codicon: "robot", emoji: "🤖" },
	tools: { codicon: "tools", emoji: "🔧" },
} as const;

export type CrossIDEIconName = keyof typeof CROSS_IDE_ICONS;

/**
 * Get a VS Code ThemeIcon for use in tree view iconPath
 *
 * @example
 * ```ts
 * // Instead of: new vscode.TreeItem("$(warning) Violations")
 * // Use:
 * const item = new vscode.TreeItem("Violations");
 * item.iconPath = getThemeIcon("warning");
 * ```
 */
export function getThemeIcon(iconName: CrossIDEIconName, color?: string): vscode.ThemeIcon {
	const icon = CROSS_IDE_ICONS[iconName];
	if (color) {
		return new vscode.ThemeIcon(icon.codicon, new vscode.ThemeColor(color));
	}
	return new vscode.ThemeIcon(icon.codicon);
}

/**
 * Get emoji fallback for non-VS Code contexts (webviews, other IDEs)
 */
export function getEmoji(iconName: CrossIDEIconName): string {
	return CROSS_IDE_ICONS[iconName].emoji;
}

/**
 * Get codicon name (without $() wrapper) for contexts that need raw name
 */
export function getCodiconName(iconName: CrossIDEIconName): string {
	return CROSS_IDE_ICONS[iconName].codicon;
}

/**
 * Extract codicon name from $(iconName) syntax
 *
 * @example
 * ```ts
 * extractCodiconName("$(warning)") // returns "warning"
 * extractCodiconName("warning") // returns "warning"
 * ```
 */
export function extractCodiconName(iconString: string): string {
	return iconString.replace(/^\$\(/, "").replace(/\)$/, "");
}

/**
 * Convert $(iconName) syntax to ThemeIcon
 *
 * @deprecated Use getThemeIcon with known icon names instead
 */
export function codiconToThemeIcon(iconString: string): vscode.ThemeIcon {
	const name = extractCodiconName(iconString);
	return new vscode.ThemeIcon(name);
}

/**
 * Color mappings for common semantic uses
 */
export const ICON_COLORS = {
	danger: "charts.red",
	warning: "charts.yellow",
	info: "charts.blue",
	success: "testing.iconPassed",
	error: "problemsErrorIcon.foreground",
	warningForeground: "problemsWarningIcon.foreground",
	infoForeground: "problemsInfoIcon.foreground",
} as const;

export type IconColor = keyof typeof ICON_COLORS;

/**
 * Get a colored ThemeIcon
 *
 * @example
 * ```ts
 * item.iconPath = getColoredIcon("warning", "danger"); // red warning icon
 * ```
 */
export function getColoredIcon(iconName: CrossIDEIconName, colorKey: IconColor): vscode.ThemeIcon {
	return getThemeIcon(iconName, ICON_COLORS[colorKey]);
}
