/**
 * VSCode ExperienceClassifier - Wrapper around SDK ExperienceClassifier
 *
 * This module provides VSCode-specific integration with the platform-agnostic
 * ExperienceClassifier from @snapback/sdk.
 *
 * @module ExperienceClassifier
 */

import {
	type ExperienceMetrics,
	type ExperienceTier,
	ExperienceClassifier as SDKExperienceClassifier,
} from "@snapback/sdk";
import type * as vscode from "vscode";
import { GlobalStateStorageAdapter } from "../adapters/GlobalStateStorageAdapter.js";
import { logger } from "./logger.js";

/**
 * VSCode-specific logger adapter
 */
class VscodeLoggerAdapter {
	debug(message: string, data?: unknown): void {
		logger.debug(message, data);
	}

	info(message: string, data?: unknown): void {
		logger.info(message, data);
	}

	error(message: string, error?: Error, data?: unknown): void {
		logger.error(message, error, data);
	}
}

/**
 * ExperienceClassifier - VSCode-specific wrapper around SDK ExperienceClassifier
 *
 * This class wraps the platform-agnostic ExperienceClassifier from the SDK
 * and provides VSCode-specific integrations while maintaining the same API.
 */
export class ExperienceClassifier {
	private sdkClassifier: SDKExperienceClassifier;

	/**
	 * Creates a new ExperienceClassifier
	 *
	 * @param context - VS Code extension context
	 */
	constructor(context: vscode.ExtensionContext) {
		// Create VSCode-specific adapters
		const storage = new GlobalStateStorageAdapter(context.globalState);
		const vscodeLogger = new VscodeLoggerAdapter();

		// Create SDK classifier with VSCode adapters
		this.sdkClassifier = new SDKExperienceClassifier({
			storage,
			logger: vscodeLogger,
		});
	}

	/**
	 * Gets the current experience tier for the user
	 *
	 * @returns The user's experience tier
	 */
	getExperienceTier(): Promise<ExperienceTier> {
		return this.sdkClassifier.getExperienceTier();
	}

	/**
	 * Gets experience metrics for the current user
	 *
	 * @returns Experience metrics
	 */
	getExperienceMetrics(): Promise<ExperienceMetrics> {
		return this.sdkClassifier.getExperienceMetrics();
	}

	/**
	 * Updates experience metrics based on user activity
	 *
	 * @param activity - Type of activity to record
	 * @param count - Number of activities to record (default: 1)
	 */
	updateExperienceMetrics(
		activity: keyof ExperienceMetrics,
		count: number = 1,
	): Promise<void> {
		return this.sdkClassifier.updateExperienceMetrics(activity, count);
	}

	/**
	 * Records command usage for diversity calculation
	 *
	 * @param command - Command that was used
	 */
	recordCommandUsage(command: string): Promise<void> {
		return this.sdkClassifier.recordCommandUsage(command);
	}

	/**
	 * Sets experience tier manually (for testing)
	 *
	 * @param tier - Experience tier to set
	 */
	setExperienceTier(tier: ExperienceTier): Promise<void> {
		return this.sdkClassifier.setExperienceTier(tier);
	}

	/**
	 * Resets experience tier (for testing)
	 */
	resetExperienceTier(): Promise<void> {
		return this.sdkClassifier.resetExperienceTier();
	}

	/**
	 * Gets a description of the user's experience tier
	 *
	 * @returns Description of the experience tier
	 */
	getExperienceTierDescription(): Promise<string> {
		return this.sdkClassifier.getExperienceTierDescription();
	}
}

// Re-export types for backward compatibility
export type { ExperienceMetrics, ExperienceTier };
