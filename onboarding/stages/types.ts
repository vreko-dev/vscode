/**
 * Onboarding Stage Infrastructure - Type Definitions
 *
 * Modular onboarding system with tiered stages, dependency management,
 * and graceful degradation strategies.
 */

import type * as vscode from "vscode";

/**
 * Stage tier classification for prioritization
 */
export type StageTier = "critical" | "enhanced" | "optional";

/**
 * Error handling strategy per stage
 */
export type ErrorStrategy = "retry" | "skip" | "degrade" | "block";

/**
 * Stage execution status
 */
export type StageStatus = "pending" | "running" | "completed" | "failed" | "skipped";

/**
 * Result of a stage execution
 */
export interface StageResult {
	/** Final status of the stage */
	status: StageStatus;
	/** Duration in milliseconds */
	duration: number;
	/** Error if failed */
	error?: Error;
	/** Whether stage completed in degraded mode */
	degraded?: boolean;
	/** Additional metadata */
	metadata?: Record<string, unknown>;
}

/**
 * Surface updates for UI feedback
 */
export interface SurfaceUpdates {
	/** Status bar updates */
	statusBar?: {
		text: string;
		tooltip?: string;
	};
	/** Notification to show */
	notification?: {
		message: string;
		type: "info" | "warning" | "error";
	};
	/** Progress increment */
	progress?: {
		increment: number;
		message?: string;
	};
}

/**
 * Context passed to all stages during execution
 */
export interface OnboardingContext {
	/** Workspace root directory */
	workspaceRoot: string;
	/** VS Code extension context */
	extensionContext: vscode.ExtensionContext;
	/** Results from completed stages */
	stageResults: Map<string, StageResult>;
	/** Onboarding start timestamp */
	startTime: number;
	/** Additional context data */
	data: Map<string, unknown>;
}

/**
 * Onboarding Stage Interface
 *
 * Each stage implements this interface to participate in the
 * onboarding pipeline with dependency management and error handling.
 */
export interface OnboardingStage {
	/** Unique stage identifier */
	id: string;

	/** Stage tier (critical | enhanced | optional) */
	tier: StageTier;

	/** Stage IDs this stage depends on */
	dependsOn: string[];

	/** Maximum execution time in milliseconds */
	timeout: number;

	/** Whether this stage can fail without blocking */
	canFail: boolean;

	/** Error handling strategy */
	errorStrategy: ErrorStrategy;

	/**
	 * Check if this stage should run
	 * @param context - Onboarding context
	 * @returns true if stage should execute
	 */
	check(context: OnboardingContext): Promise<boolean>;

	/**
	 * Execute the stage logic
	 * @param context - Onboarding context
	 */
	execute(context: OnboardingContext): Promise<void>;

	/**
	 * Verify stage completed successfully
	 * @param context - Onboarding context
	 * @returns true if verification passed
	 */
	verify(context: OnboardingContext): Promise<boolean>;

	/**
	 * Get surface updates for UI feedback
	 * @returns Surface updates or undefined
	 */
	getSurfaces(): SurfaceUpdates | undefined;
}

/**
 * Stage registry configuration
 */
export interface StageRegistryConfig {
	/** Maximum concurrent stages */
	maxConcurrency?: number;
	/** Global timeout for entire onboarding */
	globalTimeout?: number;
	/** Enable telemetry tracking */
	enableTelemetry?: boolean;
}

/**
 * Onboarding pipeline result
 */
export interface OnboardingResult {
	/** Overall success status */
	success: boolean;
	/** Total duration in milliseconds */
	duration: number;
	/** Individual stage results */
	stageResults: Map<string, StageResult>;
	/** Stages that failed */
	failures: string[];
	/** Stages that were skipped */
	skipped: string[];
	/** Whether any stage ran in degraded mode */
	degraded: boolean;
}
