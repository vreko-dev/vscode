import { createHash } from "node:crypto";

/**
 * Snapshot deduplication service
 *
 * This service helps reduce storage usage by identifying and replacing
 * duplicate snapshots with references to existing ones.
 */

/**
 * Interface representing a file's state at a specific snapshot
 */
export interface FileState {
	path: string;
	content: string;
	hash: string;
}

/**
 * Interface representing a complete snapshot state
 */
export interface SnapshotState {
	id: string;
	timestamp: number;
	files: FileState[];
}

/**
 * Default maximum cache size for hash storage
 */
const DEFAULT_MAX_CACHE_SIZE = 500;

/**
 * SnapshotDeduplicator - Hash-based state comparison for snapshot deduplication
 *
 * This class provides O(1) duplicate detection using SHA-256 hashing and Map-based caching.
 * It enables efficient detection of duplicate snapshot states by comparing file content hashes
 * instead of performing full content comparisons.
 *
 * Key features:
 * - Hash-based state comparison using SHA-256
 * - O(1) duplicate detection with Map-based cache
 * - Order-independent file comparison (sorts files by path)
 * - Timestamp-agnostic comparison (only content matters)
 * - FIFO cache eviction when cache size limit is reached
 * - Zero external dependencies (only Node.js native modules)
 *
 * Performance characteristics:
 * - 1000 comparisons < 100ms
 * - Hash calculation < 10ms
 * - Memory bounded by maxCacheSize parameter
 *
 * @example
 * ```typescript
 * const deduplicator = new SnapshotDeduplicator(500);
 *
 * // First snapshot - no duplicate
 * const state1 = {
 *   id: 'snapshot-1',
 *   timestamp: Date.now(),
 *   files: [{ path: '/file.ts', content: 'code', hash: '...' }]
 * };
 * const result1 = deduplicator.findDuplicate(state1); // null
 *
 * // Second snapshot with same content - duplicate detected
 * const state2 = {
 *   id: 'snapshot-2',
 *   timestamp: Date.now() + 1000,
 *   files: [{ path: '/file.ts', content: 'code', hash: '...' }]
 * };
 * const result2 = deduplicator.findDuplicate(state2); // 'snapshot-1'
 * ```
 */
export class SnapshotDeduplicator {
	/**
	 * Cache mapping state hashes to snapshot IDs
	 * Key: SHA-256 hash of snapshot state
	 * Value: Snapshot ID
	 */
	private readonly stateHashCache: Map<string, string>;

	/**
	 * Tracks insertion order for FIFO eviction
	 */
	private insertionOrder: string[];

	/**
	 * Maximum number of hashes to cache
	 */
	private readonly maxCacheSize: number;

	/**
	 * Creates a new SnapshotDeduplicator instance
	 *
	 * @param maxCacheSize Maximum number of state hashes to cache (default: 500)
	 *
	 * @example
	 * ```typescript
	 * // Default cache size (500)
	 * const deduplicator = new SnapshotDeduplicator();
	 *
	 * // Custom cache size
	 * const deduplicator = new SnapshotDeduplicator(1000);
	 * ```
	 */
	constructor(maxCacheSize: number = DEFAULT_MAX_CACHE_SIZE) {
		this.stateHashCache = new Map<string, string>();
		this.insertionOrder = [];
		this.maxCacheSize = Math.max(0, maxCacheSize); // Ensure non-negative
	}

	/**
	 * Finds a duplicate snapshot for the given state
	 *
	 * This method:
	 * 1. Generates a hash for the incoming snapshot state
	 * 2. Checks if the hash already exists in the cache
	 * 3. If found, returns the original snapshot ID
	 * 4. If not found, caches the new state and returns null
	 *
	 * The hash is computed by:
	 * - Sorting files by path (order-independent comparison)
	 * - Combining all file hashes into a single state hash
	 * - Using SHA-256 for cryptographic strength
	 *
	 * @param state The snapshot state to check for duplicates
	 * @returns The snapshot ID of the duplicate if found, null otherwise
	 *
	 * @example
	 * ```typescript
	 * const state = {
	 *   id: 'snapshot-123',
	 *   timestamp: Date.now(),
	 *   files: [{ path: '/app.ts', content: 'code', hash: '...' }]
	 * };
	 *
	 * const duplicateId = deduplicator.findDuplicate(state);
	 * if (duplicateId) {
	 *   logger.info(`Duplicate of snapshot: ${duplicateId}`);
	 * } else {
	 *   logger.info('Unique snapshot');
	 * }
	 * ```
	 */
	findDuplicate(state: SnapshotState): string | null {
		// Generate hash for the state
		const stateHash = this.generateStateHash(state);

		// Check if we've seen this state before
		if (this.stateHashCache.has(stateHash)) {
			// Return the original snapshot ID
			return this.stateHashCache.get(stateHash) as string;
		}

		// New unique state - add to cache
		this.addToCache(stateHash, state.id);

		return null;
	}

	/**
	 * Clears all cached state hashes
	 *
	 * This method removes all entries from the cache and resets the insertion order.
	 * Use this to free memory or reset the deduplicator state.
	 *
	 * @example
	 * ```typescript
	 * deduplicator.clear();
	 * console.log(deduplicator.getCacheSize()); // 0
	 * ```
	 */
	clear(): void {
		this.stateHashCache.clear();
		this.insertionOrder = [];
	}

	/**
	 * Returns the current number of cached state hashes
	 *
	 * @returns The number of entries in the cache
	 *
	 * @example
	 * ```typescript
	 * console.log(`Cache contains ${deduplicator.getCacheSize()} entries`);
	 * ```
	 */
	getCacheSize(): number {
		return this.stateHashCache.size;
	}

	/**
	 * Generates a SHA-256 hash for a snapshot state
	 *
	 * The hash is computed by:
	 * 1. Sorting files by path (ensures order-independent comparison)
	 * 2. Concatenating path:hash pairs for all files
	 * 3. Computing SHA-256 hash of the concatenated string
	 *
	 * Timestamps are intentionally excluded to ensure that snapshots
	 * with identical content but different timestamps are treated as duplicates.
	 *
	 * @param state The snapshot state to hash
	 * @returns SHA-256 hash of the state as a hex string
	 * @private
	 */
	private generateStateHash(state: SnapshotState): string {
		// Sort files by path for order-independent hashing
		const sortedFiles = [...state.files].sort((a, b) =>
			a.path.localeCompare(b.path),
		);

		// Combine all file path:hash pairs
		const combinedData = sortedFiles
			.map((file) => `${file.path}:${file.hash}`)
			.join("|");

		// Generate SHA-256 hash
		return createHash("sha256").update(combinedData).digest("hex");
	}

	/**
	 * Adds a state hash to the cache with FIFO eviction
	 *
	 * If the cache is at maximum capacity, the oldest entry is evicted
	 * before adding the new entry. This ensures the cache never exceeds
	 * the configured maximum size.
	 *
	 * @param stateHash The hash of the snapshot state
	 * @param snapshotId The snapshot ID to associate with this hash
	 * @private
	 */
	private addToCache(stateHash: string, snapshotId: string): void {
		// Enforce cache size limit
		if (
			this.stateHashCache.size >= this.maxCacheSize &&
			this.maxCacheSize > 0
		) {
			this.evictOldest();
		}

		// Add to cache
		this.stateHashCache.set(stateHash, snapshotId);
		this.insertionOrder.push(stateHash);
	}

	/**
	 * Evicts the oldest entry from the cache (FIFO)
	 *
	 * This method removes the first entry added to the cache,
	 * maintaining FIFO eviction policy.
	 *
	 * @private
	 */
	private evictOldest(): void {
		if (this.insertionOrder.length === 0) {
			return;
		}

		// Get the oldest hash (first in insertion order)
		const oldestHash = this.insertionOrder.shift();

		if (oldestHash !== undefined) {
			this.stateHashCache.delete(oldestHash);
		}
	}
}
