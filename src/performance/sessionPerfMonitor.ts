/**
 * Session Performance Monitor - Tracks session-related performance metrics
 *
 * This module provides performance monitoring specifically for session operations
 * including session finalization, storage operations, and manifest creation.
 * It enforces performance budgets and provides detailed metrics for optimization.
 *
 * Performance Budgets:
 * - Session finalization: avg < 50ms, p95 < 100ms
 * - Session storage: avg < 30ms, p95 < 50ms
 * - Manifest creation: avg < 20ms, p95 < 40ms
 */

import { logger } from "../utils/logger.js";
import { PerformanceMonitor } from "./PerformanceMonitor.js";

// Performance budgets in milliseconds
export const SESSION_PERF_BUDGETS = {
	sessionFinalization: {
		avg: 50,
		p95: 100,
	},
	sessionStorage: {
		avg: 30,
		p95: 50,
	},
	manifestCreation: {
		avg: 20,
		p95: 40,
	},
};

// Global session performance monitor instance
let sessionPerfMonitor: PerformanceMonitor | null = null;

/**
 * Initialize the session performance monitor
 */
export function initializeSessionPerfMonitor(): void {
	if (!sessionPerfMonitor) {
		sessionPerfMonitor = new PerformanceMonitor({
			enabled: true,
			samplingRate: 1.0, // Monitor all session operations
			outputFormat: "console",
			maxTimings: 1000,
			maxMetrics: 1000,
		});
	}
}

/**
 * Get the session performance monitor instance
 */
export function getSessionPerfMonitor(): PerformanceMonitor | null {
	return sessionPerfMonitor;
}

/**
 * Check if performance budgets are met
 * @returns True if all budgets are met, false otherwise
 */
export function checkSessionPerfBudgets(): boolean {
	if (!sessionPerfMonitor) {
		logger.warn("Session performance monitor not initialized");
		return true; // Don't fail if not initialized
	}

	const timings = sessionPerfMonitor.getTimings();
	if (timings.length === 0) {
		return true; // No timings to check
	}

	// Group timings by operation name
	const timingGroups: Record<string, number[]> = {};
	for (const timing of timings) {
		if (timing.duration !== undefined) {
			if (!timingGroups[timing.operationName]) {
				timingGroups[timing.operationName] = [];
			}
			timingGroups[timing.operationName].push(timing.duration);
		}
	}

	// Check each operation against its budget
	let allBudgetsMet = true;
	for (const [operationName, durations] of Object.entries(timingGroups)) {
		if (durations.length === 0) continue;

		// Calculate average and 95th percentile
		const avg = durations.reduce((sum, d) => sum + d, 0) / durations.length;
		const sorted = [...durations].sort((a, b) => a - b);
		const p95Index = Math.floor(sorted.length * 0.95);
		const p95 = sorted[p95Index];

		// Check against budgets
		let budgetCheck = true;
		if (operationName.includes("finalizeSession")) {
			if (avg > SESSION_PERF_BUDGETS.sessionFinalization.avg) {
				logger.warn(
					`Session finalization average duration ${avg.toFixed(2)}ms exceeds budget of ${SESSION_PERF_BUDGETS.sessionFinalization.avg}ms`,
				);
				budgetCheck = false;
			}
			if (p95 > SESSION_PERF_BUDGETS.sessionFinalization.p95) {
				logger.warn(
					`Session finalization 95th percentile duration ${p95.toFixed(2)}ms exceeds budget of ${SESSION_PERF_BUDGETS.sessionFinalization.p95}ms`,
				);
				budgetCheck = false;
			}
		} else if (operationName.includes("storeSessionManifest")) {
			if (avg > SESSION_PERF_BUDGETS.sessionStorage.avg) {
				logger.warn(
					`Session storage average duration ${avg.toFixed(2)}ms exceeds budget of ${SESSION_PERF_BUDGETS.sessionStorage.avg}ms`,
				);
				budgetCheck = false;
			}
			if (p95 > SESSION_PERF_BUDGETS.sessionStorage.p95) {
				logger.warn(
					`Session storage 95th percentile duration ${p95.toFixed(2)}ms exceeds budget of ${SESSION_PERF_BUDGETS.sessionStorage.p95}ms`,
				);
				budgetCheck = false;
			}
		} else if (operationName.includes("createSessionManifest")) {
			if (avg > SESSION_PERF_BUDGETS.manifestCreation.avg) {
				logger.warn(
					`Manifest creation average duration ${avg.toFixed(2)}ms exceeds budget of ${SESSION_PERF_BUDGETS.manifestCreation.avg}ms`,
				);
				budgetCheck = false;
			}
			if (p95 > SESSION_PERF_BUDGETS.manifestCreation.p95) {
				logger.warn(
					`Manifest creation 95th percentile duration ${p95.toFixed(2)}ms exceeds budget of ${SESSION_PERF_BUDGETS.manifestCreation.p95}ms`,
				);
				budgetCheck = false;
			}
		}

		if (!budgetCheck) {
			allBudgetsMet = false;
			logger.info(
				`Performance data for ${operationName}: avg=${avg.toFixed(2)}ms, p95=${p95.toFixed(2)}ms, samples=${durations.length}`,
			);
		}
	}

	return allBudgetsMet;
}

/**
 * Reset performance monitoring data
 */
export function resetSessionPerfData(): void {
	if (sessionPerfMonitor) {
		sessionPerfMonitor.reset();
	}
}

/**
 * Record a session performance metric
 * @param name Metric name
 * @param value Metric value
 * @param tags Optional tags
 */
export function recordSessionMetric(
	name: string,
	value: number,
	tags?: Record<string, string | number>,
): void {
	if (sessionPerfMonitor) {
		sessionPerfMonitor.recordMetric(name, value, tags);
	}
}
