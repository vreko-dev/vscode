/**
 * Unified Onboarding Service
 *
 * Single source of truth for user progression tracking.
 * Replaces OnboardingProgression + Milestone Service.
 *
 * Philosophy: "Invisible until needed, celebrate when beneficial"
 *
 * Responsibilities:
 * - Track user progression through onboarding states
 * - Handle state transitions based on events
 * - Trigger celebrations at key milestones
 * - Persist state across extension restarts
 * - Provide telemetry data for funnel analytics
 */

import type * as vscode from "vscode";
import type { NotificationCoordinator } from "../ui/NotificationCoordinator";
import { logger } from "../utils/logger";
import { CELEBRATIONS, formatCelebrationMessage } from "./onboarding/celebrations";
import { createDefaultState, migrateToUnifiedState, STORAGE_KEYS } from "./onboarding/migration";
import { getStateOrder, transition } from "./onboarding/transitions";
import type { OnboardingEvent, OnboardingState, TransitionResult, UnifiedOnboardingState } from "./onboarding/types";
import type { TelemetryProxy } from "./telemetry-proxy";

/**
 * Unified Onboarding Service
 *
 * Lightweight custom FSM (~2KB)
 * No XState dependency - simple, direct state management
 */
export class UnifiedOnboardingService {
	private state: UnifiedOnboardingState;
	private lastCelebrationShown: Record<string, number> = {};

	constructor(
		private readonly globalState: vscode.Memento,
		private readonly telemetryProxy: TelemetryProxy,
		private readonly notificationCoordinator: NotificationCoordinator,
	) {
		// State will be loaded in initialize()
		this.state = createDefaultState();
	}

	/**
	 * Initialize service - load or migrate state
	 * Call this during extension activation
	 */
	async initialize(): Promise<void> {
		try {
			// Try to load existing state
			const existing = this.globalState.get<UnifiedOnboardingState>(STORAGE_KEYS.UNIFIED);

			if (existing) {
				this.state = existing;
				logger.info("Loaded unified onboarding state", {
					state: this.state.state,
					snapshotsCreated: this.state.metrics.snapshotsCreated,
				});
			} else {
				// Migrate from legacy or create new
				this.state = await migrateToUnifiedState(this.globalState);
			}

			// Track extension activation
			await this.handleEvent({ type: "EXTENSION_ACTIVATED" });
		} catch (error) {
			logger.error("Failed to initialize unified onboarding service", error as Error);
			// Fall back to default state
			this.state = createDefaultState();
			await this.saveState();
		}
	}

	/**
	 * Handle onboarding event and trigger state transitions
	 * This is the main entry point for all onboarding events
	 */
	async handleEvent(event: OnboardingEvent): Promise<void> {
		logger.debug("Handling onboarding event", {
			eventType: event.type,
			currentState: this.state.state,
		});

		// Update metrics based on event type
		await this.updateMetrics(event);

		// Attempt state transition
		const transitionResult = transition(this.state, event);

		if (transitionResult) {
			await this.applyTransition(transitionResult);
		}

		// Save state after handling event
		await this.saveState();
	}

	/**
	 * Update metrics based on event
	 */
	private async updateMetrics(event: OnboardingEvent): Promise<void> {
		switch (event.type) {
			case "SNAPSHOT_CREATED":
				this.state.metrics.snapshotsCreated++;
				// Update first snapshot timestamp if needed
				if (this.state.metrics.snapshotsCreated === 1 && !this.state.timestamps.firstSnapshotAt) {
					this.state.timestamps.firstSnapshotAt = Date.now();
				}
				break;

			case "FILE_PROTECTED":
				this.state.metrics.filesProtected += event.count;
				break;

			case "RECOVERY_PERFORMED":
				this.state.metrics.recoveries++;
				if (!this.state.timestamps.firstRecoveryAt) {
					this.state.timestamps.firstRecoveryAt = Date.now();
				}
				break;

			case "AI_DETECTED":
				this.state.flags.aiDetected = true;
				break;

			case "MCP_CONFIGURED":
				this.state.flags.mcpConfigured = true;
				break;

			case "PIONEER_JOINED":
				this.state.flags.pioneerJoined = true;
				break;
		}
	}

	/**
	 * Apply state transition and trigger celebrations
	 */
	private async applyTransition(transitionResult: TransitionResult): Promise<void> {
		const { previousState, newState, shouldCelebrate, celebrationType, timeInPreviousState } = transitionResult;

		logger.info("State transition occurred", {
			from: previousState,
			to: newState,
			timeInPreviousState,
			shouldCelebrate,
		});

		// Update state
		this.state.state = newState;
		this.state.stateEnteredAt = Date.now();

		// Update milestone timestamps
		if (newState === "engaged") {
			this.state.timestamps.engagedAt = Date.now();
		} else if (newState === "converted") {
			this.state.timestamps.convertedAt = Date.now();
		}

		// Track telemetry
		this.telemetryProxy.trackEvent("onboarding.state_changed", {
			from_state: previousState,
			to_state: newState,
			trigger: "event",
			time_in_previous_state_ms: timeInPreviousState,
		});

		// Show celebration if appropriate
		if (shouldCelebrate && celebrationType) {
			await this.showCelebration(celebrationType, newState);
		}
	}

	/**
	 * Show celebration notification
	 */
	private async showCelebration(
		type: "ai_detected" | "first_snapshot" | "engaged",
		state: OnboardingState,
	): Promise<void> {
		const config = CELEBRATIONS[type];

		// Format message
		const message = formatCelebrationMessage(type);

		// Track telemetry
		this.telemetryProxy.trackEvent(config.telemetry, {
			state,
			timestamp: Date.now(),
		});

		// Show notification
		this.notificationCoordinator.show("onboarding-complete", message);

		// Record celebration shown time
		this.lastCelebrationShown[type] = Date.now();

		logger.info("Celebration shown", { type, state });
	}

	/**
	 * Track snapshot creation (most common event)
	 * Convenience method for callers
	 */
	async trackSnapshotCreated(): Promise<void> {
		await this.handleEvent({ type: "SNAPSHOT_CREATED" });
	}

	/**
	 * Track file protection
	 */
	async trackFileProtection(count = 1): Promise<void> {
		await this.handleEvent({ type: "FILE_PROTECTED", count });
	}

	/**
	 * Track recovery/restore
	 */
	async trackRecovery(): Promise<void> {
		await this.handleEvent({ type: "RECOVERY_PERFORMED" });
	}

	/**
	 * Track AI detection
	 */
	async trackAIDetection(tool: string): Promise<void> {
		await this.handleEvent({ type: "AI_DETECTED", tool });
	}

	/**
	 * Track MCP configuration
	 */
	async trackMCPConfigured(clients: string[]): Promise<void> {
		await this.handleEvent({ type: "MCP_CONFIGURED", clients });
	}

	/**
	 * Track Pioneer program join
	 */
	async trackPioneerJoined(): Promise<void> {
		await this.handleEvent({ type: "PIONEER_JOINED" });
	}

	/**
	 * Track subscription start
	 */
	async trackSubscriptionStarted(): Promise<void> {
		await this.handleEvent({ type: "SUBSCRIPTION_STARTED" });
	}

	/**
	 * Get current state
	 */
	getCurrentState(): OnboardingState {
		return this.state.state;
	}

	/**
	 * Get current metrics
	 */
	getMetrics(): UnifiedOnboardingState["metrics"] {
		return { ...this.state.metrics };
	}

	/**
	 * Get stats for display (backward compatibility with MilestoneService)
	 */
	getStats(): { filesProtected: number; recoveries: number; snapshotsCreated: number } {
		return {
			filesProtected: this.state.metrics.filesProtected,
			recoveries: this.state.metrics.recoveries,
			snapshotsCreated: this.state.metrics.snapshotsCreated,
		};
	}

	/**
	 * Get state progression percentage (for UI)
	 */
	getProgressPercentage(): number {
		const order = getStateOrder(this.state.state);
		const maxOrder = 5; // converted
		return Math.round((order / maxOrder) * 100);
	}

	/**
	 * Check if user has reached a milestone
	 */
	hasReachedMilestone(milestone: "first_snapshot" | "engaged" | "converted"): boolean {
		switch (milestone) {
			case "first_snapshot":
				return getStateOrder(this.state.state) >= getStateOrder("value_demonstrated");
			case "engaged":
				return getStateOrder(this.state.state) >= getStateOrder("engaged");
			case "converted":
				return this.state.state === "converted";
		}
	}

	/**
	 * Get time in current state (milliseconds)
	 */
	getTimeInCurrentState(): number {
		return Date.now() - this.state.stateEnteredAt;
	}

	/**
	 * Get full state (for debugging/telemetry)
	 */
	getFullState(): UnifiedOnboardingState {
		return { ...this.state };
	}

	/**
	 * Save state to persistent storage
	 */
	private async saveState(): Promise<void> {
		try {
			await this.globalState.update(STORAGE_KEYS.UNIFIED, this.state);
			logger.debug("Unified onboarding state saved");
		} catch (error) {
			logger.error("Failed to save unified onboarding state", error as Error);
		}
	}

	/**
	 * Reset state (for testing or debugging)
	 * NOT for production use
	 */
	async resetState(): Promise<void> {
		logger.warn("Resetting unified onboarding state");
		this.state = createDefaultState();
		await this.saveState();
	}
}
