/**
 * All SnapBack commands following VS Code naming conventions
 * Pattern: snapback.{category}.{action}
 *
 * IMPORTANT: This file maps BOTH legacy and new command structures.
 * Legacy commands (snapback.createSnapshot) are maintained for backward compatibility.
 * New commands (snapback.snapshot.create) follow the organized structure.
 * This file provides a single source of truth for command IDs used in code.
 *
 * STATUS LEGEND:
 * - No annotation = ACTIVE (registered and functional)
 * - @planned = NOT YET IMPLEMENTED (defined but not registered)
 * - @legacy = DEPRECATED but maintained for backward compatibility
 *
 * CONSOLIDATION AUDIT (2026-01-08):
 * Found 19 commands defined but not registered. These are marked @planned below.
 * Either implement or remove in future cleanup sprint.
 */

export const COMMANDS = {
	// Protection Commands
	PROTECTION: {
		// Note: setWatchLevel, setWarnLevel, setBlockLevel commands are registered as legacy commands
		// The v2 naming pattern (snapback.protection.*) is reserved for future use
		REMOVE: "snapback.protection.remove", // @planned - not registered
		PROTECT_WORKSPACE: "snapback.protection.workspace", // @planned - not registered
		PROTECT_FOLDER: "snapback.protection.folder", // @planned - not registered
		// Legacy commands (maintain backward compatibility)
		PROTECT_FILE: "snapback.protectFile",
		PROTECT_CURRENT_FILE: "snapback.protectCurrentFile",
		UNPROTECT_FILE: "snapback.unprotectFile",
		CHANGE_LEVEL: "snapback.changeProtectionLevel",
		SHOW_ALL: "snapback.showAllProtectedFiles",
		PROTECT_REPO: "snapback.protectEntireRepo",
		// Protection level commands (registered as legacy names)
		SET_WATCH_LEVEL: "snapback.setWatchLevel",
		SET_WARN_LEVEL: "snapback.setWarnLevel",
		SET_BLOCK_LEVEL: "snapback.setBlockLevel",
	},

	// Snapshot Commands
	SNAPSHOT: {
		CREATE: "snapback.snapshot.create", // @planned - use CREATE_LEGACY instead
		LIST: "snapback.snapshot.list", // @planned - not registered
		COMPARE: "snapback.snapshot.compare", // @planned - not registered
		RESTORE: "snapback.snapshot.restore", // @planned - use RESTORE_LEGACY instead
		DELETE: "snapback.snapshot.delete", // @planned - not registered
		// Legacy commands (maintain backward compatibility) - THESE ARE ACTIVE
		CREATE_LEGACY: "snapback.createSnapshot",
		RESTORE_LEGACY: "snapback.snapBack",
		SHOW_ALL: "snapback.showAllSnapshots",
		VIEW: "snapback.viewSnapshot",
	},

	// Session Commands
	SESSION: {
		LIST: "snapback.session.list", // @planned - not registered
		RESTORE: "snapback.session.restore", // @planned - not registered
		EXPORT: "snapback.session.export", // @planned - not registered
	},

	// View Commands
	VIEW: {
		SHOW_SIDEBAR: "snapback.view.sidebar", // @planned - not registered
		SHOW_HISTORY: "snapback.view.history", // @planned - not registered
		SHOW_SETTINGS: "snapback.view.settings", // @planned - not registered
		REFRESH: "snapback.view.refresh", // @planned - use REFRESH_LEGACY instead
		OPEN_IN_WEB: "snapback.openSnapshotInWeb",
		// Legacy commands - THESE ARE ACTIVE
		REFRESH_LEGACY: "snapback.refreshViews",
		REFRESH_DASHBOARD: "snapback.refreshSafetyDashboard",
		OPEN_WALKTHROUGH: "snapback.openWalkthrough",
		OPEN_DOCS: "snapback.openDocumentation",
	},

	// Account Commands
	TEST: {
		GET_SNAPSHOTS: "snapback.test.getSnapshots", // @planned - not registered
		RESTORE_SNAPSHOT: "snapback.test.restoreSnapshot", // @planned - not registered
	},
	ACCOUNT: {
		SIGN_IN: "snapback.account.signIn",
		SIGN_OUT: "snapback.account.signOut", // @planned - use SIGN_OUT_LEGACY instead
		SHOW_STATUS: "snapback.account.status", // @planned - use SHOW_STATUS_LEGACY instead
		MANUAL_AUTH: "snapback.account.manualAuth",
		// Legacy commands - THESE ARE ACTIVE
		SIGN_IN_LEGACY: "snapback.signIn",
		SIGN_OUT_LEGACY: "snapback.signOut",

		SHOW_STATUS_LEGACY: "snapback.showAuthStatus",
		CONNECT: "snapback.connect",
		// Test commands
		AUTHENTICATE: "snapback.authenticate",
		GET_AUTH_STATE: "snapback.getAuthState",
	},

	// Utility Commands
	UTILITY: {
		SHOW_OUTPUT: "snapback.showOutput",
		OPEN_DOCS: "snapback.openDocs",
		REPORT_ISSUE: "snapback.reportIssue",
		// Legacy/Existing commands
		INITIALIZE: "snapback.initialize",
		SHOW_STATUS: "snapback.showStatus",
		REFRESH_TREE: "snapback.refreshTree",
	},
} as const;

// Flat list for registration and iteration
export const ALL_COMMANDS = Object.values(COMMANDS).flatMap((category) => Object.values(category));

// Type helper for type-safe command IDs
export type CommandId = (typeof ALL_COMMANDS)[number];
