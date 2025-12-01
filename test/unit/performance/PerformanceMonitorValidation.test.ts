import { beforeEach, describe, expect, it } from "vitest";
import { PerformanceMonitor } from "../../../src/performance/PerformanceMonitor.js";

describe("PerformanceMonitor Configuration Validation", () => {
	let monitor: PerformanceMonitor;

	beforeEach(() => {
		monitor = new PerformanceMonitor();
	});

	describe("Negative Values Validation", () => {
		it("should clamp negative maxTimings to 0 (unlimited)", () => {
			// Set negative maxTimings
			monitor.setConfig({ maxTimings: -1 });

			const config = monitor.getConfig();
			expect(config.maxTimings).toBe(0); // Should be clamped to 0
		});

		it("should clamp negative maxMetrics to 0 (unlimited)", () => {
			// Set negative maxMetrics
			monitor.setConfig({ maxMetrics: -5 });

			const config = monitor.getConfig();
			expect(config.maxMetrics).toBe(0); // Should be clamped to 0
		});

		it("should accept zero values as unlimited", () => {
			// Set zero values
			monitor.setConfig({ maxTimings: 0, maxMetrics: 0 });

			const config = monitor.getConfig();
			expect(config.maxTimings).toBe(0);
			expect(config.maxMetrics).toBe(0);
		});

		it("should accept positive values normally", () => {
			// Set positive values
			monitor.setConfig({ maxTimings: 100, maxMetrics: 50 });

			const config = monitor.getConfig();
			expect(config.maxTimings).toBe(100);
			expect(config.maxMetrics).toBe(50);
		});
	});

	describe("PerformanceMonitor Operation with Clamped Values", () => {
		it("should not cause infinite loops with clamped negative maxTimings", () => {
			// Set negative maxTimings (should be clamped to 0)
			monitor.setConfig({ maxTimings: -1, outputFormat: "silent" });

			// Add multiple operations
			const operationIds = [];
			for (let i = 0; i < 5; i++) {
				const operationId = monitor.startOperation(`test-${i}`);
				operationIds.push(operationId);
			}

			// End all operations
			for (const operationId of operationIds) {
				monitor.endOperation(operationId);
			}

			// Get timings - should work without infinite loops
			const timings = monitor.getTimings();
			expect(timings).toHaveLength(5);

			// No infinite loop should occur
		});

		it("should not cause issues with clamped negative maxMetrics", () => {
			// Set negative maxMetrics (should be clamped to 0)
			monitor.setConfig({ maxMetrics: -5, outputFormat: "silent" });

			// Add multiple metrics
			for (let i = 0; i < 5; i++) {
				monitor.recordMetric(`test-${i}`, i);
			}

			// Get metrics - should work without issues
			const metrics = monitor.getMetrics();
			expect(metrics).toHaveLength(5);

			// No trimming should occur since maxMetrics is 0 (unlimited)
		});
	});
});
