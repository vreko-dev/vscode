import type { Uri } from "vscode";
import { PROTECTION_LEVEL_SIGNAGE } from "../signage/index.js";
// Phase 2: Import canonical enum and mapping layer
import type { LegacyProtectionLevel } from "../types/protectionLevel.js";
import {
	legacyStringToLevel,
	levelToLegacyString,
	ProtectionLevel as ProtectionLevelEnum,
} from "../types/protectionLevel.js";

export interface SnapshotSummary {
	id: string;
	label: string;
	createdAt: number;
	description?: string;
	filesChanged?: number;
	branch?: string;
}

export interface SnapshotSummaryProvider {
	listRecent(limit: number): Promise<SnapshotSummary[]>;
	total(): Promise<number>;
	forFile(path: string | Uri): Promise<SnapshotSummary[]>;
}

// Backwards compatibility aliases
/** @deprecated Use SnapshotSummary instead */
export type CheckpointSummary = SnapshotSummary;
/** @deprecated Use SnapshotSummaryProvider instead */
export type CheckpointSummaryProvider = SnapshotSummaryProvider;

/**
 * Protection levels for files - now wraps canonical enum
 * For backward compatibility, still use string literals
 * - Watched: Silent auto-snapshot on save
 * - Warning: Show notification before save with snapshot option
 * - Protected: Require explicit snapshot or override to save
 *
 * Phase 2 Note: New code should use ProtectionLevelEnum from protectionLevel.ts
 */
export type ProtectionLevel = LegacyProtectionLevel;

// Re-export enum and helpers for new code
export { ProtectionLevelEnum, legacyStringToLevel, levelToLegacyString };
export type { LegacyProtectionLevel };

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
 * Now sourced from the canonical signage module to ensure consistency.
 */
export const PROTECTION_LEVELS: Record<
	ProtectionLevel,
	ProtectionLevelMetadata
> = {
	Watched: {
		level: "Watched",
		icon: PROTECTION_LEVEL_SIGNAGE.watch.emoji || "🟢",
		label: PROTECTION_LEVEL_SIGNAGE.watch.label,
		description:
			PROTECTION_LEVEL_SIGNAGE.watch.description ||
			"Silent auto-snapshot on save",
		color: PROTECTION_LEVEL_SIGNAGE.watch.color || "#10B981",
		themeColor: PROTECTION_LEVEL_SIGNAGE.watch.themeColor || "charts.green",
	},
	Warning: {
		level: "Warning",
		icon: PROTECTION_LEVEL_SIGNAGE.warn.emoji || "🟡",
		label: PROTECTION_LEVEL_SIGNAGE.warn.label,
		description:
			PROTECTION_LEVEL_SIGNAGE.warn.description ||
			"Notify before save with options",
		color: PROTECTION_LEVEL_SIGNAGE.warn.color || "#FACC15",
		themeColor: PROTECTION_LEVEL_SIGNAGE.warn.themeColor || "charts.yellow",
	},
	Protected: {
		level: "Protected",
		icon: PROTECTION_LEVEL_SIGNAGE.block.emoji || "🔴",
		label: PROTECTION_LEVEL_SIGNAGE.block.label,
		description:
			PROTECTION_LEVEL_SIGNAGE.block.description ||
			"Require snapshot or explicit override",
		color: PROTECTION_LEVEL_SIGNAGE.block.color || "#EF4444",
		themeColor: PROTECTION_LEVEL_SIGNAGE.block.themeColor || "charts.red",
	},
};

export interface ProtectedFileEntry {
	id: string;
	label: string;
	path: string;
	lastProtectedAt?: number;
	lastSnapshotId?: string;
	// 🆕 Add protection level field
	protectionLevel?: ProtectionLevel;
}

export interface ProtectedFileProvider {
	list(): Promise<ProtectedFileEntry[]>;
	total(): Promise<number>;
	// 🆕 Update add method signature to include protection level
	add(
		path: string,
		options?: { snapshotId?: string; protectionLevel?: ProtectionLevel },
	): Promise<void>;
	// 🆕 Add method to update protection level
	updateProtectionLevel(path: string, level: ProtectionLevel): Promise<void>;
	remove(path: string): Promise<void>;
	markSnapshot(id: string, filePaths: string[]): Promise<void>;
}
