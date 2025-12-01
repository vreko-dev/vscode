/**
 * Canonical protection levels used in all *UI-facing* code.
 * Internal enums can differ, but anything shown to a user should map to these.
 */
export const PROTECTION_LEVEL_CANONICAL = {
	WATCH: "watch",
	WARN: "warn",
	BLOCK: "block",
} as const;

export type ProtectionLevelCanonical =
	(typeof PROTECTION_LEVEL_CANONICAL)[keyof typeof PROTECTION_LEVEL_CANONICAL];

/**
 * Canonical repo protection status for workspace-level health.
 */
export const REPO_STATUS_CANONICAL = {
	UNPROTECTED: "unprotected",
	PARTIAL: "partial",
	PROTECTED: "protected",
	ERROR: "error",
} as const;

export type RepoStatusCanonical =
	(typeof REPO_STATUS_CANONICAL)[keyof typeof REPO_STATUS_CANONICAL];

/**
 * Canonical file health states used by editor decorations.
 * These are *not* the same thing as protection levels.
 */
export const FILE_HEALTH_CANONICAL = {
	PROTECTED: "protected",
	WARNING: "warning",
	RISK: "risk",
} as const;

export type FileHealthCanonical =
	(typeof FILE_HEALTH_CANONICAL)[keyof typeof FILE_HEALTH_CANONICAL];

/**
 * Basic signage config shared across categories.
 */
export type SignageBase = Readonly<{
	label: string;
	emoji?: string;
	codicon?: string; // VS Code icon id, e.g. "eye", "warning", "error"
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
		badge?: string; // Used for gutter/inline badges
	}>;

export type BrandSignage = Readonly<{
	logoEmoji: string;
	shortLabel: string;
	fullLabel: string;
}>;

export type CoreConceptKey =
	| "snapshot"
	| "session"
	| "protectedFiles"
	| "blockingIssues"
	| "watchItems";

export type CoreConceptSignage = SignageBase &
	Readonly<{
		key: CoreConceptKey;
	}>;

/**
 * Legacy protection level strings currently used in the codebase.
 * This is for migration helpers only.
 */
export type LegacyProtectionLevelString = "Watched" | "Warning" | "Protected";
