/**
 * StatusBarController - Bridge between UnifiedDataService and StatusBarStateMachine
 *
 * This controller implements the architecture from dashboard_metrcs_dev_trust_enhance.md:
 * - Subscribes to UnifiedDataService for health/risk data
 * - Maps health scores to StatusBarState transitions using risk thresholds
 * - Coordinates StatusBarStateMachine state changes
 * - Updates StatusBarManager visuals based on state changes
 *
 * Risk Thresholds (from spec):
 * - 0.35 (35 health) → ambient-risk
 * - 0.55 (45 health) → recommend
 * - 0.80 (20 health) → critical
 *
 * @packageDocumentation
 */

import type * as vscode from "vscode";
import type { SessionHealth, UnifiedDataService } from "../../services/UnifiedDataService";
import type { SessionHealthCanonical, TrajectoryCanonical } from "../../signage/types";
import { logger } from "../../utils/logger";
import type { StatusBarManager } from "../StatusBarManager";
import { STATE_PRIORITY, StatusBarStateMachine } from "./StatusBarStateMachine";
import type { StatusBarState } from "./types";

/**
 * Health score thresholds for FSM state transitions.
 *
 * IMPORTANT: These thresholds are INTENTIONALLY different from VitalsUIIntegration's
 * deriveHealthLevel() thresholds (40/50/70). The spec (dashboard_metrcs_dev_trust_enhance.md)
 * defines risk thresholds as 0.35/0.55/0.80, which map to health scores 65/45/20.
 *
 * VitalsUIIntegration maps to SessionHealthCanonical (UI display colors).
 * StatusBarController maps to StatusBarState (FSM transitions + recommendations).
 *
 * These serve different purposes:
 * - VitalsUIIntegration: Visual feedback with softer zones for UI
 * - StatusBarController: Action-oriented FSM with spec-defined risk thresholds
 *
 * Note: Health score is inverse of risk (health = 100 - pressure)
 * So risk 0.35 = health 65, risk 0.55 = health 45, risk 0.80 = health 20
 */
const HEALTH_THRESHOLDS = {
	/** Risk >= 0.80 (health <= 20) → critical */
	critical: 20,
	/** Risk >= 0.55 (health <= 45) → recommend */
	recommend: 45,
	/** Risk >= 0.35 (health <= 65) → ambient-risk */
	ambientRisk: 65,
} as const;

/**
 * Map SessionHealth trajectory to canonical signage type
 */
function mapTrajectory(trajectory: SessionHealth["trajectory"]): TrajectoryCanonical {
	switch (trajectory) {
		case "improving":
			return "improving";
		case "stable":
			return "stable";
		case "degrading":
			return "degrading";
		case "critical":
			return "critical";
		default:
			return "stable";
	}
}

/**
 * Map health score to canonical session health level
 */
function mapHealthLevel(healthScore: number): SessionHealthCanonical {
	if (healthScore <= HEALTH_THRESHOLDS.critical) {
		return "critical";
	}
	if (healthScore <= HEALTH_THRESHOLDS.recommend) {
		return "warning";
	}
	if (healthScore <= HEALTH_THRESHOLDS.ambientRisk) {
		return "caution";
	}
	return "healthy";
}

/**
 * Map health score to status bar state
 */
function healthToState(healthScore: number): StatusBarState {
	if (healthScore <= HEALTH_THRESHOLDS.critical) {
		return "critical";
	}
	if (healthScore <= HEALTH_THRESHOLDS.recommend) {
		return "recommend";
	}
	if (healthScore <= HEALTH_THRESHOLDS.ambientRisk) {
		return "ambient-risk";
	}
	return "idle";
}

/**
 * Controller that bridges domain services with status bar UI via state machine.
 *
 * Architecture:
 * ```
 * UnifiedDataService → StatusBarController → StatusBarStateMachine → StatusBarManager
 *        (data)              (logic)              (FSM)                 (visuals)
 * ```
 */
export class StatusBarController implements vscode.Disposable {
	private readonly stateMachine: StatusBarStateMachine;
	private readonly disposables: vscode.Disposable[] = [];
	private lastHealthScore = 100;
	private isRecovering = false;
	private isDisabled = false;

	constructor(
		private readonly dataService: UnifiedDataService,
		private readonly statusBarManager: StatusBarManager,
	) {
		// Initialize state machine
		this.stateMachine = new StatusBarStateMachine("idle", { revertTimeout: 3000 });

		// Wire up state machine callbacks to visual updates
		this.stateMachine.onStateChange((newState, previousState) => {
			this.handleStateChange(newState, previousState);
		});

		// Subscribe to data service events
		this.setupDataServiceListeners();

		// Initialize with current health
		this.initializeFromCurrentHealth();

		logger.info("[StatusBarController] Initialized");
	}

	/**
	 * Setup listeners for UnifiedDataService events
	 */
	private setupDataServiceListeners(): void {
		const subscription = this.dataService.onDataChange((event) => {
			if (event.type === "health-changed") {
				this.handleHealthChange(event.data);
			}
		});

		this.disposables.push(subscription);
	}

	/**
	 * Initialize state from current health data
	 */
	private initializeFromCurrentHealth(): void {
		const health = this.dataService.getSessionHealth();
		this.handleHealthChange(health);
	}

	/**
	 * Handle health change from UnifiedDataService
	 */
	private handleHealthChange(health: SessionHealth): void {
		// Don't process if in special states
		if (this.isRecovering || this.isDisabled) {
			logger.debug("[StatusBarController] Ignoring health change - in special state", {
				isRecovering: this.isRecovering,
				isDisabled: this.isDisabled,
			});
			return;
		}

		const { healthScore, trajectory } = health;

		// Determine target state from health score
		const targetState = healthToState(healthScore);
		const currentState = this.stateMachine.getState();

		// Log state calculation
		logger.debug("[StatusBarController] Health change", {
			healthScore,
			trajectory,
			currentState,
			targetState,
			lastHealthScore: this.lastHealthScore,
		});

		// Only transition if state would change (avoid flicker)
		if (targetState !== currentState) {
			const trigger = `health_${healthScore}`;

			// For de-escalation (going to lower priority), use protected as intermediary
			// This allows the FSM to transition while respecting priority rules
			const isDeEscalation = this.isLowerPriority(targetState, currentState);

			let success: boolean;
			if (isDeEscalation) {
				// Go through protected first to allow de-escalation
				this.stateMachine.transition("protected", "health_de_escalation");
				success = this.stateMachine.transition(targetState, trigger);
			} else {
				success = this.stateMachine.transition(targetState, trigger);
			}

			if (success) {
				logger.info("[StatusBarController] State transition", {
					from: currentState,
					to: targetState,
					healthScore,
					trigger,
				});

				// Directly update StatusBarManager based on new state
				this.updateStatusBarForState(targetState);
			} else {
				logger.debug("[StatusBarController] Transition blocked by priority", {
					from: currentState,
					to: targetState,
				});
			}
		}

		// Always update StatusBarManager with health/trajectory for tooltip
		const healthLevel = mapHealthLevel(healthScore);
		const trajectoryCanonical = mapTrajectory(trajectory);
		this.statusBarManager.updateSessionHealth(healthLevel, trajectoryCanonical);

		this.lastHealthScore = healthScore;
	}

	/**
	 * Check if target state is lower priority than current.
	 * Reuses STATE_PRIORITY from StatusBarStateMachine to avoid duplication.
	 */
	private isLowerPriority(targetState: StatusBarState, currentState: StatusBarState): boolean {
		const targetPriority = STATE_PRIORITY[targetState] ?? 0;
		const currentPriority = STATE_PRIORITY[currentState] ?? 0;
		return targetPriority < currentPriority;
	}

	/**
	 * Update StatusBarManager visuals for a given state
	 */
	private updateStatusBarForState(state: StatusBarState): void {
		switch (state) {
			case "idle":
				this.statusBarManager.showIdle();
				break;
			case "ambient-risk":
				// Subtle visual - handled via updateSessionHealth colors
				break;
			case "recommend":
				this.statusBarManager.showRecommendation("medium", "Session pressure building - consider a snapshot");
				break;
			case "critical":
				this.statusBarManager.showRecommendation("critical", "High risk - snapshot strongly recommended");
				break;
			default:
				break;
		}
	}

	/**
	 * Handle state machine state changes → update visuals
	 * Note: This is called for auto-revert events from the FSM.
	 * Direct transitions are handled in handleHealthChange/onSnapshotCreated.
	 */
	private handleStateChange(newState: StatusBarState, previousState: StatusBarState): void {
		logger.info("[StatusBarController] State changed (auto-revert)", {
			from: previousState,
			to: newState,
		});

		// Update StatusBarManager based on new state
		this.updateStatusBarForState(newState);
	}

	/**
	 * Notify controller that a snapshot was created
	 * Transitions to 'protected' state which auto-reverts after 3s
	 *
	 * Note: Does NOT increment snapshot count - that's handled by
	 * existing SNAPSHOT_CREATED event handlers via StatusBarManager.incrementSnapshotCount()
	 */
	public onSnapshotCreated(): void {
		const currentState = this.stateMachine.getState();

		// Flash "protected" state (auto-reverts via state machine)
		if (!["recovering", "error", "disabled"].includes(currentState)) {
			this.stateMachine.transition("protected", "snapshot_created");
			// Directly show checkpoint created
			this.statusBarManager.showCheckpointCreated();
		}
		// Note: Counter increment is handled by StatusBarManager.incrementSnapshotCount()
		// called from existing SNAPSHOT_CREATED event handlers
	}

	/**
	 * Notify controller that recovery has started
	 */
	public onRecoveryStart(): void {
		this.isRecovering = true;
		this.stateMachine.transition("recovering", "recovery_start");
	}

	/**
	 * Notify controller that recovery has completed
	 */
	public onRecoveryComplete(success: boolean): void {
		this.isRecovering = false;

		if (success) {
			this.stateMachine.transition("idle", "recovery_success");
		} else {
			this.stateMachine.transition("error", "recovery_failed");
		}
	}

	/**
	 * Handle user snooze/disable request
	 */
	public disable(durationMs?: number): void {
		this.isDisabled = true;
		this.stateMachine.transition("disabled", "user_disabled");

		if (durationMs) {
			// Auto-resume after snooze duration
			setTimeout(() => {
				this.enable();
			}, durationMs);
		}
	}

	/**
	 * Re-enable after disabled/snooze
	 */
	public enable(): void {
		if (this.isDisabled) {
			this.isDisabled = false;
			this.stateMachine.transition("idle", "user_enabled");

			// Re-process current health
			this.initializeFromCurrentHealth();
		}
	}

	/**
	 * Get current state machine state
	 */
	public getState(): StatusBarState {
		return this.stateMachine.getState();
	}

	/**
	 * Force a state transition (for testing/debugging)
	 */
	public forceState(state: StatusBarState, reason: string): boolean {
		return this.stateMachine.transition(state, `force_${reason}`);
	}

	dispose(): void {
		this.stateMachine.dispose();
		for (const d of this.disposables) {
			d.dispose();
		}
		logger.info("[StatusBarController] Disposed");
	}
}

/**
 * Factory function to create StatusBarController
 */
export function createStatusBarController(
	dataService: UnifiedDataService,
	statusBarManager: StatusBarManager,
): StatusBarController {
	return new StatusBarController(dataService, statusBarManager);
}
