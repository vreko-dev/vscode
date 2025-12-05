/**
 * Theme-aware color tokens for SnapBack
 * Uses VS Code's built-in chart colors for consistency
 *
 * All colors use ThemeColor to automatically adapt to the user's theme
 * (light, dark, high contrast, etc.)
 */

import { ThemeColor } from "vscode";

export const SNAPBACK_COLORS = {
	// Protection levels
	watch: new ThemeColor("charts.blue"),
	warn: new ThemeColor("charts.yellow"),
	block: new ThemeColor("charts.red"),

	// Health status
	healthy: new ThemeColor("charts.green"),
	atRisk: new ThemeColor("charts.orange"),
	critical: new ThemeColor("charts.red"),

	// AI detection
	aiDetected: new ThemeColor("charts.purple"),

	// Operations
	success: new ThemeColor("charts.green"),
	inProgress: new ThemeColor("charts.blue"),
	error: new ThemeColor("charts.red"),

	// Neutral
	muted: new ThemeColor("descriptionForeground"),
} as const;

/**
 * Status bar colors (string format)
 * Use these for StatusBarItem.backgroundColor
 */
export const STATUS_BAR_COLORS = {
	normal: undefined, // Use default
	warning: "statusBarItem.warningBackground",
	error: "statusBarItem.errorBackground",
} as const;
