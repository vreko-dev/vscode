import {
	type BrandSignage,
	type CoreConceptKey,
	type CoreConceptSignage,
	FILE_HEALTH_CANONICAL,
	type FileHealthCanonical,
	type FileHealthDecorationSignage,
	type LegacyProtectionLevelString,
	PROTECTION_LEVEL_CANONICAL,
	type ProtectionLevelCanonical,
	type ProtectionLevelSignage,
	REPO_STATUS_CANONICAL,
	type RepoStatusCanonical,
	type RepoStatusSignage,
} from "./types.js";

/**
 * Single source of truth for protection level signage.
 * If you change emoji/labels here, the whole UI updates.
 */
export const PROTECTION_LEVEL_SIGNAGE: Readonly<
	Record<ProtectionLevelCanonical, ProtectionLevelSignage>
> = {
	watch: {
		level: PROTECTION_LEVEL_CANONICAL.WATCH,
		label: "Watch",
		emoji: "🟢",
		codicon: "eye",
		color: "#10B981",
		themeColor: "charts.green",
		description: "Auto-snapshot on save with zero friction.",
		tooltip:
			"Watch: auto-snapshot on save. No prompts, minimal friction, ideal for low-risk files.",
	},
	warn: {
		level: PROTECTION_LEVEL_CANONICAL.WARN,
		label: "Warn",
		emoji: "🟡",
		codicon: "warning",
		color: "#FACC15", // yellow
		themeColor: "charts.yellow",
		description: "Notify before save; review changes and confirm.",
		tooltip:
			"Warn: confirm before save. Review the diff and choose when to create snapshots.",
	},
	block: {
		level: PROTECTION_LEVEL_CANONICAL.BLOCK,
		label: "Block",
		emoji: "🔴",
		codicon: "error",
		color: "#EF4444",
		themeColor: "charts.red",
		description: "Require snapshot or explicit override before saving.",
		tooltip:
			"Block: require a snapshot or explicit override for critical files before save.",
	},
} as const;

/**
 * Repo-level protection status signage.
 * This is about *coverage* over critical files, not individual file levels.
 */
export const REPO_STATUS_SIGNAGE: Readonly<
	Record<RepoStatusCanonical, RepoStatusSignage>
> = {
	unprotected: {
		status: REPO_STATUS_CANONICAL.UNPROTECTED,
		label: "Unprotected",
		emoji: "⭕",
		color: "#9CA3AF", // gray
		description: "No critical files are currently protected.",
		tooltip:
			"Unprotected: no critical files have protection levels applied in this workspace.",
	},
	partial: {
		status: REPO_STATUS_CANONICAL.PARTIAL,
		label: "Partial",
		emoji: "🟡",
		color: "#FACC15",
		description: "Some critical files are protected; others are not.",
		tooltip:
			"Partial: some critical files are protected, but there are gaps in coverage.",
	},
	protected: {
		status: REPO_STATUS_CANONICAL.PROTECTED,
		label: "Protected",
		emoji: "🟢",
		color: "#10B981",
		description: "All critical files are covered by protection levels.",
		tooltip:
			"Protected: all critical files have an active protection level applied.",
	},
	error: {
		status: REPO_STATUS_CANONICAL.ERROR,
		label: "Error",
		emoji: "⚠️",
		color: "#F97316",
		description: "Repo protection status could not be determined.",
		tooltip:
			"Error: SnapBack couldn't compute repo protection status. Check logs or try reloading.",
	},
} as const;

/**
 * File health decorations used for inline editor badges.
 * These visually describe the *current analysis state*, not the level.
 */
export const FILE_HEALTH_DECORATIONS: Readonly<
	Record<FileHealthCanonical, FileHealthDecorationSignage>
> = {
	protected: {
		state: FILE_HEALTH_CANONICAL.PROTECTED,
		label: "Protected",
		badge: "🛡️",
		codicon: "shield",
		themeColor: "charts.green",
		tooltip: "Protected by SnapBack.",
	},
	warning: {
		state: FILE_HEALTH_CANONICAL.WARNING,
		label: "Warning",
		badge: "⚠️",
		codicon: "warning",
		themeColor: "charts.yellow",
		tooltip: "Warning detected — review recommended.",
	},
	risk: {
		state: FILE_HEALTH_CANONICAL.RISK,
		label: "Risk",
		badge: "🚨",
		codicon: "error",
		themeColor: "charts.red",
		tooltip: "Risk detected — a snapshot was created for safety.",
	},
} as const;

/**
 * Brand signage for consistent status bar / titles.
 */
export const BRAND_SIGNAGE: BrandSignage = {
	logoEmoji: "🧢",
	shortLabel: "SnapBack",
	fullLabel: "SnapBack Protection",
} as const;

/**
 * Core concept signage (snapshot, session, etc.).
 */
export const CORE_CONCEPT_SIGNAGE: Readonly<
	Record<CoreConceptKey, CoreConceptSignage>
> = {
	snapshot: {
		key: "snapshot",
		label: "Snapshot",
		emoji: "📸",
		codicon: "history",
		tooltip: "Point-in-time capture of your files for instant restore.",
	},
	session: {
		key: "session",
		label: "Session",
		emoji: "🕐",
		codicon: "debug",
		tooltip:
			"Time-bounded collection of activity and snapshots (definition evolving).",
	},
	protectedFiles: {
		key: "protectedFiles",
		label: "Protected Files",
		emoji: "🛡️",
		codicon: "shield",
		tooltip: "Files currently under SnapBack protection.",
	},
	blockingIssues: {
		key: "blockingIssues",
		label: "Blocking Issues",
		emoji: "⚠️",
		codicon: "error",
		tooltip: "Critical issues that may block safe changes.",
	},
	watchItems: {
		key: "watchItems",
		label: "Watch Items",
		emoji: "📊",
		codicon: "graph",
		tooltip: "Non-blocking items SnapBack is monitoring.",
	},
} as const;

/**
 * Legacy → canonical mapping helpers
 * to support incremental migration.
 */
export function legacyProtectionLevelToCanonical(
	legacy: LegacyProtectionLevelString,
): ProtectionLevelCanonical {
	switch (legacy) {
		case "Watched":
			return PROTECTION_LEVEL_CANONICAL.WATCH;
		case "Warning":
			return PROTECTION_LEVEL_CANONICAL.WARN;
		case "Protected":
			return PROTECTION_LEVEL_CANONICAL.BLOCK;
		default: {
			// Exhaustiveness guard – if TS is happy, runtime should never get here.
			void (legacy as never);
			return PROTECTION_LEVEL_CANONICAL.WATCH;
		}
	}
}

export function canonicalProtectionLevelToLegacy(
	level: ProtectionLevelCanonical,
): LegacyProtectionLevelString {
	switch (level) {
		case PROTECTION_LEVEL_CANONICAL.WATCH:
			return "Watched";
		case PROTECTION_LEVEL_CANONICAL.WARN:
			return "Warning";
		case PROTECTION_LEVEL_CANONICAL.BLOCK:
			return "Protected";
		default: {
			// Exhaustiveness guard – if TS is happy, runtime should never get here.
			void (level as never);
			return "Watched";
		}
	}
}
