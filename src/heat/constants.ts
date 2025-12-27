/**
 * Heat Decoration Constants
 *
 * Badge icons, colors, and tooltips for each heat level.
 * Uses text fallbacks for accessibility.
 */

import * as vscode from "vscode";
import type { HeatLevel } from "./types";

/**
 * Decoration configuration for a heat level.
 */
export interface HeatDecorationConfig {
	/** Badge text (emoji or short text) */
	badge: string;

	/** Text fallback for accessibility */
	textBadge: string;

	/** Theme-aware color */
	color: vscode.ThemeColor;

	/** Tooltip description */
	tooltip: string;

	/** Whether to propagate to parent folders */
	propagate: boolean;
}

/**
 * AI involvement badge prefix.
 */
export const AI_BADGE = "AI";
export const AI_BADGE_EMOJI = "\u2699\uFE0F"; // ⚙️

/**
 * Heat decoration configuration for each level.
 */
export const HEAT_DECORATION_CONFIG: Record<Exclude<HeatLevel, "none">, HeatDecorationConfig> = {
	warm: {
		badge: "\u2022", // •
		textBadge: "W",
		color: new vscode.ThemeColor("charts.yellow"),
		tooltip: "Elevated activity detected",
		propagate: false,
	},
	hot: {
		badge: "\uD83D\uDD25", // 🔥
		textBadge: "!",
		color: new vscode.ThemeColor("charts.orange"),
		tooltip: "High churn detected",
		propagate: false,
	},
	critical: {
		badge: "\uD83D\uDD25", // 🔥
		textBadge: "!!",
		color: new vscode.ThemeColor("charts.red"),
		tooltip: "Critical activity - consider creating a checkpoint",
		propagate: true, // Propagate critical to parent folders
	},
};

/**
 * Get decoration config for a heat level.
 * Returns undefined for 'none' level.
 */
export function getHeatDecorationConfig(level: HeatLevel): HeatDecorationConfig | undefined {
	if (level === "none") {
		return undefined;
	}
	return HEAT_DECORATION_CONFIG[level];
}
