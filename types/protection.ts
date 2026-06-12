/**
 * Protection Level Types - Local implementation for thin client
 *
 * Canonical format: "watch" | "warn" | "block"
 * Legacy format: "Watched" | "Warning" | "Protected"
 */

// =============================================================================
// CORE TYPES
// =============================================================================

export type ProtectionLevel = "watch" | "warn" | "block";
export type LegacyProtectionLevel = "Watched" | "Warning" | "Protected";

export interface ProtectionLevelMetadata {
	level: ProtectionLevel;
	icon: string;
	label: string;
	description: string;
	color: string;
	themeColor: string;
}

// =============================================================================
// PROTECTION LEVELS CONFIGURATION
// =============================================================================

export const PROTECTION_LEVELS: Record<ProtectionLevel, ProtectionLevelMetadata> = {
	watch: {
		level: "watch",
		icon: "🟢",
		label: "Watch",
		description: "Silent auto-snapshot on save",
		color: "#10B981",
		themeColor: "charts.green",
	},
	warn: {
		level: "warn",
		icon: "🟡",
		label: "Warn",
		description: "Notify before save with options",
		color: "#FF6B35",
		themeColor: "charts.orange",
	},
	block: {
		level: "block",
		icon: "🔴",
		label: "Block",
		description: "Require snapshot or explicit override",
		color: "#EF4444",
		themeColor: "charts.red",
	},
};

// =============================================================================
// CONVERSION UTILITIES
// =============================================================================

const LEGACY_TO_CANONICAL: Record<LegacyProtectionLevel, ProtectionLevel> = {
	Watched: "watch",
	Warning: "warn",
	Protected: "block",
} as const;

const CANONICAL_TO_LEGACY: Record<ProtectionLevel, LegacyProtectionLevel> = {
	watch: "Watched",
	warn: "Warning",
	block: "Protected",
} as const;

const VALID_LEVELS = ["watch", "warn", "block"] as const;

export function legacyToCanonical(legacy: LegacyProtectionLevel): ProtectionLevel {
	return LEGACY_TO_CANONICAL[legacy];
}

export function canonicalToLegacy(canonical: ProtectionLevel): LegacyProtectionLevel {
	return CANONICAL_TO_LEGACY[canonical];
}

export function isProtectionLevel(value: unknown): value is ProtectionLevel {
	return typeof value === "string" && (VALID_LEVELS as readonly string[]).includes(value);
}
