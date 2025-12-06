import { beforeEach, describe, expect, it } from "vitest";
import { PerformanceMonitor } from "../../../src/performance/PerformanceMonitor";

describe("PerformanceMonitor Memory Leak", () => {
	let monitor: PerformanceMonitor;

	beforeEach(() => {
		monitor = new PerformanceMonitor();
	});

	describe("Memory Growth Issue", () => {
		it("should demonstrate memory leak with continuous operations", () => {
			// Simulate a long-running session with many operations
			const operationCount = 1000;

			for (let i = 0; i < operationCount; i++) {
				const operationId = monitor.startOperation(`operation-${i}`);
				// Simulate some work
				const _testData = new Array(100).fill(`data-${i}`);
				monitor.endOperation(operationId);
				monitor.recordMetric(`metric-${i}`, i);
			}

			// Check that all operations and metrics are retained (demonstrating the leak)
			const timings = monitor.getTimings();
			const metrics = monitor.getMetrics();

			// This shows the problem - all data is retained indefinitely
			expect(timings).toHaveLength(operationCount);
			expect(metrics).toHaveLength(operationCount);

			// In a real long-running session, this would cause steady memory growth
		});

		it("should demonstrate that reset is currently the only way to clear data", () => {
			// Add some data
			const operationId = monitor.startOperation("test-op");
			monitor.endOperation(operationId);
			monitor.recordMetric("test-metric", 42);

			expect(monitor.getTimings()).toHaveLength(1);
			expect(monitor.getMetrics()).toHaveLength(1);

			// Currently, reset is the only way to clear data
			monitor.reset();

			expect(monitor.getTimings()).toHaveLength(0);
			expect(monitor.getMetrics()).toHaveLength(0);
		});
	});
});
