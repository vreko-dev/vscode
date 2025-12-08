import { beforeEach, describe, expect, it } from "vitest";
import { PerformanceMonitor } from "@vscode/performance/PerformanceMonitor";

describe("PerformanceMonitor Configuration Validation Fixed", () => {
	let monitor: PerformanceMonitor;

	beforeEach(() => {
		monitor = new PerformanceMonitor();
	});

	describe("Negative Values Validation Fixed", () => {
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
});
