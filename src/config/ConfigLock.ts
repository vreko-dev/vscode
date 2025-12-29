/**
 * ConfigLock.ts
 *
 * File locking for concurrent configuration writes.
 *
 * Spec Reference: unified_ux_spec.md §6.2
 * Edge Cases Covered:
 *   - J1-E05: Multiple VS Code windows
 *   - J8-E06: Concurrent config writes
 *
 * Implementation:
 *   - Uses sidecar .lock file with PID, timestamp, and instance ID
 *   - Exponential backoff with jitter (2025 best practice)
 *   - Stale lock detection via heartbeat age (>30s) and PID liveness
 *   - Atomic lock acquisition using exclusive file creation
 *
 * @see https://github.com/your-org/snapback/blob/main/apps/vscode/unified_ux_spec.md
 */

import * as fs from "node:fs/promises";
import os from "node:os";
import { Err, Ok, type Result } from "../types/result";

/** Helper for fs.rm with ignore if not exists */
async function removeIfExists(path: string): Promise<void> {
	try {
		await fs.rm(path);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
			throw error;
		}
	}
}

/** Check if path exists - used in future enhancements */
async function _pathExists(path: string): Promise<boolean> {
	try {
		await fs.access(path);
		return true;
	} catch {
		return false;
	}
}

/** Lock file metadata */
interface LockData {
	pid: number;
	instanceId: string;
	acquiredAt: string;
	lastHeartbeat: string;
	owner: string; // hostname or machine identifier
}

/** Configuration for lock behavior */
interface LockConfig {
	staleThresholdMs: number;
	maxRetries: number;
	baseDelayMs: number;
	maxDelayMs: number;
}

const DEFAULT_CONFIG: LockConfig = {
	staleThresholdMs: 30_000, // 30 seconds
	maxRetries: 10,
	baseDelayMs: 100,
	maxDelayMs: 5_000,
};

/**
 * Manages file locking to prevent race conditions during config writes.
 * Uses a sidecar .lock file with a PID and timestamp.
 *
 * Best Practices (2025):
 * - Exponential backoff with full jitter to prevent thundering herd
 * - Stale lock detection via timestamp + PID verification
 * - Atomic lock creation using exclusive flags
 */
export class ConfigLock {
	private readonly lockPath: string;
	private readonly timeoutMs: number;
	private readonly config: LockConfig;
	private readonly instanceId: string;
	private heartbeatInterval: NodeJS.Timeout | null = null;

	constructor(filePath: string, timeoutMs = 5000, config: Partial<LockConfig> = {}) {
		this.lockPath = `${filePath}.lock`;
		this.timeoutMs = timeoutMs;
		this.config = { ...DEFAULT_CONFIG, ...config };
		this.instanceId = `vscode-${process.pid}-${Date.now()}`;
	}

	/**
	 * Acquire the lock with exponential backoff and jitter.
	 *
	 * Implements:
	 * - Exclusive file creation for atomic acquisition
	 * - Stale lock detection and stealing
	 * - Exponential backoff with full jitter
	 */
	async acquire(): Promise<void> {
		const startTime = Date.now();
		let attempt = 0;

		while (Date.now() - startTime < this.timeoutMs) {
			attempt++;

			// Try to create lock file exclusively
			const result = await this.tryAcquire();
			if (result.success) {
				this.startHeartbeat();
				return;
			}

			// Check if existing lock is stale
			const existingLock = await this.readLockFile();
			if (existingLock && (await this.isStale(existingLock))) {
				// Steal stale lock
				await this.stealLock();
				this.startHeartbeat();
				return;
			}

			// Calculate backoff with full jitter (prevents thundering herd)
			const delay = this.calculateBackoff(attempt);
			await this.sleep(delay);

			if (attempt >= this.config.maxRetries) {
				throw new Error(`Failed to acquire lock after ${attempt} attempts (${this.lockPath})`);
			}
		}

		throw new Error(`Lock acquisition timed out after ${this.timeoutMs}ms (${this.lockPath})`);
	}

	/**
	 * Attempt to acquire lock atomically.
	 */
	private async tryAcquire(): Promise<Result<void, Error>> {
		const lockData: LockData = {
			pid: process.pid,
			instanceId: this.instanceId,
			acquiredAt: new Date().toISOString(),
			lastHeartbeat: new Date().toISOString(),
			owner: os.hostname(),
		};

		try {
			// Use 'wx' flag for exclusive creation (fails if file exists)
			const handle = await fs.open(this.lockPath, "wx", 0o600);
			await handle.writeFile(JSON.stringify(lockData, null, 2));
			await handle.close();
			return Ok(undefined);
		} catch (error: unknown) {
			if ((error as NodeJS.ErrnoException).code === "EEXIST") {
				return Err(new Error("Lock already exists"));
			}
			return Err(error instanceof Error ? error : new Error(String(error)));
		}
	}

	/**
	 * Read existing lock file data.
	 */
	private async readLockFile(): Promise<LockData | null> {
		try {
			const content = await fs.readFile(this.lockPath, "utf-8");
			return JSON.parse(content) as LockData;
		} catch {
			return null;
		}
	}

	/**
	 * Check if lock is stale (no heartbeat for >30s or PID dead).
	 */
	private async isStale(lock: LockData): Promise<boolean> {
		const heartbeatAge = Date.now() - new Date(lock.lastHeartbeat).getTime();

		// Stale if heartbeat too old
		if (heartbeatAge > this.config.staleThresholdMs) {
			return true;
		}

		// Check if owning process is still alive (Unix-like systems)
		if (process.platform !== "win32") {
			try {
				process.kill(lock.pid, 0); // Signal 0 = check existence
				return false; // Process exists
			} catch {
				return true; // Process doesn't exist
			}
		}

		return false;
	}

	/**
	 * Force-steal a stale lock.
	 */
	private async stealLock(): Promise<void> {
		const lockData: LockData = {
			pid: process.pid,
			instanceId: this.instanceId,
			acquiredAt: new Date().toISOString(),
			lastHeartbeat: new Date().toISOString(),
			owner: os.hostname(),
		};

		// Overwrite stale lock
		await fs.writeFile(this.lockPath, JSON.stringify(lockData, null, 2), {
			mode: 0o600,
		});
	}

	/**
	 * Calculate exponential backoff with full jitter.
	 * Formula: random(0, min(cap, base * 2^attempt))
	 */
	private calculateBackoff(attempt: number): number {
		const exponentialDelay = this.config.baseDelayMs * 2 ** (attempt - 1);
		const cappedDelay = Math.min(exponentialDelay, this.config.maxDelayMs);
		// Full jitter: random value between 0 and capped delay
		return Math.random() * cappedDelay;
	}

	/**
	 * Start heartbeat updates to prevent false stale detection.
	 */
	private startHeartbeat(): void {
		this.heartbeatInterval = setInterval(async () => {
			try {
				const lock = await this.readLockFile();
				if (lock && lock.instanceId === this.instanceId) {
					lock.lastHeartbeat = new Date().toISOString();
					await fs.writeFile(this.lockPath, JSON.stringify(lock, null, 2), { mode: 0o600 });
				}
			} catch {
				// Ignore heartbeat errors
			}
		}, 10_000); // Update every 10 seconds
	}

	/**
	 * Release the lock.
	 */
	async release(): Promise<void> {
		// Stop heartbeat
		if (this.heartbeatInterval) {
			clearInterval(this.heartbeatInterval);
			this.heartbeatInterval = null;
		}

		try {
			// Verify we own the lock before releasing
			const lock = await this.readLockFile();
			if (lock && lock.instanceId === this.instanceId) {
				await removeIfExists(this.lockPath);
			}
		} catch {
			// Ignore release errors (lock may already be gone)
		}
	}

	/**
	 * Wrapper to run an operation with the lock.
	 * Ensures lock is always released, even on error.
	 */
	async withLock<T>(operation: () => Promise<T>): Promise<T> {
		await this.acquire();
		try {
			return await operation();
		} finally {
			await this.release();
		}
	}

	/**
	 * Check if we currently hold the lock.
	 */
	async isHeld(): Promise<boolean> {
		const lock = await this.readLockFile();
		return lock !== null && lock.instanceId === this.instanceId;
	}

	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}
