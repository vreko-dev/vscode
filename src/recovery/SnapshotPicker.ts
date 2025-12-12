import { logger } from "@snapback/infrastructure";

interface Snapshot {
	id: string;
	timestamp: number;
	files: string[];
	integrity?: boolean;
}

/**
 * SnapshotPicker provides snapshot selection with filtering and validation.
 */
export class SnapshotPicker {
	/**
	 * Filters snapshots by time range.
	 * Returns snapshots created within specified milliseconds from now.
	 */
	filterByTimeRange(snapshots: Snapshot[], rangeMs: number): Snapshot[] {
		const now = Date.now();
		const filtered = snapshots.filter((snap) => now - snap.timestamp <= rangeMs);
		logger.debug("SnapshotPicker: Filtered by time range", {
			total: snapshots.length,
			filtered: filtered.length,
		});
		return filtered;
	}

	/**
	 * Returns snapshots with file count metadata.
	 */
	getSnapshotsWithCounts(snapshots: Snapshot[]): Array<{
		id: string;
		count: number;
		timestamp: number;
	}> {
		return snapshots.map((snap) => ({
			id: snap.id,
			count: snap.files.length,
			timestamp: snap.timestamp,
		}));
	}

	/**
	 * Validates snapshot integrity before allowing restore.
	 */
	validateIntegrity(snapshot: Snapshot): boolean {
		if (!snapshot || !snapshot.id) {
			logger.warn("SnapshotPicker: Snapshot missing ID");
			return false;
		}

		if (!Array.isArray(snapshot.files)) {
			logger.warn("SnapshotPicker: Snapshot files not an array");
			return false;
		}

		if (snapshot.integrity === false) {
			logger.warn("SnapshotPicker: Snapshot integrity check failed");
			return false;
		}

		logger.debug("SnapshotPicker: Snapshot integrity valid");
		return true;
	}
}
