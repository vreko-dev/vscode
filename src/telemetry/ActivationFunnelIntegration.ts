/**
 * ActivationFunnelIntegration.ts
 *
 * Integrates TelemetryFunnel with the extension activation flow.
 * Tracks user progress through the activation funnel:
 *   install → welcome → auth → first_protect → first_save → first_restore
 *
 * Spec Reference: unified_ux_spec.md §9.2 P0-3
 *
 * @see TelemetryFunnel for funnel tracking implementation
 */

import type * as vscode from "vscode";
import type { TelemetryProxy } from "../services/telemetry-proxy";
import { logger } from "../utils/logger";
import { FunnelType, TelemetryFunnel } from "./TelemetryFunnel";

/**
 * Singleton instance for global access
 */
let activationFunnelInstance: ActivationFunnelIntegration | null = null;

/**
 * Configuration for ActivationFunnelIntegration
 */
export interface ActivationFunnelConfig {
	context: vscode.ExtensionContext;
	telemetryProxy: TelemetryProxy;
}

/**
 * Manages the activation funnel tracking across the extension lifecycle.
 *
 * Usage:
 * ```typescript
 * // During activation
 * const funnelIntegration = initializeActivationFunnel({
 *   context,
 *   telemetryProxy,
 *   milestoneService,
 * });
 *
 * // Track steps automatically or manually
 * funnelIntegration.trackWelcomeShown();
 * funnelIntegration.trackAuthCompleted();
 * ```
 */
export class ActivationFunnelIntegration {
	private readonly funnel: TelemetryFunnel;
	private readonly context: vscode.ExtensionContext;
	private isDisposed = false;

	constructor(config: ActivationFunnelConfig) {
		this.context = config.context;
		this.funnel = new TelemetryFunnel(config.telemetryProxy);

		// Check if we should resume an existing funnel
		const hasInstalled = this.context.globalState.get<boolean>("snapback.installed", false);
		if (hasInstalled && !this.context.globalState.get<boolean>("snapback.funnelCompleted", false)) {
			// Resume funnel for returning users who haven't completed activation
			this.funnel.startFunnel(FunnelType.ACTIVATION);
		}

		logger.debug("ActivationFunnelIntegration initialized");
	}

	/**
	 * Track extension installation step.
	 * Called when extension is first installed (not on subsequent activations).
	 */
	trackInstalled(): void {
		if (this.isDisposed) return;

		// Start the activation funnel on first install
		this.funnel.startFunnel(FunnelType.ACTIVATION);
		this.funnel.trackStep(FunnelType.ACTIVATION, "extension_installed", {
			install_source: "marketplace",
			platform: process.platform,
		});

		logger.debug("Activation funnel: extension_installed tracked");
	}

	/**
	 * Track welcome screen shown step.
	 */
	trackWelcomeShown(): void {
		if (this.isDisposed) return;

		this.funnel.trackStep(FunnelType.ACTIVATION, "welcome_shown");
		logger.debug("Activation funnel: welcome_shown tracked");
	}

	/**
	 * Track auth flow started.
	 */
	trackAuthStarted(): void {
		if (this.isDisposed) return;

		this.funnel.trackStep(FunnelType.ACTIVATION, "auth_started");
		logger.debug("Activation funnel: auth_started tracked");
	}

	/**
	 * Track successful authentication.
	 */
	trackAuthCompleted(provider?: string): void {
		if (this.isDisposed) return;

		this.funnel.trackStep(FunnelType.ACTIVATION, "auth_completed", {
			provider: provider ?? "unknown",
		});

		// Mark auth completed in global state
		void this.context.globalState.update("snapback.funnelAuthCompleted", true);

		logger.debug("Activation funnel: auth_completed tracked", { provider });
	}

	/**
	 * Track first file protection.
	 */
	trackFirstFileProtected(fileType?: string): void {
		if (this.isDisposed) return;

		this.funnel.trackStep(FunnelType.ACTIVATION, "first_file_protected", {
			file_type: fileType,
		});

		logger.debug("Activation funnel: first_file_protected tracked", { fileType });
	}

	/**
	 * Track first protected save.
	 */
	trackFirstProtectedSave(): void {
		if (this.isDisposed) return;

		this.funnel.trackStep(FunnelType.ACTIVATION, "first_protected_save");
		logger.debug("Activation funnel: first_protected_save tracked");
	}

	/**
	 * Track first restore operation - this completes the activation funnel.
	 */
	trackFirstRestore(): void {
		if (this.isDisposed) return;

		this.funnel.trackStep(FunnelType.ACTIVATION, "first_restore");

		// Complete the activation funnel
		this.funnel.complete(FunnelType.ACTIVATION, {
			funnel_name: "activation",
			outcome: "success",
		});

		logger.info("Activation funnel completed: user reached first_restore");
	}

	/**
	 * Track funnel abandonment with reason.
	 */
	trackAbandonment(reason: string): void {
		if (this.isDisposed) return;

		this.funnel.abandon(FunnelType.ACTIVATION, reason);
		logger.debug("Activation funnel abandoned", { reason });
	}

	/**
	 * Get current funnel progress.
	 */
	getProgress(): { stepsCompleted: number; totalSteps: number; percentage: number } | null {
		return this.funnel.getProgress(FunnelType.ACTIVATION);
	}

	/**
	 * Check if activation funnel is active.
	 */
	isActive(): boolean {
		return this.funnel.isActive(FunnelType.ACTIVATION);
	}

	/**
	 * Track CLI adoption funnel step.
	 */
	trackCliStep(step: "cli_detected" | "cli_linked" | "cli_command_used" | "cli_session_started"): void {
		if (this.isDisposed) return;

		this.funnel.trackStep(FunnelType.CLI_ADOPTION, step);
		logger.debug(`CLI adoption funnel: ${step} tracked`);

		// Complete CLI adoption funnel when session started
		if (step === "cli_session_started") {
			this.funnel.complete(FunnelType.CLI_ADOPTION);
		}
	}

	/**
	 * Track restore funnel step.
	 */
	trackRestoreStep(
		step: "restore_initiated" | "snapshot_selected" | "diff_viewed" | "restore_confirmed" | "restore_completed",
	): void {
		if (this.isDisposed) return;

		this.funnel.trackStep(FunnelType.RESTORE, step);

		// Complete restore funnel when restore is completed
		if (step === "restore_completed") {
			this.funnel.complete(FunnelType.RESTORE);
		}
	}

	/**
	 * Dispose resources.
	 */
	dispose(): void {
		this.isDisposed = true;

		// If funnel is still active, mark as abandoned
		if (this.funnel.isActive(FunnelType.ACTIVATION)) {
			this.funnel.abandon(FunnelType.ACTIVATION, "session_ended");
		}

		logger.debug("ActivationFunnelIntegration disposed");
	}
}

/**
 * Initialize the activation funnel integration.
 * Should be called during extension activation.
 *
 * @param config Configuration including context and telemetry proxy
 * @returns The ActivationFunnelIntegration instance
 */
export function initializeActivationFunnel(config: ActivationFunnelConfig): ActivationFunnelIntegration {
	if (activationFunnelInstance) {
		logger.warn("ActivationFunnelIntegration already initialized, returning existing instance");
		return activationFunnelInstance;
	}

	activationFunnelInstance = new ActivationFunnelIntegration(config);
	return activationFunnelInstance;
}

/**
 * Get the singleton activation funnel instance.
 * Returns null if not yet initialized.
 */
export function getActivationFunnel(): ActivationFunnelIntegration | null {
	return activationFunnelInstance;
}

/**
 * Dispose the activation funnel instance.
 * Should be called during extension deactivation.
 */
export function disposeActivationFunnel(): void {
	if (activationFunnelInstance) {
		activationFunnelInstance.dispose();
		activationFunnelInstance = null;
	}
}
