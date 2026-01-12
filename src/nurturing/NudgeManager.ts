import type { ExtensionContext } from "vscode";
import * as vscode from "vscode";
import { logger } from "../utils/logger";

/**
 * Nudge Trigger Types
 * Categorized by user activity: authentication, feature discovery, milestones, commit coaching
 *
 * Commit Coaching (research-aligned):
 * - commit_suggested: Soft nudge at 0.55 risk threshold
 * - commit_recommended: Strong nudge at 0.80 risk threshold
 *
 * Based on LinearB 2025 benchmarks and GitClear PR size research:
 * - PRs <200 lines correlate with 5x faster review
 * - Elite teams: coding times under 1 hour
 * - 41% of commits are AI-assisted (validates wA factor)
 */
export type NudgeTrigger =
	| "auth_failed"
	| "feature_discovered"
	| "milestone_reached"
	| "session_health_warning"
	| "snapshot_recommended"
	| "commit_suggested"
	| "commit_recommended";

/**
 * Nudge response actions
 */
export type NudgeResponse =
	| "create_snapshot"
	| "authenticate"
	| "learn_more"
	| "not_now"
	| "never"
	| "dismissed"
	| "commit_now";

/**
 * Configuration for nudge messages by trigger type
 *
 * 🆕 Educational Messaging Enhancement:
 * Each nudge includes educational context explaining WHY snapshots matter,
 * with research-backed insights and actionable learning resources.
 */
const NUDGE_CONFIG: Record<
	NudgeTrigger,
	{
		title: string;
		message: string;
		icon: string;
		actions: { label: string; response: NudgeResponse; command?: string }[];
		educational?: string;
		whyItMatters?: string;
		learnMoreUrl?: string;
	}
> = {
	auth_failed: {
		title: "SnapBack Cloud Sync",
		message: "Enable cloud sync to backup your snapshots across devices and share with your team.",
		icon: "🔐",
		actions: [
			{ label: "Authenticate", response: "authenticate", command: "snapback.authenticate" },
			{ label: "Learn More", response: "learn_more", command: "snapback.openDocs" },
			{ label: "Not Now", response: "not_now" },
		],
		educational: "Cloud sync ensures your snapshots are never lost, even if your local machine fails.",
		whyItMatters: "Developers lose an average of 4+ hours when local backups fail. Cloud sync provides redundancy.",
	},
	feature_discovered: {
		title: "SnapBack Tip",
		message: "Did you know? SnapBack can automatically detect AI-generated code and protect your work.",
		icon: "💡",
		actions: [
			{ label: "Learn More", response: "learn_more", command: "snapback.openDocs" },
			{ label: "Got It", response: "not_now" },
		],
		educational: "AI detection works by analyzing code velocity and patterns to identify when AI tools are active.",
		whyItMatters:
			"AI-generated code changes 3-5x faster than human typing. Automatic protection catches what you might miss.",
	},
	milestone_reached: {
		title: "SnapBack Milestone",
		message: "🎉 You've created 10 snapshots! Your code is well protected.",
		icon: "🏆",
		actions: [
			{ label: "View Stats", response: "learn_more", command: "snapback.showDashboard" },
			{ label: "Awesome!", response: "not_now" },
		],
		educational: "Regular snapshots build muscle memory for code protection. Keep it up!",
		whyItMatters: "Studies show developers who snapshot regularly recover 10x faster from unexpected issues.",
	},
	session_health_warning: {
		title: "Session Health Warning",
		message: "Your session health is degrading. Consider creating a snapshot to protect your current work.",
		icon: "⚠️",
		actions: [
			{ label: "Create Snapshot", response: "create_snapshot", command: "snapback.createSnapshot" },
			{ label: "Why?", response: "learn_more" },
			{ label: "Later", response: "not_now" },
		],
		educational:
			"Session health degrades as you make more changes without snapshotting. High code velocity + AI activity = higher risk of needing to recover.",
		whyItMatters:
			"Unsnapshots changes compound risk exponentially. After 20+ edits without a snapshot, recovery complexity increases significantly.",
	},
	snapshot_recommended: {
		title: "Snapshot Recommended",
		message: "Based on your activity patterns, now would be a good time to create a snapshot.",
		icon: "📸",
		actions: [
			{ label: "Create Snapshot", response: "create_snapshot", command: "snapback.createSnapshot" },
			{ label: "Not Now", response: "not_now" },
			{ label: "Don't Ask Again", response: "never" },
		],
		educational: "Regular snapshots reduce recovery time and protect against unexpected issues during development.",
		whyItMatters:
			"The cost of a 5-second snapshot is tiny compared to the hours lost debugging a bad AI refactor or accidental deletion.",
	},

	// =========================================================================
	// Commit Coaching (Research-Aligned)
	// Based on LinearB 2025, GitClear PR size research, and AI code generation studies
	// =========================================================================

	commit_suggested: {
		title: "Good Time to Commit",
		message: "Your changes are building up. A commit now would keep your PR reviewable.",
		icon: "💡",
		actions: [
			{ label: "Commit Now", response: "commit_now", command: "workbench.action.git.commit" },
			{ label: "Create Snapshot", response: "create_snapshot", command: "snapback.createSnapshot" },
			{ label: "Not Now", response: "not_now" },
		],
		educational:
			"Research shows PRs under 200 lines get reviewed 5x faster. Smaller commits also make bugs easier to isolate and rollback.",
		whyItMatters:
			"LinearB's 2025 benchmarks show PR size is the #1 driver of engineering velocity. Elite teams keep commits small and frequent.",
		learnMoreUrl: "https://linearb.io/blog/2025-engineering-benchmarks-insights",
	},

	commit_recommended: {
		title: "Commit Recommended",
		message:
			"You have significant uncommitted changes. Committing now protects your work and keeps PRs manageable.",
		icon: "⚠️",
		actions: [
			{ label: "Commit Now", response: "commit_now", command: "workbench.action.git.commit" },
			{ label: "Create Snapshot First", response: "create_snapshot", command: "snapback.createSnapshot" },
			{ label: "Later", response: "not_now" },
		],
		educational:
			"Large changesets increase merge conflicts, review fatigue, and bug introduction risk. 41% of commits now involve AI assistance, making frequent commits even more critical.",
		whyItMatters:
			"GitClear research shows that PRs over 400 lines have 3x the defect rate. Committing now creates a safe checkpoint before your changes grow further.",
		learnMoreUrl: "https://www.gitclear.com/blog/ai_code_quality_research",
	},
};

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
			const lastNudgeTime = this.context.globalState.get<number>("snapback.lastAuthNudge");
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
		return this.context.globalState.get<number>("snapback.lastAuthNudge") ?? null;
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
	 * Show nudge to user with action buttons
	 *
	 * Displays a VS Code notification with:
	 * 1. Context-specific message based on trigger type
	 * 2. Action buttons for user interaction
	 * 3. Educational content explaining why this matters
	 *
	 * @param trigger - What triggered this nudge
	 * @returns The user's response action
	 * @throws If displaying nudge fails (caller handles in try/finally)
	 */
	async showNudge(trigger: NudgeTrigger): Promise<NudgeResponse> {
		const config = NUDGE_CONFIG[trigger];
		if (!config) {
			logger.warn("Unknown nudge trigger", { trigger });
			return "dismissed";
		}

		// Build the message with icon and educational context
		// 🆕 Enhanced educational messaging with "why it matters" context
		let _fullMessage = `${config.icon} ${config.message}`;
		if (config.educational) {
			_fullMessage += `\n\n💡 ${config.educational}`;
		}
		if (config.whyItMatters) {
			_fullMessage += `\n\n📊 Why it matters: ${config.whyItMatters}`;
		}

		// Extract action labels for VS Code API
		const actionLabels = config.actions.map((a) => a.label);

		logger.debug("Showing nudge notification", {
			trigger,
			title: config.title,
			actions: actionLabels,
		});

		// Show notification with action buttons
		const selection = await vscode.window.showInformationMessage(
			`${config.title}: ${config.message}`,
			{ detail: config.educational, modal: false },
			...actionLabels,
		);

		// Map selection back to response
		if (!selection) {
			logger.debug("Nudge dismissed without action", { trigger });
			return "dismissed";
		}

		const selectedAction = config.actions.find((a) => a.label === selection);
		if (!selectedAction) {
			logger.warn("Unknown nudge selection", { trigger, selection });
			return "dismissed";
		}

		// Execute command if specified
		if (selectedAction.command) {
			logger.debug("Executing nudge action command", {
				trigger,
				command: selectedAction.command,
			});
			try {
				await vscode.commands.executeCommand(selectedAction.command);
			} catch (error) {
				logger.warn("Nudge action command failed", {
					command: selectedAction.command,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}

		// Handle "never" response - persist preference
		if (selectedAction.response === "never") {
			await this.context.globalState.update(`snapback.nudge.${trigger}.disabled`, true);
			logger.info("Nudge disabled by user", { trigger });
		}

		logger.info("Nudge action taken", {
			trigger,
			response: selectedAction.response,
			command: selectedAction.command,
		});

		return selectedAction.response;
	}

	/**
	 * Check if nudges are disabled for a specific trigger
	 * @param trigger - The nudge trigger to check
	 * @returns true if user has disabled this nudge type
	 */
	isNudgeDisabled(trigger: NudgeTrigger): boolean {
		return this.context.globalState.get<boolean>(`snapback.nudge.${trigger}.disabled`) ?? false;
	}

	/**
	 * Re-enable nudges for a specific trigger
	 * @param trigger - The nudge trigger to re-enable
	 */
	async enableNudge(trigger: NudgeTrigger): Promise<void> {
		await this.context.globalState.update(`snapback.nudge.${trigger}.disabled`, false);
		logger.info("Nudge re-enabled", { trigger });
	}
}
