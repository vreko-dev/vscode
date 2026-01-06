export {
	ANIMATION_FRAMES,
	BRAND_SIGNAGE,
	CORE_CONCEPT_SIGNAGE,
	canonicalProtectionLevelToLegacy,
	EVENT_TYPE_SIGNAGE,
	FILE_HEALTH_DECORATIONS,
	icon,
	legacyProtectionLevelToCanonical,
	PROTECTION_LEVEL_SIGNAGE,
	PULSE_LEVEL_SIGNAGE,
	QUICKPICK_ICONS,
	type QuickPickIconKey,
	REPO_STATUS_SIGNAGE,
	SESSION_HEALTH_SIGNAGE,
	SNAPSHOT_ORIGIN_SIGNAGE,
	STATUS_BAR_TEXT,
	STATUS_SIGNAGE,
	TEMPERATURE_LEVEL_SIGNAGE,
	TRAJECTORY_SIGNAGE,
} from "./constants";
export {
	type BrandSignage,
	type CoreConceptKey,
	type CoreConceptSignage,
	type EventTypeKey,
	type EventTypeSignage,
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
	type SnapshotOriginKey,
	type SnapshotOriginSignage,
	type StatusKey,
	type StatusSignage,
	TEMPERATURE_LEVEL_CANONICAL,
	type TemperatureLevelCanonical,
	type TemperatureLevelSignage,
	TRAJECTORY_CANONICAL,
	type TrajectoryCanonical,
	type TrajectorySignage,
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
