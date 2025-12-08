import { beforeEach, describe, expect, it } from "vitest";
import {
	PerformanceMonitor,
	type PerformanceMonitorConfig,
} from "@vscode/performance/PerformanceMonitor";

describe("PerformanceMonitor", () => {
	let monitor: PerformanceMonitor;

	beforeEach(() => {
		monitor = new PerformanceMonitor();
	});

	describe("Configuration", () => {
		it("should use default configuration when none provided", () => {
			const config = monitor.getConfig();
			expect(config.enabled).toBe(true);
			expect(config.samplingRate).toBe(1.0);
			expect(config.outputFormat).toBe("console");
		});

		it("should accept custom configuration", () => {
			const customConfig: PerformanceMonitorConfig = {
				enabled: false,
				samplingRate: 0.5,
				outputFormat: "json",
			};
			const customMonitor = new PerformanceMonitor(customConfig);
			const config = customMonitor.getConfig();
			expect(config.enabled).toBe(false);
			expect(config.samplingRate).toBe(0.5);
			expect(config.outputFormat).toBe("json");
		});

		it("should allow configuration updates", () => {
			monitor.setConfig({ enabled: false, samplingRate: 0.1 });
			const config = monitor.getConfig();
			expect(config.enabled).toBe(false);
			expect(config.samplingRate).toBe(0.1);
		});
	});

	describe("Operation Timing", () => {
		it("should track operation timing", () => {
			const operationId = monitor.startOperation("test-operation");
			expect(operationId).toBeTruthy();

			// Simulate some work
			const start = Date.now();
			while (Date.now() - start < 10) {
				// Busy wait for 10ms
			}

			const duration = monitor.endOperation(operationId);
			expect(duration).toBeGreaterThan(5);
			expect(duration).toBeLessThan(50); // Allow some tolerance

			const timings = monitor.getTimings();
			expect(timings).toHaveLength(1);
			expect(timings[0].operationName).toBe("test-operation");
			expect(timings[0].duration).toBeCloseTo(duration!, 1);
		});

		it("should handle ending non-existent operations gracefully", () => {
			const duration = monitor.endOperation("non-existent-id");
			expect(duration).toBeNull();
		});

		it("should handle null operation IDs gracefully", () => {
			const duration = monitor.endOperation(null);
			expect(duration).toBeNull();
		});

		it("should track memory usage during operations", () => {
			const operationId = monitor.startOperation("memory-test");
			expect(operationId).toBeTruthy();

			// Create some data to affect memory usage
			const _testData = new Array(1000).fill("test-data");

			const duration = monitor.endOperation(operationId);
			expect(duration).toBeGreaterThan(0);

			const timings = monitor.getTimings();
			expect(timings).toHaveLength(1);
			expect(timings[0].memoryUsage).toBeDefined();
			expect(timings[0].memoryUsage?.start).toBeDefined();
			expect(timings[0].memoryUsage?.end).toBeDefined();
			expect(timings[0].memoryUsage?.diff).toBeDefined();
		});
	});

	describe("Metrics Collection", () => {
		it("should record custom metrics", () => {
			monitor.recordMetric("test-metric", 42);
			monitor.recordMetric("another-metric", 3.14, {
				tag1: "value1",
				tag2: 123,
			});

			const metrics = monitor.getMetrics();
			expect(metrics).toHaveLength(2);
			expect(metrics[0].name).toBe("test-metric");
			expect(metrics[0].value).toBe(42);
			expect(metrics[1].name).toBe("another-metric");
			expect(metrics[1].value).toBe(3.14);
			expect(metrics[1].tags).toEqual({ tag1: "value1", tag2: 123 });
		});

		it("should include timestamps with metrics", () => {
			const before = Date.now();
			monitor.recordMetric("timestamp-test", 100);
			const after = Date.now();

			const metrics = monitor.getMetrics();
			expect(metrics).toHaveLength(1);
			expect(metrics[0].timestamp).toBeGreaterThanOrEqual(before);
			expect(metrics[0].timestamp).toBeLessThanOrEqual(after);
		});
	});

	describe("Sampling", () => {
		it("should respect sampling rate configuration", () => {
			const lowSamplingMonitor = new PerformanceMonitor({
				samplingRate: 0.0,
			}); // 0% sampling
			const operationId = lowSamplingMonitor.startOperation(
				"should-not-be-tracked",
			);
			expect(operationId).toBeNull();

			lowSamplingMonitor.recordMetric("should-not-be-recorded", 1);
			expect(lowSamplingMonitor.getMetrics()).toHaveLength(0);
		});

		it("should track all operations when sampling rate is 1.0", () => {
			const fullSamplingMonitor = new PerformanceMonitor({
				samplingRate: 1.0,
			}); // 100% sampling
			const operationId =
				fullSamplingMonitor.startOperation("should-be-tracked");
			expect(operationId).toBeTruthy();

			fullSamplingMonitor.recordMetric("should-be-recorded", 1);
			expect(fullSamplingMonitor.getMetrics()).toHaveLength(1);
		});
	});

	describe("Reset Functionality", () => {
		it("should clear all collected data", () => {
			// Add some data
			monitor.startOperation("test1");
			monitor.recordMetric("metric1", 1);

			expect(monitor.getTimings()).toHaveLength(1);
			expect(monitor.getMetrics()).toHaveLength(1);

			// Reset and verify
			monitor.reset();
			expect(monitor.getTimings()).toHaveLength(0);
			expect(monitor.getMetrics()).toHaveLength(0);
		});
	});

	describe("Disabled Monitoring", () => {
		it("should not track operations when disabled", () => {
			const disabledMonitor = new PerformanceMonitor({ enabled: false });
			const operationId = disabledMonitor.startOperation("should-not-track");
			expect(operationId).toBeNull();

			disabledMonitor.recordMetric("should-not-record", 1);
			expect(disabledMonitor.getMetrics()).toHaveLength(0);
		});
	});
});
