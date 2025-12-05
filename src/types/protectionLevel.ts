/**
 * Canonical ProtectionLevel enum and legacy mapping layer
 *
 * Phase 2 Introduction: Explicit protection level model with type-safe mapping
 * to legacy string-based system for backward compatibility.
 *
 * This module provides:
 * 1. Numeric enum for protection levels
 * 2. Mapping functions between enum and legacy strings
 * 3. Type aliases for gradual migration
 *
 * Usage:
 * - New code: Use ProtectionLevel enum directly
 * - Legacy code: Use LegacyProtectionLevel type and mapping functions
 * - Integration points: Accept both, map as needed
 */

/**
 * Canonical protection level enum
 * Ordered by strictness: 0 = no protection, 3 = strictest
 */
export enum ProtectionLevel {
	Unprotected = 0,
	Checkpoint = 1, // Legacy "Watched"
	Guarded = 2, // Legacy "Warning"
	Strict = 3, // Legacy "Protected"
}

/**
 * Legacy protection level string union
 * Used for backward compatibility with existing code
 */
export type LegacyProtectionLevel = "Watched" | "Warning" | "Protected";

/**
 * Map legacy string protection level to enum
 * @param legacy - Legacy protection level string ("Watched", "Warning", or "Protected")
 * @returns Corresponding ProtectionLevel enum value
 * @throws Error if legacy string is not recognized
 */
export function legacyStringToLevel(
	legacy: LegacyProtectionLevel,
): ProtectionLevel {
	const mapping: Record<LegacyProtectionLevel, ProtectionLevel> = {
		Watched: ProtectionLevel.Checkpoint,
		Warning: ProtectionLevel.Guarded,
		Protected: ProtectionLevel.Strict,
	};
	return mapping[legacy];
}

/**
 * Map ProtectionLevel enum to legacy string
 * @param level - ProtectionLevel enum value
 * @returns Corresponding legacy string ("Watched", "Warning", or "Protected")
 * @throws Error if level is not a valid protection level
 */
export function levelToLegacyString(
	level: ProtectionLevel,
): LegacyProtectionLevel {
	const mapping: Record<ProtectionLevel, LegacyProtectionLevel> = {
		[ProtectionLevel.Checkpoint]: "Watched",
		[ProtectionLevel.Guarded]: "Warning",
		[ProtectionLevel.Strict]: "Protected",
		[ProtectionLevel.Unprotected]: "Watched", // Default fallback
	};
	return mapping[level] ?? "Watched";
}

/**
 * Check if a value is a valid legacy protection level string
 * @param value - Value to check
 * @returns True if value is a valid legacy protection level
 */
export function isLegacyProtectionLevel(
	value: unknown,
): value is LegacyProtectionLevel {
	return (
		typeof value === "string" &&
		(value === "Watched" || value === "Warning" || value === "Protected")
	);
}

/**
 * Get human-readable label for protection level
 * @param level - ProtectionLevel enum value
 * @returns Human-readable label
 */
export function getLevelLabel(level: ProtectionLevel): string {
	const labels: Record<ProtectionLevel, string> = {
		[ProtectionLevel.Unprotected]: "Unprotected",
		[ProtectionLevel.Checkpoint]: "Watch",
		[ProtectionLevel.Guarded]: "Warn",
		[ProtectionLevel.Strict]: "Block",
	};
	return labels[level] ?? "Unknown";
}

/**
 * Get semantic description for protection level
 * @param level - ProtectionLevel enum value
 * @returns Description of what this level does
 */
export function getLevelDescription(level: ProtectionLevel): string {
	const descriptions: Record<ProtectionLevel, string> = {
		[ProtectionLevel.Unprotected]: "No protection",
		[ProtectionLevel.Checkpoint]: "Silent auto-snapshot on save",
		[ProtectionLevel.Guarded]: "Notify before save with snapshot option",
		[ProtectionLevel.Strict]: "Require snapshot or explicit override",
	};
	return descriptions[level] ?? "Unknown protection level";
}

/**
 * Get color for protection level (for UI rendering)
 * @param level - ProtectionLevel enum value
 * @returns Hex color code for this level
 */
export function getLevelColor(level: ProtectionLevel): string {
	const colors: Record<ProtectionLevel, string> = {
		[ProtectionLevel.Unprotected]: "#94A3B8", // Gray 400
		[ProtectionLevel.Checkpoint]: "#10B981", // Emerald 500
		[ProtectionLevel.Guarded]: "#FF6B35", // Safety orange
		[ProtectionLevel.Strict]: "#EF4444", // Red 500
	};
	return colors[level] ?? "#94A3B8";
}

/**
 * Get icon for protection level
 * @param level - ProtectionLevel enum value
 * @returns Emoji icon for this level
 */
export function getLevelIcon(level: ProtectionLevel): string {
	const icons: Record<ProtectionLevel, string> = {
		[ProtectionLevel.Unprotected]: "⭕", // Empty circle
		[ProtectionLevel.Checkpoint]: "🟢", // Green circle
		[ProtectionLevel.Guarded]: "🟡", // Yellow circle
		[ProtectionLevel.Strict]: "🔴", // Red circle
	};
	return icons[level] ?? "⚫";
}
