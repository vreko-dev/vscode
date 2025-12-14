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
 * TODO(v2): Implement file-based lock for cross-process safety.
 * Current mitigation: Each workspace has unique workspaceKey in storage path,
 * so different workspaces don't conflict. Same workspace in two windows
 * is an edge case with potential race conditions in v1.
 */
export class WriterLock {
	private holderId: string | null = null;

	/**
	 * Attempt to acquire the lock
	 * @param options - Acquisition options
	 * @returns true if lock acquired, false if already held
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
	 * Release the lock
	 * @throws Error if lock is not currently held
	 */
	async release(): Promise<void> {
		if (this.holderId === null) {
			throw new Error("Cannot release lock that is not held");
		}
		this.holderId = null;
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
 *
 * @param lock - The WriterLock instance
 * @param callback - Async function to execute while holding lock
 * @returns The result of the callback
 * @throws LockAcquisitionError if lock cannot be acquired
 */
export async function withLock<T>(lock: WriterLock, callback: () => Promise<T>): Promise<T> {
	const acquired = await lock.acquire();
	if (!acquired) {
		throw new LockAcquisitionError();
	}

	try {
		return await callback();
	} finally {
		await lock.release();
	}
}
