/**
 * TombstoneTracker - Tracks pending file deletions for snapshot manifests
 *
 * When files are deleted between checkpoints, we need to record them
 * so they can be included in the next POST manifest's `deletions` field.
 * This enables accurate deleted-file recovery during rollback.
 *
 * v1 Strategy (event-based):
 * 1. Listen to workspace.onWillDeleteFiles
 * 2. On delete event, look up prev blob from head-map
 * 3. Record pending deletion with prevBlobHash
 * 4. On next POST, flush pending deletions into manifest.deletions
 *
 * @see spec.json: tombstone_tracking_v1
 */

/** Pending deletion entry for a file */
export interface PendingDeletion {
	/** Relative path of the deleted file */
	filePath: string;
	/** Hash of the last known content (from head-map) */
	prevBlobHash: string | null;
	/** Timestamp when deletion was detected */
	timestamp: number;
}

/**
 * TombstoneTracker interface - tracks pending file deletions
 */
export interface TombstoneTracker {
	/**
	 * Get all pending deletions to include in next POST manifest
	 */
	getPendingDeletions(): PendingDeletion[];

	/**
	 * Record a file deletion event
	 * @param filePath - Path of the deleted file
	 * @param prevBlobHash - Hash of the last known content (from head-map)
	 */
	recordDeletion(filePath: string, prevBlobHash: string | null): void;

	/**
	 * Clear pending deletions after they've been flushed to a POST manifest
	 */
	flush(): void;

	/**
	 * Dispose the tracker
	 */
	dispose(): void;
}

/**
 * Stub TombstoneTracker for demo - returns empty deletions
 *
 * TODO(post-demo): Replace with real TombstoneTracker (p2t3)
 *   - Listen to workspace.onWillDeleteFiles
 *   - Lookup prevBlobHash from head-map
 *   - Integrate with createPOST flow
 */
export class StubTombstoneTracker implements TombstoneTracker {
	getPendingDeletions(): PendingDeletion[] {
		return [];
	}

	recordDeletion(_filePath: string, _prevBlobHash: string | null): void {
		// No-op for demo
	}

	flush(): void {
		// No-op for demo
	}

	dispose(): void {
		// No-op for demo
	}
}

/**
 * Factory function to create a TombstoneTracker
 *
 * For demo, returns stub. Post-demo, will return real implementation.
 */
export function createTombstoneTracker(): TombstoneTracker {
	// TODO(post-demo): Return real TombstoneTracker
	return new StubTombstoneTracker();
}
