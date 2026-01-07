/**
 * Unified Onboarding State Machine - Transition Logic
 *
 * Handles state transitions based on events and metrics.
 * Implements the FSM transition rules.
 */

import type { OnboardingEvent, OnboardingState, TransitionResult, UnifiedOnboardingState } from "./types";

/**
 * Determine next state based on current state and event
 * Returns null if no transition should occur
 */
export function getNextState(
	currentState: OnboardingState,
	event: OnboardingEvent,
	metrics: UnifiedOnboardingState["metrics"],
): OnboardingState | null {
	switch (currentState) {
		case "not_installed":
			if (event.type === "EXTENSION_ACTIVATED") {
				return "installing";
			}
			break;

		case "installing":
			// Auto-transition to protecting after activation completes
			// This happens immediately in practice
			return "protecting";

		case "protecting":
			if (event.type === "SNAPSHOT_CREATED" && metrics.snapshotsCreated >= 1) {
				return "value_demonstrated";
			}
			break;

		case "value_demonstrated":
			if (event.type === "SNAPSHOT_CREATED" && metrics.snapshotsCreated >= 10) {
				return "engaged";
			}
			break;

		case "engaged":
			if (event.type === "SUBSCRIPTION_STARTED") {
				return "converted";
			}
			break;

		case "converted":
			// Terminal state - no transitions out
			break;
	}

	return null;
}

/**
 * Check if state transition should trigger a celebration
 */
export function shouldCelebrate(newState: OnboardingState): boolean {
	// Celebrate when entering value_demonstrated or engaged states
	return newState === "value_demonstrated" || newState === "engaged";
}

/**
 * Get celebration type for state transition
 */
export function getCelebrationType(newState: OnboardingState): "first_snapshot" | "engaged" | null {
	switch (newState) {
		case "value_demonstrated":
			return "first_snapshot";
		case "engaged":
			return "engaged";
		default:
			return null;
	}
}

/**
 * Execute state transition
 * Returns transition result with celebration info
 */
export function transition(state: UnifiedOnboardingState, event: OnboardingEvent): TransitionResult | null {
	const previousState = state.state;
	const nextState = getNextState(previousState, event, state.metrics);

	if (!nextState || nextState === previousState) {
		// No transition needed
		return null;
	}

	const timeInPreviousState = Date.now() - state.stateEnteredAt;

	const result: TransitionResult = {
		previousState,
		newState: nextState,
		shouldCelebrate: shouldCelebrate(nextState),
		celebrationType: getCelebrationType(nextState) ?? undefined,
		timeInPreviousState,
	};

	return result;
}

/**
 * Validate state transitions to ensure they follow the progression path
 */
export function isValidTransition(from: OnboardingState, to: OnboardingState): boolean {
	const validTransitions: Record<OnboardingState, OnboardingState[]> = {
		not_installed: ["installing"],
		installing: ["protecting"],
		protecting: ["value_demonstrated"],
		value_demonstrated: ["engaged"],
		engaged: ["converted"],
		converted: [], // Terminal state
	};

	return validTransitions[from]?.includes(to) ?? false;
}

/**
 * Get state progression order (for funnel analytics)
 */
export function getStateOrder(state: OnboardingState): number {
	const order: Record<OnboardingState, number> = {
		not_installed: 0,
		installing: 1,
		protecting: 2,
		value_demonstrated: 3,
		engaged: 4,
		converted: 5,
	};

	return order[state];
}

/**
 * Check if state represents completion of a milestone
 */
export function isMilestoneState(state: OnboardingState): boolean {
	return state === "value_demonstrated" || state === "engaged" || state === "converted";
}
