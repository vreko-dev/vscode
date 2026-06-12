/**
 * All Vreko commands following VS Code naming conventions
 * Pattern: vreko.{category}.{action}
 *
 * IMPORTANT: This file maps BOTH legacy and new command structures.
 * Legacy commands (vreko.createSnapshot) are maintained for backward compatibility.
 * New commands (vreko.snapshot.create) follow the organized structure.
 * This file provides a single source of truth for command IDs used in code.
 *
 * STATUS LEGEND:
 * - No annotation = ACTIVE (registered and functional)
 * - @internal = Internal use only (not exposed in command palette)
 * - @legacy = Legacy naming (maintained for backward compatibility)
 *
 * CONSOLIDATION AUDIT (2026-02-26):
 * Removed 13 unimplemented commands from package.json.
 * Session and Test commands are now properly registered.
 */

export const COMMANDS = {
	// Protection Commands
	PROTECTION: {
		// Note: setWatchLevel, setWarnLevel, setBlockLevel commands are registered as legacy commands
		// The v2 naming pattern (vreko.protection.*) is reserved for future use
		REMOVE: "vreko.protection.remove", // @internal - context menu only
		PROTECT_WORKSPACE: "vreko.protection.workspace", // ACTIVE
		PROTECT_FOLDER: "vreko.protection.folder", // @internal - context menu only
		// Legacy commands (maintain backward compatibility)
		PROTECT_FILE: "vreko.protectFile",
		PROTECT_CURRENT_FILE: "vreko.protectCurrentFile",
		UNPROTECT_FILE: "vreko.unprotectFile",
		CHANGE_LEVEL: "vreko.changeProtectionLevel",
		SHOW_ALL: "vreko.showAllProtectedFiles",
		PROTECT_REPO: "vreko.protectEntireRepo",
		// Protection level commands (registered as legacy names)
		SET_WATCH_LEVEL: "vreko.setWatchLevel",
		SET_WARN_LEVEL: "vreko.setWarnLevel",
		SET_BLOCK_LEVEL: "vreko.setBlockLevel",
	},

	// Snapshot Commands
	SNAPSHOT: {
		CREATE: "vreko.snapshot.create", // @legacy - use CREATE_LEGACY instead
		LIST: "vreko.snapshot.list", // @internal - used by tree views
		COMPARE: "vreko.snapshot.compare", // @internal - context menu
		RESTORE: "vreko.snapshot.restore", // @legacy - use RESTORE_LEGACY instead
		DELETE: "vreko.snapshot.delete", // ACTIVE
		// Legacy commands (maintain backward compatibility) - THESE ARE ACTIVE
		CREATE_LEGACY: "vreko.createSnapshot",
		RESTORE_LEGACY: "vreko.vreko",
		SHOW_ALL: "vreko.showAllSnapshots",
		VIEW: "vreko.viewSnapshot",
	},

	// Session Commands - ALL ACTIVE
	SESSION: {
		LIST: "vreko.session.list",
		RESTORE: "vreko.session.restore",
		EXPORT: "vreko.session.export",
	},

	// View Commands
	VIEW: {
		SHOW_SIDEBAR: "vreko.view.sidebar", // @internal - used by welcome view
		SHOW_HISTORY: "vreko.view.history", // @internal - used by tree views
		SHOW_SETTINGS: "vreko.view.settings", // @internal - dashboard navigation
		REFRESH: "vreko.view.refresh", // @legacy - use REFRESH_LEGACY instead
		OPEN_IN_WEB: "vreko.openSnapshotInWeb",
		// Legacy commands - THESE ARE ACTIVE
		REFRESH_LEGACY: "vreko.refreshViews",
		REFRESH_DASHBOARD: "vreko.refreshSafetyDashboard",
		OPEN_WALKTHROUGH: "vreko.openWalkthrough",
		OPEN_DOCS: "vreko.openDocumentation",
	},

	// Test Commands - ACTIVE (debug mode only)
	TEST: {
		GET_SNAPSHOTS: "vreko.test.getSnapshots",
		RESTORE_SNAPSHOT: "vreko.test.restoreSnapshot",
	},

	// Account Commands
	ACCOUNT: {
		// Standard VS Code convention commands (ACTIVE)
		SIGN_IN: "vreko.signIn",
		SIGN_OUT: "vreko.signOut",
		SHOW_STATUS: "vreko.showAuthStatus",
		CONNECT: "vreko.connect",
		MANUAL_AUTH: "vreko.account.manualAuth",
		// Test commands
		AUTHENTICATE: "vreko.authenticate",
		GET_AUTH_STATE: "vreko.getAuthState",
	},

	// Utility Commands
	UTILITY: {
		SHOW_OUTPUT: "vreko.showOutput",
		OPEN_DOCS: "vreko.openDocs",
		REPORT_ISSUE: "vreko.reportIssue",
		// Legacy/Existing commands
		INITIALIZE: "vreko.initialize",
		SHOW_STATUS: "vreko.showStatus",
		REFRESH_TREE: "vreko.refreshTree",
		// Settings commands
		OPEN_SETTINGS: "vreko.openSettings",
	},

	// Hint/Nudge Commands (used by AdaptiveHintManager)
	HINTS: {
		SHOW_SESSIONS: "vreko.showSessions",
		ANALYZE_SESSIONS: "vreko.analyzeSessions",
		ADVANCED_RESTORE: "vreko.advancedRestore",
		PROFILE_PERFORMANCE: "vreko.profilePerformance",
	},

	// Workflow Commands (used by WorkflowIntegration)
	WORKFLOW: {
		VIEW_CHANGES: "vreko.viewChanges",
		UNDO_SUGGESTION: "vreko.undoSuggestion",
	},

	// File Commands (used by tree views)
	FILE: {
		OPEN_FILE: "vreko.openFile",
	},

	// Diff Commands
	DIFF: {
		SNAPSHOT_DIFF: "vreko.snapshot.showFileDiff",
		// Legacy alias (typo - kept for backward compat)
		LEGACY_DIFF: "vreko.diffSnapshot",
	},
} as const;

// Flat list for registration and iteration
export const ALL_COMMANDS = Object.values(COMMANDS).flatMap((category) => Object.values(category));

// Type helper for type-safe command IDs
export type CommandId = (typeof ALL_COMMANDS)[number];
