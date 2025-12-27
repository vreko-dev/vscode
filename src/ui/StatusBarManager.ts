/**
 * StatusBarManager - Unified status bar state machine
 *
 * Reference: ai_dev_utils/resources/extension-ux/EXTENSION_UX_SPEC.md#status-bar
 *
 * STATE MACHINE:
 * ```
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  idle ←──────────────────────────────────────────────────────── │
 * │   │                                                        ↑    │
 * │   ├──→ ai-session ──(5s timeout)──────────────────────────→│    │
 * │   │                                                        │    │
 * │   ├──→ checkpoint ──(3s timeout)──→ idle-stats ───────────→│    │
 * │   │                                                        │    │
 * │   └──→ restored ──(5s timeout)────────────────────────────→│    │
 * └─────────────────────────────────────────────────────────────────┘
 * ```
 *
 * DESIGN PRINCIPLES:
 * - Minimal by default, informative on hover
 * - State transitions are automatic (timeout-based)
 * - Vitals mode is opt-in for power users
 *
 * GOTCHAS:
 * - Don't create multiple status bar items (causes duplicates)
 * - Clear timeouts before setting new ones (memory leak)
 * - Use ThemeColor for backgrounds, not hardcoded colors
 *
 * @packageDocumentation
 */

import * as vscode from "vscode";
import {
	PULSE_LEVEL_SIGNAGE,
	SESSION_HEALTH_SIGNAGE,
	TEMPERATURE_LEVEL_SIGNAGE,
	TRAJECTORY_SIGNAGE,
} from "../signage/constants";
import type { SessionHealthCanonical, TrajectoryCanonical } from "../signage/types";
import type { ActivitySequenceType, ActivityStep, StatusBarState, StatusBarStats, VitalsDisplayData } from "./ux-types";
import { ACTIVITY_SEQUENCES, PULSE_EMOJI, TEMP_EMOJI } from "./ux-types";

/**
 * Status bar timeout durations in milliseconds
 */
const STATE_TIMEOUTS: Partial<Record<StatusBarState, number>> = {
	"ai-session": 5000,
	checkpoint: 3000,
	restored: 5000,
};

/**
 * Status bar text templates
 *
 * HINT: Use VS Code codicons like $(shield), $(sparkle), etc.
 * Full list: https://code.visualstudio.com/api/references/icons-in-labels
 */
const STATUS_TEXT: Record<StatusBarState, string | ((data: unknown) => string)> = {
	idle: "$(shield) SnapBack",
	"idle-stats": (stats: unknown) =>
		`$(shield) ${(stats as StatusBarStats).checkpointsToday} checkpoint${(stats as StatusBarStats).checkpointsToday !== 1 ? "s" : ""} today`,
	"ai-session": (tool: unknown) =>
		tool ? `$(sparkle) ${tool as string} session protected` : "$(zap) Active session",
	checkpoint: "$(check) Checkpoint saved",
	restored: (lines: unknown) => `$(history) Restored${lines ? ` ${lines as number}` : ""} lines`,
	vitals: (vitals: unknown) => formatVitalsText(vitals as VitalsDisplayData),
};

/**
 * Format vitals for status bar display
 *
 * EDGE CASE: Handle undefined vitals gracefully
 */
function formatVitalsText(v: VitalsDisplayData): string {
	const pulse = PULSE_EMOJI[v.pulse.level] + v.pulse.value;
	const temp = TEMP_EMOJI[v.temperature.level];
	return `${pulse} ${temp} 📊${v.pressure.value} 🫁${v.oxygen.value}`;
}

export class StatusBarManager implements vscode.Disposable {
	private readonly item: vscode.StatusBarItem;
	private state: StatusBarState = "idle";
	private stats: StatusBarStats = {
		checkpointsToday: 0,
		aiSessionsToday: 0,
		weekCheckpoints: 0,
		weekLinesProtected: 0,
	};

	/**
	 * Active timeout for auto-transition
	 *
	 * GOTCHA: Always clear before setting new timeout!
	 */
	private transitionTimeout: NodeJS.Timeout | undefined;

	/**
	 * Activity sequence state
	 *
	 * Tracks the current running sequence for interruption.
	 */
	private sequenceAbortController: AbortController | undefined;
	private isRunningSequence = false;

	/**
	 * Whether vitals mode is enabled (power user setting)
	 */
	private vitalsEnabled = false;

	/**
	 * Current session health for tooltip display
	 */
	private sessionHealth: SessionHealthCanonical = "healthy";

	/**
	 * Current trajectory for tooltip display
	 */
	private trajectory: TrajectoryCanonical = "stable";

	/**
	 * Current vitals snapshot for detailed tooltip
	 */
	private currentVitals: VitalsDisplayData | undefined;

	constructor() {
		// HINT: Use Right alignment with high priority to appear left of other items
		this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);

		// Wire click to QuickPicker for restore flow
		this.item.command = "snapback.showQuickPicker";

		this.item.show();
		this.showIdle();
	}

	// ===========================================================================
	// STATE TRANSITIONS
	// ===========================================================================

	/**
	 * Show idle state
	 *
	 * If we have stats, show idle-stats instead of plain idle
	 */
	showIdle(): void {
		this.clearTransitionTimeout();

		if (this.stats.checkpointsToday > 0) {
			this.setState("idle-stats");
		} else {
			this.setState("idle");
		}
	}

	/**
	 * Show AI session detected
	 *
	 * @param tool - AI tool name (Cursor, Copilot, etc.)
	 *
	 * HINT: Auto-transitions to idle after 5s
	 */
	showAISession(tool?: string): void {
		this.clearTransitionTimeout();
		this.setState("ai-session", tool);
		this.stats.aiSessionsToday++;

		this.transitionTimeout = setTimeout(() => {
			this.showIdle();
		}, STATE_TIMEOUTS["ai-session"]);
	}

	/**
	 * Show checkpoint created
	 *
	 * HINT: Auto-transitions to idle-stats after 3s
	 */
	showCheckpointCreated(): void {
		this.clearTransitionTimeout();
		this.setState("checkpoint");
		this.stats.checkpointsToday++;

		this.transitionTimeout = setTimeout(() => {
			this.showIdle();
		}, STATE_TIMEOUTS.checkpoint);
	}

	/**
	 * Show restore completed
	 *
	 * @param lines - Number of lines restored
	 *
	 * HINT: Uses warning background color to celebrate the hero moment!
	 */
	showRestored(lines?: number): void {
		this.clearTransitionTimeout();
		this.abortActiveSequence();
		this.setState("restored", lines);

		// HINT: Use ThemeColor for proper theme support
		this.item.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");

		this.transitionTimeout = setTimeout(() => {
			this.item.backgroundColor = undefined;
			this.showIdle();
		}, STATE_TIMEOUTS.restored);
	}

	// ===========================================================================
	// ACTIVITY SEQUENCE METHODS
	// ===========================================================================

	/**
	 * Show an activity sequence (cycling animation)
	 *
	 * Cycles through a series of status bar messages to demonstrate
	 * that SnapBack is responding to events (AI detection, vitals, etc.)
	 *
	 * @param steps - Array of activity steps to cycle through
	 * @returns Promise that resolves when sequence completes or is interrupted
	 *
	 * DESIGN:
	 * - Interruptible: New states/sequences cancel the running sequence
	 * - Returns to idle: Automatically transitions to idle when complete
	 * - Non-blocking: Uses async/await with abort signals
	 *
	 * @example
	 * ```typescript
	 * await statusBar.showActivitySequence([
	 *   { text: "$(sparkle) AI detected", duration: 1500 },
	 *   { text: "$(sync~spin) Analyzing...", duration: 1000 },
	 *   { text: "$(check) Checkpoint saved", duration: 2000 },
	 * ]);
	 * ```
	 */
	async showActivitySequence(steps: ActivityStep[]): Promise<void> {
		// Abort any running sequence
		this.abortActiveSequence();
		this.clearTransitionTimeout();

		// Create new abort controller for this sequence
		this.sequenceAbortController = new AbortController();
		const signal = this.sequenceAbortController.signal;
		this.isRunningSequence = true;

		try {
			for (const step of steps) {
				// Check if aborted before each step
				if (signal.aborted) {
					return;
				}

				// Update status bar for this step
				this.item.text = step.text;
				this.item.tooltip = this.buildTooltip();

				// Apply background color if specified
				if (step.backgroundColor) {
					this.item.backgroundColor = new vscode.ThemeColor(step.backgroundColor);
				} else {
					this.item.backgroundColor = undefined;
				}

				// Wait for step duration (interruptible)
				await this.delay(step.duration, signal);
			}

			// Sequence completed - return to idle
			if (!signal.aborted) {
				this.item.backgroundColor = undefined;
				this.showIdle();
			}
		} finally {
			this.isRunningSequence = false;
		}
	}

	/**
	 * Show a predefined activity sequence by type
	 *
	 * @param type - Predefined sequence type
	 * @returns Promise that resolves when sequence completes
	 *
	 * @example
	 * ```typescript
	 * await statusBar.showActivitySequenceByType("ai-detected");
	 * ```
	 */
	async showActivitySequenceByType(type: ActivitySequenceType): Promise<void> {
		const steps = ACTIVITY_SEQUENCES[type];
		return this.showActivitySequence([...steps]);
	}

	/**
	 * Show AI detection activity sequence
	 *
	 * Triggered when AI tool activity is detected.
	 * Sequence: "AI detected" → "Capturing..." → "Checkpoint saved"
	 *
	 * @param tool - Optional AI tool name for context
	 */
	async showAIDetectedSequence(tool?: string): Promise<void> {
		const steps: ActivityStep[] = [
			{
				text: tool ? `$(sparkle) ${tool} detected` : "$(sparkle) AI detected",
				duration: 1200,
			},
			{ text: "$(sync~spin) Capturing...", duration: 800 },
			{ text: "$(check) Checkpoint saved", duration: 1500 },
		];

		// Increment stats
		this.stats.aiSessionsToday++;
		this.stats.checkpointsToday++;

		return this.showActivitySequence(steps);
	}

	/**
	 * Show vitals degradation activity sequence
	 *
	 * Triggered when workspace health is declining.
	 * Sequence: "Health declining" → "Monitoring..." → "Auto-protected"
	 */
	async showVitalsDegradingSequence(): Promise<void> {
		return this.showActivitySequenceByType("vitals-degrading");
	}

	/**
	 * Show burst detection activity sequence
	 *
	 * Triggered when rapid changes are detected.
	 * Sequence: "Rapid changes" → "Capturing..." → "Checkpoint saved"
	 */
	async showBurstDetectedSequence(): Promise<void> {
		this.stats.checkpointsToday++;
		return this.showActivitySequenceByType("burst-detected");
	}

	/**
	 * Check if an activity sequence is currently running
	 */
	isSequenceRunning(): boolean {
		return this.isRunningSequence;
	}

	/**
	 * Abort the currently running activity sequence
	 *
	 * Called automatically when new states are set.
	 */
	private abortActiveSequence(): void {
		if (this.sequenceAbortController) {
			this.sequenceAbortController.abort();
			this.sequenceAbortController = undefined;
		}
		this.isRunningSequence = false;
	}

	/**
	 * Interruptible delay using AbortSignal
	 *
	 * @param ms - Milliseconds to wait
	 * @param signal - AbortSignal for interruption
	 */
	private delay(ms: number, signal?: AbortSignal): Promise<void> {
		return new Promise((resolve) => {
			if (signal?.aborted) {
				resolve();
				return;
			}

			const timeoutId = setTimeout(resolve, ms);

			if (signal) {
				const onAbort = () => {
					clearTimeout(timeoutId);
					resolve();
				};
				signal.addEventListener("abort", onAbort, { once: true });
			}
		});
	}

	/**
	 * Show vitals display (power user mode)
	 *
	 * @param vitals - Current vitals snapshot
	 *
	 * Stores vitals for tooltip display and updates session health tracking.
	 */
	showVitals(vitals: VitalsDisplayData): void {
		// Always update vitals for tooltip, even if display is disabled
		this.currentVitals = vitals;
		this.trajectory = vitals.trajectory;
		this.sessionHealth = vitals.sessionHealth ?? this.deriveSessionHealth(vitals);

		if (!this.vitalsEnabled) {
			// Still refresh tooltip with new health data
			this.item.tooltip = this.buildTooltip();
			return;
		}

		this.clearTransitionTimeout();
		this.setState("vitals", vitals);
	}

	/**
	 * Update session health directly from UnifiedDataService
	 *
	 * Call this when receiving session health updates independent of full vitals.
	 */
	updateSessionHealth(health: SessionHealthCanonical, trajectory?: TrajectoryCanonical): void {
		this.sessionHealth = health;
		if (trajectory) {
			this.trajectory = trajectory;
		}

		// Update background color based on health (subtle indication)
		if (health === "critical") {
			this.item.backgroundColor = new vscode.ThemeColor("statusBarItem.errorBackground");
		} else if (health === "warning") {
			this.item.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
		} else {
			this.item.backgroundColor = undefined;
		}

		// Refresh tooltip
		this.item.tooltip = this.buildTooltip();
	}

	/**
	 * Derive session health from vitals data
	 */
	private deriveSessionHealth(vitals: VitalsDisplayData): SessionHealthCanonical {
		// High pressure or critical pulse/temp = critical
		if (vitals.pressure.value > 80 || vitals.pulse.level === "critical" || vitals.temperature.level === "burning") {
			return "critical";
		}

		// Elevated metrics = warning
		if (
			vitals.pressure.value > 50 ||
			vitals.pulse.level === "racing" ||
			vitals.pulse.level === "elevated" ||
			vitals.temperature.level === "hot"
		) {
			return "warning";
		}

		return "healthy";
	}

	// ===========================================================================
	// INTERNAL HELPERS
	// ===========================================================================

	/**
	 * Set state and update display
	 */
	private setState(state: StatusBarState, data?: unknown): void {
		this.state = state;

		const template = STATUS_TEXT[state];
		// Only use stats as default for idle-stats state, otherwise pass data as-is
		const templateData = state === "idle-stats" ? (data ?? this.stats) : data;
		this.item.text = typeof template === "function" ? template(templateData) : template;

		this.item.tooltip = this.buildTooltip();
	}

	/**
	 * Build tooltip content with session health
	 *
	 * Shows session health status, trajectory, and vitals using signage system.
	 */
	private buildTooltip(): vscode.MarkdownString {
		const md = new vscode.MarkdownString();
		md.isTrusted = true;

		// Header with session health
		const healthSignage = SESSION_HEALTH_SIGNAGE[this.sessionHealth];
		const trajectorySignage = TRAJECTORY_SIGNAGE[this.trajectory];

		md.appendMarkdown(`**SnapBack** ${healthSignage.emoji} ${healthSignage.label}\n\n`);

		// Session health section
		md.appendMarkdown(`**Session Health:** ${healthSignage.emoji} ${healthSignage.label}`);
		md.appendMarkdown(` ${trajectorySignage.arrow}\n`);
		md.appendMarkdown(`*${healthSignage.description}*\n\n`);

		// Vitals section (if available)
		if (this.currentVitals) {
			const pulseSignage = PULSE_LEVEL_SIGNAGE[this.currentVitals.pulse.level];
			const tempSignage = TEMPERATURE_LEVEL_SIGNAGE[this.currentVitals.temperature.level];

			md.appendMarkdown("**Workspace Vitals:**\n");
			md.appendMarkdown(
				`- ${pulseSignage.emoji} Pulse: ${pulseSignage.label} (${this.currentVitals.pulse.value}/min)\n`,
			);
			md.appendMarkdown(`- ${tempSignage.emoji} Temperature: ${tempSignage.label}`);
			if (this.currentVitals.temperature.tool) {
				md.appendMarkdown(` (${this.currentVitals.temperature.tool})`);
			}
			md.appendMarkdown("\n");
			md.appendMarkdown(`- 📊 Pressure: ${this.currentVitals.pressure.value}%\n`);
			md.appendMarkdown(`- 🫁 Oxygen: ${this.currentVitals.oxygen.value}%\n`);
			md.appendMarkdown(`- ${trajectorySignage.emoji} Trajectory: ${trajectorySignage.label}\n\n`);
		}

		// Stats section
		md.appendMarkdown("---\n\n");
		md.appendMarkdown(
			`Today: ${this.stats.checkpointsToday} checkpoints | ${this.stats.aiSessionsToday} AI sessions\n\n`,
		);

		if (this.stats.lastCheckpoint) {
			const ago = formatRelativeTime(this.stats.lastCheckpoint.timestamp);
			md.appendMarkdown(`Last checkpoint: ${ago}\n`);
			if (this.stats.lastCheckpoint.aiTool) {
				md.appendMarkdown(`→ AI-assisted changes (${this.stats.lastCheckpoint.aiTool})\n`);
			}
		}

		md.appendMarkdown("\n*Click to restore from snapshots*");

		return md;
	}

	/**
	 * Clear pending transition timeout
	 *
	 * CRITICAL: Call this before setting new timeout to prevent memory leaks
	 */
	private clearTransitionTimeout(): void {
		if (this.transitionTimeout) {
			clearTimeout(this.transitionTimeout);
			this.transitionTimeout = undefined;
		}
		// Also abort any running sequence when clearing timeouts
		this.abortActiveSequence();
	}

	// ===========================================================================
	// STATS MANAGEMENT
	// ===========================================================================

	/**
	 * Update stats from external source
	 *
	 * TODO: Wire up to SnapshotStore/SessionStore events
	 */
	updateStats(stats: Partial<StatusBarStats>): void {
		this.stats = { ...this.stats, ...stats };

		// Refresh display if in stats-showing state
		if (this.state === "idle-stats" || this.state === "idle") {
			this.showIdle();
		}
	}

	/**
	 * Record last checkpoint info
	 */
	recordCheckpoint(info: StatusBarStats["lastCheckpoint"]): void {
		this.stats.lastCheckpoint = info;
		this.showCheckpointCreated();
	}

	// ===========================================================================
	// CONFIGURATION
	// ===========================================================================

	/**
	 * Enable/disable vitals display mode
	 *
	 * TODO: Read from workspace configuration
	 */
	setVitalsEnabled(enabled: boolean): void {
		this.vitalsEnabled = enabled;
		if (!enabled && this.state === "vitals") {
			this.showIdle();
		}
	}

	// ===========================================================================
	// LIFECYCLE
	// ===========================================================================

	dispose(): void {
		this.clearTransitionTimeout();
		this.abortActiveSequence();
		this.item.dispose();
	}
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Format timestamp as relative time
 *
 * GOTCHA: Use stable formats to avoid UI "jumping"
 * - "2h" not "2 hours ago"
 * - "3m" not "3 minutes ago"
 *
 * TODO: Consider using date-fns or dayjs for robust formatting
 */
function formatRelativeTime(timestamp: number): string {
	const now = Date.now();
	const diff = now - timestamp;

	const minutes = Math.floor(diff / 60000);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);

	if (days > 0) {
		return `${days}d ago`;
	}
	if (hours > 0) {
		return `${hours}h ago`;
	}
	if (minutes > 0) {
		return `${minutes}m ago`;
	}
	return "just now";
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create and register StatusBarManager
 *
 * Usage in extension.ts:
 * ```typescript
 * const statusBar = createStatusBarManager();
 * context.subscriptions.push(statusBar);
 * ```
 */
export function createStatusBarManager(): StatusBarManager {
	return new StatusBarManager();
}
