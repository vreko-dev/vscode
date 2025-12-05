import { logger } from "@snapback/infrastructure";
import type { ExtensionContext } from "vscode";

/**
 * Nudge Trigger Types
 * Categorized by user activity: authentication, feature discovery, milestones
 */
export type NudgeTrigger =
	| "auth_failed"
	| "feature_discovered"
	| "milestone_reached";

/**
 * NudgeManager: Prevents duplicate nudges via race condition protection
 *
 * **Problem**: When multiple triggers fire simultaneously (e.g., auth_failed + feature_discovered),
 * both might pass the time-based check before either updates globalState, causing duplicate nudges.
 *
 * **Solution**: Three-layer throttling:
 * 1. In-memory lock (`nudgingInProgress`) - Prevents concurrent execution
 * 2. Session flag (`nudgeShownThisSession`) - One nudge per extension lifecycle
 * 3. Persistent 24h throttle - Global state prevents frequent nudges
 *
 * **Implementation Pattern**:
 * ```
 * Session Start → [No nudge yet] → First maybeNudge() calls → Lock acquired → Shows nudge → Session flag set
 * Subsequent maybeNudge() calls → Fast path: skip due to session flag
 * Next session → Flags reset → Can nudge again if 24h passed
 * ```
 */
export class NudgeManager {
	/**
	 * In-memory lock: Prevents concurrent maybeNudge() execution
	 * Checked FIRST to short-circuit expensive time-based checks
	 */
	private nudgingInProgress = false;

	/**
	 * Session-level flag: Ensures only one nudge per extension lifetime
	 * Persists for entire VS Code session, resets on extension reload
	 */
	private nudgeShownThisSession = false;

	constructor(private context: ExtensionContext) {
		logger.debug("NudgeManager initialized", {
			context: "Extension context acquired",
		});
	}

	/**
	 * Check if a nudge should be shown
	 *
	 * **Race Condition Protection**:
	 * - If nudgingInProgress=true, return immediately (another call is showing nudge)
	 * - If nudgeShownThisSession=true, return immediately (already shown this session)
	 * - Then check persistent 24-hour throttle
	 *
	 * @param trigger - Source of the nudge request
	 * @returns Promise that resolves when nudge handling complete (or skipped)
	 */
	async maybeNudge(trigger: NudgeTrigger): Promise<void> {
		// Layer 1: Session-level fast path
		// If already shown this session, skip all work
		if (this.nudgeShownThisSession) {
			logger.debug("Nudge skipped: already shown this session", { trigger });
			return;
		}

		// Layer 2: Concurrent execution prevention
		// If another maybeNudge() is already executing, skip to avoid race condition
		if (this.nudgingInProgress) {
			logger.debug("Nudge skipped: another nudge in progress", { trigger });
			return;
		}

		// Acquire lock
		this.nudgingInProgress = true;

		try {
			// Layer 3: Time-based persistent throttle
			// Check globalState for last nudge time (survives extension reloads)
			const lastNudgeTime = this.context.globalState.get<number>(
				"snapback.lastAuthNudge",
			);
			const now = Date.now();
			const THROTTLE_PERIOD = 24 * 60 * 60 * 1000;

			// If nudged recently, skip (even if lock passed)
			if (lastNudgeTime && now - lastNudgeTime < THROTTLE_PERIOD) {
				const hoursSince = Math.floor((now - lastNudgeTime) / (60 * 60 * 1000));
				logger.debug("Nudge skipped: 24-hour throttle active", {
					trigger,
					hoursSinceLast: hoursSince,
				});
				return;
			}

			// All throttles passed - show the nudge
			// Note: showNudge() is a placeholder; implementation would:
			// - Show VS Code information message
			// - Handle user response (e.g., "Authenticate", "Not Now", "Never")
			await this.showNudge(trigger);

			// Mark session as nudged (fast path for future calls)
			this.nudgeShownThisSession = true;

			// Update persistent throttle
			await this.context.globalState.update("snapback.lastAuthNudge", now);

			logger.info("Nudge shown successfully", { trigger });
		} catch (error) {
			// Log error but don't throw - nudges are best-effort
			logger.error("Failed to show nudge", {
				error: error instanceof Error ? error.message : String(error),
				trigger,
			});
			// Don't re-throw; nudges are non-critical UI enhancements
		} finally {
			// Always release lock, even if error occurred
			// This is CRITICAL for race condition prevention
			this.nudgingInProgress = false;
		}
	}

	/**
	 * Get last nudge timestamp from persistent storage
	 * @returns Milliseconds since epoch, or null if never nudged
	 */
	getLastNudgeTime(): number | null {
		return (
			this.context.globalState.get<number>("snapback.lastAuthNudge") ?? null
		);
	}

	/**
	 * Check if nudge was shown in current session
	 * Used for testing; not part of normal operation
	 * @returns true if maybeNudge() successfully showed nudge this session
	 */
	wasShownThisSession(): boolean {
		return this.nudgeShownThisSession;
	}

	/**
	 * Show nudge to user
	 *
	 * **Placeholder Implementation**: Override in tests with mock
	 * Real implementation would:
	 * 1. Call vscode.window.showInformationMessage()
	 * 2. Add action buttons ("Authenticate", "Not Now", etc.)
	 * 3. Handle user response
	 * 4. Track which button was clicked
	 *
	 * @param trigger - What triggered this nudge
	 * @throws If displaying nudge fails (caller handles in try/finally)
	 */
	async showNudge(trigger: NudgeTrigger): Promise<void> {
		// Placeholder: Real implementation would use vscode.window.showInformationMessage()
		logger.debug("Nudge shown (placeholder implementation)", { trigger });
	}
}
