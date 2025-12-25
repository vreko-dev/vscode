/**
 * TelemetryFunnel.ts
 *
 * Tracks user progress through critical funnels (Activation, Restore, CLI Adoption).
 * Used to identify drop-off points and optimize user experience.
 *
 * Spec Reference: unified_ux_spec.md §9.2
 * Covers:
 *   - P0-3: Activation funnel tracking
 *   - P0-1: snapshot_restored (via funnel completion)
 *
 * Funnels Tracked:
 * 1. Activation: install → auth → first_protect → first_save → first_restore
 * 2. Restore: view_snapshot → select_snapshot → confirm_restore → restore_complete
 * 3. CLI Adoption: cli_detected → cli_linked → cli_command_used
 *
 * @see https://github.com/your-org/snapback/blob/main/apps/vscode/unified_ux_spec.md
 */

import type { TelemetryProxy } from "../services/telemetry-proxy";
import { logger } from "../utils/logger";

export enum FunnelType {
	ACTIVATION = "activation",
	RESTORE = "restore",
	CLI_ADOPTION = "cli_adoption",
	PROTECTION_SETUP = "protection_setup",
}

/**
 * Funnel step definitions with ordering.
 */
export const FUNNEL_STEPS: Record<FunnelType, string[]> = {
	[FunnelType.ACTIVATION]: [
		"extension_installed",
		"welcome_shown",
		"auth_started",
		"auth_completed",
		"first_file_protected",
		"first_protected_save",
		"first_restore",
	],
	[FunnelType.RESTORE]: [
		"restore_initiated",
		"snapshot_selected",
		"diff_viewed",
		"restore_confirmed",
		"restore_completed",
	],
	[FunnelType.CLI_ADOPTION]: ["cli_detected", "cli_linked", "cli_command_used", "cli_session_started"],
	[FunnelType.PROTECTION_SETUP]: ["protection_dialog_shown", "level_selected", "protection_applied"],
};

/**
 * Active funnel session for tracking multi-step flows.
 */
interface FunnelSession {
	funnel: FunnelType;
	sessionId: string;
	startTime: number;
	stepsCompleted: string[];
	lastStepTime: number;
}

/**
 * Tracks user progress through critical funnels.
 * Enables drop-off analysis and conversion optimization.
 *
 * Usage:
 * ```typescript
 * const funnel = new TelemetryFunnel(telemetryProxy);
 *
 * // Track steps as user progresses
 * funnel.trackStep(FunnelType.ACTIVATION, 'auth_completed');
 * funnel.trackStep(FunnelType.ACTIVATION, 'first_file_protected');
 *
 * // Complete when funnel goal is reached
 * funnel.complete(FunnelType.ACTIVATION);
 *
 * // Or mark as failed with reason
 * funnel.fail(FunnelType.ACTIVATION, 'auth_started', 'timeout');
 * ```
 */
export class TelemetryFunnel {
	private activeSessions = new Map<FunnelType, FunnelSession>();

	constructor(private readonly telemetry?: TelemetryProxy) {}

	/**
	 * Set telemetry proxy after construction.
	 */
	setTelemetry(telemetry: TelemetryProxy): TelemetryFunnel {
		return new TelemetryFunnel(telemetry);
	}

	/**
	 * Start tracking a new funnel.
	 * Creates a session that can be completed or failed.
	 */
	startFunnel(funnel: FunnelType): string {
		const sessionId = `${funnel}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

		const session: FunnelSession = {
			funnel,
			sessionId,
			startTime: Date.now(),
			stepsCompleted: [],
			lastStepTime: Date.now(),
		};

		this.activeSessions.set(funnel, session);

		this.trackEvent("funnel_started", {
			funnel_id: funnel,
			session_id: sessionId,
			expected_steps: FUNNEL_STEPS[funnel].length,
		});

		logger.debug("Funnel started", { funnel, sessionId });
		return sessionId;
	}

	/**
	 * Track specific step in a funnel.
	 * Auto-starts funnel if not already started.
	 */
	trackStep(funnel: FunnelType, step: string, properties?: Record<string, unknown>): void {
		// Get or create session
		let session = this.activeSessions.get(funnel);
		if (!session) {
			this.startFunnel(funnel);
			session = this.activeSessions.get(funnel)!;
		}

		// Skip if already completed this step
		if (session.stepsCompleted.includes(step)) {
			return;
		}

		// Calculate step order and timing
		const stepDefinitions = FUNNEL_STEPS[funnel];
		const stepOrder = stepDefinitions.indexOf(step) + 1;
		const timeSinceLastStep = Date.now() - session.lastStepTime;
		const totalElapsed = Date.now() - session.startTime;

		session.stepsCompleted.push(step);
		session.lastStepTime = Date.now();

		this.trackEvent("funnel_step_completed", {
			funnel_id: funnel,
			session_id: session.sessionId,
			step_name: step,
			step_order: stepOrder,
			total_steps: stepDefinitions.length,
			time_since_last_step_ms: timeSinceLastStep,
			total_elapsed_ms: totalElapsed,
			steps_completed: session.stepsCompleted.length,
			...properties,
		});

		logger.debug("Funnel step completed", {
			funnel,
			step,
			stepOrder,
			totalSteps: stepDefinitions.length,
		});
	}

	/**
	 * Mark a funnel as successfully completed.
	 * Tracks conversion and total time.
	 */
	complete(funnel: FunnelType, properties?: Record<string, unknown>): void {
		const session = this.activeSessions.get(funnel);
		if (!session) {
			logger.debug("Cannot complete funnel: no active session", { funnel });
			return;
		}

		const totalElapsed = Date.now() - session.startTime;
		const stepDefinitions = FUNNEL_STEPS[funnel];
		const completionRate = session.stepsCompleted.length / stepDefinitions.length;

		this.trackEvent("funnel_completed", {
			funnel_id: funnel,
			session_id: session.sessionId,
			total_elapsed_ms: totalElapsed,
			steps_completed: session.stepsCompleted.length,
			total_steps: stepDefinitions.length,
			completion_rate: completionRate,
			completed_steps: session.stepsCompleted,
			...properties,
		});

		// Clear session
		this.activeSessions.delete(funnel);

		logger.info("Funnel completed", {
			funnel,
			totalElapsedMs: totalElapsed,
			stepsCompleted: session.stepsCompleted.length,
		});
	}

	/**
	 * Mark a funnel as abandoned or failed.
	 * Tracks drop-off point for analysis.
	 */
	fail(funnel: FunnelType, step: string, reason: string): void {
		const session = this.activeSessions.get(funnel);
		if (!session) {
			logger.debug("Cannot fail funnel: no active session", { funnel });
			return;
		}

		const totalElapsed = Date.now() - session.startTime;
		const stepDefinitions = FUNNEL_STEPS[funnel];
		const stepOrder = stepDefinitions.indexOf(step) + 1;

		this.trackEvent("funnel_failed", {
			funnel_id: funnel,
			session_id: session.sessionId,
			failed_at_step: step,
			failed_at_step_order: stepOrder,
			failure_reason: reason,
			total_elapsed_ms: totalElapsed,
			steps_completed: session.stepsCompleted.length,
			total_steps: stepDefinitions.length,
			completed_steps: session.stepsCompleted,
		});

		// Clear session
		this.activeSessions.delete(funnel);

		logger.info("Funnel failed", {
			funnel,
			step,
			reason,
		});
	}

	/**
	 * Abandon a funnel without marking as failed.
	 * Used when user naturally exits without completing.
	 */
	abandon(funnel: FunnelType, reason?: string): void {
		const session = this.activeSessions.get(funnel);
		if (!session) {
			return;
		}

		const totalElapsed = Date.now() - session.startTime;

		this.trackEvent("funnel_abandoned", {
			funnel_id: funnel,
			session_id: session.sessionId,
			abandonment_reason: reason ?? "session_ended",
			total_elapsed_ms: totalElapsed,
			steps_completed: session.stepsCompleted.length,
			completed_steps: session.stepsCompleted,
		});

		this.activeSessions.delete(funnel);
	}

	/**
	 * Check if a funnel is currently active.
	 */
	isActive(funnel: FunnelType): boolean {
		return this.activeSessions.has(funnel);
	}

	/**
	 * Get current progress of an active funnel.
	 */
	getProgress(funnel: FunnelType): {
		stepsCompleted: number;
		totalSteps: number;
		percentage: number;
	} | null {
		const session = this.activeSessions.get(funnel);
		if (!session) {
			return null;
		}

		const totalSteps = FUNNEL_STEPS[funnel].length;
		return {
			stepsCompleted: session.stepsCompleted.length,
			totalSteps,
			percentage: (session.stepsCompleted.length / totalSteps) * 100,
		};
	}

	/**
	 * Internal event tracking with null safety.
	 */
	private trackEvent(event: string, properties: Record<string, unknown>): void {
		if (!this.telemetry) {
			logger.debug("Telemetry not configured, skipping event", { event });
			return;
		}

		void this.telemetry.trackEvent(event, properties).catch((err) => {
			logger.debug("Telemetry event failed", {
				event,
				error: err instanceof Error ? err.message : String(err),
			});
		});
	}
}
