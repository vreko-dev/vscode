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
	PULSE_LEVEL_CANONICAL,
	type PulseLevelCanonical,
	type PulseLevelSignage,
	REPO_STATUS_CANONICAL,
	type RepoStatusCanonical,
	type RepoStatusSignage,
	SESSION_HEALTH_CANONICAL,
	type SessionHealthCanonical,
	type SessionHealthSignage,
	TEMPERATURE_LEVEL_CANONICAL,
	type TemperatureLevelCanonical,
	type TemperatureLevelSignage,
	TRAJECTORY_CANONICAL,
	type TrajectoryCanonical,
	type TrajectorySignage,
} from "./types";

/**
 * Single source of truth for protection level signage.
 * If you change emoji/labels here, the whole UI updates.
 */
export const PROTECTION_LEVEL_SIGNAGE: Readonly<Record<ProtectionLevelCanonical, ProtectionLevelSignage>> = {
	watch: {
		level: PROTECTION_LEVEL_CANONICAL.WATCH,
		label: "Watch",
		emoji: "🟢",
		codicon: "eye",
		color: "#10B981",
		themeColor: "charts.green",
		description: "Auto-snapshot on save with zero friction.",
		tooltip: "Watch: auto-snapshot on save. No prompts, minimal friction, ideal for low-risk files.",
	},
	warn: {
		level: PROTECTION_LEVEL_CANONICAL.WARN,
		label: "Warn",
		emoji: "🟡",
		codicon: "warning",
		color: "#FACC15", // yellow
		themeColor: "charts.yellow",
		description: "Notify before save; review changes and confirm.",
		tooltip: "Warn: confirm before save. Review the diff and choose when to create snapshots.",
	},
	block: {
		level: PROTECTION_LEVEL_CANONICAL.BLOCK,
		label: "Block",
		emoji: "🔴",
		codicon: "error",
		color: "#EF4444",
		themeColor: "charts.red",
		description: "Require snapshot or explicit override before saving.",
		tooltip: "Block: require a snapshot or explicit override for critical files before save.",
	},
} as const;

/**
 * Repo-level protection status signage.
 * This is about *coverage* over critical files, not individual file levels.
 */
export const REPO_STATUS_SIGNAGE: Readonly<Record<RepoStatusCanonical, RepoStatusSignage>> = {
	unprotected: {
		status: REPO_STATUS_CANONICAL.UNPROTECTED,
		label: "Unprotected",
		emoji: "⭕",
		color: "#9CA3AF", // gray
		description: "No critical files are currently protected.",
		tooltip: "Unprotected: no critical files have protection levels applied in this workspace.",
	},
	partial: {
		status: REPO_STATUS_CANONICAL.PARTIAL,
		label: "Partial",
		emoji: "🟡",
		color: "#FACC15",
		description: "Some critical files are protected; others are not.",
		tooltip: "Partial: some critical files are protected, but there are gaps in coverage.",
	},
	protected: {
		status: REPO_STATUS_CANONICAL.PROTECTED,
		label: "Protected",
		emoji: "🟢",
		color: "#10B981",
		description: "All critical files are covered by protection levels.",
		tooltip: "Protected: all critical files have an active protection level applied.",
	},
	error: {
		status: REPO_STATUS_CANONICAL.ERROR,
		label: "Error",
		emoji: "⚠️",
		color: "#F97316",
		description: "Repo protection status could not be determined.",
		tooltip: "Error: SnapBack couldn't compute repo protection status. Check logs or try reloading.",
	},
} as const;

/**
 * File health decorations used for inline editor badges.
 * These visually describe the *current analysis state*, not the level.
 */
export const FILE_HEALTH_DECORATIONS: Readonly<Record<FileHealthCanonical, FileHealthDecorationSignage>> = {
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
export const CORE_CONCEPT_SIGNAGE: Readonly<Record<CoreConceptKey, CoreConceptSignage>> = {
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
		tooltip: "Time-bounded collection of activity and snapshots (definition evolving).",
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

// =============================================================================
// WORKSPACE VITALS SIGNAGE
// =============================================================================

/**
 * Session health signage for overall workspace health display.
 */
export const SESSION_HEALTH_SIGNAGE: Readonly<Record<SessionHealthCanonical, SessionHealthSignage>> = {
	healthy: {
		health: SESSION_HEALTH_CANONICAL.HEALTHY,
		label: "Healthy",
		emoji: "💚",
		codicon: "heart",
		color: "#10B981",
		themeColor: "charts.green",
		description: "Session is in excellent health with low risk.",
		tooltip: "Healthy: workspace vitals are stable and within safe thresholds.",
	},
	warning: {
		health: SESSION_HEALTH_CANONICAL.WARNING,
		label: "Warning",
		emoji: "💛",
		codicon: "warning",
		color: "#FACC15",
		themeColor: "charts.yellow",
		description: "Session health is degraded; consider a snapshot.",
		tooltip: "Warning: elevated activity detected. A snapshot is recommended soon.",
	},
	critical: {
		health: SESSION_HEALTH_CANONICAL.CRITICAL,
		label: "Critical",
		emoji: "❤️‍🔥",
		codicon: "error",
		color: "#EF4444",
		themeColor: "charts.red",
		description: "Session health is critical; snapshot strongly recommended.",
		tooltip: "Critical: high-risk activity detected. Create a snapshot immediately.",
	},
} as const;

/**
 * Trajectory signage for trend indicators.
 */
export const TRAJECTORY_SIGNAGE: Readonly<Record<TrajectoryCanonical, TrajectorySignage>> = {
	improving: {
		trajectory: TRAJECTORY_CANONICAL.IMPROVING,
		label: "Improving",
		emoji: "📈",
		arrow: "↗",
		codicon: "arrow-up",
		color: "#10B981",
		themeColor: "charts.green",
		description: "Risk is decreasing; session stabilizing.",
		tooltip: "Improving: recent changes are reducing overall risk.",
	},
	stable: {
		trajectory: TRAJECTORY_CANONICAL.STABLE,
		label: "Stable",
		emoji: "➡️",
		arrow: "→",
		codicon: "dash",
		color: "#6B7280",
		themeColor: "charts.gray",
		description: "Risk is holding steady.",
		tooltip: "Stable: workspace risk level is unchanged.",
	},
	degrading: {
		trajectory: TRAJECTORY_CANONICAL.DEGRADING,
		label: "Degrading",
		emoji: "📉",
		arrow: "↘",
		codicon: "arrow-down",
		color: "#F59E0B",
		themeColor: "charts.orange",
		description: "Risk is increasing; monitor closely.",
		tooltip: "Degrading: recent changes are increasing risk. Consider a snapshot.",
	},
	critical: {
		trajectory: TRAJECTORY_CANONICAL.CRITICAL,
		label: "Critical",
		emoji: "🚨",
		arrow: "↓↓",
		codicon: "error",
		color: "#EF4444",
		themeColor: "charts.red",
		description: "Risk trajectory is critical; immediate action needed.",
		tooltip: "Critical trajectory: rapid risk increase detected. Snapshot now.",
	},
} as const;

/**
 * Pulse level signage for code velocity display.
 */
export const PULSE_LEVEL_SIGNAGE: Readonly<Record<PulseLevelCanonical, PulseLevelSignage>> = {
	resting: {
		level: PULSE_LEVEL_CANONICAL.RESTING,
		label: "Resting",
		emoji: "💤",
		codicon: "debug-pause",
		color: "#6B7280",
		themeColor: "charts.gray",
		description: "Minimal activity detected.",
		tooltip: "Resting: very low code velocity. Workspace is idle.",
	},
	steady: {
		level: PULSE_LEVEL_CANONICAL.STEADY,
		label: "Steady",
		emoji: "💓",
		codicon: "pulse",
		color: "#10B981",
		themeColor: "charts.green",
		description: "Normal, healthy coding pace.",
		tooltip: "Steady: consistent, sustainable code velocity.",
	},
	elevated: {
		level: PULSE_LEVEL_CANONICAL.ELEVATED,
		label: "Elevated",
		emoji: "💗",
		codicon: "pulse",
		color: "#FACC15",
		themeColor: "charts.yellow",
		description: "Higher than normal activity.",
		tooltip: "Elevated: above-average code velocity. Snapshots recommended.",
	},
	racing: {
		level: PULSE_LEVEL_CANONICAL.RACING,
		label: "Racing",
		emoji: "💖",
		codicon: "zap",
		color: "#F59E0B",
		themeColor: "charts.orange",
		description: "Very high activity; potential AI-assisted burst.",
		tooltip: "Racing: high code velocity detected. Consider frequent snapshots.",
	},
	critical: {
		level: PULSE_LEVEL_CANONICAL.CRITICAL,
		label: "Critical",
		emoji: "💥",
		codicon: "flame",
		color: "#EF4444",
		themeColor: "charts.red",
		description: "Extremely high velocity; snapshot urgently recommended.",
		tooltip: "Critical pulse: extreme code velocity. Snapshot immediately.",
	},
} as const;

/**
 * Temperature level signage for AI change density display.
 */
export const TEMPERATURE_LEVEL_SIGNAGE: Readonly<Record<TemperatureLevelCanonical, TemperatureLevelSignage>> = {
	cool: {
		level: TEMPERATURE_LEVEL_CANONICAL.COOL,
		label: "Cool",
		emoji: "🧊",
		codicon: "symbol-constant",
		color: "#3B82F6",
		themeColor: "charts.blue",
		description: "Low AI change density; stable codebase.",
		tooltip: "Cool: minimal AI-generated changes. Codebase is stable.",
	},
	warm: {
		level: TEMPERATURE_LEVEL_CANONICAL.WARM,
		label: "Warm",
		emoji: "🌡️",
		codicon: "symbol-event",
		color: "#10B981",
		themeColor: "charts.green",
		description: "Moderate AI activity; normal operation.",
		tooltip: "Warm: moderate AI change density. Normal operating temperature.",
	},
	hot: {
		level: TEMPERATURE_LEVEL_CANONICAL.HOT,
		label: "Hot",
		emoji: "🔥",
		codicon: "flame",
		color: "#F59E0B",
		themeColor: "charts.orange",
		description: "High AI change density; increased risk.",
		tooltip: "Hot: high AI change density. Monitor carefully and snapshot often.",
	},
	burning: {
		level: TEMPERATURE_LEVEL_CANONICAL.BURNING,
		label: "Burning",
		emoji: "🌋",
		codicon: "warning",
		color: "#EF4444",
		themeColor: "charts.red",
		description: "Extreme AI change density; critical risk level.",
		tooltip: "Burning: extreme AI change density. Snapshot immediately.",
	},
} as const;

/**
 * Legacy → canonical mapping helpers
 * to support incremental migration.
 */
export function legacyProtectionLevelToCanonical(legacy: LegacyProtectionLevelString): ProtectionLevelCanonical {
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

export function canonicalProtectionLevelToLegacy(level: ProtectionLevelCanonical): LegacyProtectionLevelString {
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
