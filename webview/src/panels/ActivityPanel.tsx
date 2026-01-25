/**
 * ActivityPanel - Activity timeline and AI detection display
 *
 * Shows recent workspace activity including:
 * - Snapshot timeline
 * - AI detection events
 * - Restore history
 *
 * @packageDocumentation
 */

import { Card } from "@snapback/ui/components";
import type React from "react";
import { formatTimeOfDay, getEventIcon } from "../transforms";
import type { ActivityData, ActivityEvent } from "../types";

// =============================================================================
// TYPES
// =============================================================================

interface ActivityPanelProps {
	activity: ActivityData;
	onRestoreSnapshot: (snapshotId: string) => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

export const ActivityPanel: React.FC<ActivityPanelProps> = ({ activity, onRestoreSnapshot }) => {
	const { timeline, aiDetectionLog, todayEvents, yesterdayEvents, weekEvents } = activity;

	// Group events by date
	const groupedEvents = groupEventsByDate(timeline);

	return (
		<div className="p-6 bg-zinc-950 text-zinc-100 min-h-screen">
			{/* Summary Stats */}
			<div className="mb-6">
				<h3 className="text-sm font-semibold text-zinc-400 mb-3 uppercase tracking-wide">Activity Summary</h3>
				<div className="grid grid-cols-3 gap-4">
					<Card className="border-zinc-800 bg-zinc-900 p-4">
						<div className="text-2xl font-bold text-zinc-100">{todayEvents}</div>
						<div className="text-xs text-zinc-500">Today</div>
					</Card>
					<Card className="border-zinc-800 bg-zinc-900 p-4">
						<div className="text-2xl font-bold text-zinc-100">{yesterdayEvents}</div>
						<div className="text-xs text-zinc-500">Yesterday</div>
					</Card>
					<Card className="border-zinc-800 bg-zinc-900 p-4">
						<div className="text-2xl font-bold text-zinc-100">{weekEvents}</div>
						<div className="text-xs text-zinc-500">This Week</div>
					</Card>
				</div>
			</div>

			{/* AI Detection Log */}
			{aiDetectionLog.length > 0 && (
				<div className="mb-6">
					<h3 className="text-sm font-semibold text-zinc-400 mb-3 uppercase tracking-wide">
						AI Tools Detected
					</h3>
					<Card className="border-zinc-800 bg-zinc-900 p-4">
						<div className="space-y-2">
							{aiDetectionLog.map((entry) => (
								<div key={entry.tool} className="flex items-center justify-between">
									<div className="flex items-center gap-2">
										<span className="text-lg">✨</span>
										<span className="text-zinc-300">{entry.tool}</span>
									</div>
									<div className="text-right">
										<span className="text-sm text-zinc-400">{entry.sessions} sessions</span>
										<span className="text-xs text-zinc-500 ml-2">({entry.accuracy}% accuracy)</span>
									</div>
								</div>
							))}
						</div>
					</Card>
				</div>
			)}

			{/* Activity Timeline */}
			<div>
				<h3 className="text-sm font-semibold text-zinc-400 mb-3 uppercase tracking-wide">Timeline</h3>
				{timeline.length === 0 ? (
					<Card className="border-zinc-800 bg-zinc-900 p-6 text-center">
						<div className="text-zinc-500">No activity recorded yet</div>
						<div className="text-xs text-zinc-600 mt-1">
							Activity will appear here as you work with AI tools
						</div>
					</Card>
				) : (
					<div className="space-y-4">
						{Object.entries(groupedEvents).map(([dateGroup, events]) => (
							<div key={dateGroup}>
								<div className="text-xs font-medium text-zinc-500 mb-2 uppercase">{dateGroup}</div>
								<Card className="border-zinc-800 bg-zinc-900 divide-y divide-zinc-800">
									{events.map((event) => (
										<ActivityEventRow
											key={event.id}
											event={event}
											onRestore={
												event.type === "auto-snapshot"
													? () => onRestoreSnapshot(event.id)
													: undefined
											}
										/>
									))}
								</Card>
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
};

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

interface ActivityEventRowProps {
	event: ActivityEvent;
	onRestore?: () => void;
}

const ActivityEventRow: React.FC<ActivityEventRowProps> = ({ event, onRestore }) => {
	const icon = getEventIcon(event.type);
	const typeLabel = getEventTypeLabel(event.type);

	return (
		<div className="flex items-center justify-between p-3 hover:bg-zinc-800/50 transition-colors">
			<div className="flex items-center gap-3">
				<span className="text-lg">{icon}</span>
				<div>
					<div className="text-sm text-zinc-200">{event.file}</div>
					<div className="text-xs text-zinc-500">
						{typeLabel}
						{event.aiTool && ` • ${event.aiTool}`}
						{event.details && ` • ${event.details}`}
					</div>
				</div>
			</div>
			<div className="flex items-center gap-3">
				<span className="text-xs text-zinc-500">{formatTimeOfDay(event.timestamp)}</span>
				{onRestore && (
					<button
						type="button"
						onClick={onRestore}
						className="text-xs px-2 py-1 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-300 transition-colors"
					>
						Restore
					</button>
				)}
			</div>
		</div>
	);
};

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Group events by date (Today, Yesterday, Earlier)
 */
function groupEventsByDate(events: ActivityEvent[]): Record<string, ActivityEvent[]> {
	const groups: Record<string, ActivityEvent[]> = {};
	const todayStart = new Date().setHours(0, 0, 0, 0);
	const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;

	for (const event of events) {
		let group: string;
		if (event.timestamp >= todayStart) {
			group = "Today";
		} else if (event.timestamp >= yesterdayStart) {
			group = "Yesterday";
		} else {
			group = "Earlier";
		}

		if (!groups[group]) {
			groups[group] = [];
		}
		groups[group].push(event);
	}

	return groups;
}

/**
 * Get human-readable label for event type
 */
function getEventTypeLabel(type: ActivityEvent["type"]): string {
	switch (type) {
		case "ai-edit":
			return "AI Edit";
		case "manual-snapshot":
			return "Manual Snapshot";
		case "auto-snapshot":
			return "Auto Snapshot";
		case "restore":
			return "Restore";
		default:
			return "Event";
	}
}
