import type { Uri } from "vscode";
import { PROTECTION_LEVEL_SIGNAGE } from "../signage/index.js";

// ============================================
// GROUPING MODES (Future-Proof Architecture)
// ============================================

/**
 * Grouping mode for TreeView display.
 * - 'time': Group by recency (Today, Yesterday, This Week) - DEFAULT
 * - 'system': Group by detected system/package (apps/web, packages/sdk) - FUTURE
 * - 'file': Group by file path - FUTURE
 */
export type GroupingMode = "time" | "system" | "file";

/**
 * TreeView configuration with extensible grouping
 */
export interface TreeViewConfig {
	/** How to group snapshots in the tree */
	groupBy: GroupingMode;

	/** Show AI detection indicators */
	showAI: boolean;

	/** Show protection level badges */
	showProtection: boolean;

	/** Maximum snapshots to show per group before "show more" */
	maxPerGroup: number;
}

/**
 * Default configuration - time-based grouping
 */
export const DEFAULT_TREE_CONFIG: TreeViewConfig = {
	groupBy: "time",
	showAI: true,
	showProtection: true,
	maxPerGroup: 5,
};

// ============================================
// SNAPSHOT DISPLAY TYPES
// ============================================

/**
 * Snapshot display item for TreeView
 */
export interface SnapshotDisplayItem {
	id: string;
	name: string; // "AI Edit (Cursor) - Button.tsx"
	timestamp: Date;
	trigger: SnapshotTrigger;
	fileCount: number;
	primaryFile: string;
	aiTool?: string;
	description: string; // "19 minutes ago"

	// For system grouping (future)
	detectedSystem?: string; // "apps/web", "packages/sdk"
}

export type SnapshotTrigger = "auto" | "manual" | "ai-detected" | "pre-save";

// ============================================
// TIME GROUPING (Implement Now)
// ============================================

/**
 * Time-based group keys
 */
export type TimeGroup = "recent" | "yesterday" | "this-week" | "older";

/**
 * Grouped snapshots by time
 */
export interface TimeGroupedSnapshots {
	recent: SnapshotDisplayItem[]; // Last 24 hours
	yesterday: SnapshotDisplayItem[]; // Yesterday
	thisWeek: SnapshotDisplayItem[]; // This week (excluding today/yesterday)
	older: SnapshotDisplayItem[]; // Everything else
}

// ============================================
// SYSTEM GROUPING (Future - Stub Only)
// ============================================

/**
 * System-based group (for future implementation)
 */
export interface SystemGroup {
	/** System identifier: "apps/web", "packages/sdk" */
	systemId: string;

	/** Human-readable name */
	displayName: string;

	/** Icon for the system type */
	icon: string;

	/** Snapshots in this system */
	snapshots: SnapshotDisplayItem[];

	/** File count in this system */
	fileCount: number;
}

/**
 * Grouped snapshots by system (future)
 */
export interface SystemGroupedSnapshots {
	systems: SystemGroup[];
	ungrouped: SnapshotDisplayItem[]; // Files that don't belong to a detected system
}

// ============================================
// FILE GROUPING (Future - Stub Only)
// ============================================

/**
 * File-based group (for future implementation)
 */
export interface FileGroup {
	/** File path */
	filePath: string;

	/** File name for display */
	fileName: string;

	/** Snapshots containing this file */
	snapshots: SnapshotDisplayItem[];
}

/**
 * Grouped snapshots by file (future)
 */
export interface FileGroupedSnapshots {
	files: FileGroup[];
}

// ============================================
// UNION TYPE FOR ALL GROUPINGS
// ============================================

/**
 * Union type for grouped snapshots based on mode
 */
export type GroupedSnapshots =
	| { mode: "time"; data: TimeGroupedSnapshots }
	| { mode: "system"; data: SystemGroupedSnapshots }
	| { mode: "file"; data: FileGroupedSnapshots };

// ============================================
// QUICK ACTIONS & PROBLEMS
// ============================================

/**
 * Quick action item
 */
export interface QuickAction {
	id: string;
	label: string;
	icon: string;
	command: string;
}

/**
 * A problem that needs attention
 */
export interface ProblemItem {
	id: string;
	severity: "warning" | "error";
	title: string;
	description: string;
	action?: {
		label: string;
		command: string;
	};
}

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
 * Protection level type - now uses canonical format from contracts
 * Canonical: "watch" | "warn" | "block"
 * Legacy: "Watched" | "Warning" | "Protected" (for backward compatibility via mapping functions)
 *
 * Use canonical format for all new code.
 * Import ProtectionLevelEnum from protectionLevel.ts for enum-based code (deprecated).
 */
export type {
	LegacyProtectionLevel,
	ProtectionLevel,
} from "@snapback/contracts";

import type { ProtectionLevel } from "@snapback/contracts";

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
	watch: {
		level: "watch",
		icon: PROTECTION_LEVEL_SIGNAGE.watch.emoji || "🟢",
		label: PROTECTION_LEVEL_SIGNAGE.watch.label,
		description:
			PROTECTION_LEVEL_SIGNAGE.watch.description ||
			"Silent auto-snapshot on save",
		color: PROTECTION_LEVEL_SIGNAGE.watch.color || "#10B981",
		themeColor: PROTECTION_LEVEL_SIGNAGE.watch.themeColor || "charts.green",
	},
	warn: {
		level: "warn",
		icon: PROTECTION_LEVEL_SIGNAGE.warn.emoji || "🟡",
		label: PROTECTION_LEVEL_SIGNAGE.warn.label,
		description:
			PROTECTION_LEVEL_SIGNAGE.warn.description ||
			"Notify before save with options",
		color: PROTECTION_LEVEL_SIGNAGE.warn.color || "#FACC15",
		themeColor: PROTECTION_LEVEL_SIGNAGE.warn.themeColor || "charts.yellow",
	},
	block: {
		level: "block",
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
