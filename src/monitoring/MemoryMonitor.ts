/**
 * Memory Monitor for Resource Management
 *
 * Implements J9-E04: Memory monitoring and cleanup
 *
 * Tracks memory usage against budget constraints and triggers cleanup
 * at configurable thresholds (70%/85%/95%).
 *
 * @module monitoring/MemoryMonitor
 */

import * as vscode from "vscode";
import { logger } from "../utils/logger";

/**
 * Memory usage thresholds
 */
export interface MemoryThresholds {
	warning: number; // 0.7 = 70%
	critical: number; // 0.85 = 85%
	emergency: number; // 0.95 = 95%
}

/**
 * Memory statistics snapshot
 */
export interface MemoryStats {
	used: number;
	total: number;
	percentage: number;
	timestamp: number;
}

/**
 * Cleanup operation result
 */
export interface CleanupResult {
	success: boolean;
	freedBytes: number;
	newPercentage: number;
	error?: string;
}

/**
 * Memory monitor for tracking and managing extension memory usage
 *
 * Monitors memory against budget constraints (default 200MB) and
 * triggers cleanup at three threshold levels:
 * - Warning (70%): User notification
 * - Critical (85%): Automatic cleanup
 * - Emergency (95%): Block operations + aggressive cleanup
 */
export class MemoryMonitor {
	private readonly memoryBudget: number; // Total memory budget in bytes
	private readonly thresholds: MemoryThresholds;
	private currentUsage: number;
	private lastCleanupTime: number;
	private cleanupInProgress: boolean;
	private snapshotCache;

	constructor(memoryBudgetMB = 200) {
		this.memoryBudget = memoryBudgetMB * 1024 * 1024; // Convert MB to bytes
		this.currentUsage = 0;
		this.lastCleanupTime = 0;
		this.cleanupInProgress = false;
		this.snapshotCache = new Map<string, { content: string; size: number }>();
		this.thresholds = {
			warning: 0.7, // 70%
			critical: 0.85, // 85%
			emergency: 0.95, // 95%
		};
	}

	/**
	 * Get current memory statistics
	 */
	getMemoryStats(): MemoryStats {
		const percentage = (this.currentUsage / this.memoryBudget) * 100;
		return {
			used: this.currentUsage,
			total: this.memoryBudget,
			percentage: Math.round(percentage * 100) / 100, // Round to 2 decimals
			timestamp: Date.now(),
		};
	}

	/**
	 * Simulate memory allocation (for testing)
	 */
	allocateMemory(bytes: number): void {
		this.currentUsage += bytes;
	}

	/**
	 * Simulate memory deallocation (for testing)
	 */
	deallocateMemory(bytes: number): void {
		this.currentUsage = Math.max(0, this.currentUsage - bytes);
	}

	/**
	 * Check if memory usage exceeds threshold
	 */
	checkThreshold(): {
		level: "normal" | "warning" | "critical" | "emergency";
		percentage: number;
		shouldCleanup: boolean;
	} {
		const percentage = this.currentUsage / this.memoryBudget;

		if (percentage >= this.thresholds.emergency) {
			return { level: "emergency", percentage: percentage * 100, shouldCleanup: true };
		}
		if (percentage >= this.thresholds.critical) {
			return { level: "critical", percentage: percentage * 100, shouldCleanup: true };
		}
		if (percentage >= this.thresholds.warning) {
			return { level: "warning", percentage: percentage * 100, shouldCleanup: false };
		}
		return { level: "normal", percentage: percentage * 100, shouldCleanup: false };
	}

	/**
	 * Add snapshot to cache (simulates memory pressure from snapshots)
	 */
	cacheSnapshot(id: string, content: string): void {
		const size = Buffer.byteLength(content, "utf8");
		this.snapshotCache.set(id, { content, size });
		this.allocateMemory(size);
	}

	/**
	 * Perform memory cleanup
	 */
	async performCleanup(aggressive = false): Promise<CleanupResult> {
		if (this.cleanupInProgress) {
			return {
				success: false,
				freedBytes: 0,
				newPercentage: (this.currentUsage / this.memoryBudget) * 100,
				error: "Cleanup already in progress",
			};
		}

		this.cleanupInProgress = true;
		let freedBytes = 0;

		try {
			// Strategy 1: Clear old snapshots from cache
			const sortedSnapshots = Array.from(this.snapshotCache.entries()).sort((a, b) => {
				// In real implementation, sort by access time
				return a[0].localeCompare(b[0]);
			});

			const snapshotsToRemove = aggressive
				? Math.ceil(sortedSnapshots.length * 0.5) // Remove 50% if aggressive
				: Math.ceil(sortedSnapshots.length * 0.3); // Remove 30% otherwise

			for (let i = 0; i < snapshotsToRemove && i < sortedSnapshots.length; i++) {
				const [id, data] = sortedSnapshots[i];
				freedBytes += data.size;
				this.snapshotCache.delete(id);
			}

			this.deallocateMemory(freedBytes);
			this.lastCleanupTime = Date.now();

			const newPercentage = (this.currentUsage / this.memoryBudget) * 100;

			logger.info("Memory cleanup completed", {
				freedBytes,
				freedMB: (freedBytes / (1024 * 1024)).toFixed(2),
				newPercentage: newPercentage.toFixed(2),
				aggressive,
			});

			return {
				success: true,
				freedBytes,
				newPercentage,
			};
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			logger.error("Memory cleanup failed", err instanceof Error ? err : undefined);
			return {
				success: false,
				freedBytes: 0,
				newPercentage: (this.currentUsage / this.memoryBudget) * 100,
				error: errorMessage,
			};
		} finally {
			this.cleanupInProgress = false;
		}
	}

	/**
	 * Monitor memory and trigger actions based on thresholds
	 */
	async monitor(): Promise<{
		action: "none" | "warn" | "cleanup" | "block";
		message: string;
		stats: MemoryStats;
	}> {
		const threshold = this.checkThreshold();
		const stats = this.getMemoryStats();

		switch (threshold.level) {
			case "emergency":
				// Block operations and force cleanup
				await this.performCleanup(true);
				return {
					action: "block",
					message: `Memory critical (${threshold.percentage.toFixed(1)}%) - operations blocked`,
					stats,
				};

			case "critical":
				// Automatic aggressive cleanup
				await this.performCleanup(true);
				return {
					action: "cleanup",
					message: `Memory critical (${threshold.percentage.toFixed(1)}%) - automatic cleanup triggered`,
					stats,
				};

			case "warning":
				// Warn user, suggest cleanup
				vscode.window.showWarningMessage(
					`Memory usage at ${threshold.percentage.toFixed(1)}% - consider creating a snapshot`,
				);
				return {
					action: "warn",
					message: `Memory warning (${threshold.percentage.toFixed(1)}%)`,
					stats,
				};

			default:
				return {
					action: "none",
					message: `Memory normal (${threshold.percentage.toFixed(1)}%)`,
					stats,
				};
		}
	}

	/**
	 * Get cleanup statistics
	 */
	getCleanupStats(): {
		lastCleanupTime: number;
		minutesSinceCleanup: number | null;
		cleanupInProgress: boolean;
		cachedSnapshots: number;
	} {
		const minutesSinceCleanup = this.lastCleanupTime
			? Math.floor((Date.now() - this.lastCleanupTime) / 60000)
			: null;

		return {
			lastCleanupTime: this.lastCleanupTime,
			minutesSinceCleanup,
			cleanupInProgress: this.cleanupInProgress,
			cachedSnapshots: this.snapshotCache.size,
		};
	}

	/**
	 * Reset memory monitor state (for testing)
	 */
	reset(): void {
		this.currentUsage = 0;
		this.lastCleanupTime = 0;
		this.cleanupInProgress = false;
		this.snapshotCache.clear();
	}
}
