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
import type { StatusBarState, StatusBarStats, VitalsDisplayData } from "./ux-types";
import { PULSE_EMOJI, TEMP_EMOJI } from "./ux-types";

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
const STATUS_TEXT: Record<StatusBarState, string | ((data: any) => string)> = {
	idle: "$(shield) SnapBack",
	"idle-stats": (stats: StatusBarStats) =>
		`$(shield) ${stats.checkpointsToday} checkpoint${stats.checkpointsToday !== 1 ? "s" : ""} today`,
	"ai-session": (tool?: string) => (tool ? `$(sparkle) ${tool} session protected` : "$(zap) Active session"),
	checkpoint: "$(check) Checkpoint saved",
	restored: (lines?: number) => `$(history) Restored${lines ? ` ${lines}` : ""} lines`,
	vitals: (vitals: VitalsDisplayData) => formatVitalsText(vitals),
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
	 * Whether vitals mode is enabled (power user setting)
	 */
	private vitalsEnabled = false;

	constructor() {
		// HINT: Use Right alignment with high priority to appear left of other items
		this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);

		// TODO: Implement - Wire up click command
		// this.item.command = 'snapback.openSidebar';

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
		this.setState("restored", lines);

		// HINT: Use ThemeColor for proper theme support
		this.item.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");

		this.transitionTimeout = setTimeout(() => {
			this.item.backgroundColor = undefined;
			this.showIdle();
		}, STATE_TIMEOUTS.restored);
	}

	/**
	 * Show vitals display (power user mode)
	 *
	 * @param vitals - Current vitals snapshot
	 *
	 * TODO: Integrate with @snapback/intelligence/vitals
	 */
	showVitals(vitals: VitalsDisplayData): void {
		if (!this.vitalsEnabled) {
			return;
		}

		this.clearTransitionTimeout();
		this.setState("vitals", vitals);

		// TODO: Update tooltip with detailed vitals breakdown
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
		this.item.text = typeof template === "function" ? template(data ?? this.stats) : template;

		this.item.tooltip = this.buildTooltip();
	}

	/**
	 * Build tooltip content
	 *
	 * HINT: Use MarkdownString for rich formatting
	 *
	 * TODO: Add clickable links in tooltip
	 */
	private buildTooltip(): vscode.MarkdownString {
		const md = new vscode.MarkdownString();
		md.isTrusted = true;

		md.appendMarkdown("**SnapBack** - Active Protection\n\n");
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

		md.appendMarkdown("\n*Click to view checkpoints*");

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
