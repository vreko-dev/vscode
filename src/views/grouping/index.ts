import type { GroupingMode } from "../types.js";
import { TimeGroupingStrategy } from "./TimeGroupingStrategy.js";
import type { GroupingStrategy } from "./types.js";

export { TimeGroupingStrategy } from "./TimeGroupingStrategy.js";
export * from "./types.js";

/**
 * Factory to get the appropriate grouping strategy
 */
export function getGroupingStrategy(
	mode: GroupingMode,
): GroupingStrategy<unknown> {
	switch (mode) {
		case "time":
			return new TimeGroupingStrategy();
		case "system":
		case "file":
			// Not implemented yet - fall back to time
			throw new Error(`${mode} grouping not implemented yet`);
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
		{ mode: "system", label: "By System", enabled: false }, // Coming soon
		{ mode: "file", label: "By File", enabled: false }, // Coming soon
	];
}
