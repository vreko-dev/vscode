/**
 * ActivitySection - Event log tree view section
 *
 * Reference: ai_dev_utils/resources/extension-ux/EXTENSION_UX_SPEC.md#section-1-activity
 *
 * DESIGN PRINCIPLES:
 * - Event-first, not config-first (show what happened, not what's configured)
 * - Icons represent TYPE, not source (source goes in tooltip)
 * - Grouped by date: Today, Yesterday, Earlier
 * - File name is the visual anchor (easy to scan)
 *
 * ROW FORMAT:
 * ```
 * [Icon] [Event Type] — [File] • [Time]
 * ✨ AI Edit — Button.tsx • 2h
 * ```
 *
 * GOTCHAS:
 * - Don't use dynamic time labels like "2 hours ago" in row text (causes jumping)
 * - Use stable grouping keys (Today/Yesterday/Earlier), not relative dates
 * - Limit displayed events to prevent performance issues (max ~50)
 *
 * @packageDocumentation
 */

import * as vscode from "vscode";
import type { ActivityEvent, ActivityEventType, ActivityGroup, TreeItemContextValue } from "../ux-types";
import { EVENT_ICONS } from "../ux-types";

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Maximum events to display per group
 *
 * HINT: Too many events hurts tree view performance
 */
// const MAX_EVENTS_PER_GROUP = 20; // TODO: Implement pagination

/**
 * Maximum total events to keep in memory
 */
const MAX_TOTAL_EVENTS = 100;

// =============================================================================
// TREE ITEM CREATION
// =============================================================================

/**
 * Create tree item for an activity event
 *
 * @param event - The activity event
 * @returns TreeItem configured for display
 *
 * HINT: Use command property to make item clickable
 */
export function createActivityEventItem(event: ActivityEvent): vscode.TreeItem {
	const icon = EVENT_ICONS[event.type];
	const label = formatEventLabel(event);
	const time = formatCompactTime(event.timestamp);

	const item = new vscode.TreeItem(`${icon} ${label} • ${time}`, vscode.TreeItemCollapsibleState.None);

	// Context value for menu filtering
	item.contextValue = "activity-event" satisfies TreeItemContextValue;

	// Tooltip with full details
	item.tooltip = createEventTooltip(event);

	// TODO: Add command to show event details or open diff
	// item.command = {
	//   command: 'snapback.showEventDetails',
	//   title: 'Show Details',
	//   arguments: [event.id],
	// };

	return item;
}

/**
 * Create tree item for a date group header
 *
 * @param group - The group name (Today, Yesterday, Earlier)
 * @param count - Number of events in group
 * @param collapsed - Initial collapsed state
 */
export function createActivityGroupItem(group: ActivityGroup, count: number, collapsed = false): vscode.TreeItem {
	const item = new vscode.TreeItem(
		`${group} (${count})`,
		collapsed ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.Expanded,
	);

	item.contextValue = "activity-group" satisfies TreeItemContextValue;

	return item;
}

// =============================================================================
// FORMATTING HELPERS
// =============================================================================

/**
 * Format event label (without time)
 *
 * Format: "[Event Type] — [File/Count]"
 * Example: "AI Edit — Button.tsx"
 *
 * GOTCHA: Use em dash (—) not hyphen (-)
 */
function formatEventLabel(event: ActivityEvent): string {
	const typeLabel = getEventTypeLabel(event.type);
	const target = event.file ? truncateFileName(event.file) : `${event.fileCount} files`;

	return `${typeLabel} — ${target}`;
}

/**
 * Get human-readable label for event type
 */
function getEventTypeLabel(type: ActivityEventType): string {
	const labels: Record<ActivityEventType, string> = {
		"ai-edit": "AI Edit",
		"manual-snapshot": "Snapshot",
		"auto-snapshot": "Auto",
		restore: "Restored",
		"config-change": "Config updated",
	};
	return labels[type];
}

/**
 * Format timestamp as compact relative time
 *
 * Format: "2h", "5m", "3d"
 *
 * GOTCHA: Keep format stable to avoid tree item jumping
 */
function formatCompactTime(timestamp: number): string {
	const now = Date.now();
	const diff = now - timestamp;

	const minutes = Math.floor(diff / 60000);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);

	if (days > 0) return `${days}d`;
	if (hours > 0) return `${hours}h`;
	if (minutes > 0) return `${minutes}m`;
	return "now";
}

/**
 * Truncate file name for display
 *
 * Shows just the filename, not full path
 */
function truncateFileName(path: string): string {
	const parts = path.split(/[/\\]/);
	return parts[parts.length - 1];
}

/**
 * Create rich tooltip for event
 *
 * HINT: Include source info here (not in main label)
 */
function createEventTooltip(event: ActivityEvent): vscode.MarkdownString {
	const md = new vscode.MarkdownString();
	md.isTrusted = true;

	const typeLabel = getEventTypeLabel(event.type);
	md.appendMarkdown(`**${typeLabel}**\n\n`);

	if (event.file) {
		md.appendMarkdown(`File: \`${event.file}\`\n`);
	}
	if (event.fileCount) {
		md.appendMarkdown(`Files: ${event.fileCount}\n`);
	}
	if (event.source) {
		md.appendMarkdown(`Source: ${event.source}\n`);
	}
	if (event.linesChanged) {
		md.appendMarkdown(`Lines changed: ${event.linesChanged}\n`);
	}

	// Full timestamp
	const date = new Date(event.timestamp);
	md.appendMarkdown(`\nTime: ${date.toLocaleString()}`);

	return md;
}

// =============================================================================
// EVENT GROUPING
// =============================================================================

/**
 * Group events by date
 *
 * @param events - Events to group
 * @returns Map of group name to events
 *
 * GOTCHA: Use stable keys (Today/Yesterday/Earlier), not dynamic dates
 */
export function groupEventsByDate(events: ActivityEvent[]): Map<ActivityGroup, ActivityEvent[]> {
	const groups = new Map<ActivityGroup, ActivityEvent[]>();
	const now = new Date();
	const today = startOfDay(now);
	const yesterday = new Date(today);
	yesterday.setDate(yesterday.getDate() - 1);

	for (const event of events) {
		const eventDate = startOfDay(new Date(event.timestamp));
		let group: ActivityGroup;

		if (eventDate.getTime() === today.getTime()) {
			group = "Today";
		} else if (eventDate.getTime() === yesterday.getTime()) {
			group = "Yesterday";
		} else {
			group = "Earlier";
		}

		if (!groups.has(group)) {
			groups.set(group, []);
		}
		groups.get(group)!.push(event);
	}

	// Sort events within each group (newest first)
	for (const [, groupEvents] of groups) {
		groupEvents.sort((a, b) => b.timestamp - a.timestamp);
	}

	return groups;
}

/**
 * Get start of day for a date
 */
function startOfDay(date: Date): Date {
	const result = new Date(date);
	result.setHours(0, 0, 0, 0);
	return result;
}

// =============================================================================
// ACTIVITY SECTION PROVIDER
// =============================================================================

/**
 * Activity section data source
 *
 * INTEGRATION POINTS:
 * - Subscribe to SnapshotStore events for new snapshots
 * - Subscribe to SessionCoordinator for AI detection
 * - Subscribe to RestoreService for restore events
 *
 * TODO: Wire up to actual data sources
 */
export class ActivitySection {
	private events: ActivityEvent[] = [];
	private readonly _onDidChange = new vscode.EventEmitter<void>();
	readonly onDidChange = this._onDidChange.event;

	/**
	 * Add a new event
	 *
	 * @param event - Event to add
	 *
	 * HINT: Events are auto-sorted by timestamp (newest first)
	 */
	addEvent(event: ActivityEvent): void {
		this.events.unshift(event);

		// Prune if over limit
		if (this.events.length > MAX_TOTAL_EVENTS) {
			this.events = this.events.slice(0, MAX_TOTAL_EVENTS);
		}

		this._onDidChange.fire();
	}

	/**
	 * Get grouped events for tree display
	 */
	getGroupedEvents(): Map<ActivityGroup, ActivityEvent[]> {
		return groupEventsByDate(this.events);
	}

	/**
	 * Get total event count
	 */
	get totalCount(): number {
		return this.events.length;
	}

	/**
	 * Clear all events
	 *
	 * HINT: Use for "Clear Activity" action
	 */
	clear(): void {
		this.events = [];
		this._onDidChange.fire();
	}

	/**
	 * Load events from persistent storage
	 *
	 * TODO: Implement persistence
	 */
	async load(): Promise<void> {
		// TODO: Load from AuditLog or similar
		// const stored = await this.storage.getActivityEvents();
		// this.events = stored;
		// this._onDidChange.fire();
	}

	dispose(): void {
		this._onDidChange.dispose();
	}
}

// =============================================================================
// MOCK DATA FOR DEVELOPMENT
// =============================================================================

/**
 * Create mock events for development/testing
 *
 * TODO: Remove before production
 */
export function createMockEvents(): ActivityEvent[] {
	const now = Date.now();
	const hour = 3600000;
	const day = 24 * hour;

	return [
		{
			id: "evt-1",
			type: "ai-edit",
			timestamp: now - 2 * hour,
			file: "Button.tsx",
			source: "Cursor",
			linesChanged: 127,
		},
		{
			id: "evt-2",
			type: "manual-snapshot",
			timestamp: now - 4 * hour,
			file: "Form.tsx",
			trigger: "manual",
		},
		{
			id: "evt-3",
			type: "restore",
			timestamp: now - 6 * hour,
			fileCount: 247,
		},
		{
			id: "evt-4",
			type: "ai-edit",
			timestamp: now - day - 2 * hour,
			file: "hooks/useAuth.ts",
			source: "Copilot",
			linesChanged: 45,
		},
		{
			id: "evt-5",
			type: "config-change",
			timestamp: now - day - 4 * hour,
		},
		{
			id: "evt-6",
			type: "auto-snapshot",
			timestamp: now - 2 * day,
			file: "config.ts",
			trigger: "burst",
		},
	];
}
