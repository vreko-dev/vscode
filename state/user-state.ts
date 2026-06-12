/**
 * UserStateManager  -  Extension State Machine Client
 *
 * Tracks Pioneer Release user state (23 states, 50+ transitions) within the
 * VS Code extension. Persists across restarts via globalState. Fires a
 * state-changed event on each valid transition.
 *
 * Invalid transitions are logged and silently ignored  -  never crash the extension.
 * Authentication state (UNAUTHENTICATED_ACTIVE) allows all local features.
 *
 * @module state/user-state
 */

import type { TransitionTrigger, UserContext, UserState } from "@vreko/core/state-machine";
import { attemptTransition, getTransitionsFrom } from "@vreko/core/state-machine";
import * as vscode from "vscode";
import { logger } from "../utils/logger.js";

// =============================================================================
// Types
// =============================================================================

export type { UserState, TransitionTrigger };

export interface StateChangeEvent {
	from: UserState;
	to: UserState;
	trigger: TransitionTrigger;
}

// =============================================================================
// UserStateManager
// =============================================================================

const GLOBAL_STATE_KEY = "vreko.userState";
const DEFAULT_STATE: UserState = "EXTENSION_INSTALLED";

/**
 * Minimal UserContext used for transition evaluation in the extension.
 * Most context fields are optional; the transition table falls back gracefully.
 */
function buildContext(workspaceId?: string): UserContext {
	return {
		workspaceId,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	};
}

/**
 * Tracks and persists user journey state for the VS Code extension.
 *
 * Extension-relevant states:
 * - EXTENSION_INSTALLED → welcome panel, begin CLI detection
 * - CLI_BOOTSTRAPPING → show "Setting up..."
 * - CLI_FAILED → show CLI install instructions
 * - CLI_INSTALLED → proceed to daemon start
 * - DAEMON_STARTING → show "Starting daemon..."
 * - DAEMON_CONNECTED → ready for scan
 * - SCANNING → show scan progress
 * - SCAN_COMPLETE → show Recovery Risk Profile
 * - ACTIVE → normal operation (status bar, MCP, sessions)
 * - SESSION_ACTIVE → status bar shows session duration
 * - SESSION_ENDED → ceremony data available
 * - RETURNING → show intelligence briefing on return
 * - DAEMON_UNRESPONSIVE → status bar critical, offer doctor
 * - DISCONNECTED → status bar error, auto-reconnect
 * - OFFLINE → degraded mode  -  local features only
 * - UNAUTHENTICATED_ACTIVE → all local features work, soft CTA for auth
 */
export class UserStateManager implements vscode.Disposable {
	private state: UserState;
	private workspaceId?: string;
	private readonly context: vscode.ExtensionContext;
	private readonly _onStateChanged = new vscode.EventEmitter<StateChangeEvent>();

	/** Subscribe to state transitions. */
	public readonly onStateChanged = this._onStateChanged.event;

	constructor(context: vscode.ExtensionContext, workspaceId?: string) {
		this.context = context;
		this.workspaceId = workspaceId;
		const persisted = context.globalState.get<UserState>(GLOBAL_STATE_KEY);
		this.state = persisted ?? DEFAULT_STATE;
		logger.debug("UserStateManager initialized", { state: this.state });
	}

	// =========================================================================
	// Public API
	// =========================================================================

	/**
	 * Return the current user state.
	 */
	getState(): UserState {
		return this.state;
	}

	/**
	 * Attempt a state transition via the given trigger.
	 * If the trigger is not valid from the current state, the call is a no-op.
	 * Invariant violations are logged but do not block the transition.
	 */
	async transition(trigger: TransitionTrigger): Promise<void> {
		const from = this.state;

		// Check if any transition from current state uses this trigger
		const candidates = getTransitionsFrom(from).filter((t) => t.trigger === trigger);
		if (candidates.length === 0) {
			logger.debug("UserState: no valid transition for trigger", { from, trigger });
			return;
		}

		const ctx = buildContext(this.workspaceId);
		const result = attemptTransition(from, trigger, ctx);
		if (!result) {
			logger.debug("UserState: transition returned undefined (conditions not met)", { from, trigger });
			return;
		}

		const to = result.newState;
		this.state = to;
		await this.context.globalState.update(GLOBAL_STATE_KEY, to);

		logger.debug("UserState: transition applied", { from, to, trigger });

		this._onStateChanged.fire({ from, to, trigger });
	}

	/**
	 * Force-set state without going through transition validation.
	 * Use only for initializing from server-side state or after reset.
	 */
	async forceState(state: UserState): Promise<void> {
		const from = this.state;
		this.state = state;
		await this.context.globalState.update(GLOBAL_STATE_KEY, state);
		logger.info("UserState: forced state set", { from, to: state });
	}

	/**
	 * Reset state to the default (EXTENSION_INSTALLED).
	 */
	async reset(): Promise<void> {
		await this.forceState(DEFAULT_STATE);
	}

	// =========================================================================
	// State predicates
	// =========================================================================

	/** True if user is in any activation state (onboarding flow). */
	isOnboarding(): boolean {
		return [
			"EXTENSION_INSTALLED",
			"CLI_BOOTSTRAPPING",
			"CLI_FAILED",
			"CLI_INSTALLED",
			"DAEMON_STARTING",
			"DAEMON_CONNECTED",
			"SCANNING",
			"SCAN_COMPLETE",
		].includes(this.state);
	}

	/** True if daemon is in a degraded state requiring user attention. */
	isDegraded(): boolean {
		return ["DAEMON_UNRESPONSIVE", "DISCONNECTED", "OFFLINE"].includes(this.state);
	}

	/** True if the user can use all local features (auth is not required). */
	isLocallyActive(): boolean {
		return ["ACTIVE", "SESSION_ACTIVE", "SESSION_ENDED", "RETURNING", "UNAUTHENTICATED_ACTIVE"].includes(
			this.state,
		);
	}

	// =========================================================================
	// Dispose
	// =========================================================================

	dispose(): void {
		this._onStateChanged.dispose();
	}
}
