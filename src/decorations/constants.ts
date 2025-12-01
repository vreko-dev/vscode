/**
 * File Health Decoration Constants
 *
 * This module defines constants for the file health decoration system,
 * including badge icons, colors, and tooltips for each health level.
 */

import * as vscode from "vscode";
import { FILE_HEALTH_DECORATIONS } from "../signage/index.js";
import type { FileHealthLevel } from "./types.js";

/**
 * Decoration configuration for a specific health level.
 */
export interface DecorationConfig {
	/** Unicode emoji badge to display (e.g., 🛡, ⚠️, 🚨) */
	badge: string;

	/** Theme-aware color for the decoration */
	color: vscode.ThemeColor;

	/** Tooltip text shown on hover */
	tooltip: string;
}

/**
 * Complete decoration configuration for all file health levels.
 *
 * Now sourced from the canonical signage module for consistency.
 * Each level has:
 * - `badge`: Visual indicator (emoji)
 * - `color`: Theme-aware color
 * - `tooltip`: User-friendly description
 *
 * @example
 * ```typescript
 * const config = DECORATION_CONFIG['protected'];
 * // { badge: '🛡', color: ThemeColor('charts.green'), tooltip: '...' }
 * ```
 */
export const DECORATION_CONFIG: Record<FileHealthLevel, DecorationConfig> = {
	protected: {
		badge: FILE_HEALTH_DECORATIONS.protected.badge || "🛡️",
		color: new vscode.ThemeColor(
			FILE_HEALTH_DECORATIONS.protected.themeColor || "charts.green",
		),
		tooltip:
			FILE_HEALTH_DECORATIONS.protected.tooltip || "Protected by SnapBack",
	},
	warning: {
		badge: FILE_HEALTH_DECORATIONS.warning.badge || "⚠️",
		color: new vscode.ThemeColor(
			FILE_HEALTH_DECORATIONS.warning.themeColor || "charts.yellow",
		),
		tooltip:
			FILE_HEALTH_DECORATIONS.warning.tooltip ||
			"Warning detected — review recommended.",
	},
	risk: {
		badge: FILE_HEALTH_DECORATIONS.risk.badge || "🚨",
		color: new vscode.ThemeColor(
			FILE_HEALTH_DECORATIONS.risk.themeColor || "charts.red",
		),
		tooltip:
			FILE_HEALTH_DECORATIONS.risk.tooltip ||
			"Risk detected — a snapshot was created for safety.",
	},
} as const;
