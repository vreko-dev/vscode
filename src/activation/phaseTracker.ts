/**
 * Activation Phase Tracker
 *
 * Provides utilities for tracking activation phase timing and breadcrumbs.
 * Reduces boilerplate in extension.ts by centralizing timing logic.
 */

import { addBreadcrumb } from "../observability/sentry";
import { logger } from "../utils/logger";

export interface PhaseTimings {
	[phase: string]: number;
}

/**
 * Creates a phase tracking helper for measuring activation performance.
 *
 * @param timings - Object to store phase timing results
 * @returns trackPhase function for wrapping phase execution
 *
 * @example
 * ```typescript
 * const phaseTimings: PhaseTimings = {};
 * const trackPhase = createPhaseTracker(phaseTimings);
 *
 * const result = await trackPhase("Phase 1 (Services)", async () => {
 *   return initializePhase1Services();
 * });
 * ```
 */
export function createPhaseTracker(timings: PhaseTimings) {
	/**
	 * Track execution time of a phase and record breadcrumb.
	 *
	 * @param name - Phase name (e.g., "Phase 1 (Services)")
	 * @param fn - Function to execute and time
	 * @returns Result of the function
	 */
	async function trackPhase<T>(name: string, fn: () => T | Promise<T>): Promise<T> {
		const start = Date.now();
		try {
			const result = await Promise.resolve(fn());
			const duration = Date.now() - start;
			timings[name] = duration;
			addBreadcrumb(`${name} complete`, "activation", { duration });
			logger.debug(`${name} completed`, { duration });
			return result;
		} catch (error) {
			const duration = Date.now() - start;
			timings[name] = duration;
			addBreadcrumb(`${name} failed`, "activation", { duration, error: String(error) });
			throw error;
		}
	}

	/**
	 * Track execution time of a synchronous phase.
	 *
	 * @param name - Phase name
	 * @param fn - Synchronous function to execute
	 * @returns Result of the function
	 */
	function trackPhaseSync<T>(name: string, fn: () => T): T {
		const start = Date.now();
		try {
			const result = fn();
			const duration = Date.now() - start;
			timings[name] = duration;
			addBreadcrumb(`${name} complete`, "activation", { duration });
			logger.debug(`${name} completed`, { duration });
			return result;
		} catch (error) {
			const duration = Date.now() - start;
			timings[name] = duration;
			addBreadcrumb(`${name} failed`, "activation", { duration, error: String(error) });
			throw error;
		}
	}

	return { trackPhase, trackPhaseSync };
}

/**
 * Log phase timing breakdown to output channel.
 *
 * @param outputChannel - VS Code output channel
 * @param timings - Phase timing object
 * @param totalElapsed - Total elapsed time for activation
 */
export function logPhaseTimings(
	outputChannel: { appendLine: (line: string) => void },
	timings: PhaseTimings,
	totalElapsed: number,
): void {
	outputChannel.appendLine("\n[PERF] Phase Timing Breakdown:");
	let totalPhaseTime = 0;

	for (const [phase, duration] of Object.entries(timings)) {
		totalPhaseTime += duration;
		const barLength = Math.round(duration / 100);
		const bar = "█".repeat(Math.min(barLength, 50));
		outputChannel.appendLine(`  ${phase.padEnd(25)} ${bar} ${duration}ms`);
	}

	outputChannel.appendLine(`\n  Total (Phase Time):   ${totalPhaseTime}ms`);
	outputChannel.appendLine(`  Total (Including UI): ${totalElapsed}ms`);

	if (totalElapsed > 500) {
		outputChannel.appendLine(
			`\n⚠️ WARNING: Activation time ${totalElapsed}ms exceeds 500ms budget by ${totalElapsed - 500}ms`,
		);
		logger.warn("Activation performance degraded", {
			elapsedTime: totalElapsed,
			budget: 500,
		});
	} else {
		outputChannel.appendLine(`\n✅ Activation time within budget (${totalElapsed}ms < 500ms)`);
	}
}
