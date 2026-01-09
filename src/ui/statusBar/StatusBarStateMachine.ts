import type { StatusBarState } from "./types";

/**
 * Configuration options for StatusBarStateMachine
 */
export interface StatusBarStateMachineOptions {
	/** Timeout in ms before protected state auto-reverts (default: 3000) */
	revertTimeout?: number;
}

/**
 * Callback signature for state change events
 */
export type StateChangeCallback = (newState: StatusBarState, previousState: StatusBarState) => void;

/**
 * Priority levels for risk states.
 * Higher number = higher priority = more urgent.
 * EXPORTED for reuse in StatusBarController.isLowerPriority()
 */
export const STATE_PRIORITY: Record<StatusBarState, number> = {
	idle: 1,
	"ambient-risk": 2,
	recommend: 3,
	critical: 4,
	// Special states - not part of priority hierarchy
	protected: 0,
	recovering: 0,
	error: 0,
	disabled: 0,
};

/**
 * States that can always be transitioned TO regardless of current state.
 * - protected: snapshot just created
 * - recovering: recovery in progress
 * - error: something went wrong
 * - disabled: user disabled notifications
 */
const SPECIAL_TARGET_STATES: Set<StatusBarState> = new Set(["protected", "recovering", "error", "disabled"]);

/**
 * States that allow transitioning FROM to any other state.
 */
const SPECIAL_SOURCE_STATES: Set<StatusBarState> = new Set(["protected", "recovering", "error", "disabled"]);

const DEFAULT_REVERT_TIMEOUT = 3000;

/**
 * Finite state machine for managing status bar states.
 *
 * Implements priority-based transitions and auto-revert behavior
 * for the SnapBack status bar indicator.
 */
export class StatusBarStateMachine {
	private currentState: StatusBarState;
	private previousState: StatusBarState;
	private revertTimeout: number;
	private revertTimer: ReturnType<typeof setTimeout> | null = null;
	private stateChangeCallbacks: Set<StateChangeCallback> = new Set();
	private disposed = false;

	constructor(initialState: StatusBarState = "idle", options: StatusBarStateMachineOptions = {}) {
		this.currentState = initialState;
		this.previousState = initialState;
		this.revertTimeout = options.revertTimeout ?? DEFAULT_REVERT_TIMEOUT;
	}

	/**
	 * Get the current state
	 */
	getState(): StatusBarState {
		return this.currentState;
	}

	/**
	 * Register a callback for state changes
	 */
	onStateChange(callback: StateChangeCallback): void {
		this.stateChangeCallbacks.add(callback);
	}

	/**
	 * Unregister a state change callback
	 */
	offStateChange(callback: StateChangeCallback): void {
		this.stateChangeCallbacks.delete(callback);
	}

	/**
	 * Transition to a new state with priority enforcement.
	 *
	 * Rules:
	 * - Special target states (protected, error, disabled) always allowed
	 * - Special source states allow transition to any state
	 * - Higher priority can interrupt lower priority
	 * - Lower priority cannot interrupt higher priority
	 *
	 * @param to Target state
	 * @param _trigger Reason for transition (for logging/debugging)
	 * @returns true if transition was successful
	 */
	transition(to: StatusBarState, _trigger: string): boolean {
		// Cancel any pending auto-revert timer
		this.cancelRevertTimer();

		const fromState = this.currentState;

		// Special target states can always be transitioned to
		if (SPECIAL_TARGET_STATES.has(to)) {
			// Store previous state before transitioning to protected
			if (to === "protected") {
				this.previousState = fromState;
			}
			this.currentState = to;

			// Set up auto-revert timer for protected state
			if (to === "protected") {
				this.scheduleAutoRevert();
			}

			return true;
		}

		// Special source states allow any transition
		if (SPECIAL_SOURCE_STATES.has(this.currentState)) {
			this.currentState = to;
			return true;
		}

		// Priority-based transition: only allow if target >= current priority
		const currentPriority = STATE_PRIORITY[this.currentState];
		const targetPriority = STATE_PRIORITY[to];

		if (targetPriority >= currentPriority) {
			this.currentState = to;
			return true;
		}

		// Block lower priority interrupting higher priority
		return false;
	}

	/**
	 * Schedule auto-revert from protected state
	 */
	private scheduleAutoRevert(): void {
		this.revertTimer = setTimeout(() => {
			if (this.disposed) {
				return;
			}

			const fromState = this.currentState;
			this.currentState = this.previousState;
			this.revertTimer = null;

			// Notify listeners
			this.emitStateChange(this.currentState, fromState);
		}, this.revertTimeout);
	}

	/**
	 * Cancel pending auto-revert timer
	 */
	private cancelRevertTimer(): void {
		if (this.revertTimer) {
			clearTimeout(this.revertTimer);
			this.revertTimer = null;
		}
	}

	/**
	 * Emit state change event to all listeners
	 */
	private emitStateChange(newState: StatusBarState, previousState: StatusBarState): void {
		for (const callback of this.stateChangeCallbacks) {
			callback(newState, previousState);
		}
	}

	/**
	 * Clean up resources
	 */
	dispose(): void {
		this.disposed = true;
		this.cancelRevertTimer();
		this.stateChangeCallbacks.clear();
	}
}
