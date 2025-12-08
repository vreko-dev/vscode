import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	checkSessionPerfBudgets,
	getSessionPerfMonitor,
	initializeSessionPerfMonitor,
	recordSessionMetric,
	resetSessionPerfData,
	SESSION_PERF_BUDGETS,
} from "@vscode/performance/sessionPerfMonitor";
import { logger } from "@vscode/utils/logger";

// Mock the logger
vi.mock("../../../src/utils/logger.js", () => {
	return {
		logger: {
			debug: vi.fn(),
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn(),
		},
	};
});

describe("Session Performance Monitor", () => {
	beforeEach(() => {
		// Reset the performance monitor before each test
		resetSessionPerfData();
		initializeSessionPerfMonitor();

		// Clear mock calls
		vi.clearAllMocks();
	});

	it("should initialize session performance monitor", () => {
		const monitor = getSessionPerfMonitor();
		expect(monitor).toBeDefined();
	});

	it("should record and check performance budgets", () => {
		const monitor = getSessionPerfMonitor();
		expect(monitor).toBeDefined();

		if (monitor) {
			// Record some timings that are within budget
			const op1 = monitor.startOperation("sessionCoordinator.finalizeSession");
			// Simulate some work
			const start = performance.now();
			while (performance.now() - start < 10) {
				// Busy wait for 10ms
			}
			monitor.endOperation(op1);

			const op2 = monitor.startOperation("sessionCoordinator.finalizeSession");
			// Simulate some work
			const start2 = performance.now();
			while (performance.now() - start2 < 20) {
				// Busy wait for 20ms
			}
			monitor.endOperation(op2);

			// Check that budgets are met
			const budgetsMet = checkSessionPerfBudgets();
			expect(budgetsMet).toBe(true);
		}
	});

	it("should detect when performance budgets are exceeded", () => {
		const monitor = getSessionPerfMonitor();
		expect(monitor).toBeDefined();

		if (monitor) {
			// Record timings that exceed the budget
			const op1 = monitor.startOperation("sessionCoordinator.finalizeSession");
			// Simulate work that exceeds the budget
			const start = performance.now();
			while (
				performance.now() - start <
				SESSION_PERF_BUDGETS.sessionFinalization.p95 + 10
			) {
				// Busy wait to exceed the p95 budget
			}
			monitor.endOperation(op1);

			// Check that budgets are not met
			const budgetsMet = checkSessionPerfBudgets();
			expect(budgetsMet).toBe(false);

			// Verify that warnings were logged
			expect(logger.warn).toHaveBeenCalled();
		}
	});

	it("should record session metrics", () => {
		const monitor = getSessionPerfMonitor();
		expect(monitor).toBeDefined();

		if (monitor) {
			// Record a metric
			recordSessionMetric("session.fileCount", 15, {
				sessionId: "test-session",
			});

			// Verify that the metric was recorded
			const metrics = monitor.getMetrics();
			expect(metrics).toHaveLength(1);
			expect(metrics[0].name).toBe("session.fileCount");
			expect(metrics[0].value).toBe(15);
			expect(metrics[0].tags).toEqual({ sessionId: "test-session" });

			// Verify that info was logged
			expect(logger.info).toHaveBeenCalled();
		}
	});

	it("should handle uninitialized performance monitor gracefully", () => {
		// Reset the monitor
		resetSessionPerfData();

		// Check budgets when not initialized (should not fail)
		const budgetsMet = checkSessionPerfBudgets();
		expect(budgetsMet).toBe(true);

		// Record metric when not initialized (should not fail)
		expect(() => {
			recordSessionMetric("test.metric", 10);
		}).not.toThrow();
	});

	it("should reset performance data", () => {
		const monitor = getSessionPerfMonitor();
		expect(monitor).toBeDefined();

		if (monitor) {
			// Record some data
			const op1 = monitor.startOperation("sessionCoordinator.finalizeSession");
			monitor.endOperation(op1);
			recordSessionMetric("test.metric", 10);

			// Verify data exists
			expect(monitor.getTimings()).toHaveLength(1);
			expect(monitor.getMetrics()).toHaveLength(1);

			// Reset data
			resetSessionPerfData();

			// Verify data is cleared
			expect(monitor.getTimings()).toHaveLength(0);
			expect(monitor.getMetrics()).toHaveLength(0);
		}
	});
});
