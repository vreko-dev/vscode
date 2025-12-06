export {
	BRAND_SIGNAGE,
	CORE_CONCEPT_SIGNAGE,
	canonicalProtectionLevelToLegacy,
	FILE_HEALTH_DECORATIONS,
	legacyProtectionLevelToCanonical,
	PROTECTION_LEVEL_SIGNAGE,
	REPO_STATUS_SIGNAGE,
} from "./constants";
export {
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
} from "./types";

/**
 * Convenience helpers so call sites read cleanly.
 */

import {
	FILE_HEALTH_DECORATIONS as _FILE_HEALTH_DECORATIONS,
	PROTECTION_LEVEL_SIGNAGE as _PROTECTION_LEVEL_SIGNAGE,
	REPO_STATUS_SIGNAGE as _REPO_STATUS_SIGNAGE,
} from "./constants";
import type { FileHealthCanonical, ProtectionLevelCanonical, RepoStatusCanonical } from "./types";

export const getProtectionLevelSignage = (level: ProtectionLevelCanonical) => _PROTECTION_LEVEL_SIGNAGE[level];

export const getRepoStatusSignage = (status: RepoStatusCanonical) => _REPO_STATUS_SIGNAGE[status];

export const getFileHealthDecoration = (state: FileHealthCanonical) => _FILE_HEALTH_DECORATIONS[state];
