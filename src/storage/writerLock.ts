/**
 * @fileoverview WriterLock - Single Writer Guarantee for PRW Storage
 *
 * Per spec.json:
 * - path: "locks/writer.lock"
 * - requirement: "All writes to manifests/state/index/head-map must hold the lock"
 *
 * Implementation follows TDD_CORE.md GREEN phase - minimal implementation
 */

import { randomUUID } from "node:crypto";

/**
 * Error thrown when lock acquisition fails
 */
export class LockAcquisitionError extends Error {
	constructor(message = "Failed to acquire writer lock") {
		super(message);
		this.name = "LockAcquisitionError";
	}
}

/**
 * Options for lock acquisition
 */
export interface AcquireOptions {
	/** Timeout in milliseconds before giving up */
	timeoutMs?: number;
}

/**
 * In-memory writer lock for single-writer guarantee.
 *
 * This is a memory-based lock suitable for single-process scenarios.
 * For multi-process coordination, a file-based lock would be needed.
 *
 * Uses a queue-based approach to serialize concurrent callers.
 *
 * TODO(v2): Implement file-based lock for cross-process safety.
 * Current mitigation: Each workspace has unique workspaceKey in storage path,
 * so different workspaces don't conflict. Same workspace in two windows
 * is an edge case with potential race conditions in v1.
 */
export class WriterLock {
	private holderId: string | null = null;
	private waitQueue: Array<() => void> = [];

	/**
	 * Attempt to acquire the lock
	 * @param options - Acquisition options
	 * @returns true if lock acquired, false if already held (and no wait)
	 */
	async acquire(options?: AcquireOptions): Promise<boolean> {
		if (this.holderId !== null) {
			// Lock already held - wait for timeout if specified
			if (options?.timeoutMs !== undefined && options.timeoutMs > 0) {
				await this.delay(options.timeoutMs);
				// Check again after timeout
				if (this.holderId !== null) {
					return false;
				}
			} else {
				return false;
			}
		}

		this.holderId = randomUUID();
		return true;
	}

	/**
	 * Wait to acquire the lock (queued)
	 * @returns true when lock is acquired
	 */
	async acquireQueued(): Promise<boolean> {
		// If lock is free, acquire immediately
		if (this.holderId === null) {
			this.holderId = randomUUID();
			return true;
		}

		// Lock is held - wait in queue
		return new Promise<boolean>((resolve) => {
			this.waitQueue.push(() => {
				this.holderId = randomUUID();
				resolve(true);
			});
		});
	}

	/**
	 * Release the lock
	 * @throws Error if lock is not currently held
	 */
	async release(): Promise<void> {
		if (this.holderId === null) {
			throw new Error("Cannot release lock that is not held");
		}
		this.holderId = null;

		// Wake up next waiter if any
		const nextWaiter = this.waitQueue.shift();
		if (nextWaiter) {
			nextWaiter();
		}
	}

	/**
	 * Check if lock is currently held
	 */
	isHeld(): boolean {
		return this.holderId !== null;
	}

	/**
	 * Get the current holder ID (for debugging)
	 * @returns holder ID string or null if not held
	 */
	getHolderId(): string | null {
		return this.holderId;
	}

	/**
	 * Force release the lock without checking if held.
	 * Use only during extension deactivation to ensure cleanup.
	 * Does not throw if lock is not held.
	 */
	forceRelease(): void {
		this.holderId = null;
	}

	private delay(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}

/**
 * Execute a callback while holding the writer lock.
 * Guarantees lock release even if callback throws.
 * Uses queued acquisition to serialize concurrent callers.
 *
 * @param lock - The WriterLock instance
 * @param callback - Async function to execute while holding lock
 * @returns The result of the callback
 */
export async function withLock<T>(lock: WriterLock, callback: () => Promise<T>): Promise<T> {
	// Use queued acquisition to wait for lock if currently held
	await lock.acquireQueued();

	try {
		return await callback();
	} finally {
		await lock.release();
	}
}
