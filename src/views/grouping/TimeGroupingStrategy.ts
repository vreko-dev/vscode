import type {
	SnapshotDisplayItem,
	TimeGroup,
	TimeGroupedSnapshots,
} from "../types.js";
import type { GroupingStrategy } from "./types.js";

/**
 * Groups snapshots by time (Today, Yesterday, This Week, Older)
 * This is the DEFAULT and ONLY implemented strategy for now.
 */
export class TimeGroupingStrategy
	implements GroupingStrategy<TimeGroupedSnapshots>
{
	readonly mode = "time" as const;

	group(snapshots: SnapshotDisplayItem[]): TimeGroupedSnapshots {
		const now = new Date();
		const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
		const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
		const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

		const grouped: TimeGroupedSnapshots = {
			recent: [],
			yesterday: [],
			thisWeek: [],
			older: [],
		};

		for (const snap of snapshots) {
			const snapDate = snap.timestamp;

			if (snapDate >= today) {
				grouped.recent.push(snap);
			} else if (snapDate >= yesterday) {
				grouped.yesterday.push(snap);
			} else if (snapDate >= weekAgo) {
				grouped.thisWeek.push(snap);
			} else {
				grouped.older.push(snap);
			}
		}

		return grouped;
	}

	getGroupLabel(groupKey: TimeGroup): string {
		switch (groupKey) {
			case "recent":
				return "RECENT";
			case "yesterday":
				return "YESTERDAY";
			case "this-week":
				return "THIS WEEK";
			case "older":
				return "OLDER";
		}
	}

	getGroupIcon(_groupKey: TimeGroup): string {
		// Time groups don't need icons - the label is sufficient
		return "";
	}

	isExpandedByDefault(groupKey: TimeGroup): boolean {
		// Only expand "recent" by default
		return groupKey === "recent";
	}
}
