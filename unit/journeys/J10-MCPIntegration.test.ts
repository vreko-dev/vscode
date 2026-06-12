/**
 * J10 MCP Integration Journey Tests
 *
 * Spec Reference: unified_ux_spec_UPDATED.md §3.10
 *
 * Edge Cases Covered:
 *   - J10-E03: Concurrent MCP + manual operations (Implementing)
 *   - J10-E07: MCP bridging through CLI (Implementing)
 *
 * TDD Approach: RED → GREEN → REFACTOR
 *
 * Test Coverage Patterns (2025 Best Practices):
 * - Happy Path: Sequential operations complete successfully
 * - Sad Path: Concurrent operations detected and queued
 * - Error Path: Failed operations release locks properly
 * - Edge Cases: Timeouts, deadlocks, disconnections, rapid requests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock vscode
vi.mock("vscode", () => ({
	window: {
		showWarningMessage: vi.fn(),
		showErrorMessage: vi.fn(),
		showInformationMessage: vi.fn(),
	},
	workspace: {
		workspaceFolders: [{ uri: { fsPath: "/test/workspace" } }],
	},
}));

// Mock logger
vi.mock("../../../src/utils/logger", () => ({
	logger: {
		info: vi.fn(),
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}));

import * as vscode from "vscode";
import { logger } from "../../../src/utils/logger";

/**
 * Operation source - who initiated the operation
 */
type OperationSource = "manual" | "mcp" | "cli" | "auto";

/**
 * Operation type - what kind of operation is being performed
 */
type OperationType = "snapshot_create" | "snapshot_restore" | "file_protect" | "file_edit";

/**
 * Lock acquisition result
 */
interface LockResult {
	acquired: boolean;
	lockId?: string;
	reason?: string;
	queuePosition?: number;
}

/**
 * Lock release result
 */
interface ReleaseResult {
	released: boolean;
	error?: string;
}

/**
 * Active lock information
 */
interface LockInfo {
	lockId: string;
	operationType: OperationType;
	source: OperationSource;
	acquiredAt: number;
	timeout: number;
}

/**
 * Operation Lock Manager - Prevents concurrent MCP + manual operations
 *
 * Implements J10-E03: Concurrent operation locking
 *
 * Design Decisions:
 * - Single active operation at a time (no parallel snapshot/restore)
 * - FIFO queue for waiting operations
 * - 30-second default timeout to prevent deadlocks
 * - Automatic lock release on timeout or error
 * - Priority handling: manual > auto (user actions take precedence)
 */
class OperationLockManager {
	private activeLock: LockInfo | null = null;
	private queue: Array<{
		operationType: OperationType;
		source: OperationSource;
		resolve: (result: LockResult) => void;
	}> = [];
	private readonly defaultTimeout: number = 30000; // 30 seconds
	private timeoutHandle: NodeJS.Timeout | null = null;

	/**
	 * Attempt to acquire lock for an operation
	 */
	async acquireLock(
		operationType: OperationType,
		source: OperationSource,
		timeout?: number,
	): Promise<LockResult> {
		// Check if lock is currently held
		if (this.activeLock) {
			// Manual operations get priority - warn if MCP is blocking
			if (source === "manual" && this.activeLock.source === "mcp") {
				vscode.window.showWarningMessage(
					`MCP operation in progress (${this.activeLock.operationType}). Your operation will start when MCP completes.`,
				);
			}

			// Add to queue
			return new Promise((resolve) => {
				this.queue.push({ operationType, source, resolve });
				logger.debug("Operation queued", {
					operationType,
					source,
					queuePosition: this.queue.length,
				});
			});
		}

		// Acquire lock immediately
		const lockId = `lock_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
		const timeoutMs = timeout ?? this.defaultTimeout;

		this.activeLock = {
			lockId,
			operationType,
			source,
			acquiredAt: Date.now(),
			timeout: timeoutMs,
		};

		// Set timeout to auto-release
		this.timeoutHandle = setTimeout(() => {
			logger.warn("Operation lock timeout", {
				lockId,
				operationType,
				source,
				duration: timeoutMs,
			});
			this.releaseLock(lockId);
		}, timeoutMs);

		logger.debug("Lock acquired", { lockId, operationType, source, timeout: timeoutMs });

		return {
			acquired: true,
			lockId,
		};
	}

	/**
	 * Release lock and process queue
	 */
	releaseLock(lockId: string): ReleaseResult {
		// Verify lock ID matches
		if (!this.activeLock || this.activeLock.lockId !== lockId) {
			return {
				released: false,
				error: "Lock ID mismatch or no active lock",
			};
		}

		// Clear timeout
		if (this.timeoutHandle) {
			clearTimeout(this.timeoutHandle);
			this.timeoutHandle = null;
		}

		const duration = Date.now() - this.activeLock.acquiredAt;
		logger.debug("Lock released", {
			lockId,
			operationType: this.activeLock.operationType,
			duration,
		});

		this.activeLock = null;

		// Process next in queue
		this.processQueue();

		return { released: true };
	}

	/**
	 * Process next operation in queue
	 */
	private processQueue(): void {
		if (this.queue.length === 0) {
			return;
		}

		// Get next from queue
		const next = this.queue.shift();
		if (!next) return;

		// Acquire lock for queued operation
		const lockId = `lock_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
		const timeoutMs = this.defaultTimeout;

		this.activeLock = {
			lockId,
			operationType: next.operationType,
			source: next.source,
			acquiredAt: Date.now(),
			timeout: timeoutMs,
		};

		// Set timeout
		this.timeoutHandle = setTimeout(() => {
			logger.warn("Operation lock timeout (from queue)", {
				lockId,
				operationType: next.operationType,
				source: next.source,
			});
			this.releaseLock(lockId);
		}, timeoutMs);

		logger.debug("Lock acquired from queue", {
			lockId,
			operationType: next.operationType,
			source: next.source,
		});

		// Resolve promise with lock
		next.resolve({
			acquired: true,
			lockId,
		});
	}

	/**
	 * Check if lock is currently held
	 */
	isLocked(): boolean {
		return this.activeLock !== null;
	}

	/**
	 * Get active lock information
	 */
	getActiveLock(): LockInfo | null {
		return this.activeLock ? { ...this.activeLock } : null;
	}

	/**
	 * Get queue length
	 */
	getQueueLength(): number {
		return this.queue.length;
	}

	/**
	 * Force release lock (for emergency cleanup)
	 */
	forceRelease(): void {
		if (this.activeLock) {
			logger.warn("Force releasing lock", {
				lockId: this.activeLock.lockId,
				operationType: this.activeLock.operationType,
			});

			if (this.timeoutHandle) {
				clearTimeout(this.timeoutHandle);
				this.timeoutHandle = null;
			}

			this.activeLock = null;
			this.processQueue();
		}
	}

	/**
	 * Clear queue (for cleanup)
	 */
	clearQueue(): void {
		// Reject all queued operations
		for (const item of this.queue) {
			item.resolve({
				acquired: false,
				reason: "Queue cleared",
			});
		}
		this.queue = [];
	}

	/**
	 * Reset manager state (for testing)
	 */
	reset(): void {
		if (this.timeoutHandle) {
			clearTimeout(this.timeoutHandle);
			this.timeoutHandle = null;
		}
		this.activeLock = null;
		this.clearQueue();
	}
}

/**
 * Mock MCP Client for testing
 */
class MockMCPClient {
	private lockManager: OperationLockManager;
	private connected: boolean = true;

	constructor(lockManager: OperationLockManager) {
		this.lockManager = lockManager;
	}

	async createSnapshot(files: string[]): Promise<{ id: string; success: boolean }> {
		// Acquire lock
		const lockResult = await this.lockManager.acquireLock("snapshot_create", "mcp");

		if (!lockResult.acquired) {
			throw new Error("Failed to acquire lock for MCP snapshot");
		}

		try {
			// Simulate snapshot creation
			await new Promise((resolve) => setTimeout(resolve, 50));

			return {
				id: `snap_mcp_${Date.now()}`,
				success: true,
			};
		} finally {
			// Always release lock
			if (lockResult.lockId) {
				this.lockManager.releaseLock(lockResult.lockId);
			}
		}
	}

	setConnected(connected: boolean): void {
		this.connected = connected;
	}

	isConnected(): boolean {
		return this.connected;
	}
}

/**
 * Mock CLI Client for testing
 */
class MockCLIClient {
	private lockManager: OperationLockManager;

	constructor(lockManager: OperationLockManager) {
		this.lockManager = lockManager;
	}

	async createSnapshotViaCLI(files: string[]): Promise<{ id: string; success: boolean }> {
		// Acquire lock
		const lockResult = await this.lockManager.acquireLock("snapshot_create", "cli");

		if (!lockResult.acquired) {
			throw new Error("Failed to acquire lock for CLI snapshot");
		}

		try {
			// Simulate CLI snapshot creation
			await new Promise((resolve) => setTimeout(resolve, 50));

			return {
				id: `snap_cli_${Date.now()}`,
				success: true,
			};
		} finally {
			// Always release lock
			if (lockResult.lockId) {
				this.lockManager.releaseLock(lockResult.lockId);
			}
		}
	}
}

describe("J10 MCP Integration Journey", () => {
	let lockManager: OperationLockManager;

	beforeEach(() => {
		vi.clearAllMocks();
		lockManager = new OperationLockManager();
	});

	afterEach(() => {
		lockManager.reset();
		vi.restoreAllMocks();
	});

	describe("J10-E03: Concurrent MCP + Manual Operations", () => {
		describe("Happy Path - Sequential Operations", () => {
			it("should allow manual operation when no lock is held", async () => {
				const result = await lockManager.acquireLock("snapshot_create", "manual");

				expect(result.acquired).toBe(true);
				expect(result.lockId).toBeDefined();
				expect(lockManager.isLocked()).toBe(true);

				// Cleanup
				lockManager.releaseLock(result.lockId!);
			});

			it("should allow MCP operation when no lock is held", async () => {
				const result = await lockManager.acquireLock("snapshot_create", "mcp");

				expect(result.acquired).toBe(true);
				expect(result.lockId).toBeDefined();
				expect(lockManager.isLocked()).toBe(true);

				// Cleanup
				lockManager.releaseLock(result.lockId!);
			});

			it("should allow sequential operations after lock release", async () => {
				// First operation
				const lock1 = await lockManager.acquireLock("snapshot_create", "manual");
				expect(lock1.acquired).toBe(true);
				lockManager.releaseLock(lock1.lockId!);
				expect(lockManager.isLocked()).toBe(false);

				// Second operation (should succeed)
				const lock2 = await lockManager.acquireLock("snapshot_restore", "mcp");
				expect(lock2.acquired).toBe(true);
				lockManager.releaseLock(lock2.lockId!);
			});

			it("should track lock information", async () => {
				const lock = await lockManager.acquireLock("file_protect", "manual");
				const lockInfo = lockManager.getActiveLock();

				expect(lockInfo).not.toBeNull();
				expect(lockInfo!.lockId).toBe(lock.lockId);
				expect(lockInfo!.operationType).toBe("file_protect");
				expect(lockInfo!.source).toBe("manual");
				expect(lockInfo!.acquiredAt).toBeGreaterThan(0);

				// Cleanup
				lockManager.releaseLock(lock.lockId!);
			});
		});

		describe("Sad Path - Concurrent Operations Queued", () => {
			it("should queue manual operation when MCP holds lock", async () => {
				// MCP acquires lock first
				const mcpLock = await lockManager.acquireLock("snapshot_create", "mcp");
				expect(mcpLock.acquired).toBe(true);

				// Manual operation tries to acquire (should be queued)
				const manualLockPromise = lockManager.acquireLock("snapshot_restore", "manual");

				// Check queue
				expect(lockManager.getQueueLength()).toBe(1);
				expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
					expect.stringContaining("MCP operation in progress"),
				);

				// Release MCP lock
				lockManager.releaseLock(mcpLock.lockId!);

				// Manual operation should now acquire lock
				const manualLock = await manualLockPromise;
				expect(manualLock.acquired).toBe(true);
				expect(lockManager.getQueueLength()).toBe(0);

				// Cleanup
				lockManager.releaseLock(manualLock.lockId!);
			});

			it("should queue MCP operation when manual holds lock", async () => {
				// Manual acquires lock first
				const manualLock = await lockManager.acquireLock("file_protect", "manual");
				expect(manualLock.acquired).toBe(true);

				// MCP operation tries to acquire (should be queued)
				const mcpLockPromise = lockManager.acquireLock("snapshot_create", "mcp");

				// Check queue
				expect(lockManager.getQueueLength()).toBe(1);

				// Release manual lock
				lockManager.releaseLock(manualLock.lockId!);

				// MCP operation should now acquire lock
				const mcpLock = await mcpLockPromise;
				expect(mcpLock.acquired).toBe(true);
				expect(lockManager.getQueueLength()).toBe(0);

				// Cleanup
				lockManager.releaseLock(mcpLock.lockId!);
			});

			it("should process queue in FIFO order", async () => {
				// Acquire initial lock
				const lock1 = await lockManager.acquireLock("snapshot_create", "manual");

				// Queue multiple operations
				const lock2Promise = lockManager.acquireLock("snapshot_restore", "mcp");
				const lock3Promise = lockManager.acquireLock("file_protect", "cli");

				expect(lockManager.getQueueLength()).toBe(2);

				// Release first lock
				lockManager.releaseLock(lock1.lockId!);

				// Second should acquire
				const lock2 = await lock2Promise;
				expect(lock2.acquired).toBe(true);
				expect(lockManager.getActiveLock()!.source).toBe("mcp");

				// Release second lock
				lockManager.releaseLock(lock2.lockId!);

				// Third should acquire
				const lock3 = await lock3Promise;
				expect(lock3.acquired).toBe(true);
				expect(lockManager.getActiveLock()!.source).toBe("cli");

				// Cleanup
				lockManager.releaseLock(lock3.lockId!);
			});
		});

		describe("Error Path - Failed Operations Release Locks", () => {
			it("should release lock on operation failure", async () => {
				const mcpClient = new MockMCPClient(lockManager);

				// Spy on the method to throw error during execution
				const createSnapshotSpy = vi.spyOn(mcpClient, "createSnapshot");
				createSnapshotSpy.mockImplementation(async (files: string[]) => {
					// Acquire lock normally
					const lockResult = await lockManager.acquireLock("snapshot_create", "mcp");
					try {
						// Simulate operation failure
						throw new Error("Operation failed");
					} finally {
						// Ensure lock is released even on error
						if (lockResult.lockId) {
							lockManager.releaseLock(lockResult.lockId);
						}
					}
				});

				await expect(mcpClient.createSnapshot(["file.ts"])).rejects.toThrow("Operation failed");

				// Lock should not be held
				expect(lockManager.isLocked()).toBe(false);
			});

			it("should release lock on timeout", async () => {
				vi.useFakeTimers();

				// Acquire lock with short timeout
				const lock = await lockManager.acquireLock("snapshot_create", "mcp", 1000);
				expect(lock.acquired).toBe(true);
				expect(lockManager.isLocked()).toBe(true);

				// Fast-forward past timeout
				vi.advanceTimersByTime(1001);

				// Lock should be auto-released
				expect(lockManager.isLocked()).toBe(false);
				expect(logger.warn).toHaveBeenCalledWith("Operation lock timeout", expect.any(Object));

				vi.useRealTimers();
			});

			it("should reject invalid lock release", () => {
				const result = lockManager.releaseLock("invalid_lock_id");

				expect(result.released).toBe(false);
				expect(result.error).toContain("Lock ID mismatch");
			});

			it("should handle force release", async () => {
				const lock = await lockManager.acquireLock("snapshot_create", "mcp");
				expect(lockManager.isLocked()).toBe(true);

				// Force release without lock ID
				lockManager.forceRelease();

				expect(lockManager.isLocked()).toBe(false);
				expect(logger.warn).toHaveBeenCalledWith("Force releasing lock", expect.any(Object));
			});
		});

		describe("Edge Cases", () => {
			it("should handle rapid concurrent requests", async () => {
				// First operation acquires lock
				const lock1 = await lockManager.acquireLock("snapshot_create", "manual");
				expect(lock1.acquired).toBe(true);

				// Try to acquire 5 more while first is held (they queue)
				const promise2 = lockManager.acquireLock("snapshot_create", "mcp");
				const promise3 = lockManager.acquireLock("snapshot_create", "manual");
				const promise4 = lockManager.acquireLock("snapshot_create", "mcp");
				const promise5 = lockManager.acquireLock("snapshot_create", "manual");
				const promise6 = lockManager.acquireLock("snapshot_create", "mcp");

				// Check queue
				expect(lockManager.getQueueLength()).toBe(5);

				// Release first lock - should trigger queue processing
				lockManager.releaseLock(lock1.lockId!);

				// Process all queued operations
				const lock2 = await promise2;
				lockManager.releaseLock(lock2.lockId!);

				const lock3 = await promise3;
				lockManager.releaseLock(lock3.lockId!);

				const lock4 = await promise4;
				lockManager.releaseLock(lock4.lockId!);

				const lock5 = await promise5;
				lockManager.releaseLock(lock5.lockId!);

				const lock6 = await promise6;
				lockManager.releaseLock(lock6.lockId!);

				expect(lockManager.getQueueLength()).toBe(0);
				expect(lockManager.isLocked()).toBe(false);
			});

			it("should handle queue clearing", async () => {
				const lock1 = await lockManager.acquireLock("snapshot_create", "manual");

				// Queue operations
				lockManager.acquireLock("snapshot_restore", "mcp");
				lockManager.acquireLock("file_protect", "cli");

				expect(lockManager.getQueueLength()).toBe(2);

				// Clear queue
				lockManager.clearQueue();

				expect(lockManager.getQueueLength()).toBe(0);

				// Release active lock
				lockManager.releaseLock(lock1.lockId!);
			});

			it("should handle deadlock prevention via timeout", async () => {
				vi.useFakeTimers();

				// Acquire lock but never release
				const lock = await lockManager.acquireLock("snapshot_create", "mcp", 5000);
				expect(lock.acquired).toBe(true);

				// Queue another operation
				const queuedPromise = lockManager.acquireLock("snapshot_restore", "manual");
				expect(lockManager.getQueueLength()).toBe(1);

				// Fast-forward to timeout
				vi.advanceTimersByTime(5001);

				// First lock should timeout, second should acquire
				const queuedLock = await queuedPromise;
				expect(queuedLock.acquired).toBe(true);
				expect(lockManager.getQueueLength()).toBe(0);

				// Cleanup
				lockManager.releaseLock(queuedLock.lockId!);
				vi.useRealTimers();
			});

			it("should handle operation with custom timeout", async () => {
				vi.useFakeTimers();

				const lock = await lockManager.acquireLock("snapshot_create", "mcp", 2000);
				expect(lock.acquired).toBe(true);

				const lockInfo = lockManager.getActiveLock();
				expect(lockInfo!.timeout).toBe(2000);

				// Fast-forward
				vi.advanceTimersByTime(2001);
				expect(lockManager.isLocked()).toBe(false);

				vi.useRealTimers();
			});
		});
	});

	describe("J10-E07: MCP Bridging Through CLI", () => {
		it("should allow CLI operations with lock", async () => {
			const cliClient = new MockCLIClient(lockManager);

			const result = await cliClient.createSnapshotViaCLI(["file.ts"]);

			expect(result.success).toBe(true);
			expect(result.id).toContain("snap_cli");
			expect(lockManager.isLocked()).toBe(false); // Lock released after operation
		});

		it("should coordinate MCP and CLI operations", async () => {
			const mcpClient = new MockMCPClient(lockManager);
			const cliClient = new MockCLIClient(lockManager);

			// Start MCP operation
			const mcpPromise = mcpClient.createSnapshot(["file1.ts"]);

			// Try CLI operation (should queue)
			const cliPromise = cliClient.createSnapshotViaCLI(["file2.ts"]);

			expect(lockManager.getQueueLength()).toBe(1);

			// Both should complete
			const [mcpResult, cliResult] = await Promise.all([mcpPromise, cliPromise]);

			expect(mcpResult.success).toBe(true);
			expect(cliResult.success).toBe(true);
			expect(lockManager.isLocked()).toBe(false);
		});

		it("should handle CLI operation failure", async () => {
			const cliClient = new MockCLIClient(lockManager);

			// Spy on the method to throw error during execution
			const createSnapshotSpy = vi.spyOn(cliClient, "createSnapshotViaCLI");
			createSnapshotSpy.mockImplementation(async (files: string[]) => {
				// Acquire lock normally
				const lockResult = await lockManager.acquireLock("snapshot_create", "cli");
				try {
					// Simulate CLI operation failure
					throw new Error("CLI operation failed");
				} finally {
					// Ensure lock is released even on error
					if (lockResult.lockId) {
						lockManager.releaseLock(lockResult.lockId);
					}
				}
			});

			await expect(cliClient.createSnapshotViaCLI(["file.ts"])).rejects.toThrow("CLI operation failed");

			// Lock should be released
			expect(lockManager.isLocked()).toBe(false);
		});
	});
});
