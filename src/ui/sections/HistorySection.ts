/**
 * HistorySection - Session/checkpoint history tree view section
 *
 * Reference: ai_dev_utils/resources/extension-ux/EXTENSION_UX_SPEC.md#section-3-history
 *
 * NOTE: Renamed from "Sessions" to "History" in UI for clarity.
 * Internal code can still use "Session" terminology.
 *
 * DESIGN PRINCIPLES:
 * - Show what can be rolled back (undoable signal)
 * - Compressed format: "5:52 AM • 1 file • 53s • ↩️"
 * - Grouped by date (Today, Yesterday, Earlier)
 *
 * GOTCHAS:
 * - Sessions with restore capability should show ↩️ badge
 * - Don't show empty sessions (0 files)
 * - Limit history depth for performance
 *
 * @packageDocumentation
 */

import * as vscode from "vscode";
import type { SessionFileInfo, SessionInfo, TreeItemContextValue } from "../ux-types";

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Maximum sessions to display per group
 */
// const MAX_SESSIONS_PER_GROUP = 10; // TODO: Implement pagination

/**
 * Maximum total sessions to load
 */
const MAX_TOTAL_SESSIONS = 50;

// =============================================================================
// TREE ITEM CREATION
// =============================================================================

/**
 * Create tree item for a session
 *
 * Format: "[Time] • [File count] • [Duration] • [Undoable badge]"
 * Example: "5:52 AM • 1 file • 53s • ↩️"
 *
 * @param session - Session info
 */
export function createSessionItem(session: SessionInfo): vscode.TreeItem {
	const time = formatSessionTime(session.timestamp);
	const files = `${session.fileCount} file${session.fileCount !== 1 ? "s" : ""}`;
	const duration = formatDuration(session.duration);
	const undoable = session.canRestore ? " • ↩️" : "";

	const item = new vscode.TreeItem(
		`${time} • ${files} • ${duration}${undoable}`,
		vscode.TreeItemCollapsibleState.Collapsed,
	);

	// Different context for restorable vs non-restorable
	item.contextValue = session.canRestore
		? ("session-restorable" satisfies TreeItemContextValue)
		: ("session" satisfies TreeItemContextValue);

	item.tooltip = createSessionTooltip(session);

	// HINT: Use iconPath for additional visual distinction
	// item.iconPath = new vscode.ThemeIcon(session.aiTool ? 'sparkle' : 'history');

	return item;
}

/**
 * Create tree item for a file within a session
 *
 * Format: "[Filename] (+[added], -[removed])"
 * Example: "Button.tsx (+12, -3)"
 */
export function createSessionFileItem(file: SessionFileInfo): vscode.TreeItem {
	const filename = file.path.split(/[/\\]/).pop() ?? file.path;
	const changes = `(+${file.linesAdded}, -${file.linesRemoved})`;

	const item = new vscode.TreeItem(`${filename} ${changes}`, vscode.TreeItemCollapsibleState.None);

	item.contextValue = "session-file" satisfies TreeItemContextValue;

	// Command to open diff view
	// TODO: Wire up to diff command
	// item.command = {
	//   command: 'snapback.showFileDiff',
	//   title: 'Show Changes',
	//   arguments: [file.snapshotId, file.path],
	// };

	item.tooltip = `Full path: ${file.path}`;

	return item;
}

/**
 * Create date group header for sessions
 */
export function createHistoryGroupItem(group: string, count: number): vscode.TreeItem {
	const item = new vscode.TreeItem(`${group} (${count})`, vscode.TreeItemCollapsibleState.Expanded);

	return item;
}

// =============================================================================
// FORMATTING HELPERS
// =============================================================================

/**
 * Format session timestamp
 *
 * For same day: "5:52 AM"
 * For other days: Relies on grouping (group header shows the day)
 */
function formatSessionTime(timestamp: number): string {
	const date = new Date(timestamp);
	return date.toLocaleTimeString("en-US", {
		hour: "numeric",
		minute: "2-digit",
		hour12: true,
	});
}

/**
 * Format duration in seconds to human-readable
 *
 * Examples: "53s", "2m 30s", "1h 5m"
 */
function formatDuration(seconds: number): string {
	if (seconds < 60) {
		return `${seconds}s`;
	}

	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = seconds % 60;

	if (minutes < 60) {
		return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
	}

	const hours = Math.floor(minutes / 60);
	const remainingMinutes = minutes % 60;

	return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

/**
 * Create tooltip for session
 */
function createSessionTooltip(session: SessionInfo): vscode.MarkdownString {
	const md = new vscode.MarkdownString();
	md.isTrusted = true;

	const date = new Date(session.timestamp);
	md.appendMarkdown(`**Session** - ${date.toLocaleString()}\n\n`);
	md.appendMarkdown(`Files: ${session.fileCount}\n`);
	md.appendMarkdown(`Duration: ${formatDuration(session.duration)}\n`);

	if (session.aiTool) {
		md.appendMarkdown(`AI Tool: ${session.aiTool}\n`);
	}

	if (session.canRestore) {
		md.appendMarkdown("\n*Click to expand, right-click to restore*");
	}

	return md;
}

// =============================================================================
// HISTORY SECTION PROVIDER
// =============================================================================

/**
 * History section data source
 *
 * INTEGRATION POINTS:
 * - Subscribe to SessionStore for session changes
 * - Load sessions from storage on activation
 *
 * TODO: Wire up to SessionStore
 */
export class HistorySection {
	private sessions: SessionInfo[] = [];
	private readonly _onDidChange = new vscode.EventEmitter<void>();
	readonly onDidChange = this._onDidChange.event;

	/**
	 * Add a new session
	 */
	addSession(session: SessionInfo): void {
		// Don't add empty sessions
		if (session.fileCount === 0) {
			return;
		}

		this.sessions.unshift(session);

		// Prune if over limit
		if (this.sessions.length > MAX_TOTAL_SESSIONS) {
			this.sessions = this.sessions.slice(0, MAX_TOTAL_SESSIONS);
		}

		this._onDidChange.fire();
	}

	/**
	 * Get all sessions
	 */
	getSessions(): SessionInfo[] {
		return this.sessions;
	}

	/**
	 * Get session by ID
	 */
	getSession(id: string): SessionInfo | undefined {
		return this.sessions.find((s) => s.id === id);
	}

	/**
	 * Group sessions by date
	 *
	 * Returns: Map<"Today" | "Yesterday" | "Earlier", SessionInfo[]>
	 */
	getGroupedSessions(): Map<string, SessionInfo[]> {
		const groups = new Map<string, SessionInfo[]>();
		const now = new Date();
		const today = startOfDay(now);
		const yesterday = new Date(today);
		yesterday.setDate(yesterday.getDate() - 1);

		for (const session of this.sessions) {
			const sessionDate = startOfDay(new Date(session.timestamp));
			let group: string;

			if (sessionDate.getTime() === today.getTime()) {
				group = "Today";
			} else if (sessionDate.getTime() === yesterday.getTime()) {
				group = "Yesterday";
			} else {
				group = "Earlier";
			}

			if (!groups.has(group)) {
				groups.set(group, []);
			}
			groups.get(group)!.push(session);
		}

		return groups;
	}

	/**
	 * Get restorable sessions only
	 *
	 * HINT: Use for "Undo AI Session" command
	 */
	getRestorableSessions(): SessionInfo[] {
		return this.sessions.filter((s) => s.canRestore);
	}

	/**
	 * Mark session as restored (no longer restorable)
	 */
	markRestored(sessionId: string): void {
		const session = this.sessions.find((s) => s.id === sessionId);
		if (session) {
			session.canRestore = false;
			this._onDidChange.fire();
		}
	}

	/**
	 * Delete session
	 */
	deleteSession(sessionId: string): void {
		const index = this.sessions.findIndex((s) => s.id === sessionId);
		if (index !== -1) {
			this.sessions.splice(index, 1);
			this._onDidChange.fire();
		}
	}

	/**
	 * Load from storage
	 *
	 * TODO: Implement persistence via SessionStore
	 */
	async load(): Promise<void> {
		// TODO: Load from SessionStore
		// const stored = await this.sessionStore.getRecentSessions();
		// this.sessions = stored;
		// this._onDidChange.fire();
	}

	get totalCount(): number {
		return this.sessions.length;
	}

	dispose(): void {
		this._onDidChange.dispose();
	}
}

/**
 * Get start of day
 */
function startOfDay(date: Date): Date {
	const result = new Date(date);
	result.setHours(0, 0, 0, 0);
	return result;
}

// =============================================================================
// MOCK DATA FOR DEVELOPMENT
// =============================================================================

/**
 * Create mock sessions for development
 *
 * TODO: Remove before production
 */
export function createMockSessions(): SessionInfo[] {
	const now = Date.now();
	const hour = 3600000;
	const day = 24 * hour;

	return [
		{
			id: "sess-1",
			timestamp: now - 1 * hour,
			duration: 53,
			fileCount: 1,
			canRestore: true,
			aiTool: "Cursor",
			files: [{ path: "Button.tsx", snapshotId: "snap-1", linesAdded: 12, linesRemoved: 3 }],
		},
		{
			id: "sess-2",
			timestamp: now - 3 * hour,
			duration: 69,
			fileCount: 1,
			canRestore: true,
			files: [{ path: "Form.tsx", snapshotId: "snap-2", linesAdded: 45, linesRemoved: 0 }],
		},
		{
			id: "sess-3",
			timestamp: now - day - 2 * hour,
			duration: 73,
			fileCount: 247,
			canRestore: false, // Old session, not restorable
			files: [
				{ path: "index.ts", snapshotId: "snap-3", linesAdded: 100, linesRemoved: 50 },
				// ... more files
			],
		},
	];
}
