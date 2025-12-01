import { beforeEach, describe, expect, it } from "vitest";
import { PerformanceMonitor } from "../../../src/performance/PerformanceMonitor.js";

describe("PerformanceMonitor Memory Leak Fixed", () => {
	let _monitor: PerformanceMonitor;

	beforeEach(() => {
		_monitor = new PerformanceMonitor();
	});

	describe("Memory Growth Fix", () => {
		it("should limit timing entries when maxTimings is configured", () => {
			// Create monitor with maxTimings limit
			const limitedMonitor = new PerformanceMonitor({
				maxTimings: 5,
				outputFormat: "silent",
			});

			// Add more operations than the limit
			for (let i = 0; i < 10; i++) {
				const operationId = limitedMonitor.startOperation(`operation-${i}`);
				limitedMonitor.endOperation(operationId);
			}

			// Should only retain the most recent entries
			const timings = limitedMonitor.getTimings();
			expect(timings).toHaveLength(5);

			// Should contain the most recent operations (5-9)
			const operationNames = timings.map((t) => t.operationName);
			expect(operationNames).toContain("operation-5");
			expect(operationNames).toContain("operation-9");
			expect(operationNames).not.toContain("operation-0");
			expect(operationNames).not.toContain("operation-4");
		});

		it("should limit metric entries when maxMetrics is configured", () => {
			// Create monitor with maxMetrics limit
			const limitedMonitor = new PerformanceMonitor({
				maxMetrics: 3,
				outputFormat: "silent",
			});

			// Add more metrics than the limit
			for (let i = 0; i < 8; i++) {
				limitedMonitor.recordMetric(`metric-${i}`, i);
			}

			// Should only retain the most recent entries
			const metrics = limitedMonitor.getMetrics();
			expect(metrics).toHaveLength(3);

			// Should contain the most recent metrics (5-7)
			const metricNames = metrics.map((m) => m.name);
			expect(metricNames).toContain("metric-5");
			expect(metricNames).toContain("metric-7");
			expect(metricNames).not.toContain("metric-0");
			expect(metricNames).not.toContain("metric-4");
		});

		it("should retain all entries when limits are set to 0 (unlimited)", () => {
			// Create monitor with unlimited entries (default)
			const unlimitedMonitor = new PerformanceMonitor({
				maxTimings: 0,
				maxMetrics: 0,
				outputFormat: "silent",
			});

			const operationCount = 50;

			// Add many operations and metrics
			for (let i = 0; i < operationCount; i++) {
				const operationId = unlimitedMonitor.startOperation(`operation-${i}`);
				unlimitedMonitor.endOperation(operationId);
				unlimitedMonitor.recordMetric(`metric-${i}`, i);
			}

			// Should retain all entries
			expect(unlimitedMonitor.getTimings()).toHaveLength(operationCount);
			expect(unlimitedMonitor.getMetrics()).toHaveLength(operationCount);
		});
	});
});
