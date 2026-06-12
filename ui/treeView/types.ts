/**
 * Tree View Types
 *
 * Type definitions for the unified Vreko tree view system.
 * Reference: docs/implementation/extension/treeview.md
 *
 * @packageDocumentation
 */

import type * as vscode from "vscode";

// =============================================================================
// VIEW STATE TYPES
// =============================================================================

/**
 * Compound state for tree view sections
 *
 * Follows Component.Skeleton/.Empty/.Error pattern from spec
 */
export type ViewState = "loading" | "error" | "empty" | "loaded";

/**
 * View state with optional error details
 */
export interface ViewStateData {
	state: ViewState;
	error?: Error;
	retryCommand?: string;
}

// =============================================================================
// TREE ITEM TYPES
// =============================================================================

/**
 * Base tree item with state tracking
 */
export interface StatefulTreeItem extends vscode.TreeItem {
	/** Item state for compound state pattern */
	viewState?: ViewState;
	/** Data ID for lookups */
	dataId?: string;
}

/**
 * Loading tree item configuration
 */
export interface LoadingItemConfig {
	label: string;
	detail?: string;
}

/**
 * Error tree item configuration
 */
export interface ErrorItemConfig {
	message: string;
	detail?: string;
	retryCommand?: string;
}

// =============================================================================
// VIEW CONFIGURATION
// =============================================================================

/**
 * View IDs matching package.json
 *
 * Per communication_matrix.md Section 4:
 * - ONE sidebar view only (overlap is a bug)
 */
export const VIEW_IDS = {
	vreko: "vreko.cockpit",
} as const;

export type ViewId = (typeof VIEW_IDS)[keyof typeof VIEW_IDS];

/**
 * View configuration
 */
export interface ViewConfig {
	id: ViewId;
	name: string;
	emptyMessage: string;
	loadingMessage: string;
}

/**
 * All view configurations
 */
export const VIEW_CONFIGS = {
	vreko: {
		id: VIEW_IDS.vreko,
		name: "Vreko",
		emptyMessage: "No snapshots yet.\nVreko will create them automatically as you work.",
		loadingMessage: "Loading...",
	},
};

// =============================================================================
// CONTEXT VALUES (for menus)
// =============================================================================

/**
 * Context values for tree item menus
 *
 * These must match package.json view/item/context "when" clauses
 */
export const CONTEXT_VALUES = {
	// Activity section
	activityGroup: "vreko.activityGroup",
	activityEvent: "vreko.activityEvent",
	activityEventAI: "vreko.activityEvent.ai",

	// Protected section
	protectionGroup: "vreko.protectionGroup",
	protectedFile: "vreko.protectedFile",
	protectedFileBlock: "vreko.protectedFile.block",
	protectedFileWarn: "vreko.protectedFile.warn",
	protectedFileWatch: "vreko.protectedFile.watch",

	// History section
	historyGroup: "vreko.historyGroup",
	session: "vreko.session",
	sessionRestorable: "vreko.session.restorable",
	sessionFile: "vreko.sessionFile",

	// Session history section
	sessionHistoryHeader: "vreko.sessionHistoryHeader",
	sessionHistoryItem: "vreko.sessionHistoryItem",
	sessionHistoryMore: "vreko.sessionHistoryMore",

	// Special items
	loading: "vreko.loading",
	error: "vreko.error",
	empty: "vreko.empty",
	loadMore: "vreko.loadMore",

	// Setup items
	setupClaudeDesktop: "vreko.setupClaudeDesktop",

	// Health section (SB-HEALTH-001)
	healthHeader: "vreko.healthHeader",
	healthGuard: "vreko.healthGuard",
	healthGuardPass: "vreko.healthGuard.pass",
	healthGuardWarn: "vreko.healthGuard.warn",
	healthGuardFail: "vreko.healthGuard.fail",
	healthFile: "vreko.healthFile",
} as const;

export type ContextValue = (typeof CONTEXT_VALUES)[keyof typeof CONTEXT_VALUES];

// =============================================================================
// CODICONS
// =============================================================================

/**
 * Codicon mappings for tree view items
 *
 * Per spec: Tree uses codicons, status bar uses emoji
 */
export const TREE_ICONS = {
	// Event types
	aiEdit: "sparkle",
	manualSnapshot: "save",
	autoSnapshot: "sync",
	restore: "discard",
	configChange: "gear",

	// Protection levels
	block: "error",
	warn: "warning",
	watch: "eye",

	// Status
	loading: "loading~spin",
	error: "error",
	empty: "info",
	loadMore: "ellipsis",

	// File types
	file: "file",
	folder: "folder",

	// Actions
	refresh: "refresh",
	settings: "gear",
	camera: "device-camera",

	// Session history
	history: "history",
	archive: "archive",
	sessionEnded: "pass-filled",
	sessionLive: "pulse",

	// Health section (SB-HEALTH-001)
	healthPass: "pass-filled",
	healthWarn: "warning",
	healthFail: "error",
	healthRefreshing: "sync~spin",
	heart: "heart",
} as const;

export type TreeIcon = (typeof TREE_ICONS)[keyof typeof TREE_ICONS];
