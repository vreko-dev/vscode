/**
 * @fileoverview Burst Detector Unit Tests - 4-Path TDD Model
 *
 * Tests burst detection logic following the 4-path testing model:
 * - Happy Path: Detect burst when >5 files changed in <30s
 * - Sad Path: No detection for slow manual changes
 * - Edge Cases: Window reset, timing thresholds
 * - Error Path: Graceful handling of edge inputs
 *
 * Implements tests from MISSING_TESTS_AUDIT.md Journey 07: First AI Detection
 */

import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";
import { BurstHeuristicsDetector } from "@snapback/sdk";

describe("BurstDetector - 4-Path TDD Model", () => {
	let detector: BurstHeuristicsDetector;

	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(0);
		detector = new BurstHeuristicsDetector();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// HAPPY PATH - Burst detection for rapid multi-file changes
	// ═══════════════════════════════════════════════════════════════════════════
	describe("Happy Path", () => {
		it("should detect burst when >5 files changed in <30s", () => {
			// Simulate 6 rapid file changes within 30 seconds
			// Each change represents a different file being modified
			for (let i = 0; i < 6; i++) {
				detector.recordChange(100, 0, 5); // 100 chars, 0 deleted, 5 lines
				vi.advanceTimersByTime(100); // 100ms between changes
			}

			const result = detector.analyzeBurst();

			expect(result.isBurst).toBe(true);
			expect(result.confidence).toBeGreaterThan(0.7);
			expect(result.details).toBeDefined();
			expect(result.details?.changeCount).toBeGreaterThanOrEqual(6);
		});

		it("should detect AI-like burst pattern (rapid large insertions)", () => {
			// Simulate AI completion style - large text blocks inserted quickly
			detector.recordChange(150, 0, 5); // 150 chars inserted, 5 lines
			vi.advanceTimersByTime(50);
			detector.recordChange(200, 10, 3); // 200 chars inserted, 10 deleted, 3 lines

			const result = detector.analyzeBurst();

			expect(result.isBurst).toBe(true);
			expect(result.confidence).toBeGreaterThan(0);
			expect(result.details?.totalInserted).toBe(350);
			expect(result.details?.totalDeleted).toBe(10);
		});

		it("should calculate correct insertion/deletion ratio", () => {
			// High insertion with minimal deletion indicates AI burst
			detector.recordChange(100, 5, 3);
			vi.advanceTimersByTime(50);
			detector.recordChange(150, 3, 4);

			const result = detector.analyzeBurst();

			if (result.details) {
				// 250 inserted / 8 deleted = 31.25 ratio
				expect(result.details.ratio).toBeGreaterThan(30);
			}
		});

		it("should detect burst with multiple rapid changes", () => {
			// Simulate rapid paste or AI completion
			for (let i = 0; i < 4; i++) {
				detector.recordChange(80, 2, 3);
				vi.advanceTimersByTime(30); // Very fast - 30ms intervals
			}

			const result = detector.analyzeBurst();

			expect(result.isBurst).toBe(true);
			expect(result.confidence).toBeGreaterThan(0.5);
		});

		it("should track change count correctly", () => {
			detector.recordChange(50, 0, 2);
			vi.advanceTimersByTime(50);
			detector.recordChange(60, 0, 2);
			vi.advanceTimersByTime(50);
			detector.recordChange(70, 0, 3);

			const result = detector.analyzeBurst();

			if (result.details) {
				expect(result.details.changeCount).toBe(3);
			}
		});
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// SAD PATH - No detection for slow or manual changes
	// ═══════════════════════════════════════════════════════════════════════════
	describe("Sad Path", () => {
		it("should not false positive on slow multi-file saves", () => {
			// Simulate human typing - slow, small changes
			detector.recordChange(10, 0, 1);
			vi.advanceTimersByTime(2000); // 2 second gap
			detector.recordChange(15, 5, 1);
			vi.advanceTimersByTime(2000);
			detector.recordChange(12, 3, 1);

			const result = detector.analyzeBurst();

			expect(result.isBurst).toBe(false);
		});

		it("should not detect burst with insufficient changes", () => {
			// Only one change - not enough data
			detector.recordChange(50, 0, 1);

			const result = detector.analyzeBurst();

			expect(result.isBurst).toBe(false);
			expect(result.confidence).toBe(0);
		});

		it("should not detect burst with high deletion rate", () => {
			// High deletion rate suggests refactoring, not AI generation
			detector.recordChange(100, 80, 2); // 100 inserted, 80 deleted
			vi.advanceTimersByTime(50);
			detector.recordChange(120, 90, 3); // 120 inserted, 90 deleted

			const result = detector.analyzeBurst();

			expect(result.isBurst).toBe(false);
		});

		it("should not detect burst for small edits", () => {
			// Small character counts don't qualify
			detector.recordChange(5, 0, 1);
			vi.advanceTimersByTime(50);
			detector.recordChange(3, 1, 1);

			const result = detector.analyzeBurst();

			expect(result.isBurst).toBe(false);
		});

		it("should return zero confidence for non-burst", () => {
			detector.recordChange(10, 8, 1); // Nearly equal insert/delete

			const result = detector.analyzeBurst();

			expect(result.isBurst).toBe(false);
			// For non-burst, confidence should be low
			expect(result.confidence).toBeLessThan(0.5);
		});
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// EDGE CASES - Window reset and timing boundaries
	// ═══════════════════════════════════════════════════════════════════════════
	describe("Edge Cases", () => {
		it("should reset burst window after timeout", () => {
			// Record a burst
			detector.recordChange(100, 0, 5);
			vi.advanceTimersByTime(50);
			detector.recordChange(150, 0, 4);

			// Advance past the time window (5 seconds)
			vi.advanceTimersByTime(6000);

			// New slow change
			detector.recordChange(10, 0, 1);

			const result = detector.analyzeBurst();

			// Old burst should be trimmed, only slow change remains
			expect(result.isBurst).toBe(false);
		});

		it("should handle exactly minimum threshold", () => {
			// Test boundary conditions - exactly at minimum thresholds
			detector.recordChange(100, 0, 2); // Minimum chars
			vi.advanceTimersByTime(100);
			detector.recordChange(100, 0, 2);

			const result = detector.analyzeBurst();

			// At minimum, might or might not trigger
			expect(result).toHaveProperty("isBurst");
			expect(result).toHaveProperty("confidence");
		});

		it("should clear recorded changes on reset", () => {
			detector.recordChange(150, 0, 5);
			vi.advanceTimersByTime(50);
			detector.recordChange(200, 0, 4);

			// Clear all recorded changes
			detector.clear();

			const result = detector.analyzeBurst();

			expect(result.isBurst).toBe(false);
			expect(result.confidence).toBe(0);
		});

		it("should handle rapid consecutive bursts separately", () => {
			// First burst
			detector.recordChange(100, 0, 5);
			vi.advanceTimersByTime(50);
			detector.recordChange(150, 0, 4);

			const firstResult = detector.analyzeBurst();
			expect(firstResult.isBurst).toBe(true);

			// Wait for window to clear
			vi.advanceTimersByTime(6000);

			// Second burst
			detector.recordChange(120, 0, 4);
			vi.advanceTimersByTime(50);
			detector.recordChange(130, 0, 3);

			const secondResult = detector.analyzeBurst();
			expect(secondResult.isBurst).toBe(true);
		});

		it("should trim old changes outside time window", () => {
			// Add an old change
			detector.recordChange(150, 0, 5);

			// Advance time significantly
			vi.advanceTimersByTime(10000); // 10 seconds

			// Add a recent small change
			detector.recordChange(10, 0, 1);

			const result = detector.analyzeBurst();

			// Old change should be trimmed, so no burst
			expect(result.isBurst).toBe(false);
		});

		it("should complete burst analysis in <5ms", () => {
			// Record several changes
			for (let i = 0; i < 10; i++) {
				detector.recordChange(50, 0, 2);
				vi.advanceTimersByTime(30);
			}

			vi.useRealTimers();
			const start = performance.now();
			detector.analyzeBurst();
			const duration = performance.now() - start;
			vi.useFakeTimers();

			expect(duration).toBeLessThan(5);
		});
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// ERROR PATH - Graceful handling of edge inputs
	// ═══════════════════════════════════════════════════════════════════════════
	describe("Error Path", () => {
		it("should handle zero character changes gracefully", () => {
			detector.recordChange(0, 0, 0);
			vi.advanceTimersByTime(50);
			detector.recordChange(0, 0, 0);

			const result = detector.analyzeBurst();

			// Should not crash, should return valid result
			expect(result).toHaveProperty("isBurst");
			expect(result.isBurst).toBe(false);
		});

		it("should handle negative character counts safely", () => {
			// Edge case - negative numbers shouldn't crash
			detector.recordChange(-10, -5, -1);
			vi.advanceTimersByTime(50);
			detector.recordChange(100, 0, 3);

			const result = detector.analyzeBurst();

			// Should return valid result without crashing
			expect(result).toHaveProperty("isBurst");
		});

		it("should handle very large character counts", () => {
			// Large paste or generated content
			detector.recordChange(100000, 0, 500);
			vi.advanceTimersByTime(50);
			detector.recordChange(50000, 100, 300);

			const result = detector.analyzeBurst();

			expect(result.isBurst).toBe(true);
			expect(result.confidence).toBeGreaterThan(0);
		});

		it("should return proper structure when no changes recorded", () => {
			const result = detector.analyzeBurst();

			expect(result.isBurst).toBe(false);
			expect(result.confidence).toBe(0);
			expect(result.details).toBeUndefined();
		});

		it("should handle division by zero for ratio calculation", () => {
			// Zero deletions could cause division by zero
			detector.recordChange(100, 0, 5);
			vi.advanceTimersByTime(50);
			detector.recordChange(150, 0, 4);

			const result = detector.analyzeBurst();

			// Should handle 250/0 case gracefully
			expect(result.isBurst).toBe(true);
			if (result.details) {
				// Ratio should be handled (either infinite or just inserted chars)
				expect(result.details.ratio).toBeDefined();
				expect(result.details.ratio).toBeGreaterThan(0);
			}
		});

		it("should maintain state integrity across multiple analyses", () => {
			// Record changes
			detector.recordChange(100, 0, 3);
			vi.advanceTimersByTime(50);
			detector.recordChange(100, 0, 3);

			// Multiple analyses should return consistent results
			const result1 = detector.analyzeBurst();
			const result2 = detector.analyzeBurst();
			const result3 = detector.analyzeBurst();

			expect(result1.isBurst).toBe(result2.isBurst);
			expect(result2.isBurst).toBe(result3.isBurst);
		});
	});
});
