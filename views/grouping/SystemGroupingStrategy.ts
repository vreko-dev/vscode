import type { SnapshotDisplayItem } from "../types";
import type { GroupingStrategy } from "./types";

/**
 * Groups snapshots by system (e.g., apps/web, packages/sdk)
 * Uses detectedSystem field or extracts from primaryFile path
 */
export interface SystemGroupedSnapshots {
	[systemName: string]: SnapshotDisplayItem[];
}

/**
 * Groups snapshots by system/directory
 * Extracts system name from file paths (e.g., "apps/web", "packages/sdk")
 */
export class SystemGroupingStrategy implements GroupingStrategy<SystemGroupedSnapshots> {
	readonly mode = "system" as const;

	group(snapshots: SnapshotDisplayItem[]): SystemGroupedSnapshots {
		const grouped: SystemGroupedSnapshots = {};

		for (const snap of snapshots) {
			// Use detectedSystem if available, otherwise extract from path
			const system = snap.detectedSystem ?? this.extractSystem(snap.primaryFile);

			if (!grouped[system]) {
				grouped[system] = [];
			}
			grouped[system].push(snap);
		}

		// Sort groups alphabetically
		const sorted: SystemGroupedSnapshots = {};
		for (const key of Object.keys(grouped).sort()) {
			sorted[key] = grouped[key];
		}

		return sorted;
	}

	/**
	 * Extract system name from file path
	 * Examples:
	 * - "apps/web/src/components/Button.tsx" -> "apps/web"
	 * - "packages/sdk/src/index.ts" -> "packages/sdk"
	 * - "src/utils/helpers.ts" -> "src"
	 */
	private extractSystem(filePath: string): string {
		const parts = filePath.split(/[/\\]/);

		// Look for common patterns like apps/*, packages/*, services/*
		for (let i = 0; i < parts.length - 1; i++) {
			const dir = parts[i].toLowerCase();
			if (
				dir === "apps" ||
				dir === "packages" ||
				dir === "services" ||
				dir === "libs" ||
				dir === "modules" ||
				dir === "projects"
			) {
				// Return the directory + next subdirectory (e.g., "apps/web")
				if (i + 1 < parts.length) {
					return `${parts[i]}/${parts[i + 1]}`;
				}
			}
		}

		// Fallback: return first directory or "root"
		if (parts.length > 1) {
			return parts[0];
		}

		return "root";
	}

	getGroupLabel(groupKey: string): string {
		return groupKey;
	}

	getGroupIcon(_groupKey: string): string {
		return "$(folder)";
	}

	isExpandedByDefault(groupKey: string): boolean {
		// Expand first group by default
		return groupKey !== "root";
	}
}
