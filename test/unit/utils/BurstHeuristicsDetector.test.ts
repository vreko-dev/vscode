/**
 * @fileoverview Tests for BurstHeuristicsDetector
 */

import { BurstHeuristicsDetector } from "@snapback/sdk";
import { beforeEach, describe, expect, it } from "vitest";

describe("BurstHeuristicsDetector", () => {
	let detector: BurstHeuristicsDetector;

	beforeEach(() => {
		detector = new BurstHeuristicsDetector();
	});

	it("should initialize with empty state", () => {
		const result = detector.analyzeBurst();
		expect(result.isBurst).toBe(false);
		expect(result.confidence).toBe(0);
	});

	it("should not detect burst with insufficient changes", () => {
		detector.recordChange(50, 0, 1);
		const result = detector.analyzeBurst();
		expect(result.isBurst).toBe(false);
	});

	it("should detect burst with rapid large insertions", () => {
		// Simulate rapid AI-style insertion
		detector.recordChange(150, 0, 5); // 150 chars inserted, 5 lines
		detector.recordChange(200, 10, 3); // 200 chars inserted, 10 deleted, 3 lines

		const result = detector.analyzeBurst();
		expect(result.isBurst).toBe(true);
		expect(result.confidence).toBeGreaterThan(0);
		expect(result.details).toBeDefined();
		if (result.details) {
			expect(result.details.totalInserted).toBe(350);
			expect(result.details.totalDeleted).toBe(10);
			expect(result.details.ratio).toBe(35); // 350/10
			expect(result.details.changeCount).toBe(2);
		}
	});

	it("should not detect burst with slow typing", () => {
		// Simulate slow human typing with delays
		detector.recordChange(10, 0, 1);

		// Manually manipulate timestamps to simulate delay
		(detector as any).recentChanges[0].timestamp = Date.now() - 1000;
		(detector as any).lastChangeTime = Date.now() - 1000;

		detector.recordChange(15, 5, 1);

		const result = detector.analyzeBurst();
		expect(result.isBurst).toBe(false);
	});

	it("should not detect burst with high deletion rate", () => {
		// High deletion rate shouldn't trigger burst detection
		detector.recordChange(100, 80, 2); // 100 inserted, 80 deleted
		detector.recordChange(120, 90, 3); // 120 inserted, 90 deleted

		const result = detector.analyzeBurst();
		expect(result.isBurst).toBe(false);
	});

	it("should clear recorded changes", () => {
		detector.recordChange(150, 0, 5);
		detector.clear();

		const result = detector.analyzeBurst();
		expect(result.isBurst).toBe(false);
		expect(result.confidence).toBe(0);
	});

	it("should trim old changes outside time window", () => {
		// Add an old change
		detector.recordChange(150, 0, 5);

		// Manually set the timestamp to be old
		(detector as any).recentChanges[0].timestamp = Date.now() - 10000; // 10 seconds ago

		// Add a recent change
		detector.recordChange(200, 10, 3);

		const result = detector.analyzeBurst();
		// Should only consider the recent change, so not enough for burst
		expect(result.isBurst).toBe(false);
	});
});
