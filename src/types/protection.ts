import {
	PROTECTION_LEVELS as CANONICAL_PROTECTION_LEVELS,
	type ProtectionLevelMetadata as CanonicalMetadata,
	canonicalToLegacy,
	isProtectionLevel,
	type LegacyProtectionLevel,
	legacyToCanonical,
	type ProtectionLevel,
} from "@snapback/contracts";

/**
 * Re-export canonical protection level type
 * This is now the standard type used throughout the VSCode extension.
 *
 * Migration note: Legacy code using "Watched" | "Warning" | "Protected" strings
 * should use the conversion functions from @snapback/contracts/types/protection-utils
 */
export type { LegacyProtectionLevel, ProtectionLevel };
export { canonicalToLegacy, isProtectionLevel, legacyToCanonical };

/**
 * UI metadata for protection levels
 * Extends canonical metadata with VSCode-specific theming
 */
export interface ProtectionLevelMetadata extends CanonicalMetadata {
	themeColor: string; // VS Code theme color
}

/**
 * Protection level configurations with VSCode-specific metadata
 * This maps canonical levels to VSCode UI requirements
 */
export const PROTECTION_LEVELS: Record<ProtectionLevel, ProtectionLevelMetadata> = {
	watch: {
		...CANONICAL_PROTECTION_LEVELS.watch,
		themeColor: CANONICAL_PROTECTION_LEVELS.watch.themeColor || "charts.green",
	},
	warn: {
		...CANONICAL_PROTECTION_LEVELS.warn,
		themeColor: CANONICAL_PROTECTION_LEVELS.warn.themeColor || "charts.orange",
	},
	block: {
		...CANONICAL_PROTECTION_LEVELS.block,
		themeColor: CANONICAL_PROTECTION_LEVELS.block.themeColor || "charts.red",
	},
};
