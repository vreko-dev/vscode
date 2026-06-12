import * as path from "node:path";
import type { SnapshotDisplayItem } from "../types";
import type { GroupingStrategy } from "./types";

/**
 * Groups snapshots by primary file (filename)
 * Useful when tracking changes to specific files across time
 */
export interface FileGroupedSnapshots {
	[fileName: string]: SnapshotDisplayItem[];
}

/**
 * Groups snapshots by the primary file that was changed
 * Groups by filename (e.g., "Button.tsx", "index.ts")
 */
export class FileGroupingStrategy implements GroupingStrategy<FileGroupedSnapshots> {
	readonly mode = "file" as const;

	group(snapshots: SnapshotDisplayItem[]): FileGroupedSnapshots {
		const grouped: FileGroupedSnapshots = {};

		for (const snap of snapshots) {
			// Use the primary file's basename as the group key
			const fileName = path.basename(snap.primaryFile);

			if (!grouped[fileName]) {
				grouped[fileName] = [];
			}
			grouped[fileName].push(snap);
		}

		// Sort groups alphabetically
		const sorted: FileGroupedSnapshots = {};
		for (const key of Object.keys(grouped).sort()) {
			sorted[key] = grouped[key];
		}

		return sorted;
	}

	getGroupLabel(groupKey: string): string {
		return groupKey;
	}

	getGroupIcon(groupKey: string): string {
		// Return appropriate icon based on file extension
		const ext = path.extname(groupKey).toLowerCase();
		switch (ext) {
			case ".ts":
			case ".tsx":
				return "$(file-code)";
			case ".js":
			case ".jsx":
				return "$(file-code)";
			case ".json":
				return "$(file-json)";
			case ".md":
				return "$(file-text)";
			case ".css":
			case ".scss":
			case ".less":
				return "$(file-code)";
			default:
				return "$(file)";
		}
	}

	isExpandedByDefault(_groupKey: string): boolean {
		// Keep all file groups collapsed by default (can be many)
		return false;
	}
}
