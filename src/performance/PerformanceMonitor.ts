/**
 * Performance Monitor - Tracks timing, memory usage, and custom metrics
 *
 * This class provides lightweight performance monitoring capabilities with
 * minimal overhead. It tracks operation timing, memory usage, and custom metrics
 * while being configurable to minimize performance impact.
 *
 * Features:
 * - Operation timing with start/end tracking
 * - Memory usage monitoring
 * - Custom metric collection
 * - Configurable sampling rate
 * - Multiple output formats
 *
 * @example
 * ```typescript
 * const monitor = new PerformanceMonitor({ enabled: true, samplingRate: 0.1 });
 * const operationId = monitor.startOperation('createCheckpoint');
 * // ... perform operation ...
 * monitor.endOperation(operationId);
 * ```
 */

import { logger } from "../utils/logger.js";

export interface PerformanceMonitorConfig {
	/** Enable/disable performance monitoring */
	enabled?: boolean;
	/** Sampling rate (0.0 to 1.0) - percentage of operations to monitor */
	samplingRate?: number;
	/** Output format for metrics */
	outputFormat?: "console" | "json" | "silent";
	/** Maximum number of timing entries to retain (0 = unlimited) */
	maxTimings?: number;
	/** Maximum number of metric entries to retain (0 = unlimited) */
	maxMetrics?: number;
}

export interface OperationTiming {
	operationName: string;
	startTime: number;
	endTime?: number;
	duration?: number;
	memoryUsage?: {
		start: NodeJS.MemoryUsage;
		end?: NodeJS.MemoryUsage;
		diff?: Partial<NodeJS.MemoryUsage>;
	};
}

export interface Metric {
	name: string;
	value: number;
	timestamp: number;
	tags?: Record<string, string | number>;
}

export class PerformanceMonitor {
	private config: Required<PerformanceMonitorConfig>;
	private timings: Map<string, OperationTiming>;
	private metrics: Metric[];
	private nextId: number;

	constructor(config: PerformanceMonitorConfig = {}) {
		this.config = {
			enabled: config.enabled ?? true,
			samplingRate: config.samplingRate ?? 1.0,
			outputFormat: config.outputFormat ?? "console",
			maxTimings: config.maxTimings ?? 1000, // Default to 1000 entries to prevent memory leaks
			maxMetrics: config.maxMetrics ?? 1000, // Default to 1000 entries to prevent memory leaks
		};

		this.timings = new Map();
		this.metrics = [];
		this.nextId = 0;
	}

	/**
	 * Start tracking an operation
	 * @param operationName Name of the operation
	 * @returns Operation ID for tracking
	 */
	startOperation(operationName: string): string | null {
		// Check if monitoring is enabled and if we should sample this operation
		if (!this.config.enabled || Math.random() > this.config.samplingRate) {
			return null;
		}

		const id = `op_${this.nextId++}_${Date.now()}`;
		const timing: OperationTiming = {
			operationName,
			startTime: performance.now(),
			memoryUsage: {
				start: process.memoryUsage(),
			},
		};

		this.timings.set(id, timing);
		return id;
	}

	/**
	 * End tracking an operation
	 * @param operationId Operation ID returned by startOperation
	 * @returns Duration in milliseconds, or null if not tracked
	 */
	endOperation(operationId: string | null): number | null {
		if (!operationId || !this.timings.has(operationId)) {
			return null;
		}

		const timing = this.timings.get(operationId);
		if (!timing) return null;
		timing.endTime = performance.now();
		timing.duration = timing.endTime - timing.startTime;

		// Capture end memory usage
		if (timing.memoryUsage) {
			timing.memoryUsage.end = process.memoryUsage();
			timing.memoryUsage.diff = this.calculateMemoryDiff(
				timing.memoryUsage.start,
				timing.memoryUsage.end,
			);
		}

		this.timings.set(operationId, timing);

		// Output timing if configured
		if (this.config.outputFormat === "console") {
			logger.info(
				`[PERF] ${timing.operationName}: ${timing.duration.toFixed(2)}ms`,
			);
			if (timing.memoryUsage?.diff) {
				logger.info(`[MEM] ${timing.operationName}:`, timing.memoryUsage.diff);
			}
		}

		// Remove completed timing if maxTimings limit is set
		if (this.config.maxTimings > 0) {
			// Keep only the most recent timings
			while (this.timings.size > this.config.maxTimings) {
				// Remove the oldest entry
				const firstKey = this.timings.keys().next().value;
				if (firstKey) {
					this.timings.delete(firstKey);
				} else {
					break; // Safety break
				}
			}
		}

		return timing.duration;
	}

	/**
	 * Record a custom metric
	 * @param name Metric name
	 * @param value Metric value
	 * @param tags Optional tags for the metric
	 */
	recordMetric(
		name: string,
		value: number,
		tags?: Record<string, string | number>,
	): void {
		if (!this.config.enabled || Math.random() > this.config.samplingRate) {
			return;
		}

		const metric: Metric = {
			name,
			value,
			timestamp: Date.now(),
			tags,
		};

		this.metrics.push(metric);

		// Apply maxMetrics limit if configured
		if (
			this.config.maxMetrics > 0 &&
			this.metrics.length > this.config.maxMetrics
		) {
			// Remove oldest metrics to maintain the limit
			const itemsToRemove = this.metrics.length - this.config.maxMetrics;
			this.metrics.splice(0, itemsToRemove);

			// Log warning if we're removing a significant number of items
			if (itemsToRemove > 10) {
				logger.warn(
					`PerformanceMonitor: Removed ${itemsToRemove} old metrics to maintain limit of ${this.config.maxMetrics}`,
				);
			}
		}

		if (this.config.outputFormat === "console") {
			logger.info(`[METRIC] ${name}: ${value}`, tags || "");
		}
	}

	/**
	 * Get all collected timings
	 */
	getTimings(): OperationTiming[] {
		return Array.from(this.timings.values());
	}

	/**
	 * Get all collected metrics
	 */
	getMetrics(): Metric[] {
		return [...this.metrics];
	}

	/**
	 * Reset all collected data
	 */
	reset(): void {
		this.timings.clear();
		this.metrics = [];
		this.nextId = 0;
	}

	/**
	 * Get current configuration
	 */
	getConfig(): Required<PerformanceMonitorConfig> {
		return { ...this.config };
	}

	/**
	 * Update configuration
	 */
	setConfig(config: PerformanceMonitorConfig): void {
		this.config = {
			...this.config,
			...config,
		};

		// Validate and clamp maxTimings and maxMetrics to prevent negative values
		if (this.config.maxTimings < 0) {
			this.config.maxTimings = 0; // 0 means unlimited
		}
		if (this.config.maxMetrics < 0) {
			this.config.maxMetrics = 0; // 0 means unlimited
		}
	}

	/**
	 * Calculate memory usage difference
	 */
	private calculateMemoryDiff(
		start: NodeJS.MemoryUsage,
		end: NodeJS.MemoryUsage,
	): Partial<NodeJS.MemoryUsage> {
		const diff: Partial<NodeJS.MemoryUsage> = {};

		for (const key in start) {
			const k = key as keyof NodeJS.MemoryUsage;
			if (end[k] !== undefined) {
				diff[k] = end[k] - start[k];
			}
		}

		return diff;
	}
}
