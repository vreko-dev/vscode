/**
 * @fileoverview WriterLock - Single Writer Guarantee for PRW Storage
 *
 * Per spec.json:
 * - path: "locks/writer.lock"
 * - requirement: "All writes to manifests/state/index/head-map must hold the lock"
 *
 * Implementation supports both in-memory (single-process) and file-based
 * (cross-process) locking using proper-lockfile.
 */

import { randomUUID } from "node:crypto";
import * as path from "node:path";
import * as lockfile from "proper-lockfile";
import { logger } from "../utils/logger";

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
	/** Whether to use file-based locking for cross-process safety */
	crossProcess?: boolean;
	/** Lock file path (required if crossProcess is true) */
	lockFilePath?: string;
}

/** Default lock options for proper-lockfile */
const DEFAULT_LOCK_OPTIONS: lockfile.LockOptions = {
	stale: 10000, // Consider lock stale after 10 seconds
	update: 2000, // Update mtime every 2 seconds
	retries: {
		retries: 5,
		minTimeout: 50,
		maxTimeout: 1000,
	},
};

/**
 * Writer lock with cross-process support.
 *
 * Supports two modes:
 * 1. In-memory: Fast, single-process only (default)
 * 2. File-based: Cross-process safe using proper-lockfile
 *
 * For storage operations that may conflict across VS Code windows,
 * use crossProcess=true with a lock file path.
 */
export class WriterLock {
	private holderId: string | null = null;
	private waitQueue: Array<() => void> = [];
	private fileLockRelease: (() => Promise<void>) | null = null;
	private lockFilePath: string | null = null;

	/**
	 * Attempt to acquire the lock
	 * @param options - Acquisition options
	 * @returns true if lock acquired, false if already held (and no wait)
	 */
	async acquire(options?: AcquireOptions): Promise<boolean> {
		// Use file-based locking if requested
		if (options?.crossProcess && options?.lockFilePath) {
			return this.acquireFileLock(options.lockFilePath, options.timeoutMs);
		}

		// In-memory locking
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
	 * @param options - Acquisition options
	 * @returns true when lock is acquired
	 */
	async acquireQueued(options?: AcquireOptions): Promise<boolean> {
		// Use file-based locking if requested
		if (options?.crossProcess && options?.lockFilePath) {
			return this.acquireFileLock(options.lockFilePath, options.timeoutMs);
		}

		// In-memory locking
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
		// Release file lock if held
		if (this.fileLockRelease) {
			try {
				await this.fileLockRelease();
				this.fileLockRelease = null;
				this.lockFilePath = null;
				logger.debug("File lock released");
			} catch (error) {
				logger.error("Failed to release file lock", error as Error);
				throw error;
			}
			return;
		}

		// Release in-memory lock
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
		return this.holderId !== null || this.fileLockRelease !== null;
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
	async forceRelease(): Promise<void> {
		// Force release file lock if held
		if (this.fileLockRelease) {
			try {
				await this.fileLockRelease();
			} catch {
				// Ignore errors during force release
			}
			this.fileLockRelease = null;
			this.lockFilePath = null;
		}

		this.holderId = null;
	}

	/**
	 * Acquire a file-based lock using proper-lockfile
	 */
	private async acquireFileLock(lockFilePath: string, timeoutMs?: number): Promise<boolean> {
		try {
			const options: lockfile.LockOptions = {
				...DEFAULT_LOCK_OPTIONS,
			};

			// Add custom timeout if specified
			if (timeoutMs !== undefined) {
				options.retries = {
					retries: Math.ceil(timeoutMs / 100),
					minTimeout: 50,
					maxTimeout: Math.min(timeoutMs / 5, 1000),
				};
			}

			// Try to acquire lock on the file (or directory if file doesn't exist)
			let release: (() => Promise<void>) | null = null;
			try {
				release = await lockfile.lock(lockFilePath, options);
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code === "ENOENT") {
					// File doesn't exist yet, lock the directory instead
					const dir = path.dirname(lockFilePath);
					release = await lockfile.lock(dir, options);
				} else {
					throw error;
				}
			}

			this.fileLockRelease = release;
			this.lockFilePath = lockFilePath;
			this.holderId = randomUUID();

			logger.debug("File lock acquired", { lockFilePath });
			return true;
		} catch (error) {
			logger.warn("Failed to acquire file lock", {
				lockFilePath,
				error: (error as Error).message,
			});
			return false;
		}
	}

	private delay(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}

/**
 * Options for withLock helper
 */
export interface WithLockOptions {
	/** Whether to use file-based locking for cross-process safety */
	crossProcess?: boolean;
	/** Lock file path (required if crossProcess is true) */
	lockFilePath?: string;
}

/**
 * Execute a callback while holding the writer lock.
 * Guarantees lock release even if callback throws.
 * Uses queued acquisition to serialize concurrent callers.
 *
 * @param lock - The WriterLock instance
 * @param callback - Async function to execute while holding lock
 * @param options - Lock options for cross-process locking
 * @returns The result of the callback
 */
export async function withLock<T>(lock: WriterLock, callback: () => Promise<T>, options?: WithLockOptions): Promise<T> {
	// Use queued acquisition to wait for lock if currently held
	await lock.acquireQueued(options);

	try {
		return await callback();
	} finally {
		await lock.release();
	}
}
