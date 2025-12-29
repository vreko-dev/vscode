/**
 * J9 Performance & Resilience Journey Tests
 *
 * Spec Reference: unified_ux_spec_UPDATED.md §3.9
 *
 * Edge Cases Covered:
 *   - J9-E04: Memory monitoring and cleanup (Implementing)
 *
 * TDD Approach: RED → GREEN → REFACTOR
 *
 * Test Coverage Patterns (2025 Best Practices):
 * - Happy Path: Normal memory usage below thresholds
 * - Sad Path: Memory warnings trigger cleanup
 * - Error Path: Critical memory threshold breached
 * - Edge Cases: Boundary conditions, cleanup failures, concurrent pressure
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MemoryMonitor, type MemoryThresholds, type MemoryStats, type CleanupResult } from "../../../src/monitoring/MemoryMonitor";

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
 * Memory usage statistics
 */

/**
 * Memory threshold levels (aligned with SnapBack constraints: memory<200MB)
 */

/**
 * Memory cleanup result
 */

/**
 * Memory Monitor - Tracks extension memory usage and triggers cleanup
 *
 * Implements J9-E04: Memory monitoring with threshold detection
 *
 * Design Decisions:
 * - 70% warning: Proactive notification, suggest snapshot creation
 * - 85% critical: Automatic cleanup, purge old snapshots
 * - 95% emergency: Block new operations until cleanup succeeds
 * - Memory budget: 200MB (per SnapBack performance constraints)
 */

describe("J9 Performance & Resilience Journey", () => {
	let memoryMonitor: MemoryMonitor;

	beforeEach(() => {
		vi.clearAllMocks();
		memoryMonitor = new MemoryMonitor(200); // 200MB budget
	});

	afterEach(() => {
		memoryMonitor.reset();
		vi.restoreAllMocks();
	});

	describe("J9-E04: Memory Monitoring and Cleanup", () => {
		describe("Happy Path - Normal Memory Usage", () => {
			it("should report normal status when memory usage is below 70%", async () => {
				// Allocate 60% of budget (120MB of 200MB)
				memoryMonitor.allocateMemory(120 * 1024 * 1024);

				const result = await memoryMonitor.monitor();

				expect(result.action).toBe("none");
				expect(result.message).toContain("normal");
				expect(result.stats.percentage).toBeLessThan(70);
			});

			it("should track memory allocation accurately", () => {
				const initialStats = memoryMonitor.getMemoryStats();
				expect(initialStats.percentage).toBe(0);

				// Allocate 50MB
				memoryMonitor.allocateMemory(50 * 1024 * 1024);

				const afterStats = memoryMonitor.getMemoryStats();
				expect(afterStats.percentage).toBeCloseTo(25, 1); // 50MB / 200MB = 25%
				expect(afterStats.used).toBe(50 * 1024 * 1024);
			});

			it("should handle multiple small allocations", () => {
				// Simulate gradual memory growth
				for (let i = 0; i < 10; i++) {
					memoryMonitor.allocateMemory(5 * 1024 * 1024); // 5MB each
				}

				const stats = memoryMonitor.getMemoryStats();
				expect(stats.percentage).toBeCloseTo(25, 1); // 50MB total / 200MB = 25%
			});

			it("should cache snapshots and track their memory impact", () => {
				const snapshot1 = "x".repeat(10 * 1024 * 1024); // ~10MB
				const snapshot2 = "y".repeat(15 * 1024 * 1024); // ~15MB

				memoryMonitor.cacheSnapshot("snap_1", snapshot1);
				memoryMonitor.cacheSnapshot("snap_2", snapshot2);

				const stats = memoryMonitor.getMemoryStats();
				expect(stats.percentage).toBeGreaterThan(10);
				expect(stats.percentage).toBeLessThan(15);

				const cleanupStats = memoryMonitor.getCleanupStats();
				expect(cleanupStats.cachedSnapshots).toBe(2);
			});
		});

		describe("Sad Path - Warning Threshold (70-85%)", () => {
			it("should trigger warning when memory reaches 70%", async () => {
				// Allocate exactly 70% (140MB of 200MB)
				memoryMonitor.allocateMemory(140 * 1024 * 1024);

				const result = await memoryMonitor.monitor();

				expect(result.action).toBe("warn");
				expect(result.message).toContain("warning");
				expect(result.stats.percentage).toBeGreaterThanOrEqual(70);
				expect(result.stats.percentage).toBeLessThan(85);
				expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
					expect.stringContaining("Memory usage at"),
				);
			});

			it("should detect threshold crossing from normal to warning", async () => {
				// Start at 65%
				memoryMonitor.allocateMemory(130 * 1024 * 1024);
				let result = await memoryMonitor.monitor();
				expect(result.action).toBe("none");

				// Cross to 75%
				memoryMonitor.allocateMemory(20 * 1024 * 1024);
				result = await memoryMonitor.monitor();
				expect(result.action).toBe("warn");
			});

			it("should not trigger cleanup at warning level", async () => {
				memoryMonitor.allocateMemory(145 * 1024 * 1024); // 72.5%

				const threshold = memoryMonitor.checkThreshold();
				expect(threshold.level).toBe("warning");
				expect(threshold.shouldCleanup).toBe(false);
			});
		});

		describe("Error Path - Critical Threshold (85-95%)", () => {
			it("should trigger automatic cleanup at 85% threshold", async () => {
				// Set up cached snapshots
				for (let i = 0; i < 5; i++) {
					memoryMonitor.cacheSnapshot(`snap_${i}`, "x".repeat(30 * 1024 * 1024)); // 30MB each
				}

				// Should be at ~75% (150MB / 200MB)
				let stats = memoryMonitor.getMemoryStats();
				expect(stats.percentage).toBeGreaterThan(70);

				// Push over 85%
				memoryMonitor.allocateMemory(25 * 1024 * 1024);

				const result = await memoryMonitor.monitor();

				expect(result.action).toBe("cleanup");
				expect(result.message).toContain("critical");
				expect(logger.info).toHaveBeenCalledWith(
					"Memory cleanup completed",
					expect.objectContaining({ aggressive: true }),
				);
			});

			it("should free memory during cleanup", async () => {
				// Cache 10 snapshots
				for (let i = 0; i < 10; i++) {
					memoryMonitor.cacheSnapshot(`snap_${i}`, "x".repeat(20 * 1024 * 1024)); // 20MB each
				}

				const beforeStats = memoryMonitor.getMemoryStats();
				expect(beforeStats.percentage).toBeGreaterThan(85);

				const cleanupResult = await memoryMonitor.performCleanup(true);

				expect(cleanupResult.success).toBe(true);
				expect(cleanupResult.freedBytes).toBeGreaterThan(0);
				expect(cleanupResult.newPercentage).toBeLessThan(beforeStats.percentage);
			});

			it("should handle cleanup failure gracefully", async () => {
				// Simulate scenario where cleanup can't free enough memory
				// (no snapshots to clear)
				memoryMonitor.allocateMemory(180 * 1024 * 1024); // 90% with no cached snapshots

				const cleanupResult = await memoryMonitor.performCleanup(true);

				// Cleanup succeeds but frees 0 bytes (nothing to clean)
				expect(cleanupResult.success).toBe(true);
				expect(cleanupResult.freedBytes).toBe(0);
			});

			it("should prevent concurrent cleanup operations", () => {
				// Cache snapshots
				for (let i = 0; i < 5; i++) {
					memoryMonitor.cacheSnapshot(`snap_${i}`, "x".repeat(30 * 1024 * 1024));
				}

				// Manually set cleanup in progress flag to simulate first cleanup
				(memoryMonitor as any).cleanupInProgress = true;

				// Try to start second cleanup while first is "in progress"
				const cleanup2Promise = memoryMonitor.performCleanup(true);

				// Should immediately return with error since cleanup is in progress
				return cleanup2Promise.then((cleanup2Result) => {
					expect(cleanup2Result.success).toBe(false);
					expect(cleanup2Result.error).toContain("already in progress");
					// Reset flag
					(memoryMonitor as any).cleanupInProgress = false;
				});
			});
		});

		describe("Error Path - Emergency Threshold (>95%)", () => {
			it("should block operations at 95% threshold", async () => {
				// Push to 96%
				memoryMonitor.allocateMemory(192 * 1024 * 1024);

				const result = await memoryMonitor.monitor();

				expect(result.action).toBe("block");
				expect(result.message).toContain("critical");
				expect(result.message).toContain("blocked");
			});

			it("should trigger aggressive cleanup at emergency level", async () => {
				// Cache many snapshots
				for (let i = 0; i < 20; i++) {
					memoryMonitor.cacheSnapshot(`snap_${i}`, "x".repeat(10 * 1024 * 1024));
				}

				const result = await memoryMonitor.monitor();

				expect(result.action).toBe("block");
				expect(logger.info).toHaveBeenCalledWith(
					"Memory cleanup completed",
					expect.objectContaining({ aggressive: true }),
				);
			});
		});

		describe("Edge Cases", () => {
			it("should handle exact boundary condition at 70.00%", async () => {
				// Allocate exactly 70%
				memoryMonitor.allocateMemory(140 * 1024 * 1024);

				const stats = memoryMonitor.getMemoryStats();
				expect(stats.percentage).toBe(70);

				const threshold = memoryMonitor.checkThreshold();
				expect(threshold.level).toBe("warning");
			});

			it("should handle exact boundary condition at 85.00%", async () => {
				// Allocate exactly 85%
				memoryMonitor.allocateMemory(170 * 1024 * 1024);

				const threshold = memoryMonitor.checkThreshold();
				expect(threshold.level).toBe("critical");
				expect(threshold.shouldCleanup).toBe(true);
			});

			it("should handle exact boundary condition at 95.00%", async () => {
				// Allocate exactly 95%
				memoryMonitor.allocateMemory(190 * 1024 * 1024);

				const threshold = memoryMonitor.checkThreshold();
				expect(threshold.level).toBe("emergency");
			});

			it("should handle rapid memory spikes", async () => {
				// Simulate rapid allocation from 50% to 90%
				memoryMonitor.allocateMemory(100 * 1024 * 1024); // 50%
				expect(memoryMonitor.checkThreshold().level).toBe("normal");

				// Sudden spike
				memoryMonitor.allocateMemory(80 * 1024 * 1024); // Jump to 90%

				const threshold = memoryMonitor.checkThreshold();
				expect(threshold.level).toBe("critical");
			});

			it("should handle cleanup during memory pressure", async () => {
				// Cache snapshots and fill to ~86% (above critical)
				for (let i = 0; i < 10; i++) {
					memoryMonitor.cacheSnapshot(`snap_${i}`, "x".repeat(18 * 1024 * 1024)); // Increased to 18MB each
				}

				const beforePercentage = memoryMonitor.getMemoryStats().percentage;
				expect(beforePercentage).toBeGreaterThan(85);

				// Cleanup should reduce below critical
				await memoryMonitor.performCleanup(true);

				const afterPercentage = memoryMonitor.getMemoryStats().percentage;
				expect(afterPercentage).toBeLessThan(beforePercentage);
			});

			it("should track cleanup statistics", async () => {
				let stats = memoryMonitor.getCleanupStats();
				expect(stats.lastCleanupTime).toBe(0);
				expect(stats.minutesSinceCleanup).toBeNull();

				// Perform cleanup
				await memoryMonitor.performCleanup(false);

				stats = memoryMonitor.getCleanupStats();
				expect(stats.lastCleanupTime).toBeGreaterThan(0);
				expect(stats.minutesSinceCleanup).toBe(0);
			});

			it("should handle zero memory usage", () => {
				const stats = memoryMonitor.getMemoryStats();
				expect(stats.percentage).toBe(0);
				expect(stats.used).toBe(0);

				const threshold = memoryMonitor.checkThreshold();
				expect(threshold.level).toBe("normal");
			});

			it("should handle memory deallocation", () => {
				memoryMonitor.allocateMemory(100 * 1024 * 1024);
				expect(memoryMonitor.getMemoryStats().percentage).toBe(50);

				memoryMonitor.deallocateMemory(50 * 1024 * 1024);
				expect(memoryMonitor.getMemoryStats().percentage).toBe(25);
			});

			it("should not allow negative memory usage", () => {
				memoryMonitor.allocateMemory(10 * 1024 * 1024);
				memoryMonitor.deallocateMemory(20 * 1024 * 1024); // Try to free more than allocated

				const stats = memoryMonitor.getMemoryStats();
				expect(stats.used).toBe(0);
				expect(stats.percentage).toBe(0);
			});

			it("should handle reset operation", () => {
				// Set up state
				memoryMonitor.allocateMemory(100 * 1024 * 1024);
				memoryMonitor.cacheSnapshot("snap_1", "x".repeat(10 * 1024 * 1024));

				// Reset
				memoryMonitor.reset();

				const stats = memoryMonitor.getMemoryStats();
				expect(stats.percentage).toBe(0);
				expect(memoryMonitor.getCleanupStats().cachedSnapshots).toBe(0);
			});
		});
	});
});
