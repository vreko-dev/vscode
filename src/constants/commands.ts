/**
 * All SnapBack commands following VS Code naming conventions
 * Pattern: snapback.{category}.{action}
 *
 * IMPORTANT: This file maps BOTH legacy and new command structures.
 * Legacy commands (snapback.createSnapshot) are maintained for backward compatibility.
 * New commands (snapback.snapshot.create) follow the organized structure.
 * This file provides a single source of truth for command IDs used in code.
 */

export const COMMANDS = {
	// Protection Commands
	PROTECTION: {
		SET_LEVEL: "snapback.protection.setLevel",
		SET_WATCH: "snapback.protection.watch",
		SET_WARN: "snapback.protection.warn",
		SET_BLOCK: "snapback.protection.block",
		REMOVE: "snapback.protection.remove",
		PROTECT_WORKSPACE: "snapback.protection.workspace",
		PROTECT_FOLDER: "snapback.protection.folder",
		// Legacy commands (maintain backward compatibility)
		PROTECT_FILE: "snapback.protectFile",
		PROTECT_CURRENT_FILE: "snapback.protectCurrentFile",
		UNPROTECT_FILE: "snapback.unprotectFile",
		CHANGE_LEVEL: "snapback.changeProtectionLevel",
		SHOW_ALL: "snapback.showAllProtectedFiles",
		PROTECT_REPO: "snapback.protectEntireRepo",
	},

	// Snapshot Commands
	SNAPSHOT: {
		CREATE: "snapback.snapshot.create",
		LIST: "snapback.snapshot.list",
		COMPARE: "snapback.snapshot.compare",
		RESTORE: "snapback.snapshot.restore",
		DELETE: "snapback.snapshot.delete",
		// Legacy commands (maintain backward compatibility)
		CREATE_LEGACY: "snapback.createSnapshot",
		RESTORE_LEGACY: "snapback.snapBack",
		SHOW_ALL: "snapback.showAllSnapshots",
		VIEW: "snapback.viewSnapshot",
	},

	// Session Commands
	SESSION: {
		LIST: "snapback.session.list",
		RESTORE: "snapback.session.restore",
		EXPORT: "snapback.session.export",
	},

	// View Commands
	VIEW: {
		SHOW_SIDEBAR: "snapback.view.sidebar",
		SHOW_HISTORY: "snapback.view.history",
		SHOW_SETTINGS: "snapback.view.settings",
		REFRESH: "snapback.view.refresh",
		// Legacy commands
		REFRESH_LEGACY: "snapback.refreshViews",
		REFRESH_DASHBOARD: "snapback.refreshSafetyDashboard",
		OPEN_WALKTHROUGH: "snapback.openWalkthrough",
		OPEN_DOCS: "snapback.openDocumentation",
	},

	// Account Commands
	ACCOUNT: {
		SIGN_IN: "snapback.account.signIn",
		SIGN_OUT: "snapback.account.signOut",
		SHOW_STATUS: "snapback.account.status",
		// Legacy commands
		SIGN_IN_LEGACY: "snapback.signIn",
		SIGN_OUT_LEGACY: "snapback.signOut",
		SHOW_STATUS_LEGACY: "snapback.showAuthStatus",
		CONNECT: "snapback.connect",
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
export const ALL_COMMANDS = Object.values(COMMANDS).flatMap((category) =>
	Object.values(category),
);

// Type helper for type-safe command IDs
export type CommandId = (typeof ALL_COMMANDS)[number];
