/**
 * Canonical protection levels used in all *UI-facing* code.
 * Internal enums can differ, but anything shown to a user should map to these.
 */
export const PROTECTION_LEVEL_CANONICAL = {
	WATCH: "watch",
	WARN: "warn",
	BLOCK: "block",
} as const;

export type ProtectionLevelCanonical = (typeof PROTECTION_LEVEL_CANONICAL)[keyof typeof PROTECTION_LEVEL_CANONICAL];

/**
 * Canonical repo protection status for workspace-level health.
 */
export const REPO_STATUS_CANONICAL = {
	UNPROTECTED: "unprotected",
	PARTIAL: "partial",
	PROTECTED: "protected",
	ERROR: "error",
} as const;

export type RepoStatusCanonical = (typeof REPO_STATUS_CANONICAL)[keyof typeof REPO_STATUS_CANONICAL];

/**
 * Canonical file health states used by editor decorations.
 * These are *not* the same thing as protection levels.
 */
export const FILE_HEALTH_CANONICAL = {
	PROTECTED: "protected",
	WARNING: "warning",
	RISK: "risk",
} as const;

export type FileHealthCanonical = (typeof FILE_HEALTH_CANONICAL)[keyof typeof FILE_HEALTH_CANONICAL];

/**
 * Basic signage config shared across categories.
 */
export type SignageBase = Readonly<{
	label: string;
	icon?: string; // Emoji icon for cross-IDE compatibility (VS Code, Cursor, Windsurf)
	color?: string; // Hex color, e.g. "#10B981"
	themeColor?: string; // VS Code theme color id, e.g. "charts.green"
	description?: string;
	tooltip?: string;
}>;

export type ProtectionLevelSignage = SignageBase &
	Readonly<{
		level: ProtectionLevelCanonical;
	}>;

export type RepoStatusSignage = SignageBase &
	Readonly<{
		status: RepoStatusCanonical;
	}>;

export type FileHealthDecorationSignage = SignageBase &
	Readonly<{
		state: FileHealthCanonical;
	}>;

export type BrandSignage = Readonly<{
	logo: string; // Brand emoji (🧢)
	shortLabel: string;
	fullLabel: string;
}>;

export type CoreConceptKey = "snapshot" | "session" | "protectedFiles" | "blockingIssues" | "watchItems";

export type CoreConceptSignage = SignageBase &
	Readonly<{
		key: CoreConceptKey;
	}>;

/**
 * Legacy protection level strings currently used in the codebase.
 * This is for migration helpers only.
 */
export type LegacyProtectionLevelString = "Watched" | "Warning" | "Protected";

// =============================================================================
// WORKSPACE VITALS SIGNAGE TYPES
// =============================================================================

/**
 * Canonical session health levels for workspace vitals UI.
 * NOTE: 4-zone system: healthy > caution > warning > critical
 * - healthy (70-100): Low risk, stable
 * - caution (50-70): Moderate activity, monitor recommended
 * - warning (40-50): Elevated risk, snapshot recommended
 * - critical (0-40): High risk, immediate action needed
 */
export const SESSION_HEALTH_CANONICAL = {
	HEALTHY: "healthy",
	CAUTION: "caution",
	WARNING: "warning",
	CRITICAL: "critical",
} as const;

export type SessionHealthCanonical = (typeof SESSION_HEALTH_CANONICAL)[keyof typeof SESSION_HEALTH_CANONICAL];

/**
 * Canonical trajectory states for workspace vitals.
 */
export const TRAJECTORY_CANONICAL = {
	IMPROVING: "improving",
	STABLE: "stable",
	DEGRADING: "degrading",
	CRITICAL: "critical",
} as const;

export type TrajectoryCanonical = (typeof TRAJECTORY_CANONICAL)[keyof typeof TRAJECTORY_CANONICAL];

/**
 * Canonical pulse levels for code velocity.
 */
export const PULSE_LEVEL_CANONICAL = {
	RESTING: "resting",
	STEADY: "steady",
	ELEVATED: "elevated",
	RACING: "racing",
	CRITICAL: "critical",
} as const;

export type PulseLevelCanonical = (typeof PULSE_LEVEL_CANONICAL)[keyof typeof PULSE_LEVEL_CANONICAL];

/**
 * Canonical temperature levels for AI change density.
 */
export const TEMPERATURE_LEVEL_CANONICAL = {
	COOL: "cool",
	WARM: "warm",
	HOT: "hot",
	BURNING: "burning",
} as const;

export type TemperatureLevelCanonical = (typeof TEMPERATURE_LEVEL_CANONICAL)[keyof typeof TEMPERATURE_LEVEL_CANONICAL];

export type SessionHealthSignage = SignageBase &
	Readonly<{
		health: SessionHealthCanonical;
	}>;

export type TrajectorySignage = SignageBase &
	Readonly<{
		trajectory: TrajectoryCanonical;
		arrow: string;
	}>;

export type PulseLevelSignage = SignageBase &
	Readonly<{
		level: PulseLevelCanonical;
	}>;

export type TemperatureLevelSignage = SignageBase &
	Readonly<{
		level: TemperatureLevelCanonical;
	}>;

// =============================================================================
// NEW SIGNAGE TYPES (Branding Consolidation)
// =============================================================================

/**
 * Snapshot origin keys for tracking how snapshots were created.
 */
export type SnapshotOriginKey = "aiDetected" | "automated" | "interactive" | "preRestore";

export type SnapshotOriginSignage = SignageBase &
	Readonly<{
		key: SnapshotOriginKey;
	}>;

/**
 * Event type keys for activity tracking.
 */
export type EventTypeKey = "aiEdit" | "manualSnapshot" | "autoSnapshot" | "restore" | "configChange";

export type EventTypeSignage = SignageBase &
	Readonly<{
		key: EventTypeKey;
	}>;

/**
 * Status keys for general status indicators.
 */
export type StatusKey = "success" | "warning" | "error" | "info" | "sync" | "clock";

export type StatusSignage = SignageBase &
	Readonly<{
		key: StatusKey;
	}>;
