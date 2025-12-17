/**
 * ExtensionState tracks feature activation status for graceful degradation
 *
 * Week 0 Task 4: Add Activation State Tracking
 * Purpose: Enable partial activation when features fail to initialize
 */

import { logger } from "@snapback/infrastructure";
import type { Result } from "./result";
import { Err, Ok } from "./result";

export interface FeatureState {
	enabled: boolean;
	error?: Error;
	activatedAt?: number;
}

/**
 * Tracks which features successfully activated and which failed
 * Enables extension to run with partial functionality when some features fail
 */
export class ExtensionState {
	private features = new Map<string, FeatureState>();

	/**
	 * Attempts to activate a feature, tracking success or failure
	 *
	 * @param name - Feature name (e.g., 'storage', 'mcp', 'auth')
	 * @param init - Async initialization function
	 * @returns Result indicating success or failure
	 */
	async activateFeature(name: string, init: () => Promise<void>): Promise<Result<void, Error>> {
		try {
			const startTime = Date.now();
			await init();
			this.features.set(name, {
				enabled: true,
				activatedAt: Date.now(),
			});
			logger.info(`Feature ${name} activated successfully`, {
				duration: Date.now() - startTime,
			});
			return Ok(undefined);
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			this.features.set(name, {
				enabled: false,
				error: err,
			});
			logger.error(`Feature ${name} failed to activate`, err);
			return Err(err);
		}
	}

	/**
	 * Check if a feature is enabled
	 *
	 * @param feature - Feature name
	 * @returns True if feature is enabled
	 */
	isEnabled(feature: string): boolean {
		return this.features.get(feature)?.enabled ?? false;
	}

	/**
	 * Get all features that failed to activate
	 *
	 * @returns Array of failed feature names
	 */
	getFailedFeatures(): string[] {
		return Array.from(this.features.entries())
			.filter(([_, state]) => !state.enabled)
			.map(([name]) => name);
	}

	/**
	 * Get all features that successfully activated
	 *
	 * @returns Array of successful feature names
	 */
	getEnabledFeatures(): string[] {
		return Array.from(this.features.entries())
			.filter(([_, state]) => state.enabled)
			.map(([name]) => name);
	}

	/**
	 * Get error for a specific feature
	 *
	 * @param feature - Feature name
	 * @returns Error if feature failed, undefined otherwise
	 */
	getFeatureError(feature: string): Error | undefined {
		return this.features.get(feature)?.error;
	}

	/**
	 * Get full state for debugging
	 *
	 * @returns Map of all feature states
	 */
	getFullState(): Map<string, FeatureState> {
		return new Map(this.features);
	}

	/**
	 * Log activation summary
	 */
	logSummary(): void {
		const enabled = this.getEnabledFeatures();
		const failed = this.getFailedFeatures();

		logger.info("Extension activation summary", {
			totalFeatures: this.features.size,
			enabledCount: enabled.length,
			failedCount: failed.length,
			enabled,
			failed,
		});

		if (failed.length > 0) {
			logger.warn("Some features failed to activate - running in degraded mode", {
				failedFeatures: failed,
			});
		}
	}
}
