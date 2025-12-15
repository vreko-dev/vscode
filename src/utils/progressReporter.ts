/**
 * ProgressReporter - Unified Progress Indicator Utility
 *
 * Consolidates 15+ scattered vscode.window.withProgress usages into a single,
 * consistent pattern with:
 * - Flicker prevention (operations <100ms don't show progress)
 * - Cancellation support
 * - Telemetry integration
 * - Accessibility considerations
 *
 * @module utils/progressReporter
 * @see TDD_CORE.md - Implementation follows TDD methodology
 */

import * as vscode from "vscode";

/** Default minimum duration before showing progress (prevents flicker) */
const DEFAULT_MIN_DURATION_MS = 100;

/** Brand prefix for all progress titles */
const BRAND_PREFIX = "SnapBack: ";

/**
 * Progress location type - maps to VS Code ProgressLocation
 */
export type ProgressLocationType = "notification" | "window";

/**
 * Telemetry event data for progress tracking
 */
export interface ProgressTelemetryEvent {
	operation: string;
	duration_ms: number;
	cancelled: boolean;
}

/**
 * Configuration for a progress operation
 */
export interface ProgressConfig {
	/** Title to display in progress indicator */
	title: string;

	/** Where to show progress: 'notification' for user-triggered, 'window' for auto */
	location: ProgressLocationType;

	/** Whether the operation can be cancelled (default: false) */
	cancellable?: boolean;

	/** Minimum duration before showing progress - prevents flicker (default: 100ms) */
	minDurationMs?: number;

	/** Operation type for telemetry (e.g., 'snapshot_create', 'snapshot_restore') */
	operation?: string;
}

/**
 * Progress reporter passed to task callback
 */
export interface ProgressReport {
	/** Report progress update */
	report(value: { message?: string; increment?: number }): void;
}

/**
 * Cancellation token passed to task callback
 */
export interface CancellationToken {
	isCancellationRequested: boolean;
}

/**
 * Task function signature
 */
export type ProgressTask<T> = (reporter: ProgressReport, token: CancellationToken) => Promise<T>;

/**
 * Options for creating a ProgressReporter instance
 */
export interface ProgressReporterOptions {
	/** Callback for telemetry when progress completes */
	onProgressComplete?: (event: ProgressTelemetryEvent) => void;
}

/**
 * ProgressReporter class - manages progress indicators with consistent UX
 */
export class ProgressReporter {
	private readonly onProgressComplete?: (event: ProgressTelemetryEvent) => void;

	constructor(options?: ProgressReporterOptions) {
		this.onProgressComplete = options?.onProgressComplete;
	}

	/**
	 * Run a task with progress indication
	 *
	 * @param config - Progress configuration
	 * @param task - Async task to execute
	 * @returns Promise resolving to task result
	 *
	 * @example
	 * ```typescript
	 * const result = await progressReporter.run(
	 *   { title: "Creating snapshot", location: "notification" },
	 *   async (reporter, token) => {
	 *     reporter.report({ message: "Reading files...", increment: 30 });
	 *     // ... do work
	 *     return snapshot;
	 *   }
	 * );
	 * ```
	 */
	async run<T>(config: ProgressConfig, task: ProgressTask<T>): Promise<T> {
		const minDuration = config.minDurationMs ?? DEFAULT_MIN_DURATION_MS;
		const startTime = performance.now();

		// Map location string to VS Code ProgressLocation
		const location = this.mapLocation(config.location);

		// Build progress options with branding
		const progressOptions: vscode.ProgressOptions = {
			location,
			title: `${BRAND_PREFIX}${config.title}`,
			cancellable: config.cancellable ?? false,
		};

		// For flicker prevention: if minDuration > 0, race the task against a timer
		if (minDuration > 0) {
			return this.runWithFlickerPrevention(config, task, progressOptions, minDuration, startTime);
		}

		// No flicker prevention - run directly with progress
		return this.runWithProgress(config, task, progressOptions, startTime);
	}

	/**
	 * Run task with flicker prevention - only show progress if task takes longer than minDuration
	 */
	private async runWithFlickerPrevention<T>(
		config: ProgressConfig,
		task: ProgressTask<T>,
		progressOptions: vscode.ProgressOptions,
		minDuration: number,
		startTime: number,
	): Promise<T> {
		let taskResult: T | undefined;
		let taskError: Error | undefined;

		// Create a deferred task execution
		const taskPromise = new Promise<T>((resolve, reject) => {
			// Create a simple reporter that no-ops initially
			const noopReporter: ProgressReport = {
				report: () => {},
			};

			// Create a simple token
			const token: CancellationToken = {
				isCancellationRequested: false,
			};

			task(noopReporter, token)
				.then((result) => {
					taskResult = result;
					resolve(result);
				})
				.catch((error) => {
					taskError = error;
					reject(error);
				});
		});

		// Wait for either task completion or minDuration
		const timeoutPromise = new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), minDuration));

		const raceResult = await Promise.race([taskPromise.then(() => "completed" as const), timeoutPromise]);

		if (raceResult === "completed") {
			// Task completed before minDuration - no progress shown (flicker prevented)
			const duration = performance.now() - startTime;
			this.emitTelemetry(config, duration, false);

			if (taskError) {
				throw taskError;
			}
			// taskResult is guaranteed to be defined when raceResult is "completed" and no error
			return taskResult as T;
		}

		// Task is still running - show progress and wait for completion
		return this.runWithProgress(config, task, progressOptions, startTime);
	}

	/**
	 * Run task with VS Code progress indicator
	 */
	private async runWithProgress<T>(
		config: ProgressConfig,
		task: ProgressTask<T>,
		progressOptions: vscode.ProgressOptions,
		startTime: number,
	): Promise<T> {
		let cancelled = false;

		try {
			const result = await vscode.window.withProgress(progressOptions, async (progress, token) => {
				// Wrap progress reporter
				const reporter: ProgressReport = {
					report: (value) => progress.report(value),
				};

				// Wrap cancellation token
				const cancellationToken: CancellationToken = {
					get isCancellationRequested() {
						return token.isCancellationRequested;
					},
				};

				// Track cancellation for telemetry
				if (token.isCancellationRequested) {
					cancelled = true;
				}

				return task(reporter, cancellationToken);
			});

			const duration = performance.now() - startTime;
			this.emitTelemetry(config, duration, cancelled);

			return result;
		} catch (error) {
			const duration = performance.now() - startTime;

			// Check if this was a cancellation
			if (error instanceof Error && error.message.toLowerCase().includes("cancel")) {
				cancelled = true;
			}

			this.emitTelemetry(config, duration, cancelled);
			throw error;
		}
	}

	/**
	 * Map location string to VS Code ProgressLocation enum
	 */
	private mapLocation(location: ProgressLocationType): vscode.ProgressLocation {
		switch (location) {
			case "notification":
				return vscode.ProgressLocation.Notification;
			case "window":
				return vscode.ProgressLocation.Window;
			default:
				return vscode.ProgressLocation.Notification;
		}
	}

	/**
	 * Emit telemetry event if callback is configured
	 */
	private emitTelemetry(config: ProgressConfig, duration: number, cancelled: boolean): void {
		if (this.onProgressComplete && config.operation) {
			this.onProgressComplete({
				operation: config.operation,
				duration_ms: Math.round(duration),
				cancelled,
			});
		}
	}
}

/**
 * Factory function to create a ProgressReporter instance
 *
 * @param options - Optional configuration
 * @returns ProgressReporter instance
 */
export function createProgressReporter(options?: ProgressReporterOptions): ProgressReporter {
	return new ProgressReporter(options);
}
