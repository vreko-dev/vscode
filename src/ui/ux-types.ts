/**
 * Extension UX Types
 *
 * Central type definitions for the new UX implementation.
 * Reference: ai_dev_utils/resources/extension-ux/EXTENSION_UX_SPEC.md
 *
 * @packageDocumentation
 */

import type * as vscode from "vscode";
import type {
	PulseLevelCanonical,
	SessionHealthCanonical,
	TemperatureLevelCanonical,
	TrajectoryCanonical,
} from "../signage/types";

// =============================================================================
// STATUS BAR TYPES
// =============================================================================

/**
 * Status bar display states
 *
 * State machine:
 * ```
 * idle ──→ ai-session ──→ idle
 *   │         (5s)
 *   └──→ checkpoint ──→ idle-stats
 *            (3s)
 *   └──→ restored ──→ idle
 *            (5s)
 * ```
 *
 * @see StatusBarManager for implementation
 */
export type StatusBarState =
	| "idle" // $(shield) SnapBack
	| "idle-stats" // $(shield) 3 checkpoints today
	| "ai-session" // $(sparkle) Cursor session protected
	| "checkpoint" // $(check) Checkpoint saved
	| "restored" // $(history) Restored 47 lines
	| "vitals" // 💓45 🌡️🔥 📊78 🫁92 (power user mode)
	| "recommendation"; // $(warning) Snapshot Recommended

/**
 * Stats tracked for status bar display
 */
export interface StatusBarStats {
	checkpointsToday: number;
	aiSessionsToday: number;
	weekCheckpoints: number;
	weekLinesProtected: number;
	lastCheckpoint?: {
		timestamp: number;
		aiTool?: string;
		fileCount: number;
	};
}

// =============================================================================
// ACTIVITY SECTION TYPES
// =============================================================================

/**
 * Activity event types
 *
 * IMPORTANT: Icons are based on TYPE, not source!
 * Source (Cursor, Copilot, etc.) goes in tooltip/description.
 */
export type ActivityEventType =
	| "ai-edit" // ✨ AI-assisted edit
	| "manual-snapshot" // 💾 Manual snapshot
	| "auto-snapshot" // 🔄 Auto snapshot
	| "restore" // ↩️ Restore
	| "config-change"; // ⚙️ Configuration change

/**
 * Activity event for display in tree view
 */
export interface ActivityEvent {
	id: string;
	type: ActivityEventType;
	timestamp: number;

	/** Primary label - the file or count */
	file?: string;
	fileCount?: number;

	/** Source info - for tooltip, NOT for icon */
	source?: string; // "Cursor", "Copilot", etc.

	/** Additional context */
	linesChanged?: number;
	trigger?: "save" | "burst" | "manual" | "ai";
}

/**
 * Grouped activities by date
 *
 * GOTCHA: Use stable date grouping keys, not dynamic "2 hours ago"
 * Dynamic labels cause tree items to "jump" on refresh
 */
export type ActivityGroup = "Today" | "Yesterday" | "Earlier";

// =============================================================================
// PROTECTED FILES SECTION TYPES
// =============================================================================

/**
 * Protection level for files
 *
 * Visual mapping (with text badges for a11y):
 * - BLOCK: 🛑 + red + "BLOCK" badge
 * - WARN:  ⚠️ + yellow + "WARN" badge
 * - WATCH: 👁️ + blue + "WATCH" badge
 */
export type ProtectionLevel = "BLOCK" | "WARN" | "WATCH";

/**
 * Protected file info for tree display
 */
export interface ProtectedFileInfo {
	path: string;
	absolutePath: string;
	level: ProtectionLevel;

	/** True if inherited from cluster anchor */
	isInherited: boolean;

	/** Anchor file if inherited */
	anchorFile?: string;

	/** Snapshot count for this file */
	snapshotCount: number;
}

// =============================================================================
// HISTORY/SESSIONS SECTION TYPES
// =============================================================================

/**
 * Session info for tree display
 *
 * NOTE: Renamed from "Sessions" to "History" in UI for clarity
 * Internal code can still use "Session" terminology
 */
export interface SessionInfo {
	id: string;
	timestamp: number;
	duration: number; // in seconds
	fileCount: number;

	/** Files within this session */
	files: SessionFileInfo[];

	/** Can this session be restored? */
	canRestore: boolean;

	/** AI tool detected during session */
	aiTool?: string;
}

export interface SessionFileInfo {
	path: string;
	snapshotId: string;
	linesAdded: number;
	linesRemoved: number;
}

// =============================================================================
// TREE VIEW TYPES
// =============================================================================

/**
 * Tree item types for context menus
 *
 * Used in package.json menus.view/item/context "when" clauses
 */
export type TreeItemContextValue =
	| "activity-event"
	| "activity-group"
	| "protected-file"
	| "protection-level-group"
	| "session"
	| "session-restorable"
	| "session-file"
	| "cloud-connected"
	| "cloud-disconnected";

/**
 * Section types for the main tree view
 */
export type TreeSectionType = "activity" | "protected" | "history" | "cloud" | "vitals"; // Optional power user section

/**
 * Tree view section configuration
 */
export interface TreeSectionConfig {
	type: TreeSectionType;
	label: string;
	collapsibleState: vscode.TreeItemCollapsibleState;

	/** Should this section be visible? */
	visible: boolean;

	/** Badge count (e.g., "12" in "ACTIVITY (12)") */
	badgeCount?: number;
}

// =============================================================================
// NOTIFICATION TYPES
// =============================================================================

/**
 * Notification decision result
 *
 * Most events should NOT notify - use status bar instead.
 * Only notify for significant events (restore, large changes).
 */
export interface NotificationDecision {
	shouldNotify: boolean;
	type: "info" | "warning" | "error";
	message: string;
	actions?: string[];
}

// =============================================================================
// VITALS DISPLAY TYPES (Integration with @snapback/intelligence)
// =============================================================================

/**
 * Vitals snapshot for UI display
 *
 * Uses canonical types from signage/types.ts for consistency.
 *
 * @see packages/intelligence/src/vitals for full implementation
 * @see signage/types.ts for canonical type definitions
 */
export interface VitalsDisplayData {
	pulse: {
		level: PulseLevelCanonical;
		value: number; // changes/min
	};
	temperature: {
		level: TemperatureLevelCanonical;
		percentage: number; // AI activity %
		tool?: string;
	};
	pressure: {
		value: number; // 0-100
		trend: "rising" | "stable" | "falling";
	};
	oxygen: {
		value: number; // 0-100
	};
	trajectory: TrajectoryCanonical;
	/** Overall session health derived from vitals */
	sessionHealth?: SessionHealthCanonical;
}

// =============================================================================
// ACTIVITY SEQUENCE TYPES
// =============================================================================

/**
 * Activity step for status bar cycling animation
 *
 * When significant events occur (AI detection, vitals degradation),
 * the status bar cycles through a sequence of steps to demonstrate
 * that SnapBack is alive and responding.
 *
 * DESIGN: "Proof of life" - shows activity awareness without being intrusive
 *
 * @example
 * ```typescript
 * // AI detection sequence
 * [
 *   { text: "$(sparkle) AI detected", duration: 1500 },
 *   { text: "$(sync~spin) Analyzing...", duration: 1000 },
 *   { text: "$(check) Checkpoint saved", duration: 2000 },
 * ]
 * ```
 */
export interface ActivityStep {
	/** Status bar text with codicon (e.g., "$(sparkle) AI detected") */
	text: string;
	/** Duration in milliseconds to show this step */
	duration: number;
	/** Optional background color (ThemeColor key) */
	backgroundColor?: string;
}

/**
 * Predefined activity sequence types
 *
 * These represent common activity patterns that trigger cycling.
 */
export type ActivitySequenceType =
	| "ai-detected" // AI tool detected modifying code
	| "vitals-degrading" // Workspace health declining
	| "burst-detected" // Rapid changes detected
	| "checkpoint-created" // Snapshot saved
	| "restore-complete"; // File(s) restored

/**
 * Configuration for an activity sequence
 */
export interface ActivitySequenceConfig {
	type: ActivitySequenceType;
	steps: ActivityStep[];
	/** Return to this state after sequence completes */
	finalState?: StatusBarState;
}

/**
 * Predefined activity sequences for common events
 *
 * CRITICAL: Use $(sync~spin) sparingly - only for actual in-progress work
 */
export const ACTIVITY_SEQUENCES: Record<ActivitySequenceType, ActivityStep[]> = {
	"ai-detected": [
		{ text: "$(sparkle) AI detected", duration: 1200 },
		{ text: "$(sync~spin) Capturing...", duration: 800 },
		{ text: "$(check) Checkpoint saved", duration: 1500 },
	],
	"vitals-degrading": [
		{ text: "$(warning) Health declining", duration: 1200, backgroundColor: "statusBarItem.warningBackground" },
		{ text: "$(heart) Monitoring...", duration: 800 },
		{ text: "$(shield) Auto-protected", duration: 1500 },
	],
	"burst-detected": [
		{ text: "$(zap) Rapid changes", duration: 1000 },
		{ text: "$(sync~spin) Capturing...", duration: 800 },
		{ text: "$(check) Checkpoint saved", duration: 1500 },
	],
	"checkpoint-created": [
		{ text: "$(sync~spin) Saving...", duration: 500 },
		{ text: "$(check) Checkpoint saved", duration: 2000 },
	],
	"restore-complete": [
		{ text: "$(sync~spin) Restoring...", duration: 800 },
		{ text: "$(history) Restored", duration: 2000, backgroundColor: "statusBarItem.warningBackground" },
	],
} as const;

// =============================================================================
// FORMATTING UTILITIES
// =============================================================================

/**
 * Format relative time for display
 *
 * GOTCHA: Use stable formats to avoid tree item "jumping"
 * - "2h" not "2 hours ago"
 * - "5:52 AM" for same-day, "Yesterday" for previous day
 */
export interface TimeFormatOptions {
	style: "compact" | "full";
	includeDate: boolean;
}

// =============================================================================
// ICON CONSTANTS
// =============================================================================

/**
 * Event type to icon mapping
 *
 * CRITICAL: Icons represent TYPE, not SOURCE!
 * Source info goes in tooltip/description.
 */
export const EVENT_ICONS: Record<ActivityEventType, string> = {
	"ai-edit": "✨",
	"manual-snapshot": "💾",
	"auto-snapshot": "🔄",
	restore: "↩️",
	"config-change": "⚙️",
} as const;

/**
 * Protection level to decoration mapping
 */
export const LEVEL_DECORATIONS: Record<
	ProtectionLevel,
	{
		badge: string;
		color: string;
		text: string;
	}
> = {
	BLOCK: { badge: "🛑", color: "charts.red", text: "BLOCK" },
	WARN: { badge: "⚠️", color: "charts.yellow", text: "WARN" },
	WATCH: { badge: "👁️", color: "charts.blue", text: "WATCH" },
} as const;

/**
 * Pulse level to emoji mapping
 *
 * @deprecated Use PULSE_LEVEL_SIGNAGE from signage/constants.ts directly
 * Kept for backward compatibility with StatusBarManager
 */
export const PULSE_EMOJI: Record<PulseLevelCanonical, string> = {
	resting: "💤",
	steady: "💓",
	elevated: "💗",
	racing: "💖",
	critical: "💥",
} as const;

/**
 * Temperature level to emoji mapping
 *
 * @deprecated Use TEMPERATURE_LEVEL_SIGNAGE from signage/constants.ts directly
 * Kept for backward compatibility with StatusBarManager
 */
export const TEMP_EMOJI: Record<TemperatureLevelCanonical, string> = {
	cool: "🧊",
	warm: "🌡️",
	hot: "🔥",
	burning: "🌋",
} as const;
