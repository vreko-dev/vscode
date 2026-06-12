import type { GroupingMode } from "../types";
import { FileGroupingStrategy } from "./FileGroupingStrategy";
import { SystemGroupingStrategy } from "./SystemGroupingStrategy";
import { TimeGroupingStrategy } from "./TimeGroupingStrategy";
import type { GroupingStrategy } from "./types";

export { FileGroupingStrategy } from "./FileGroupingStrategy";
export { SystemGroupingStrategy } from "./SystemGroupingStrategy";
export { TimeGroupingStrategy } from "./TimeGroupingStrategy";
export * from "./types";

/**
 * Factory to get the appropriate grouping strategy
 */
export function getGroupingStrategy(mode: GroupingMode): GroupingStrategy<unknown> {
	switch (mode) {
		case "time":
			return new TimeGroupingStrategy();
		case "system":
			return new SystemGroupingStrategy();
		case "file":
			return new FileGroupingStrategy();
		default:
			return new TimeGroupingStrategy();
	}
}

/**
 * Get available grouping modes (for UI dropdown)
 */
export function getAvailableGroupingModes(): Array<{
	mode: GroupingMode;
	label: string;
	enabled: boolean;
}> {
	return [
		{ mode: "time", label: "By Time", enabled: true },
		{ mode: "system", label: "By System", enabled: true },
		{ mode: "file", label: "By File", enabled: true },
	];
}
