/**
 * Protection levels for files
 * - Watched: Silent auto-snapshot on save
 * - Warning: Show notification before save with snapshot option
 * - Protected: Require explicit snapshot or override to save
 */
export type ProtectionLevel = "Watched" | "Warning" | "Protected";

/**
 * UI metadata for protection levels
 */
export interface ProtectionLevelMetadata {
	level: ProtectionLevel;
	icon: string;
	label: string;
	description: string;
	color: string; // For status bar/decorations
	themeColor: string; // VS Code theme color
}

/**
 * Protection level configurations
 */
export const PROTECTION_LEVELS: Record<
	ProtectionLevel,
	ProtectionLevelMetadata
> = {
	Watched: {
		level: "Watched",
		icon: "🟢", // Green circle
		label: "Watch",
		description: "Silent auto-snapshot on save",
		color: "#10B981", // Emerald 500
		themeColor: "charts.green",
	},
	Warning: {
		level: "Warning",
		icon: "🟡", // Yellow circle
		label: "Warn",
		description: "Notify before save with options",
		color: "#FF6B35", // Safety orange
		themeColor: "charts.orange",
	},
	Protected: {
		level: "Protected",
		icon: "🔴", // Red circle
		label: "Block",
		description: "Require snapshot or explicit override",
		color: "#EF4444", // Red 500
		themeColor: "charts.red",
	},
};
