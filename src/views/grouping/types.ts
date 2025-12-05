import type { GroupingMode, SnapshotDisplayItem } from "../types.js";

/**
 * Strategy interface for grouping snapshots
 */
export interface GroupingStrategy<T> {
	/** The mode this strategy handles */
	readonly mode: GroupingMode;

	/** Group snapshots according to this strategy */
	group(snapshots: SnapshotDisplayItem[]): T;

	/** Get display label for a group */
	getGroupLabel(groupKey: string): string;

	/** Get icon for a group */
	getGroupIcon(groupKey: string): string;

	/** Check if group should be expanded by default */
	isExpandedByDefault(groupKey: string): boolean;
}
