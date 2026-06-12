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

import * as vscode from "vscode";
import type { HeadMap } from "./headMap";
import { getFile } from "./headMap";

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
 * Real TombstoneTracker implementation
 * Listens to VS Code file deletion events and tracks pending deletions
 */
export class RealTombstoneTracker implements TombstoneTracker {
	private pendingDeletions: Map<string, PendingDeletion> = new Map();
	private disposables: vscode.Disposable[] = [];
	private headMap: HeadMap;

	constructor(context: vscode.ExtensionContext, headMap: HeadMap) {
		this.headMap = headMap;

		// Listen to file deletion events
		this.disposables.push(
			vscode.workspace.onWillDeleteFiles((e) => {
				for (const file of e.files) {
					const filePath = file.fsPath;
					// Look up prev blob from head-map
					const fileRef = getFile(headMap, filePath);
					const prevBlobHash = fileRef?.blobHash ?? null;
					this.recordDeletion(filePath, prevBlobHash);
				}
			}),
		);

		// Register disposables
		context.subscriptions.push(...this.disposables);
	}

	getPendingDeletions(): PendingDeletion[] {
		return Array.from(this.pendingDeletions.values());
	}

	recordDeletion(filePath: string, prevBlobHash: string | null): void {
		const deletion: PendingDeletion = {
			filePath,
			prevBlobHash,
			timestamp: Date.now(),
		};
		this.pendingDeletions.set(filePath, deletion);
	}

	flush(): void {
		this.pendingDeletions.clear();
	}

	dispose(): void {
		for (const disposable of this.disposables) {
			disposable.dispose();
		}
		this.disposables = [];
		this.pendingDeletions.clear();
	}
}

/**
 * Stub TombstoneTracker for demo - returns empty deletions
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
 * @param context - VS Code extension context for registering disposables
 * @param headMap - Head map for looking up file blob hashes
 * @param useReal - Whether to use the real implementation (default: true)
 */
export function createTombstoneTracker(
	context: vscode.ExtensionContext,
	headMap: HeadMap,
	useReal = true,
): TombstoneTracker {
	if (useReal) {
		return new RealTombstoneTracker(context, headMap);
	}
	return new StubTombstoneTracker();
}
